// SPDX-License-Identifier: MIT
// The routes, as Expo Router finds them in app/, and as the session allows them. The app runs
// on the simulated cloud, as every build does unless its machine names a cloud.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

// Every page in app/studio/, so that a new one cannot escape the guard.
const STUDIO = readdirSync(join(__dirname, '..', 'app', 'studio'))
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => (name === 'index.tsx' ? '/studio' : `/studio/${name.slice(0, -'.tsx'.length)}`));

/** Sign in as a test person, from the sign-in screen, and wait for the homes. */
async function signIn(name = 'Linh') {
  await fireEvent.changeText(await screen.findByTestId('sign-in-name'), name);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('header', { name: 'Welcome' });
}

test('signed out, the first screen is signing in', async () => {
  await renderRouter('app', { initialUrl: '/' });
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
  expect(screen).toHavePathname('/sign-in');
});

test('signed in, the homes; signed out from the account, signing in again', async () => {
  await renderRouter('app', { initialUrl: '/' });
  await signIn('Linh');
  expect(screen).toHavePathname('/');
  // The header's account button is native, which Jest does not draw: AccountButton's own test
  // presses it.
  await act(() => router.push('/account'));
  expect(await screen.findByRole('header', { name: 'Linh' })).toBeOnTheScreen();
  expect(screen).toHavePathname('/account');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
  expect(screen).toHavePathname('/sign-in');
});

test('a new owner creates a home, named as their own, and the main screen is that home', async () => {
  const app = await renderRouter('app', { initialUrl: '/' });
  await signIn('Linh');
  await fireEvent.press(screen.getByRole('button', { name: 'Create a home' }));
  expect(await screen.findByDisplayValue("Linh's home")).toBeOnTheScreen();
  expect(screen).toHavePathname('/homes/new');
  await fireEvent.press(screen.getByRole('button', { name: 'Create the home' }));
  // The name as the person kept it: no invisible mark came with the default.
  expect(await screen.findByRole('header', { name: "Linh's home" })).toBeOnTheScreen();
  expect(app.getPathname()).toMatch(/^\/homes\/[0-9a-f-]{36}$/);
});

test('the studio has its pages', () => {
  expect(STUDIO.sort()).toEqual([
    '/studio',
    '/studio/colors',
    '/studio/components',
    '/studio/layout',
    '/studio/motion',
    '/studio/type',
  ]);
});

test.each(STUDIO)('the development app opens %s, signed in or not', async (path) => {
  await renderRouter('app', { initialUrl: path });
  await waitFor(() => expect(screen).toHavePathname(path));
  expect(screen.queryByRole('header', { name: 'Sign in' })).toBeNull();
});

describe('in the released app', () => {
  const settings = Constants.expoConfig!.extra!.settings;

  beforeEach(() => {
    settings.studio = false;
  });

  afterEach(() => {
    settings.studio = true;
  });

  test.each(STUDIO)('%s does not open, and signing in does', async (path) => {
    await renderRouter('app', { initialUrl: path });
    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/sign-in');
  });
});
