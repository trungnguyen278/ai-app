// SPDX-License-Identifier: MIT
// The homes' queries, by resource (ADR-0004, decision 5): a change invalidates what it touched.

/** The homes the person is in. */
export const HOMES = ['homes'] as const;

/** The people in a home. */
export function membersOf(homeId: string) {
  return ['homes', homeId, 'members'] as const;
}

/** A home's open invitations. */
export function invitationsOf(homeId: string) {
  return ['homes', homeId, 'invitations'] as const;
}

/** What the invitation whose code a person holds shows them before they agree. */
export function previewOf(code: string | null) {
  return ['invitations', code, 'preview'] as const;
}
