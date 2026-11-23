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

import { answer, chunks, type Reading } from './answer';

const REQUEST: CloudRequest = {
  method: 'POST',
  target: '/app/v1/homes?page_size=20',
  headers: { 'content-type': 'application/json', 'idempotency-key': '"x"' },
  body: '{"name":"Nhà"}',
};

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
  let pulls = 0;
  const cut = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        if (pulls === 1) controller.enqueue(new TextEncoder().encode('{"id":'));
        else controller.error(new TypeError('Network request failed'));
      },
    },
    { highWaterMark: 0 },
  );
  const transport = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, cut),
  );
  const error = await failure(transport.send(REQUEST));
  expect(error).toBeInstanceOf(Unreachable);
  expect((error as Unreachable).reason).toBe('offline');
});

test('a cloud that stops in the middle of its answer is given up on at the same time', async () => {
  jest.useFakeTimers();
  let stalling: () => void = () => undefined;
  const stalled = new Promise<void>((resolve) => (stalling = resolve));
  const transport = new FetchTransport('https://cloud.example', 15, 1024, async (_, init) => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          init!.signal!.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
        pull(controller) {
          pulls += 1;
          if (pulls === 1) {
            controller.enqueue(new TextEncoder().encode('{"id":'));
            return;
          }
          stalling();
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    return answer(200, body);
  });
  const sent = failure(transport.send(REQUEST));
  await stalled;
  jest.advanceTimersByTime(15_000);
  const error = await sent;
  expect(error).toBeInstanceOf(Unreachable);
  expect((error as Unreachable).reason).toBe('timeout');
});

test('an answer over the limit is refused, unread when it says its length', async () => {
  const reading: Reading = { chunks: 0 };
  const signals: AbortSignal[] = [];
  const told = new FetchTransport('https://cloud.example', 15, 1024, async (_, init) => {
    signals.push(init!.signal!);
    return answer(200, chunks(new Uint8Array(1025), 512, reading), { 'content-length': '1025' });
  });
  const error = await failure(told.send(REQUEST));
  expect(error).toBeInstanceOf(ProtocolError);
  expect(error.message).toBe('answer: / is over 1024 bytes');
  expect(reading.chunks).toBe(0);
  expect(signals[0].aborted).toBe(true);
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

test('an answer that does not say its length is refused at the chunk that passes the limit', async () => {
  // OkHttp's bytes() "loads entire response body into memory"; the transport counts as it reads.
  const reading: Reading = { chunks: 0 };
  const signals: AbortSignal[] = [];
  const transport = new FetchTransport('https://cloud.example', 15, 1024, async (_, init) => {
    signals.push(init!.signal!);
    return answer(200, chunks(new Uint8Array(512 * 10), 512, reading, init!.signal!));
  });
  const error = await failure(transport.send(REQUEST));
  expect(error).toBeInstanceOf(ProtocolError);
  expect(error.message).toBe('answer: / is over 1024 bytes');
  // The third chunk passes the limit, and the fetch is aborted: the download stops there.
  expect(reading.chunks).toBe(3);
  expect(signals[0].aborted).toBe(true);
  // A limit reached exactly is within it, and the chunks come as one body, in order.
  const bytes = Uint8Array.from({ length: 1024 }, (_, i) => i % 251);
  const exactly = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(200, chunks(bytes, 300)),
  );
  expect((await exactly.send(REQUEST)).body).toEqual(bytes);
});

test('an answer with no body comes as no bytes', async () => {
  const transport = new FetchTransport('https://cloud.example', 15, 1024, async () =>
    answer(204, null),
  );
  expect(await transport.send(REQUEST)).toEqual({
    status: 204,
    headers: {},
    body: new Uint8Array(0),
  });
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
