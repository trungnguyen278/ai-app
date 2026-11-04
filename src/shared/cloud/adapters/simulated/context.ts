// SPDX-License-Identifier: MIT
// What every endpoint of the simulated cloud shares: what it keeps and knows, who a request
// speaks for, the ID tokens people sign in with, pages, and limits on rates.
import type { Rate, SimulatedSettings } from '../../settings';
import {
  pageAfter,
  pageToken,
  type Account,
  type IdTokenClaims,
  type Random,
  type State,
  type Uuids,
} from './model';
import { problem, typed, unauthenticated, type Incoming } from './wire';

/** The simulated cloud, as one request finds it. */
export interface Context {
  readonly state: State;
  readonly settings: SimulatedSettings;
  /** The OAuth client IDs of the apps that may sign in. */
  readonly clientIds: readonly string[];
  readonly random: Random;
  readonly ids: Uuids;
  /** When the request is served, in milliseconds. */
  readonly now: number;
}

/** Who a request's access token speaks for: an account, in one of its sessions. */
export interface Principal {
  readonly accountId: string;
  readonly sessionId: string;
}

// Fixed by the app API (README, Sessions): page sizes.
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

/** An ID token that does not verify, or not for this. */
export class IdTokenRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'IdTokenRefused';
  }
}

/** The account and session that the request's access token speaks for: 401 if none. */
export function authenticate(context: Context, request: Incoming): Principal {
  const header = request.header('authorization') ?? '';
  const match = /^bearer +([^ ]+)$/i.exec(header);
  const access = match === null ? undefined : context.state.accessTokens.get(match[1]);
  if (access === undefined || access.expireTime <= context.now) {
    throw unauthenticated('the access token is missing, unknown or expired');
  }
  const session = context.state.sessions.get(access.sessionId);
  if (session === undefined || session.accountId !== access.accountId) {
    throw unauthenticated('the session has ended');
  }
  if (!context.state.accounts.has(access.accountId)) {
    throw unauthenticated('the account no longer exists');
  }
  return { accountId: access.accountId, sessionId: access.sessionId };
}

/** The account that a request speaks for. */
export function accountOf(context: Context, principal: Principal): Account {
  const account = context.state.accounts.get(principal.accountId);
  if (account === undefined) throw unauthenticated('the account no longer exists');
  return account;
}

/**
 * A provider's ID token, verified, and its nonce used: one the cloud issued, unexpired and
 * unused. Apple's needs the authorization code that came with it.
 */
export function verify(
  context: Context,
  idToken: string,
  authorizationCode?: string,
): IdTokenClaims {
  const claims = context.state.idTokens.get(idToken);
  if (claims === undefined || claims.expireTime <= context.now) {
    throw new IdTokenRefused('the ID token does not verify, or has expired');
  }
  if (claims.provider === 'apple' && authorizationCode !== claims.authorizationCode) {
    throw new IdTokenRefused('Apple refuses the authorization code');
  }
  const expiry = context.state.nonces.get(claims.nonce);
  context.state.nonces.delete(claims.nonce);
  if (expiry === undefined || expiry <= context.now) {
    throw new IdTokenRefused("the ID token's nonce is unknown, used or expired");
  }
  return claims;
}

/**
 * An ID token for what a phone left unlocked must not be enough for (the app API, Deleting
 * it): it verifies, it was issued within `recent_sign_in`, and it is one of the account's
 * identities. 403 `recent_sign_in_required` otherwise.
 */
export function recentSignIn(
  context: Context,
  account: Account,
  idToken: string,
  authorizationCode?: string,
): IdTokenClaims {
  let claims: IdTokenClaims;
  try {
    claims = verify(context, idToken, authorizationCode);
  } catch (error) {
    if (error instanceof IdTokenRefused) throw typed('recent_sign_in_required', error.message);
    throw error;
  }
  if (context.now - claims.issueTime > context.settings.recent_sign_in * 1000) {
    throw typed('recent_sign_in_required', 'the ID token was issued too long ago');
  }
  const identity = account.identities.find(
    (each) => each.provider === claims.provider && each.subject === claims.subject,
  );
  if (identity === undefined) {
    throw typed('recent_sign_in_required', "the ID token is not one of the account's identities");
  }
  return claims;
}

/** The page that a request to a list asks for: its size, and the item it starts after. */
export function pageRequest(request: Incoming): { size: number; after?: string } {
  const text = request.query.get('page_size');
  let size = PAGE_SIZE_DEFAULT;
  if (text !== undefined) {
    size = /^[0-9]+$/.test(text) ? Number(text) : 0;
    if (size < 1 || size > PAGE_SIZE_MAX) {
      throw problem(400, `page_size must be from 1 to ${PAGE_SIZE_MAX}`);
    }
  }
  const token = request.query.get('page_token');
  if (!token) return { size };
  const after = pageAfter(token);
  if (after === null) throw problem(400, 'the page token is not one this list gave');
  return { size, after };
}

/** The page of `items`, in their order, that starts after `after` and holds `size`. */
export function page<T extends { id: string }>(
  items: T[],
  size: number,
  after: string | undefined,
  newestFirst = false,
): { items: T[]; next: string } {
  const rest =
    after === undefined
      ? items
      : items.filter((item) => (newestFirst ? item.id < after : item.id > after));
  const shown = rest.slice(0, size);
  return { items: shown, next: rest.length > size ? pageToken(shown[shown.length - 1].id) : '' };
}

/** 429, with how long to wait, if `subject` has had its share of `rate`; else counts it. */
export function limitRate(context: Context, name: string, subject: string, rate: Rate): void {
  const key = `${name}\n${subject}`;
  const period = rate.period * 1000;
  const times = (context.state.asked.get(key) ?? []).filter((time) => time > context.now - period);
  if (times.length >= rate.limit) {
    const wait = Math.ceil((times[0] + period - context.now) / 1000);
    context.state.asked.set(key, times);
    throw problem(429, 'too many requests', { 'retry-after': String(Math.max(1, wait)) });
  }
  times.push(context.now);
  context.state.asked.set(key, times);
}
