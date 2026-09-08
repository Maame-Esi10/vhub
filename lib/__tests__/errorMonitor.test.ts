import {
  ERROR_ALERT_THROTTLE_MS,
  decideAlert,
  errorFingerprint,
  formatErrorLog,
  isAlertable,
  type AlertWindow,
} from '../errorMonitor';

describe('isAlertable', () => {
  it('alerts on 5xx, which is the only class that means we broke', () => {
    expect(isAlertable(500)).toBe(true);
    expect(isAlertable(502)).toBe(true);
  });

  it('stays silent on every refusal the API makes on purpose', () => {
    // Alerting on these would produce a steady trickle of mail about the API
    // working correctly, and the one message that mattered would arrive in the
    // middle of it.
    for (const status of [200, 400, 401, 403, 404, 409, 429]) {
      expect(isAlertable(status)).toBe(false);
    }
  });
});

describe('errorFingerprint', () => {
  it('groups the same fault across requests that name different rows', () => {
    const a = errorFingerprint(
      '/api/vscore',
      'internal_error',
      'Could not load application 4f1d2c3b-1111-4a2b-8c3d-9e0f1a2b3c4d'
    );
    const b = errorFingerprint(
      '/api/vscore',
      'internal_error',
      'Could not load application 9a8b7c6d-2222-4a2b-8c3d-9e0f1a2b3c4d'
    );
    expect(a).toBe(b);
  });

  it('strips numbers, so a retry count or a port never splits one fault in two', () => {
    expect(errorFingerprint('/api/match', 'internal_error', 'connect ECONNREFUSED 127.0.0.1:5432')).toBe(
      errorFingerprint('/api/match', 'internal_error', 'connect ECONNREFUSED 127.0.0.1:6543')
    );
  });

  it('strips quoted values, which are the specific thing that failed', () => {
    expect(errorFingerprint('/api/match', 'bad_request', 'column "skill_tags" does not exist')).toBe(
      errorFingerprint('/api/match', 'bad_request', 'column "availability" does not exist')
    );
  });

  it('keeps genuinely different faults apart', () => {
    const a = errorFingerprint('/api/match', 'internal_error', 'Could not load candidates.');
    const b = errorFingerprint('/api/match', 'internal_error', 'Gemini returned nothing.');
    const c = errorFingerprint('/api/vscore', 'internal_error', 'Could not load candidates.');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('bounds the length, so a huge message cannot become a huge key', () => {
    const fingerprint = errorFingerprint('/api/match', 'internal_error', 'x'.repeat(5000));
    expect(fingerprint.length).toBeLessThan(220);
  });
});

describe('decideAlert', () => {
  const now = 1_700_000_000_000;

  it('always reports a fault it has never seen', () => {
    const decision = decideAlert(undefined, now);
    expect(decision.send).toBe(true);
    expect(decision.alsoReporting).toBe(0);
    expect(decision.window).toEqual({ lastAlertedAt: now, suppressed: 0 });
  });

  it('stays quiet inside the throttle window, and counts what it swallowed', () => {
    let window: AlertWindow = { lastAlertedAt: now, suppressed: 0 };

    for (let i = 1; i <= 3; i += 1) {
      const decision = decideAlert(window, now + i * 1000);
      expect(decision.send).toBe(false);
      window = decision.window;
      expect(window.suppressed).toBe(i);
    }
    // The window's own start does NOT move while it is suppressing, or a
    // continuously failing endpoint would push the next alert out forever and
    // report nothing at all.
    expect(window.lastAlertedAt).toBe(now);
  });

  it('reports again once the window has passed, carrying the suppressed count', () => {
    const decision = decideAlert(
      { lastAlertedAt: now, suppressed: 14 },
      now + ERROR_ALERT_THROTTLE_MS
    );
    expect(decision.send).toBe(true);
    expect(decision.alsoReporting).toBe(14);
    // The count resets with the alert that reported it, so it is never
    // double-counted into the next one.
    expect(decision.window).toEqual({ lastAlertedAt: now + ERROR_ALERT_THROTTLE_MS, suppressed: 0 });
  });

  it('is silent one millisecond before the window is up', () => {
    expect(decideAlert({ lastAlertedAt: now, suppressed: 0 }, now + ERROR_ALERT_THROTTLE_MS - 1).send).toBe(
      false
    );
  });
});

describe('formatErrorLog', () => {
  it('is one line of parseable JSON behind a greppable tag', () => {
    const line = formatErrorLog({
      route: '/api/match',
      status: 500,
      code: 'internal_error',
      message: 'Could not load candidates.',
      fingerprint: '/api/match|internal_error|Could not load candidates.',
      userId: 'abc',
    });

    expect(line.startsWith('[api-error] ')).toBe(true);
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line.slice('[api-error] '.length))).toEqual({
      route: '/api/match',
      status: 500,
      code: 'internal_error',
      message: 'Could not load candidates.',
      fingerprint: '/api/match|internal_error|Could not load candidates.',
      userId: 'abc',
    });
  });

  it('omits the user id entirely when there was no signed-in caller', () => {
    const line = formatErrorLog({
      route: '/api/match',
      status: 401,
      code: 'unauthenticated',
      message: 'Invalid or expired session token.',
      fingerprint: 'f',
    });
    expect(JSON.parse(line.slice('[api-error] '.length))).not.toHaveProperty('userId');
  });
});
