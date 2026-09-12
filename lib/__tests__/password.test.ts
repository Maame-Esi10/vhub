import {
  MIN_PASSWORD_LENGTH,
  checkPasswordRules,
  describePasswordProblem,
  passwordStrength,
} from '../password';

describe('describePasswordProblem — the enforced rule', () => {
  it('accepts the minimum that satisfies every rule', () => {
    expect(describePasswordProblem('abcdefg1')).toBeNull();
    expect('abcdefg1'.length).toBe(MIN_PASSWORD_LENGTH);
  });

  it('refuses anything shorter than the minimum, however varied', () => {
    expect(describePasswordProblem('Ab1!xyz')).toMatch(/8 characters/);
  });

  it('refuses length alone with no number', () => {
    expect(describePasswordProblem('abcdefghijkl')).toMatch(/one number/);
  });

  it('refuses digits alone with no letter', () => {
    expect(describePasswordProblem('123456789')).toMatch(/one letter/);
  });

  it('asks for a password at all when the field is empty', () => {
    expect(describePasswordProblem('')).toBe('Choose a password.');
  });

  it('names only the FIRST unmet rule, since the checklist shows the rest', () => {
    // Fails length AND number; the message should mention one of them, not both.
    const message = describePasswordProblem('abc');
    expect(message).toMatch(/8 characters/);
    expect(message).not.toMatch(/number/);
  });

  it('does not require a symbol — that is what produces "Password1!"', () => {
    expect(describePasswordProblem('correcthorse7')).toBeNull();
  });

  it('is stricter than the six characters registration used to allow', () => {
    expect(describePasswordProblem('abc123')).not.toBeNull();
  });
});

describe('checkPasswordRules — what the live checklist shows', () => {
  it('reports each rule independently', () => {
    expect(checkPasswordRules('')).toEqual({ length: false, letter: false, number: false });
    expect(checkPasswordRules('abcdefgh')).toEqual({ length: true, letter: true, number: false });
    expect(checkPasswordRules('a1')).toEqual({ length: false, letter: true, number: true });
    expect(checkPasswordRules('abcdefg1')).toEqual({ length: true, letter: true, number: true });
  });
});

describe('passwordStrength — a nudge, never the gate', () => {
  it('calls anything below the minimum weak whatever it contains', () => {
    expect(passwordStrength('Ab1!')).toBe('weak');
  });

  it('rewards length over symbol soup', () => {
    expect(passwordStrength('abcdefg1')).toBe('fair');
    expect(passwordStrength('Abcdefghij1')).toBe('fair');
    expect(passwordStrength('Abcdefghijk1')).toBe('strong');
  });

  it('never blocks: a value it calls weak can still be accepted by the rule', () => {
    // Eight lowercase letters and a digit: one character class short of "fair"
    // by the meter, but it satisfies every enforced rule.
    expect(describePasswordProblem('abcdefg1')).toBeNull();
  });
});
