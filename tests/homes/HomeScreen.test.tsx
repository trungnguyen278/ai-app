// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react-native';
import { withRepeat } from 'react-native-reanimated';

import { HomeScreen } from '@/src/homes';

import { renderScreen } from '../render';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withRepeat: jest.fn(actual.withRepeat) };
});

test.each([
  [
    ['vi', 'en'],
    'Chào mừng bạn',
    'Bạn chưa có nhà nào. Nhà của bạn, cùng các robot trong đó, sẽ hiện ở đây.',
  ],
  [['en'], 'Welcome', 'You have no home yet. Your homes, and the robots in them, will show here.'],
])(
  'in %j, a new owner is welcomed, and told there is no home yet',
  async (languages, welcome, empty) => {
    await renderScreen(<HomeScreen />, languages);
    expect(screen.getByRole('header', { name: welcome })).toBeOnTheScreen();
    expect(screen.getByText(empty)).toBeOnTheScreen();
  },
);

test("the robot's light breathes, for the eyes only", async () => {
  await renderScreen(<HomeScreen />);
  expect(screen.getByTestId('home-light', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByTestId('home-light')).toBeNull();
  expect(withRepeat).toHaveBeenCalled();
});

test('nothing on it can be pressed until set-up exists', async () => {
  await renderScreen(<HomeScreen />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();
});
