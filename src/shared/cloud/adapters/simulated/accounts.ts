// SPDX-License-Identifier: MIT
// The simulated cloud's signing in, sessions, account and identities (the app API, Signing in,
// The account and Development), as ai-cloud's accounts service and routes do them.
import { checked, ProtocolError } from '@/src/shared/protocols';

import { ACCESS_TOKEN_TYPE, REFRESH, TOKEN_EXCHANGE } from '../../http';
import type { CloudResponse } from '../../transport';
import {
  accountOf,
  authenticate,
  IdTokenRefused,
  limitRate,
  page,
  pageRequest,
  recentSignIn,
  verify,
  type Context,
  type Principal,
} from './context';
import { removeFromHomes } from './homes';
import {
  DISPLAY_NAME_MAX,
  etag,
  etagMatches,
  hasControlCharacters,
  instant,
  MAX_IDENTITIES,
  newToken,
  sorted,
  uuid,
  type Account,
  type Identity,
  type IdTokenClaims,
  type Session,
} from './model';
import {
  checkedForm,
  empty,
  json,
  oauthError,
  problem,
  tagged,
  typed,
  type Incoming,
} from './wire';

// The one phone the simulated cloud serves: every nonce counts against it (SEC-15).
const PHONE = 'phone';

// Signing in.

export function issueNonce(context: Context): CloudResponse {
  limitRate(context, 'nonce', PHONE, context.settings.nonce_rate);
  const nonce = newToken(context.random);
  const lifetime = context.settings.nonce_lifetime;
  context.state.nonces.set(nonce, context.now + lifetime * 1000);
  return json({ nonce, expires_in: lifetime }, 201);
}

/** POST /app/token: an exchange, or a refresh. */
export function token(context: Context, request: Incoming): CloudResponse {
  const form = request.form();
  const grant = form.grant_type;
  if (grant === TOKEN_EXCHANGE) {
    const fields = checkedForm('token_exchange_request', form);
    const label = fields.session_label;
    if (label !== undefined && hasControlCharacters(label)) {
      throw oauthError('invalid_request', 'session_label: control characters');
    }
    checkClient(context, fields.client_id);
    return exchange(
      context,
      fields.subject_token,
      fields.client_id,
      label,
      fields.authorization_code,
    );
  }
  if (grant === REFRESH) {
    const fields = checkedForm('refresh_request', form);
    checkClient(context, fields.client_id);
    return refresh(context, fields.refresh_token, fields.client_id);
  }
  if (grant === undefined) {
    throw oauthError('invalid_request', 'grant_type is missing');
  }
  throw oauthError('unsupported_grant_type', 'this version has no such grant');
}

function exchange(
  context: Context,
  idToken: string,
  clientId: string,
  label: string | undefined,
  authorizationCode: string | undefined,
): CloudResponse {
  let claims: IdTokenClaims;
  try {
    claims = verify(context, idToken, authorizationCode);
  } catch (error) {
    if (error instanceof IdTokenRefused) throw oauthError('invalid_grant', error.message);
    throw error;
  }
  const { state, now } = context;
  const email = emailFor(claims.email);
  let account = state.accountOf(claims.provider, claims.subject);
  if (account === undefined) {
    const displayName = displayNameFor(claims);
    if (displayName === undefined) {
      throw oauthError('invalid_grant', 'the ID token gives neither a name nor an email');
    }
    account = {
      id: context.ids.next(),
      displayName,
      email,
      languages: [],
      identities: [identityOf(context, claims, email)],
      createTime: now,
      version: 1,
    };
    state.accounts.set(account.id, account);
  } else if (email !== undefined) {
    const identity = account.identities.find(
      (each) => each.provider === claims.provider && each.subject === claims.subject,
    );
    if (identity !== undefined) identity.email = email;
  }
  endIdleSessions(context, account.id);
  const session: Session = {
    id: context.ids.next(),
    accountId: account.id,
    clientId,
    label,
    createTime: now,
    lastUseTime: now,
  };
  state.sessions.set(session.id, session);
  return tokens(context, session, true);
}

function refresh(context: Context, refreshToken: string, clientId: string): CloudResponse {
  const { state, now } = context;
  const presented = state.refreshTokens.get(refreshToken);
  const session = presented && state.sessions.get(presented.sessionId);
  if (presented === undefined || session === undefined) {
    throw oauthError('invalid_grant', 'unknown refresh token');
  }
  if (session.clientId !== clientId) {
    throw oauthError('invalid_grant', 'the refresh token was issued to another client');
  }
  if (presented.used) {
    state.endSession(session.id);
    throw oauthError('invalid_grant', 'refresh token used twice: the session has ended');
  }
  if (session.lastUseTime <= now - context.settings.refresh_idle * 1000) {
    state.endSession(session.id);
    throw oauthError('invalid_grant', 'the session was left unused too long');
  }
  presented.used = true;
  session.lastUseTime = now;
  return tokens(context, session, false);
}

