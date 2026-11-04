// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** A link that lets one person join the home. */
export default function Invite() {
  const text = useText();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.invite.title') }} />
      <InviteScreen homeId={id} />
    </>
  );
}
