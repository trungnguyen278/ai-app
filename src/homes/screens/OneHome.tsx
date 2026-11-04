// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { Button, RADIUS, Screen, Skeleton, SPACE, Text, TYPE } from '@/src/shared/design';
import type { App } from '@/src/shared/protocols';

import { useHomes } from '../services/homes';

/**
 * A screen about one of the person's homes, once it is read: until then the shape of a page,
 * and what went wrong if it could not be, or that the person is not in that home.
 */
export function OneHome({
  homeId,
  children,
}: {
  homeId: string;
  children: (home: App.Home) => ReactNode;
}) {
  const text = useText();
  const homes = useHomes();
  if (homes.isPending) {
    return (
      <Screen style={styles.page}>
        <View accessibilityLabel={text('homes.loading')} style={styles.page}>
          <Skeleton width="80%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="60%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        </View>
      </Screen>
    );
  }
  if (homes.isError) {
    return (
      <Screen style={styles.page}>
        <Text ink="danger" accessibilityRole="alert">
          {text(failureMessage(homes.error))}
        </Text>
        <Button
          variant="secondary"
          label={text('homes.retry')}
          onPress={() => void homes.refetch()}
        />
      </Screen>
    );
  }
  const home = homes.data.find((each) => each.id === homeId);
  if (home === undefined) {
    return (
      <Screen style={styles.page}>
        <Text ink="textMuted">{text('homes.missing')}</Text>
      </Screen>
    );
  }
  return children(home);
}

const styles = StyleSheet.create({
  page: { gap: SPACE.md },
});
