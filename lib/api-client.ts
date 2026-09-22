import type { Layer1MatchResult } from '@/lib/matching/layer1';
import { supabase } from '@/lib/supabase';
import type { VScoreBand } from '@/lib/vscore';
import type { ApplicationStatus, Outreach, OutreachRoleType } from '@/types/database';

/**
 * Typed fetch wrapper around the serverless API in `api/` (deployed on
 * Vercel). Screens never call this directly -- hooks in `hooks/` do, and
 * screens consume those hooks (CLAUDE.md conventions).
 *
 * Everything that needs a secret (Gemini, the Gmail app password, the Supabase service-role
 * key) or heavy compute lives behind these endpoints. This module holds NO
 * secrets: it forwards the caller's own Supabase access token, which the API
 * verifies with `auth.getUser()` before doing any work.
 */

const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!rawBaseUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL environment variable (see .env.example).'
  );
}

/**
 * Normalised base URL -- trailing slashes stripped so `${API_BASE_URL}${path}`
 * never produces a double slash. `.env` holds the origin only
 * (`https://vhub-mu.vercel.app`); the `/api/...` prefix belongs to the paths
 * below, so the deployed routes resolve as e.g.
 * `https://vhub-mu.vercel.app/api/match`.
 */
export const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

/** Endpoint paths, matching the route files under `api/src/app/api/`. */
export const API_ROUTES = {
  match: '/api/match',
  vscore: '/api/vscore',
  applicationStatus: '/api/application-status',
  applicationReceived: '/api/application-received',
  notifications: '/api/notifications',
  checkin: '/api/checkin',
  uploadSignature: '/api/upload-signature',
  verificationDocument: '/api/verification-document',
  cancelEmailChange: '/api/cancel-email-change',
  waitlistPosition: '/api/waitlist-position',
  outreachStatus: '/api/outreach-status',
  documentUrl: '/api/document-url',
  organisationVerification: '/api/organisation-verification',
  credentialReview: '/api/credential-review',
  moderation: '/api/moderation',
  disputeResolution: '/api/dispute-resolution',
  vettedSource: '/api/vetted-source',
  scoreEvent: '/api/score-event',
  accountClosure: '/api/account-closure',
  skillSuggest: '/api/skill-suggest',
  mailHealth: '/api/mail-health',
} as const;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Mirrors `ApiErrorBody` in api/src/server/httpErrors.ts. */
interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

/**
 * Thrown for any non-2xx response, and for network failures (where `status`
 * is 0 and `code` is `network_error`). `message` is always safe to surface in
 * the UI -- the API never puts internals in it.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  /**
   * Whole seconds the API asked us to wait, from its `Retry-After` header.
   * Only ever set on a 429. Undefined everywhere else.
   */
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** True when the session was missing, expired, or rejected -- the caller should re-authenticate. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** True when the request never reached the API at all (offline, DNS, TLS, timeout). */
  get isNetworkError(): boolean {
    return this.code === 'network_error';
  }

  /**
   * True when the API refused this request for coming too fast, not for being
   * wrong. Worth distinguishing in the UI: the request was valid and will work
   * shortly, so the honest thing to say is "wait a moment", never "that
   * failed". `retryAfterSeconds` says how long.
   */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

/**
 * Reads the `Retry-After` header the API sends with a 429.
 *
 * Only the delta-seconds form is understood, because that is the only form
 * this API sends. An HTTP-date is legal in the header and is deliberately not
 * parsed: guessing at a format we never produce would turn a clear "no value"
 * into a wrong number.
 */
function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (!header) return undefined;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

/** Requests that take longer than this are aborted and surfaced as a network error. */
const REQUEST_TIMEOUT_MS = 20_000;

interface RequestOptions {
  /** Attach the signed-in user's Supabase access token. Default true -- every real endpoint requires it. */
  authenticated?: boolean;
  signal?: AbortSignal;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new ApiClientError(401, 'unauthenticated', 'You are not signed in. Please sign in again.');
  }
  return token;
}

/**
 * POSTs JSON to `path` and returns the parsed response.
 *
 * Every endpoint in this API is POST-only except the cron route (which the
 * app never calls -- Vercel Cron invokes it directly with CRON_SECRET).
 */
