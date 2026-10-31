// SPDX-License-Identifier: MIT
// Motion keeps its budget (ADR-0003, decision 5).
import {
  BREATH,
  DURATION,
  ENTER,
  enterFrames,
  exitFrames,
  PRESS,
  SPRING_CURVE,
} from '@/src/shared/design';

test('a press answers within 150 ms, and no motion passes 300 ms', () => {
  expect(DURATION.press).toBeLessThanOrEqual(150);
  for (const duration of Object.values(DURATION)) {
    expect(duration).toBeLessThanOrEqual(300);
  }
});

test('what leaves goes faster than it came', () => {
  expect(DURATION.exit).toBeLessThan(DURATION.enter);
});

test('nothing enters from nothing, and a press only shrinks a little', () => {
  expect(ENTER.scale).toBeGreaterThanOrEqual(0.9);
  expect(ENTER.scale).toBeLessThan(1);
  expect(PRESS.scale).toBeGreaterThanOrEqual(0.95);
  expect(PRESS.scale).toBeLessThan(1);
});

test('things enter rising and growing into place, and leave the way they came', () => {
  expect(enterFrames(false)).toEqual({
    from: { opacity: 0, transform: [{ translateY: ENTER.rise }, { scale: ENTER.scale }] },
    to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    duration: DURATION.enter,
  });
  const exit = exitFrames(false);
  expect(exit.to.opacity).toBe(0);
  expect(exit.to.transform?.[0].translateY).toBeGreaterThan(0);
  expect(exit.duration).toBe(DURATION.exit);
});

test.each([
  ['enter', enterFrames],
  ['exit', exitFrames],
])('with reduce motion on, they %s with a short fade, and nothing moves', (_, frames) => {
  const reduced = frames(true);
  expect(reduced.from).not.toHaveProperty('transform');
  expect(reduced.to).not.toHaveProperty('transform');
  expect(reduced.from.opacity).not.toBe(reduced.to.opacity);
  expect(reduced.duration).toBe(DURATION.fade);
});

test("light breathes with the robot's breath", () => {
  // ai-robot's ui/src/settings.js: breathe.period, 4.4 s.
  expect(BREATH.period).toBe(4400);
  expect(BREATH.scale[0]).toBeLessThan(BREATH.scale[1]);
  expect(BREATH.opacity[1]).toBe(1);
});

test('a touch answers with a spring that settles without a bounce', () => {
  expect(SPRING_CURVE[0]).toBe(0);
  expect(SPRING_CURVE[SPRING_CURVE.length - 1]).toBe(1);
  for (let step = 1; step < SPRING_CURVE.length; step++) {
    // It only ever moves on, and never past where it is going.
    expect(SPRING_CURVE[step]).toBeGreaterThan(SPRING_CURVE[step - 1]);
    expect(SPRING_CURVE[step]).toBeLessThanOrEqual(1);
  }
  // A spring is quickest as it leaves: half the way within the first quarter of the time.
  const quarter = Math.round((SPRING_CURVE.length - 1) / 4);
  expect(SPRING_CURVE[quarter]).toBeGreaterThan(0.5);
  // And it has all but arrived just before the end.
  expect(SPRING_CURVE[SPRING_CURVE.length - 2]).toBeGreaterThan(0.99);
});
