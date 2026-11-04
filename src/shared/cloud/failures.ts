// SPDX-License-Identifier: MIT
// What a person is told when a request to the cloud fails: a message of the catalogs, chosen by
// what happened, never by the cloud's own words (the app API, Errors).
import { Refused, Unavailable } from './errors';
import { Unreachable } from './transport';

/** The catalog's message for `error`. */
export function failureMessage(error: unknown): string {
  if (error instanceof Unreachable) return 'cloud.unreachable';
  if (error instanceof Unavailable) return 'cloud.unavailable';
  if (error instanceof Refused && error.status === 429) return 'cloud.busy';
  return 'cloud.failed';
}
