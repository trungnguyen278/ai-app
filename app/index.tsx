// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { HomeScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';
import { runtimeSettings } from '@/src/shared/config';
import { StudioLink } from '@/src/studio';

/** The first screen: the owner's homes. The development app opens the studio from here. */
export default function Index() {
  const text = useText();
  const studio = runtimeSettings().studio;
  return (
    <>
      <Stack.Screen
        options={{
          title: text('homes.title'),
          headerRight: studio ? () => <StudioLink /> : undefined,
        }}
      />
      <HomeScreen />
    </>
  );
}
