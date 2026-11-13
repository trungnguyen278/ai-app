// SPDX-License-Identifier: MIT
// What a set-up session can end in instead of an answer, told apart as ADR-0013 (ai-platform,
// decision 7) asks. Each error names the request and what happened, never a value: no code,
// password, network or name (SEC-5).

/** The error codes of set-up 2.2 that the app acts on (platform/protocols/setup/README.md). */
export const DEVICE_ERRORS = [
  'version',
  'busy',
  'code',
  'protocol',
  'unknown',
  'wrong_password',
  'not_found',
  'no_address',
  'network',
  'time_zone',
  'bound',
  'server',
  'identity',
] as const;
export type DeviceErrorCode = (typeof DEVICE_ERRORS)[number];

/** The device answered with an error. */
export class DeviceRefused extends Error {
  constructor(
    /** The message it answered: `hello`, `share`, `confirm`, or a request's type. */
    readonly operation: string,
    /** As the device wrote it: one of `DEVICE_ERRORS`, or a newer version's. */
    readonly code: string,
  ) {
    super(`${operation}: the device answered ${code}`);
    this.name = 'DeviceRefused';
  }

  /** Whether the device answered `code`. */
  is(code: DeviceErrorCode): boolean {
    return this.code === code;
  }
}

/** The device's confirmation was wrong: the code was not the one it shows, or someone is in
 * between. The device then shows a new code, as it does after its own error `code`. */
export class NotConfirmed extends Error {
  constructor() {
    super('share: the device did not confirm the code');
    this.name = 'NotConfirmed';
  }
}

/** Why a session is over before its answer came. */
export type LossReason =
  /** The link ended: the device went out of range, or ended the session. */
  | 'ended'
  /** The device sent what set-up does not allow: the app ended the session. */
  | 'broken'
  /** No answer came within the setting `answer_timeout`: the app ended the session. */
  | 'timeout';

/** The session is over, before the answer to `operation` came. */
export class SessionLost extends Error {
  constructor(
    readonly operation: string,
    readonly reason: LossReason,
  ) {
    super(`${operation}: the session is over (${reason})`);
    this.name = 'SessionLost';
  }
}
