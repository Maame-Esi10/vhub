import fs from 'fs';
import path from 'path';
import {
  isPlausibleOtp,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  sanitiseOtp,
} from '@/lib/otp';

describe('sanitiseOtp', () => {
  it('keeps digits and drops everything else', () => {
    expect(sanitiseOtp('123 456')).toBe('123456');
    expect(sanitiseOtp('  1234-56 ')).toBe('123456');
    expect(sanitiseOtp('abc123456')).toBe('123456');
  });

  it('caps at the longest code Supabase can issue', () => {
    expect(sanitiseOtp('123456789012345')).toBe('1234567890');
    expect(sanitiseOtp('123456789012345').length).toBe(OTP_MAX_LENGTH);
  });

  it('does NOT cap at six', () => {
    // The reported bug: an eight-digit code could not be typed at all,
    // because every keystroke past the sixth was sliced away.
    expect(sanitiseOtp('12345678')).toBe('12345678');
  });
});

describe('isPlausibleOtp', () => {
  it('accepts every length Supabase can be configured to send', () => {
    for (let length = OTP_MIN_LENGTH; length <= OTP_MAX_LENGTH; length += 1) {
      expect(isPlausibleOtp('1'.repeat(length))).toBe(true);
    }
  });

  it('rejects anything shorter than the minimum', () => {
    expect(isPlausibleOtp('12345')).toBe(false);
    expect(isPlausibleOtp('')).toBe(false);
  });

  it('tolerates surrounding whitespace from a paste', () => {
    expect(isPlausibleOtp('  12345678  ')).toBe(true);
  });
});

/**
 * THE GUARD, and it is the point of this file.
 *
 * The bug was not that six was the wrong number. It was that a number the app
 * does not own was hard-coded into the INPUT, so a code longer than the guess
 * was physically untypeable and both flows dead-ended. Asserting the helpers
 * behave correctly does not stop somebody reintroducing `maxLength={6}` on the
 * screen itself, which is exactly where the fault lived.
 *
 * So this reads the two screens and fails if either constrains the code to a
 * literal length again. Enumerated from the screens, not from lib/otp.ts --
 * the file that already complies is not the one that can regress.
 */
describe('neither auth screen hard-codes a code length', () => {
  const screens = ['app/(auth)/confirm-email.tsx', 'app/(auth)/reset-password.tsx'];

  it.each(screens)('%s caps the input with OTP_MAX_LENGTH', (relative) => {
    const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

    // The screen still has a code input at all: without this the test would
    // pass vacuously if the input were renamed or removed.
    expect(source).toContain('maxLength={OTP_MAX_LENGTH}');
    expect(source).toContain('sanitiseOtp(');

    // No literal length anywhere near the code handling.
    expect(source).not.toMatch(/maxLength=\{\s*\d+\s*\}/);
    expect(source).not.toMatch(/slice\(0,\s*\d+\)/);
    expect(source).not.toMatch(/CODE_LENGTH/);
  });

  it.each(screens)('%s does not promise a digit count in its copy', (relative) => {
    const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
    // "6-digit" was a claim the app cannot keep: the length is a Supabase
    // setting, and naming a wrong one tells somebody holding a correct code
    // that they have the wrong one.
    expect(source).not.toMatch(/\d+-digit/);
    expect(source).not.toMatch(/six-digit/i);
  });
});
