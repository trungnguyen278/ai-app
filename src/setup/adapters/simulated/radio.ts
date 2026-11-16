// SPDX-License-Identifier: MIT
// The phone's radio, simulated, with devices in set-up that run in memory: set-up runs end to end
// in tests, and on a phone with no robot nearby (docs/architecture.md, Testing).
import type { Nearby, Radio, RadioState } from '../../ports/radio';
import type { SimulatedDevice } from './device';

export interface SimulatedRadioOptions {
  /** Whether Bluetooth may be used, before the phone's question: `ready` by default. */
  state?: RadioState;
  /** What the person answers to the phone's question: `ready` by default. */
  answer?: 'ready' | 'blocked';
}

export class SimulatedRadio implements Radio {
  /** Whether Bluetooth may be used now: a test turns it off, or the person's settings change. */
  current: RadioState;
  private readonly answer: 'ready' | 'blocked';
  /** How many times the phone asked. */
  asked = 0;

  constructor(
    /** The devices within reach. */
    readonly devices: readonly SimulatedDevice[],
    options: SimulatedRadioOptions = {},
  ) {
    this.current = options.state ?? 'ready';
    this.answer = options.answer ?? 'ready';
  }

  async state(): Promise<RadioState> {
    return this.current;
  }

  async allow(): Promise<RadioState> {
    if (this.current === 'ask') {
      this.asked += 1;
      this.current = this.answer;
    }
    return this.current;
  }

  /** The devices that advertise now: at once, since nothing in memory takes time to be heard. */
  async scan(): Promise<Nearby[]> {
    if (this.current !== 'ready') {
      return [];
    }
    return this.devices
      .filter((device) => device.advertising)
      .map((device) => ({ id: device.id, connect: async () => device.connect() }));
  }
}
