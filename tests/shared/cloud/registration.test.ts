// SPDX-License-Identifier: MIT
// The simulated cloud's check of a device's registration, on its own: ai-platform's example
// registrations, which are real, and what no request can bring it, since the cloud reads a
// registration's challenge before it verifies it (as ai-cloud's tests/devices/test_domain.py).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  challengeOf,
  RegistrationInvalid,
  verifyRegistration,
} from '@/src/shared/cloud/adapters/simulated/registration';

import { Robot } from './robot';

const SERVER = 'https://cloud.example';
const ROBOT = '4a4ce4bd-2853-43d8-98dc-3dc06daec6e5';
// The thumbprint of the key that signed the example's registrations, as its description gives it.
const THUMBPRINT = 'A9J9ACDRqGsoYjAJJK-upx23ibV7l4Bofp0C6uidqC8';

function reason(registration: string): string {
  try {
    verifyRegistration(registration, SERVER);
  } catch (error) {
    expect(error).toBeInstanceOf(RegistrationInvalid);
    return (error as Error).message;
  }
  throw new Error('it verified');
}

test("devices.json's registrations verify: its robot, and the key the example names", () => {
  const path = join(__dirname, '..', '..', '..', 'platform', 'protocols', 'app', 'examples');
  const { messages } = JSON.parse(readFileSync(join(path, 'devices.json'), 'utf8'));
  const registrations: string[] = messages
    .map((step: { message?: { registration?: unknown } }) => step.message?.registration)
    .filter((each: unknown) => typeof each === 'string');
  expect(registrations).toHaveLength(6);
  for (const registration of registrations) {
    const claims = JSON.parse(Buffer.from(registration.split('.')[1], 'base64url').toString());
    expect(challengeOf(registration)).toBe(claims.nonce);
    expect(verifyRegistration(registration, SERVER)).toEqual({
      deviceId: ROBOT,
      key: THUMBPRINT,
    });
  }
});

test('what is no JWT names no challenge, and is malformed', () => {
  const robot = new Robot(ROBOT);
  const header = { alg: 'ES256', jwk: robot.key, typ: 'device-registration+jwt' };
  const claims = { iss: ROBOT, sub: ROBOT, aud: SERVER, nonce: 'a-challenge' };
  const notUtf8 = Buffer.from([0xff, 0xfe]).toString('base64url');
  const signed = robot.sign(header, claims);
  expect(verifyRegistration(signed, SERVER).deviceId).toBe(ROBOT);
  const malformed = [
    // A registration that verifies, but for its number of parts.
    signed.split('.').slice(0, 2).join('.'),
    `${signed}.${signed.split('.')[2]}`,
    // A header that is not JSON, not UTF-8, or not an object.
    robot.sign('not json', claims),
    `${notUtf8}.${signed.split('.').slice(1).join('.')}`,
    robot.sign('[1]', claims),
  ];
  for (const registration of malformed) {
    expect([challengeOf(registration), reason(registration)]).toEqual([null, 'malformed']);
  }
  // Claims that are not an object, signed as they are: the challenge is read from them first.
  for (const text of ['not json', '"a string"', 'null']) {
    const registration = robot.sign(header, text);
    expect([challengeOf(registration), reason(registration)]).toEqual([null, 'malformed']);
  }
});

test('a part that begins with a byte order mark is read without it, as PyJWT reads it', () => {
  const robot = new Robot(ROBOT);
  const mark = String.fromCharCode(0xfeff);
  const header = { alg: 'ES256', jwk: robot.key, typ: 'device-registration+jwt' };
  const claims = { iss: ROBOT, sub: ROBOT, aud: SERVER, nonce: 'a-challenge' };
  const registration = robot.sign(mark + JSON.stringify(header), mark + JSON.stringify(claims));
  expect(challengeOf(registration)).toBe('a-challenge');
  expect(verifyRegistration(registration, SERVER).deviceId).toBe(ROBOT);
});
