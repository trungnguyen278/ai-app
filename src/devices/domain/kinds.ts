// SPDX-License-Identifier: MIT
// The kinds of device the app knows (the app API, Reading a home's devices): one it does not
// know, or one not known yet, before the device's first hello, it shows as a device.

/** The kinds the app has a name for. */
export const KINDS = ['robot'] as const;

/** A kind the app knows, or `device`, for any other. */
export type Kind = (typeof KINDS)[number] | 'device';

/** What the app shows `kind` as. */
export function kindOf(kind: string | undefined): Kind {
  return KINDS.find((known) => known === kind) ?? 'device';
}
