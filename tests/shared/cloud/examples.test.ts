// SPDX-License-Identifier: MIT
// ai-platform's examples of the app API, replayed against the simulated cloud as they are
// against ai-cloud (ADR-0004, decision 3): each request the app makes, at the transport, and
// each answer the cloud gives, as the example writes it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadSettings } from '@/app.config';
import { SimulatedCloud, type CloudRequest, type Method } from '@/src/shared/cloud';

type Body = Record<string, unknown>;

interface Step {
  from?: 'app' | 'cloud';
  request?: string;
  headers?: Record<string, string>;
  message?: Body;
  status?: number;
  note?: string;
}

interface Person {
  subject: string;
  email: string;
  name: string;
}

/** What a replay knows: who is who, and what the cloud made up for what the example did. */
class Replay {
  readonly cloud: SimulatedCloud;
  /** Each person's tokens, as the cloud last gave them. */
  readonly tokens = new Map<string, { access: string; refresh: string }>();
  /** The example's made-up values, and the cloud's. */
  readonly known = new Map<string, string>();
  speaker: string;

  constructor(first: string) {
    const { cloud } = loadSettings('development');
    this.cloud = new SimulatedCloud({ ...cloud.simulated, latency: 0 }, [cloud.client_id]);
    this.speaker = first;
  }

  /** What the example made up, as the cloud did. */
  ours<T>(value: T): T {
    if (typeof value === 'string') {
      let text: string = value;
      for (const [theirs, mine] of this.known) text = text.split(theirs).join(mine);
      return text as T;
    }
    if (Array.isArray(value)) return value.map((each) => this.ours(each)) as T;
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, each]) => [key, this.ours(each)]),
      ) as T;
    }
    return value;
  }

  /** Note what the cloud made up, and compare the rest. */
  learn(expected: unknown, answered: unknown, where = ''): void {
    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      expect([where, typeof answered]).toEqual([where, 'object']);
      const body = answered as Body;
      for (const [key, value] of Object.entries(expected)) {
        if (IGNORED.includes(key)) continue;
        expect([where, key, key in body]).toEqual([where, key, true]);
        if (MADE_UP.includes(key)) {
          expect(typeof body[key]).toBe('string');
          const mine = this.known.get(value as string);
          if (mine === undefined) {
            this.known.set(value as string, body[key] as string);
          } else {
            expect([where, key, body[key]]).toEqual([where, key, mine]);
          }
        } else {
          this.learn(value, body[key], `${where}/${key}`);
        }
      }
      const extra = Object.keys(body).filter((key) => !(key in expected) && !LOGGED.includes(key));
      expect([where, extra]).toEqual([where, []]);
    } else if (Array.isArray(expected)) {
      expect([where, (answered as unknown[]).length]).toEqual([where, expected.length]);
      expected.forEach((each, index) =>
        this.learn(each, (answered as unknown[])[index], `${where}/${index}`),
      );
    } else {
      expect([where, answered]).toEqual([where, expected]);
    }
  }

  /** Sign `who` in with Google, as `person`, on a phone with `label`. */
  async signIn(who: string, person: Person, label: string): Promise<void> {
    const { nonce } = await this.call('POST', '/app/v1/nonces');
    const { idToken } = this.cloud.signInWith('google', person, nonce as string);
    const tokens = await this.call('POST', '/app/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: idToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      client_id: 'ai-app',
      session_label: label,
    });
    this.tokens.set(who, {
      access: tokens.access_token as string,
      refresh: tokens.refresh_token as string,
    });
  }

  /** A request of the setting up, as `this.speaker`, which must succeed. */
  async call(method: Method, target: string, body?: Body, headers: Body = {}): Promise<Body> {
    const response = await this.cloud.send(this.request(method, target, body, headers));
    if (response.status >= 300) throw new Error(`${target}: ${response.status} ${response.body}`);
    return response.body === '' ? {} : JSON.parse(response.body);
  }

  request(method: Method, target: string, body?: Body, extra: Body = {}): CloudRequest {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(extra)) headers[name.toLowerCase()] = String(value);
    const oauth = target === '/app/token' || target === '/app/revoke';
    const tokens = this.tokens.get(this.speaker);
    if (!oauth && tokens !== undefined) headers.authorization = `Bearer ${tokens.access}`;
    if (body === undefined) return { method, target, headers };
    if (oauth) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      const form = new URLSearchParams(body as Record<string, string>);
      return { method, target, headers, body: form.toString() };
    }
    headers['content-type'] = 'application/json';
    return { method, target, headers, body: JSON.stringify(body) };
  }

  /** The example's ID tokens, made again by the simulated providers: the same person, with the
   *  cloud's nonce. Those the cloud made itself, the development provider's, it knows. */
  idTokens(body: Body): Body {
    const result = { ...body };
    for (const field of ['subject_token', 'id_token']) {
      const token = body[field];
      if (typeof token !== 'string' || this.known.has(token)) continue;
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      const provider = PROVIDERS[claims.iss as string];
      const made = this.cloud.signInWith(
        provider,
        { subject: claims.sub, email: claims.email, name: claims.name },
        this.ours(claims.nonce as string),
      );
      result[field] = made.idToken;
      if (made.authorizationCode !== undefined) result.authorization_code = made.authorizationCode;
    }
    return result;
  }

  /** Every exchange of `steps`, as the example writes it. */
  async run(steps: Step[], speakers: Record<string, string>): Promise<void> {
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index];
      if (step.note !== undefined) {
        for (const [words, who] of Object.entries(speakers)) {
          if (step.note.includes(words)) this.speaker = who;
        }
        continue;
      }
      const answer = steps[++index];
      const [method, target] = step.request!.split(' ') as [Method, string];
      const body = step.message === undefined ? undefined : this.ours(this.idTokens(step.message));
      const request = this.request(method, this.ours(target), body, this.ours(step.headers ?? {}));
      const response = await this.cloud.send(request);
      expect([step.request, response.status]).toEqual([step.request, answer.status]);
      if (answer.message !== undefined) {
        const answered = JSON.parse(response.body);
        this.learn(answer.message, answered, step.request);
        if (typeof answered.access_token === 'string') {
          this.tokens.set(this.speaker, {
            access: answered.access_token,
            refresh: answered.refresh_token,
          });
        }
      }
    }
  }
}

