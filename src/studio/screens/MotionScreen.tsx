// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import {
  Appear,
  Button,
  Glow,
  HERO,
  Pulse,
  RADIUS,
  Screen,
  Skeleton,
  SPACE,
  Text,
  useTheme,
} from '@/src/shared/design';

import { Row, Section, ToneChoice } from './parts';

/** Motion, to watch: things arriving and leaving, waiting, and light that breathes. */
export function MotionScreen() {
  const text = useText();
  const { color } = useTheme();
  const [round, setRound] = useState(0);
  const [count, setCount] = useState(3);
  return (
    <Screen scroll>
      <Section title={text('studio.motion.appear')}>
        {/* A new round mounts the items again, so that they enter again. */}
        <View key={round} style={styles.items}>
          {Array.from({ length: count }, (_, index) => (
            <Appear key={index} index={index}>
              <View style={[styles.item, { backgroundColor: color.fill }]}>
                <Text>{text('studio.motion.item', { number: index + 1 })}</Text>
              </View>
            </Appear>
          ))}
        </View>
        <View style={styles.buttons}>
          <Button
            variant="secondary"
            label={text('studio.motion.replay')}
            onPress={() => setRound((now) => now + 1)}
          />
          <Button
            variant="plain"
            label={text('studio.motion.add')}
            onPress={() => setCount((now) => now + 1)}
          />
          <Button
            variant="plain"
            label={text('studio.motion.remove')}
            disabled={count === 0}
            onPress={() => setCount((now) => Math.max(0, now - 1))}
          />
        </View>
      </Section>
      <Section title={text('studio.motion.waiting')}>
        <View style={styles.items}>
          <Skeleton width="70%" height={SPACE.lg} />
          <Skeleton width="100%" height={SPACE.lg} />
          <Skeleton width="45%" height={SPACE.lg} />
        </View>
        <Row>
          <Pulse label={text('studio.motion.loading')} />
        </Row>
      </Section>
      <Section title={text('studio.motion.glow')}>
        <View style={styles.light}>
          <Glow size={HERO} breathing />
        </View>
        <Row>
          <ToneChoice />
        </Row>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  items: { gap: SPACE.sm, padding: SPACE.lg },
  item: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
  },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, padding: SPACE.lg },
  light: { alignItems: 'center' },
});
