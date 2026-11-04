// SPDX-License-Identifier: MIT
// What the app API's requests and answers look like on the wire (the app API, The cloud's
// address and Requests), for the client and the simulated cloud alike.

/** Fixed by the app API (README, The cloud's address). */
export const API = '/app/v1';
export const TOKEN_PATH = '/app/token';
export const REVOKE_PATH = '/app/revoke';

export const JSON_TYPE = 'application/json';
/** Problem Details (RFC 9457, 3). */
export const PROBLEM_TYPE = 'application/problem+json';
/** The OAuth endpoints' bodies (RFC 6749, 4.1.3). */
export const FORM_TYPE = 'application/x-www-form-urlencoded';

/** The grants and token types of the token endpoint (the app API, The exchange). */
export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'; // RFC 8693, 2.1
export const REFRESH = 'refresh_token'; // RFC 6749, 6
export const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token'; // RFC 8693, 3
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'; // RFC 8693, 3
export const REFRESH_TOKEN_HINT = 'refresh_token'; // RFC 7009, 2.1

/** Fields of a form or a query; one that is undefined is left out. */
export type Fields = Readonly<Record<string, string | number | undefined>>;

/**
 * `fields` as application/x-www-form-urlencoded, as the WHATWG URL Standard serializes it:
 * every byte but letters, digits and `*-._` is percent-encoded, and a space is `+`.
 */
export function formEncode(fields: Fields): string {
  return Object.entries(fields)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${formComponent(name)}=${formComponent(String(value))}`)
    .join('&');
}

function formComponent(text: string): string {
  return encodeURIComponent(text)
    .replace(/[!'()~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

/**
 * The fields of an application/x-www-form-urlencoded `text`, in order; `null` if it is not one:
 * a field without `=`, or a broken percent-encoding.
 */
export function formDecode(text: string): [string, string][] | null {
  if (text === '') {
    return [];
  }
  const fields: [string, string][] = [];
  for (const field of text.split('&')) {
    const equals = field.indexOf('=');
    if (equals < 0) {
      return null;
    }
    try {
      fields.push([
        decodeComponent(field.slice(0, equals)),
        decodeComponent(field.slice(equals + 1)),
      ]);
    } catch {
      return null;
    }
  }
  return fields;
}

function decodeComponent(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, ' '));
}

/** `path`, with `fields` as its query if any are defined. */
export function withQuery(path: string, fields: Fields = {}): string {
  const query = formEncode(fields);
  return query === '' ? path : `${path}?${query}`;
}

/** An `Idempotency-Key` header field's value: the key, as a quoted string (the app API). */
export function quoted(key: string): string {
  return `"${key}"`;
}

/** `Authorization`'s value for an access token (RFC 6750, 2.1). */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}

/**
 * The seconds that a `Retry-After` value asks to wait, as of `now` in milliseconds: a number of
 * seconds, or a date (RFC 9110, 10.2.3); `undefined` for neither.
 */
export function retryAfter(value: string | undefined, now: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = value.trim();
  if (/^[0-9]+$/.test(text)) {
    return Number(text);
  }
  const date = Date.parse(text);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000));
}

/** The media type of a `Content-Type` value, without its parameters, in lower case. */
export function mediaType(value: string | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase();
}
