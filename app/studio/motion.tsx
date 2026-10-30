// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { useText } from '@/src/shared/catalog';
import { MotionScreen } from '@/src/studio';

/** A page of the studio, which opens in the development app only (app/_layout.tsx). */
export default function MotionPage() {
  const text = useText();
  return (
    <>
      <Stack.Screen options={{ title: text('studio.motion') }} />
      <MotionScreen />
    </>
  );
}
