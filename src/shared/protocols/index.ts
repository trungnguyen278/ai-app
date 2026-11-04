// SPDX-License-Identifier: MIT
// The protocols that the app speaks, as ai-platform's schemas define them (ADR-0004): their
// types, and the checks of their bodies. The app checks every body it receives (SEC-14), and
// the simulated cloud every body it is sent, as the cloud does. `npm run protocols` makes both
// from the schemas pinned at platform/.
import type { ErrorObject } from 'ajv';

import * as appChecks from './generated/app-checks';
import type { Check } from './generated/app-checks';

export type * as App from './generated/app';

/** The checks of the app API's bodies, and of the objects within them, by their definition. */
export type AppChecks = typeof appChecks;
/** A definition of the app API that has a check. */
export type AppDefinition = keyof AppChecks;
const APP_CHECKS: AppChecks = appChecks;

/** The body that the app API's definition `K` describes. */
export type AppBody<K extends AppDefinition> = AppChecks[K] extends Check<infer T> ? T : never;

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
export function checked<K extends AppDefinition>(definition: K, body: unknown): AppBody<K> {
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
