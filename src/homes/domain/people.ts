// SPDX-License-Identifier: MIT
// The people in a home, as the app reads them (the app API, What each role may do): a role it
// does not know counts as a member, a kind it does not know as a profile.

export type KnownRole = 'owner' | 'admin' | 'member';

const ROLES: readonly KnownRole[] = ['owner', 'admin', 'member'];

/** `role`, or `member` for one of a later version. */
export function roleOf(role: string | undefined): KnownRole {
  return ROLES.find((known) => known === role) ?? 'member';
}

/** Whether `kind` is a person with an account; any other counts as a profile. */
export function hasAccount(kind: string): boolean {
  return kind === 'account';
}
