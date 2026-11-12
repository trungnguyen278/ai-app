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
// The cloud a build talks to, set on the machine that builds it (ADR-0004, decision 6).
export const CLOUD_ADDRESS_VARIABLE = 'AI_APP_CLOUD_ADDRESS';

const CONFIG_DIR = join(__dirname, 'config');
const LOCALES_DIR = join(__dirname, 'locales');
/** The catalogs' source language, which has every message: the catalog's `SOURCE` (ADR-0002). */
export const SOURCE_LANGUAGE = 'en';
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
  sign_in: { providers: string[] };
  session: { refresh_margin: number };
  queries: { retries: number; stale_time: number };
  setup: { answer_timeout: number };
  cloud: {
    address: string;
    plain_http: boolean;
    client_id: string;
    timeout: number;
    retries: number;
    retry_delay: number;
    page_size: number;
    answer_limit: number;
    simulated: {
      latency: number;
      nonce_lifetime: number;
      access_lifetime: number;
      refresh_idle: number;
      refresh_reuse: number;
      recent_sign_in: number;
      idempotency_retention: number;
      homes_per_account: number;
      members_per_home: number;
      invitation_lifetime: number;
      invitations_per_home: number;
      id_token_lifetime: number;
      nonce_rate: { limit: number; period: number };
      invitation_rate: { limit: number; period: number };
    };
  };
}

/** What the app reads of its settings while it runs, in Expo's `extra` (src/shared/config). */
export function runtimeSettings(settings: Settings) {
  const { sign_in, session, queries, setup, cloud } = settings;
  return { studio: settings.studio.enabled, sign_in, session, queries, setup, cloud };
}

/**
 * The settings of `environment`, from the files of `directory`, then the cloud's address from
 * `variables` if they name one, checked.
 */
export function loadSettings(
  environment: string | undefined,
  directory = CONFIG_DIR,
  variables: Readonly<Record<string, string | undefined>> = {},
): Settings {
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
  const address = variables[CLOUD_ADDRESS_VARIABLE];
  if (address) {
    settings = merge(settings, { cloud: { address } });
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
  if (settings.cloud.address.startsWith('http://') && !settings.cloud.plain_http) {
    throw new Error(
      'configuration: /cloud/address is http://, which only cloud.plain_http allows, to a ' +
        "developer's own machine (SEC-1)",
    );
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
  let table: Table;
  try {
    table = parse(readFileSync(path, 'utf8')) as Table;
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return ordinary(table) as Table;
}

/**
 * `value`, with each of its tables an ordinary object. smol-toml makes them without a
 * prototype, and Expo's reading of the configuration calls their `hasOwnProperty`.
 */
function ordinary(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(ordinary);
  }
  if (isTable(value) && Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, ordinary(each)]));
  }
  return value;
}

/** The languages the app has catalogs for, from locales/: the system offers them to people. */
export function catalogLanguages(directory = LOCALES_DIR): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

/**
 * The catalogs' messages that the phone's own system shows, by the key that the platform reads
 * them under: what iOS asks before the camera opens. They are plain text, which the catalogs'
 * tests keep free of MF2's syntax, since the system shows them as they are written.
 */
export const NATIVE_MESSAGES = { NSCameraUsageDescription: 'native.camera' } as const;

/** The native messages, in each catalog's language that has them (Expo's `locales`). */
export function nativeLocales(directory = LOCALES_DIR): Record<string, { ios: Table }> {
  const locales: Record<string, { ios: Table }> = {};
  for (const language of catalogLanguages(directory)) {
    const messages: Table = JSON.parse(readFileSync(join(directory, `${language}.json`), 'utf8'));
    const ios = Object.fromEntries(
      Object.entries(NATIVE_MESSAGES)
        .filter(([, id]) => typeof messages[id] === 'string')
        .map(([key, id]) => [key, messages[id]]),
    );
    if (Object.keys(ios).length > 0) locales[language] = { ios };
  }
  return locales;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const settings = loadSettings(process.env[ENVIRONMENT_VARIABLE], CONFIG_DIR, process.env);
  const { app } = settings;
  const { version } = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
  const { light, dark } = JSON.parse(readFileSync(PALETTE, 'utf8'));
  const languages = catalogLanguages();
  const locales = nativeLocales();
  const cameraReason = locales[SOURCE_LANGUAGE]?.ios.NSCameraUsageDescription;
  if (typeof cameraReason !== 'string') {
    throw new Error(
      `locales/${SOURCE_LANGUAGE}.json lacks ${NATIVE_MESSAGES.NSCameraUsageDescription}`,
    );
  }
  return {
    ...config,
    name: app.name,
    slug: app.slug,
    scheme: app.scheme,
    version,
    // The app follows the phone's light or dark appearance (ADR-0003).
    userInterfaceStyle: 'automatic',
    android: { package: app.android_package },
    ios: {
      bundleIdentifier: app.ios_bundle_identifier,
      // What iOS shows of the app in the person's language, from `locales` (Expo's guide to
      // localization asks for both).
      infoPlist: { CFBundleAllowMixedLocalizations: true },
    },
    locales,
    plugins: [
      'expo-router',
      'expo-status-bar',
      'expo-system-ui',
      [
        'expo-splash-screen',
        { backgroundColor: light.canvas, dark: { backgroundColor: dark.canvas } },
      ],
      ['expo-localization', { supportedLocales: { android: languages, ios: languages } }],
      // The session's refresh token: kept out of Android's backups, from which it could not be
      // decrypted. No read asks for Face ID, so iOS gets no reason to give for it.
      ['expo-secure-store', { faceIDPermission: false }],
      // The camera reads QR codes, and records nothing: no microphone on either platform. iOS's
      // reason is English's, which each language's `locales` replaces.
      [
        'expo-camera',
        { cameraPermission: cameraReason, microphonePermission: false, recordAudioAndroid: false },
      ],
    ],
    extra: { ...config.extra, settings: runtimeSettings(settings) },
    experiments: { typedRoutes: true },
  };
};
