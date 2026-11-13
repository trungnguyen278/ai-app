// SPDX-License-Identifier: MIT
// The simulated cloud (ADR-0004, decision 3): the app API 1.6 in memory, behind the transport
// port, as ai-cloud serves it. The development app runs on it with no cloud, and the tests run
// on it end to end; ai-platform's examples are replayed against it, as against ai-cloud, so
// that it keeps to the protocol. It is a development cloud: its provider signs anyone in, and it
// forgets everything when the app stops.
import type { SimulatedSettings } from '../../settings';
import type { CloudRequest, CloudResponse, Method, Transport } from '../../transport';
import * as accounts from './accounts';
import type { Person, ProviderSignIn } from './accounts';
import type { Context } from './context';
import * as devices from './devices';
import * as homes from './homes';
import { cryptoRandom, State, Uuids, type Clock, type Description, type Random } from './model';
import type { PublicJwk } from './registration';
import { Answered, Incoming, problem } from './wire';

type Handler = (context: Context, request: Incoming, parameters: string[]) => CloudResponse;

// The app API's endpoints (its README), with the identifiers in their paths.
const ID = '([^/:]+)';
const ROUTES: readonly (readonly [Method, RegExp, Handler])[] = [
  ['POST', /^\/app\/v1\/nonces$/, accounts.issueNonce],
  ['POST', /^\/app\/token$/, accounts.token],
  ['POST', /^\/app\/revoke$/, accounts.revoke],
  ['GET', /^\/app\/v1\/account$/, accounts.readAccount],
  ['PATCH', /^\/app\/v1\/account$/, accounts.changeAccount],
  ['POST', /^\/app\/v1\/account:delete$/, accounts.deleteAccount],
  ['POST', /^\/app\/v1\/account\/identities$/, accounts.linkIdentity],
  ['DELETE', new RegExp(`^/app/v1/account/identities/${ID}$`), accounts.removeIdentity],
  ['GET', /^\/app\/v1\/account\/sessions$/, accounts.listSessions],
  ['DELETE', new RegExp(`^/app/v1/account/sessions/${ID}$`), accounts.endSession],
  ['POST', /^\/app\/v1\/development\/id-tokens$/, accounts.developmentIdToken],
  ['GET', /^\/app\/v1\/homes$/, homes.listHomes],
  ['POST', /^\/app\/v1\/homes$/, homes.createHome],
  ['GET', new RegExp(`^/app/v1/homes/${ID}$`), homes.readHome],
  ['PATCH', new RegExp(`^/app/v1/homes/${ID}$`), homes.changeHome],
  ['POST', new RegExp(`^/app/v1/homes/${ID}:transfer$`), homes.transferHome],
  ['POST', new RegExp(`^/app/v1/homes/${ID}:delete$`), homes.deleteHome],
  ['GET', new RegExp(`^/app/v1/homes/${ID}/members$`), homes.listMembers],
  ['POST', new RegExp(`^/app/v1/homes/${ID}/members$`), homes.addProfile],
  ['PATCH', new RegExp(`^/app/v1/homes/${ID}/members/${ID}$`), homes.changeMember],
  ['DELETE', new RegExp(`^/app/v1/homes/${ID}/members/${ID}$`), homes.removeMember],
  ['POST', new RegExp(`^/app/v1/homes/${ID}/invitations$`), homes.createInvitation],
  ['GET', new RegExp(`^/app/v1/homes/${ID}/invitations$`), homes.listInvitations],
  ['DELETE', new RegExp(`^/app/v1/homes/${ID}/invitations/${ID}$`), homes.revokeInvitation],
  ['POST', /^\/app\/v1\/invitations:lookup$/, homes.lookUpInvitation],
  ['POST', /^\/app\/v1\/invitations:accept$/, homes.acceptInvitation],
  ['POST', new RegExp(`^/app/v1/homes/${ID}/device-challenges$`), devices.issueChallenge],
  ['GET', new RegExp(`^/app/v1/homes/${ID}/devices$`), devices.listDevices],
  ['POST', new RegExp(`^/app/v1/homes/${ID}/devices$`), devices.registerDevice],
  ['GET', new RegExp(`^/app/v1/homes/${ID}/devices/${ID}$`), devices.readDevice],
  ['PATCH', new RegExp(`^/app/v1/homes/${ID}/devices/${ID}$`), devices.renameDevice],
  ['DELETE', new RegExp(`^/app/v1/homes/${ID}/devices/${ID}$`), devices.removeDevice],
];

