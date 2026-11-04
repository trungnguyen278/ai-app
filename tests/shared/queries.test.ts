// SPDX-License-Identifier: MIT
// The cache of what the cloud answers: only silence, or a cloud that cannot serve, is tried
// again, as often as the configuration says; changes never are.
import { loadSettings } from '@/app.config';
import { Refused, SignedOut, Unavailable, Unreachable } from '@/src/shared/cloud';
import { newQueryClient, retries } from '@/src/shared/queries';
import { ProtocolError } from '@/src/shared/protocols';

const { queries } = loadSettings('development');

test.each([
  ['no answer', new Unreachable('offline'), true],
  ['a cloud that cannot serve', new Unavailable('account', 503), true],
  ['a refusal', new Refused('account', 404, 'about:blank'), false],
  ['an ended session', new SignedOut('account'), false],
  ['a broken answer', new ProtocolError('account', '/', 'is not JSON'), false],
])('after %s, a read is tried again: %s', (_, error, again) => {
  expect(retries(queries)(0, error)).toBe(again);
});

test('a read is tried again as many times as the configuration says, and no more', () => {
  const tries = Array.from({ length: queries.retries + 1 }, (_, failures) =>
    retries(queries)(failures, new Unreachable('timeout')),
  );
  expect(tries).toEqual([...Array(queries.retries).fill(true), false]);
});

test('reads stay fresh for the configured time, and changes are never sent again', () => {
  const defaults = newQueryClient(queries).getDefaultOptions();
  expect(defaults.queries?.staleTime).toBe(queries.stale_time * 1000);
  expect(defaults.mutations?.retry).toBe(false);
});
