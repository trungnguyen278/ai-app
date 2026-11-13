// SPDX-License-Identifier: MIT
// One request to the app API and its answer: the request as the protocol writes it, the answer
// checked against the schema before anything reads it (SEC-14), and any other outcome as the
// error that says what happened.
import {
  checked,
  JsonError,
  ProtocolError,
  readJson,
  type AppBody,
  type AppDefinition,
} from '@/src/shared/protocols';

import { OAuthRefused, Refused, Unavailable } from './errors';
import {
  bearer,
  formEncode,
  FORM_TYPE,
  JSON_TYPE,
  PROBLEM_TYPE,
  quoted,
  retryAfter,
  withQuery,
  type Fields,
} from './http';
import type { CloudRequest, Method, Transport } from './transport';

/** A request, and what its answer must be. */
export interface Call<K extends AppDefinition | null> {
  /** What it does, as errors name it: never a value. */
  readonly operation: string;
  readonly method: Method;
  readonly path: string;
  readonly query?: Fields;
  /** A JSON body. */
  readonly json?: unknown;
  /** Form fields, at the OAuth endpoints. */
  readonly form?: Fields;
  /** The access token. */
  readonly bearer?: string;
  /** The Idempotency-Key, the same for every retry of one request. */
  readonly key?: string;
  /** The ETag the change was made from. */
  readonly ifMatch?: string;
  /** Whether a refusal is an OAuth error (RFC 6749, 5.2), not Problem Details. */
  readonly oauth?: boolean;
  /** The statuses of success. */
  readonly success: readonly number[];
  /** The definition of their body, or null when the app reads none. */
  readonly answer: K;
}

/** The body of an answer to a call whose answer is `K`. */
export type Body<K extends AppDefinition | null> = K extends AppDefinition ? AppBody<K> : undefined;

/** An answer of success. */
export interface Answer<K extends AppDefinition | null> {
  readonly status: number;
  readonly body: Body<K>;
}

/** Send `call`, and read its answer: `Refused`, `OAuthRefused`, `Unavailable` or
 *  `ProtocolError` for any other, `Unreachable` for none. */
export async function exchange<K extends AppDefinition | null>(
  transport: Transport,
  call: Call<K>,
  clock: () => number = Date.now,
): Promise<Answer<K>> {
  const response = await transport.send(request(call));
  const { status } = response;
  if (call.success.includes(status)) {
    const body =
      call.answer === null ? undefined : checked(call.answer, parse(call.operation, response.body));
    return { status, body: body as Body<K> };
  }
  const wait = retryAfter(response.headers['retry-after'], clock());
  if (status >= 500) {
    throw new Unavailable(call.operation, status, wait);
  }
  if (status >= 400) {
    const body = parse(call.operation, response.body);
    if (call.oauth) {
      throw new OAuthRefused(call.operation, status, checked('oauth_error', body).error);
    }
    throw new Refused(call.operation, status, checked('problem', body).type, wait);
  }
  throw new ProtocolError(call.operation, '/', `is answered ${status}`);
}

function request(call: Call<AppDefinition | null>): CloudRequest {
  const headers: Record<string, string> = {
    accept: call.oauth ? JSON_TYPE : `${JSON_TYPE}, ${PROBLEM_TYPE}`,
  };
  let body: string | undefined;
  if (call.form !== undefined) {
    headers['content-type'] = FORM_TYPE;
    body = formEncode(call.form);
  } else if (call.json !== undefined) {
    headers['content-type'] = JSON_TYPE;
    body = JSON.stringify(call.json);
  }
  if (call.bearer !== undefined) headers.authorization = bearer(call.bearer);
  if (call.key !== undefined) headers['idempotency-key'] = quoted(call.key);
  if (call.ifMatch !== undefined) headers['if-match'] = call.ifMatch;
  return { method: call.method, target: withQuery(call.path, call.query), headers, body };
}

/** The body `text`, as JSON that every side can hold (ADR-0014): one that the app cannot hold
 * is one that it cannot read. */
function parse(operation: string, text: string): unknown {
  try {
    return readJson(text);
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    throw new ProtocolError(operation, '/', error.message);
  }
}
