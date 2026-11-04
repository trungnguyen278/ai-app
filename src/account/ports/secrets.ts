// SPDX-License-Identifier: MIT
// Where the account keeps its secrets: the session's refresh token, in the phone's secure
// storage (ADR-0004, decision 4).

/** A small store of secrets, by name, that lasts while the app stays installed. */
export interface Secrets {
  /** The secret named `name`; null if none is kept. */
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}
