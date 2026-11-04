// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { PersonScreen, usePersonName } from '@/src/homes';
import { useText } from '@/src/shared/catalog';

/** One person in a home, under their name there once it is read. */
export default function Person() {
  const text = useText();
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const name = usePersonName(id, memberId);
  return (
    <>
      <Stack.Screen options={{ title: name ?? text('homes.person.title') }} />
      <PersonScreen homeId={id} memberId={memberId} />
    </>
  );
}
