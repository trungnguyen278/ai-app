// SPDX-License-Identifier: MIT
// The session (ADR-0004, decision 4), against the simulated cloud: kept in secure storage,
// refreshed one at a time, sent again after a lost answer (the app API 1.3), and ended when the
// cloud refuses its token, or the person signs out.
import { loadSettings } from '@/app.config';
import { developmentProvider } from '@/src/account/adapters/development';
import { MemorySecrets } from '@/src/account/adapters/memory';
import { Session } from '@/src/account/services/session';
import {
  CloudClient,
  SignedOut,
  SignInClient,
  SimulatedCloud,
  Unreachable,
  type CloudRequest,
  type CloudResponse,
  type CloudSettings,
  type Transport,
} from '@/src/shared/cloud';

const SETTINGS: CloudSettings = (() => {
  const { cloud } = loadSettings('development');
  return { ...cloud, simulated: { ...cloud.simulated, latency: 0 } };
})();
const MARGIN = 60;
const LIFETIME = SETTINGS.simulated.access_lifetime;
const NAME = 'session.simulated';

/** A transport that hands requests on, and lets a test see them and stand in for the cloud. */
class Spy implements Transport {
  readonly requests: CloudRequest[] = [];
  readonly instead: ((request: CloudRequest) => Promise<CloudResponse>)[] = [];

  constructor(private readonly next: Transport) {}

  send(request: CloudRequest): Promise<CloudResponse> {
    this.requests.push(request);
    const answer = this.instead.shift();
    return answer === undefined ? this.next.send(request) : answer(request);
  }

  /** The refreshes sent so far. */
  refreshes(): number {
    return this.requests.filter(
      (request) =>
        request.target === '/app/token' && request.body?.includes('grant_type=refresh_token'),
    ).length;
  }
}

function setUp(secrets = new MemorySecrets()) {
  let now = Date.UTC(2026, 10, 4, 8, 0, 0);
  const clock = () => now;
  const cloud = new SimulatedCloud(SETTINGS.simulated, [SETTINGS.client_id], { clock });
  const spy = new Spy(cloud);
  const client = new SignInClient(spy, SETTINGS, { clock });
  const ended = jest.fn();
  function session() {
    return new Session(
      client,
      secrets,
      { refresh_margin: MARGIN },
      {
        storeAs: NAME,
        label: 'Pixel 8',
        onEnd: ended,
        clock,
      },
    );
  }
  const first = session();
  const api = (of: Session) => new CloudClient(spy, SETTINGS, of, { clock });
  return {
    cloud,
    spy,
    client,
    secrets,
    ended,
    session: first,
    cloudClient: api(first),
    another: () => {
      const next = session();
      return { session: next, cloudClient: api(next) };
    },
    later: (seconds: number) => {
      now += seconds * 1000;
    },
    person: developmentProvider(client, { displayName: 'Linh', email: 'linh@example.com' }),
  };
}

async function failure(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (error) {
    return error as Error;
  }
  throw new Error('it did not fail');
}

