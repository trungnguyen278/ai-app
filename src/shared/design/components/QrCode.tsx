// SPDX-License-Identifier: MIT
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';

import { RADIUS } from '../layout';
import { PALETTE } from '../palette';
import { qrShape } from '../qr';

export interface QrCodeProps {
  /** What the code carries, such as an invitation's link. */
  value: string;
  /** Its side, in points, at most: each module is a whole number of pixels, so it may be less. */
  size: number;
  /** What screen readers say of it: what it is for. */
  accessibilityLabel: string;
  /** How tests, and end-to-end tests, find the code. */
  testID?: string;
}

/**
 * A QR code, for another phone's camera to read: dark on light in both themes, and each module a
 * whole number of the screen's pixels, so that no edge blurs.
 */
export function QrCode({ value, size, accessibilityLabel, testID }: QrCodeProps) {
  const shape = useMemo(() => qrShape(value), [value]);
  const ratio = PixelRatio.get();
  const pixels = Math.max(1, Math.floor((size * ratio) / shape.modules));
  const side = (pixels * shape.modules) / ratio;
  const box = { width: side, height: side };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[styles.paper, box]}
    >
      <Canvas style={box}>
        <Group transform={[{ scale: side / shape.modules }]}>
          <Path path={shape.path} color={PALETTE.code.ink} />
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: PALETTE.code.paper, borderRadius: RADIUS.sm, overflow: 'hidden' },
});
