// SPDX-License-Identifier: MIT
// The one client of the app API (ADR-0004, decision 2), over its transport (decision 3):
// `SignInClient` for what needs no sign-in, and `CloudClient` for what a person signed in does,
// with the access token that their session gives. The session belongs to `account`.
import { randomUUID } from 'expo-crypto';

import type { App, AppDefinition } from '@/src/shared/protocols';

import { ABOUT_BLANK, Refused, SignedOut } from './errors';
import { exchange, type Answer, type Call } from './exchange';
import {
  API,
  ID_TOKEN_TYPE,
  REFRESH,
  REFRESH_TOKEN_HINT,
  REVOKE_PATH,
  TOKEN_EXCHANGE,
  TOKEN_PATH,
} from './http';
import type { CloudSettings } from './settings';
import { Unreachable, type Transport } from './transport';

/** A page of a list to ask for: the first, or the one a page's token names. */
export interface PageRequest {
  pageToken?: string;
  /** From 1 to 50; the configuration's `page_size` when absent. */
  pageSize?: number;
}

/** An ID token just signed in, with Apple's authorization code if it is Apple's. */
export interface FreshSignIn {
  idToken: string;
  authorizationCode?: string;
}

/** What the token exchange takes besides the ID token (the app API, The exchange). */
export interface ExchangeOptions {
  /** What the person sees in the list of their sessions, such as the phone's model. */
  sessionLabel?: string;
  /** Apple's, with Apple's ID token. */
  authorizationCode?: string;
}

/** What the client takes from its surroundings, which tests replace. */
export interface ClientOptions {
  /** A new Idempotency-Key: a random UUID. */
  newKey?: () => string;
  /** Waits `seconds`. */
  sleep?: (seconds: number) => Promise<void>;
  /** The time, in milliseconds since 1970. */
  clock?: () => number;
}

/** The app API's endpoints that need no sign-in: signing in, refreshing, signing out. */
export class SignInClient {
  private readonly clock: () => number;

  constructor(
    private readonly transport: Transport,
    private readonly settings: CloudSettings,
    options: ClientOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
  }

  /** A nonce, for the provider to put in its ID token (the app API, The nonce). */
  async nonce(): Promise<App.NonceResponse> {
    return this.body({
      operation: 'nonce',
      method: 'POST',
      path: `${API}/nonces`,
      success: [201],
      answer: 'nonce_response',
    });
  }

  /** A session's first tokens, for a provider's ID token (the app API, The exchange). */
  async exchange(idToken: string, options: ExchangeOptions = {}): Promise<App.TokenResponse> {
    return this.body({
      operation: 'exchange',
      method: 'POST',
      path: TOKEN_PATH,
      form: {
        grant_type: TOKEN_EXCHANGE,
        subject_token: idToken,
        subject_token_type: ID_TOKEN_TYPE,
        client_id: this.settings.client_id,
        session_label: options.sessionLabel,
        authorization_code: options.authorizationCode,
      },
      oauth: true,
      success: [200],
      answer: 'token_response',
    });
  }

  /** A session's next tokens: the refresh token given works only once (the app API, Refreshing). */
  async refresh(refreshToken: string): Promise<App.TokenResponse> {
    return this.body({
      operation: 'refresh',
      method: 'POST',
      path: TOKEN_PATH,
      form: {
        grant_type: REFRESH,
        refresh_token: refreshToken,
        client_id: this.settings.client_id,
      },
      oauth: true,
      success: [200],
      answer: 'token_response',
    });
  }

  /** End the session of a refresh token (the app API, Signing out). */
  async revoke(refreshToken: string): Promise<void> {
    await this.body({
      operation: 'revoke',
      method: 'POST',
      path: REVOKE_PATH,
      form: {
        token: refreshToken,
        token_type_hint: REFRESH_TOKEN_HINT,
        client_id: this.settings.client_id,
      },
      oauth: true,
      success: [200],
      answer: null,
    });
  }

  /** An ID token of the development provider, which signs test people in without Google or
   *  Apple: in a development cloud only (the app API, Development). */
  async developmentIdToken(person: App.DevelopmentIdTokenRequest): Promise<string> {
    const { id_token: idToken } = await this.body({
      operation: 'developmentIdToken',
      method: 'POST',
      path: `${API}/development/id-tokens`,
      json: person,
      success: [201],
      answer: 'development_id_token_response',
    });
    return idToken;
  }

  private async body<K extends AppDefinition | null>(call: Call<K>) {
    return (await exchange(this.transport, call, this.clock)).body;
  }
}

/** Who the API's requests speak for: the session of the person signed in (`account`'s). */
export interface Credentials {
  /** The access token for the next request; null when nobody is signed in. */
  accessToken(): Promise<string | null>;
  /**
   * A new access token, after the cloud refused `refused` with 401; null if the session has
   * ended. Whoever asks, one refresh at a time (ADR-0004, decision 4).
   */
  renew(refused: string): Promise<string | null>;
}

