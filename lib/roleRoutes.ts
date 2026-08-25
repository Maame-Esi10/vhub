import type { ProfileRole } from '@/types/database';

/**
 * Where each role lives, in ONE place, shared by the auth guard and by every
 * tab group's own defence-in-depth guard.
 *
 * It used to be spelled out separately in each: a ternary in useAuthGuard and
 * a hard-coded "send them to the other group" in each layout. With two roles
 * that worked, because "not volunteer" could only mean organisation. With
 * three it breaks — an admin who somehow reached the volunteer group was sent
 * to the organisation group, whose own guard sent them straight back, and the
 * two redirects can ping-pong synchronously before the auth guard's effect
 * gets a chance to settle it. Reading the destination from the role removes
 * the guess entirely.
 *
 * The route values are literal types, not plain strings, so a typo is a
 * compile error and Expo Router still accepts them as hrefs.
 */
export type RoleHome = '/(volunteer)/feed' | '/(organisation)/dashboard' | '/(admin)/overview';

export const ROLE_HOME: Record<ProfileRole, RoleHome> = {
  volunteer: '/(volunteer)/feed',
  organisation: '/(organisation)/dashboard',
  admin: '/(admin)/overview',
};

/** The route-group segment each role owns, e.g. `(volunteer)`. */
export const ROLE_GROUP: Record<ProfileRole, string> = {
  volunteer: '(volunteer)',
  organisation: '(organisation)',
  admin: '(admin)',
};

/**
 * The three role groups. Used to ask "is this segment somebody's tab group?"
 * — `(auth)` and `offline` are deliberately absent, because both are open to
 * every role and are handled before this test.
 */
export const ROLE_GROUPS = new Set(Object.values(ROLE_GROUP));
