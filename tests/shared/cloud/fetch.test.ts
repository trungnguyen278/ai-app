// SPDX-License-Identifier: MIT
// The transport to a cloud, over fetch: what it sends, what no answer becomes, and the limits on
// time and size (SEC-15). The configuration chooses it, or the simulated cloud.
import { loadSettings } from '@/app.config';
import {
  cloudTransport,
  FetchTransport,
  SimulatedCloud,
  Unreachable,
  type CloudRequest,
} from '@/src/shared/cloud';
import { ProtocolError } from '@/src/shared/protocols';

const REQUEST: CloudRequest = {
  method: 'POST',
  target: '/app/v1/homes?page_size=20',
  headers: { 'content-type': 'application/json', 'idempotency-key': '"x"' },
  body: '{"name":"Nhà"}',
};

/** An answer, as fetch gives one: its body, as text in UTF-8 or as bytes. */
function answer(status: number, body: string | Uint8Array, headers: Record<string, string> = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    status,
    headers: {
      forEach: (each: (value: string, name: string) => void) =>
        Object.entries(headers).forEach(([name, value]) => each(value, name)),
    },
    arrayBuffer: async () => bytes.slice().buffer,
    // fetch's own text repairs bytes that are not UTF-8, as the Fetch Standard's does.
    text: async () => new TextDecoder().decode(bytes),
  } as unknown as Response;
}

async function failure(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (error) {
    return error as Error;
  }
  throw new Error('it did not fail');
}

afterEach(() => jest.useRealTimers());

test('sends the request to the address, and gives the answer with its fields in lower case', async () => {
  const fetcher = jest.fn(async () =>
    answer(201, '{"id":"1"}', { 'Content-Type': 'application/json', ETag: 'W/"1"' }),
  );
  const transport = new FetchTransport('https://cloud.example/', 15, 1024, fetcher);
  const response = await transport.send(REQUEST);
  expect(response).toEqual({
    status: 201,
    headers: { 'content-type': 'application/json', etag: 'W/"1"' },
    body: new TextEncoder().encode('{"id":"1"}'),
  });
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://cloud.example/app/v1/homes?page_size=20');
  expect(init).toMatchObject({
    method: 'POST',
    headers: REQUEST.headers,
    body: REQUEST.body,
    credentials: 'omit',
  });
});

test('a fetch that fails is an unreachable cloud', async () => {
  const transport = new FetchTransport('https://cloud.example', 15, 1024, async () => {
    throw new TypeError('Network request failed');
  });
  const error = await failure(transport.send(REQUEST));
  expect(error).toBeInstanceOf(Unreachable);
  expect((error as Unreachable).reason).toBe('offline');
});

test('a cloud that does not answer in time is given up on', async () => {
  jest.useFakeTimers();
  const signals: AbortSignal[] = [];
  const transport = new FetchTransport('https://cloud.example', 15, 1024, (_, init) => {
    signals.push(init!.signal!);
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
    );
  });
  const sent = failure(transport.send(REQUEST));
  jest.advanceTimersByTime(14_999);
  expect(signals[0].aborted).toBe(false);
  jest.advanceTimersByTime(1);
  const error = await sent;
  expect(error).toBeInstanceOf(Unreachable);
  expect((error as Unreachable).reason).toBe('timeout');
});

test('an answer that is cut off is an unreachable cloud', async () => {
  const transport = new FetchTransport(
    'https://cloud.example',
    15,
    1024,
    async () =>
      ({
        ...answer(200, ''),
        arrayBuffer: async () => {
          throw new TypeError('Network request failed');
        },
      }) as unknown as Response,
  );
  expect(await failure(transport.send(REQUEST))).toBeInstanceOf(Unreachable);
});

test('an answer over the limit is refused, unread when it says its length', async () => {
  const read = jest.fn(async () => new ArrayBuffer(1));
  const told = new FetchTransport(
    'https://cloud.example',
    15,
    1024,
    async () =>
      ({
        ...answer(200, '', { 'content-length': '1025' }),
        arrayBuffer: read,
      }) as unknown as Response,
  );
  const error = await failure(told.send(REQUEST));
  expect(error).toBeInstanceOf(ProtocolError);
  expect(error.message).toBe('answer: / is over 1024 bytes');
  expect(read).not.toHaveBeenCalled();
  const untold = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, 'x'.repeat(1025)),
  );
  expect(await failure(untold.send(REQUEST))).toBeInstanceOf(ProtocolError);
  const within = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, 'x'.repeat(1024), { 'content-length': '1024' }),
  );
  expect((await within.send(REQUEST)).body).toHaveLength(1024);
  // The limit counts bytes: "é" takes two in UTF-8, and one unit of a JavaScript string.
  const wide = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, 'é'.repeat(513)),
  );
  expect((await failure(wide.send(REQUEST))).message).toBe('answer: / is over 1024 bytes');
  const fits = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, 'é'.repeat(512)),
  );
  expect((await fits.send(REQUEST)).body).toEqual(new TextEncoder().encode('é'.repeat(512)));
});

test('an answer comes as its bytes, whatever they are', async () => {
  // fetch's text would read these as ["\uFFFD"], and drop the byte order mark.
  const notUtf8 = Uint8Array.of(0xef, 0xbb, 0xbf, 0x5b, 0x22, 0xff, 0x22, 0x5d);
  for (const status of [200, 404, 503]) {
    const transport = new FetchTransport('https://cloud.example', 15, 1024, async () =>
      answer(status, notUtf8),
    );
    const response = await transport.send(REQUEST);
    expect([response.status, response.body]).toEqual([status, notUtf8]);
  }
});

test('the configuration chooses the simulated cloud, or fetch to its address', () => {
  const { cloud } = loadSettings('development');
  expect(cloudTransport(cloud)).toBeInstanceOf(SimulatedCloud);
  const remote = cloudTransport({ ...cloud, address: 'https://cloud.example' });
  expect(remote).toBeInstanceOf(FetchTransport);
});
