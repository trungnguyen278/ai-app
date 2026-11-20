// SPDX-License-Identifier: MIT
// What the Bluetooth adapter needs of the phone's Bluetooth LE central: the few GATT operations that
// set-up uses (platform/protocols/setup/README.md, The Bluetooth service). The phone's is
// react-native-ble-manager's (ADR-0001), in phone.ts; the tests give one over simulated devices.
import type { RadioState } from '../../ports/radio';

/** A value that a peripheral notified or indicated. */
export interface CentralValue {
  /** The central's id for the peripheral. */
  readonly id: string;
  /** The service's UUID, in whatever case the phone gives it. */
  readonly service: string;
  /** The characteristic's UUID, in whatever case the phone gives it. */
  readonly characteristic: string;
  readonly value: Uint8Array;
}

/** The phone's Bluetooth LE central, as set-up uses it. A peripheral is named by the central's id
 * for it, for as long as the app runs. */
export interface Central {
  /** Whether the app may use Bluetooth LE, without asking anything. */
  state(): Promise<RadioState>;
  /** Asks the phone's question, if it has not been asked yet: the state after it. */
  allow(): Promise<RadioState>;
  /** The ids of the peripherals that advertise `service` within `seconds`, each once, in the order
   * they were heard. */
  scan(service: string, seconds: number): Promise<string[]>;
  /** Connects to the peripheral `id`. Rejects if it could not; an iPhone tries for ever, until
   * `disconnect`. */
  connect(id: string): Promise<void>;
  /** Discovers `service` on the connected `id`, and settles the ATT MTU: the bytes that one write
   * carries, the MTU minus 3, at least 20. */
  prepare(id: string, service: string): Promise<number>;
  /** Turns on `characteristic`'s indications, by writing its Client Characteristic Configuration
   * descriptor: settles once the peripheral confirmed the write. */
  indicate(id: string, service: string, characteristic: string): Promise<void>;
  /** Writes `value` to `characteristic` with a response, in one ATT request of at most `size`
   * bytes: settles once the peripheral confirmed it. */
  write(
    id: string,
    service: string,
    characteristic: string,
    value: Uint8Array,
    size: number,
  ): Promise<void>;
  /** Disconnects from `id`, or stops connecting to it. */
  disconnect(id: string): Promise<void>;
  /** Tells `listener` each value that a peripheral notifies or indicates, until the returned
   * function is called. */
  onValue(listener: (value: CentralValue) => void): () => void;
  /** Tells `listener` the id of each peripheral that disconnected, until the returned function is
   * called. */
  onDisconnect(listener: (id: string) => void): () => void;
}
