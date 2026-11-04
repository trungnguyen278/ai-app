// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { JoinScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/**
 * Joining a home: the path of an invitation's link, the cloud's address then /join#, then the
 * code (the app API, Invitations). Expo Router gives the fragment as the `#` parameter. A new
 * link starts the screen afresh.
 */
export default function Join() {
  const text = useText();
  const { '#': link } = useLocalSearchParams<{ '#'?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: text('join.title') }} />
      <JoinScreen key={link ?? ''} link={link} />
    </>
  );
}
