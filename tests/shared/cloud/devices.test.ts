// SPDX-License-Identifier: MIT
// The simulated cloud's devices keep to the app API where devices.json does not go: what makes a
// registration invalid, which challenge it may use, what takes a device, the limit, names,
// renaming with an ETag, and what removing a device, a person or a home takes with it.
import type { SimulatedSettings } from '@/src/shared/cloud';

import { HELLO, Robot, withHighS } from './robot';
import { SETTINGS, setUp, type Body } from './simulated';

const SERVER = SETTINGS.server;
// More challenges than the tests ask for, but for the test of the limit.
const MANY = { challenge_rate: { limit: 100, period: 60 } };

/** A robot of the tests, with an identifier of its own. */
function robot(n: number): Robot {
  return new Robot(`4a4ce4bd-2853-43d8-98dc-${String(n).padStart(12, '0')}`);
}

/** A cloud where Linh owns a home, and Minh is a member of it. */
async function withHome(settings: Partial<SimulatedSettings> = MANY) {
  const sim = setUp(settings);
  const linh = await sim.signIn('Linh');
  const minh = await sim.signIn('Minh');
  const home = (await sim.createHome(linh.access)).body.id as string;
  const minhMember = await join(minh.access);

  /** Join Linh's home with an invitation of hers; the member that the person is. */
  async function join(token: string): Promise<string> {
    const invitation = await sim.send('POST', `/app/v1/homes/${home}/invitations`, {
      token: linh.access,
    });
    const joined = await sim.send('POST', '/app/v1/invitations:accept', {
      token,
      json: { code: invitation.body.code },
    });
    return joined.body.member_id as string;
  }

  async function makeAdmin(member: string): Promise<void> {
    const changed = await sim.send('PATCH', `/app/v1/homes/${home}/members/${member}`, {
      token: linh.access,
      json: { role: 'admin' },
    });
    expect(changed.status).toBe(200);
  }

  async function challenge(token = linh.access, homeId = home) {
    return sim.send('POST', `/app/v1/homes/${homeId}/device-challenges`, { token });
  }

  /** A new challenge's value, for `token` in `homeId`. */
  async function nonce(token = linh.access, homeId = home): Promise<string> {
    const issued = await challenge(token, homeId);
    expect(issued.status).toBe(201);
    return issued.body.challenge as string;
  }

  async function register(
    registration: string,
    { name, key = sim.newKey(), token = linh.access, homeId = home } = {} as {
      name?: string;
      key?: string;
      token?: string;
      homeId?: string;
    },
  ) {
    return sim.send('POST', `/app/v1/homes/${homeId}/devices`, {
      token,
      json: { registration, ...(name === undefined ? {} : { name }) },
      headers: { 'idempotency-key': `"${key}"` },
    });
  }

  /** The robot registered by Linh into her home, with `name` if one is given. */
  async function add(device: Robot, name?: string, homeId = home) {
    return register(device.register(await nonce(linh.access, homeId), SERVER), { name, homeId });
  }

  const devices = (homeId = home) => `/app/v1/homes/${homeId}/devices`;

  return {
    ...sim,
    linh,
    minh,
    home,
    minhMember,
    join,
    makeAdmin,
    challenge,
    nonce,
    register,
    add,
    devices,
  };
}

function problemOf(answer: { status: number; body: Body }) {
  return [answer.status, answer.body.type];
}

const INVALID = [400, '/app/v1/problems/registration_invalid'];
const TAKEN = [409, '/app/v1/problems/device_taken'];

// What makes a registration invalid.

/** A registration of `device` that is wrong in one way. */
type Spoil = (device: Robot, challenge: string) => string;

/** `coordinate` written with other unused bits in its last character: the same bytes. */
function otherSpelling(coordinate: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(coordinate.at(-1)!);
  return coordinate.slice(0, -1) + alphabet[last ^ 1];
}

/** `coordinate` with its last byte changed: no longer the key's point, nor most likely any. */
function otherPoint(coordinate: string): string {
  const bytes = Buffer.from(coordinate, 'base64url');
  bytes[31] ^= 1;
  return bytes.toString('base64url');
}

