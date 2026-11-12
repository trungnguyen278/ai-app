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
