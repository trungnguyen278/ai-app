// SPDX-License-Identifier: MIT
// The routes, as Expo Router finds them in app/.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { screen } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { renderRouter } from 'expo-router/testing-library';

// Every page in app/studio/, so that a new one cannot escape the guard.
const STUDIO = readdirSync(join(__dirname, '..', 'app', 'studio'))
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => (name === 'index.tsx' ? '/studio' : `/studio/${name.slice(0, -'.tsx'.length)}`));

test("the first screen is the owner's homes", async () => {
  await renderRouter('app', { initialUrl: '/' });
  expect(screen).toHavePathname('/');
  expect(screen.getByRole('header', { name: 'Welcome' })).toBeOnTheScreen();
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

test.each(STUDIO)('the development app opens %s', async (path) => {
  await renderRouter('app', { initialUrl: path });
  expect(screen).toHavePathname(path);
});

describe('in the released app', () => {
  const settings = Constants.expoConfig!.extra!.settings;

  beforeEach(() => {
    settings.studio = false;
  });

  afterEach(() => {
    settings.studio = true;
  });

  test.each(STUDIO)('%s does not open, and the homes do', async (path) => {
    await renderRouter('app', { initialUrl: path });
    expect(screen).toHavePathname('/');
    expect(screen.getByRole('header', { name: 'Welcome' })).toBeOnTheScreen();
  });
});