test('with nothing kept, the session is signed out; signing in keeps its refresh token', async () => {
  const { session, cloudClient, secrets, person, spy } = setUp();
  expect(session.current().status).toBe('restoring');
  await session.restore();
  expect(session.current()).toEqual({ status: 'signedOut', ended: false });
  expect(await cloudClient.account().catch((error) => error)).toBeInstanceOf(SignedOut);
  expect(await session.signIn(person)).toBe(true);
  expect(session.current()).toEqual({ status: 'signedIn', ended: false });
  expect(secrets.kept.get(NAME)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect((await cloudClient.account()).display_name).toBe('Linh');
  const exchange = spy.requests.find((request) => request.body?.includes('token-exchange'))!;
  expect(new URLSearchParams(exchange.body).get('session_label')).toBe('Pixel 8');
});

test('a session kept from before is restored, and refreshes for its first request', async () => {
  const { session, person, another, spy } = setUp();
  await session.restore();
  await session.signIn(person);
  const restarted = another();
  await restarted.session.restore();
  expect(restarted.session.current().status).toBe('signedIn');
  expect((await restarted.cloudClient.account()).display_name).toBe('Linh');
  expect(spy.refreshes()).toBe(1);
});

test('a request made while the session is restoring waits for it', async () => {
  const { session, person, another } = setUp();
  await session.restore();
  await session.signIn(person);
  const restarted = another();
  // Nothing restores it first: the screen asks before the app's root has.
  expect((await restarted.cloudClient.account()).display_name).toBe('Linh');
  expect(restarted.session.current().status).toBe('signedIn');
});

test('the access token serves until refresh_margin before it expires, then is refreshed', async () => {
  const { session, cloudClient, person, spy, later } = setUp();
  await session.restore();
  await session.signIn(person);
  await cloudClient.account();
  later(LIFETIME - MARGIN - 1);
  await cloudClient.account();
  expect(spy.refreshes()).toBe(0);
  later(1);
  await cloudClient.account();
  expect(spy.refreshes()).toBe(1);
});

test('one refresh at a time, whoever asks for it', async () => {
  const { session, cloudClient, person, spy, later } = setUp();
  await session.restore();
  await session.signIn(person);
  later(LIFETIME);
  await Promise.all([cloudClient.account(), cloudClient.homes(), cloudClient.sessions()]);
  expect(spy.refreshes()).toBe(1);
});

test('a refresh whose answer was lost is sent again at once, and the session goes on', async () => {
  const { session, cloudClient, person, spy, cloud, secrets, later } = setUp();
  await session.restore();
  await session.signIn(person);
  const before = secrets.kept.get(NAME);
  later(LIFETIME);
  spy.instead.push(async (request) => {
    await cloud.send(request);
    throw new Unreachable('timeout');
  });
  expect((await cloudClient.account()).display_name).toBe('Linh');
  expect(spy.refreshes()).toBe(2);
  expect(secrets.kept.get(NAME)).not.toBe(before);
  later(LIFETIME);
  expect((await cloudClient.account()).display_name).toBe('Linh');
});

test('a refresh that finds no cloud keeps the session, for when the cloud is back', async () => {
  const { session, cloudClient, person, spy, later } = setUp();
  await session.restore();
  await session.signIn(person);
  later(LIFETIME);
  const silence = async () => {
    throw new Unreachable('offline');
  };
  spy.instead.push(silence, silence);
  expect(await failure(cloudClient.account())).toBeInstanceOf(Unreachable);
  expect(session.current().status).toBe('signedIn');
  expect((await cloudClient.account()).display_name).toBe('Linh');
});

test('a token the cloud refuses ends the session, which says so, and forgets its data', async () => {
  const { session, cloudClient, person, client, secrets, ended } = setUp();
  await session.restore();
  await session.signIn(person);
  // Ended elsewhere: from another phone's list of sessions, say.
  await client.revoke(secrets.kept.get(NAME)!);
  expect(await failure(cloudClient.account())).toBeInstanceOf(SignedOut);
  expect(session.current()).toEqual({ status: 'signedOut', ended: true });
  expect(ended).toHaveBeenCalledTimes(1);
  expect(secrets.kept.has(NAME)).toBe(false);
});

test('signing out ends the session here at once, then at the cloud', async () => {
  const { session, person, client, secrets, ended } = setUp();
  await session.restore();
  await session.signIn(person);
  const token = secrets.kept.get(NAME)!;
  await session.signOut();
  expect(session.current()).toEqual({ status: 'signedOut', ended: false });
  expect(secrets.kept.has(NAME)).toBe(false);
  expect(ended).toHaveBeenCalledTimes(1);
  const refused = await failure(client.refresh(token));
  expect(refused.message).toBe('refresh: 400 invalid_grant');
});

test('signing out with no cloud still ends the session here', async () => {
  const { session, person, spy, secrets } = setUp();
  await session.restore();
  await session.signIn(person);
  spy.instead.push(async () => {
    throw new Unreachable('offline');
  });
  await session.signOut();
  expect(session.current().status).toBe('signedOut');
  expect(secrets.kept.has(NAME)).toBe(false);
});

test('a refresh that ends after signing out changes nothing', async () => {
  const { session, cloudClient, person, spy, cloud, secrets, later } = setUp();
  await session.restore();
  await session.signIn(person);
  later(LIFETIME);
  // The cloud refreshes, but its answer arrives only once the person has signed out.
  let release = () => {};
  spy.instead.push(async (request) => {
    const answer = await cloud.send(request);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return answer;
  });
  const pending = failure(cloudClient.account());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await session.signOut();
  release();
  expect(await pending).toBeInstanceOf(SignedOut);
  expect(session.current().status).toBe('signedOut');
  expect(secrets.kept.has(NAME)).toBe(false);
});

test('storage that refuses keeps the session in memory, until the app stops', async () => {
  const secrets = new MemorySecrets();
  jest.spyOn(secrets, 'set').mockRejectedValue(new Error('the keystore refused'));
  const { session, cloudClient, person } = setUp(secrets);
  await session.restore();
  expect(await session.signIn(person)).toBe(true);
  expect((await cloudClient.account()).display_name).toBe('Linh');
});

test('a person who gives up signs nothing in', async () => {
  const { session, spy } = setUp();
  await session.restore();
  const giveUp = { name: 'development' as const, signIn: async () => null };
  expect(await session.signIn(giveUp)).toBe(false);
  expect(session.current().status).toBe('signedOut');
  expect(spy.requests.some((request) => request.target === '/app/token')).toBe(false);
});
