// SPDX-License-Identifier: MIT
// The phone's radio for set-up: Bluetooth LE, through the phone's central (ADR-0001). It finds the
// devices that advertise the set-up service, connects to one, turns on the indications of Answer,
// and then writes Request (platform/protocols/setup/README.md, The Bluetooth service).
import type { SetupSettings } from '@/src/shared/config';

import { ANSWER_UUID, REQUEST_UUID, SERVICE_UUID } from '../../domain/protocol';
import type { Link, LinkListener } from '../../ports/link';
import type { Nearby, Radio, RadioState } from '../../ports/radio';
import type { Central, CentralValue } from './central';

/** Whether two UUIDs are the same: Android gives them in lower case, iOS in upper case. */
function same(uuid: string, other: string): boolean {
  return uuid.toLowerCase() === other.toLowerCase();
}

export class BluetoothRadio implements Radio {
  constructor(
    private readonly central: Central,
    private readonly settings: Pick<SetupSettings, 'connect_timeout' | 'write_timeout'>,
  ) {}

  state(): Promise<RadioState> {
    return this.central.state();
  }

  allow(): Promise<RadioState> {
    return this.central.allow();
  }

  async scan(seconds: number): Promise<Nearby[]> {
    if ((await this.central.state()) !== 'ready') {
      return [];
    }
    const ids = await this.central.scan(SERVICE_UUID, seconds);
    return ids.map((id) => ({ id, connect: () => this.connect(id) }));
  }

  /** Connects to `id`, learns the size of its writes and turns on Answer's indications, before the
   * first write (The Bluetooth service), within `connect_timeout`; else lets it go. */
  private async connect(id: string): Promise<Link> {
    const { central } = this;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('the device did not connect in time')),
        this.settings.connect_timeout * 1000,
      );
    });
    let link: BluetoothLink | null = null;
    try {
      await Promise.race([central.connect(id), expired]);
      const size = await Promise.race([central.prepare(id, SERVICE_UUID), expired]);
      // It listens before the indications are on, so that it misses no disconnection.
      link = new BluetoothLink(central, id, size, this.settings.write_timeout);
      await Promise.race([central.indicate(id, SERVICE_UUID, ANSWER_UUID), expired, link.ending]);
      return link;
    } catch (error) {
      link?.end();
      await central.disconnect(id).catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A link to one device's set-up service, over the phone's central. */
class BluetoothLink implements Link {
  /** Rejects once the link has ended: a write waits for it no longer. */
  readonly ending: Promise<never>;
  private finish: (error: Error) => void = () => undefined;
  private readonly listeners = new Set<LinkListener>();
  private readonly unsubscribe: (() => void)[];
  private over = false;

  constructor(
    private readonly central: Central,
    private readonly id: string,
    readonly fragmentSize: number,
    /** Seconds a write may take before the link ends. */
    private readonly writeTimeout: number,
  ) {
    this.ending = new Promise<never>((_, reject) => {
      this.finish = reject;
    });
    // Nothing may be waiting on it when it ends.
    this.ending.catch(() => undefined);
    this.unsubscribe = [
      central.onValue((value) => this.indicated(value)),
      central.onDisconnect((peripheral) => {
        if (peripheral === id) this.end();
      }),
    ];
  }

  async write(fragment: Uint8Array): Promise<void> {
    if (this.over) {
      throw new Error('the link has ended');
    }
    if (fragment.length > this.fragmentSize) {
      // The phone would split it into writes that the device reads as fragments of their own.
      throw new RangeError('a fragment longer than one write');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A write the device does not confirm ends the link, which lets the central's write go: on
    // Android, react-native-ble-manager never settles one that the device refused for its
    // authentication, and its disconnection settles it.
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('the device did not confirm a write in time'));
        void this.close();
      }, this.writeTimeout * 1000);
    });
    try {
      await Promise.race([
        this.central.write(this.id, SERVICE_UUID, REQUEST_UUID, fragment, this.fragmentSize),
        this.ending,
        late,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  listen(listener: LinkListener): () => void {
    if (this.over) {
      listener.closed();
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    if (this.end()) {
      await this.central.disconnect(this.id).catch(() => undefined);
    }
  }

  /** Ends the link, unless it has ended, and tells whether it did: a write waiting rejects, and
   * the listeners hear of it after the code that ended it has run, as a disconnection comes from
   * the radio. */
  end(): boolean {
    if (this.over) return false;
    this.over = true;
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.finish(new Error('the link has ended'));
    const listeners = [...this.listeners];
    void Promise.resolve().then(() => {
      for (const listener of listeners) listener.closed();
    });
    return true;
  }

  private indicated({ id, service, characteristic, value }: CentralValue): void {
    if (id !== this.id || !same(service, SERVICE_UUID) || !same(characteristic, ANSWER_UUID)) {
      return;
    }
    for (const listener of [...this.listeners]) listener.fragment(value);
  }
}
