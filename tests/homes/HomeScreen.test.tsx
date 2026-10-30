// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react-native';

import { HomeScreen } from '@/src/homes';

import { renderScreen } from '../render';

test.each([
  [['vi', 'en'], 'Bạn chưa có nhà nào.'],
  [['en'], 'You have no home yet.'],
])('in %j, it says there is no home yet', async (languages, text) => {
  await renderScreen(<HomeScreen />, languages);
  expect(screen.getByText(text)).toBeOnTheScreen();
});
