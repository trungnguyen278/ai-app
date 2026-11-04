// SPDX-License-Identifier: MIT
// What the simulated cloud keeps, in memory, and what it makes up: the app API's accounts,
// sessions, homes and invitations (the app API, README), as ai-cloud keeps them.
import { getRandomValues } from 'expo-crypto';

/** Random bytes, from a cryptographic source. */
export type Random = (count: number) => Uint8Array;
export const cryptoRandom: Random = (count) => getRandomValues(new Uint8Array(count));

/** Milliseconds since 1970, as `Date.now` counts them. */
export type Clock = () => number;

// Random bytes in a nonce, a refresh token and an invitation's code (the app API's
// $defs/nonce and $defs/invitation_code), and, as ai-cloud's, in an access token.
export const TOKEN_BYTES = 32;
// Fixed by the app API's schema: $defs/account, identities' maxItems.
export const MAX_IDENTITIES = 16;
// $defs/display_name, maxLength.
export const DISPLAY_NAME_MAX = 100;

/** The providers that sign people in (the app API's $defs/provider). */
export type Provider = 'google' | 'apple' | 'development';

/** Roles in a home (the app API, What each role may do). */
export type Role = 'owner' | 'admin' | 'member';

export interface Identity {
  id: string;
  provider: Provider;
  /** The provider's identifier for the person: its ID tokens' `sub`. */
  subject: string;
  email?: string;
  createTime: number;
}

export interface Account {
  id: string;
  displayName: string;
  email?: string;
  languages: string[];
  identities: Identity[];
  createTime: number;
  /** Raised by every change, the identities' included: it makes the ETag. */
  version: number;
}

export interface Session {
  id: string;
  accountId: string;
  clientId: string;
  label?: string;
  createTime: number;
  lastUseTime: number;
}

/**
 * A refresh token: one session's, which works once, but for a retry after a lost answer
 * (the app API 1.3, ai-platform ADR-0011).
 */
export interface RefreshToken {
  sessionId: string;
  /** When it was exchanged for the next one; none while it is the session's current one. */
  useTime?: number;
  /** The token it replaced, which may refresh again for a while; none for a session's first. */
  replaces?: string;
}

export interface AccessToken {
  sessionId: string;
  accountId: string;
  clientId: string;
  expireTime: number;
}

/** What one of the simulated providers' ID tokens says. */
export interface IdTokenClaims {
  provider: Provider;
  subject: string;
  email?: string;
  name?: string;
  nonce: string;
  issueTime: number;
  expireTime: number;
  /** Sign in with Apple's authorization code, which comes with Apple's ID token only. */
  authorizationCode?: string;
}

export interface Home {
  id: string;
  name: string;
  timeZone: string;
  languages: string[];
  createTime: number;
  /** Raised by a change to the fields above, and by handing the home over. */
  version: number;
}

export interface Member {
  id: string;
  homeId: string;
  /** None for a profile, who never signs in. */
  accountId?: string;
  displayName: string;
  /** None for a profile. */
  role?: Role;
  createTime: number;
  version: number;
}

export interface Invitation {
  id: string;
  homeId: string;
  code: string;
  /** The member who made it. */
  invitedBy: string;
  invitedByName: string;
  createTime: number;
  expireTime: number;
  /** The member it brought in. */
  usedBy?: string;
}

/** The first answer to a request with an Idempotency-Key, for its retries. */
export interface FirstAnswer {
  fingerprint: string;
  status: number;
  body: unknown;
  /** The member it made: the answer goes with them. */
  memberId: string;
  createTime: number;
}

/** Everything the simulated cloud keeps. */
export class State {
  readonly accounts = new Map<string, Account>();
  readonly sessions = new Map<string, Session>();
  readonly refreshTokens = new Map<string, RefreshToken>();
  readonly accessTokens = new Map<string, AccessToken>();
  /** Nonces, and when they expire. */
  readonly nonces = new Map<string, number>();
  readonly idTokens = new Map<string, IdTokenClaims>();
  readonly homes = new Map<string, Home>();
  readonly members = new Map<string, Member>();
  readonly invitations = new Map<string, Invitation>();
  /** By account, then key. */
  readonly firstAnswers = new Map<string, FirstAnswer>();
  /** The keys of the requests that still run, by account, then key. */
  readonly running = new Set<string>();
  /** When each subject of each rate asked, by rate, then subject. */
  readonly asked = new Map<string, number[]>();

  /** The account whose identity this is, if any. */
  accountOf(provider: Provider, subject: string): Account | undefined {
    for (const account of this.accounts.values()) {
      if (
        account.identities.some((each) => each.provider === provider && each.subject === subject)
      ) {
        return account;
      }
    }
    return undefined;
  }

