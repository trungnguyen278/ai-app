// SPDX-License-Identifier: MIT
// The app API on the wire: forms and queries as the WHATWG URL Standard writes them, which
// Node's URLSearchParams implements, and Retry-After as RFC 9110 writes it.
import { formDecode, formEncode, retryAfter, withQuery } from '@/src/shared/cloud/http';

const AWKWARD = [
  'plain',
  'a space and a+plus',
  "!'()*~-._",
  '&=?#%/\\',
  'Nhà của Linh',
  '😀 and \u0000',
  '',
];

test.each(AWKWARD)('a form encodes %j as the URL Standard does', (value) => {
  expect(formEncode({ field: value, [value || 'empty']: 'x' })).toBe(
    new URLSearchParams([
      ['field', value],
      [value || 'empty', 'x'],
    ]).toString(),
  );
});

test.each(AWKWARD)('a form decodes %j as it was encoded', (value) => {
  expect(formDecode(formEncode({ field: value }))).toEqual([['field', value]]);
});

test('a form that is not one is refused', () => {
  expect(formDecode('')).toEqual([]);
  expect(formDecode('a=1&b')).toBeNull();
  expect(formDecode('a=1&&b=2')).toBeNull();
  expect(formDecode('a=%E0%A4%A')).toBeNull();
  expect(formDecode('a=1&a=2')).toEqual([
    ['a', '1'],
    ['a', '2'],
  ]);
});

test('a query leaves out what is undefined', () => {
  expect(withQuery('/app/v1/homes', { page_size: 20, page_token: undefined })).toBe(
    '/app/v1/homes?page_size=20',
  );
  expect(withQuery('/app/v1/homes', { page_token: undefined })).toBe('/app/v1/homes');
});

test('Retry-After is seconds, or a date', () => {
  const now = Date.UTC(2026, 10, 4, 8, 0, 0);
  expect(retryAfter('120', now)).toBe(120);
  expect(retryAfter(' 7 ', now)).toBe(7);
  expect(retryAfter('Wed, 04 Nov 2026 08:01:30 GMT', now)).toBe(90);
  expect(retryAfter('Wed, 04 Nov 2026 07:00:00 GMT', now)).toBe(0);
  expect(retryAfter('soon', now)).toBeUndefined();
  expect(retryAfter(undefined, now)).toBeUndefined();
});
