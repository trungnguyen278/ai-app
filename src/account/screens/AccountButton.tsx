// SPDX-License-Identifier: MIT
import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { AVATAR, RADIUS, Text, TARGET, useTheme } from '@/src/shared/design';

import { usePerson } from '../AccountProvider';

/**
 * The way to the account, for a header: a disc with the first letter of the person's name, as
 * Google's apps show an account without a picture.
 */
export function AccountButton() {
  const text = useText();
  const { color } = useTheme();
  const account = usePerson();
  const initial = [...(account.data?.display_name.trim() ?? '')][0]?.toLocaleUpperCase() ?? '';
  return (
    <Link href="/account" asChild>
      {/* A link, as Link makes what it holds: it leads to another screen. */}
      <Pressable
        accessibilityLabel={text('account.title')}
        hitSlop={(TARGET - AVATAR) / 2}
        style={StyleSheet.flatten([styles.disc, { backgroundColor: color.accentSoft }])}
      >
        <Text variant="label" ink="accent" aria-hidden>
          {initial}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  disc: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
