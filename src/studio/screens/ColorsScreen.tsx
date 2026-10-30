// SPDX-License-Identifier: MIT
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import {
  deriveTone,
  GLOW_RADIUS,
  leastContrast,
  RADIUS,
  Screen,
  SPACE,
  Text,
  useTheme,
  VIEW_BLEND,
  withOpacity,
} from '@/src/shared/design';

import { ROBOT_TONES } from '../tones';
import { ColorRow, Row, Section } from './parts';

/** The colours of the theme on show, with the contrast each must reach and does. */
export function ColorsScreen() {
  const text = useText();
  const { scheme, color, glowOpacity } = useTheme();
  const backgrounds = [color.canvas, color.surface, color.fill];
  // Each of the robot's tones in this theme, worked out once per theme.
  const tones = useMemo(
    () =>
      Object.entries(ROBOT_TONES).map(([name, tone]) => ({ name, ...deriveTone(tone, scheme) })),
    [scheme],
  );
  const least = (ink: string, against: readonly string[]) =>
    text('studio.colors.least', { ratio: leastContrast(ink, against) });
  const glow = {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: GLOW_RADIUS.md,
        color: withOpacity(color.glow, glowOpacity),
      },
    ],
  };
  return (
    <Screen scroll>
      <Section title={text('studio.colors.neutrals')}>
        <ColorRow name="canvas" value={color.canvas} />
        <ColorRow name="surface" value={color.surface} />
        <ColorRow name="fill" value={color.fill} />
        <ColorRow name="hairline" value={color.hairline} />
        <ColorRow name="outline" value={color.outline} detail={least(color.outline, backgrounds)} />
        <ColorRow
          name="textMuted"
          value={color.textMuted}
          detail={least(color.textMuted, backgrounds)}
        />
        <ColorRow name="text" value={color.text} detail={least(color.text, backgrounds)} />
      </Section>
      <Section title={text('studio.colors.tone')}>
        <ColorRow
          name="accent"
          value={color.accent}
          detail={least(color.accent, [...backgrounds, color.accentSoft])}
        />
        <ColorRow
          name="onAccent"
          value={color.onAccent}
          detail={least(color.onAccent, [color.accent])}
        />
        <ColorRow name="accentSoft" value={color.accentSoft} />
        <ColorRow name="glow" value={color.glow} />
        <Row>
          <Animated.View style={[styles.sample, { backgroundColor: color.accent }, VIEW_BLEND]}>
            <Text variant="label" ink="onAccent">
              {text('studio.colors.sample')}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.sample, { backgroundColor: color.accentSoft }, VIEW_BLEND]}>
            <Text variant="label" ink="accent">
              {text('studio.colors.sample')}
            </Text>
          </Animated.View>
          <View style={[styles.light, { backgroundColor: color.glow }, glow]} />
        </Row>
      </Section>
      <Section title={text('studio.colors.tones')}>
        {tones.map(({ name, accent, accentSoft }) => (
          <ColorRow
            key={name}
            name={text(`studio.tone.${name}`)}
            value={accent}
            detail={least(accent, [...backgrounds, accentSoft])}
          />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sample: {
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.full,
  },
  light: { width: SPACE.lg, height: SPACE.lg, marginLeft: SPACE.sm, borderRadius: RADIUS.full },
});
