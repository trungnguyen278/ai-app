// SPDX-License-Identifier: MIT
// The transport to a cloud: fetch, over HTTPS, or HTTP to a developer's own machine (SEC-1),
// with a time limit and a limit on the answer's size (SEC-15).
import { ProtocolError } from '@/src/shared/protocols';

import { Unreachable, type CloudRequest, type CloudResponse, type Transport } from '../transport';

export class FetchTransport implements Transport {
  private readonly address: string;

  constructor(
    /** The cloud's address, such as https://cloud.example; a trailing slash is dropped. */
    address: string,
    /** Seconds a request may take, its answer read. */
    private readonly timeout: number,
    /** The most bytes an answer may have. */
    private readonly answerLimit: number,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.address = address.endsWith('/') ? address.slice(0, -1) : address;
  }

  async send(request: CloudRequest): Promise<CloudResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
    try {
      const response = await this.fetcher(this.address + request.target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
        // The app API carries no cookies: none that anything on the way sets rides along.
        credentials: 'omit',
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      if (Number(headers['content-length']) > this.answerLimit) {
        controller.abort();
        throw this.tooLarge();
      }
      return { status: response.status, headers, body: await this.read(response, controller) };
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      throw new Unreachable(controller.signal.aborted ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The answer's body, read as it comes and given up at the first chunk past the limit:
   * arrayBuffer() would hold the whole of it first, as OkHttp's bytes() does ("loads entire
   * response body into memory"). Its bytes, not fetch's text, which repairs what is not UTF-8
   * (the Fetch Standard's text(), and expo/fetch's on Android, which decodes with Kotlin's UTF_8
   * charset).
   */
  private async read(response: Response, controller: AbortController): Promise<Uint8Array> {
    // A status that has no body, or a HEAD (the Fetch Standard's null body).
    if (response.body === null) return new Uint8Array(0);
    // Read at once: until it is read, expo/fetch holds what arrives in a buffer of its own.
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      length += next.value.byteLength;
      if (length > this.answerLimit) {
        // An abort stops the download: it cancels OkHttp's call, or the URLSession task, where
        // cancelling the reader would only stop expo/fetch giving the bytes on iOS.
        controller.abort();
        throw this.tooLarge();
      }
      chunks.push(next.value);
    }
    const body = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      body.set(chunk, at);
      at += chunk.byteLength;
    }
    return body;
  }

  private tooLarge(): ProtocolError {
    return new ProtocolError('answer', '/', `is over ${this.answerLimit} bytes`);
  }
}
