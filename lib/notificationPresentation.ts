import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { AppNotification, NotificationType } from '@/hooks/useNotifications';

/**
 * What a notification LOOKS like and where it GOES.
 *
 * WHY THIS EXISTS. `notifications.type` has only four values -- `new_match`,
 * `application_status`, `event_reminder`, `test` -- and nine genuinely
 * different pieces of news are sent through them, because adding a fifth value
 * would be a schema change for something the payload can already carry. Every
 * one of those nine therefore arrived on the Notifications screen wearing the
 * same blue clipboard icon: a credential approval, a dispute outcome, a
 * suspension notice, a reversed penalty and an ordinary application decision
 * were visually indistinguishable in a list.
 *
 * The real discriminator is already in `data`, written by the API. Six
 * endpoints set `data.kind`; the application decisions set `data.status`.
 * This module reads those first and falls back to `type`, so nothing has to
 * change in the database and a payload shape that predates any of it still
 * resolves to something sensible.
 *
 * ROUTING LIVES HERE TOO, and that is the point rather than a convenience.
 * The screen used to decide where a tap went with two `if`s: "has an
 * outreach_id" and "is an application_status". A credential decision has
 * neither an outreach nor anything to do with applications, so
 * "Your documents have been approved" opened the Applications tracker. The
 * card also needs to know whether there is anywhere to go, so it can offer a
 * "View" affordance honestly instead of promising navigation on a notice that
 * leads nowhere. One function answering both means the affordance and the tap
 * can never disagree.
 */

/** Which inbox is asking. The same row routes differently for the two roles. */
export type NotificationAudience = 'volunteer' | 'organisation';

/**
 * The icon tints. Named tones rather than loose hex at each site, so a new
 * kind has to choose from the palette instead of introducing a seventh colour.
 */
const TONES = {
  coral: { fg: '#FF6B6B', bg: '#FFECEC' },
  blue: { fg: '#3B82F6', bg: '#E4EDFD' },
  amber: { fg: '#F59E0B', bg: '#FDF0DC' },
  green: { fg: '#22C55E', bg: '#E6F7EC' },
  navy: { fg: '#12172B', bg: '#E8EAF0' },
  red: { fg: '#EF4444', bg: '#FDECEC' },
  grey: { fg: '#6B7280', bg: '#F3F4F6' },
} as const;

export type NotificationTone = keyof typeof TONES;

export interface NotificationPresentation {
  /**
   * The tiny uppercase caption above the title. It is what tells a credential
   * decision apart from an application decision at a glance, which the icon
   * alone cannot do for somebody who has not learned the icons.
   */
  category: string;
  /**
   * A MaterialCommunityIcons glyph name, typed against the real glyph map
   * rather than left as a plain string. A misspelled name is not a visible
   * error at runtime -- it renders as an empty square -- so the compiler is
   * the only thing that will ever notice one. The import is type-only and
   * erases, so nothing from the icon library reaches this module's bundle.
   */
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /**
   * The glyph the inbox actually draws (owner, 2026-09-22, with a reference
   * design: "you can use emojis instead of the pictures").
   *
   * It replaces BOTH the icon tile and the uppercase caption on the card. An
   * emoji carries more meaning at 20px than a line-art icon does, and far more
   * than a caption reading "APPLICATION UPDATE" above a title that already says
   * what happened -- which is how the row came to have three separate things
   * all saying the same thing.
   *
   * `icon` is kept, and kept typed, because it is the fallback the rest of the
   * app can use where an emoji would be wrong (anything monochrome, anything
   * tinted by state). Only the inbox reads `emoji`.
   *
   * CHOSEN FROM THE OLDEST, MOST WIDELY SUPPORTED SET. Every one of these
   * predates Emoji 5.0 and renders on any Android VHub can run on. A newer
   * emoji (a 2021 identity card, say) would draw as an empty box on a phone
   * that is otherwise fine, and nothing at runtime would report it.
   */
  emoji: string;
  tone: NotificationTone;
}

/**
 * Every `data.kind` the API actually writes, with the file that writes it.
 * Keep this list in step with those call sites: an unlisted kind falls back to
 * its `type`, which is safe but says less.
 */
