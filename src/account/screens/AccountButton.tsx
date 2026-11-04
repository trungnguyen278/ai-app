// SPDX-License-Identifier: MIT
import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { AVATAR, RADIUS, Text, TARGET, useTheme } from '@/src/shared/design';

import { useCloud } from '../AccountProvider';
import { ACCOUNT } from '../domain/keys';

/**
 * The way to the account, for a header: a disc with the first letter of the person's name, as
 * Google's apps show an account without a picture.
 */
export function AccountButton() {
  const text = useText();
  const cloud = useCloud();
  const { color } = useTheme();
  const account = useQuery({ queryKey: ACCOUNT, queryFn: () => cloud.account() });
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
