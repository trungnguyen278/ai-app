// SPDX-License-Identifier: MIT
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import { RADIUS, Screen, SPACE, Text, useTheme, VIEW_BLEND } from '@/src/shared/design';

import { Row, Section } from './parts';

/** The spacing scale, at its true sizes, and the corners. */
export function LayoutScreen() {
  const text = useText();
  const { color } = useTheme();
  return (
    <Screen scroll>
      <Section title={text('studio.layout.space')}>
        {Object.entries(SPACE).map(([name, size]) => (
          <Row key={name}>
            <Text variant="label" style={styles.name}>
              {name}
            </Text>
            <Animated.View
              style={[styles.bar, { width: size, backgroundColor: color.accent }, VIEW_BLEND]}
            />
            <Text variant="caption" ink="textMuted">
              {String(size)}
            </Text>
          </Row>
        ))}
      </Section>
      <Section title={text('studio.layout.radius')}>
        <Row>
          {Object.entries(RADIUS).map(([name, radius]) => (
            <View key={name} style={styles.corner}>
              <View
                style={[
                  styles.shape,
                  { borderRadius: radius, backgroundColor: color.fill, borderColor: color.outline },
                ]}
              />
              <Text variant="caption" ink="textMuted">
                {name}
              </Text>
            </View>
          ))}
        </Row>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { minWidth: SPACE.xxxl },
  bar: { height: SPACE.sm, borderRadius: RADIUS.full },
  corner: { flex: 1, alignItems: 'center', gap: SPACE.xs },
  shape: {
    width: SPACE.xxxl,
    height: SPACE.xxxl,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