const KEY = 'its key: not a P-256 key';
const SPELLING = 'its key: not base64url without padding';
// Each way to spoil a registration, and the check that refuses it, as the answer's detail says.
const SPOILED: [string, string, Spoil][] = [
  [
    'another type',
    "not a device's registration",
    (device, challenge) => device.register(challenge, SERVER, { header: { typ: 'JWT' } }),
  ],
  [
    'no type',
    "not a device's registration",
    (device, challenge) => device.register(challenge, SERVER, { header: { typ: undefined } }),
  ],
  [
    'another algorithm',
    'not ES256',
    (device, challenge) => device.register(challenge, SERVER, { header: { alg: 'ES384' } }),
  ],
  [
    'no key',
    KEY,
    (device, challenge) => device.register(challenge, SERVER, { header: { jwk: undefined } }),
  ],
  [
    'a key that is a list',
    KEY,
    (device, challenge) => device.register(challenge, SERVER, { header: { jwk: [device.key] } }),
  ],
  [
    'a key of another curve',
    KEY,
    (device, challenge) =>
      device.register(challenge, SERVER, { header: { jwk: { ...device.key, crv: 'P-384' } } }),
  ],
  [
    'a key of another type',
    KEY,
    (device, challenge) =>
      device.register(challenge, SERVER, { header: { jwk: { ...device.key, kty: 'RSA' } } }),
  ],
  [
    'a private key',
    'its key: a private key',
    (device, challenge) =>
      device.register(challenge, SERVER, { header: { jwk: { ...device.key, d: device.key.x } } }),
  ],
  [
    'a key without y',
    'its key: no coordinates',
    (device, challenge) =>
      device.register(challenge, SERVER, { header: { jwk: { ...device.key, y: undefined } } }),
  ],
  [
    'a coordinate with padding',
    SPELLING,
    (device, challenge) =>
      device.register(challenge, SERVER, {
        header: { jwk: { ...device.key, x: `${device.key.x}=` } },
      }),
  ],
  [
    'a coordinate spelled another way',
    SPELLING,
    (device, challenge) =>
      device.register(challenge, SERVER, {
        header: { jwk: { ...device.key, y: otherSpelling(device.key.y) } },
      }),
  ],
  [
    'a coordinate of 31 bytes',
    'its key: coordinates of the wrong size',
    (device, challenge) =>
      device.register(challenge, SERVER, {
        header: { jwk: { ...device.key, x: Buffer.alloc(31, 1).toString('base64url') } },
      }),
  ],
  [
    'a key off the curve',
    'its key: not a point of the curve',
    (device, challenge) =>
      device.register(challenge, SERVER, {
        header: { jwk: { ...device.key, y: otherPoint(device.key.y) } },
      }),
  ],
  [
    "another key's signature",
    'bad signature',
    (device, challenge) =>
      robot(99).sign(
        { alg: 'ES256', jwk: device.key, typ: 'device-registration+jwt' },
        { iss: device.id, sub: device.id, aud: SERVER, nonce: challenge },
      ),
  ],
  [
    'a signature cut short',
    'bad signature',
    (device, challenge) => device.register(challenge, SERVER).slice(0, -2),
  ],
  [
    'no audience',
    'no aud claim',
    (device, challenge) => device.register(challenge, SERVER, { claims: { aud: undefined } }),
  ],
  [
    'another audience',
    'wrong audience',
    (device, challenge) =>
      device.register(challenge, SERVER, { claims: { aud: 'https://cloud.example' } }),
  ],
  [
    'an audience in a list',
    'wrong audience',
    (device, challenge) => device.register(challenge, SERVER, { claims: { aud: [SERVER] } }),
  ],
  [
    'no issuer',
    'no iss claim',
    (device, challenge) => device.register(challenge, SERVER, { claims: { iss: undefined } }),
  ],
  [
    'a null subject',
    'no sub claim',
    (device, challenge) => device.register(challenge, SERVER, { claims: { sub: null } }),
  ],
  [
    'an issuer that is no identifier',
    'iss and sub are not identifiers',
    (device, challenge) =>
      device.register(challenge, SERVER, { claims: { iss: 'robot', sub: 'robot' } }),
  ],
  [
    'an issuer and a subject that differ',
    'iss and sub differ',
    (device, challenge) => device.register(challenge, SERVER, { claims: { sub: robot(98).id } }),
  ],
];

