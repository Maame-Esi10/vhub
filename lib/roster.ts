/**
 * Oversubscription logic — what an organisation does when more volunteers
 * apply than there are slots.
 *
 * Pure functions only, no I/O, so every rule here is unit-testable and the
 * organisation-facing screen can show the SAME ordering it is about to act on.
 * That visibility is the point: "Accept top N" must never be a black box that
 * picks people the org cannot see ranked in front of them.
 *
 * The ranking itself is not redefined here. It reuses `computeRankingScore`
 * from lib/vscore.ts — match fit scaled by the bounded reliability multiplier —
 * so the batch action and the organisation's applicant list can never drift
 * apart. See docs/REPORT_NOTES.md, "Design decisions — 2026-08-05", 1b.
 */

import { computeRankingScore } from '@/lib/vscore';
import type { ApplicationStatus } from '@/types/database';

/**
 * A waitlist never holds fewer than this many, even for a one-slot outreach.
 * A tiny event still benefits from a couple of reserves when someone drops.
 */
export const MIN_WAITLIST_CAPACITY = 5;

/**
 * How many volunteers an outreach's waitlist may hold: twice the slots, floored
 * at MIN_WAITLIST_CAPACITY.
 *
 * The cap exists to keep a waitlist position HONEST. An unbounded waitlist on a
 * popular event hands out positions like "you are number 187", which is not a
 * queue, it is a rejection wearing a friendlier word. Twice the slots is the
 * point beyond which a position stops being a realistic prospect: an event
 * would have to lose two thirds of its confirmed roster before number 21 of 20
 * were reached.
 */
export function waitlistCapacity(slotsTotal: number): number {
  return Math.max(slotsTotal * 2, MIN_WAITLIST_CAPACITY);
}

/** The minimum an applicant must carry to be ranked. */
export interface RankableApplicant {
  id: string;
  status: ApplicationStatus;
  /** Raw Layer 1 (+ Layer 2) match score, 0-100. Null until scoring has run. */
  matchScore: number | null;
  /** The applicant's V-Score, source of the reliability multiplier. */
  vScore: number | null;
  /** ISO timestamp; the tie-breaker. */
  createdAt: string;
}

/**
 * Best-first ordering: ranking score descending, ties broken by who applied
 * first.
 *
 * An unscored application (match_score still null) ranks as 0 rather than being
 * dropped — it sorts last but stays visible and acceptable, which matches how
 * `useOutreachApplications` already orders the list. Scoring is best-effort at
 * apply time, so a scoring outage must never make someone invisible to the
 * organisation reviewing them.
 *
 * Returns a new array; the input is not mutated.
 */
