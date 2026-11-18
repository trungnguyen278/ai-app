// SPDX-License-Identifier: MIT
// Adding a device to a home, as a person lives it (ai-platform ADR-0013; the set-up protocol, How
// the app runs it): Bluetooth, the device's code, its network, the home's settings, its
// registration, relayed to the cloud. Each step is a state that the screens show; each failure
// that the flow names is told apart. A bound device in one of the person's homes is given another
// network, and nothing else.
import type { CloudClient } from '@/src/shared/cloud';
import { everyPage, Refused } from '@/src/shared/cloud';
import { accepts, type App } from '@/src/shared/protocols';

import { readSetupString } from '../domain/code';
import { DeviceRefused, NotConfirmed, SessionLost } from '../domain/errors';
import type { Nearby, Radio, RadioState } from '../ports/radio';
import {
  greet,
  type DeviceInfo,
  type Greeting,
  type JoinRequest,
  type Network,
  type NetworkStatus,
  type Session,
  type SessionOptions,
} from './session';

/** What a network refused, which the person can change and try again. */
export type JoinFault = 'wrong_password' | 'not_found' | 'no_address' | 'network';
const JOIN_FAULTS: readonly string[] = ['wrong_password', 'not_found', 'no_address', 'network'];

/** What ended the flow, told apart as ADR-0013 (decision 7) asks. */
export type Failure =
  /** No device in set-up was heard. */
  | 'none'
  /** No device in set-up shows the code's discriminator: the code has changed. */
  | 'expired'
  /** The device refused the code: it shows a new one now. */
  | 'code'
  /** The device runs a session with another phone. */
  | 'busy'
  /** The device speaks a version of set-up that the app does not. */
  | 'version'
  /** The device is in a home that is none of the person's. */
  | 'taken'
  /** The home holds as many devices as it may. */
  | 'full'
  /** The person's role does not let them add devices. */
  | 'not_allowed'
  /** The link ended, or the device stopped answering. */
  | 'interrupted'
  /** The device sent or answered what set-up does not allow. */
  | 'broken'
  /** The cloud could not be asked: `error` says why. */
  | 'cloud';

/** What the app does while the person waits. */
export type Work = 'finding' | 'connecting' | 'checking' | 'scanning' | 'joining' | 'adding';

/** A network that does not announce itself, as the person names it. */
export interface HiddenNetwork {
  ssid: string;
  security: 'open' | 'wpa2' | 'wpa3';
}

export type SetupStep =
  /** What set-up needs, before the phone asks for Bluetooth. */
  | { step: 'intro' }
  /** Bluetooth cannot be used. */
  | { step: 'radio'; state: Exclude<RadioState, 'ready' | 'ask'> }
  /** The device's code: its QR code, or its 8 digits. */
  | { step: 'code' }
  /** The 4 characters beside the code, when several devices are in set-up. */
  | { step: 'discriminator' }
  | { step: 'working'; work: Work }
  /** The networks the device sees. */
  | { step: 'networks'; networks: Network[]; fault?: JoinFault }
  /** The password of a network listed. */
  | { step: 'password'; network: Network; fault?: JoinFault }
  /** A network that hides its name: its name, security and password. */
  | { step: 'hidden'; fault?: JoinFault; last?: HiddenNetwork }
  /** The device is in the home: `added` unless the home held it already. */
  | { step: 'added'; device: App.Device; added: boolean }
  /** A bound device is on another network now. */
  | { step: 'moved'; homeId: string; deviceId: string; network: NetworkStatus }
  /** What ended the flow, and whether trying again can help. */
  | { step: 'failed'; failure: Failure; error?: unknown; retry: boolean };

export interface FlowDependencies {
  radio: Radio;
  cloud: CloudClient;
  /** The home the device is added to. */
  home: App.Home;
  session: SessionOptions;
  /** The app's name for a device of `kind`, for one whose own name a home cannot hold. */
  kindName: (kind: string) => string;
}

/** The flow was closed: the screen that needs it has gone. */
class Closed extends Error {
  constructor() {
    super('set-up was closed');
    this.name = 'Closed';
  }
}

/** A request to the cloud that failed, whatever the cloud client threw: no answer, a refusal, or
 * an answer that breaks the app API. The device has no part in it, and its session stays. */
class CloudFailed extends Error {
  constructor(readonly failure: unknown) {
    super('a request to the cloud failed');
    this.name = 'CloudFailed';
  }
}

