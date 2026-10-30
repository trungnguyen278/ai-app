// SPDX-License-Identifier: MIT
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native';

import {
  Button,
  DISABLED_OPACITY,
  PALETTE,
  Press,
  PRESS,
  Text,
  withOpacity,
} from '@/src/shared/design';

import { design, renderScreen } from '../../render';

function Pressed(props: Partial<Parameters<typeof Press>[0]>) {
  return (
    <Press accessibilityRole="button" accessibilityLabel="Pressed" onPress={() => {}} {...props}>
      <Text>Pressed</Text>
    </Press>
  );
}

const target = () => screen.getByRole('button', { name: 'Pressed' });

test('a press shrinks what is pressed a little, and lets go', async () => {
  await renderScreen(<Pressed />);
  expect(target()).toHaveStyle({ transform: [{ scale: 1 }] });
  await fireEvent(target(), 'pressIn');
  expect(target()).toHaveStyle({ transform: [{ scale: PRESS.scale }] });
  await fireEvent(target(), 'pressOut');
  expect(target()).toHaveStyle({ transform: [{ scale: 1 }] });
});

test('with reduce motion on, a press dims instead of shrinking', async () => {
  await renderScreen(<Pressed />);
  await act(() => design().setMotion('reduced'));
  await fireEvent(target(), 'pressIn');
  expect(target()).toHaveStyle({ opacity: PRESS.opacity });
  expect(target()).not.toHaveStyle({ transform: [{ scale: PRESS.scale }] });
});

test('a row as wide as the screen lights up instead', async () => {
  await renderScreen(<Pressed feedback="light" />);
  expect(target()).toHaveStyle({ backgroundColor: 'transparent' });
  await fireEvent(target(), 'pressIn');
  expect(target()).toHaveStyle({ backgroundColor: PALETTE.light.fill });
});

test("at rest, the caller's style wins, even with reduce motion on", async () => {
  await renderScreen(<Pressed style={{ opacity: DISABLED_OPACITY }} />);
  await act(() => design().setMotion('reduced'));
  expect(target()).toHaveStyle({ opacity: DISABLED_OPACITY });
});

test('a press plays its haptic as it commits, and only then', async () => {
  const tick = jest.spyOn(Haptics, 'selectionAsync');
  const onPress = jest.fn();
  await renderScreen(<Pressed haptic="select" onPress={onPress} />);
  await fireEvent(target(), 'pressIn');
  expect(tick).not.toHaveBeenCalled();
  await fireEvent.press(target());
  expect(tick).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledTimes(1);
  tick.mockRestore();
});

test('without a haptic, a press plays none', async () => {
  const tick = jest.spyOn(Haptics, 'selectionAsync');
  await renderScreen(<Pressed />);
  await fireEvent.press(target());
  expect(tick).not.toHaveBeenCalled();
  tick.mockRestore();
});

describe('a button', () => {
  test.each([
    ['primary', 'accent'],
    ['secondary', 'accentSoft'],
  ] as const)('%s is filled with the %s', async (variant, fill) => {
    await renderScreen(<Button variant={variant} label="Go" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({
      backgroundColor: design().theme.color[fill],
    });
  });

  test('primary glows in the tone; the others do not', async () => {
    await renderScreen(
      <>
        <Button label="Primary" onPress={() => {}} />
        <Button variant="plain" label="Plain" onPress={() => {}} />
      </>,
    );
    const shadow = (name: string) =>
      StyleSheet.flatten(screen.getByRole('button', { name }).props.style).boxShadow;
    const { color, glowOpacity } = design().theme;
    expect(shadow('Primary')).toEqual([
      expect.objectContaining({ color: withOpacity(color.glow, glowOpacity) }),
    ]);
    expect(shadow('Plain')).toBeUndefined();
  });

  test('a disabled button is faint, and does nothing', async () => {
    const onPress = jest.fn();
    await renderScreen(<Button label="Go" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ opacity: DISABLED_OPACITY });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a busy button pulses, keeps its name, and does nothing more', async () => {
    const onPress = jest.fn();
    await renderScreen(<Button label="Connecting" onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: 'Connecting' });
    expect(button).toBeBusy();
    expect(screen.queryByText('Connecting')).toBeNull();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
