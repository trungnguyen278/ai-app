// SPDX-License-Identifier: MIT
// What set-up needs of the radio: a link to one device's set-up service, over Bluetooth LE
// (platform/protocols/setup/README.md, The Bluetooth service). The Bluetooth adapter makes one
// once it has connected and enabled the Answer characteristic's indications; the simulated
// device makes its own.

/** What the link tells: each indication's value, and its end. */
export interface LinkListener {
  /** The value of one indication on Answer: one fragment of the device's. */
  fragment(value: Uint8Array): void;
  /** The link ended: the device disconnected, or went out of range. It says nothing more. */
  closed(): void;
}

/** A link to one device's set-up service, its indications already enabled. */
export interface Link {
  /** Bytes in one write: the ATT MTU minus 3, as the phone's radio gives it, at least 20. It may
   * exceed 512, as Android 14's MTU of 517 does: the session's fragments never do. */
  readonly fragmentSize: number;
  /** Writes one fragment to Request, with a response; settles once the device confirmed it, and
   * rejects if the link has ended. */
  write(fragment: Uint8Array): Promise<void>;
  /** Tells `listener` what comes, until the link ends or the returned function is called. A
   * link that has already ended calls `closed` at once. */
  listen(listener: LinkListener): () => void;
  /** Disconnects. A link that has ended already is left as it is. */
  close(): Promise<void>;
}
