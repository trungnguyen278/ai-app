// SPDX-License-Identifier: MIT
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getConfig, type ConfigContext } from 'expo/config';

import appConfig, {
  catalogLanguages,
  CLOUD_ADDRESS_VARIABLE,
  ENVIRONMENT_VARIABLE,
  loadSettings,
  merge,
  runtimeSettings,
  SOURCE_LANGUAGE,
} from '@/app.config';
import { CATALOGS, SOURCE } from '@/src/shared/catalog';
import { PALETTE } from '@/src/shared/design';

const CONFIG = join(__dirname, '..', 'config');

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'config-'));
  cpSync(CONFIG, directory, { recursive: true });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

test('every environment is complete', () => {
  for (const environment of ['development', 'production']) {
    expect(loadSettings(environment).app.slug).toBe('ai-app');
  }
});

test('the environment is base, then its file, then local.toml', () => {
  expect(loadSettings('production', directory).app.android_package).toBe(
    'io.github.trungnguyen278.aiapp',
  );
  expect(loadSettings('development', directory).app.android_package).toBe(
    'io.github.trungnguyen278.aiapp.dev',
  );
  writeFileSync(join(directory, 'local.toml'), '[app]\nname = "Mine"\n');
  expect(loadSettings('development', directory).app).toMatchObject({
    name: 'Mine',
    android_package: 'io.github.trungnguyen278.aiapp.dev',
  });
});

test('the environment is required and must exist', () => {
  expect(() => loadSettings(undefined, directory)).toThrow(ENVIRONMENT_VARIABLE);
  expect(() => loadSettings('', directory)).toThrow(ENVIRONMENT_VARIABLE);
  expect(() => loadSettings('staging', directory)).toThrow(
    "unknown environment 'staging' (available: development, production)",
  );
});

test.each([
  ['a missing value', '[app]\nscheme = "x"\n', 'base.toml', "must have required property 'name'"],
  [
    'an unknown key',
    '[app]\nnmae = "x"\n',
    'local.toml',
    '/app must NOT have additional properties (nmae)',
  ],
  ['a wrong type', '[app]\nname = 3\n', 'local.toml', '/app/name must be string'],
  [
    'a bad identifier',
    '[app]\nandroid_package = "1x"\n',
    'local.toml',
    '/app/android_package must match',
  ],
  ['malformed TOML', '[app\n', 'local.toml', 'local.toml'],
])('%s stops the build, named', (_, text, file, problem) => {
  writeFileSync(join(directory, file), text);
  expect(() => loadSettings('production', directory)).toThrow(problem);
});

test('a problem never shows the value', () => {
  writeFileSync(join(directory, 'local.toml'), '[app]\nandroid_package = "s3cr3t!"\n');
  expect(() => loadSettings('production', directory)).toThrow(/^(?!.*s3cr3t).*$/s);
});

test('merge merges tables and replaces the rest', () => {
  const base = { a: { b: 1, c: [1, 2] }, d: 1 };
  const override = { a: { c: [3] }, d: { e: 2 } };
  expect(merge(base, override)).toEqual({ a: { b: 1, c: [3] }, d: { e: 2 } });
  expect(base).toEqual({ a: { b: 1, c: [1, 2] }, d: 1 });
});

test('the languages offered to the system are the catalogs in locales/', () => {
  expect(catalogLanguages()).toEqual(['en', 'vi']);
});

test('only the development app has the studio', () => {
  expect(runtimeSettings(loadSettings('development')).studio).toBe(true);
  expect(runtimeSettings(loadSettings('production')).studio).toBe(false);
});

test('every build talks to the simulated cloud, unless its machine names a cloud', () => {
  for (const environment of ['development', 'production']) {
    expect(runtimeSettings(loadSettings(environment)).cloud.address).toBe('simulated');
  }
  writeFileSync(join(directory, 'local.toml'), '[cloud]\naddress = "https://mine.example"\n');
  expect(loadSettings('production', directory).cloud.address).toBe('https://mine.example');
  const variables = { [CLOUD_ADDRESS_VARIABLE]: 'https://release.example/' };
  expect(loadSettings('production', directory, variables).cloud.address).toBe(
    'https://release.example/',
  );
  const unset = { [CLOUD_ADDRESS_VARIABLE]: '' };
  expect(loadSettings('production', directory, unset).cloud.address).toBe('https://mine.example');
});

