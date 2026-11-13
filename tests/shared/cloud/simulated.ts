// SPDX-License-Identifier: MIT
// A simulated cloud for the tests, with a clock of their own, and requests to it as the app
// sends them, at the transport.
import { loadSettings } from '@/app.config';
import {
  SimulatedCloud,
  type CloudRequest,
  type CloudResponse,
  type Method,
  type SimulatedSettings,
} from '@/src/shared/cloud';

export const { cloud: CLOUD } = loadSettings('development');
export const SETTINGS: SimulatedSettings = { ...CLOUD.simulated, latency: 0 };
export const START = Date.UTC(2026, 10, 4, 8, 0, 0);
export const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };

export type Body = Record<string, unknown>;

interface Options {
  token?: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

/** A simulated cloud, its clock, and requests to it as the app sends them. */
export function setUp(settings: Partial<SimulatedSettings> = {}) {
  let now = START;
  let keys = 0;
  const cloud = new SimulatedCloud({ ...SETTINGS, ...settings }, [CLOUD.client_id], {
    clock: () => now,
  });

  async function send(method: Method, target: string, options: Options = {}) {
    const headers: Record<string, string> = { ...options.headers };
    let body = options.body;
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    if (options.json !== undefined) {
      headers['content-type'] ??= 'application/json';
      body = JSON.stringify(options.json);
    }
    if (options.form !== undefined) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(options.form).toString();
    }
    const request: CloudRequest = { method, target, headers, body };
    const response: CloudResponse = await cloud.send(request);
    const parsed = response.body === '' ? {} : (JSON.parse(response.body) as Body);
    return { status: response.status, headers: response.headers, body: parsed };
  }

  async function nonce(): Promise<string> {
    return (await send('POST', '/app/v1/nonces')).body.nonce as string;
  }

  async function exchange(idToken: string, extra: Record<string, string> = {}) {
    return send('POST', '/app/token', {
      form: {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: idToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        client_id: CLOUD.client_id,
        ...extra,
      },
    });
  }

  /** Sign a person in with the simulated Google; their tokens. */
  async function signIn(name: string) {
    const person = { subject: name, email: `${name.toLowerCase()}@example.com`, name };
    const { idToken } = cloud.signInWith('google', person, await nonce());
    const { body } = await exchange(idToken);
    return { access: body.access_token as string, refresh: body.refresh_token as string, person };
  }

  async function refresh(refreshToken: string) {
    return send('POST', '/app/token', {
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLOUD.client_id,
      },
    });
  }

  async function createHome(token: string, home: Body = HOME, key = newKey()) {
    return send('POST', '/app/v1/homes', {
      token,
      json: home,
      headers: { 'idempotency-key': `"${key}"` },
    });
  }

  function newKey(): string {
    keys += 1;
    return `01a1a06c-1400-75e6-a77f-${String(keys).padStart(12, '0')}`;
  }

  /** A fresh sign-in, for what a phone left unlocked must not be enough for. */
  async function fresh(person: { subject: string; email: string; name: string }) {
    return cloud.signInWith('google', person, await nonce()).idToken;
  }

  return {
    cloud,
    send,
    nonce,
    exchange,
    signIn,
    refresh,
    createHome,
    newKey,
    fresh,
    later: (seconds: number) => {
      now += seconds * 1000;
    },
  };
}
