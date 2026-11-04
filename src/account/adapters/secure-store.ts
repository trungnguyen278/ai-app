// SPDX-License-Identifier: MIT
// The phone's secure storage: the Keystore on Android, the Keychain on iOS (expo-secure-store,
// SDK 58). On Android it goes when the app is uninstalled; expo-secure-store's config plugin
// keeps it out of Auto Backup, from which it could not be decrypted.
import * as SecureStore from 'expo-secure-store';

import type { Secrets } from '../ports/secrets';

const OPTIONS: SecureStore.SecureStoreOptions = {
  // Only while the phone is unlocked, and never restored to another phone: a session is one
  // app on one phone (ai-platform ADR-0008).
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureStore: Secrets = {
  get: (name) => SecureStore.getItemAsync(name, OPTIONS),
  set: (name, value) => SecureStore.setItemAsync(name, value, OPTIONS),
  delete: (name) => SecureStore.deleteItemAsync(name, OPTIONS),
};
