// SPDX-License-Identifier: MIT
import { Link, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { Button, Press, Screen, SPACE, Text } from '@/src/shared/design';

import { roleOf } from '../domain/people';
import { useHomes } from '../services/homes';

/** Every home the person is in, to open one, and a new one to create or join. */
export function HomesScreen() {
  const text = useText();
  const homes = useHomes();
  return (
    <Screen scroll style={styles.page}>
      {homes.isError && (
        <Text ink="danger" accessibilityRole="alert">
          {text(failureMessage(homes.error))}
        </Text>
      )}
      <View>
        {(homes.data ?? []).map((home) => (
          <Link key={home.id} href={`/homes/${home.id}`} asChild>
            <Press feedback="light" accessibilityLabel={home.name}>
              <View style={styles.row}>
                <Text>{home.name}</Text>
                <Text variant="caption" ink="textMuted">
                  {text(`homes.role.${roleOf(home.role)}`)}
                </Text>
              </View>
            </Press>
          </Link>
        ))}
      </View>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          label={text('homes.create')}
          onPress={() => router.push('/homes/new')}
        />
        <Button
          variant="secondary"
          label={text('homes.join')}
          onPress={() => router.push('/join')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xl },
  row: { paddingVertical: SPACE.md },
  actions: { gap: SPACE.md },
});
