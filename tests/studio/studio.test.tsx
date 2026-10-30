// SPDX-License-Identifier: MIT
import { fireEvent, screen } from '@testing-library/react-native';

import { TARGET } from '@/src/shared/design';
import { ColorsScreen, LayoutScreen, ROBOT_TONES, StudioScreen, TypeScreen } from '@/src/studio';

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
  expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
  expect(design().theme.scheme).toBe('dark');
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'System' })).not.toBeChecked();
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
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row).toHaveStyle({ flexDirection: 'row', minHeight: TARGET });
  }
});

test('the studio leads to each page, in the phone’s language', async () => {
  await renderScreen(<StudioScreen />, ['vi']);
  for (const page of ['Màu sắc', 'Chữ', 'Khoảng cách và góc bo']) {
    expect(screen.getByText(page)).toBeOnTheScreen();
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