/** The app API's endpoints for a person signed in: their account, sessions and homes. */
export class CloudClient {
  private readonly newKey: () => string;
  private readonly sleep: (seconds: number) => Promise<void>;
  private readonly clock: () => number;

  constructor(
    private readonly transport: Transport,
    private readonly settings: CloudSettings,
    private readonly credentials: Credentials,
    options: ClientOptions = {},
  ) {
    this.newKey = options.newKey ?? randomUUID;
    this.sleep = options.sleep ?? wait;
    this.clock = options.clock ?? Date.now;
  }

  // The account.

  async account(): Promise<App.Account> {
    return this.body({ ...read('account', '/account'), answer: 'account' });
  }

  /** Change the account, if nobody changed it since `etag`: 412 otherwise. */
  async updateAccount(changes: App.AccountUpdate, etag: string): Promise<App.Account> {
    return this.body({
      operation: 'updateAccount',
      method: 'PATCH',
      path: `${API}/account`,
      json: changes,
      ifMatch: etag,
      success: [200],
      answer: 'account',
    });
  }

  /** Delete the account, with everything that is the person's, after a fresh sign-in. */
  async deleteAccount(signIn: FreshSignIn): Promise<void> {
    await this.body({
      operation: 'deleteAccount',
      method: 'POST',
      path: `${API}/account:delete`,
      json: idTokenRequest(signIn),
      success: [204],
      answer: null,
    });
  }

  /** Link another provider's identity, from a fresh sign-in with it. */
  async linkIdentity(signIn: FreshSignIn): Promise<App.Identity> {
    return this.body({
      operation: 'linkIdentity',
      method: 'POST',
      path: `${API}/account/identities`,
      json: idTokenRequest(signIn),
      success: [201],
      answer: 'identity',
    });
  }

  async removeIdentity(identityId: string): Promise<void> {
    await this.body(remove('removeIdentity', `/account/identities/${segment(identityId)}`));
  }

  async sessions(page: PageRequest = {}): Promise<App.SessionList> {
    return this.body({
      ...this.list('sessions', '/account/sessions', page),
      answer: 'session_list',
    });
  }

  async endSession(sessionId: string): Promise<void> {
    await this.body(remove('endSession', `/account/sessions/${segment(sessionId)}`));
  }

  // Homes.

  async homes(page: PageRequest = {}): Promise<App.HomeList> {
    return this.body({ ...this.list('homes', '/homes', page), answer: 'home_list' });
  }

  /** Create a home, whose owner is the person signed in. */
  async createHome(home: App.HomeCreate): Promise<App.Home> {
    return this.body({
      operation: 'createHome',
      method: 'POST',
      path: `${API}/homes`,
      json: home,
      key: this.newKey(),
      success: [201],
      answer: 'home',
    });
  }

  async home(homeId: string): Promise<App.Home> {
    return this.body({ ...read('home', `/homes/${segment(homeId)}`), answer: 'home' });
  }

  /** Change a home, if nobody changed it since `etag`: 412 otherwise. */
  async updateHome(homeId: string, changes: App.HomeUpdate, etag: string): Promise<App.Home> {
    return this.body({
      operation: 'updateHome',
      method: 'PATCH',
      path: `${API}/homes/${segment(homeId)}`,
      json: changes,
      ifMatch: etag,
      success: [200],
      answer: 'home',
    });
  }

  /** Hand a home over to another person in it with an account, after a fresh sign-in. */
  async transferHome(homeId: string, toMemberId: string, signIn: FreshSignIn): Promise<App.Home> {
    return this.body({
      operation: 'transferHome',
      method: 'POST',
      path: `${API}/homes/${segment(homeId)}:transfer`,
      json: { to_member_id: toMemberId, id_token: signIn.idToken },
      success: [200],
      answer: 'home',
    });
  }

  /** Delete a home, with all it holds, after a fresh sign-in. */
  async deleteHome(homeId: string, signIn: FreshSignIn): Promise<void> {
    await this.body({
      operation: 'deleteHome',
      method: 'POST',
      path: `${API}/homes/${segment(homeId)}:delete`,
      json: idTokenRequest(signIn),
      success: [204],
      answer: null,
    });
  }

  // The people in a home.

  async members(homeId: string, page: PageRequest = {}): Promise<App.MemberList> {
    const path = `/homes/${segment(homeId)}/members`;
    return this.body({ ...this.list('members', path, page), answer: 'member_list' });
  }

  /** Add a profile: a person who never signs in. */
  async addProfile(homeId: string, displayName: string): Promise<App.Member> {
    return this.body({
      operation: 'addProfile',
      method: 'POST',
      path: `${API}/homes/${segment(homeId)}/members`,
      json: { display_name: displayName },
      key: this.newKey(),
      success: [201],
      answer: 'member',
    });
  }

