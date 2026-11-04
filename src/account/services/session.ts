// SPDX-License-Identifier: MIT
// The session of the person signed in (ADR-0004, decision 4), which is the cloud client's
// credentials: the refresh token in secure storage, the access token in memory only, one
// refresh at a time whoever asks, and the end of the session when the cloud refuses its token.
import {
  INVALID_GRANT,
  OAuthRefused,
  Unreachable,
  type Credentials,
  type SignInClient,
} from '@/src/shared/cloud';
import type { SessionSettings } from '@/src/shared/config';
import type { App } from '@/src/shared/protocols';

import type { SignInProvider } from '../ports/providers';
import type { Secrets } from '../ports/secrets';

/**
 * The refresh token's name in secure storage: one for each cloud, so that a build moved to
 * another never presents one cloud's token to the next. expo-secure-store takes letters,
 * digits, `.`, `-` and `_` in a name.
 */
export function refreshTokenName(address: string): string {
  return `session.${address.replace(/[^\w.-]/g, '_')}`;
}

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn';

export interface SessionState {
  status: SessionStatus;
  /** Whether the cloud ended the last session, rather than the person: the sign-in screen says so. */
  ended: boolean;
}

export interface SessionOptions {
  /** The refresh token's name in secure storage (`refreshTokenName`). */
  storeAs: string;
  /** What the person sees in the list of their sessions: the phone's model. */
  label?: string;
  /** Told when a session ends, so that what the cloud gave for it is forgotten. */
  onEnd?: () => void;
  /** The time, in milliseconds since 1970. */
  clock?: () => number;
}

export class Session implements Credentials {
  private state: SessionState = { status: 'restoring', ended: false };
  private refreshToken: string | null = null;
  private access: { token: string; expireTime: number } | null = null;
  private refreshing: { generation: number; token: Promise<string | null> } | null = null;
  /** Raised as a session starts or ends, so that work begun before changes nothing after. */
  private generation = 0;
  /** The storage's work, one step after the other, in the order it was asked for. */
  private stored: Promise<unknown> = Promise.resolve();
  /** Restoring the session kept from before: once, whoever asks first. */
  private restored: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly clock: () => number;

  constructor(
    private readonly client: SignInClient,
    private readonly secrets: Secrets,
    private readonly settings: SessionSettings,
    private readonly options: SessionOptions,
  ) {
    this.clock = options.clock ?? Date.now;
  }

  /** The state now. It is replaced, never changed, as React's useSyncExternalStore needs. */
  readonly current = (): SessionState => this.state;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * At start: the session kept from before, if any. Storage that cannot be read counts as
   * none. It happens once, and a request made meanwhile waits for it.
   */
  restore(): Promise<void> {
    this.restored ??= this.load();
    return this.restored;
  }

  private async load(): Promise<void> {
    const generation = this.generation;
    let token: string | null;
    try {
      token = await this.store(() => this.secrets.get(this.options.storeAs));
    } catch {
      token = null;
    }
    if (generation !== this.generation || this.state.status !== 'restoring') return;
    this.refreshToken = token;
    this.change({ status: token === null ? 'signedOut' : 'signedIn', ended: false });
  }

  /** Sign in with `provider`; false if the person gave up. */
  async signIn(provider: SignInProvider): Promise<boolean> {
    if (this.state.status === 'signedIn') {
      throw new Error('a session is signed in already');
    }
    const { nonce } = await this.client.nonce();
    const signIn = await provider.signIn(nonce);
    if (signIn === null) return false;
    const tokens = await this.client.exchange(signIn.idToken, {
      sessionLabel: this.options.label,
      authorizationCode: signIn.authorizationCode,
    });
    const generation = ++this.generation;
    await this.keep(tokens, generation);
    if (generation === this.generation) this.change({ status: 'signedIn', ended: false });
    return true;
  }

  /** Sign out: the session ends here at once, then at the cloud, if it can be reached. */
  async signOut(): Promise<void> {
    const token = this.refreshToken;
    await this.end(false);
    if (token === null) return;
    try {
      await this.client.revoke(token);
    } catch {
      // Nobody holds its token any more, and the cloud ends a session left unused.
    }
  }

  async accessToken(): Promise<string | null> {
    if (this.state.status === 'restoring') await this.restore();
    if (this.state.status !== 'signedIn') return null;
    const access = this.access;
    const until = (access?.expireTime ?? 0) - this.settings.refresh_margin * 1000;
    if (access !== null && this.clock() < until) return access.token;
    return this.refreshed();
  }

  async renew(refused: string): Promise<string | null> {
    if (this.state.status === 'restoring') await this.restore();
    if (this.state.status !== 'signedIn') return null;
    if (this.access !== null && this.access.token !== refused) return this.access.token;
    this.access = null;
    return this.refreshed();
  }

  /** One refresh at a time, whoever asks for it, within one session. */
  private refreshed(): Promise<string | null> {
    let refreshing = this.refreshing;
    if (refreshing === null || refreshing.generation !== this.generation) {
      const token = this.refresh(this.generation).finally(() => {
        if (this.refreshing?.token === token) this.refreshing = null;
      });
      refreshing = { generation: this.generation, token };
      this.refreshing = refreshing;
    }
    return refreshing.token;
  }

  private async refresh(generation: number): Promise<string | null> {
    const token = this.refreshToken;
    if (token === null) return null;
    let tokens: App.TokenResponse;
    try {
      tokens = await this.refreshWith(token);
    } catch (error) {
      if (error instanceof OAuthRefused && error.error === INVALID_GRANT) {
        if (generation === this.generation) await this.end(true);
        return null;
      }
      throw error;
    }
    await this.keep(tokens, generation);
    return generation === this.generation ? tokens.access_token : null;
  }

  /**
   * A refresh, sent again at once with the same token when no answer came: the cloud may have
   * answered one that reached it (the app API 1.3, Refreshing).
   */
  private async refreshWith(token: string): Promise<App.TokenResponse> {
    try {
      return await this.client.refresh(token);
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
    }
    return this.client.refresh(token);
  }

  /**
   * Keep a session's new tokens. The refresh token reaches secure storage before anything uses
   * the answer: should the app stop in between, the one kept before refreshes again.
   */
  private async keep(tokens: App.TokenResponse, generation: number): Promise<void> {
    try {
      await this.store(async () => {
        if (generation === this.generation) {
          await this.secrets.set(this.options.storeAs, tokens.refresh_token);
        }
      });
    } catch {
      // Storage refused it: the session goes on in memory until the app stops. The token kept
      // before then refreshes again, or ends the session.
    }
    if (generation !== this.generation) return;
    this.refreshToken = tokens.refresh_token;
    this.access = {
      token: tokens.access_token,
      expireTime: this.clock() + tokens.expires_in * 1000,
    };
  }

  private async end(ended: boolean): Promise<void> {
    this.generation += 1;
    this.refreshToken = null;
    this.access = null;
    this.refreshing = null;
    this.change({ status: 'signedOut', ended });
    this.options.onEnd?.();
    try {
      await this.store(() => this.secrets.delete(this.options.storeAs));
    } catch {
      // A token left behind no longer works: the cloud has ended its session, or will.
    }
  }

  /** `work` on the storage, after what was asked of it before, whatever that did. */
  private store<T>(work: () => Promise<T>): Promise<T> {
    const done = this.stored.then(work, work);
    this.stored = done.catch(() => undefined);
    return done;
  }

  private change(state: SessionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}
