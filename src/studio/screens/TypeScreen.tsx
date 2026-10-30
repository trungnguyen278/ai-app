// SPDX-License-Identifier: MIT
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { Screen, SPACE, Text, TYPE, type TypeVariant } from '@/src/shared/design';

// Vietnamese's tallest and lowest marks, to see that no line clips them: a specimen, not a
// message, so it is not in the catalogs.
const MARKS = 'Ặ Ẫ Ở Ễ ặ ữ ỡ ỹ';

const VARIANTS = Object.keys(TYPE) as TypeVariant[];

/** The type scale, each step with a sentence and the marks. */
export function TypeScreen() {
  const text = useText();
  return (
    <Screen scroll>
      {VARIANTS.map((variant) => (
        <View key={variant} style={styles.specimen}>
          <Text variant="caption" ink="textMuted">
            {`${variant} · ${TYPE[variant].fontSize}/${TYPE[variant].lineHeight}`}
          </Text>
          <Text variant={variant}>{text('studio.type.sample')}</Text>
          <Text variant={variant} ink="accent">
            {MARKS}
          </Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  specimen: { gap: SPACE.xs, paddingBottom: SPACE.md },
});
