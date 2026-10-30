// SPDX-License-Identifier: MIT
// The routes, as Expo Router finds them in app/.
import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

test("the first screen is the owner's homes", async () => {
  await renderRouter('app', { initialUrl: '/' });
  expect(screen).toHavePathname('/');
  expect(screen.getByText('You have no home yet.')).toBeOnTheScreen();
});
