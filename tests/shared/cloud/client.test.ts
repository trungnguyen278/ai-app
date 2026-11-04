// SPDX-License-Identifier: MIT
// The app API's client (ADR-0004, decision 2), end to end on the simulated cloud: signing in,
// renewing an access token, what each refusal becomes, and the retries that an Idempotency-Key
// makes safe.
import { loadSettings } from '@/app.config';
import {
  CloudClient,
  OAuthRefused,
  Refused,
  SignedOut,
  SignInClient,
  SimulatedCloud,
  Unavailable,
  Unreachable,
  type CloudRequest,
  type CloudResponse,
  type CloudSettings,
  type Credentials,
  type Transport,
} from '@/src/shared/cloud';
import { ProtocolError } from '@/src/shared/protocols';

const SETTINGS: CloudSettings = (() => {
  const { cloud } = loadSettings('development');
  return { ...cloud, simulated: { ...cloud.simulated, latency: 0 } };
})();

/** A transport that hands requests to `next`, and lets a test see and change them. */
class Spy implements Transport {
  readonly requests: CloudRequest[] = [];
  /** What the next requests get instead of the cloud's answer, in order. */
  readonly instead: ((request: CloudRequest) => Promise<CloudResponse>)[] = [];

  constructor(private readonly next: Transport) {}

  send(request: CloudRequest): Promise<CloudResponse> {
    this.requests.push(request);
    const answer = this.instead.shift();
    return answer === undefined ? this.next.send(request) : answer(request);
  }
}

/** A session as `account` keeps one, enough for these tests: tokens, refreshed on demand. */
class Session implements Credentials {
  renewals = 0;

  constructor(
    private readonly signIn: SignInClient,
    public tokens: { access: string; refresh: string } | null,
  ) {}

  async accessToken(): Promise<string | null> {
    return this.tokens?.access ?? null;
  }

  async renew(refused: string): Promise<string | null> {
    if (this.tokens === null) return null;
    if (this.tokens.access !== refused) return this.tokens.access;
    this.renewals += 1;
    try {
      const answer = await this.signIn.refresh(this.tokens.refresh);
      this.tokens = { access: answer.access_token, refresh: answer.refresh_token };
      return answer.access_token;
    } catch (error) {
      if (error instanceof OAuthRefused) {
        this.tokens = null;
        return null;
      }
      throw error;
    }
  }
}

function setUp(options: { settings?: CloudSettings } = {}) {
  const settings = options.settings ?? SETTINGS;
  let now = Date.UTC(2026, 10, 4, 8, 0, 0);
  const cloud = new SimulatedCloud(settings.simulated, [SETTINGS.client_id], { clock: () => now });
  const spy = new Spy(cloud);
  const signIn = new SignInClient(spy, settings, { clock: () => now });
  const delays: number[] = [];
  const pauses: (() => Promise<void>)[] = [];
  const sleep = async (seconds: number) => {
    delays.push(seconds);
    await pauses.shift()?.();
  };

  async function person(name: string): Promise<{ client: CloudClient; session: Session }> {
    const { nonce } = await signIn.nonce();
    const email = `${name.toLowerCase()}@example.com`;
    const idToken = await signIn.developmentIdToken({ nonce, display_name: name, email });
    const tokens = await signIn.exchange(idToken, { sessionLabel: 'Pixel 8' });
    const session = new Session(signIn, {
      access: tokens.access_token,
      refresh: tokens.refresh_token,
    });
    return {
      client: new CloudClient(spy, settings, session, { sleep, clock: () => now }),
      session,
    };
  }

  return {
    cloud,
    spy,
    signIn,
    person,
    delays,
    pauses,
    later: (seconds: number) => {
      now += seconds * 1000;
    },
  };
}

const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi', 'en'] };

async function refusal(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (error) {
    return error as Error;
  }
  throw new Error('it was not refused');
}

test('signs a person in with the development provider, and reads their account', async () => {
  const { person, spy } = setUp();
  const { client } = await person('Linh');
  const account = await client.account();
  expect(account).toMatchObject({ display_name: 'Linh', email: 'linh@example.com' });
  expect(account.identities.map((identity) => identity.provider)).toEqual(['development']);
  const exchange = spy.requests.find((request) => request.target === '/app/token')!;
  expect(exchange.headers['content-type']).toBe('application/x-www-form-urlencoded');
  expect(Object.fromEntries(new URLSearchParams(exchange.body))).toMatchObject({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    client_id: 'ai-app',
    session_label: 'Pixel 8',
  });
  expect(spy.requests.at(-1)!.headers.authorization).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/);
});

