// SPDX-License-Identifier: MIT
// An answer of a cloud, as fetch gives one, for the tests of the transport over fetch: its body
// comes as a stream, as expo/fetch's and the Fetch Standard's does.

/** How much of a body was read: the chunks the stream was asked for. */
export interface Reading {
  chunks: number;
}

/**
 * A body of `bytes`, in chunks of `size` bytes, each given only when it is asked for, as a
 * stream with no queue of its own (expo/fetch's has a high-water mark of 0). An abort of
 * `signal` errors it, as aborting a fetch does to its body (the Fetch Standard's "abort fetch").
 */
export function chunks(
  bytes: Uint8Array,
  size: number,
  reading: Reading = { chunks: 0 },
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
      },
      pull(controller) {
        if (at >= bytes.byteLength) {
          controller.close();
          return;
        }
        reading.chunks += 1;
        controller.enqueue(bytes.slice(at, at + size));
        at += size;
      },
    },
    { highWaterMark: 0 },
  );
}

/** An answer, as fetch gives one: its body as text in UTF-8, as bytes, as a stream, or none. */
export function answer(
  status: number,
  body: string | Uint8Array | ReadableStream<Uint8Array> | null,
  headers: Record<string, string> = {},
): Response {
  const stream =
    body === null || (typeof body === 'object' && 'getReader' in body)
      ? body
      : chunks(typeof body === 'string' ? new TextEncoder().encode(body) : body, 256);
  return {
    status,
    headers: {
      forEach: (each: (value: string, name: string) => void) =>
        Object.entries(headers).forEach(([name, value]) => each(value, name)),
    },
    body: stream,
  } as unknown as Response;
}