test.each(SPOILED)(
  'a registration with %s is refused (%s), uses its challenge, and its answer is kept',
  async (_, reason, spoil) => {
    const { nonce, register, newKey } = await withHome();
    const device = robot(1);
    const challenge = await nonce();
    const key = newKey();
    const spoiled = spoil(device, challenge);
    const refused = await register(spoiled, { key });
    expect([...problemOf(refused), refused.body.detail]).toEqual([...INVALID, reason]);
    // The answer is kept with its key: a retry gets it, and the key is that request's only.
    expect((await register(spoiled, { key })).body).toEqual(refused.body);
    const valid = device.register(challenge, SERVER);
    expect((await register(valid, { key })).status).toBe(422);
    // And the challenge is used.
    expect(problemOf(await register(valid))).toEqual(INVALID);
  },
);

test('a signature with the high s verifies, as JWS takes either', async () => {
  const { nonce, register } = await withHome();
  const device = robot(1);
  const added = await register(withHighS(device.register(await nonce(), SERVER)));
  expect([added.status, added.body.id]).toEqual([201, device.id]);
});

test("the device's identifier is read in any case, and written in lower case", async () => {
  const { nonce, register } = await withHome();
  const device = robot(1);
  const added = await register(
    device.register(await nonce(), SERVER, { claims: { iss: device.id.toUpperCase() } }),
  );
  expect([added.status, added.body.id]).toEqual([201, device.id]);
});

test('a registration that names no challenge of the home and the account is not kept', async () => {
  const { nonce, register, newKey, minh, minhMember, makeAdmin, linh, createHome } =
    await withHome();
  const device = robot(1);
  const other = (await createHome(linh.access)).body.id as string;
  await makeAdmin(minhMember);
  const refusals = [
    'not.a.registration',
    'eyJ.e30.AA',
    device.register('', SERVER, { claims: { nonce: undefined } }),
    device.register('', SERVER, { claims: { nonce: 42 } }),
    device.register('a-made-up-challenge', SERVER),
  ];
  // Another home's challenge, or another person's.
  const theirs = [
    device.register(await nonce(linh.access, other), SERVER),
    robot(2).register(await nonce(minh.access), SERVER),
  ];
  for (const [index, refused] of [...refusals, ...theirs].entries()) {
    const key = newKey();
    expect(problemOf(await register(refused, { key }))).toEqual(INVALID);
    // Nothing was kept for that key, so it works for a registration that does.
    const added = await register(robot(10 + index).register(await nonce(), SERVER), { key });
    expect(added.status).toBe(201);
  }
  // The challenges that were another's are still theirs.
  expect((await register(theirs[0], { homeId: other })).status).toBe(201);
  expect((await register(theirs[1], { token: minh.access })).status).toBe(201);
});

// Challenges.

test('a challenge lasts its lifetime, as it says', async () => {
  const { challenge, register, later } = await withHome();
  const device = robot(1);
  const issued = await challenge();
  expect([issued.status, issued.body.server, issued.body.expires_in]).toEqual([
    201,
    SERVER,
    SETTINGS.challenge_lifetime,
  ]);
  const stale = await challenge();
  later(SETTINGS.challenge_lifetime - 1);
  const added = await register(device.register(issued.body.challenge as string, SERVER));
  expect(added.status).toBe(201);
  later(1);
  expect(
    problemOf(await register(device.register(stale.body.challenge as string, SERVER))),
  ).toEqual(INVALID);
});

