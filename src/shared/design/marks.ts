// SPDX-License-Identifier: MIT
// The checkmark that iOS shows beside the option chosen (docs/design.md, ChoiceList), drawn with
// views: a bar with round ends for each of its arms, which meet at its corner as a line drawn
// with round caps and joins does.

/** A bar of a line, as a view lays it out: where its box sits, and how far it turns. */
export interface Stroke {
  left: number;
  top: number;
  width: number;
  height: number;
  /** How far the bar turns about its centre, in radians. */
  angle: number;
}

/**
 * The bars that draw a line `thickness` thick through `points`, given as parts of a square
 * `size` across: one from each point to the next. Each is as long as its segment, and half its
 * thickness longer at each end, so that its round ends are centred on the points.
 */
export function strokesThrough(
  points: readonly (readonly [number, number])[],
  size: number,
  thickness: number,
): Stroke[] {
  const at = points.map(([x, y]) => [x * size, y * size] as const);
  return at.slice(1).map(([x, y], index) => {
    const [fromX, fromY] = at[index];
    const width = Math.hypot(x - fromX, y - fromY) + thickness;
    return {
      left: (fromX + x) / 2 - width / 2,
      top: (fromY + y) / 2 - thickness / 2,
      width,
      height: thickness,
      angle: Math.atan2(y - fromY, x - fromX),
    };
  });
}
