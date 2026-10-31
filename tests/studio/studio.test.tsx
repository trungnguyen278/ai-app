// SPDX-License-Identifier: MIT
import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { TARGET } from '@/src/shared/design';
import {
  ColorsScreen,
  ComponentsScreen,
  LayoutScreen,
  MotionScreen,
  ROBOT_TONES,
  StudioScreen,
  TypeScreen,
} from '@/src/studio';

import { design, renderScreen } from '../render';

// The tones' names in English, as the catalog gives them.
const TONE_NAMES: Record<string, string> = {
  cyan: 'Cyan',
  warm: 'Warm',
  rose: 'Rose',
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  purple: 'Purple',
  orange: 'Orange',
  white: 'White',
};

test('the studio chooses the appearance', async () => {
  await renderScreen(<StudioScreen />);
  const [system] = screen.getAllByRole('radio', { name: 'System' });
  expect(system).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(design().theme.scheme).toBe('dark');
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(screen.getAllByRole('radio', { name: 'System' })[0]).not.toBeChecked();
});

test('the studio chooses the motion, whatever the phone asks', async () => {
  await renderScreen(<StudioScreen />);
  expect(design().motion).toBe('system');
  await fireEvent.press(screen.getByRole('radio', { name: 'Reduced' }));
  expect(design().reducedMotion).toBe(true);
  await fireEvent.press(screen.getByRole('radio', { name: 'Full' }));
  expect(design().reducedMotion).toBe(false);
  expect(screen.getByRole('radio', { name: 'Full' })).toBeChecked();
});

test('a choice ticks when it moves, and not when it stays', async () => {
  const tick = jest.spyOn(Haptics, 'selectionAsync');
  await renderScreen(<StudioScreen />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(tick).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(tick).toHaveBeenCalledTimes(1);
  tick.mockRestore();
});

test("the studio tries each of the robot's tones, named for screen readers", async () => {
  await renderScreen(<StudioScreen />);
  for (const [name, tone] of Object.entries(ROBOT_TONES)) {
    const label = TONE_NAMES[name];
    await fireEvent.press(screen.getByRole('radio', { name: label }));
    expect(design().tone).toBe(tone);
    expect(screen.getByRole('radio', { name: label })).toBeChecked();
  }
});

test('each page opens from a row, laid out as one', async () => {
  await renderScreen(<StudioScreen />);
  const rows = screen.getAllByRole('link');
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    expect(row).toHaveStyle({ flexDirection: 'row', minHeight: TARGET });
  }
});

test('the studio leads to each page, in the phone’s language', async () => {
  await renderScreen(<StudioScreen />, ['vi']);
  for (const page of ['Màu sắc', 'Chữ', 'Khoảng cách và góc bo', 'Thành phần', 'Chuyển động']) {
    expect(screen.getByRole('link', { name: page })).toBeOnTheScreen();
  }
});

test("the colours page shows every one of the robot's tones", async () => {
  await renderScreen(<ColorsScreen />);
  for (const name of Object.keys(ROBOT_TONES)) {
    expect(screen.getByText(TONE_NAMES[name])).toBeOnTheScreen();
  }
  expect(screen.getAllByText('Accent')).toHaveLength(2);
});

test('the colours page gives each contrast in the phone’s language', async () => {
  await renderScreen(<ColorsScreen />, ['vi']);
  // Vietnamese writes a decimal comma.
  expect(screen.getAllByText(/ít nhất \d+,\d+:1$/).length).toBeGreaterThan(0);
});

test.each([
  ['type', TypeScreen, 'Hello! Your robot is waiting for you at home.'],
  ['layout', LayoutScreen, 'Corners'],
])('the %s page shows', async (_, Page, text) => {
  await renderScreen(<Page />);
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
});

test('the components page shows a button of every weight and state', async () => {
  await renderScreen(<ComponentsScreen />);
  expect(screen.getAllByRole('button')).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'Not available' })).toBeDisabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Start or stop it' }));
  expect(screen.getByRole('button', { name: 'Connecting' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Connecting' })).toBeBusy();
});

test('the motion page adds and removes items', async () => {
  await renderScreen(<MotionScreen />);
  expect(screen.getByText('Item 3')).toBeOnTheScreen();
  expect(screen.queryByText('Item 4')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Add one' }));
  expect(screen.getByText('Item 4')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove one' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove one' }));
  expect(screen.queryByText('Item 3')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Replay' }));
  expect(screen.getByText('Item 2')).toBeOnTheScreen();
});