/** POST /app/revoke: the session of a refresh or access token ends; any other ends nothing. */
export function revoke(context: Context, request: Incoming): CloudResponse {
  const fields = checkedForm('revoke_request', request.form());
  checkClient(context, fields.client_id);
  const { state } = context;
  const refreshed = state.refreshTokens.get(fields.token);
  const accessed = state.accessTokens.get(fields.token);
  const sessionId = refreshed?.sessionId ?? accessed?.sessionId;
  const session = sessionId === undefined ? undefined : state.sessions.get(sessionId);
  if (session !== undefined && session.clientId === fields.client_id) {
    state.endSession(session.id);
  }
  return empty(200);
}

function checkClient(context: Context, clientId: string): void {
  if (!context.clientIds.includes(clientId)) {
    throw oauthError('invalid_client', 'unknown client', 401);
  }
}

function tokens(context: Context, session: Session, exchanged: boolean): CloudResponse {
  const refreshToken = newToken(context.random);
  context.state.refreshTokens.set(refreshToken, { sessionId: session.id, used: false });
  const accessToken = newToken(context.random);
  const lifetime = context.settings.access_lifetime;
  context.state.accessTokens.set(accessToken, {
    sessionId: session.id,
    accountId: session.accountId,
    clientId: session.clientId,
    expireTime: context.now + lifetime * 1000,
  });
  return json({
    access_token: accessToken,
    ...(exchanged ? { issued_token_type: ACCESS_TOKEN_TYPE } : {}),
    token_type: 'Bearer',
    expires_in: lifetime,
    refresh_token: refreshToken,
  });
}

function endIdleSessions(context: Context, accountId: string): void {
  const since = context.now - context.settings.refresh_idle * 1000;
  for (const session of [...context.state.sessions.values()]) {
    if (session.accountId === accountId && session.lastUseTime <= since) {
      context.state.endSession(session.id);
    }
  }
}

/** An email a provider gave, if the app API can carry it: the cloud keeps none it could not show. */
function emailFor(email: string | undefined): string | undefined {
  if (email === undefined) return undefined;
  try {
    return checked('email', email);
  } catch (error) {
    if (error instanceof ProtocolError) return undefined;
    throw error;
  }
}

/** The name an account starts with: the provider's, or else its email before the @. */
function displayNameFor(claims: IdTokenClaims): string | undefined {
  let name = [...(claims.name ?? '')].filter((character) => !hasControlCharacters(character));
  let text = name.join('').trim();
  if (text === '' && claims.email) {
    text = claims.email.split('@')[0].trim();
  }
  name = [...text].slice(0, DISPLAY_NAME_MAX);
  return name.length > 0 ? name.join('') : undefined;
}

function identityOf(context: Context, claims: IdTokenClaims, email: string | undefined): Identity {
  return {
    id: context.ids.next(),
    provider: claims.provider,
    subject: claims.subject,
    email,
    createTime: context.now,
  };
}

// The account.

export function readAccount(context: Context, request: Incoming): CloudResponse {
  return accountAnswer(accountOf(context, authenticate(context, request)));
}

export function changeAccount(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const changes = request.json('account_update');
  if (changes.display_name !== undefined && hasControlCharacters(changes.display_name)) {
    throw problem(400, 'display_name: control characters');
  }
  const account = accountOf(context, principal);
  const ifMatch = request.header('if-match');
  if (ifMatch !== undefined && !etagMatches(ifMatch, etag(account.version))) {
    throw problem(412, 'the account changed since that ETag');
  }
  account.displayName = changes.display_name ?? account.displayName;
  account.languages = changes.languages ?? account.languages;
  account.version += 1;
  return accountAnswer(account);
}

export function deleteAccount(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('id_token_request');
  const account = accountOf(context, principal);
  recentSignIn(context, account, body.id_token, body.authorization_code);
  removeFromHomes(context, account.id);
  for (const session of [...context.state.sessions.values()]) {
    if (session.accountId === account.id) context.state.endSession(session.id);
  }
  context.state.accounts.delete(account.id);
  return empty(204);
}