/** What the simulated cloud takes from its surroundings, which tests replace. */
export interface SimulatedOptions {
  /** The time, in milliseconds since 1970. */
  clock?: Clock;
  random?: Random;
  /** Waits `seconds`. */
  sleep?: (seconds: number) => Promise<void>;
}

export class SimulatedCloud implements Transport {
  private readonly state = new State();
  private readonly ids: Uuids;
  private readonly clock: Clock;
  private readonly random: Random;
  private readonly sleep: (seconds: number) => Promise<void>;

  constructor(
    private readonly settings: SimulatedSettings,
    /** The OAuth client IDs of the apps that may sign in. */
    private readonly clientIds: readonly string[],
    options: SimulatedOptions = {},
  ) {
    this.clock = options.clock ?? Date.now;
    this.random = options.random ?? cryptoRandom;
    this.sleep = options.sleep ?? wait;
    this.ids = new Uuids(this.random, this.clock);
  }

  async send(request: CloudRequest): Promise<CloudResponse> {
    const incoming = new Incoming(request);
    // A request with an Idempotency-Key holds it while it runs: a copy of it then is refused
    // with 409, which the app tries again (the app API, Requests).
    const held = this.hold(incoming);
    if (held === null) {
      return problem(409, 'the first request with this key still runs').response;
    }
    try {
      if (this.settings.latency > 0) {
        await this.sleep(this.settings.latency);
      }
      return this.serve(incoming);
    } finally {
      if (held !== undefined) this.state.running.delete(held);
    }
  }

  /**
   * An ID token for `person` from one of the simulated providers, carrying `nonce`, as
   * Android's Credential Manager or Sign in with Apple gives one to the app.
   */
  signInWith(provider: 'google' | 'apple', person: Person, nonce: string): ProviderSignIn {
    return accounts.issueIdToken(this.context(), provider, person, nonce);
  }

  /**
   * A simulated device opens its control channel, with the key it registered, and says what it
   * is (the cloud link, Hello): false if the cloud holds no device with that key, as when it
   * was removed.
   */
  connectDevice(key: PublicJwk, hello: Description): boolean {
    return devices.connect(this.context(), key, hello);
  }

  /** A simulated device's control channel closes, as when the device stops. */
  disconnectDevice(key: PublicJwk): void {
    devices.disconnect(this.context(), key);
  }

  private serve(request: Incoming): CloudResponse {
    const allowed: Method[] = [];
    for (const [method, pattern, handler] of ROUTES) {
      const match = pattern.exec(request.path);
      if (match === null) continue;
      if (method !== request.method) {
        allowed.push(method);
        continue;
      }
      try {
        return handler(this.context(), request, match.slice(1).map(decodeURIComponent));
      } catch (error) {
        if (error instanceof Answered) return error.response;
        if (error instanceof URIError) return problem(404, 'no such item').response;
        throw error;
      }
    }
    if (allowed.length > 0) {
      return problem(405, 'method not allowed', { allow: allowed.join(', ') }).response;
    }
    return problem(404, 'not found').response;
  }

  /** The key a request holds, undefined if it holds none, or null if another holds it. */
  private hold(request: Incoming): string | null | undefined {
    const key = request.header('idempotency-key');
    const bearer = /^bearer +([^ ]+)$/i.exec(request.header('authorization') ?? '');
    const access = bearer === null ? undefined : this.state.accessTokens.get(bearer[1]);
    if (request.method !== 'POST' || key === undefined || access === undefined) {
      return undefined;
    }
    const held = `${access.accountId}\n${key.trim().toLowerCase()}`;
    if (this.state.running.has(held)) return null;
    this.state.running.add(held);
    return held;
  }

  private context(): Context {
    return {
      state: this.state,
      settings: this.settings,
      clientIds: this.clientIds,
      random: this.random,
      ids: this.ids,
      now: this.clock(),
    };
  }
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
