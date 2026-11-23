// SPDX-License-Identifier: MIT
// ai-platform's test vectors (platform/vectors/, whose README says how to run them): texts that
// every side's JSON reader takes or refuses alike, and messages that every side's schema checks
// find valid or invalid alike, each within its file's `seconds`. ai-cloud and ai-robot run the
// same files (tests/shared/test_vectors.py, software/tests/test_vectors.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readMessage } from '@/src/setup/domain/messages';
import { FetchTransport, type CloudRequest } from '@/src/shared/cloud';
import { readBody } from '@/src/shared/cloud/exchange';
import {
  FORM_TYPE,
  formEncode,
  REVOKE_PATH,
  TOKEN_PATH,
  type Fields,
} from '@/src/shared/cloud/http';
import { runtimeSettings } from '@/src/shared/config';
import {
  checked,
  JsonError,
  ProtocolError,
  readJson,
  setupChecked,
  utf8Text,
  type AppDefinition,
  type SetupDefinition,
} from '@/src/shared/protocols';
import * as appChecks from '@/src/shared/protocols/generated/app-checks';
import * as setupChecks from '@/src/shared/protocols/generated/setup-checks';

import { CLOUD as SET_UP_CLOUD, setUp } from './cloud/simulated';

type Part = { text: string; times?: number } | { before: string; after: string; times: number };

interface Vector {
  id: string;
  comment: string;
  text?: string;
  hex?: string;
  parts?: Part[];
}

interface ReadingVector extends Vector {
  result: 'read' | 'refused' | 'either';
  group?: string;
  depth?: number;
}

interface ValidatingVector extends Vector {
  protocol: string;
  definition: string;
  result: 'valid' | 'invalid';
  /** With `invalid`: the only keyword of the definition that the message breaks. */
  keyword?: string;
}

interface Vectors<V> {
  description: string;
  seconds: number;
  vectors: V[];
}

const PLATFORM = join(__dirname, '..', '..', 'platform');

function file<V>(name: string): Vectors<V> {
  return JSON.parse(readFileSync(join(PLATFORM, 'vectors', `${name}.json`), 'utf8')) as Vectors<V>;
}

/** The names of the definitions of `protocol`'s pinned schema. */
function definitions(protocol: string): string[] {
  const path = join(PLATFORM, 'protocols', protocol, 'schema.json');
  return Object.keys((JSON.parse(readFileSync(path, 'utf8')) as { $defs: object }).$defs);
}

const READING = file<ReadingVector>('reading');
const VALIDATING = file<ValidatingVector>('validating');

/** A vector's bytes: its `hex`, or its `text` or `parts` in UTF-8. */
function bytes(vector: Vector): Uint8Array {
  if (vector.hex !== undefined) {
    return Uint8Array.from(Buffer.from(vector.hex, 'hex'));
  }
  const text =
    vector.text ??
    vector
      .parts!.map((part) =>
        'before' in part
          ? Array.from({ length: part.times }, (_, n) => `${part.before}${n}${part.after}`).join('')
          : part.text.repeat(part.times ?? 1),
      )
      .join('');
  return new TextEncoder().encode(text);
}

const CLOUD = runtimeSettings().cloud;
const REQUEST: CloudRequest = { method: 'GET', target: '/app/v1/account', headers: {} };

/** An answer of the cloud, as fetch gives one, whose body is `body`. */
function answer(body: Uint8Array): Response {
  return {
    status: 200,
    headers: { forEach: () => undefined },
    arrayBuffer: async () => body.slice().buffer,
    // fetch's own text repairs bytes that are not UTF-8, as the Fetch Standard's does.
    text: async () => new TextDecoder().decode(body),
  } as unknown as Response;
}

/**
 * The app's readers, each given a text's bytes as its transport gives them: a set-up message, as
 * a device's Bluetooth service carries it, and an answer of the app API, as fetch carries it, at
 * the app's limit on its size, read as the client reads its body (`readBody`).
 */
