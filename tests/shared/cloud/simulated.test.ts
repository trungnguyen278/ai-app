// SPDX-License-Identifier: MIT
// The simulated cloud keeps to the app API where ai-platform's examples do not go: what it
// refuses and when, its limits, how long things last, and what deleting takes with it.
import { loadSettings } from '@/app.config';
import {
  SimulatedCloud,
  type CloudRequest,
  type CloudResponse,
  type Method,
  type SimulatedSettings,
} from '@/src/shared/cloud';

const { cloud: CLOUD } = loadSettings('development');
const SETTINGS: SimulatedSettings = { ...CLOUD.simulated, latency: 0 };
const START = Date.UTC(2026, 10, 4, 8, 0, 0);
const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };

type Body = Record<string, unknown>;

interface Options {
  token?: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  body?: string;
}

/** A simulated cloud, its clock, and requests to it as the app sends them. */
function setUp(settings: Partial<SimulatedSettings> = {}) {
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

test('nonces are limited, and the limit says how long to wait', async () => {
  const { send, later } = setUp({ nonce_rate: { limit: 2, period: 60 } });
  expect((await send('POST', '/app/v1/nonces')).status).toBe(201);
  later(10);
  expect((await send('POST', '/app/v1/nonces')).status).toBe(201);
  const refused = await send('POST', '/app/v1/nonces');
  expect([refused.status, refused.headers['retry-after']]).toEqual([429, '50']);
  later(50);
  expect((await send('POST', '/app/v1/nonces')).status).toBe(201);
});

test('an ID token works once, within its lifetime and its nonce', async () => {
  const { cloud, nonce, exchange, later } = setUp();
  const person = { subject: 'linh', email: 'linh@example.com', name: 'Linh' };
  const { idToken } = cloud.signInWith('google', person, await nonce());
  expect((await exchange(idToken)).status).toBe(200);
  const again = await exchange(idToken);
  expect([again.status, again.body.error]).toEqual([400, 'invalid_grant']);
  const late = cloud.signInWith('google', person, await nonce());
  later(SETTINGS.id_token_lifetime);
  expect((await exchange(late.idToken)).body.error).toBe('invalid_grant');
  const stale = cloud.signInWith('google', person, await nonce());
  later(SETTINGS.nonce_lifetime - 1);
  expect((await exchange(stale.idToken)).status).toBe(200);
  const unknown = cloud.signInWith('google', person, 'a-nonce-the-cloud-never-gave');
  expect((await exchange(unknown.idToken)).body.error).toBe('invalid_grant');
});

test("Apple's ID token needs the authorization code that came with it", async () => {
  const { cloud, nonce, exchange } = setUp();
  const person = { subject: '000000.abc.0000', email: 'x7q2k9@privaterelay.appleid.com' };
  const without = cloud.signInWith('apple', person, await nonce());
  expect((await exchange(without.idToken)).body.error).toBe('invalid_grant');
  const signIn = cloud.signInWith('apple', person, await nonce());
  const answer = await exchange(signIn.idToken, { authorization_code: signIn.authorizationCode! });
  expect(answer.status).toBe(200);
});

test("an account starts with the provider's name, or its email's, and a session with its label", async () => {
  const { cloud, nonce, exchange, send } = setUp();
  const signIn = cloud.signInWith(
    'apple',
    { subject: 's', email: 'bao@example.com' },
    await nonce(),
  );
  const { body } = await exchange(signIn.idToken, {
    authorization_code: signIn.authorizationCode!,
    session_label: 'iPhone 16',
  });
  const account = await send('GET', '/app/v1/account', { token: body.access_token as string });
  expect(account.body.display_name).toBe('bao');
  expect(account.headers.etag).toBe('W/"1"');
  const sessions = await send('GET', '/app/v1/account/sessions', {
    token: body.access_token as string,
  });
  expect(sessions.body.sessions).toEqual([
    expect.objectContaining({ label: 'iPhone 16', current: true }),
  ]);
  const nameless = cloud.signInWith('google', { subject: 'n' }, await nonce());
  expect((await exchange(nameless.idToken)).body.error).toBe('invalid_grant');
  const control = cloud.signInWith('google', { subject: 'c', name: 'C' }, await nonce());
  const refused = await exchange(control.idToken, { session_label: 'Pixel\u00078' });
  expect([refused.status, refused.body.error]).toEqual([400, 'invalid_request']);
});

test('access tokens expire, and a session left unused ends', async () => {
  const { signIn, send, refresh, later } = setUp();
  const linh = await signIn('Linh');
  later(SETTINGS.access_lifetime);
  const expired = await send('GET', '/app/v1/account', { token: linh.access });
  expect([expired.status, expired.headers['www-authenticate']]).toEqual([
    401,
    'Bearer error="invalid_token"',
  ]);
  const renewed = await refresh(linh.refresh);
  expect(renewed.status).toBe(200);
  later(SETTINGS.refresh_idle);
  const idle = await refresh(renewed.body.refresh_token as string);
  expect([idle.status, idle.body.error]).toEqual([400, 'invalid_grant']);
});

test('signing out with either token ends the session at once; any other token ends nothing', async () => {
  const { signIn, send } = setUp();
  const linh = await signIn('Linh');
  const revoke = (token: string, client = CLOUD.client_id) =>
    send('POST', '/app/revoke', { form: { token, client_id: client } });
  expect((await revoke('not-a-token')).status).toBe(200);
  expect((await revoke(linh.access, 'another-app')).status).toBe(401);
  expect((await send('GET', '/app/v1/account', { token: linh.access })).status).toBe(200);
  expect((await revoke(linh.access)).status).toBe(200);
  expect((await send('GET', '/app/v1/account', { token: linh.access })).status).toBe(401);
});

test('the token endpoint refuses what OAuth refuses', async () => {
  const { send } = setUp();
  const token = (form: Record<string, string>) => send('POST', '/app/token', { form });
  expect((await token({ client_id: CLOUD.client_id })).body.error).toBe('invalid_request');
  expect((await token({ grant_type: 'password', client_id: CLOUD.client_id })).body.error).toBe(
    'unsupported_grant_type',
  );
  const json = await send('POST', '/app/token', { json: { grant_type: 'refresh_token' } });
  expect(json.body.error).toBe('invalid_request');
  const twice = await send('POST', '/app/token', {
    body: 'grant_type=refresh_token&grant_type=refresh_token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  expect(twice.body.error).toBe('invalid_request');
});

test('a request is refused for its body, its media type, its path, its method or its page', async () => {
  const { signIn, send, createHome } = setUp();
  const { access: token } = await signIn('Linh');
  const status = async (...args: Parameters<typeof send>) => (await send(...args)).status;
  expect((await createHome(token, { ...HOME, name: 'Nhà\u0000' })).status).toBe(400);
  expect((await createHome(token, { ...HOME, time_zone: 'Asia/Nowhere' })).status).toBe(400);
  const patch = {
    token,
    body: '{"display_name": "\\ud800"}',
    headers: { 'content-type': 'application/json' },
  };
  expect(await status('PATCH', '/app/v1/account', patch)).toBe(400);
  expect(
    await status('PATCH', '/app/v1/account', { token, json: { display_name: 'Lin\u0085h' } }),
  ).toBe(400);
  const text = { token, body: '{}', headers: { 'content-type': 'text/plain' } };
  expect(await status('PATCH', '/app/v1/account', text)).toBe(415);
  expect(await status('GET', '/app/v1/somewhere', { token })).toBe(404);
  const method = await send('PUT' as Method, '/app/v1/account', { token });
  expect([method.status, method.headers.allow]).toEqual([405, 'GET, PATCH']);
  expect(await status('GET', '/app/v1/homes/not-a-uuid', { token })).toBe(404);
  expect(await status('GET', '/app/v1/homes?page_size=51', { token })).toBe(400);
  expect(await status('GET', '/app/v1/homes?page_token=x', { token })).toBe(400);
});

test('an Idempotency-Key gives a retry the first answer, for a while, and only for that request', async () => {
  const { signIn, send, createHome, later } = setUp();
  const { access: token } = await signIn('Linh');
  const key = '01a1a06c-1400-75e6-a77f-f2149dbe59d5';
  const first = await createHome(token, HOME, key);
  const retry = await createHome(token, HOME, key.toUpperCase());
  expect([retry.status, retry.body]).toEqual([201, first.body]);
  expect((await createHome(token, { ...HOME, name: 'Nhà khác' }, key)).status).toBe(422);
  const missing = await send('POST', '/app/v1/homes', { token, json: HOME });
  expect(missing.status).toBe(400);
  later(SETTINGS.idempotency_retention);
  expect((await createHome(token, HOME, key)).body.id).not.toBe(first.body.id);
});

test('the limits on homes, people and open invitations', async () => {
  const limits = { homes_per_account: 2, members_per_home: 2, invitations_per_home: 1 };
  const { signIn, send, createHome, newKey } = setUp(limits);
  const { access: token } = await signIn('Linh');
  const { body: home } = await createHome(token);
  await createHome(token);
  const third = await createHome(token);
  expect(third.body.type).toBe('/app/v1/problems/home_limit_reached');
  const invitations = `/app/v1/homes/${home.id}/invitations`;
  expect((await send('POST', invitations, { token })).status).toBe(201);
  const second = await send('POST', invitations, { token });
  expect(second.body.type).toBe('/app/v1/problems/invitation_limit_reached');
  const profile = (name: string) =>
    send('POST', `/app/v1/homes/${home.id}/members`, {
      token,
      json: { display_name: name },
      headers: { 'idempotency-key': `"${newKey()}"` },
    });
  expect((await profile('Bà')).status).toBe(201);
  expect((await profile('Ông bà')).body.type).toBe('/app/v1/problems/member_limit_reached');
});

test('an invitation expires, and goes with the person who made it, or their role', async () => {
  const { signIn, send, createHome, later } = setUp();
  const { body: home } = await createHome((await signIn('Linh')).access);
  const invite = async (token: string) =>
    (await send('POST', `/app/v1/homes/${home.id}/invitations`, { token })).body.code as string;
  const accept = (token: string, code: string) =>
    send('POST', '/app/v1/invitations:accept', { token, json: { code } });
  const expiring = await invite((await signIn('Linh')).access);
  later(SETTINGS.invitation_lifetime);
  // Three days on, everyone signs in again.
  const linh = await signIn('Linh');
  const minh = await signIn('Minh');
  const bao = await signIn('Bao');
  expect((await accept(minh.access, expiring)).body.type).toBe(
    '/app/v1/problems/invitation_invalid',
  );
  const { body: joined } = await accept(minh.access, await invite(linh.access));
  const memberPath = `/app/v1/homes/${home.id}/members/${joined.member_id}`;
  await send('PATCH', memberPath, { token: linh.access, json: { role: 'admin' } });
  const minhs = await invite(minh.access);
  await send('PATCH', memberPath, { token: linh.access, json: { role: 'member' } });
  expect((await accept(bao.access, minhs)).status).toBe(404);
  const list = await send('GET', `/app/v1/homes/${home.id}/invitations`, { token: linh.access });
  expect(list.body.invitations).toEqual([]);
});

test('a fresh sign-in must be recent, and one of the account’s identities', async () => {
  // Shorter than the nonce's and the ID token's lifetimes, so that only this rule refuses.
  const recent = 60;
  expect(recent).toBeLessThan(Math.min(SETTINGS.nonce_lifetime, SETTINGS.id_token_lifetime));
  const { signIn, send, createHome, fresh, later } = setUp({ recent_sign_in: recent });
  const linh = await signIn('Linh');
  const minh = await signIn('Minh');
  const { body: home } = await createHome(linh.access);
  const remove = (idToken: string) =>
    send('POST', `/app/v1/homes/${home.id}:delete`, {
      token: linh.access,
      json: { id_token: idToken },
    });
  const someoneElse = await remove(await fresh(minh.person));
  expect(someoneElse.body.type).toBe('/app/v1/problems/recent_sign_in_required');
  const old = await fresh(linh.person);
  later(recent + 1);
  expect((await remove(old)).body.type).toBe('/app/v1/problems/recent_sign_in_required');
  expect((await remove(await fresh(linh.person))).status).toBe(204);
});

test('deleting an account takes its homes and its places, or nothing when it cannot', async () => {
  const { signIn, send, createHome, fresh } = setUp();
  const linh = await signIn('Linh');
  const minh = await signIn('Minh');
  const { body: alone } = await createHome(linh.access, { ...HOME, name: 'Nhà riêng' });
  const { body: shared } = await createHome(minh.access, { ...HOME, name: 'Nhà Minh' });
  const { body: invitation } = await send('POST', `/app/v1/homes/${shared.id}/invitations`, {
    token: minh.access,
  });
  await send('POST', '/app/v1/invitations:accept', {
    token: linh.access,
    json: { code: invitation.code },
  });
  const { body: owned } = await createHome(linh.access, { ...HOME, name: 'Nhà chung' });
  const { body: back } = await send('POST', `/app/v1/homes/${owned.id}/invitations`, {
    token: linh.access,
  });
  await send('POST', '/app/v1/invitations:accept', {
    token: minh.access,
    json: { code: back.code },
  });
  const deletion = async () =>
    send('POST', '/app/v1/account:delete', {
      token: linh.access,
      json: { id_token: await fresh(linh.person) },
    });
  const stopped = await deletion();
  expect(stopped.body.type).toBe('/app/v1/problems/owns_home_with_members');
  const people = await send('GET', `/app/v1/homes/${shared.id}/members`, { token: minh.access });
  expect((people.body.members as Body[]).map((member) => member.display_name)).toEqual([
    'Minh',
    'Linh',
  ]);
  expect((await send('GET', `/app/v1/homes/${alone.id}`, { token: linh.access })).status).toBe(200);
  const minhs = (await send('GET', `/app/v1/homes/${owned.id}/members`, { token: minh.access }))
    .body;
  const minhInOwned = (minhs.members as Body[]).find((member) => member.display_name === 'Minh')!;
  await send('DELETE', `/app/v1/homes/${owned.id}/members/${minhInOwned.id}`, {
    token: minh.access,
  });
  expect((await deletion()).status).toBe(204);
  expect((await send('GET', '/app/v1/account', { token: linh.access })).status).toBe(401);
  const left = await send('GET', `/app/v1/homes/${shared.id}/members`, { token: minh.access });
  expect((left.body.members as Body[]).map((member) => member.display_name)).toEqual(['Minh']);
  expect((await send('GET', '/app/v1/homes', { token: minh.access })).body.homes).toHaveLength(1);
});
