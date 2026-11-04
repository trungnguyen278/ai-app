// SPDX-License-Identifier: MIT
// What each role may do in a home (the app API, What each role may do). The cloud decides; the
// app offers only what the person's role allows.
import { roleOf } from './people';

/** Whether a person of `role` may change the home, invite people and add profiles. */
export function mayManage(role: string | undefined): boolean {
  const known = roleOf(role);
  return known === 'owner' || known === 'admin';
}