test('challenges are limited for each account, and the limit says how long to wait', async () => {
  const { challenge, later, minh, minhMember, makeAdmin } = await withHome({});
  const { limit, period } = SETTINGS.challenge_rate;
  for (let index = 0; index < limit; index++) expect((await challenge()).status).toBe(201);
  const refused = await challenge();
  expect([refused.status, refused.headers['retry-after']]).toEqual([429, String(period)]);
  await makeAdmin(minhMember);
  expect((await challenge(minh.access)).status).toBe(201);
  later(period);
  expect((await challenge()).status).toBe(201);
});

test('a member sees the devices, and cannot add, rename or remove one', async () => {
  const sim = await withHome();
  const device = robot(1);
  await sim.add(device);
  const member = { token: sim.minh.access };
  const listed = await sim.send('GET', sim.devices(), member);
  expect((listed.body.devices as Body[]).map((each) => each.id)).toEqual([device.id]);
  expect((await sim.send('GET', `${sim.devices()}/${device.id}`, member)).status).toBe(200);
  const role = [403, '/app/v1/problems/role_required'];
  expect(problemOf(await sim.challenge(sim.minh.access))).toEqual(role);
  const registration = device.register(await sim.nonce(), SERVER);
  expect(problemOf(await sim.register(registration, { token: sim.minh.access }))).toEqual(role);
  const rename = await sim.send('PATCH', `${sim.devices()}/${device.id}`, {
    ...member,
    json: { name: 'Bi' },
  });
  expect(problemOf(rename)).toEqual(role);
  const remove = await sim.send('DELETE', `${sim.devices()}/${device.id}`, member);
  expect(problemOf(remove)).toEqual(role);
  // The challenge Linh got is still hers.
  expect((await sim.register(registration)).status).toBe(200);
});

test('a retry gets its first answer before the role is checked, as ai-cloud answers it', async () => {
  const sim = await withHome();
  await sim.makeAdmin(sim.minhMember);
  const device = robot(1);
  const key = sim.newKey();
  const registration = device.register(await sim.nonce(sim.minh.access), SERVER);
  expect((await sim.register(registration, { key, token: sim.minh.access })).status).toBe(201);
  // Linh makes Minh a member again while his answer is lost.
  const demoted = await sim.send('PATCH', `/app/v1/homes/${sim.home}/members/${sim.minhMember}`, {
    token: sim.linh.access,
    json: { role: 'member' },
  });
  expect(demoted.status).toBe(200);
  const retry = await sim.register(registration, { key, token: sim.minh.access });
  expect([retry.status, retry.body.id]).toEqual([201, device.id]);
});

test('someone outside the home learns nothing of its devices', async () => {
  const sim = await withHome();
  const device = robot(1);
  await sim.add(device);
  const stranger = await sim.signIn('Bao');
  for (const [method, target] of [
    ['POST', `/app/v1/homes/${sim.home}/device-challenges`],
    ['GET', sim.devices()],
    ['GET', `${sim.devices()}/${device.id}`],
    ['DELETE', `${sim.devices()}/${device.id}`],
  ] as const) {
    expect((await sim.send(method, target, { token: stranger.access })).status).toBe(404);
  }
});

// What takes a device.

test('a device is taken by its identifier and by its key, in one home only', async () => {
  const sim = await withHome();
  const device = robot(1);
  expect((await sim.add(device)).status).toBe(201);
  const other = (await sim.createHome(sim.linh.access)).body.id as string;
  const key = sim.newKey();
  const elsewhere = device.register(await sim.nonce(sim.linh.access, other), SERVER);
  expect(problemOf(await sim.register(elsewhere, { homeId: other, key }))).toEqual(TAKEN);
  // That answer is kept with its key.
  expect(problemOf(await sim.register(elsewhere, { homeId: other, key }))).toEqual(TAKEN);
  // Another identifier with its key, or its identifier with another key.
  const renamed = device.register(await sim.nonce(), SERVER, {
    claims: { iss: robot(2).id, sub: robot(2).id },
  });
  expect(problemOf(await sim.register(renamed))).toEqual(TAKEN);
  const impostor = new Robot(device.id);
  expect(problemOf(await sim.add(impostor))).toEqual(TAKEN);
  // The device in the home is as it was.
  const listed = await sim.send('GET', sim.devices(), { token: sim.linh.access });
  expect((listed.body.devices as Body[]).map((each) => each.id)).toEqual([device.id]);
  expect((await sim.send('GET', sim.devices(other), { token: sim.linh.access })).body).toEqual({
    devices: [],
    next_page_token: '',
  });
  // Nor is it the other home's to read, rename or remove.
  const there = `${sim.devices(other)}/${device.id}`;
  for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
    const json = method === 'PATCH' ? { name: 'Bi' } : undefined;
    expect((await sim.send(method, there, { token: sim.linh.access, json })).status).toBe(404);
  }
});

