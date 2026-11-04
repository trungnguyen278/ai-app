// SPDX-License-Identifier: MIT
// The phone's secure storage: every call asks for an item readable while the phone is unlocked,
// and never restored to another phone.
import * as SecureStore from 'expo-secure-store';

import { secureStore } from '@/src/account/adapters/secure-store';

jest.mock('expo-secure-store', () => ({
  ...jest.requireActual('expo-secure-store'),
  getItemAsync: jest.fn(async () => 'kept'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

test('each call asks for the item to stay on this phone, readable while it is unlocked', async () => {
  expect(await secureStore.get('session.simulated')).toBe('kept');
  await secureStore.set('session.simulated', 'token');
  await secureStore.delete('session.simulated');
  const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session.simulated', options);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('session.simulated', 'token', options);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session.simulated', options);
});
