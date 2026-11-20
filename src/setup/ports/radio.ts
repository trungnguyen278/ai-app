// SPDX-License-Identifier: MIT
// What set-up needs of the phone's radio before a link: whether Bluetooth LE may be used, the
// devices in set-up nearby, and a link to one of them (platform/protocols/setup/README.md,
// Finding the device). Bluetooth is asked for only after "Add device" (ADR-0013 of ai-platform,
// decision 1), as Apple's guidelines ask: "wait to request permission until people actually use
// an app feature that requires access".
import type { Link } from './link';

/** Whether the app may use Bluetooth LE now. */
export type RadioState =
  /** It may. */
  | 'ready'
  /** The phone has not asked the person yet: `allow` asks. */
  | 'ask'
  /** The person said no, and only the phone's settings can say yes now. */
  | 'blocked'
  /** Bluetooth is turned off. */
  | 'off'
  /** Location is off, without which Android 11 and older find no device. */
  | 'location'
  /** This phone, or this build of the app, has no Bluetooth LE: the web, Expo Go. */
  | 'unsupported';

/** A device in set-up, as its advertisement made it known. */
export interface Nearby {
  /** The radio's name for it, for as long as the app runs. */
  readonly id: string;
  /** Connects to its set-up service, and enables the indications: a link to it. Rejects if it
   * could not. */
  connect(): Promise<Link>;
}

/** The phone's radio. */
export interface Radio {
  /** Whether the app may use Bluetooth LE, without asking anything. */
  state(): Promise<RadioState>;
  /** The phone's own question, if it has not been asked yet: the state after it. */
  allow(): Promise<RadioState>;
  /** The devices that advertise the set-up service within `seconds`: those in set-up, with no
   * session running (When set-up is open). */
  scan(seconds: number): Promise<Nearby[]>;
}
