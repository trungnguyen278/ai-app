// SPDX-License-Identifier: MIT
// The radio of an app without Bluetooth LE: the web, which no Bluetooth library serves, and Expo
// Go, which has no native module of its own (the research of 2026-11-12, "Web"). Set-up says so,
// instead of failing later.
import type { Nearby, Radio, RadioState } from '../ports/radio';

export class NoRadio implements Radio {
  async state(): Promise<RadioState> {
    return 'unsupported';
  }

  async allow(): Promise<RadioState> {
    return 'unsupported';
  }

  async scan(): Promise<Nearby[]> {
    return [];
  }
}