const READERS: Record<string, (given: Uint8Array) => Promise<unknown>> = {
  'set-up': async (given) => readMessage(given, 'from_device'),
  'the app API': async (given) => {
    const transport = new FetchTransport(
      'https://cloud.example',
      CLOUD.timeout,
      CLOUD.answer_limit,
      async () => answer(given),
    );
    return readBody('account', (await transport.send(REQUEST)).body);
  },
};

/** Whether `error` is how the app refuses a text: never naming a value (SEC-5). */
function isRefusal(error: unknown): boolean {
  return error instanceof ProtocolError || error instanceof JsonError;
}

/** How `read` answers `vector`, and what it read; within the file's time. */
async function answerOf(
  read: (given: Uint8Array) => Promise<unknown>,
  vector: ReadingVector,
): Promise<{ answer: 'read' | 'refused'; value?: unknown }> {
  const given = bytes(vector);
  const start = performance.now();
  let result: { answer: 'read' | 'refused'; value?: unknown };
  try {
    result = { answer: 'read', value: await read(given) };
  } catch (error) {
    if (!isRefusal(error)) throw error;
    result = { answer: 'refused' };
  }
  expect(performance.now() - start).toBeLessThanOrEqual(READING.seconds * 1000);
  return result;
}

const byId = <V extends Vector>(vectors: V[]) =>
  vectors.map((vector) => [vector.id, vector] as const);

// A 1 MiB vector takes a while to make and to compare, beside the time it is read in.
jest.setTimeout(60_000);

describe.each(Object.entries(READERS))('%s reads each text as every side reads it', (_, read) => {
  // `read` and `refused` are ADR-0014's answers; `either`, a receiver's choice. A vector's
  // `depth` is past 64, as deep as the app reads (JSON_DEPTH), so it keeps its result here.
  test.each(byId(READING.vectors))('%s', async (_id, vector) => {
    const { answer, value } = await answerOf(read, vector);
    if (vector.result === 'either') return;
    expect(answer).toBe(vector.result);
    if (answer === 'read') {
      // What the platform's standard parser returns.
      expect(value).toEqual(JSON.parse(new TextDecoder().decode(bytes(vector))));
    }
  });

  test('a group of texts is answered alike', async () => {
    // A receiver may refuse a number past a double, for one, but in every spelling or none.
    const groups = new Map<string, Set<string>>();
    for (const vector of READING.vectors) {
      if (vector.group === undefined) continue;
      const answers = groups.get(vector.group) ?? new Set();
      answers.add((await answerOf(read, vector)).answer);
      groups.set(vector.group, answers);
    }
    expect(groups.size).toBeGreaterThan(0);
    for (const [group, answers] of groups) {
      expect({ group, answers: answers.size }).toEqual({ group, answers: 1 });
    }
  });
});

/**
 * The protocols whose vectors the app runs, each with its generated checks (ADR-0004), by
 * definition, and its check, as the app and its simulated sides check what they receive. The app
 * does not speak the cloud link.
 */
const CHECKS: Record<
  string,
  { checks: object; check: (definition: string, value: unknown) => unknown }
> = {
  app: {
    checks: appChecks,
    check: (definition, value) => checked(definition as AppDefinition, value),
  },
  setup: {
    checks: setupChecks,
    check: (definition, value) => setupChecked(definition as SetupDefinition, value),
  },
};

const RUN = VALIDATING.vectors.filter((vector) => vector.protocol in CHECKS);
/**
 * The vectors that the app checks: each but those of a definition that only tells bodies apart,
 * such as the app API's `from_app`, which has no check (scripts/protocols.mjs), since each
 * endpoint knows the body it takes. ai-cloud runs those.
 */
const CHECKED = RUN.filter((vector) => vector.definition in CHECKS[vector.protocol].checks);

test('the vectors that the app does not check are of definitions of the pinned schemas', () => {
  const unchecked = RUN.filter((vector) => !CHECKED.includes(vector));
  for (const vector of unchecked) {
    expect(definitions(vector.protocol)).toContain(vector.definition);
  }
});

