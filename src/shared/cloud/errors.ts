// SPDX-License-Identifier: MIT
// What a request to the cloud can end in instead of its answer (the app API, Errors). Each
// error names the operation and what happened, never a value: no token, code or name.

/** The problems the app acts on, by code: their type is `PROBLEM_TYPES` and the code. */
export const PROBLEMS = [
  'owns_home_with_members',
  'identity_taken',
  'identity_linked',
  'last_identity',
  'recent_sign_in_required',
  'role_required',
  'owner_cannot_leave',
  'invitation_invalid',
  'home_limit_reached',
  'member_limit_reached',
  'invitation_limit_reached',
] as const;
export type ProblemCode = (typeof PROBLEMS)[number];

/** Fixed by the app API (README, Errors): where a problem's own type starts. */
export const PROBLEM_TYPES = '/app/v1/problems/';
/** Any other problem's type: its status says it all (RFC 9457, 4.2.1). */
export const ABOUT_BLANK = 'about:blank';
/** The OAuth error after which the person signs in again (the app API, Errors). */
export const INVALID_GRANT = 'invalid_grant';

/** The cloud refused the request, with Problem Details (RFC 9457). */
export class Refused extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    /** As the cloud wrote it: `about:blank`, or `PROBLEM_TYPES` and a code. */
    readonly type: string,
    /** Seconds to wait before asking again, when the cloud says (`Retry-After`). */
    readonly retryAfter?: number,
  ) {
    super(`${operation}: ${status} ${type}`);
    this.name = 'Refused';
  }

  /** Whether this is the problem `code`, whose type the app compares as written. */
  is(code: ProblemCode): boolean {
    return this.type === PROBLEM_TYPES + code;
  }
}

/** An OAuth endpoint refused the request (RFC 6749, 5.2). */
export class OAuthRefused extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    /** Its `error`, such as `INVALID_GRANT`. */
    readonly error: string,
  ) {
    super(`${operation}: ${status} ${error}`);
    this.name = 'OAuthRefused';
  }
}

/** The cloud answered that it cannot serve now, with a status of 500 or more. */
export class Unavailable extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    /** Seconds to wait before asking again, when the cloud says (`Retry-After`). */
    readonly retryAfter?: number,
  ) {
    super(`${operation}: ${status}`);
    this.name = 'Unavailable';
  }
}

/** Nobody is signed in, or the session has ended: the person signs in again. */
export class SignedOut extends Error {
  constructor(readonly operation: string) {
    super(`${operation}: signed out`);
    this.name = 'SignedOut';
  }
}
