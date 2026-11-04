// SPDX-License-Identifier: MIT
// A QR code's shape: drawn back into pixels, as the screen would, it reads as what it carries,
// with its quiet zone clear.
import { decodeQR } from 'qr/decode.js';

import { QUIET_ZONE, qrShape } from '@/src/shared/design/qr';

const LINK = 'https://cloud.example/join#_qkVmTR2PblWSSdl5dzV2U5KeCbtmjs4Pd7HS-vBAx4';
const RECTANGLE = /M(\d+) (\d+)h(\d+)v1h-(\d+)z/g;

/** The path's dark modules, by row and column. */
function modulesOf(path: string, modules: number): boolean[][] {
  const grid = Array.from({ length: modules }, () => Array<boolean>(modules).fill(false));
  for (const [, x, y, width] of path.matchAll(RECTANGLE)) {
    for (let column = Number(x); column < Number(x) + Number(width); column++) {
      grid[Number(y)][column] = true;
    }
  }
  return grid;
}

/** The modules as an RGB image, `scale` pixels a module, dark on light. */
function image(grid: boolean[][], scale: number) {
  const side = grid.length * scale;
  const data = new Uint8Array(side * side * 3).fill(255);
  grid.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        const line = (y * scale + dy) * side;
        data.fill(0, (line + x * scale) * 3, (line + (x + 1) * scale) * 3);
      }
    }),
  );
  return { width: side, height: side, data };
}

test('drawn as its path says, a code reads as what it carries', () => {
  const { modules, path } = qrShape(LINK);
  expect(path.replace(RECTANGLE, '')).toBe('');
  expect(decodeQR(image(modulesOf(path, modules), 4), { format: 'RGB' })).toBe(LINK);
});

test('a code keeps its quiet zone clear, four modules on every side', () => {
  const { modules, path } = qrShape(LINK);
  const grid = modulesOf(path, modules);
  const darkRows = grid.flatMap((row, y) => (row.includes(true) ? [y] : []));
  const darkColumns = grid[0].flatMap((_, x) => (grid.some((row) => row[x]) ? [x] : []));
  // The finder patterns reach the symbol's corners, so the margin is the quiet zone exactly:
  // DENSO WAVE's four modules, measured on the drawing rather than read from the constant.
  for (const dark of [darkRows, darkColumns]) {
    expect(dark[0]).toBe(4);
    expect(modules - 1 - dark[dark.length - 1]).toBe(4);
  }
  expect(QUIET_ZONE).toBe(4);
});