test('an access token refused with 401 is renewed once, and the request sent again', async () => {
  const { person, later, spy } = setUp();
  const { client, session } = await person('Linh');
  const first = session.tokens!.access;
  later(SETTINGS.simulated.access_lifetime);
  expect((await client.account()).display_name).toBe('Linh');
  expect(session.renewals).toBe(1);
  const [refused, refresh, renewed] = spy.requests.slice(-3);
  expect(refresh.target).toBe('/app/token');
  expect([refused.headers.authorization, renewed.headers.authorization]).toEqual([
    `Bearer ${first}`,
    `Bearer ${session.tokens!.access}`,
  ]);
});

test('a session that has ended is SignedOut, and so is nobody signed in', async () => {
  const { person, signIn, spy } = setUp();
  const { client, session } = await person('Linh');
  await signIn.revoke(session.tokens!.refresh);
  const ended = await refusal(client.account());
  expect(ended).toBeInstanceOf(SignedOut);
  expect(ended.message).toBe('account: signed out');
  expect(session.tokens).toBeNull();
  const sent = spy.requests.length;
  expect(await refusal(client.homes())).toBeInstanceOf(SignedOut);
  expect(spy.requests).toHaveLength(sent);
});

test("a refused request carries its problem's type, and what the app compares it to", async () => {
  const { person } = setUp();
  const { client } = await person('Linh');
  const [identity] = (await client.account()).identities;
  const error = await refusal(client.removeIdentity(identity.id));
  expect(error).toBeInstanceOf(Refused);
  const refused = error as Refused;
  expect([refused.status, refused.type]).toEqual([409, '/app/v1/problems/last_identity']);
  expect([refused.is('last_identity'), refused.is('identity_taken')]).toEqual([true, false]);
  expect(refused.message).toBe('removeIdentity: 409 /app/v1/problems/last_identity');
  const missing = (await refusal(client.home('01a1a06c-1400-7ffd-b448-26955bb4d510'))) as Refused;
  expect([missing.status, missing.type]).toEqual([404, 'about:blank']);
});

test("the OAuth endpoints' refusals are OAuth's errors", async () => {
  const { signIn } = setUp();
  const unknown = (await refusal(signIn.refresh('not-a-refresh-token'))) as OAuthRefused;
  expect(unknown).toBeInstanceOf(OAuthRefused);
  expect([unknown.status, unknown.error, unknown.message]).toEqual([
    400,
    'invalid_grant',
    'refresh: 400 invalid_grant',
  ]);
  const { signIn: stranger } = setUp({ settings: { ...SETTINGS, client_id: 'another-app' } });
  const client = (await refusal(stranger.refresh('not-a-refresh-token'))) as OAuthRefused;
  expect([client.status, client.error]).toEqual([401, 'invalid_client']);
});

test('a change made from a stale ETag is refused with 412', async () => {
  const { person } = setUp();
  const { client } = await person('Linh');
  const { etag } = await client.account();
  const changed = await client.updateAccount({ languages: ['vi', 'en'] }, etag);
  expect([changed.languages, changed.etag]).toEqual([['vi', 'en'], 'W/"2"']);
  const stale = (await refusal(client.updateAccount({ display_name: 'Lin' }, etag))) as Refused;
  expect(stale.status).toBe(412);
});

test("a list is walked page by page, with the configuration's page size by default", async () => {
  const { person, spy } = setUp();
  const { client } = await person('Linh');
  const made = [];
  for (const name of ['Nhà một', 'Nhà hai', 'Nhà ba']) {
    made.push((await client.createHome({ ...HOME, name })).id);
  }
  await client.homes();
  expect(spy.requests.at(-1)!.target).toBe(`/app/v1/homes?page_size=${SETTINGS.page_size}`);
  const walked = [];
  let pageToken: string | undefined;
  do {
    const page = await client.homes({ pageSize: 1, pageToken });
    walked.push(...page.homes.map((home) => home.id));
    pageToken = page.next_page_token;
  } while (pageToken);
  expect(walked).toEqual(made);
});

test('a request with an Idempotency-Key whose answer was lost is sent again with that key', async () => {
  const { person, spy, cloud, delays } = setUp();
  const { client } = await person('Linh');
  // The cloud creates the home, but its answer never arrives.
  spy.instead.push(async (request) => {
    await cloud.send(request);
    throw new Unreachable('timeout');
  });
  const home = await client.createHome(HOME);
  const [lost, retry] = spy.requests.slice(-2);
  expect(lost.headers['idempotency-key']).toMatch(/^"[0-9a-f-]{36}"$/);
  expect(retry.headers['idempotency-key']).toBe(lost.headers['idempotency-key']);
  expect(retry.body).toBe(lost.body);
  expect(delays).toEqual([SETTINGS.retry_delay]);
  expect((await client.homes()).homes.map((each) => each.id)).toEqual([home.id]);
});