const BY_KIND: Record<string, NotificationPresentation> = {
  // api/src/app/api/application-received/route.ts
  new_application: { category: 'New applicant', icon: 'account-plus-outline', emoji: '🙋', tone: 'coral' },
  // api/src/app/api/credential-review/route.ts
  credential_review: { category: 'Identity verification', icon: 'shield-check-outline', emoji: '🛡️', tone: 'green' },
  // api/src/app/api/organisation-verification/route.ts
  organisation_verification: { category: 'Organisation verification', icon: 'shield-check-outline', emoji: '🏢', tone: 'green' },
  // api/src/app/api/dispute-resolution/route.ts
  dispute: { category: 'Dispute outcome', icon: 'scale-balance', emoji: '⚖️', tone: 'navy' },
  // api/src/app/api/moderation/route.ts
  moderation: { category: 'Account notice', icon: 'alert-octagon-outline', emoji: '⚠️', tone: 'red' },
  // api/src/app/api/score-event/route.ts
  score_event_voided: { category: 'V-Score update', icon: 'chart-line', emoji: '📈', tone: 'green' },
};

/**
 * The application decisions. `data.status` carries these, set by
 * api/src/app/api/application-status/route.ts, server/waitlist.ts (the
 * automatic promotion) and server/accountStop.ts (an event called off).
 *
 * A decision that went against the volunteer is deliberately NOT drawn in red.
 * The organisation chose other people, which is not an error and not a
 * warning, and the applications tracker already makes the same distinction.
 */
const BY_STATUS: Record<string, NotificationPresentation> = {
  accepted: { category: 'Application update', icon: 'clipboard-check-outline', emoji: '🎉', tone: 'green' },
  waitlisted: { category: 'Application update', icon: 'clipboard-text-clock-outline', emoji: '⏳', tone: 'amber' },
  rejected: { category: 'Application update', icon: 'clipboard-outline', emoji: '📋', tone: 'grey' },
  not_selected: { category: 'Application update', icon: 'clipboard-outline', emoji: '📋', tone: 'grey' },
  cancelled: { category: 'Outreach cancelled', icon: 'calendar-remove-outline', emoji: '🚫', tone: 'red' },
  pending: { category: 'Application update', icon: 'clipboard-outline', emoji: '📋', tone: 'blue' },
};

/** The last resort: the four values the `type` column can hold. */
const BY_TYPE: Record<NotificationType, NotificationPresentation> = {
  new_match: { category: 'New match', icon: 'heart', emoji: '❤️', tone: 'coral' },
  application_status: { category: 'Application update', icon: 'clipboard-check-outline', emoji: '📋', tone: 'blue' },
  event_reminder: { category: 'Reminder', icon: 'clock-outline', emoji: '⏰', tone: 'amber' },
  test: { category: 'Test', icon: 'bell-outline', emoji: '🔔', tone: 'grey' },
};

const FALLBACK: NotificationPresentation = BY_TYPE.test;

