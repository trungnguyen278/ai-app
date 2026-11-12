// SPDX-License-Identifier: MIT
// The permissions the Android app asks for, as Expo's own introspection (`expo config --type
// introspect`) merges them: the template's, those of the plugins, and those blocked. Packages
// also add theirs when Gradle merges their manifests, which the introspection does not show:
// `blockedPermissions` removes them there too, and what a package asks for in a build is read
// from the build's merged manifest.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { BLOCKED_ANDROID_PERMISSIONS, ENVIRONMENT_VARIABLE } from '@/app.config';

const ROOT = join(__dirname, '..');

/**
 * What the app asks for, and why. A permission not listed here fails the test: whoever adds a
 * package that asks for one decides whether the app needs it, and else blocks it.
 */
const ASKED = [
  // The cloud.
  'android.permission.INTERNET',
  // Haptics (expo-haptics).
  'android.permission.VIBRATE',
  // The QR scanner (expo-camera). The microphone is declined in app.config.ts.
  'android.permission.CAMERA',
  // Expo's template asks for it, for the development menu's overlay; React Native's debug
  // manifest does as well. Whether a release build needs it is to settle before one is made.
  'android.permission.SYSTEM_ALERT_WINDOW',
];

interface Entry {
  $: Record<string, string>;
}

/** The `uses-permission` entries of the Android manifest, as the introspection merges them. */
function manifestPermissions(environment: string): Entry[] {
  const out = execFileSync(
    process.execPath,
    [join(ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'config', '--type', 'introspect', '--json'],
    { cwd: ROOT, env: { ...process.env, [ENVIRONMENT_VARIABLE]: environment }, encoding: 'utf8' },
  );
  const config = JSON.parse(out) as {
    _internal: {
      modResults: { android: { manifest: { manifest: { 'uses-permission': Entry[] } } } };
    };
  };
  const { manifest } = config._internal.modResults.android.manifest;
  return manifest['uses-permission'];
}

describe.each(['development', 'production'])(
  'the Android manifest of the %s app',
  (environment) => {
    const entries = manifestPermissions(environment);
    const asked = entries
      .filter((entry) => entry.$['tools:node'] !== 'remove')
      .map((entry) => entry.$['android:name']);

    test('asks for what the app uses, and nothing else', () => {
      expect([...asked].sort()).toEqual([...ASKED].sort());
    });

    test('removes what the template and the packages add and the app does not use', () => {
      const removed = entries
        .filter((entry) => entry.$['tools:node'] === 'remove')
        .map((entry) => entry.$['android:name']);
      expect(removed.sort()).toEqual([...BLOCKED_ANDROID_PERMISSIONS].sort());
    });
  },
);
