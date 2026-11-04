// SPDX-License-Identifier: MIT
// A session's label: the phone's model, as the cloud takes it (the app API, The exchange).
import { sessionLabel } from '@/src/account/domain/label';

test.each([
  ['Pixel 8', 'Pixel 8'],
  ['  iPhone 16 Pro  ', 'iPhone 16 Pro'],
  ['Galaxy\u0000 S25\u0085', 'Galaxy S25'],
  ['', undefined],
  ['\u0007', undefined],
  [null, undefined],
  [undefined, undefined],
])('the model %j is labelled %j', (model, label) => {
  expect(sessionLabel(model)).toBe(label);
});

test('a label is cut to 100 characters, counted as the schema counts them', () => {
  const label = sessionLabel('😀'.repeat(150))!;
  expect([...label]).toHaveLength(100);
  expect(label.endsWith('😀')).toBe(true);
});
