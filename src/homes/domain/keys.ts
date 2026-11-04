// SPDX-License-Identifier: MIT
// The homes' queries, by resource (ADR-0004, decision 5): a change invalidates what it touched.

/** The homes the person is in. */
export const HOMES = ['homes'] as const;

/** The people in a home. */
export function membersOf(homeId: string) {
  return ['homes', homeId, 'members'] as const;
}