/** A device in one of the person's homes, as the cloud names them. */
interface Place {
  homeId: string;
  deviceId: string;
}

/** The code to try, and the discriminator that tells its device, when the person gave one. */
interface Target {
  code: string;
  discriminator?: string;
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** A network's name, as the protocol names it back: by its text, or by its bytes. */
export function nameOf(network: { ssid?: string; ssid_hex?: string }): JoinRequest {
  return network.ssid !== undefined ? { ssid: network.ssid } : { ssid_hex: network.ssid_hex ?? '' };
}

export class SetupFlow {
  private now: SetupStep = { step: 'intro' };
  private readonly listeners = new Set<() => void>();
  private closed = false;
  private target: Target | null = null;
  /** What ends the session or the connection under way. */
  private open: { close(): Promise<void> } | null = null;
  private session: Session | null = null;
  private info: DeviceInfo | null = null;
  private networks: Network[] = [];
  /** The home of a bound device, which is given another network. */
  private moving: Place | null = null;
  /** The device as the cloud registered it, and whether the home held it before: kept to take
   * set-up up again. */
  private registered: { device: App.Device; added: boolean } | null = null;
  private again: (() => Promise<void>) | null = null;

  constructor(private readonly deps: FlowDependencies) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly current = (): SetupStep => this.now;

