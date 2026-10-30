// SPDX-License-Identifier: MIT
// What the app reads of its settings while it runs (docs/architecture.md, Configuration).
import Constants from 'expo-constants';

/** The settings app.config.ts puts in Expo's `extra`, from config/. */
export interface RuntimeSettings {
  /** Whether the studio can be opened (ADR-0003): in the development app only. */
  studio: boolean;
}

/** The app's settings, as built into it. */
export function runtimeSettings(): RuntimeSettings {
  const settings = Constants.expoConfig?.extra?.settings;
  if (typeof settings?.studio !== 'boolean') {
    throw new Error('the app was built without its settings: see app.config.ts');
  }
  return settings;
}