/** The schema's keyword that `rule`, as a `ProtocolError` words it, names. */
function keywordOf(rule: string): string {
  if (rule.startsWith('lacks ')) return 'required';
  if (rule.startsWith('must be of type ')) return 'type';
  // `breaks <keyword>`, and its limit when it has one.
  return rule.split(' ')[1];
}

test.each(Object.keys(CHECKS))('the vectors of %s are run', (protocol) => {
  expect(CHECKED.some((vector) => vector.protocol === protocol)).toBe(true);
});

test.each(byId(CHECKED))('%s is checked as every side checks it', (_id, vector) => {
  const given = bytes(vector);
  const start = performance.now();
  let valid = true;
  try {
    // Read as every text the app receives is, which must read it.
    CHECKS[vector.protocol].check(vector.definition, readJson(utf8Text(given)));
  } catch (error) {
    // A refused read fails the test.
    if (!(error instanceof ProtocolError)) throw error;
    valid = false;
    // The rule that the error names is the one the vector breaks, where it says which.
    if (vector.keyword !== undefined) expect(keywordOf(error.rule)).toBe(vector.keyword);
  }
  expect(performance.now() - start).toBeLessThanOrEqual(VALIDATING.seconds * 1000);
  expect(valid).toBe(vector.result === 'valid');
});

/** The endpoint of each OAuth form, which the app sends as a form, not as JSON (the app API,
 *  The exchange, Refreshing and Signing out). */
const FORMS: Record<string, string> = {
  token_exchange_request: TOKEN_PATH,
  refresh_request: TOKEN_PATH,
  revoke_request: REVOKE_PATH,
};

/** A vector's fields, which a form carries only as text. */
const fieldsOf = (vector: Vector) =>
  JSON.parse(new TextDecoder().decode(bytes(vector))) as Record<string, unknown>;

/** The vectors of the OAuth forms that a form can carry: those whose fields are all text. */
const SENT = CHECKED.filter(
  (vector) =>
    vector.protocol === 'app' &&
    vector.definition in FORMS &&
    Object.values(fieldsOf(vector)).every((value) => typeof value === 'string'),
);

describe("the OAuth forms' vectors, as the app writes a form", () => {
  test.each(byId(SENT))(
    '%s is answered at its endpoint as the schema finds it',
    async (_id, vector) => {
      const fields = fieldsOf(vector) as Fields;
      const { send } = setUp();
      const { status, body } = await send('POST', FORMS[vector.definition], {
        body: formEncode(fields),
        headers: { 'content-type': FORM_TYPE },
      });
      if (vector.result === 'valid') {
        // Read, and past the form's check: the service answers it, whatever it then finds.
        expect(status).not.toBe(413);
        expect(body.error).not.toBe('invalid_request');
        if (vector.definition === 'revoke_request') {
          // A revocation answers 200 whatever the token, and its hint (RFC 7009, 2.1 and 2.2),
          // for the app's own client_id; another is invalid_client.
          expect(status).toBe(fields.client_id === SET_UP_CLOUD.client_id ? 200 : 401);
        }
        return;
      }
      let refusal: unknown;
      try {
        CHECKS.app.check(vector.definition, fields);
      } catch (error) {
        refusal = error;
      }
      // Refused as the app's own check refuses it, naming the field and the rule, which the
      // vectors' keywords hold above, and never what the form holds (SEC-5).
      expect([status, body.error]).toEqual([400, 'invalid_request']);
      expect(refusal).toBeInstanceOf(ProtocolError);
      expect(body.error_description).toBe((refusal as ProtocolError).message);
      // A value may be named only as a field's name, as a refresh's grant is `refresh_token`.
      for (const value of Object.values(fields) as string[]) {
        if (!(value in fields)) expect(body.error_description).not.toContain(value);
      }
    },
  );

  test("the longest is as long as its vector says: a form percent-encodes `~`, as WHATWG's does", () => {
    // app-token-exchange-longest's comment, and the app API, The cloud's address: 16,120 bytes.
    const longest = SENT.find((vector) => vector.id === 'app-token-exchange-longest')!;
    expect(new TextEncoder().encode(formEncode(fieldsOf(longest) as Fields)).length).toBe(16_120);
  });
});
