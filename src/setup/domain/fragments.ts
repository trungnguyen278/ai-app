// SPDX-License-Identifier: MIT
// A message in fragments, one per write or indication (set-up 2.2, The Bluetooth service). Byte
// 0 holds flags; a message's first fragment then holds its length, on 2 bytes, big-endian.
import { MAX_FRAGMENT, MAX_MESSAGE, MIN_FRAGMENT } from './protocol';

const FIRST = 0x80;
const LAST = 0x40;
const FLAGS = 1;
const LENGTH = 2;

/** A fragment that does not fit: the session ends. */
export class FragmentError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FragmentError';
  }
}

/** `message` in fragments of at most `size` bytes each, the room that a write or an indication
 * has, and never more than `MAX_FRAGMENT`, which an attribute holds. */
export function split(message: Uint8Array, size: number): Uint8Array[] {
  if (message.length < 1 || message.length > MAX_MESSAGE) {
    throw new RangeError(`a message has 1 to ${MAX_MESSAGE} bytes`);
  }
  if (!Number.isInteger(size) || size < MIN_FRAGMENT) {
    throw new RangeError(`a fragment has room for at least ${MIN_FRAGMENT} bytes`);
  }
  const room = Math.min(size, MAX_FRAGMENT) - FLAGS;
  const fragments: Uint8Array[] = [];
  let offset = Math.min(message.length, room - LENGTH);
  const first = new Uint8Array(FLAGS + LENGTH + offset);
  first[0] = FIRST;
  first[1] = message.length >> 8;
  first[2] = message.length & 0xff;
  first.set(message.subarray(0, offset), FLAGS + LENGTH);
  fragments.push(first);
  while (offset < message.length) {
    const data = message.subarray(offset, offset + room);
    const fragment = new Uint8Array(FLAGS + data.length);
    fragment.set(data, FLAGS);
    fragments.push(fragment);
    offset += data.length;
  }
  fragments[fragments.length - 1][0] |= LAST;
  return fragments;
}

/** Joins one side's fragments into its messages. It holds at most the length that the first
 * fragment announced, however many fragments come: a continuation without data adds nothing. */
export class Joiner {
  /** The message being joined, at its announced length; null between messages. */
  private message: Uint8Array | null = null;
  private received = 0;

  /** Takes the next fragment, and gives the message it completes, if it does. */
  add(fragment: Uint8Array): Uint8Array | null {
    if (fragment.length < FLAGS || (fragment[0] & ~(FIRST | LAST)) !== 0) {
      throw new FragmentError('a fragment has unknown flags');
    }
    const flags = fragment[0];
    let data = fragment.subarray(FLAGS);
    if (flags & FIRST) {
      if (this.message) {
        throw new FragmentError('a first fragment came within a message');
      }
      if (data.length < LENGTH) {
        throw new FragmentError('a first fragment is too short for the length');
      }
      const length = (data[0] << 8) | data[1];
      if (length < 1 || length > MAX_MESSAGE) {
        throw new FragmentError(`a message has 1 to ${MAX_MESSAGE} bytes`);
      }
      this.message = new Uint8Array(length);
      this.received = 0;
      data = data.subarray(LENGTH);
    } else if (!this.message) {
      throw new FragmentError('a fragment came with no first one');
    }
    if (this.received + data.length > this.message.length) {
      throw new FragmentError('a message is longer than its length');
    }
    this.message.set(data, this.received);
    this.received += data.length;
    if (!(flags & LAST)) {
      return null;
    }
    if (this.received !== this.message.length) {
      throw new FragmentError('a message is shorter than its length');
    }
    const message = this.message;
    this.message = null;
    return message;
  }
}
