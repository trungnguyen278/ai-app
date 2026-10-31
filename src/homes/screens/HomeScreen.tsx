// SPDX-License-Identifier: MIT
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import {
  Appear,
  Glow,
  HERO,
  RADIUS,
  Screen,
  SPACE,
  Text,
  useTheme,
  VIEW_BLEND,
} from '@/src/shared/design';

/**
 * The owner's homes: none until sign-in and the cloud's homes exist (docs/architecture.md).
 * With none yet, the screen is a rare moment, met by a new owner: the robot's light breathes,
 * and a welcome arrives under it. Its action, setting a robot up, comes with set-up.
 */
export function HomeScreen() {
  const text = useText();
  const { color } = useTheme();
  return (
    <Screen style={styles.page}>
      <Appear index={0}>
        <View style={styles.light}>
          <Glow testID="home-light" size={HERO} breathing style={StyleSheet.absoluteFill} />
          {/* The light's source, bright at the heart of its halo. */}
          <Animated.View
            aria-hidden
            style={[styles.source, { backgroundColor: color.glow }, VIEW_BLEND]}
          />
        </View>
      </Appear>
      <Appear index={1}>
        <Text variant="display" style={styles.centred}>
          {text('homes.welcome')}
        </Text>
      </Appear>
      <Appear index={2}>
        <Text ink="textMuted" style={styles.centred}>
          {text('homes.empty')}
        </Text>
      </Appear>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', justifyContent: 'center' },
  light: { width: HERO, height: HERO, alignItems: 'center', justifyContent: 'center' },
  source: { width: SPACE.xl, height: SPACE.xl, borderRadius: RADIUS.full },
  centred: { textAlign: 'center' },
});
