// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { HomesScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** Every home the person is in, and a new one to create. */
export default function Homes() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.title') }} />
      <HomesScreen />
    </>
  );
}
