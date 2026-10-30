// SPDX-License-Identifier: MIT
// The app's configuration (docs/architecture.md, Configuration): config/base.toml, then the
// environment's file, then an optional, git-ignored config/local.toml, merged and checked
// against config/schema.json. Expo reads this file when it starts or builds the app, and
// cannot import TypeScript modules from it, so the loader lives here.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { parse } from 'smol-toml';

export const ENVIRONMENT_VARIABLE = 'AI_APP_ENVIRONMENT';

const CONFIG_DIR = join(__dirname, 'config');
const LOCALES_DIR = join(__dirname, 'locales');
// The design system's colours (ADR-0003), which the splash screen shares with the app.
const PALETTE = join(__dirname, 'src', 'shared', 'design', 'palette.json');

type Table = { [key: string]: unknown };

export interface Settings {
  app: {
    name: string;
    slug: string;
    scheme: string;
    android_package: string;
    ios_bundle_identifier: string;
  };
  studio: { enabled: boolean };
}

/** What the app reads of its settings while it runs, in Expo's `extra` (src/shared/config). */
export function runtimeSettings(settings: Settings) {
  return { studio: settings.studio.enabled };
}

/** The settings of `environment`, from the files of `directory`, checked. */
export function loadSettings(environment: string | undefined, directory = CONFIG_DIR): Settings {
  if (!environment) {
    throw new Error(`${ENVIRONMENT_VARIABLE} is not set: name an environment (see .env.example)`);
  }
  const available = readdirSync(join(directory, 'environments'))
    .filter((name) => name.endsWith('.toml'))
    .map((name) => name.slice(0, -'.toml'.length))
    .sort();
  if (!available.includes(environment)) {
    const names = available.join(', ') || 'none';
    throw new Error(`unknown environment '${environment}' (available: ${names})`);
  }
  let settings = read(join(directory, 'base.toml'));
  settings = merge(settings, read(join(directory, 'environments', `${environment}.toml`)));
  const local = join(directory, 'local.toml');
  if (existsSync(local)) {
    settings = merge(settings, read(local));
  }
  const schema = JSON.parse(readFileSync(join(directory, 'schema.json'), 'utf8'));
  const validate = new Ajv2020({ allErrors: true }).compile<Settings>(schema);
  if (!validate(settings)) {
    // Each problem names where it is, never the value.
    const problems = (validate.errors ?? []).map((error) => {
      const where = error.instancePath || '/';
      const extra = error.params.additionalProperty;
      return `${where} ${error.message}${extra ? ` (${extra})` : ''}`;
    });
    throw new Error(`configuration: ${problems.join('; ')}`);
  }
  return settings;
}

/** `base` with `override` on top: tables merge key by key, any other value is replaced. */
export function merge(base: Table, override: Table): Table {
  const merged: Table = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    merged[key] = isTable(current) && isTable(value) ? merge(current, value) : value;
  }
  return merged;
}

function isTable(value: unknown): value is Table {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function read(path: string): Table {
  try {
    return parse(readFileSync(path, 'utf8')) as Table;
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The languages the app has catalogs for, from locales/: the system offers them to people. */
export function catalogLanguages(directory = LOCALES_DIR): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const settings = loadSettings(process.env[ENVIRONMENT_VARIABLE]);
  const { app } = settings;
  const { version } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  const { light, dark } = JSON.parse(readFileSync(PALETTE, 'utf8'));
  const languages = catalogLanguages();
  return {
    ...config,
    name: app.name,
    slug: app.slug,
    scheme: app.scheme,
    version,
    // The app follows the phone's light or dark appearance (ADR-0003).
    userInterfaceStyle: 'automatic',
    android: { package: app.android_package },
    ios: { bundleIdentifier: app.ios_bundle_identifier },
    plugins: [
      'expo-router',
      'expo-status-bar',
      'expo-system-ui',
      [
        'expo-splash-screen',
        { backgroundColor: light.canvas, dark: { backgroundColor: dark.canvas } },
      ],
      ['expo-localization', { supportedLocales: { android: languages, ios: languages } }],
    ],
    extra: { ...config.extra, settings: runtimeSettings(settings) },
    experiments: { typedRoutes: true },
  };
};
