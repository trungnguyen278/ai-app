// SPDX-License-Identifier: MIT
import { StyleSheet } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { Screen, Text } from '@/src/shared/design';

/** The owner's homes: none until sign-in and the cloud's homes exist (docs/architecture.md). */
export function HomeScreen() {
  const text = useText();
  return (
    <Screen style={styles.page}>
      <Text ink="textMuted">{text('homes.empty')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', justifyContent: 'center' },
});