// Fields whose values the cloud makes up, and the example too.
const MADE_UP = ['id', 'member_id', 'code', 'nonce', 'access_token', 'refresh_token', 'id_token'];
// Fields for logs, not part of the protocol.
const LOGGED = ['detail', 'error_description'];
// Fields compared by neither: the cloud's clock, or logs.
const IGNORED = ['create_time', 'expire_time', 'last_use_time', ...LOGGED];
// The providers, by their ID tokens' issuer (the app API, The exchange and Development).
const PROVIDERS: Record<string, 'google' | 'apple'> = {
  'https://accounts.google.com': 'google',
  'https://appleid.apple.com': 'apple',
};

function example(name: string): Step[] {
  const path = join(__dirname, '..', '..', '..', 'platform', 'protocols', 'app', 'examples');
  return JSON.parse(readFileSync(join(path, `${name}.json`), 'utf8')).messages;
}

const LINH = { email: 'linh@example.com', name: 'Linh' };

test('sign-in.json: a new owner signs in with Google, and a refresh token used twice ends the session', async () => {
  await new Replay('linh').run(example('sign-in'), {});
});

test('development.json: the development provider signs a test person in', async () => {
  await new Replay('test').run(example('development'), {});
});

test('account.json: identities, sessions, the last identity, and an account that owns a home with others', async () => {
  const replay = new Replay('linh');
  // As in sign-in.json, on an Android phone, then on the iPhone of this example.
  const google = { ...LINH, subject: '100000000000000000001' };
  await replay.signIn('pixel', google, 'Pixel 8');
  await replay.signIn('linh', google, 'iPhone 16');
  // The owner's home, with a second person in it.
  replay.speaker = 'linh';
  const home = await replay.call(
    'POST',
    '/app/v1/homes',
    { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] },
    { 'Idempotency-Key': '"01a1a06c-1400-75e6-a77f-f2149dbe59d5"' },
  );
  const { code } = await replay.call('POST', `/app/v1/homes/${home.id}/invitations`);
  await replay.signIn(
    'minh',
    { subject: '108765432109876543210', email: 'minh@example.com', name: 'Minh' },
    'Pixel 9',
  );
  replay.speaker = 'minh';
  await replay.call('POST', '/app/v1/invitations:accept', { code });
  replay.speaker = 'linh';
  // What the example names without showing it: Google's identity, and the iPhone's refresh token.
  const account = await replay.call('GET', '/app/v1/account');
  replay.known.set(
    '01a190f9-000a-7b2d-8c3f-5e8a7b2c3d4e',
    (account.identities as Body[])[0].id as string,
  );
  replay.known.set(
    'zOnjMpFPXGzewOQbnU0ElPRrxtHj7tr85eAV6SSn8S4',
    replay.tokens.get('linh')!.refresh,
  );
  await replay.run(example('account'), {});
});

test('homes.json: a home, its people, an invitation, handing it over and deleting it', async () => {
  const replay = new Replay('linh');
  await replay.signIn('linh', { ...LINH, subject: '109876543210987654321' }, 'Pixel 8');
  await replay.signIn(
    'minh',
    { subject: '108765432109876543210', email: 'minh@example.com', name: 'Minh' },
    'Pixel 9',
  );
  await replay.signIn(
    'bao',
    { subject: '107654321098765432109', email: 'bao@example.com', name: 'Bảo' },
    'Galaxy',
  );
  // Who asks from each note on, as the notes tell it (ai-cloud's replay reads them alike).
  await replay.run(example('homes'), {
    'The second person opens it': 'minh',
    'Someone else': 'bao',
    'The owner sees': 'linh',
    'The new admin': 'minh',
    'The owner tries': 'linh',
    'So the owner': 'linh',
    'The second person, now': 'minh',
    'The old owner leaves': 'linh',
    'The new owner, the last': 'minh',
  });
});
