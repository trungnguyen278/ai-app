// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { AddProfileScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** A new profile in the home: a person who never signs in. */
export default function NewProfile() {
  const text = useText();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: text('homes.profile.title') }} />
      <AddProfileScreen homeId={id} />
    </>
  );
}
