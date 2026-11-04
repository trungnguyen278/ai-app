// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';

import { SignInScreen } from '@/src/account';
import { useText } from '@/src/shared/catalog';
import { runtimeSettings } from '@/src/shared/config';
import { StudioLink } from '@/src/studio';

/** Signing in, until a session is signed in. The development app opens the studio from here. */
export default function SignIn() {
  const text = useText();
  const studio = runtimeSettings().studio;
  return (
    <>
      <Stack.Screen
        options={{
          title: text('sign_in.title'),
          headerRight: studio ? () => <StudioLink /> : undefined,
        }}
      />
      <SignInScreen />
    </>
  );
}