test("http:// only where the environment allows it, to a developer's own machine (SEC-1)", () => {
  const plain = { [CLOUD_ADDRESS_VARIABLE]: 'http://192.168.1.20:8000' };
  expect(loadSettings('development', directory, plain).cloud.address).toBe(
    'http://192.168.1.20:8000',
  );
  expect(() => loadSettings('production', directory, plain)).toThrow('SEC-1');
  expect(() => loadSettings('production', directory, plain)).toThrow(/^(?!.*192\.168).*$/s);
});

test.each([
  'cloud.example',
  'ftp://cloud.example',
  'https://cloud.example/?debug=1',
  'https://cloud.example/#join',
  'https://user:secret@cloud.example',
  'simulated ',
])('a cloud address such as %j stops the build', (address) => {
  const variables = { [CLOUD_ADDRESS_VARIABLE]: address };
  expect(() => loadSettings('development', directory, variables)).toThrow(
    '/cloud/address must match',
  );
});

test.each(['https://cloud.example', 'https://cloud.example:8443/base/', 'http://[::1]:8000'])(
  'a cloud address such as %j is one',
  (address) => {
    const variables = { [CLOUD_ADDRESS_VARIABLE]: address };
    expect(loadSettings('development', directory, variables).cloud.address).toBe(address);
  },
);

describe("Expo's configuration", () => {
  const variables = [ENVIRONMENT_VARIABLE, CLOUD_ADDRESS_VARIABLE];
  const saved = variables.map((name) => process.env[name]);

  beforeEach(() => {
    process.env[ENVIRONMENT_VARIABLE] = 'production';
    delete process.env[CLOUD_ADDRESS_VARIABLE];
  });

  afterEach(() => {
    variables.forEach((name, index) => {
      if (saved[index] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[index];
      }
    });
  });

  const expo = () => appConfig({ config: {} } as ConfigContext);

  test("follows the phone's appearance, from a splash screen in the design's colours", () => {
    expect(expo().userInterfaceStyle).toBe('automatic');
    const splash = expo().plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    expect(splash).toEqual([
      'expo-splash-screen',
      { backgroundColor: PALETTE.light.canvas, dark: { backgroundColor: PALETTE.dark.canvas } },
    ]);
  });

  test("asks for the camera in each catalog's language, and never for the microphone", () => {
    const camera = expo().plugins?.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera',
    );
    expect(camera).toEqual([
      'expo-camera',
      {
        cameraPermission: CATALOGS.en['native.camera'],
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ]);
    expect(expo().locales).toEqual(
      Object.fromEntries(
        Object.entries(CATALOGS).map(([language, messages]) => [
          language,
          { ios: { NSCameraUsageDescription: messages['native.camera'] } },
        ]),
      ),
    );
    expect(expo().locales?.vi).not.toEqual(expo().locales?.en);
    expect(expo().ios?.infoPlist?.CFBundleAllowMixedLocalizations).toBe(true);
    expect(SOURCE_LANGUAGE).toBe(SOURCE);
  });

  test('carries the settings the app reads while it runs', () => {
    expect(expo().extra?.settings).toEqual(runtimeSettings(loadSettings('production')));
  });

  test("names the cloud that the building machine's environment names", () => {
    process.env[CLOUD_ADDRESS_VARIABLE] = 'https://release.example';
    expect(expo().extra?.settings.cloud.address).toBe('https://release.example');
  });

  test("is read by Expo's tools, as a build reads it, in every environment", () => {
    for (const environment of ['development', 'production']) {
      process.env[ENVIRONMENT_VARIABLE] = environment;
      const { exp } = getConfig(join(__dirname, '..'), { skipSDKVersionRequirement: true });
      expect(exp.extra?.settings).toEqual(runtimeSettings(loadSettings(environment)));
    }
  });
});
