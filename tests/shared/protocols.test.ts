// SPDX-License-Identifier: MIT
// The protocols' generated checks (ADR-0004): they accept what ai-platform's examples have the
// cloud send, they read the schema as Ajv does when it compiles it, and what they refuse they
// describe without its value.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';

import { ProtocolError, received, type AppReceived } from '@/src/shared/protocols';

type Body = Record<string, unknown>;

const PROTOCOL = join(__dirname, '..', '..', 'platform', 'protocols', 'app');
const schema = JSON.parse(readFileSync(join(PROTOCOL, 'schema.json'), 'utf8'));
const examples: { messages: { from?: string; message?: Body }[] }[] = readdirSync(
  join(PROTOCOL, 'examples'),
)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(PROTOCOL, 'examples', file), 'utf8')));

// What the cloud sends in the examples.
const fromCloud: Body[] = examples
  .flatMap((example) => example.messages)
  .filter((step) => step.from === 'cloud' && step.message !== undefined)
  .map((step) => step.message as Body);

// The definitions that the schema's from_cloud tells apart, as the generator reads them.
const DEFINITIONS = (schema.$defs.from_cloud.allOf as { then: { $ref: string } }[]).map((branch) =>
  branch.then.$ref.replace('#/$defs/', ''),
) as (keyof AppReceived)[];

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

function accepts(definition: keyof AppReceived, body: unknown): boolean {
  try {
    received(definition, body);
    return true;
  } catch (error) {
    if (!(error instanceof ProtocolError)) {
      throw error;
    }
    return false;
  }
}

function refusal(definition: keyof AppReceived, body: unknown): ProtocolError {
  try {
    received(definition, body);
  } catch (error) {
    if (error instanceof ProtocolError) {
      return error;
    }
    throw error;
  }
  throw new Error(`${definition} accepted it`);
}

function example(definition: keyof AppReceived): Body {
  const body = fromCloud.find((each) => compiled(definition)(each));
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
  { ...example('account'), email: 'linh﻿@example.com' },
  { ...example('token_response'), token_type: 'Bearerx' },
  { ...example('problem'), type: '/app/v1/problems/Not-A-Code' },
  { ...example('invitation_preview'), expire_time: '2026-11-06 08:10:00' },
];

test('a check exists for every body that the cloud sends', () => {
  expect(DEFINITIONS.length).toBeGreaterThan(10);
  for (const definition of DEFINITIONS) {
    expect(refusal(definition, undefined)).toBeInstanceOf(ProtocolError);
  }
});

test.each(fromCloud.map((body, index) => [index, body] as const))(
  "the examples' body %i from the cloud passes the check of its definition",
  (_, body) => {
    expect(compiled('from_cloud')(body)).toBe(true);
    expect(DEFINITIONS.some((definition) => accepts(definition, body))).toBe(true);
  },
);

test('the generated checks read the schema as Ajv compiles it', () => {
  for (const definition of DEFINITIONS) {
    const check = compiled(definition);
    for (const body of [...fromCloud, ...PLANTED]) {
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
});