test('the limit counts new devices only: a full home takes its own device back', async () => {
  const sim = await withHome({ ...MANY, devices_per_home: 1 });
  const device = robot(1);
  expect((await sim.add(device)).status).toBe(201);
  expect(problemOf(await sim.add(robot(2)))).toEqual([
    409,
    '/app/v1/problems/device_limit_reached',
  ]);
  expect((await sim.add(device)).status).toBe(200);
});

// Names.

test('a device has the name it came with, or none, and a nameless one takes the next', async () => {
  const sim = await withHome();
  const device = robot(1);
  const nameless = await sim.add(device);
  expect([nameless.status, 'name' in nameless.body, nameless.body.etag]).toEqual([
    201,
    false,
    'W/"1"',
  ]);
  // Registered again with a name, it takes it.
  const named = await sim.add(device, 'Robot');
  expect([named.status, named.body.name, named.body.etag]).toEqual([200, 'Robot', 'W/"2"']);
  // Named, it keeps its name.
  const again = await sim.add(device, 'Other');
  expect([again.status, again.body.name, again.body.etag]).toEqual([200, 'Robot', 'W/"2"']);
  const kept = await sim.add(device);
  expect([kept.status, kept.body.name, kept.body.etag]).toEqual([200, 'Robot', 'W/"2"']);
});

test('renaming a device takes its ETag, or none, and connecting changes no ETag', async () => {
  const sim = await withHome();
  const device = robot(1);
  const added = await sim.add(device, 'Robot');
  const target = `${sim.devices()}/${device.id}`;
  const rename = (name: string, headers: Record<string, string> = {}) =>
    sim.send('PATCH', target, { token: sim.linh.access, json: { name }, headers });
  const renamed = await rename('Bi', { 'if-match': added.body.etag as string });
  expect([renamed.status, renamed.body.name, renamed.headers.etag]).toEqual([200, 'Bi', 'W/"2"']);
  const stale = await rename('Bo', { 'if-match': added.body.etag as string });
  expect([stale.status, stale.headers.etag]).toEqual([412, undefined]);
  expect((await rename('Bo', { 'if-match': '*' })).body.etag).toBe('W/"3"');
  expect((await rename('Bu', { 'if-match': 'W/"9", W/"3"' })).body.etag).toBe('W/"4"');
  expect((await rename('Be')).body.etag).toBe('W/"5"');
  expect((await rename('')).status).toBe(400);
  expect(sim.cloud.connectDevice(device.key, HELLO)).toBe(true);
  const connected = await sim.send('GET', target, { token: sim.linh.access });
  expect(connected.body).toEqual({
    id: device.id,
    name: 'Be',
    ...HELLO,
    connected: true,
    create_time: added.body.create_time,
    etag: 'W/"5"',
  });
  expect(connected.headers.etag).toBe('W/"5"');
  sim.cloud.disconnectDevice(device.key);
  const stopped = await sim.send('GET', target, { token: sim.linh.access });
  expect([stopped.body.connected, stopped.body.kind]).toEqual([false, HELLO.kind]);
  expect(
    (await sim.send('GET', `${sim.devices()}/${robot(2).id}`, { token: sim.linh.access })).status,
  ).toBe(404);
});

// What removing takes with it.

