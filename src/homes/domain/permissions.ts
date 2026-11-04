// SPDX-License-Identifier: MIT
// What each role may do in a home (the app API, What each role may do). The cloud decides; the
// app offers only what the person's role allows.
import { hasAccount, roleOf } from './people';

/** A person in the home, as far as what may be done to them goes. */
export interface Target {
  kind: string;
  role?: string;
  /** Whether the target is the person who asks. */
  current: boolean;
}

/** Whether a person of `role` may change the home, invite people and add profiles. */
export function mayManage(role: string | undefined): boolean {
  const known = roleOf(role);
  return known === 'owner' || known === 'admin';
}

/** Whether `target` is a member or a profile, whom admins look after. */
function inAdminsCare(target: Target): boolean {
  return !hasAccount(target.kind) || roleOf(target.role) === 'member';
}

/** Whether a person of `role` may rename `target`: anyone themself, the owner anyone, an admin
 *  members and profiles. */
export function mayRename(role: string | undefined, target: Target): boolean {
  const known = roleOf(role);
  return target.current || known === 'owner' || (known === 'admin' && inAdminsCare(target));
}

/** Whether a person of `role` may remove `target`, someone else: the owner anyone, an admin
 *  members and profiles. Removing oneself is leaving. */
export function mayRemove(role: string | undefined, target: Target): boolean {
  const known = roleOf(role);
  if (target.current) return false;
  return known === 'owner' || (known === 'admin' && inAdminsCare(target));
}

/** Whether a person of `role` may leave: anyone but the owner, who hands the home over or
 *  deletes it. */
export function mayLeave(role: string | undefined): boolean {
  return roleOf(role) !== 'owner';
}
