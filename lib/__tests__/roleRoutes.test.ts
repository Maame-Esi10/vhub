import { ROLE_GROUP, ROLE_GROUPS, ROLE_HOME } from '../roleRoutes';
import type { ProfileRole } from '@/types/database';

/**
 * These maps are what the auth guard and all three tab layouts read to decide
 * where a signed-in user belongs. The bug they replaced was a redirect loop:
 * with only two roles, "not volunteer" could be assumed to mean organisation,
 * and adding a third role made that assumption send an admin into a group
 * whose own guard sent them straight back.
 *
 * So the properties tested here are the ones a fourth role would break
 * silently: every role has a home, every home lands inside that role's own
 * group, and no two roles share one.
 */
const ROLES: ProfileRole[] = ['volunteer', 'organisation', 'admin'];

describe('role routing maps', () => {
  it('gives every role a home route and a group', () => {
    for (const role of ROLES) {
      expect(ROLE_HOME[role]).toBeTruthy();
      expect(ROLE_GROUP[role]).toBeTruthy();
    }
    // Guards against a role being added to the type but not to the maps: the
    // Record<> type catches that at compile time, and this catches a map that
    // has grown a key the ROLES list above does not know about.
    expect(Object.keys(ROLE_HOME).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ROLE_GROUP).sort()).toEqual([...ROLES].sort());
  });

  it('points each home route inside that role own group', () => {
    for (const role of ROLES) {
      expect(ROLE_HOME[role].startsWith(`/${ROLE_GROUP[role]}/`)).toBe(true);
    }
  });

  it('never shares a group or a home between two roles', () => {
    expect(new Set(Object.values(ROLE_GROUP)).size).toBe(ROLES.length);
    expect(new Set(Object.values(ROLE_HOME)).size).toBe(ROLES.length);
  });

  it('lists exactly the role groups, and no shared route group', () => {
    expect(ROLE_GROUPS.size).toBe(ROLES.length);
    // (auth) and offline are open to every role and are handled before the
    // "you are in someone else's group" test ever runs. If either appeared
    // here, a signed-in user on the offline screen would be bounced home.
    expect(ROLE_GROUPS.has('(auth)')).toBe(false);
    expect(ROLE_GROUPS.has('offline')).toBe(false);
  });
});