test('removing a device forgets its key, its name, and the answers that showed it', async () => {
  const sim = await withHome();
  const device = robot(1);
  const challenge = await sim.nonce();
  const key = sim.newKey();
  const registration = device.register(challenge, SERVER);
  expect((await sim.register(registration, { key, name: 'Bi' })).status).toBe(201);
  expect(sim.cloud.connectDevice(device.key, HELLO)).toBe(true);
  const target = `${sim.devices()}/${device.id}`;
  expect((await sim.send('DELETE', target, { token: sim.linh.access })).status).toBe(204);
  expect((await sim.send('GET', target, { token: sim.linh.access })).status).toBe(404);
  expect((await sim.send('DELETE', target, { token: sim.linh.access })).status).toBe(404);
  expect(sim.cloud.connectDevice(device.key, HELLO)).toBe(false);
  // A retry of its registration no longer shows it: the challenge is used.
  expect(problemOf(await sim.register(registration, { key }))).toEqual(INVALID);
  // Set up again, it is a new device.
  const back = await sim.add(device);
  expect([back.status, 'name' in back.body, 'kind' in back.body]).toEqual([201, false, false]);
});

test('a person who leaves takes their challenges, and their answers, with them', async () => {
  const sim = await withHome();
  await sim.makeAdmin(sim.minhMember);
  const device = robot(1);
  const unused = await sim.nonce(sim.minh.access);
  // Minh's own home, whose challenge stays his.
  const his = (await sim.createHome(sim.minh.access)).body.id as string;
  const kept = robot(3).register(await sim.nonce(sim.minh.access, his), SERVER);
  const key = sim.newKey();
  const registration = device.register(await sim.nonce(sim.minh.access), SERVER);
  expect((await sim.register(registration, { key, token: sim.minh.access })).status).toBe(201);
  const leave = `/app/v1/homes/${sim.home}/members/${sim.minhMember}`;
  expect((await sim.send('DELETE', leave, { token: sim.minh.access })).status).toBe(204);
  await sim.makeAdmin(await sim.join(sim.minh.access));
  // The device stays in the home, but what Minh did before is no longer his.
  const retry = await sim.register(registration, { key, token: sim.minh.access });
  expect(problemOf(retry)).toEqual(INVALID);
  const old = robot(2).register(unused, SERVER);
  expect(problemOf(await sim.register(old, { token: sim.minh.access }))).toEqual(INVALID);
  const theirs = await sim.register(kept, { token: sim.minh.access, homeId: his });
  expect(theirs.status).toBe(201);
  expect((await sim.send('GET', sim.devices(), { token: sim.linh.access })).body.devices).toEqual([
    expect.objectContaining({ id: device.id }),
  ]);
});

test('deleting a home takes its devices', async () => {
  const sim = await withHome();
  const home = (await sim.createHome(sim.linh.access)).body.id as string;
  const device = robot(1);
  expect((await sim.add(device, undefined, home)).status).toBe(201);
  const deleted = await sim.send('POST', `/app/v1/homes/${home}:delete`, {
    token: sim.linh.access,
    json: { id_token: await sim.fresh(sim.linh.person) },
  });
  expect(deleted.status).toBe(204);
  expect(sim.cloud.connectDevice(device.key, HELLO)).toBe(false);
  expect((await sim.add(device)).status).toBe(201);
});

test("a home's devices come in pages, in the order of their identifiers", async () => {
  const sim = await withHome();
  for (const n of [3, 1, 2]) await sim.add(robot(n));
  const first = await sim.send('GET', `${sim.devices()}?page_size=2`, { token: sim.linh.access });
  const ids = (body: Body) => (body.devices as Body[]).map((each) => each.id);
  expect(ids(first.body)).toEqual([robot(1).id, robot(2).id]);
  const token = encodeURIComponent(first.body.next_page_token as string);
  const next = await sim.send('GET', `${sim.devices()}?page_size=2&page_token=${token}`, {
    token: sim.linh.access,
  });
  expect([ids(next.body), next.body.next_page_token]).toEqual([[robot(3).id], '']);
});
