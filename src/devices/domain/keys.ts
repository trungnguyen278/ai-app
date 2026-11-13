// SPDX-License-Identifier: MIT
// The devices' queries, by resource (ADR-0004, decision 5): under their home's, so that a person
// who leaves the home drops them with it.

/** The devices of a home. */
export function devicesOf(homeId: string) {
  return ['homes', homeId, 'devices'] as const;
}
