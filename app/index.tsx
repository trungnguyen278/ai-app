// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { HomeScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** The first screen: the owner's homes. */
export default function Index() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.title') }} />
      <HomeScreen />
    </>
  );
}