  /** After the explanation: asks for Bluetooth, if the phone has not, then the code. */
  begin(): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.radio.allow();
      this.check();
      this.set(state === 'ready' ? { step: 'code' } : { step: 'radio', state: blocked(state) });
    });
  }

  /** Reads Bluetooth's state again: the person came back from the settings, or turned it on. A
   * code given before Bluetooth went off is tried then. */
  recheck(): Promise<void> {
    return this.run(async () => {
      const state = await this.deps.radio.state();
      this.check();
      if (state === 'ready') {
        if (this.target !== null) return this.find();
        this.set({ step: 'code' });
      } else if (state !== 'ask') {
        this.set({ step: 'radio', state });
      }
    });
  }

  /** What a QR code holds: false if it is no set-up string, for the scanner to refuse. */
  scanned(text: string): boolean {
    const read = readSetupString(text);
    if (read === null) {
      return false;
    }
    if (read.kind === 'version') {
      this.fail('version', false);
      return true;
    }
    this.target = { code: read.code, discriminator: read.discriminator };
    void this.run(() => this.find());
    return true;
  }

  /** The 8 digits the person typed, checked already: the discriminator comes next, if needed. */
  typed(code: string): Promise<void> {
    this.target = { code };
    return this.run(() => this.find());
  }

  /** The discriminator the person typed, checked already. */
  discriminator(discriminator: string): Promise<void> {
    if (this.target === null) {
      this.set({ step: 'code' });
      return Promise.resolve();
    }
    this.target = { ...this.target, discriminator };
    return this.run(() => this.find());
  }

  /** Back to the code, to scan or type another. */
  toCode(): void {
    this.target = null;
    this.set({ step: 'code' });
  }

  /** A network listed: joined at once if it is open or saved, its password asked otherwise. */
  choose(network: Network): Promise<void> {
    if (network.security === 'open' || network.saved) {
      return this.run(() => this.join(nameOf(network), { network }));
    }
    this.set({ step: 'password', network });
    return Promise.resolve();
  }

  /** The password of the network chosen, checked already. */
  password(network: Network, password: string): Promise<void> {
    return this.run(() => this.join({ ...nameOf(network), password }, { network }));
  }

  /** "Other network…": the form for a network that hides its name. */
  other(): void {
    this.set({ step: 'hidden' });
  }

  /** A network that hides its name: the device probes for it by its name, which the protocol
   * keeps for `hidden`. */
  hidden(network: HiddenNetwork, password?: string): Promise<void> {
    const request: JoinRequest = { ssid: network.ssid, hidden: true, security: network.security };
    if (password !== undefined) {
      request.password = password;
    }
    return this.run(() => this.join(request, { hidden: network }));
  }

  /** Back to the networks, as last listed. */
  toNetworks(): void {
    this.set({ step: 'networks', networks: this.networks });
  }

  /** The device scans again. */
  rescan(): Promise<void> {
    return this.run(() => this.offerNetworks());
  }

  /** After a failure that trying again can help. */
  retry(): Promise<void> {
    const again = this.again;
    this.again = null;
    return again === null ? Promise.resolve() : this.run(again);
  }

  /** Ends the session: the screen has gone. A device without `finish` stays in set-up. */
  async close(): Promise<void> {
    this.closed = true;
    this.listeners.clear();
    await this.end();
  }

  private set(step: SetupStep): void {
    this.now = step;
    for (const listener of this.listeners) listener();
  }

  private check(): void {
    if (this.closed) throw new Closed();
  }

  /** Runs `task`, and ends in the failure that what it threw names. */
  private async run(task: () => Promise<void>): Promise<void> {
    try {
      await task();
    } catch (error) {
      if (error instanceof Closed || this.closed) {
        // Closed while it waited: what it connected to meanwhile is let go as well.
        await this.end();
        return;
      }
      await this.failWith(error);
    }
  }

  private async failWith(error: unknown): Promise<void> {
    if (error instanceof SessionLost) {
      await this.end();
      this.fail(error.reason === 'broken' ? 'broken' : 'interrupted', true, () => this.resume());
      return;
    }
    if (!(error instanceof CloudFailed)) {
      // An error that set-up does not expect at this step, such as `server` or `identity` to
      // `register`: the session cannot go on.
      await this.end();
      this.fail('broken', true, () => this.resume());
      return;
    }
    const { failure } = error;
    if (failure instanceof Refused) {
      if (failure.is('device_taken')) {
        await this.end();
        return this.fail('taken', true, async () => this.toCode());
      }
      if (failure.is('device_limit_reached')) {
        await this.end();
        return this.fail('full', false);
      }
      if (failure.status === 403) {
        await this.end();
        return this.fail('not_allowed', false);
      }
    }
    // The cloud could not be asked, or did not answer as it should: the session stays, and
    // trying again asks again from where the flow was.
    const step = this.now;
    this.set({ step: 'failed', failure: 'cloud', error: failure, retry: true });
    this.again = async () => {
      if (step.step === 'working' && step.work === 'adding' && this.session !== null) {
        return this.register();
      }
      if (this.session !== null && this.info !== null) {
        return this.after(this.info);
      }
      return this.resume();
    };
  }

  private fail(failure: Failure, retry: boolean, again?: () => Promise<void>): void {
    this.again = retry ? (again ?? null) : null;
    this.set({ step: 'failed', failure, retry });
  }

  /** Ends the session or the connection under way. */
  private async end(): Promise<void> {
    const open = this.open;
    this.open = null;
    this.session = null;
    await open?.close();
  }

  /** The devices in set-up, then the one whose discriminator matches, and the code on it. */
  private async find(): Promise<void> {
    const target = this.target;
    if (target === null) {
      return this.set({ step: 'code' });
    }
    await this.end();
    this.set({ step: 'working', work: 'finding' });
    // Bluetooth may have been turned off, or refused in the settings, since the explanation: the
    // person is told so, and the code is tried once it is back (`recheck`).
    const state = await this.deps.radio.allow();
    this.check();
    if (state !== 'ready') {
      return this.set({ step: 'radio', state: blocked(state) });
    }
    const nearby = await this.deps.radio.scan(this.deps.session.settings.scan_time);
    this.check();
    if (nearby.length === 0) {
      return this.fail('none', true, () => this.find());
    }
    // A typed code finds its device alone only when one device is in set-up: no code is ever
    // tried on a device not matched, since each attempt changes its code (Finding the device).
    if (target.discriminator === undefined && nearby.length > 1) {
      return this.set({ step: 'discriminator' });
    }
    this.set({ step: 'working', work: 'connecting' });
    // A device that is busy, or speaks a newer set-up, may be the code's or another: the others
    // are tried still, and the person is told only if none is the code's.
    let busy = false;
    let newer = false;
    for (const candidate of nearby) {
      const greeting = await this.greet(candidate);
      if (greeting === 'busy') {
        busy = true;
        continue;
      }
      if (greeting === 'version') {
        newer = true;
        continue;
      }
      if (greeting === null) continue;
      if (target.discriminator !== undefined && greeting.discriminator !== target.discriminator) {
        this.open = null;
        await greeting.close();
        this.check();
        continue;
      }
      return this.exchange(greeting, target.code);
    }
    // Busy first: it passes, and trying again then reaches a device that is the code's.
    if (busy) {
      return this.fail('busy', true, () => this.find());
    }
    if (newer) {
      return this.fail('version', false);
    }
    return this.fail(target.discriminator === undefined ? 'none' : 'expired', true, async () =>
      target.discriminator === undefined ? this.find() : this.toCode(),
    );
  }

  /** Says hello to `candidate`: its greeting, or why not; `null` for one that went away. */
  private async greet(candidate: Nearby): Promise<Greeting | 'busy' | 'version' | null> {
    let link;
    try {
      link = await candidate.connect();
    } catch {
      this.check();
      return null;
    }
    this.open = link;
    this.check();
    try {
      const greeting = await greet(link, this.deps.session);
      this.open = greeting;
      this.check();
      return greeting;
    } catch (error) {
      this.open = null;
      this.check();
      if (error instanceof DeviceRefused && error.is('busy')) return 'busy';
      if (error instanceof DeviceRefused && error.is('version')) return 'version';
      if (error instanceof SessionLost) return null;
      throw error;
    }
  }

  private async exchange(greeting: Greeting, code: string): Promise<void> {
    // A code serves one attempt: the device draws another once this one is tried.
    this.target = null;
    let opened: { session: Session; info: DeviceInfo };
    try {
      opened = await greeting.exchange(code);
    } catch (error) {
      this.open = null;
      this.check();
      if (error instanceof NotConfirmed || (error instanceof DeviceRefused && error.is('code'))) {
        return this.fail('code', true, async () => this.toCode());
      }
      throw error;
    }
    this.session = opened.session;
    this.open = opened.session;
    this.check();
    return this.after(opened.info);
  }

  /** Where the device stands, from its `info`: bound, on a network, or neither. */
  private async after(info: DeviceInfo): Promise<void> {
    this.info = info;
    const session = this.ongoing();
    if (info.bound) {
      const place = await fromCloud(() => this.placeOf(info.device.id));
      this.check();
      if (place === null) {
        await this.end();
        return this.fail('taken', true, async () => this.toCode());
      }
      // A registration taken up again, whose device reached the cloud meanwhile.
      if (this.registered !== null && sameId(this.registered.device.id, info.device.id)) {
        return this.finish();
      }
      this.moving = place;
      return this.offerNetworks();
    }
    this.moving = null;
    // While the device does not know yet whether its network reaches the Internet, it is asked
    // again (How the app runs it).
    let network = info.network;
    const { internet_wait, recheck } = this.deps.session.settings;
    for (let asked = 0; unknownInternet(network) && asked < internet_wait / recheck; asked += 1) {
      this.set({ step: 'working', work: 'checking' });
      await wait(recheck);
      this.check();
      network = (await session.info()).network;
      this.check();
    }
    if (network.state === 'connected' && network.internet === true) {
      return this.add();
    }
    return this.offerNetworks();
  }

  private async offerNetworks(fault?: JoinFault): Promise<void> {
    this.set({ step: 'working', work: 'scanning' });
    this.networks = await this.ongoing().networks();
    this.check();
    this.set({ step: 'networks', networks: this.networks, fault });
  }

  private async join(
    request: JoinRequest,
    from: { network: Network } | { hidden: HiddenNetwork },
  ): Promise<void> {
    const session = this.ongoing();
    this.set({ step: 'working', work: 'joining' });
    let status: NetworkStatus;
    try {
      status = await session.join(request);
    } catch (error) {
      this.check();
      if (!(error instanceof DeviceRefused) || !JOIN_FAULTS.includes(error.code)) throw error;
      const fault = error.code as JoinFault;
      if ('hidden' in from) {
        return this.set({ step: 'hidden', fault, last: from.hidden });
      }
      if (fault === 'wrong_password') {
        return this.set({ step: 'password', network: from.network, fault });
      }
      return this.set({ step: 'networks', networks: this.networks, fault });
    }
    this.check();
    if (this.moving !== null) {
      const { homeId, deviceId } = this.moving;
      await session.finish();
      this.check();
      this.open = null;
      this.session = null;
      return this.set({ step: 'moved', homeId, deviceId, network: status });
    }
    return this.add();
  }

  /** The home's languages and time zone, given to the device, then its registration. */
  private async add(): Promise<void> {
    const session = this.ongoing();
    this.set({ step: 'working', work: 'adding' });
    const { languages, time_zone } = this.deps.home;
    try {
      await session.configure({ languages, time_zone });
    } catch (error) {
      // A time zone the device does not know changes nothing: it keeps its own, which its owner
      // can change later, and takes the languages alone.
      if (!(error instanceof DeviceRefused && error.is('time_zone'))) throw error;
      this.check();
      await session.configure({ languages });
    }
    this.check();
    return this.register();
  }

  /** A challenge from the cloud, signed by the device, relayed to the cloud, then `finish`. */
  private async register(): Promise<void> {
    const session = this.ongoing();
    const info = this.info as DeviceInfo;
    this.set({ step: 'working', work: 'adding' });
    const { home, cloud } = this.deps;
    const { challenge, server } = await fromCloud(() => cloud.createDeviceChallenge(home.id));
    this.check();
    let registration: string;
    try {
      registration = await session.register(challenge, server);
    } catch (error) {
      // Bound meanwhile: it registered before, and reached the cloud since.
      if (!(error instanceof DeviceRefused && error.is('bound'))) throw error;
      this.check();
      return this.after(await session.info());
    }
    this.check();
    const name = this.nameFor(info.device);
    const { device, added } = await fromCloud(() =>
      cloud.registerDevice(home.id, { registration, name }),
    );
    // Added by an earlier registration of this flow, taken up again: added all the same.
    this.registered = { device, added: added || this.registered?.added === true };
    this.check();
    return this.finish();
  }

  /** Ends set-up on the device, which closes it and reaches the cloud. */
  private async finish(): Promise<void> {
    const { device, added } = this.registered as { device: App.Device; added: boolean };
    this.set({ step: 'working', work: 'adding' });
    await this.ongoing().finish();
    this.check();
    this.open = null;
    this.session = null;
    this.set({ step: 'added', device, added });
  }

  /** After an interruption, the device is looked for in the home, by the identifier its `info`
   * gave: one online there goes on to its name. Otherwise the code shown on it then starts a new
   * session, which skips what the device did already (set-up 2.2, How the app runs it). A device
   * given another network is in its home already, and starts again from its code. */
  private async resume(): Promise<void> {
    const id = this.info?.device.id;
    if (id !== undefined && this.moving === null) {
      this.set({ step: 'working', work: 'finding' });
      let device: App.Device | null;
      try {
        device = await this.deps.cloud.device(this.deps.home.id, id.toLowerCase());
      } catch {
        device = null;
      }
      this.check();
      if (device?.connected === true) {
        return this.set({ step: 'added', device, added: this.registered?.added ?? false });
      }
    }
    this.toCode();
  }

  /** Which of the person's homes holds `deviceId`, this one first, and the cloud's identifier of
   * it: `null` if none does. */
  private async placeOf(deviceId: string): Promise<Place | null> {
    const { cloud, home } = this.deps;
    const homes = await everyPage(
      (page) => cloud.homes(page),
      (page) => page.homes,
    );
    const ids = [home.id, ...homes.map((each) => each.id).filter((id) => id !== home.id)];
    for (const id of ids) {
      const devices = await everyPage(
        (page) => cloud.devices(id, page),
        (page) => page.devices,
      );
      const device = devices.find((each) => sameId(each.id, deviceId));
      if (device !== undefined) return { homeId: id, deviceId: device.id };
    }
    return null;
  }

  /** The name sent with the registration: the device's own, unless a home cannot hold it, as
   * set-up lets a device's name hold control characters (ADR-0013, decision 3). */
  private nameFor(device: DeviceInfo['device']): string {
    return accepts('name', device.name) ? device.name : this.deps.kindName(device.kind);
  }

  private ongoing(): Session {
    if (this.session === null) throw new SessionLost('set-up', 'ended');
    return this.session;
  }
}

/** The state of the radio that keeps set-up from going on. */
function blocked(state: RadioState): Exclude<RadioState, 'ready' | 'ask'> {
  return state === 'ask' ? 'blocked' : (state as Exclude<RadioState, 'ready' | 'ask'>);
}

/** What `request` answers, or `CloudFailed` for whatever it threw. */
async function fromCloud<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new CloudFailed(error);
  }
}

function unknownInternet(network: NetworkStatus): boolean {
  return network.state === 'connected' && network.internet === null;
}

/** Identifiers are UUIDs, which the cloud keeps in lower case. */
function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
