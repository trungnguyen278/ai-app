// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { useText } from '@/src/shared/catalog';
import { SetupScreen } from '@/src/setup';

/** Adding a device to the home, for its owner and admins. */
export default function NewDevice() {
  const text = useText();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: text('setup.title') }} />
      <SetupScreen homeId={id} />
    </>
  );
}