  /** End a session: its refresh tokens stop working, and its access tokens at once. */
  endSession(sessionId: string): boolean {
    for (const [token, refresh] of this.refreshTokens) {
      if (refresh.sessionId === sessionId) this.refreshTokens.delete(token);
    }
    for (const [token, access] of this.accessTokens) {
      if (access.sessionId === sessionId) this.accessTokens.delete(token);
    }
    return this.sessions.delete(sessionId);
  }

  /** The member who is `accountId` in the home, if they are in it. */
  memberOf(homeId: string, accountId: string): Member | undefined {
    for (const member of this.members.values()) {
      if (member.homeId === homeId && member.accountId === accountId) return member;
    }
    return undefined;
  }

  /** The home's people, oldest first. */
  membersOf(homeId: string): Member[] {
    return sorted([...this.members.values()].filter((member) => member.homeId === homeId));
  }

  /** Remove a person from their home, with the invitations they made or used, and what was
   *  theirs there. */
  deleteMember(memberId: string): void {
    this.members.delete(memberId);
    for (const [id, invitation] of this.invitations) {
      if (invitation.invitedBy === memberId || invitation.usedBy === memberId) {
        this.invitations.delete(id);
      }
    }
    for (const [key, answer] of this.firstAnswers) {
      if (answer.memberId === memberId) this.firstAnswers.delete(key);
    }
  }

  /** Delete a home, with its people and its invitations. */
  deleteHome(homeId: string): void {
    for (const member of this.membersOf(homeId)) {
      this.deleteMember(member.id);
    }
    this.homes.delete(homeId);
  }
}

/** `items`, oldest first: their identifiers are UUIDv7s, which sort as they were made. */
export function sorted<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** `bytes` in base64url, without padding (RFC 4648, 5). */
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
    for (let position = 0; position < characters; position++) {
      text += BASE64URL[(chunk >> (18 - 6 * position)) & 63];
    }
  }
  return text;
}

/** The bytes of base64url `text` without padding; `null` if it is not that. */
export function fromBase64url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = BASE64URL.indexOf(character);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

/** A token of random bytes, as ai-cloud makes its nonces, tokens and codes. */
export function newToken(random: Random): string {
  return base64url(random(TOKEN_BYTES));
}

/**
 * UUIDv7s (RFC 9562, 5.7) with a counter after the time (6.2, method 1), so that those made
 * in one millisecond keep their order, as ai-cloud's do.
 */
export class Uuids {
  private time = -1;
  private counter = 0;

  constructor(
    private readonly random: Random,
    private readonly clock: Clock,
  ) {}

  next(): string {
    const now = this.clock();
    if (now > this.time) {
      this.time = now;
      this.counter = 0;
    } else if (++this.counter > 0xfff) {
      this.time += 1;
      this.counter = 0;
    }
    const bytes = this.random(16);
    for (let index = 0; index < 6; index++) {
      bytes[index] = Math.floor(this.time / 2 ** (8 * (5 - index))) & 255;
    }
    bytes[6] = 0x70 | (this.counter >> 8);
    bytes[7] = this.counter & 255;
    bytes[8] = 0x80 | (bytes[8] & 0x3f);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `text` as a UUID in lower case, as the cloud writes them; `null` if it is none. */
export function uuid(text: string): string | null {
  const lower = text.toLowerCase();
  return UUID.test(lower) ? lower : null;
}

/** A page token: the last item's identifier, as ai-cloud writes it (base64url of its bytes). */
export function pageToken(id: string): string {
  const hex = id.replace(/-/g, '');
  return base64url(
    Uint8Array.from({ length: 16 }, (_, index) =>
      parseInt(hex.slice(2 * index, 2 * index + 2), 16),
    ),
  );
}

/** The identifier a page token names; `null` if no list gave it. */
export function pageAfter(token: string): string | null {
  const bytes = fromBase64url(token);
  if (bytes === null || bytes.length !== 16) return null;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** RFC 3339, in UTC, to the second, as ai-cloud writes an instant. */
export function instant(time: number): string {
  return new Date(time).toISOString().replace(/\.[0-9]{3}Z$/, 'Z');
}

/** A weak ETag of a version, as ai-cloud makes them. */
export function etag(version: number): string {
  return `W/"${version}"`;
}

/** Whether `ifMatch` names `tag`, or any (`*`): ETags are compared as the cloud gives them. */
export function etagMatches(ifMatch: string, tag: string): boolean {
  return ifMatch.split(',').some((candidate) => ['*', tag].includes(candidate.trim()));
}

/** Whether `text` holds a control character (Unicode's Cc): U+0000–U+001F, U+007F–U+009F. */
export function hasControlCharacters(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