function readString(data: Record<string, unknown> | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * The icon, tint and caption for one notification.
 *
 * Order is kind, then status, then type. `kind` is the most specific thing the
 * sender said and wins; `status` distinguishes the application decisions,
 * which all share one kind-less payload; `type` is what remains.
 */
export function describeNotification(notification: AppNotification): NotificationPresentation {
  const data = notification.data ?? null;

  const kind = readString(data, 'kind');
  if (kind && BY_KIND[kind]) return BY_KIND[kind];
  // The application-status endpoint writes the decision as `kind`, not
  // `status`, so a kind that is really a status has to be tried here too
  // before falling through.
  if (kind && BY_STATUS[kind]) return BY_STATUS[kind];

  const status = readString(data, 'status');
  if (status && BY_STATUS[status]) return BY_STATUS[status];

  return BY_TYPE[notification.type] ?? FALLBACK;
}

/**
 * The kinds this module knows by name, exported so a test can assert the list
 * directly against the API that writes them.
 *
 * It has to be the KEYS, not a behavioural probe. A test that asked "does this
 * kind render differently from the fallback?" passes for a kind that was
 * deleted from the map, because the fallback for every one of them is the
 * perfectly reasonable-looking `application_status` presentation -- so the
 * check reports success while the notification has quietly lost its identity.
 * That was the first version of the test here, and it passed with an entry
 * removed.
 */
export const RECOGNISED_NOTIFICATION_KINDS: readonly string[] = Object.keys(BY_KIND);

/** Resolve the tone to the two colours the card paints with. */
export function notificationToneColors(tone: NotificationTone): { fg: string; bg: string } {
  return TONES[tone];
}

/**
 * Where tapping this notification should go, or null when there is nowhere
 * useful.
 *
 * NULL IS A REAL ANSWER, not a gap to be filled with a plausible screen. A
 * suspension notice has no destination: the thing it refers to is the state of
 * the account itself, which the banner on the home screen already states. A
 * test push exists only to prove delivery. Sending either somewhere arbitrary
 * would teach people that tapping a notification does something unpredictable.
 */
export function notificationDestination(
  notification: AppNotification,
  audience: NotificationAudience
): string | null {
  const data = notification.data ?? null;
  const kind = readString(data, 'kind');

  if (kind === 'moderation') return null;
  if (notification.type === 'test') return null;

  if (audience === 'organisation') {
    // The queue for THAT event, not the event page: the notification exists
    // because there is somebody to decide on, and the decision is one screen
    // further in.
    if (kind === 'new_application' && notification.outreach_id) {
      // `from` so the tab can offer a way back to the inbox: a tab keeps no
      // history, so without it the hardware back button lands on Home.
      return `/(organisation)/applicants?outreachId=${notification.outreach_id}&from=/(organisation)/notifications`;
    }
    /*
      `from` ON EVERY ORGANISATION DESTINATION, not just the applicants one
      (owner-reported, 2026-09-22: opening the verification decision from the
      inbox and pressing back landed on SETTINGS).

      A tab group keeps no history of its own, so ScreenHeader navigates with
      `replace` to `from` if it has one and to the screen's own `fallback`
      otherwise. Verification's fallback is Settings, which is the correct
      answer for the way it is normally reached and the wrong one for every
      other way -- and the inbox is now one of those ways. The rule is simply
      that anything routing INTO one of these screens has to say where from.
    */
    if (kind === 'organisation_verification') {
      return '/(organisation)/verification?from=/(organisation)/notifications';
    }
    if (notification.outreach_id) {
      return `/(organisation)/outreach/${notification.outreach_id}?from=/(organisation)/notifications`;
    }
    return null;
  }

  if (kind === 'credential_review') {
    return '/(volunteer)/verify-identity?from=/(volunteer)/notifications';
  }
  // Both land on My feedback: a dispute outcome and a reversed deduction are
  // each a change to the volunteer's own record, and that screen is where the
  // record is shown.
  if (kind === 'dispute' || kind === 'score_event_voided') {
    return '/(volunteer)/feedback?from=/(volunteer)/notifications';
  }

  /*
    A DECISION GOES TO THE TRACKER, NOT TO THE EVENT.

    This is a change. Previously any notification carrying an outreach_id
    opened the outreach detail screen, decisions included, because outreach_id
    was tested before anything else. The tracker is the better destination for
    a decision: its card states the status in words, explains what that status
    means for the volunteer, and gives a waitlisted volunteer their live place
    in the queue. The outreach page states none of that -- it describes the
    event, which is the right answer for a match or a reminder and is why
    those still go there.
  */
  const decision = readString(data, 'kind') ?? readString(data, 'status');
  if (decision && BY_STATUS[decision]) {
    return '/(volunteer)/applications?from=/(volunteer)/notifications';
  }

  if (notification.outreach_id) {
    return `/(volunteer)/outreach/${notification.outreach_id}?from=/(volunteer)/notifications`;
  }
  if (notification.type === 'application_status') {
    return '/(volunteer)/applications?from=/(volunteer)/notifications';
  }
  return null;
}

/**
 * "15m ago" / "2h ago" / "1d ago".
 *
 * Deliberately stops at days rather than rolling over to weeks or months: the
 * list is capped at the most recent 100 and grouped under a dated heading, so
 * an exact "43d ago" carries no more meaning than the heading already does.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
