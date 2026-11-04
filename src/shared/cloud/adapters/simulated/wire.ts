// SPDX-License-Identifier: MIT
// The simulated cloud's HTTP: what it reads of a request, and how it answers, as ai-cloud does
// (its routes/http.py and shared/problems.py): JSON, Problem Details and OAuth's errors.
import { checked, ProtocolError, type AppBody, type AppDefinition } from '@/src/shared/protocols';

import { ABOUT_BLANK, PROBLEM_TYPES, type ProblemCode } from '../../errors';
import { formDecode, JSON_TYPE, mediaType, PROBLEM_TYPE, FORM_TYPE } from '../../http';
import type { CloudRequest, CloudResponse } from '../../transport';

/** What answers carrying tokens or personal data say to caches (RFC 6749, 5.1). */
const NO_STORE = { 'cache-control': 'no-store', pragma: 'no-cache' };

/** The reason phrases of the statuses it answers (RFC 9110, 15; RFC 6585, 4). */
const PHRASES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  412: 'Precondition Failed',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
};

/** The problems with a type of their own: their status and title, as ai-cloud gives them. */
const TYPED: Readonly<Record<ProblemCode, [number, string]>> = {
  owns_home_with_members: [409, 'Owns a home with members'],
  identity_taken: [409, 'Identity taken'],
  identity_linked: [409, 'Identity linked'],
  last_identity: [409, 'Last identity'],
  recent_sign_in_required: [403, 'Recent sign-in required'],
  role_required: [403, 'Role required'],
  owner_cannot_leave: [409, 'Owner cannot leave'],
  invitation_invalid: [404, 'Invitation invalid'],
  home_limit_reached: [409, 'Home limit reached'],
  member_limit_reached: [409, 'Member limit reached'],
  invitation_limit_reached: [409, 'Invitation limit reached'],
};

/** An answer, thrown from where a request is refused to where it is answered. */
export class Answered extends Error {
  constructor(readonly response: CloudResponse) {
    super(`answered ${response.status}`);
    this.name = 'Answered';
  }
}

/** A JSON answer. */
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): CloudResponse {
  return {
    status,
    headers: { 'content-type': JSON_TYPE, ...NO_STORE, ...headers },
    body: JSON.stringify(body),
  };
}

/** A JSON answer about something with an ETag, which its header carries too. */
export function tagged<T extends { etag: string }>(body: T, status = 200): CloudResponse {
  return json(body, status, { etag: body.etag });
}

/** An answer with no body. */
export function empty(status: number): CloudResponse {
  return { status, headers: { ...NO_STORE }, body: '' };
}

/** A problem whose status says it all: `about:blank`. */
export function problem(
  status: number,
  detail: string,
  headers: Record<string, string> = {},
): Answered {
  return new Answered({
    status,
    headers: { 'content-type': PROBLEM_TYPE, ...headers },
    body: JSON.stringify({ type: ABOUT_BLANK, title: PHRASES[status], status, detail }),
  });
}

/** A problem the app acts on, with a type of its own (the app API, Errors). */
export function typed(code: ProblemCode, detail: string): Answered {
  const [status, title] = TYPED[code];
  return new Answered({
    status,
    headers: { 'content-type': PROBLEM_TYPE },
    body: JSON.stringify({ type: PROBLEM_TYPES + code, title, status, detail }),
  });
}

/** An OAuth endpoint's error (RFC 6749, 5.2). */
export function oauthError(error: string, description: string, status = 400): Answered {
  return new Answered(json({ error, error_description: description }, status));
}

/** A request without an access token that works (RFC 6750, 3). */
export function unauthenticated(detail: string): Answered {
  return problem(401, detail, { 'www-authenticate': 'Bearer error="invalid_token"' });
}

/** A request to the simulated cloud, read. */
export class Incoming {
  readonly method: string;
  readonly path: string;
  readonly query: Map<string, string>;

  constructor(private readonly request: CloudRequest) {
    this.method = request.method;
    const mark = request.target.indexOf('?');
    this.path = mark < 0 ? request.target : request.target.slice(0, mark);
    this.query = new Map(mark < 0 ? [] : (formDecode(request.target.slice(mark + 1)) ?? []));
  }

  header(name: string): string | undefined {
    return this.request.headers[name];
  }

  get raw(): string {
    return this.request.body ?? '';
  }

  /** The JSON body, as `definition` describes it: 415, or 400, if it is not one. */
  json<K extends AppDefinition>(definition: K): AppBody<K> {
    if (mediaType(this.header('content-type')) !== JSON_TYPE) {
      throw problem(415, `the body must be ${JSON_TYPE}`);
    }
    let body: unknown;
    try {
      body = JSON.parse(this.raw);
    } catch {
      throw problem(400, 'the body is not JSON');
    }
    // A lone surrogate, which JSON's escapes can spell, is no text: nothing can store it.
    if (hasLoneSurrogate(body)) {
      throw problem(400, 'the body is not JSON');
    }
    try {
      return checked(definition, body);
    } catch (error) {
      if (error instanceof ProtocolError) throw problem(400, error.message);
      throw error;
    }
  }

  /**
   * The form fields of an OAuth endpoint: a field without a value counts as absent, and none
   * may come twice (RFC 6749, 3.1 and 3.2).
   */
  form(): Record<string, string> {
    if (mediaType(this.header('content-type')) !== FORM_TYPE) {
      throw oauthError('invalid_request', `the body must be ${FORM_TYPE}`);
    }
    const fields = formDecode(this.raw);
    if (fields === null) {
      throw oauthError('invalid_request', 'the body is not a form');
    }
    const form: Record<string, string> = {};
    const seen = new Set<string>();
    for (const [name, value] of fields) {
      if (seen.has(name)) throw oauthError('invalid_request', `${name} is repeated`);
      seen.add(name);
      if (value !== '') form[name] = value;
    }
    return form;
  }
}

/** `form`, as `definition` describes it: `invalid_request` if it is not one. */
export function checkedForm<K extends AppDefinition>(definition: K, form: unknown): AppBody<K> {
  try {
    return checked(definition, form);
  } catch (error) {
    if (error instanceof ProtocolError) throw oauthError('invalid_request', error.message);
    throw error;
  }
}

function hasLoneSurrogate(value: unknown): boolean {
  if (typeof value === 'string') {
    try {
      encodeURIComponent(value);
      return false;
    } catch {
      return true;
    }
  }
  if (Array.isArray(value)) return value.some(hasLoneSurrogate);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([key, each]) => hasLoneSurrogate(key) || hasLoneSurrogate(each),
    );
  }
  return false;
}
