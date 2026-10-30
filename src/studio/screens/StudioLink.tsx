// SPDX-License-Identifier: MIT
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { SPACE, Text } from '@/src/shared/design';

/** The way into the studio, for a header, in the development app. */
export function StudioLink() {
  const text = useText();
  return (
    <Link href="/studio" asChild>
      <Pressable hitSlop={SPACE.md}>
        <Text variant="label" ink="accent">
          {text('studio.title')}
        </Text>
      </Pressable>
    </Link>
  );
}
