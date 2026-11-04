// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { HomeScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** One of the person's homes, by its identifier: a notification or a link can open it. */
export default function Home() {
  const text = useText();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.title') }} />
      <HomeScreen homeId={id} />
    </>
  );
}
