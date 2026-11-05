// SPDX-License-Identifier: MIT
// What the homes' screens decide alone: an invitation's link, the code in what a person pastes,
// what each role is offered, and the roles the owner gives.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { codeIn, invitationLink } from '@/src/homes/domain/links';
import { demotes, GIVEN_ROLES } from '@/src/homes/domain/people';
import { mayManage, maySetRole } from '@/src/homes/domain/permissions';

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

describe('maySetRole', () => {
  const person = (role: string | undefined, current = false) => ({
    kind: 'account',
    role,
    current,
  });
  test.each([
    ['owner', person('admin'), true],
    ['owner', person('member'), true],
    // A role of a later version counts as a member, whom the owner may make an admin.
    ['owner', person('guest'), true],
    // Only handing the home over changes the owner's role, and a profile has none.
    ['owner', person('owner', true), false],
    // Never one's own, even while the home, read before a hand-over, still says owner.
    ['owner', person('admin', true), false],
    ['owner', person('owner'), false],
    ['owner', { kind: 'profile', current: false }, false],
    // A kind of a later version counts as a profile.
    ['owner', { kind: 'robot', role: 'member', current: false }, false],
    ['admin', person('member'), false],
    ['admin', person('admin', true), false],
    ['member', person('member'), false],
    ['guest', person('member'), false],
    [undefined, person('member'), false],
  ])('%j, for %j: %j', (role, target, expected) => {
    expect(maySetRole(role, target)).toBe(expected);
  });
});

describe('demotes', () => {
  test.each([
    ['admin', 'member', true],
    ['admin', 'admin', false],
    ['member', 'admin', false],
    ['member', 'member', false],
    ['admin', undefined, false],
    // A role of a later version counts as a member, who has no admin's invitations to lose.
    ['guest', 'member', false],
  ])('%j, made %j: %j', (role, given, expected) => {
    expect(demotes({ role }, { role: given })).toBe(expected);
  });
});

test("the roles the owner gives are those the app API's change of a person takes", () => {
  const schema = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', 'platform', 'protocols', 'app', 'schema.json'),
      'utf8',
    ),
  );
  expect([...GIVEN_ROLES].sort()).toEqual(
    [...schema.$defs.member_update.properties.role.enum].sort(),
  );
});
