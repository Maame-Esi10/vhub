import fs from 'fs';
import path from 'path';
import {
  describeNotification,
  formatRelativeTime,
  notificationDestination,
  notificationToneColors,
  RECOGNISED_NOTIFICATION_KINDS,
} from '@/lib/notificationPresentation';
import type { AppNotification } from '@/hooks/useNotifications';

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    user_id: 'u1',
    type: 'application_status',
    title: 'Title',
    body: 'Body',
    outreach_id: null,
    data: {},
    read_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * THE KIND LIST IS READ FROM THE API, NOT RESTATED HERE.
 *
 * A test that hardcodes the kinds it expects only ever re-checks the code that
 * already complies: add a seventh kind to a new endpoint and such a test keeps
 * passing while that notification silently renders as a grey bell. So this
 * walks api/src and extracts every literal `kind` written into a notification
 * `data` payload, and asserts the presentation map covers each one.
 *
 * `api/src/app/api/application-status/route.ts` writes `kind: decision.status`
 * -- computed, not a literal -- so it does not appear here and is covered by
 * the status cases further down instead.
 */
function kindsWrittenByTheApi(): string[] {
  const root = path.join(process.cwd(), 'api', 'src');
  const found = new Set<string>();

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;

      const source = fs.readFileSync(full, 'utf8');
      // `data: { ... kind: "x" ... }` -- the payload attached to a
      // notification row, as opposed to the unrelated `kind` fields on the
      // upload-signature and document-url request schemas.
      const pattern = /data:\s*\{[^{}]*?kind:\s*"([a-z_]+)"/gs;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const kind = match[1];
        if (kind) found.add(kind);
      }
    }
  }

  walk(root);
  return [...found].sort();
}

