// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { useText } from '@/src/shared/catalog';
import { TypeScreen } from '@/src/studio';

/** A page of the studio, which opens in the development app only (app/_layout.tsx). */
export default function TypePage() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('studio.type') }} />
      <TypeScreen />
    </>
  );
}
