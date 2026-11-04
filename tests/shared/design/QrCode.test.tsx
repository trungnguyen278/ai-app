// SPDX-License-Identifier: MIT
// A QR code on the screen: named for screen readers, and each module a whole number of pixels,
// within the side asked for.
import { screen } from '@testing-library/react-native';
import { PixelRatio, StyleSheet } from 'react-native';

import { CODE_SIZE, QrCode } from '@/src/shared/design';
import { qrShape } from '@/src/shared/design/qr';

import { renderScreen } from '../../render';

const LINK = 'https://cloud.example/join#_qkVmTR2PblWSSdl5dzV2U5KeCbtmjs4Pd7HS-vBAx4';

test.each([1, 2, 3, 2.625])(
  'at %d pixels a point, each module is whole pixels, within the size',
  async (ratio) => {
    jest.spyOn(PixelRatio, 'get').mockReturnValue(ratio);
    await renderScreen(<QrCode value={LINK} size={CODE_SIZE} accessibilityLabel="The link" />);
    const code = screen.getByRole('image', { name: 'The link' });
    const { width, height } = StyleSheet.flatten(code.props.style);
    const { modules } = qrShape(LINK);
    expect(width).toBe(height);
    expect(width).toBeLessThanOrEqual(CODE_SIZE);
    expect(width).toBeGreaterThan(CODE_SIZE - modules / ratio);
    expect(Number.isInteger(Math.round(((width * ratio) / modules) * 1e9) / 1e9)).toBe(true);
    jest.restoreAllMocks();
  },
);
