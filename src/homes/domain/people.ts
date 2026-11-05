// SPDX-License-Identifier: MIT
// The people in a home, as the app reads them (the app API, What each role may do): a role it
// does not know counts as a member, a kind it does not know as a profile.
import type { App } from '@/src/shared/protocols';

export type KnownRole = 'owner' | 'admin' | 'member';

const ROLES: readonly KnownRole[] = ['owner', 'admin', 'member'];

/** A role the owner gives a person: only handing the home over makes an owner. */
export type GivenRole = NonNullable<App.MemberUpdate['role']>;

/** The roles the owner gives (the app API, Changing a person), the one that allows most first. */
export const GIVEN_ROLES: readonly GivenRole[] = ['admin', 'member'];

/** `role`, or `member` for one of a later version. */
export function roleOf(role: string | undefined): KnownRole {
  return ROLES.find((known) => known === role) ?? 'member';
}

/** Whether `kind` is a person with an account; any other counts as a profile. */
export function hasAccount(kind: string): boolean {
  return kind === 'account';
}

/**
 * Whether `changes` make `person`, an admin, a member: which revokes the invitations they made
 * (the app API, Changing a person).
 */
export function demotes(person: { role?: string }, changes: { role?: string }): boolean {
  return roleOf(person.role) === 'admin' && changes.role === 'member';
}
