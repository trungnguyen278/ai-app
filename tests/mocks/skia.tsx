// SPDX-License-Identifier: MIT
// Skia, as the tests see it: its canvas is a view, and what it would draw is not drawn. Skia's
// own mock needs CanvasKit, in a test environment of its own, which these tests do not run in.
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

export function Canvas({ children, ...props }: ViewProps & { children?: ReactNode }) {
  return <View {...props}>{children}</View>;
}

function Drawn({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export const Group = Drawn;
export const Circle = Drawn;
export const BlurMask = Drawn;

/** The colour at the end of the range: tests do not look at the colours in between. */
export function interpolateColors(_value: number, _input: number[], output: unknown[]) {
  return output[output.length - 1];
}
