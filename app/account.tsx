// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { AccountScreen } from '@/src/account';
import { useText } from '@/src/shared/catalog';

/** The person signed in, and signing out. */
export default function Account() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('account.title') }} />
      <AccountScreen />
    </>
  );
}