export function rankApplicants<T extends RankableApplicant>(applicants: readonly T[]): T[] {
  return [...applicants].sort((a, b) => {
    const scoreA = computeRankingScore(a.matchScore ?? 0, a.vScore);
    const scoreB = computeRankingScore(b.matchScore ?? 0, b.vScore);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * Waitlist position (1-based) for every waitlisted applicant, keyed by
 * application id.
 *
 * Position is derived from the same ranking, never from a stored column: the
 * promotion rule in /api/application-status already promotes the highest-match
 * waitlisted applicant when a slot frees, so a position shown to a volunteer
 * must be computed the same way or it would be a lie the moment a V-Score
 * moved. Non-waitlisted applications are absent from the map.
 */
export function waitlistPositions(applicants: readonly RankableApplicant[]): Map<string, number> {
  const waitlisted = rankApplicants(applicants.filter((a) => a.status === 'waitlisted'));
  return new Map(waitlisted.map((applicant, index) => [applicant.id, index + 1]));
}

export interface BatchAcceptPlan {
  /** Application ids to accept, best-first. */
  accept: string[];
  /** Application ids to move onto the waitlist, best-first. */
  waitlist: string[];
  /** Application ids left pending — the waitlist is full and they are not rejected. */
  leftPending: string[];
}

export interface BatchAcceptParams {
  applicants: readonly RankableApplicant[];
  slotsTotal: number;
  slotsFilled: number;
  /**
   * Accept at most this many. Defaults to every free slot, which is what the
   * "Accept top N" button uses; a smaller number lets an organisation fill
   * half a roster now and decide the rest later.
   */
  limit?: number;
}

/**
 * Plans a one-tap "Accept top N": the best-ranked pending applicants fill the
 * free slots, the next best go onto the waitlist, and anyone past the waitlist
 * cap is LEFT PENDING.
 *
 * Nobody is ever auto-rejected. A rejection is a judgement about a person and
 * must stay a deliberate act by the organisation — a batch button that quietly
 * rejected forty people would be the single most damaging thing this screen
 * could do. Being beyond the cap is a capacity fact, not a verdict, so those
 * applications stay pending and the organisation can still decide each one by
 * hand.
 *
 * Only pending applications are touched. Already-accepted volunteers keep their
 * place (they are counted through slotsFilled), and an already-waitlisted
 * applicant is not shuffled by a later batch run — being overtaken by a
 * newcomer with a better score would be indefensible to someone who has been
 * waiting.
 */
export function planBatchAccept({
  applicants,
  slotsTotal,
  slotsFilled,
  limit,
}: BatchAcceptParams): BatchAcceptPlan {
  const freeSlots = Math.max(0, slotsTotal - slotsFilled);
  const acceptCount = Math.max(0, Math.min(limit ?? freeSlots, freeSlots));

  const pending = rankApplicants(applicants.filter((a) => a.status === 'pending'));
  const alreadyWaitlisted = applicants.filter((a) => a.status === 'waitlisted').length;
  const waitlistRoom = Math.max(0, waitlistCapacity(slotsTotal) - alreadyWaitlisted);

  const accept = pending.slice(0, acceptCount);
  const waitlist = pending.slice(acceptCount, acceptCount + waitlistRoom);
  const leftPending = pending.slice(acceptCount + waitlistRoom);

  return {
    accept: accept.map((a) => a.id),
    waitlist: waitlist.map((a) => a.id),
    leftPending: leftPending.map((a) => a.id),
  };
}

export interface SkillCoverage {
  /** The outreach's required skills, as given. */
  required: string[];
  /** Required skills at least one confirmed volunteer holds. */
  covered: string[];
  /** Required skills nobody on the roster holds yet. */
  missing: string[];
  /** covered / required, in [0,1]. An outreach requiring nothing is fully covered. */
  ratio: number;
}

/**
 * Which of an outreach's required skills its CONFIRMED roster actually covers.
 *
 * This is the answer to the question the match score cannot answer. A match
 * score rates one volunteer against the event; it says nothing about whether
 * ten individually excellent volunteers have collectively left the one skill
 * the event genuinely needs uncovered. Accepting the top ten by score can do
 * exactly that, which is why this indicator sits next to the batch button
 * rather than somewhere else in the app.
 *
 * Coverage is a property of the TEAM: one holder of a skill covers it. This is
 * deliberately not weighted by how many people hold it — "do we have a midwife"
 * is the question, not "how many midwives".
 */
export function skillCoverage(
  requiredSkills: readonly string[] | null | undefined,
  rosterSkills: readonly (readonly string[] | null | undefined)[]
): SkillCoverage {
  const required = [...(requiredSkills ?? [])];
  const held = new Set(rosterSkills.flatMap((skills) => [...(skills ?? [])]));

  const covered = required.filter((skill) => held.has(skill));
  const missing = required.filter((skill) => !held.has(skill));

  return {
    required,
    covered,
    missing,
    // No requirement means nothing can be missing — the same convention the
    // skills component of the matcher uses for an empty requirement.
    ratio: required.length === 0 ? 1 : covered.length / required.length,
  };
}

/** True when more people want in than there is room for. */
export function isOversubscribed(params: {
  pendingCount: number;
  slotsTotal: number;
  slotsFilled: number;
}): boolean {
  return params.pendingCount > Math.max(0, params.slotsTotal - params.slotsFilled);
}
