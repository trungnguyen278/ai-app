// SPDX-License-Identifier: MIT
import { StyleSheet, Text, View } from 'react-native';

import { useText } from '@/src/shared/catalog';

/** The owner's homes: none until sign-in and the cloud's homes exist (docs/architecture.md). */
export function HomeScreen() {
  const text = useText();
  return (
    <View style={styles.page}>
      <Text>{text('homes.empty')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