function accountAnswer(account: Account): CloudResponse {
  return tagged({
    id: account.id,
    display_name: account.displayName,
    ...(account.email === undefined ? {} : { email: account.email }),
    languages: account.languages,
    identities: account.identities.map(identityAnswer),
    create_time: instant(account.createTime),
    etag: etag(account.version),
  });
}

function identityAnswer(identity: Identity) {
  return {
    id: identity.id,
    provider: identity.provider,
    ...(identity.email === undefined ? {} : { email: identity.email }),
    create_time: instant(identity.createTime),
  };
}

// Identities.

export function linkIdentity(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('id_token_request');
  let claims: IdTokenClaims;
  try {
    claims = verify(context, body.id_token, body.authorization_code);
  } catch (error) {
    if (error instanceof IdTokenRefused) throw problem(403, error.message);
    throw error;
  }
  const account = accountOf(context, principal);
  const owner = context.state.accountOf(claims.provider, claims.subject);
  if (owner?.id === account.id) {
    throw typed('identity_linked', "the identity is this account's already");
  }
  if (owner !== undefined) {
    throw typed('identity_taken', "the identity is another account's");
  }
  if (account.identities.length >= MAX_IDENTITIES) {
    throw problem(409, `an account has ${MAX_IDENTITIES} identities at most`);
  }
  const identity = identityOf(context, claims, emailFor(claims.email));
  account.identities.push(identity);
  account.version += 1;
  return json(identityAnswer(identity), 201);
}

export function removeIdentity(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const identityId = uuid(id);
  const account = accountOf(context, principal);
  const index = account.identities.findIndex((identity) => identity.id === identityId);
  if (index < 0) {
    throw problem(404, 'no such identity in the account');
  }
  if (account.identities.length === 1) {
    throw typed('last_identity', "this is the account's only way to sign in");
  }
  account.identities.splice(index, 1);
  account.version += 1;
  return empty(204);
}

// Sessions.

export function listSessions(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const { size, after } = pageRequest(request);
  const since = context.now - context.settings.refresh_idle * 1000;
  const sessions = sorted(
    [...context.state.sessions.values()].filter(
      (session) => session.accountId === principal.accountId && session.lastUseTime > since,
    ),
  ).reverse();
  const shown = page(sessions, size, after, true);
  return json({
    sessions: shown.items.map((session) => sessionAnswer(session, principal)),
    next_page_token: shown.next,
  });
}

function sessionAnswer(session: Session, principal: Principal) {
  return {
    id: session.id,
    ...(session.label === undefined ? {} : { label: session.label }),
    create_time: instant(session.createTime),
    last_use_time: instant(session.lastUseTime),
    current: session.id === principal.sessionId,
  };
}

export function endSession(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const session = context.state.sessions.get(uuid(id) ?? '');
  if (session === undefined || session.accountId !== principal.accountId) {
    throw problem(404, 'no such session in the account');
  }
  context.state.endSession(session.id);
  return empty(204);
}

// Development: the simulated cloud is a development cloud, whose provider signs test people in
// without Google or Apple (the app API, Development).

export function developmentIdToken(context: Context, request: Incoming): CloudResponse {
  const body = request.json('development_id_token_request');
  const { display_name: name, email } = body;
  if (hasControlCharacters(name) || (email !== undefined && hasControlCharacters(email))) {
    throw problem(400, 'display_name or email: control characters');
  }
  // The same test person each time: their email decides, or their name without one.
  const subject = email === undefined ? name : email.toLowerCase();
  const idToken = issueIdToken(context, 'development', { subject, email, name }, body.nonce);
  return json({ id_token: idToken.idToken }, 201);
}

/** Who a provider says a person is. */
export interface Person {
  /** The provider's identifier for them: its ID tokens' `sub`. */
  subject: string;
  email?: string;
  name?: string;
}

/** What a provider gives the app when a person signs in. */
export interface ProviderSignIn {
  idToken: string;
  /** Apple's only. */
  authorizationCode?: string;
}

/** An ID token of one of the simulated providers, carrying `nonce`. */
export function issueIdToken(
  context: Context,
  provider: IdTokenClaims['provider'],
  person: Person,
  nonce: string,
): ProviderSignIn {
  const idToken = newToken(context.random);
  const authorizationCode = provider === 'apple' ? newToken(context.random) : undefined;
  context.state.idTokens.set(idToken, {
    provider,
    subject: person.subject,
    email: person.email,
    name: person.name,
    nonce,
    issueTime: context.now,
    expireTime: context.now + context.settings.id_token_lifetime * 1000,
    authorizationCode,
  });
  return { idToken, authorizationCode };
}
