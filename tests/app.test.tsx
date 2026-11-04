// SPDX-License-Identifier: MIT
// The routes, as Expo Router finds them in app/, and as the session allows them. The app runs
// on the simulated cloud, as every build does unless its machine names a cloud.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

// The first render of the router loads every route, which can take a busy machine longer than
// Jest's 5 seconds.
jest.setTimeout(15_000);

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

/** Sign in, create a home named as the person's own, and wait for it. */
async function createHome(name = 'Linh') {
  await signIn(name);
  await fireEvent.press(screen.getByRole('button', { name: 'Create a home' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Create the home' }));
  await screen.findByRole('header', { name: `${name}'s home` });
}

test('an owner adds a profile, and finds it among the people', async () => {
  const app = await renderRouter('app', { initialUrl: '/' });
  await createHome('Linh');
  const home = app.getPathname();
  await fireEvent.press(screen.getByRole('button', { name: 'Add a profile' }));
  expect(app.getPathname()).toBe(`${home}/profiles/new`);
  await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Bà');
  await fireEvent.press(screen.getByRole('button', { name: 'Add the profile' }));
  expect(await screen.findByText('Bà')).toBeOnTheScreen();
  expect(app.getPathname()).toBe(home);
});

test("an invitation's link opens the app, signs the person in where it is, and joining opens the home", async () => {
  const app = await renderRouter('app', { initialUrl: '/' });
  await createHome('Linh');
  const home = app.getPathname();
  await fireEvent.press(screen.getByRole('button', { name: 'Invite someone' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Make a link' }));
  // The simulated cloud has no address: its links are the app's own, with the scheme that Expo
  // Router's testing library gives.
  const link: string = (await screen.findByTestId('invitation-link')).props.children;
  expect(link).toMatch(/^[a-z]+:\/\/join#[A-Za-z0-9_-]{43}$/);
  // Linh signs out, and Minh opens the link on the same phone, with its simulated cloud.
  await act(() => router.push('/account'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
  await screen.findByRole('header', { name: 'Sign in' });
  await act(() => router.push(`/join${link.slice(link.indexOf('#'))}`));
  expect(await screen.findByRole('header', { name: 'You have an invitation' })).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByTestId('sign-in-name'), 'Minh');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('\u2068Linh\u2069 invites you to join')).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/join');
  await fireEvent.press(screen.getByRole('button', { name: 'Join the home' }));
  expect(await screen.findByText('\u2068Minh\u2069 (you)')).toBeOnTheScreen();
  expect(app.getPathname()).toBe(home);
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
