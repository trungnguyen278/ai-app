// SPDX-License-Identifier: MIT
// The protocols that the app speaks, as ai-platform's schemas define them (ADR-0004): their
// types, and the checks of their bodies. The app checks every body it receives (SEC-14), and
// the simulated cloud every body it is sent, as the cloud does; so do set-up's client and its
// simulated device, for every message. `npm run protocols` makes both from the schemas pinned at
// platform/.
import type { ErrorObject } from 'ajv';

import * as appChecks from './generated/app-checks';
import type { Check } from './generated/app-checks';
import * as setupChecks from './generated/setup-checks';

export { JSON_DEPTH, JsonError, readJson } from './json';
export type * as App from './generated/app';
export type * as Setup from './generated/setup';

/** The checks of the app API's bodies, and of the objects within them, by their definition. */
export type AppChecks = typeof appChecks;
/** A definition of the app API that has a check. */
export type AppDefinition = keyof AppChecks;
const APP_CHECKS: AppChecks = appChecks;

/** The body that the app API's definition `K` describes. */
export type AppBody<K extends AppDefinition> = AppChecks[K] extends Check<infer T> ? T : never;

/** The checks of set-up's messages, and of the objects within them, by their definition. */
export type SetupChecks = typeof setupChecks;
/** A definition of set-up that has a check. */
export type SetupDefinition = keyof SetupChecks;
const SETUP_CHECKS: SetupChecks = setupChecks;

/** The value that set-up's definition `K` describes. */
export type SetupBody<K extends SetupDefinition> =
  SetupChecks[K] extends Check<infer T> ? T : never;

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
  return checkedBy(definition, APP_CHECKS[definition] as Check<AppBody<K>>, body);
}

/** `message`, as set-up's `definition` describes it; `ProtocolError` if it is not one. */
export function setupChecked<K extends SetupDefinition>(
  definition: K,
  message: unknown,
): SetupBody<K> {
  return checkedBy(definition, SETUP_CHECKS[definition] as Check<SetupBody<K>>, message);
}

function checkedBy<T>(definition: string, check: Check<T>, body: unknown): T {
  if (check(body)) {
    return body;
  }
  const [error] = check.errors ?? [];
  throw new ProtocolError(definition, error?.instancePath || '/', rule(error));
}

/** Whether `value` is what the app API's `definition` describes: for what people type. */
export function accepts(definition: AppDefinition, value: unknown): boolean {
  return APP_CHECKS[definition](value);
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
