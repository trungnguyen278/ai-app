// SPDX-License-Identifier: MIT
// What the homes' screens decide alone: an invitation's link, the code in what a person pastes,
// and what each role is offered.
import { codeIn, invitationLink } from '@/src/homes/domain/links';
import { mayManage } from '@/src/homes/domain/permissions';

// The app API's example: 32 random bytes, base64url without padding.
const CODE = '_qkVmTR2PblWSSdl5dzV2U5KeCbtmjs4Pd7HS-vBAx4';

describe('invitationLink', () => {
  test.each(['https://cloud.example', 'https://cloud.example/'])(
    "at %j is the cloud's address, /join#, and the code",
    (address) => {
      expect(invitationLink(address, CODE)).toBe(`https://cloud.example/join#${CODE}`);
    },
  );

  test("of the simulated cloud is the app's own, which only this phone can follow", () => {
    expect(invitationLink('simulated', CODE)).toBe(`aiapp://join#${CODE}`);
  });
});

describe('codeIn', () => {
  test.each([
    [CODE, CODE],
    [`https://cloud.example/join#${CODE}`, CODE],
    [`  aiapp://join#${CODE}\n`, CODE],
    [`https://cloud.example/join?from=chat#${CODE}`, CODE],
    ['https://cloud.example/join', null],
    [`https://cloud.example/join#${CODE}x`, null],
    [CODE.slice(1), null],
    [`${CODE.slice(1)}=`, null],
    ['', null],
  ])('%j holds %j', (text, code) => {
    expect(codeIn(text)).toBe(code);
  });
});

describe('mayManage', () => {
  test.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    // A role of a later version counts as a member, and a profile has none.
    ['guest', false],
    [undefined, false],
  ])('%j: %j', (role, expected) => {
    expect(mayManage(role)).toBe(expected);
  });
});
