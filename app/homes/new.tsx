// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { CreateHomeScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** A new home, whose owner is the person signed in. */
export default function NewHome() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.new.title') }} />
      <CreateHomeScreen />
    </>
  );
}
