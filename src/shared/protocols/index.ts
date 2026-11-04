// SPDX-License-Identifier: MIT
// The protocols that the app speaks, as ai-platform's schemas define them (ADR-0004): their
// types, and the checks of every body that the app receives (SEC-14). `npm run protocols`
// makes both from the schemas pinned at platform/.
import type { ErrorObject } from 'ajv';

import * as appChecks from './generated/app-checks';
import type { Check } from './generated/app-checks';

export type * as App from './generated/app';

/** The checks of the bodies that the app receives from the cloud, by their definition. */
export type AppReceived = typeof appChecks;
const APP_CHECKS: AppReceived = appChecks;

/** The body that the app API's definition `K` describes. */
export type AppBody<K extends keyof AppReceived> =
  AppReceived[K] extends Check<infer T> ? T : never;

/**
 * A body that its definition refuses. The message says where and which rule, never the value,
 * which may be a token or a person's name.
 */
export class ProtocolError extends Error {
  constructor(
    readonly definition: string,
    readonly where: string,
    readonly rule: string,
  ) {
    super(`${definition}: ${where} ${rule}`);
    this.name = 'ProtocolError';
  }
}

/** `body`, as the app API's `definition` describes it; `ProtocolError` if it is not one. */
export function received<K extends keyof AppReceived>(definition: K, body: unknown): AppBody<K> {
  const check = APP_CHECKS[definition] as Check<AppBody<K>>;
  if (check(body)) {
    return body;
  }
  const [error] = check.errors ?? [];
  throw new ProtocolError(definition, error?.instancePath || '/', rule(error));
}

/** The rule that `error` says is broken, in the schema's own terms: Ajv's messages may quote a
 *  pattern, which can hold control characters. */
function rule(error: ErrorObject | undefined): string {
  if (error === undefined) {
    return 'is refused';
  }
  switch (error.keyword) {
    case 'required':
      return `lacks ${String(error.params.missingProperty)}`;
    case 'type':
      return `must be of type ${String(error.params.type)}`;
    default:
      return 'limit' in error.params
        ? `breaks ${error.keyword} ${String(error.params.limit)}`
        : `breaks ${error.keyword}`;
  }
}