describe('notification kinds are all presentable', () => {
  const kinds = kindsWrittenByTheApi();

  /*
    THE FLOOR. Without this the regex above could stop matching after any
    refactor of the API and the whole suite would still pass, having checked
    nothing -- a guard that hides its own failure. Six kinds are written
    today; if this number has to come DOWN, a kind was deliberately removed
    and the map should lose it in the same change.
  */
  it('finds at least the six kinds the API is known to write', () => {
    expect(kinds.length).toBeGreaterThanOrEqual(6);
    expect(kinds).toEqual(expect.arrayContaining(['credential_review', 'moderation']));
  });

  /*
    ASSERTED AGAINST THE MAP'S KEYS, NOT AGAINST WHAT IT RENDERS.

    The first version of this test asked whether the kind rendered differently
    from the `test` fallback, and it PASSED with an entry deleted from the map
    -- because an unrecognised kind falls back to its `type`, which for all six
    of these is `application_status`, which renders as a perfectly ordinary
    blue "Application update" card. The check was reporting success while the
    notification had silently lost its identity, which is precisely the failure
    it was written to catch. Verified by deleting an entry: the old assertion
    passed, this one fails.
  */
  it.each(kindsWrittenByTheApi())('has %s in the presentation map', (kind) => {
    expect(RECOGNISED_NOTIFICATION_KINDS).toContain(kind);
  });

  it.each(kindsWrittenByTheApi())('gives %s a real caption and icon', (kind) => {
    const shown = describeNotification(notification({ data: { kind } }));
    expect(shown.category.length).toBeGreaterThan(0);
    expect(shown.icon.length).toBeGreaterThan(0);
  });

  it('gives every kind a tone that resolves to real colours', () => {
    for (const kind of kinds) {
      const { fg, bg } = notificationToneColors(describeNotification(notification({ data: { kind } })).tone);
      expect(fg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(bg).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe('describeNotification', () => {
  it('reads the most specific thing the sender said', () => {
    // kind beats type: this is typed application_status like everything else.
    expect(describeNotification(notification({ data: { kind: 'credential_review' } })).category).toBe(
      'Identity verification'
    );
  });

  it('distinguishes the application decisions from one another', () => {
    const accepted = describeNotification(notification({ data: { status: 'accepted' } }));
    const waitlisted = describeNotification(notification({ data: { status: 'waitlisted' } }));
    const cancelled = describeNotification(notification({ data: { status: 'cancelled' } }));

    expect(accepted.tone).toBe('green');
    expect(waitlisted.tone).toBe('amber');
    expect(cancelled.category).toBe('Outreach cancelled');
  });

  it('does not draw a rejection in red', () => {
    // The organisation chose other people. That is not an error and not a
    // warning, and the applications tracker makes the same distinction.
    expect(describeNotification(notification({ data: { status: 'rejected' } })).tone).toBe('grey');
  });

  it('accepts a decision arriving as kind, which is how the endpoint sends it', () => {
    expect(describeNotification(notification({ data: { kind: 'accepted' } })).tone).toBe('green');
  });

  it('falls back to the type for an unrecognised kind rather than throwing', () => {
    const shown = describeNotification(notification({ type: 'new_match', data: { kind: 'invented_later' } }));
    expect(shown.category).toBe('New match');
  });

  it('survives a null data payload', () => {
    const shown = describeNotification(
      notification({ type: 'event_reminder', data: null as unknown as Record<string, unknown> })
    );
    expect(shown.category).toBe('Reminder');
  });
});

describe('notificationDestination', () => {
  it('sends a credential decision to identity verification, not to applications', () => {
    // The bug this replaced: the screen routed on "has an outreach_id, else is
    // it an application_status", so a verification decision -- which is neither
    // about an outreach nor about an application -- opened the tracker.
    const destination = notificationDestination(
      notification({ data: { kind: 'credential_review' } }),
      'volunteer'
    );
    expect(destination).toContain('/(volunteer)/verify-identity');
  });

  it('sends a dispute outcome and a reversed deduction to My feedback', () => {
    expect(notificationDestination(notification({ data: { kind: 'dispute' } }), 'volunteer')).toContain(
      '/(volunteer)/feedback'
    );
    expect(
      notificationDestination(notification({ data: { kind: 'score_event_voided' } }), 'volunteer')
    ).toContain('/(volunteer)/feedback');
  });

  it('sends a decision to the tracker even though it carries an outreach', () => {
    const destination = notificationDestination(
      notification({ outreach_id: 'o1', data: { status: 'accepted' } }),
      'volunteer'
    );
    expect(destination).toContain('/(volunteer)/applications');
    // A tab keeps no history, so without `from` the hardware back button
    // lands on Home instead of on the inbox the tap came from.
    expect(destination).toContain('from=/(volunteer)/notifications');
  });

  it('still sends a match and a reminder to the outreach itself', () => {
    expect(
      notificationDestination(notification({ type: 'new_match', outreach_id: 'o1', data: {} }), 'volunteer')
    ).toContain('/(volunteer)/outreach/o1');
    expect(
      notificationDestination(
        notification({ type: 'event_reminder', outreach_id: 'o1', data: {} }),
        'volunteer'
      )
    ).toContain('/(volunteer)/outreach/o1');
  });

  it('carries a from param so back returns to the inbox', () => {
    // Every screen reached this way lives inside a tab group, where back()
    // unwinds the tab history to Home instead of to the notifications screen.
    const destination = notificationDestination(
      notification({ type: 'new_match', outreach_id: 'o1', data: {} }),
      'volunteer'
    );
    expect(destination).toContain('from=/(volunteer)/notifications');
  });

  it('sends an organisation to the applicant queue for that event', () => {
    const destination = notificationDestination(
      notification({ outreach_id: 'o1', data: { kind: 'new_application' } }),
      'organisation'
    );
    expect(destination).toContain('/(organisation)/applicants?outreachId=o1');
    expect(destination).toContain('from=/(organisation)/notifications');
  });

  it('sends an organisation its own verification decision, and says where from', () => {
    // The `from` is the half that was missing and was reported: a tab group
    // keeps no history, so ScreenHeader falls back to the screen's own default
    // -- Settings, in this case -- for anyone who did not say where they came
    // from. Asserted with toContain so the destination and the origin are two
    // separate claims rather than one brittle string.
    const destination = notificationDestination(
      notification({ data: { kind: 'organisation_verification' } }),
      'organisation'
    );
    expect(destination).toContain('/(organisation)/verification');
    expect(destination).toContain('from=/(organisation)/notifications');
  });

  it('routes the same row differently for the two audiences', () => {
    const cancelled = notification({ outreach_id: 'o1', data: { status: 'cancelled' } });
    expect(notificationDestination(cancelled, 'volunteer')).toContain('/(volunteer)/applications');
    expect(notificationDestination(cancelled, 'organisation')).toContain('/(organisation)/outreach/o1');
  });

  it('returns null where there is genuinely nowhere to go', () => {
    // A suspension refers to the state of the account itself, which the home
    // screen banner already states; a test push exists only to prove delivery.
    // Sending either somewhere plausible would teach people that tapping a
    // notification does something unpredictable.
    expect(notificationDestination(notification({ data: { kind: 'moderation' } }), 'volunteer')).toBeNull();
    expect(notificationDestination(notification({ data: { kind: 'moderation' } }), 'organisation')).toBeNull();
    expect(notificationDestination(notification({ type: 'test', data: {} }), 'volunteer')).toBeNull();
  });
});

describe('formatRelativeTime', () => {
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('reads in minutes, then hours, then days', () => {
    expect(formatRelativeTime(ago(10_000))).toBe('just now');
    expect(formatRelativeTime(ago(15 * 60_000))).toBe('15m ago');
    expect(formatRelativeTime(ago(2 * 3_600_000))).toBe('2h ago');
    expect(formatRelativeTime(ago(3 * 86_400_000))).toBe('3d ago');
  });

  it('never reports a negative age from a clock skew', () => {
    expect(formatRelativeTime(new Date(now + 60_000).toISOString())).toBe('just now');
  });

  it('returns an empty string rather than NaN for an unparseable date', () => {
    expect(formatRelativeTime('not a date')).toBe('');
  });
});
