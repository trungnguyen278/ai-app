// SPDX-License-Identifier: MIT
// The protocols' generated checks (ADR-0004): they accept what ai-platform's examples send,
// they read the schema as Ajv does when it compiles it, and what they refuse they describe
// without its value.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import { checked, ProtocolError, type AppDefinition } from '@/src/shared/protocols';

type Body = Record<string, unknown>;

const PROTOCOL = join(__dirname, '..', '..', 'platform', 'protocols', 'app');
const schema = JSON.parse(readFileSync(join(PROTOCOL, 'schema.json'), 'utf8'));
const examples: { messages: { from?: string; message?: Body }[] }[] = readdirSync(
  join(PROTOCOL, 'examples'),
)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(PROTOCOL, 'examples', file), 'utf8')));

// What each side sends in the examples.
function sentBy(side: string): Body[] {
  return examples
    .flatMap((example) => example.messages)
    .filter((step) => step.from === side && step.message !== undefined)
    .map((step) => step.message as Body);
}
const fromCloud = sentBy('cloud');
const fromApp = sentBy('app');

// The definitions that a teller of the schema tells apart.
function toldApartBy(teller: string): AppDefinition[] {
  return (schema.$defs[teller].allOf as { then: { $ref: string } }[]).map(
    (branch) => branch.then.$ref.replace('#/$defs/', '') as AppDefinition,
  );
}

// Every definition but the tellers, as the generator reads them.
const TELLERS = ['from_app', 'from_cloud'];
const DEFINITIONS = Object.keys(schema.$defs)
  .filter((name) => !TELLERS.includes(name))
  .map((name) => name as AppDefinition);

// The schema, compiled here as Ajv compiles it at run time, with the generator's options.
const ajv = new Ajv2020({ strict: true, strictRequired: false });
ajv.addSchema({ ...schema, $id: 'app' });

function compiled(definition: string) {
  const check = ajv.getSchema(`app#/$defs/${definition}`);
  if (check === undefined) {
    throw new Error(`no definition ${definition}`);
  }
  return check;
}

function accepts(definition: AppDefinition, body: unknown): boolean {
  try {
    checked(definition, body);
    return true;
  } catch (error) {
    if (!(error instanceof ProtocolError)) {
      throw error;
    }
    return false;
  }
}

function refusal(definition: AppDefinition, body: unknown): ProtocolError {
  try {
    checked(definition, body);
  } catch (error) {
    if (error instanceof ProtocolError) {
      return error;
    }
    throw error;
  }
  throw new Error(`${definition} accepted it`);
}

function example(definition: AppDefinition): Body {
  const body = [...fromCloud, ...fromApp].find((each) => compiled(definition)(each));
  if (body === undefined) {
    throw new Error(`no example of ${definition}`);
  }
  return structuredClone(body);
}

const home = () => example('home');
const SECRET = 'made-up-secret';

// Bodies that break the schema in the ways that its patterns and conditions can be broken.
const PLANTED: unknown[] = [
  undefined,
  null,
  'a home',
  [],
  { ...home(), languages: ['vi\n'] },
  { ...home(), languages: [] },
  { ...home(), name: `Nhà${String.fromCharCode(0)}` },
  { ...home(), time_zone: '../etc/passwd' },
  { ...home(), role: 'Owner' },
  { ...example('member'), role: undefined },
  { ...example('account'), email: `linh${String.fromCharCode(1)}@example.com` },
  { ...example('account'), email: 'linh\ufeff@example.com' },
  { ...example('token_response'), token_type: 'Bearerx' },
  { ...example('problem'), type: '/app/v1/problems/Not-A-Code' },
  { ...example('invitation_preview'), expire_time: '2026-11-06 08:10:00' },
  { ...example('home_create'), name: `Nhà${String.fromCharCode(0x85)}` },
  { ...example('home_create'), languages: ['vi', 'vi'] },
  { ...example('member_update'), role: 'owner' },
  {},
  { grant_type: 'refresh_token', client_id: 'ai-app' },
  { ...example('development_id_token_request'), nonce: 'short' },
];

test('a check exists for every body that either side sends', () => {
  const told = [...toldApartBy('from_cloud'), ...toldApartBy('from_app')];
  expect(told.length).toBeGreaterThan(20);
  for (const definition of [...told, 'home_create', 'profile_create'] as AppDefinition[]) {
    expect(DEFINITIONS).toContain(definition);
    expect(refusal(definition, undefined)).toBeInstanceOf(ProtocolError);
  }
});

test.each(fromCloud.map((body, index) => [index, body] as const))(
  "the examples' body %i from the cloud passes the check of its definition",
  (_, body) => {
    expect(compiled('from_cloud')(body)).toBe(true);
    expect(toldApartBy('from_cloud').some((definition) => accepts(definition, body))).toBe(true);
  },
);

test.each(fromApp.map((body, index) => [index, body] as const))(
  "the examples' body %i from the app passes the check of its definition",
  (_, body) => {
    expect(compiled('from_app')(body)).toBe(true);
    expect(DEFINITIONS.some((definition) => accepts(definition, body))).toBe(true);
  },
);

test('the generated checks read the schema as Ajv compiles it', () => {
  for (const definition of DEFINITIONS) {
    const check = compiled(definition);
    for (const body of [...fromCloud, ...fromApp, ...PLANTED]) {
      expect([definition, accepts(definition, body)]).toEqual([definition, check(body)]);
    }
  }
});

test.each([
  ['/languages/0', { ...home(), languages: ['vi\n'] }],
  ['/name', { ...home(), name: 'Nhà\n' }],
])('a last newline does not pass a pattern, at %s', (where, body) => {
  const error = refusal('home', body);
  expect([error.where, error.rule]).toEqual([where, 'breaks pattern']);
});

test('a refused body is told by where and which rule, never by its value', () => {
  const token = { ...example('token_response'), access_token: SECRET + 'x'.repeat(9000) };
  const error = refusal('token_response', token);
  expect(error.message).toBe('token_response: /access_token breaks maxLength 8192');
  expect(error.message).not.toContain(SECRET);
  const missing = refusal('home', { ...home(), member_id: undefined });
  expect(missing.message).toBe('home: / lacks member_id');
  const email = refusal('account', { ...example('account'), email: `${SECRET}\u0001@example.com` });
  expect(email.message).toBe('account: /email breaks pattern');
  const name = refusal('profile_create', { display_name: `${SECRET}\u0007` });
  expect(name.message).toBe('profile_create: /display_name breaks pattern');
});

test('a single field has its check too, for what people type', () => {
  expect(checked('name', 'Nhà Linh')).toBe('Nhà Linh');
  expect(refusal('name', 'Nhà\tLinh').message).toBe('name: / breaks pattern');
  expect(refusal('time_zone', 'Asia/Ho Chi Minh').message).toBe('time_zone: / breaks pattern');
  expect(accepts('email', 'linh@example.com')).toBe(true);
});
