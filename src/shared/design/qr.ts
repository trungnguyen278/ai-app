// SPDX-License-Identifier: MIT
// A QR code's shape, from what it carries: the matrix of Paul Miller's `qr`, drawn as rectangles,
// one for each run of dark modules in a row.
import { encodeQR } from 'qr';

/** The margin a QR code needs on every side: "a four-module wide margin" (DENSO WAVE, which made
 *  the QR code: qrcode.com/en/howto/code.html). */
export const QUIET_ZONE = 4;

/** How much of a code may be lost and still read: level M, 15%, the library's default. */
const CORRECTION = 'medium';

export interface QrShape {
  /** Modules on each side, the quiet zone included. */
  modules: number;
  /** The dark modules, as an SVG path in modules. */
  path: string;
}

/** The shape of the QR code that carries `value`. */
export function qrShape(value: string): QrShape {
  const matrix = encodeQR(value, 'raw', { ecc: CORRECTION, border: QUIET_ZONE });
  let path = '';
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end]) end += 1;
      path += `M${x} ${y}h${end - x}v1h${x - end}z`;
      x = end;
    }
  });
  return { modules: matrix.length, path };
}
