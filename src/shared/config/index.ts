// SPDX-License-Identifier: MIT
// What the app reads of its settings while it runs (docs/architecture.md, Configuration).
import Constants from 'expo-constants';

import type { CloudSettings } from '@/src/shared/cloud';

/** How people sign in (config/base.toml, [sign_in]). */
export interface SignInSettings {
  /** The providers the sign-in screen offers, in its order. */
  providers: 'development'[];
}

/** The session of the person signed in (config/base.toml, [session]). */
export interface SessionSettings {
  /** Seconds before its access token expires when the session refreshes it. */
  refresh_margin: number;
}

/** The query cache of what the cloud answers (config/base.toml, [queries]). */
export interface QueriesSettings {
  /** How many times a read is tried again after no answer, or a cloud that cannot serve. */
  retries: number;
  /** Seconds that what a read brought stays fresh. */
  stale_time: number;
}

/** How the app runs a device's set-up (config/base.toml, [setup]). */
export interface SetupSettings {
  /** Seconds the app waits for each of a device's answers. */
  answer_timeout: number;
  /** The radio that finds devices in set-up: the phone's, or one simulated in memory. */
  radio: 'bluetooth' | 'simulated';
  /** Seconds the app listens for devices in set-up before it connects to them. */
  scan_time: number;
  /** Seconds the app gives a device it heard to connect and turn on its indications. */
  connect_timeout: number;
  /** Seconds the app waits for a device to confirm a write, before it ends the link: on Android,
   * the only way out of a write that the device refused for its authentication
   * (innoveit/react-native-ble-manager#1463). */
  write_timeout: number;
  /** Seconds the app asks again while a device does not know whether it reaches the Internet. */
  internet_wait: number;
  /** Seconds between those questions. */
  recheck: number;
  /** Seconds between reads of a device just added, until it is online. */
  online_poll: number;
  /** Seconds after which the app says that a device just added has not come online. */
  online_timeout: number;
  simulated: SimulatedSetupSettings;
}

/** The simulated radio's devices in set-up (config/base.toml, [setup.simulated]). */
export interface SimulatedSetupSettings {
  /** How many devices are in set-up. */
  devices: number;
  /** The networks they see. */
  networks: {
    ssid: string;
    security: 'open' | 'wpa2' | 'wpa3' | 'other';
    signal: number;
    password?: string;
    hidden?: boolean;
  }[];
}

/** The settings app.config.ts puts in Expo's `extra`, from config/. */
export interface RuntimeSettings {
  /** Whether the studio can be opened (ADR-0003): in the development app only. */
  studio: boolean;
  sign_in: SignInSettings;
  session: SessionSettings;
  queries: QueriesSettings;
  setup: SetupSettings;
  /** How the app reaches ai-cloud (ADR-0004). */
  cloud: CloudSettings;
}

/** The app's settings, as built into it. */
export function runtimeSettings(): RuntimeSettings {
  const settings = Constants.expoConfig?.extra?.settings;
  if (typeof settings?.studio !== 'boolean' || typeof settings?.cloud?.address !== 'string') {
    throw new Error('the app was built without its settings: see app.config.ts');
  }
  return settings;
}