test('a copy sent while the first still runs is refused with 409, and tried again', async () => {
  const settings = { ...SETTINGS, simulated: { ...SETTINGS.simulated, latency: 0.01 } };
  const { person, spy, cloud, delays, pauses } = setUp({ settings });
  const { client } = await person('Linh');
  let first: Promise<CloudResponse> | undefined;
  // The first copy is still running in the cloud when the app gives up on it.
  spy.instead.push(async (request) => {
    first = cloud.send(request);
    throw new Unreachable('timeout');
  });
  // The second comes at once, while the first runs; the third once it has been answered.
  pauses.push(
    async () => {},
    async () => {
      await first;
    },
  );
  const home = await client.createHome(HOME);
  expect(delays).toEqual([SETTINGS.retry_delay, 2 * SETTINGS.retry_delay]);
  expect(spy.requests.slice(-3).map((request) => request.headers['idempotency-key'])).toEqual(
    Array(3).fill(spy.requests.at(-1)!.headers['idempotency-key']),
  );
  expect((await client.homes()).homes.map((each) => each.id)).toEqual([home.id]);
});

test('a request without an Idempotency-Key is never sent again, nor one past its retries', async () => {
  const { person, spy, delays } = setUp();
  const { client } = await person('Linh');
  const home = await client.createHome(HOME);
  const sent = spy.requests.length;
  spy.instead.push(async () => {
    throw new Unreachable('offline');
  });
  expect(await refusal(client.createInvitation(home.id))).toBeInstanceOf(Unreachable);
  expect(spy.requests).toHaveLength(sent + 1);
  for (let attempt = 0; attempt <= SETTINGS.retries; attempt++) {
    spy.instead.push(async () => {
      throw new Unreachable('offline');
    });
  }
  expect(await refusal(client.createHome(HOME))).toBeInstanceOf(Unreachable);
  expect(spy.requests).toHaveLength(sent + 2 + SETTINGS.retries);
  expect(delays).toHaveLength(SETTINGS.retries);
});

test('joining tells a first join from a retry, and the invitation stays usable for neither else', async () => {
  const { person } = setUp();
  const { client: owner } = await person('Linh');
  const { client: joiner } = await person('Minh');
  const home = await owner.createHome(HOME);
  const { code } = await owner.createInvitation(home.id);
  expect(await joiner.lookUpInvitation(code)).toMatchObject({
    home_name: 'Nhà Linh',
    invited_by: 'Linh',
  });
  const first = await joiner.acceptInvitation(code);
  const again = await joiner.acceptInvitation(code);
  expect([first.joined, again.joined, again.home.member_id]).toEqual([
    true,
    false,
    first.home.member_id,
  ]);
  expect(first.home.role).toBe('member');
});

test('an answer that breaks the protocol fails where it arrives, and names no value', async () => {
  const { person, spy } = setUp();
  const { client } = await person('Linh');
  const answer =
    (status: number, body: string, headers = {}) =>
    async () => ({ status, headers, body });
  spy.instead.push(answer(200, JSON.stringify({ display_name: 'secret-name' })));
  const missing = await refusal(client.account());
  expect(missing).toBeInstanceOf(ProtocolError);
  expect(missing.message).toBe('account: / lacks id');
  spy.instead.push(answer(200, '<html>secret</html>'));
  expect((await refusal(client.account())).message).toBe('account: / is not JSON');
  spy.instead.push(answer(302, ''));
  expect((await refusal(client.account())).message).toBe('account: / is answered 302');
  spy.instead.push(answer(404, '<html>Not here</html>'));
  expect(await refusal(client.account())).toBeInstanceOf(ProtocolError);
});

test('a new invitation without its code breaks the protocol, though a listed one has none', async () => {
  const { person, spy } = setUp();
  const { client } = await person('Linh');
  const home = await client.createHome(HOME);
  const { code: _, ...listed } = await client.createInvitation(home.id);
  spy.instead.push(async () => ({ status: 201, headers: {}, body: JSON.stringify(listed) }));
  expect((await refusal(client.createInvitation(home.id))).message).toBe(
    'createInvitation: /code is missing',
  );
});

test('a status of 500 or more is Unavailable, with how long to wait', async () => {
  const { person, spy } = setUp();
  const { client } = await person('Linh');
  spy.instead.push(async () => ({ status: 503, headers: { 'retry-after': '7' }, body: '' }));
  const error = (await refusal(client.account())) as Unavailable;
  expect(error).toBeInstanceOf(Unavailable);
  expect([error.status, error.retryAfter]).toEqual([503, 7]);
});
