import { humanError } from '../errorMessage';

describe('humanError — nothing machine-shaped reaches a user', () => {
  it('replaces the serialised Response that was shown on screen', () => {
    const message =
      '{"status":500,"statusText":"","redirected":false,"url":"https://x.supabase.co/auth/v1/signup"}';
    const result = humanError(new Error(message), 'Could not create your account.');

    expect(result).not.toContain('{');
    expect(result).not.toContain('supabase');
    expect(result).not.toContain('status');
    // A 5xx is ours, and saying so is what tells someone retrying is worthwhile.
    expect(result).toMatch(/our end/i);
  });

  it('falls back rather than showing a stack trace', () => {
    const error = new Error('TypeError: x is not a function\n    at foo (bundle.js:1:1)');
    expect(humanError(error, 'Could not load.')).toBe('Could not load.');
  });

  it('falls back on an empty message, a bare code and a bare URL', () => {
    expect(humanError(new Error(''), 'Nope.')).toBe('Nope.');
    expect(humanError(new Error('PGRST301'), 'Nope.')).toBe('Nope.');
    expect(humanError(new Error('42501'), 'Nope.')).toBe('Nope.');
    expect(humanError(new Error('https://example.com/a/b'), 'Nope.')).toBe('Nope.');
  });

  it('falls back on null, undefined and a plain object', () => {
    expect(humanError(null, 'Nope.')).toBe('Nope.');
    expect(humanError(undefined, 'Nope.')).toBe('Nope.');
    expect(humanError({}, 'Nope.')).toBe('Nope.');
  });
});

describe('humanError — known failures get a sentence, not jargon', () => {
  it('explains the SMTP failure that broke registration, and that nothing was saved', () => {
    const result = humanError(new Error('Error sending confirmation email'));
    expect(result).toMatch(/account was not created/i);
  });

  it('matches the known phrase even when it arrives inside a JSON body', () => {
    const body = '{"code":500,"error_code":"unexpected_failure","msg":"Error sending confirmation email"}';
    expect(humanError(new Error(body))).toMatch(/account was not created/i);
  });

  it('translates the auth errors a person can actually act on', () => {
    expect(humanError(new Error('Invalid login credentials'))).toMatch(/do not match/i);
    expect(humanError(new Error('User already registered'))).toMatch(/already an account/i);
    expect(humanError(new Error('Email not confirmed'))).toMatch(/Confirm your email/i);
  });

  it('never shows a database permission failure verbatim', () => {
    // The two failure modes read differently to us and identically to a user.
    expect(humanError(new Error('permission denied for table profiles'))).toBe(
      'You do not have permission to do that.'
    );
    expect(
      humanError(new Error('new row violates row-level security policy for table "applications"'))
    ).toBe('You do not have permission to do that.');
  });

  it('turns a network failure into something with advice in it', () => {
    expect(humanError(new TypeError('Network request failed'))).toMatch(/connection/i);
  });
});

describe('humanError — a message that is already a sentence is left alone', () => {
  it('passes through wording written for a person', () => {
    const written = 'Pick at least one day before applying.';
    expect(humanError(new Error(written))).toBe(written);
  });

  it('reads a plain string as its own message', () => {
    expect(humanError('That outreach is already full.')).toBe('That outreach is already full.');
  });

  it('prefers a readable secondary field over a machine-shaped message', () => {
    const error = { message: '{"status":400}', error_description: 'That code has already been used.' };
    expect(humanError(error)).toBe('That code has already been used.');
  });
});