async function apiPost<TResponse>(
  path: string,
  body: unknown,
  options: RequestOptions = {}
): Promise<TResponse> {
  const { authenticated = true, signal } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authenticated) {
    headers.Authorization = `Bearer ${await getAccessToken()}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    // fetch only rejects when the request never completed -- offline, DNS
    // failure, TLS failure, or our own timeout above.
    throw new ApiClientError(
      0,
      'network_error',
      'Could not reach the server. Check your connection and try again.',
      err instanceof Error ? err.message : undefined
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiClientError(
        response.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
        parseRetryAfter(response)
      );
    }
    // Non-JSON failure -- e.g. a Vercel platform error page rather than one of
    // our own routes.
    throw new ApiClientError(
      response.status,
      'unexpected_response',
      `The server returned an unexpected ${response.status} response.`
    );
  }

  return payload as TResponse;
}

// ---------------------------------------------------------------------------
// /api/match
// ---------------------------------------------------------------------------

export interface ScoredApplicant {
  applicationId: string;
  volunteerId: string;
  /**
   * Raw fit, 0-100. THIS is the volunteer's match percentage and the only one
   * that may be shown as such.
   */
  matchScore: number;
  breakdown: Layer1MatchResult;
  /**
   * Which role of a multi-role outreach produced this score. Null in
   * single-role mode. Without it a 92% names no requirement.
   */
  bestRoleId?: string | null;

  /**
   * The volunteer's reliability score, carried alongside so an organisation
   * sees fit and reliability as the two separate things they are.
   */
  vScore: number | null;
  /**
   * matchScore x reliability multiplier -- the value `results` is ordered by.
   * Ordering only. Never render this as a match percentage; it is deliberately
   * lower than `matchScore` for volunteers with a poor track record.
   */
  rankingScore: number;
}

export interface ScoreApplicantsResponse {
  outreachId: string;
  /**
   * False when Gemini was needed but unavailable, so these scores are pure
   * Layer 1. Observability only -- a result is always returned either way
   * (CLAUDE.md: "matching must never halt").
   */
  layer2Applied: boolean;
  results: ScoredApplicant[];
}

/**
 * Recomputes and persists `applications.match_score` for an outreach the
 * caller's organisation owns, returning the applicants sorted best-first.
 * Runs Layer 1 always, Layer 2 (Gemini) as a best-effort enrichment.
 *
 * Pass `volunteerIds` to rescore only some applications (e.g. one new
 * application) instead of all of them.
 */
export function scoreApplicants(
  outreachId: string,
  volunteerIds?: string[],
  options?: RequestOptions
): Promise<ScoreApplicantsResponse> {
  return apiPost<ScoreApplicantsResponse>(
    API_ROUTES.match,
    { mode: 'score_applicants', outreachId, volunteerIds },
    options
  );
}

export interface ScoreMyApplicationResponse {
  applicationId: string;
  outreachId: string;
  matchScore: number;
  breakdown: Layer1MatchResult;
  /**
   * Which role of a multi-role outreach produced this score. Null in
   * single-role mode. Without it a 92% names no requirement.
   */
  bestRoleId?: string | null;

  layer2Applied: boolean;
}

/**
 * Scores and persists `match_score` on the signed-in volunteer's own
 * application to `outreachId`. Called right after applying, because
 * match_score is service-role write-only and the organisation-side
 * `scoreApplicants` is not something a volunteer may call.
 */
export function scoreMyApplication(
  outreachId: string,
  options?: RequestOptions
): Promise<ScoreMyApplicationResponse> {
  return apiPost<ScoreMyApplicationResponse>(
    API_ROUTES.match,
    { mode: 'score_my_application', outreachId },
    options
  );
}

/** The organisation fields embedded on each ranked outreach. Structurally identical to `OutreachOrganisation` in hooks/useOutreaches.ts. */
export interface RankedOutreachOrganisation {
  id: string;
  org_name: string;
  org_type: string | null;
  verified: boolean;
}

export interface RankedOutreach {
  outreachId: string;
  /** 0-100 weighted total. */
  matchScore: number;
  /** Per-component detail behind `matchScore`, for the feed card's "why this match" panel. */
  breakdown: Layer1MatchResult;
  /**
   * Which role of a multi-role outreach produced this score. Null in
   * single-role mode. Without it a 92% names no requirement.
   */
  bestRoleId?: string | null;

  outreach: Outreach & { organisation: RankedOutreachOrganisation | null };
}

export interface RankFeedResponse {
  volunteerId: string;
  /** False when Gemini was unavailable and the ranking is pure Layer 1. */
  layer2Applied: boolean;
  /** Best match first; ties broken by the soonest event date. */
  results: RankedOutreach[];
}

export interface RankFeedFilters {
  /** Ghana region name, or null for every region. */
  region?: string | null;
  roleType?: OutreachRoleType | null;
  /** Max outreaches to rank. Server default 50, hard cap 100. */
  limit?: number;
}

/**
 * Ranks every open outreach for the signed-in volunteer, best match first,
 * running the same Layer 1 + Layer 2 pipeline the organisation side uses.
 *
 * One call ranks the whole feed, so scrolling never returns here -- pair it
 * with a React Query `staleTime` and the endpoint is hit once per filter
 * change, not once per screenful.
 */
export function rankFeed(
  filters: RankFeedFilters = {},
  options?: RequestOptions
): Promise<RankFeedResponse> {
  return apiPost<RankFeedResponse>(
    API_ROUTES.match,
    {
      mode: 'rank_feed',
      region: filters.region ?? null,
      roleType: filters.roleType ?? null,
      limit: filters.limit,
    },
    options
  );
}

export interface NotifyCandidatesResponse {
  outreachId: string;
  /** Volunteer ids that were pushed a "new high-match outreach" notification. */
  notified: string[];
}

/** Pushes a "new high-match outreach" notification to strong non-applicants (organisation only, open outreaches only). */
export function notifyCandidates(
  outreachId: string,
  options?: RequestOptions
): Promise<NotifyCandidatesResponse> {
  return apiPost<NotifyCandidatesResponse>(
    API_ROUTES.match,
    { mode: 'notify_candidates', outreachId },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/vscore
// ---------------------------------------------------------------------------

export interface VScoreReviewResponse {
  volunteerId: string;
  oldScore: number;
  newScore: number;
  band: VScoreBand;
  /**
   * The 0–100 outcome this review contributed, or null when it carried no
   * scorable signal (attended but unrated). Null means `newScore === oldScore`
   * — the blend deliberately did not run, rather than running on a substituted
   * midpoint that would have cost the volunteer points for the organiser's
   * omission.
   */
  eventOutcome: number | null;
}

export interface SubmitEventReviewInput {
  outreachId: string;
  volunteerId: string;
  attended: boolean;
  reliabilityScore?: number | null;
  clinicalScore?: number | null;
  /**
   * Slugs from `constants/review-remarks.ts`. The API validates them against
   * that vocabulary and rejects anything else, so never send free text here.
   */
  remarkChips?: string[];
  notes?: string;
}

/** Files the organisation's post-event review and blends it into the volunteer's V-Score. */
export function submitEventReview(
  input: SubmitEventReviewInput,
  options?: RequestOptions
): Promise<VScoreReviewResponse> {
  return apiPost<VScoreReviewResponse>(API_ROUTES.vscore, { action: 'review', ...input }, options);
}

export interface VScorePenaltyResponse {
  volunteerId: string;
  oldScore: number;
  newScore: number;
  band: VScoreBand;
  /** The flat penalty applied, as a negative number. */
  penalty: number;
}

export interface RecordLateReleaseInput {
  outreachId: string;
  volunteerId: string;
  applicationId: string;
  /** The day that was dropped. Every other input is counted server-side. */
  outreachDayId: string;
}

export interface RecordLateReleaseResponse extends Partial<VScorePenaltyResponse> {
  volunteerId: string;
  /** The deduction, or 0 when nothing was charged. */
  penalty: number;
  /**
   * True when this release fell inside the two-per-90-days free allowance, in
   * which case nothing was deducted and no row was written. The score comes
   * back unchanged rather than the call failing, because a free release is a
   * successful outcome rather than a rejected one.
   */
  withinFreeAllowance: boolean;
  /** Why nothing was charged, when nothing was. Null when a penalty applied. */
  skipped?: string | null;
}

/**
 * THE CANCELLATION PENALTY IS NOT CALLED FROM HERE, and there is no wrapper for
 * it on purpose.
 *
 * It is applied by `setApplicationStatus` as part of the withdrawal itself,
 * because it may only be charged when the volunteer held an ACCEPTED place, and
 * `applications` stops recording what a cancelled row used to be the moment it
 * is cancelled. A separate call made afterwards could not tell an abandoned
 * accepted place from a withdrawn pending application. /api/vscore's `penalty`
 * action was removed for that reason on 2026-08-31.
 */

/**
 * Records the approved LATE PER-DAY RELEASE deduction — two free in a rolling
 * 90 days, then -8 x (days released / days committed), floored at -2 and capped
 * at -8.
 *
 * The caller names WHICH DAY was dropped and nothing else. The amount, the day
 * counts and the rolling allowance are all computed on the server from rows the
 * client cannot write, because anything the client could name it could choose.
 * The server re-reads `application_days.late_release` rather than trusting the
 * request, so a crafted call cannot invent a penalty against somebody, and it
 * charges nothing at all unless the volunteer held an accepted place.
 *
 * SAFE TO RETRY, and safe to fire and forget: the deduction is deduplicated on
 * the released day and the moment it was released, and the nightly sweep
 * catches any call that never arrived.
 */
export function recordLateRelease(
  input: RecordLateReleaseInput,
  options?: RequestOptions
): Promise<RecordLateReleaseResponse> {
  return apiPost<RecordLateReleaseResponse>(
    API_ROUTES.vscore,
    { action: 'late_release', ...input },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/application-status
// ---------------------------------------------------------------------------

interface ApplicationSummary {
  id: string;
  outreach_id: string;
  volunteer_id: string;
  status: string;
  match_score: number | null;
}

export interface ApplicationStatusResponse {
  application: ApplicationSummary;
  /** The waitlisted applicant auto-promoted into the freed slot, if any. */
  promoted: ApplicationSummary | null;
  /**
   * The V-Score deduction this withdrawal cost, when it cost one. Null for
   * every other status change, for an organisation cancelling somebody's place,
   * and for a volunteer who was only pending or waitlisted.
   */
  penalty: { points: number; newScore: number; band: string } | null;
}

/**
 * Sets an application's status, sending the applicant the transactional email
 * + push and auto-promoting the best waitlisted applicant when an accepted
 * spot is cancelled.
 *
 * FOR A VOLUNTEER'S OWN WITHDRAWAL THIS IS NOW THE WHOLE OPERATION, not a
 * follow-up to a direct write. The server needs to see the status the row held
 * BEFORE the cancellation, because a V-Score deduction is only fair when the
 * volunteer held an accepted place, and nothing records that afterwards. Cancel
 * the row from the client first and the server has nothing left to judge.
 *
 * Still idempotent: re-sending a status the row already holds is a no-op that
 * only re-runs the promotion check, and applies no penalty.
 */
export function setApplicationStatus(
  applicationId: string,
  status: Extract<ApplicationStatus, 'accepted' | 'rejected' | 'waitlisted' | 'cancelled'>,
  options?: RequestOptions & {
    /** The volunteer's withdrawal reason, written with the status change. */
    cancellationReason?: string | null;
  }
): Promise<ApplicationStatusResponse> {
  const { cancellationReason, ...requestOptions } = options ?? {};
  return apiPost<ApplicationStatusResponse>(
    API_ROUTES.applicationStatus,
    { applicationId, status, cancellationReason: cancellationReason ?? null },
    requestOptions
  );
}

/** One applicant's decision inside a batch. */
export interface BatchApplicationDecision {
  applicationId: string;
  status: Extract<ApplicationStatus, 'accepted' | 'rejected' | 'waitlisted'>;
}

export interface BatchApplicationStatusResponse {
  outreachId: string;
  accepted: string[];
  waitlisted: string[];
  rejected: string[];
  /** Applicants the server could not move, each with a readable reason. */
  failed: { applicationId: string; reason: string }[];
}

/**
 * Decides many applicants at once — the organisation's "Accept top N" action.
 *
 * `decisions` is ORDER-SENSITIVE for accepts: the server fills the remaining
 * slots in the order given and reports anyone past the roster's capacity in
 * `failed`, so callers must send their best-ranked applicant first. Use
 * `planBatchAccept` from lib/roster.ts to build the list — it produces exactly
 * this order, and it is the same order the organisation sees on screen.
 */
export function setApplicationStatusBatch(
  outreachId: string,
  decisions: readonly BatchApplicationDecision[],
  options?: RequestOptions
): Promise<BatchApplicationStatusResponse> {
  return apiPost<BatchApplicationStatusResponse>(
    API_ROUTES.applicationStatus,
    { outreachId, decisions },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/outreach-status
// ---------------------------------------------------------------------------

export interface OutreachStatusResponse {
  outreachId: string;
  status: 'completed' | 'cancelled';
  /** Volunteers told about the cancellation. Always 0 for `completed`. */
  notified: number;
}

/**
 * Marks an outreach completed, or cancels it.
 *
 * Publishing a draft and closing an outreach stay on the client's own write
 * (`useUpdateOutreachStatus`) — one column, one owned row, nothing follows.
 * These two go through the server: cancelling has to notify every live
 * applicant, which means reading other users' push tokens and writing rows they
 * own, and completing has a precondition (the event must actually have
 * finished) that no constraint can express.
 *
 * Cancelling does NOT touch the applications. `cancelled` on an application
 * means the volunteer withdrew, and writing it here would stamp a withdrawal —
 * on short notice, a LATE one that costs V-Score points — onto volunteers for a
 * decision that was not theirs.
 */
export function setOutreachStatus(
  outreachId: string,
  status: 'completed' | 'cancelled',
  options?: RequestOptions & { reason?: string }
): Promise<OutreachStatusResponse> {
  return apiPost<OutreachStatusResponse>(
    API_ROUTES.outreachStatus,
    { outreachId, status, ...(options?.reason ? { reason: options.reason } : {}) },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/waitlist-position
// ---------------------------------------------------------------------------

export interface WaitlistPosition {
  applicationId: string;
  outreachId: string;
  /** 1-based place in the queue. */
  position: number;
  /** How many volunteers are waiting for this outreach in total. */
  waitlistSize: number;
}

/**
 * Where the signed-in volunteer stands in the queue for every outreach they
 * are waitlisted on.
 *
 * Server-side because position depends on the other applicants' rankings, and
 * RLS correctly stops a volunteer from reading anyone else's application.
 */
export function fetchWaitlistPositions(
  options?: RequestOptions
): Promise<{ positions: WaitlistPosition[] }> {
  return apiPost<{ positions: WaitlistPosition[] }>(API_ROUTES.waitlistPosition, {}, options);
}

// ---------------------------------------------------------------------------
// /api/notifications
// ---------------------------------------------------------------------------

/** Registers this device's Expo push token against the signed-in user. */
export function registerPushToken(
  expoPushToken: string,
  options?: RequestOptions
): Promise<{ registered: boolean }> {
  return apiPost<{ registered: boolean }>(
    API_ROUTES.notifications,
    { action: 'register', expoPushToken },
    options
  );
}

/** Why Expo would not deliver a push, in its own words. */
export interface PushFailure {
  /**
   * Expo's error code. `MismatchSenderId` and `InvalidCredentials` both mean
   * the Android FCM credential is wrong, which is the fault that reports
   * success and delivers nothing. `DeviceNotRegistered` means the token is
   * dead: the app was uninstalled or its data cleared.
   */
  code: string | null;
  message: string;
}

export interface TestPushResponse {
  /** Messages Expo ACCEPTED. Not a delivery confirmation -- see below. */
  dispatched: number;
  /** Devices registered to this account, which is what was attempted. */
  tokens: number;
  failures: PushFailure[];
}

/**
 * Sends a push to the caller's own registered device(s). Cannot target anyone
 * else.
 *
 * `dispatched` counts what EXPO ACCEPTED, not what arrived. It used to count
 * rows in `push_tokens`, which is a number the push service never sees and
 * which reported success while every message was being rejected.
 */
export function sendTestPush(
  title: string,
  body: string,
  options?: RequestOptions
): Promise<TestPushResponse> {
  return apiPost<TestPushResponse>(
    API_ROUTES.notifications,
    { action: 'test-dispatch', title, body },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/checkin
// ---------------------------------------------------------------------------

export interface AnchorVenueResponse {
  outreachId: string;
  anchoredAt: string;
  /**
   * False when the anchor was captured on a day other than the event's own,
   * in which case it will be DISCARDED rather than trusted and every scan will
   * resolve to `unavailable` (still present, just unverified). The QR screen
   * shows this so an organiser anchoring the night before is told plainly that
   * it will not count.
   */
  usableForEvent: boolean;
}

/**
 * Stamps the venue from the organiser's own device.
 *
 * The coordinates must come from the ORGANISER: a volunteer's scan position
 * can never become the anchor, because storing it is exactly what the
 * `attendance` table's shape forbids — and the first scanner is unverifiable
 * by construction, so anchoring on first scan would let one person with a
 * photo of the QR set the venue to their living room and get every genuine
 * attendee flagged.
 */
export function anchorVenue(
  outreachId: string,
  latitude: number,
  longitude: number,
  options?: RequestOptions
): Promise<AnchorVenueResponse> {
  return apiPost<AnchorVenueResponse>(
    API_ROUTES.checkin,
    { mode: 'anchor_venue', outreachId, latitude, longitude },
    options
  );
}

export interface CheckInResponse {
  outreachId: string;
  /**
   * The day the scan was filed against — always the day happening TODAY. The
   * server decides it rather than the client: a scan is a physical act at a
   * venue, so there is exactly one honest answer, and a scan on a day the event
   * does not run is refused rather than filed somewhere plausible.
   */
  outreachDayId: string;
  checkedInAt: string;
  /** Always true. A scan that reaches a 2xx is a check-in, full stop. */
  present: boolean;
}

export interface CheckInInput {
  outreachId: string;
  /** The secret carried in the QR — the organisation's screen is the only place it appears. */
  checkinCode: string;
  /**
   * Optional BY DESIGN. A volunteer who denies location, or whose device
   * cannot get a fix, still checks in: the scan alone is accepted rather than
   * penalising less-connected volunteers.
   */
  latitude?: number;
  longitude?: number;
  accuracy?: number;
}

/**
 * Records the signed-in volunteer's check-in against a scanned QR.
 *
 * The coordinates sent here are compared to the venue anchor in memory and
 * then dropped — the API persists only the verdict, and `attendance` has no
 * column that could hold a position.
 *
 * The response deliberately never mentions a location mismatch. It says
 * "checked in", because a mismatch is a signal for the ORGANISER's exception
 * list, not an accusation to put in front of someone whose GPS may simply be
 * confused — and disclosing it would teach anyone gaming it where the
 * boundary sits.
 */
export function checkIn(input: CheckInInput, options?: RequestOptions): Promise<CheckInResponse> {
  return apiPost<CheckInResponse>(API_ROUTES.checkin, { mode: 'scan', ...input }, options);
}

export interface ResolveAttendanceResponse {
  outreachId: string;
  outreachDayId: string;
  volunteerId: string;
  status: 'present' | 'absent';
  resolvedAt: string;
}

export interface ResolveAttendanceInput {
  outreachId: string;
  volunteerId: string;
  status: 'present' | 'absent';
  /**
   * Which day the decision is about.
   *
   * Optional ONLY because a single-day outreach leaves nothing to choose — the
   * server fills it in when there is exactly one day. On an outreach with
   * several days, omitting it is refused rather than guessed: filing an absence
   * against the wrong day of a campaign is the exact error per-day attendance
   * exists to prevent.
   */
  outreachDayId?: string;
  note?: string;
}

/**
 * The organiser's final word on one volunteer FOR ONE DAY, available for anyone
 * on the list rather than only the unscanned: no automated signal ever
 * overrules a human who was physically at the event.
 *
 * Records the decision only — marking someone absent moves NO V-Score. That
 * happens when the post-event review is filed with `attended: false`
 * (`submitEventReview`), so one path owns every score change.
 *
 * Takes an object rather than five positional arguments, which is what it had
 * grown to: `resolveAttendance(id, id, status, note)` with a day id appended
 * would be two adjacent uuids whose order nothing but memory enforces.
 */
export function resolveAttendance(
  input: ResolveAttendanceInput,
  options?: RequestOptions
): Promise<ResolveAttendanceResponse> {
  return apiPost<ResolveAttendanceResponse>(
    API_ROUTES.checkin,
    { mode: 'resolve', ...input },
    options
  );
}

// ---------------------------------------------------------------------------
// /api/upload-signature + /api/verification-document
// ---------------------------------------------------------------------------

export type UploadKind =
  | 'avatar'
  | 'flyer'
  | 'credential'
  | 'gallery'
  /** An organisation's verification evidence. Private, like a credential. */
  | 'organisation_document';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: 'image' | 'raw';
  /**
   * `authenticated` for credentials, `upload` for everything else. It is part
   * of the signed parameter set, so the device must post it back verbatim — it
   * cannot quietly downgrade a credential to public delivery, because the hash
   * would stop matching and Cloudinary would refuse the upload.
   */
  deliveryType: 'upload' | 'authenticated';
}

/**
 * Requests a short-lived signature for one upload into the caller's own
 * Cloudinary folder. The folder comes back from the server rather than being
 * chosen here — it is derived from the authenticated user id, so a device
 * cannot aim an upload at someone else's assets.
 */
export function getUploadSignature(
  kind: UploadKind,
  options?: RequestOptions
): Promise<UploadSignature> {
  return apiPost<UploadSignature>(API_ROUTES.uploadSignature, { kind }, options);
}

/**
 * Records an uploaded credential and moves the volunteer to
 * `documents_pending`. Both columns are server-only; this is the sole path to
 * either, which is what makes "in review" mean a document actually exists.
 */
export function recordVerificationDocument(
  publicId: string,
  /**
   * True when the volunteer has just agreed to the consent text. The server
   * REFUSES the upload without it on a first submission and remembers it
   * afterwards, so it is a real gate rather than a flag the client asserts.
   */
  consent?: boolean,
  options?: RequestOptions
): Promise<{ verificationStatus: 'documents_pending' }> {
  return apiPost<{ verificationStatus: 'documents_pending' }>(
    API_ROUTES.verificationDocument,
    { action: 'record', publicId, ...(consent ? { consent: true } : {}) },
    options
  );
}

/** A signed, expiring link to one private document. */
export interface SignedDocument {
  url: string;
  /** ISO timestamp. Used to decide when to ask for a fresh link, never displayed. */
  expiresAt: string;
  /** True for a photographed certificate, false for a PDF. */
  isImage: boolean;
}

/**
 * Asks for a short-lived link to a credential document.
 *
 * There is no stored URL to open any more, and that is the point: a credential
 * is a private Cloudinary asset that cannot be fetched without a signature this
 * server issues, and the link it issues stops working after fifteen minutes.
 * The server decides whether the caller may see the document — the volunteer
 * themselves, an admin, or an organisation this volunteer has actually applied
 * to. A screen must never make that decision itself.
 *
 * `ownerId` omitted means "my own document".
 */
export interface SkillSuggestionResponse {
  /** Always a subset of constants/skills.ts, most relevant first. */
  skills: string[];
  /**
   * Which kind of answer this is.
   *
   * 'matched' -- Gemini read the text and these are its picks.
   * 'general' -- nothing was read, or nothing matched, and these are the work
   *              every outreach needs whatever its subject.
   *
   * The screen MUST label the two differently. They are both useful and they
   * are not the same claim.
   */
  basis: 'matched' | 'general';
}

/**
 * Which of the platform's existing skills fit a piece of free text.
 *
 * EMPTY IS THE NORMAL "NO" and is not an error: the endpoint answers
 * `{ skills: [] }` when Gemini is unconfigured, slow, broken, out of quota, or
 * simply found nothing relevant, because a screen's response to every one of
 * those is the same -- show the ordinary picker.
 */
export function suggestSkills(
  description: string,
  options?: RequestOptions
): Promise<SkillSuggestionResponse> {
  return apiPost<SkillSuggestionResponse>(API_ROUTES.skillSuggest, { description }, options);
}

export function getDocumentUrl(
  ownerId?: string,
  options?: RequestOptions
): Promise<SignedDocument> {
  return apiPost<SignedDocument>(
    API_ROUTES.documentUrl,
    { kind: 'credential', ...(ownerId ? { ownerId } : {}) },
    options
  );
}

/**
 * The same, for one of an organisation's verification documents.
 *
 * Identified by its DATABASE ROW id, not by its Cloudinary name: the server
 * reads the owner off the row rather than trusting the request, so a caller
 * cannot name their own organisation beside somebody else's document.
 */
export function getOrganisationDocumentUrl(
  documentRowId: string,
  options?: RequestOptions
): Promise<SignedDocument> {
  return apiPost<SignedDocument>(
    API_ROUTES.documentUrl,
    { kind: 'organisation_document', documentRowId },
    options
  );
}

export interface OrganisationVerificationSubmission {
  officialEmail: string;
  physicalAddress: string;
  contactPerson: string;
  website?: string;
  registrations: { label: string; number: string }[];
  documents: { publicId: string; label?: string }[];
  /** True when the organisation has just agreed to the consent text. */
  consent?: boolean;
}

/**
 * Submits an organisation for verification.
 *
 * `verification_state` is service-role-only for the same reason the volunteer's
 * `verification_status` is: it decides whether this organisation can put an
 * event in front of volunteers, so a client able to write it could self-verify.
 * This is the only path to it.
 */
export function submitOrganisationVerification(
  submission: OrganisationVerificationSubmission,
  options?: RequestOptions
): Promise<{ verificationState: 'documents_submitted' }> {
  return apiPost<{ verificationState: 'documents_submitted' }>(
    API_ROUTES.organisationVerification,
    { action: 'submit', ...submission },
    options
  );
}

/**
 * Gate 1: an admin's decision on one volunteer's credential document.
 *
 * A basic check — real, legible, unexpired, plausibly matching the claimed
 * category. NOT a judgement about clinical competence: that is Gate 2, the
 * organisation's own call per application, which changes no platform status and
 * therefore needs no endpoint.
 */
export function decideCredential(
  volunteerId: string,
  decision: 'approve' | 'reject',
  reason: string,
  options?: RequestOptions
): Promise<{ verificationStatus: 'verified' | 'unverified' }> {
  return apiPost<{ verificationStatus: 'verified' | 'unverified' }>(
    API_ROUTES.credentialReview,
    { volunteerId, decision, reason },
    options
  );
}

/**
 * Suspend, ban or reinstate an account.
 *
 * Suspension stops FUTURE activity and never rewrites the past: attendance
 * stays recorded, reviews stay written, V-Scores keep meaning what they meant.
 * The server also carries out the consequences — an organisation's live events
 * are cancelled and everyone told, a volunteer's applications are withdrawn and
 * each accepted place handed to the waitlist.
 *
 * Reinstatement restores future activity ONLY. It does not resurrect cancelled
 * outreaches or withdrawn applications; the people affected were told those
 * were off, and quietly un-telling them later is worse than leaving them off.
 */
export function moderateAccount(
  targetUserId: string,
  action: 'suspend' | 'ban' | 'reinstate',
  reason: string,
  options?: RequestOptions
): Promise<{
  moderationState: 'active' | 'suspended' | 'banned';
  outreachesCancelled?: number;
  volunteersNotified?: number;
  applicationsWithdrawn?: number;
  placesBackfilled?: number;
}> {
  return apiPost(API_ROUTES.moderation, { targetUserId, action, reason }, options);
}

/**
 * An admin's decision on one dispute.
 *
 * Upholding records that the volunteer was right, tells both parties in the
 * same words, and RECOMPUTES their V-Score from full history (owner-approved
 * 2026-08-26): the disputed event stops counting and everything after it is
 * replayed on top of that.
 *
 * It still does not rewrite the attendance row or the review — that record is
 * the evidence, and a correction sits beside it rather than on top of it.
 */
export function resolveDispute(
  disputeId: string,
  decision: 'uphold' | 'reject',
  resolution: string,
  options?: RequestOptions
): Promise<{ status: 'upheld' | 'rejected' }> {
  return apiPost<{ status: 'upheld' | 'rejected' }>(
    API_ROUTES.disputeResolution,
    { disputeId, decision, resolution },
    options
  );
}

export interface VettedSourceInput {
  name: string;
  url: string;
  sourceType?: string;
  rationale: string;
}

/**
 * Adds a source to the vetted whitelist. SURFACE ONLY — nothing reads this
 * list, and no listing is ever fetched from any of these sources. It records
 * which sources WOULD be acceptable if the deferred ingestion feature is ever
 * built, while the reasoning is still fresh.
 */
export function addVettedSource(
  source: VettedSourceInput,
  options?: RequestOptions
): Promise<{ id: string }> {
  return apiPost<{ id: string }>(API_ROUTES.vettedSource, { action: 'add', ...source }, options);
}

/** Removes one. The reason is required: an entry vanishing unexplained is worse than a wrong entry. */
export function removeVettedSource(
  id: string,
  reason: string,
  options?: RequestOptions
): Promise<{ removed: boolean }> {
  return apiPost<{ removed: boolean }>(
    API_ROUTES.vettedSource,
    { action: 'remove', id, reason },
    options
  );
}

/** An admin's decision on one organisation. Writes an audit row server-side. */
export function decideOrganisationVerification(
  organisationId: string,
  decision: 'approve' | 'reject',
  reason: string,
  options?: RequestOptions
): Promise<{ verificationState: 'verified' | 'rejected' }> {
  return apiPost<{ verificationState: 'verified' | 'rejected' }>(
    API_ROUTES.organisationVerification,
    { action: 'decide', organisationId, decision, reason },
    options
  );
}

/**
 * Tells the organisation that this volunteer has just applied.
 *
 * Called AFTER the application is safely written, never as part of writing it:
 * the application is the thing that must not be lost, and a notification that
 * fails to send costs nothing recoverable. The caller should therefore let this
 * fail quietly rather than surfacing an error over a successful application.
 */
export function announceApplication(
  applicationId: string,
  options?: RequestOptions
): Promise<{ notified: boolean; reason?: string }> {
  return apiPost<{ notified: boolean; reason?: string }>(
    API_ROUTES.applicationReceived,
    { applicationId },
    options
  );
}

export interface DeleteVerificationDocumentResponse {
  verificationStatus: 'unverified';
  /**
   * False when the file could not be removed from Cloudinary storage. The
   * database is authoritative and was cleared either way — this is reported
   * so the UI can be honest rather than claiming a clean removal it cannot
   * confirm.
   */
  storageCleared: boolean;
}

/**
 * Withdraws the credential document and returns the volunteer to
 * `unverified`.
 *
 * The status drops deliberately: `documents_pending` means a reviewer has
 * something to read, and with the document gone they would be queued for a
 * decision nobody can make. Refused once `verified` — that document is the
 * evidence behind an approval a human already gave.
 */
export function deleteVerificationDocument(
  options?: RequestOptions
): Promise<DeleteVerificationDocumentResponse> {
  return apiPost<DeleteVerificationDocumentResponse>(
    API_ROUTES.verificationDocument,
    { action: 'delete' },
    options
  );
}

export interface CancelEmailChangeResponse {
  cancelled: boolean;
  /** Present when a change really was withdrawn; the address that remains in force. */
  email?: string;
  /** `no_pending_change` when there was nothing to cancel. */
  reason?: string;
}

/**
 * Withdraws a pending login-email change. Server-side because clearing
 * `new_email` needs the Admin API and therefore the service-role key — the
 * client SDK can only ever start a change, never take one back.
 */
export function cancelEmailChange(options?: RequestOptions): Promise<CancelEmailChangeResponse> {
  return apiPost<CancelEmailChangeResponse>(API_ROUTES.cancelEmailChange, {}, options);
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

export type ApiReachability =
  | { reachable: true; authenticated: boolean; baseUrl: string }
  | { reachable: false; baseUrl: string; reason: string };

/**
 * Verifies the app can actually reach the deployed API, without needing a
 * signed-in session and without mutating anything.
 *
 * It deliberately sends an UNAUTHENTICATED request to /api/match. A healthy
 * deployment answers `401 { error: { code: "unauthenticated" } }` -- which
 * proves DNS, TLS, routing and the handler are all working, since only the
 * real route produces that body. A network failure means the base URL is
 * wrong or the device is offline; anything else means the URL resolved to
 * something that is not this API.
 */
export async function pingApi(): Promise<ApiReachability> {
  try {
    await apiPost(API_ROUTES.match, {}, { authenticated: false });
    // A 2xx here would mean the endpoint accepted an unauthenticated,
    // empty-bodied request -- it never should.
    return { reachable: false, baseUrl: API_BASE_URL, reason: 'API responded without requiring authentication.' };
  } catch (err) {
    if (!(err instanceof ApiClientError)) throw err;
    if (err.isNetworkError) {
      return { reachable: false, baseUrl: API_BASE_URL, reason: err.message };
    }
    if (err.code === 'unauthenticated') {
      return { reachable: true, authenticated: false, baseUrl: API_BASE_URL };
    }
    // A 429 is also proof the deployment is up and routing correctly -- only
    // our own rate limiter produces it, and it produces it BEFORE the handler
    // runs. Reporting "unreachable" here would send someone off to check DNS
    // and their base URL over a limit that clears itself in under a minute.
    if (err.isRateLimited) {
      return { reachable: true, authenticated: false, baseUrl: API_BASE_URL };
    }
    // Reached *something*, but not a response this API produces.
    return {
      reachable: false,
      baseUrl: API_BASE_URL,
      reason: `Unexpected ${err.status} response (${err.code}) -- check EXPO_PUBLIC_API_BASE_URL.`,
    };
  }
}

/**
 * An admin reversing one V-Score deduction.
 *
 * The row is NOT deleted — a penalty is the evidence behind a number somebody
 * was shown, so it stays and stops counting, the same treatment an upheld
 * dispute gives a review. The volunteer keeps seeing it, marked as reversed.
 *
 * The score is then REPLAYED rather than adjusted: the clamp to [0, 100] may
 * already have swallowed part of the deduction, and every review filed since
 * has blended it forward, so adding the points back would not produce the score
 * the corrected history implies.
 *
 * One-way. There is no un-void; re-applying a deduction would be a new penalty
 * with its own justification, not a resurrection of a reversed one.
 */
export function voidScoreEvent(
  scoreEventId: string,
  reason: string,
  options?: RequestOptions
): Promise<{
  scoreEventId: string;
  volunteerId: string;
  pointsReturned: number;
  oldScore: number;
  newScore: number;
}> {
  return apiPost(API_ROUTES.scoreEvent, { scoreEventId, reason }, options);
}

// ---------------------------------------------------------------------------
// /api/account-closure
// ---------------------------------------------------------------------------

export interface CloseAccountResponse {
  closedAt: string;
  role: 'volunteer' | 'organisation';
  /**
   * False when the profile was closed but the login could not be revoked. The
   * screen must say so plainly rather than claiming a clean close: the account
   * is anonymised either way, but the person could still sign in until it is
   * retried.
   */
  loginRevoked: boolean;
  documentsDestroyed: number;
  /** Organisation closure. */
  outreachesCancelled?: number;
  volunteersNotified?: number;
  /** Volunteer closure. */
  applicationsWithdrawn?: number;
  placesBackfilled?: number;
}

/**
 * Closes the signed-in user's own account. Immediate and irreversible.
 *
 * IT ANONYMISES AND REVOKES; IT DOES NOT DELETE. The person is removed — name,
 * contact details, photograph, biography, skills — the private evidence
 * (credential and organisation documents) is destroyed, and the login is
 * banned. What stays is the record of work: outreaches, applications,
 * attendance, reviews and score events.
 *
 * That is not a softening of the promise, it IS the promise: an organisation's
 * record of who worked at its clinic is its record too, not only the
 * volunteer's, and a V-Score is derived by replaying those reviews. Deleting
 * them would silently move the scores of everyone who worked alongside the
 * person leaving.
 *
 * The caller must sign out afterwards. The session is not invalidated by the
 * ban until it is next refreshed, so the app has to end it deliberately.
 */
export function closeAccount(options?: RequestOptions): Promise<CloseAccountResponse> {
  return apiPost<CloseAccountResponse>(
    API_ROUTES.accountClosure,
    // The literal the endpoint requires. It defends against a mis-tap, not
    // against the account holder, who is entitled to close their own account.
    { confirmation: 'CLOSE' },
    options
  );
}

// ---------------------------------------------------------------------------
// Mail health
// ---------------------------------------------------------------------------

export interface MailHealthResponse {
  ok: true;
  checkedAt: string;
  meaning: string;
}

/**
 * Admin-only. Authenticates to Gmail without sending anything and reports
 * whether the app password is still valid.
 *
 * A success means the credential is alive, so a Supabase mail failure is in
 * Supabase's own SMTP settings. A failure throws an ApiClientError whose
 * message is nodemailer's description of the SMTP exchange — which is the
 * diagnostic, and never contains the password.
 */
export function checkMailHealth(options?: RequestOptions): Promise<MailHealthResponse> {
  return apiPost<MailHealthResponse>(API_ROUTES.mailHealth, {}, options);
}