  /** Change a person, if nobody changed them since `etag`: 412 otherwise. */
  async updateMember(
    homeId: string,
    memberId: string,
    changes: App.MemberUpdate,
    etag: string,
  ): Promise<App.Member> {
    return this.body({
      operation: 'updateMember',
      method: 'PATCH',
      path: `${API}/homes/${segment(homeId)}/members/${segment(memberId)}`,
      json: changes,
      ifMatch: etag,
      success: [200],
      answer: 'member',
    });
  }

  /** Remove a person; the person signed in leaves, if it is them. */
  async removeMember(homeId: string, memberId: string): Promise<void> {
    const path = `/homes/${segment(homeId)}/members/${segment(memberId)}`;
    await this.body(remove('removeMember', path));
  }

  // Invitations.

  /** An invitation, whose code this answer is the only one to carry. */
  async createInvitation(homeId: string): Promise<App.Invitation> {
    return this.body({
      operation: 'createInvitation',
      method: 'POST',
      path: `${API}/homes/${segment(homeId)}/invitations`,
      success: [201],
      answer: 'invitation',
    });
  }

  async invitations(homeId: string, page: PageRequest = {}): Promise<App.InvitationList> {
    const path = `/homes/${segment(homeId)}/invitations`;
    return this.body({ ...this.list('invitations', path, page), answer: 'invitation_list' });
  }

  async revokeInvitation(homeId: string, invitationId: string): Promise<void> {
    const path = `/homes/${segment(homeId)}/invitations/${segment(invitationId)}`;
    await this.body(remove('revokeInvitation', path));
  }

  /** What a person sees of an invitation before they agree. The code goes in the body, never
   *  in a URL, to stay out of logs. */
  async lookUpInvitation(code: string): Promise<App.InvitationPreview> {
    return this.body({
      operation: 'lookUpInvitation',
      method: 'POST',
      path: `${API}/invitations:lookup`,
      json: { code },
      success: [200],
      answer: 'invitation_preview',
    });
  }

  /** Join the home of an invitation; `joined` is false when the person was in it already. */
  async acceptInvitation(code: string): Promise<{ home: App.Home; joined: boolean }> {
    const { status, body } = await this.send({
      operation: 'acceptInvitation',
      method: 'POST',
      path: `${API}/invitations:accept`,
      json: { code },
      success: [200, 201],
      answer: 'home',
    });
    return { home: body, joined: status === 201 };
  }

  // How every request goes.

  private list(operation: string, path: string, page: PageRequest) {
    return {
      ...read(operation, path),
      query: {
        page_size: page.pageSize ?? this.settings.page_size,
        page_token: page.pageToken || undefined,
      },
    };
  }

  private async body<K extends AppDefinition | null>(call: Omit<Call<K>, 'bearer'>) {
    return (await this.send(call)).body;
  }

  /**
   * Send `call` with the session's access token. A 401 renews the token once, and sends the
   * call again with it; a session that has ended is `SignedOut`.
   */
  private async send<K extends AppDefinition | null>(
    call: Omit<Call<K>, 'bearer'>,
  ): Promise<Answer<K>> {
    const token = await this.credentials.accessToken();
    if (token === null) {
      throw new SignedOut(call.operation);
    }
    try {
      return await this.sent({ ...call, bearer: token });
    } catch (error) {
      if (!(error instanceof Refused) || error.status !== 401) throw error;
    }
    const renewed = await this.credentials.renew(token);
    if (renewed === null) {
      throw new SignedOut(call.operation);
    }
    return this.sent({ ...call, bearer: renewed });
  }

  /**
   * Send `call`. One with an Idempotency-Key, which the protocol makes safe to repeat, is sent
   * again with the same key when no answer came, or when its first copy still runs (409
   * about:blank), up to `retries` times, waiting twice as long each time.
   */
  private async sent<K extends AppDefinition | null>(call: Call<K>): Promise<Answer<K>> {
    let delay = this.settings.retry_delay;
    for (let attempt = 0; ; attempt++) {
      try {
        return await exchange(this.transport, call, this.clock);
      } catch (error) {
        const busy = error instanceof Refused && error.status === 409 && error.type === ABOUT_BLANK;
        const repeatable = call.key !== undefined && (busy || error instanceof Unreachable);
        if (!repeatable || attempt >= this.settings.retries) throw error;
      }
      await this.sleep(delay);
      delay *= 2;
    }
  }
}

function read(operation: string, path: string) {
  return { operation, method: 'GET' as const, path: `${API}${path}`, success: [200] };
}

function remove(operation: string, path: string): Omit<Call<null>, 'bearer'> {
  return { operation, method: 'DELETE', path: `${API}${path}`, success: [204], answer: null };
}

function idTokenRequest(signIn: FreshSignIn): App.IdTokenRequest {
  return signIn.authorizationCode === undefined
    ? { id_token: signIn.idToken }
    : { id_token: signIn.idToken, authorization_code: signIn.authorizationCode };
}

/** An identifier, as one segment of a path. */
function segment(id: string): string {
  return encodeURIComponent(id);
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
