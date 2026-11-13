// SPDX-License-Identifier: MIT
// The simulated cloud's homes, the people in them and their invitations (the app API, Homes),
// as ai-cloud's homes service and routes do them: who may do what, how people join, how a home
// changes hands and how it ends.
import type { CloudResponse } from '../../transport';
import {
  accountOf,
  authenticate,
  firstAnswer,
  idempotencyKey,
  keepFirstAnswer,
  limitRate,
  page,
  pageRequest,
  recentSignIn,
  type Context,
  type Principal,
} from './context';
import {
  etag,
  etagMatches,
  instant,
  newToken,
  sorted,
  uuid,
  type Home,
  type Invitation,
  type Member,
} from './model';
import { empty, json, problem, tagged, typed, type Incoming } from './wire';

/** A home, as one of its people sees it. */
export interface View {
  home: Home;
  member: Member;
}

// Homes.

export function listHomes(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const { size, after } = pageRequest(request);
  const views: (View & { id: string })[] = [];
  for (const member of context.state.members.values()) {
    const home = context.state.homes.get(member.homeId);
    if (member.accountId === principal.accountId && home !== undefined) {
      views.push({ id: home.id, home, member });
    }
  }
  const shown = page(sorted(views), size, after);
  return json({
    homes: shown.items.map((view) => homeAnswer(view)),
    next_page_token: shown.next,
  });
}

export function createHome(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('home_create');
  const key = idempotencyKey(request);
  checkTimeZone(body.time_zone);
  const first = firstAnswer(context, principal, key);
  if (first !== undefined) return first;
  const account = accountOf(context, principal);
  checkHomesOf(context, account.id);
  const home: Home = {
    id: context.ids.next(),
    name: body.name,
    timeZone: body.time_zone,
    languages: [...body.languages],
    createTime: context.now,
    version: 1,
  };
  const owner: Member = {
    id: context.ids.next(),
    homeId: home.id,
    accountId: account.id,
    displayName: account.displayName,
    role: 'owner',
    createTime: context.now,
    version: 1,
  };
  context.state.homes.set(home.id, home);
  context.state.members.set(owner.id, owner);
  const answer = tagged(homeAnswer({ home, member: owner }), 201);
  return keepFirstAnswer(context, principal, key, answer, owner.id);
}

export function readHome(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  return tagged(homeAnswer(inHome(context, itemId(id), principal)));
}

export function changeHome(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const changes = request.json('home_update');
  const homeId = itemId(id);
  if (changes.time_zone !== undefined) checkTimeZone(changes.time_zone);
  const view = inHome(context, homeId, principal);
  checkMayManage(view.member);
  const ifMatch = request.header('if-match');
  if (ifMatch !== undefined && !etagMatches(ifMatch, etag(view.home.version))) {
    throw problem(412, 'the home changed since that ETag');
  }
  const { home } = view;
  home.name = changes.name ?? home.name;
  home.timeZone = changes.time_zone ?? home.timeZone;
  home.languages = changes.languages ?? home.languages;
  home.version += 1;
  return tagged(homeAnswer(view));
}

export function transferHome(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('home_transfer');
  const homeId = itemId(id);
  const toMemberId = itemId(body.to_member_id);
  recentSignIn(context, accountOf(context, principal), body.id_token);
  const view = inHome(context, homeId, principal);
  checkOwner(view.member);
  const target = memberIn(context, homeId, toMemberId);
  if (target.id === view.member.id || target.accountId === undefined) {
    throw problem(409, 'the home goes to another person in it with an account');
  }
  view.member.role = 'admin';
  view.member.version += 1;
  target.role = 'owner';
  target.version += 1;
  view.home.version += 1;
  return tagged(homeAnswer(view));
}

export function deleteHome(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('id_token_request');
  const homeId = itemId(id);
  recentSignIn(context, accountOf(context, principal), body.id_token, body.authorization_code);
  const view = inHome(context, homeId, principal);
  checkOwner(view.member);
  if (hasOtherAccounts(context, homeId, view.member.id)) {
    throw typed('owns_home_with_members', 'others with accounts are in the home');
  }
  context.state.deleteHome(homeId);
  return empty(204);
}

function homeAnswer({ home, member }: View) {
  return {
    id: home.id,
    name: home.name,
    time_zone: home.timeZone,
    languages: home.languages,
    member_id: member.id,
    role: member.role ?? 'member',
    create_time: instant(home.createTime),
    etag: etag(home.version),
  };
}

// The people in a home.

export function listMembers(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const { size, after } = pageRequest(request);
  const homeId = itemId(id);
  inHome(context, homeId, principal);
  const shown = page(context.state.membersOf(homeId), size, after);
  return json({
    members: shown.items.map((member) => memberAnswer(member, principal)),
    next_page_token: shown.next,
  });
}

export function addProfile(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('profile_create');
  const key = idempotencyKey(request);
  const homeId = itemId(id);
  const first = firstAnswer(context, principal, key);
  const view = inHome(context, homeId, principal);
  if (first !== undefined) return first;
  checkMayManage(view.member);
  checkMembersOf(context, homeId);
  const profile: Member = {
    id: context.ids.next(),
    homeId,
    displayName: body.display_name,
    createTime: context.now,
    version: 1,
  };
  context.state.members.set(profile.id, profile);
  const answer = tagged(memberAnswer(profile, principal), 201);
  return keepFirstAnswer(context, principal, key, answer, profile.id);
}

export function changeMember(context: Context, request: Incoming, ids: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const changes = request.json('member_update');
  const [homeId, memberId] = ids.map(itemId);
  const view = inHome(context, homeId, principal);
  const target = memberIn(context, homeId, memberId);
  const renamesAnother = changes.display_name !== undefined && target.id !== view.member.id;
  if (renamesAnother && !mayChange(view.member, target)) {
    throw typed('role_required', 'this role may not rename that person');
  }
  if (changes.role !== undefined) {
    checkOwner(view.member);
    if (target.accountId === undefined || target.role === 'owner') {
      throw problem(409, 'a profile has no role, and only handing the home over makes an owner');
    }
  }
  const ifMatch = request.header('if-match');
  if (ifMatch !== undefined && !etagMatches(ifMatch, etag(target.version))) {
    throw problem(412, 'the person changed since that ETag');
  }
  const demoted = target.role === 'admin' && changes.role === 'member';
  target.displayName = changes.display_name ?? target.displayName;
  target.role = (changes.role as Member['role']) ?? target.role;
  target.version += 1;
  if (demoted) {
    for (const [invitationId, invitation] of context.state.invitations) {
      if (invitation.invitedBy === target.id && invitation.usedBy === undefined) {
        context.state.invitations.delete(invitationId);
      }
    }
  }
  return tagged(memberAnswer(target, principal));
}

export function removeMember(context: Context, request: Incoming, ids: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const [homeId, memberId] = ids.map(itemId);
  const view = inHome(context, homeId, principal);
  const target = memberIn(context, homeId, memberId);
  if (target.id === view.member.id) {
    if (target.role === 'owner') {
      throw typed('owner_cannot_leave', 'hand the home over, or delete it');
    }
  } else if (!mayChange(view.member, target)) {
    throw typed('role_required', 'this role may not remove that person');
  }
  context.state.deleteMember(target.id);
  return empty(204);
}

function memberAnswer(member: Member, principal: Principal) {
  return {
    id: member.id,
    kind: member.accountId === undefined ? 'profile' : 'account',
    display_name: member.displayName,
    ...(member.role === undefined ? {} : { role: member.role }),
    current: member.accountId === principal.accountId,
    create_time: instant(member.createTime),
    etag: etag(member.version),
  };
}

// Invitations.

export function createInvitation(
  context: Context,
  request: Incoming,
  [id]: string[],
): CloudResponse {
  const principal = authenticate(context, request);
  const homeId = itemId(id);
  const view = inHome(context, homeId, principal);
  checkMayManage(view.member);
  for (const [invitationId, invitation] of context.state.invitations) {
    if (invitation.homeId === homeId && invitation.expireTime <= context.now) {
      context.state.invitations.delete(invitationId);
    }
  }
  const limit = context.settings.invitations_per_home;
  if (openInvitations(context, homeId).length >= limit) {
    throw typed('invitation_limit_reached', `a home has ${limit} open invitations at most`);
  }
  const invitation: Invitation = {
    id: context.ids.next(),
    homeId,
    code: newToken(context.random),
    invitedBy: view.member.id,
    invitedByName: view.member.displayName,
    createTime: context.now,
    expireTime: context.now + context.settings.invitation_lifetime * 1000,
  };
  context.state.invitations.set(invitation.id, invitation);
  return json({ ...invitationAnswer(invitation), code: invitation.code }, 201);
}

export function listInvitations(
  context: Context,
  request: Incoming,
  [id]: string[],
): CloudResponse {
  const principal = authenticate(context, request);
  const { size, after } = pageRequest(request);
  const homeId = itemId(id);
  checkMayManage(inHome(context, homeId, principal).member);
  const shown = page(openInvitations(context, homeId), size, after);
  return json({
    invitations: shown.items.map(invitationAnswer),
    next_page_token: shown.next,
  });
}

export function revokeInvitation(
  context: Context,
  request: Incoming,
  ids: string[],
): CloudResponse {
  const principal = authenticate(context, request);
  const [homeId, invitationId] = ids.map(itemId);
  checkMayManage(inHome(context, homeId, principal).member);
  if (!openInvitations(context, homeId).some((invitation) => invitation.id === invitationId)) {
    throw problem(404, 'no such open invitation in the home');
  }
  context.state.invitations.delete(invitationId);
  return empty(204);
}

export function lookUpInvitation(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const { code } = request.json('invitation_code_request');
  limitRate(context, 'invitation', principal.accountId, context.settings.invitation_rate);
  const invitation = invitationByCode(context, code);
  const home = invitation && context.state.homes.get(invitation.homeId);
  const asker = home && context.state.memberOf(home.id, principal.accountId);
  if (invitation === undefined || home === undefined || !usable(context, invitation, asker)) {
    throw typed('invitation_invalid', 'this code cannot be used');
  }
  return json({
    home_name: home.name,
    invited_by: invitation.invitedByName,
    expire_time: instant(invitation.expireTime),
  });
}

export function acceptInvitation(context: Context, request: Incoming): CloudResponse {
  const principal = authenticate(context, request);
  const { code } = request.json('invitation_code_request');
  limitRate(context, 'invitation', principal.accountId, context.settings.invitation_rate);
  const invitation = invitationByCode(context, code);
  const account = accountOf(context, principal);
  const home = invitation && context.state.homes.get(invitation.homeId);
  const member = home && context.state.memberOf(home.id, account.id);
  if (invitation === undefined || home === undefined || !usable(context, invitation, member)) {
    throw typed('invitation_invalid', 'this code cannot be used');
  }
  if (member !== undefined) {
    return tagged(homeAnswer({ home, member }));
  }
  checkHomesOf(context, account.id);
  checkMembersOf(context, home.id);
  const joined: Member = {
    id: context.ids.next(),
    homeId: home.id,
    accountId: account.id,
    displayName: account.displayName,
    role: 'member',
    createTime: context.now,
    version: 1,
  };
  context.state.members.set(joined.id, joined);
  invitation.usedBy = joined.id;
  return tagged(homeAnswer({ home, member: joined }), 201);
}

function invitationAnswer(invitation: Invitation) {
  return {
    id: invitation.id,
    invited_by: invitation.invitedByName,
    create_time: instant(invitation.createTime),
    expire_time: instant(invitation.expireTime),
  };
}

function openInvitations(context: Context, homeId: string): Invitation[] {
  return sorted(
    [...context.state.invitations.values()].filter(
      (invitation) =>
        invitation.homeId === homeId &&
        invitation.usedBy === undefined &&
        invitation.expireTime > context.now,
    ),
  );
}

function invitationByCode(context: Context, code: string): Invitation | undefined {
  for (const invitation of context.state.invitations.values()) {
    if (invitation.code === code) return invitation;
  }
  return undefined;
}

/**
 * Whether a person may go on with an invitation whose code they hold. A code works once, but
 * the person it brought in may try it again, so that a retry after a lost answer ends in the
 * same place.
 */
function usable(context: Context, invitation: Invitation, asker: Member | undefined): boolean {
  if (context.now >= invitation.expireTime) return false;
  return invitation.usedBy === undefined || invitation.usedBy === asker?.id;
}

// Deleting an account.

/**
 * A step of deleting an account: its person leaves every home it is in, and a home it owns goes
 * with it. 409 `owns_home_with_members` if others with accounts are in one of those, before
 * anything changes, so that the deletion stops whole.
 */
export function removeFromHomes(context: Context, accountId: string): void {
  const members = [...context.state.members.values()].filter(
    (member) => member.accountId === accountId,
  );
  for (const member of members) {
    if (member.role === 'owner' && hasOtherAccounts(context, member.homeId, member.id)) {
      throw typed('owns_home_with_members', 'others with accounts are in a home it owns');
    }
  }
  for (const member of members) {
    if (member.role === 'owner') {
      context.state.deleteHome(member.homeId);
    } else {
      context.state.deleteMember(member.id);
    }
  }
}

// Helpers.

/** An identifier in a request: one that is not a UUID names nothing. */
export function itemId(text: string): string {
  const id = uuid(text);
  if (id === null) throw problem(404, 'no such item in the account');
  return id;
}

/** The home, as the person who asks sees it: 404 if they are not in it, as if it did not
 *  exist (SEC-6). */
export function inHome(context: Context, homeId: string, principal: Principal): View {
  const home = context.state.homes.get(homeId);
  const member = home && context.state.memberOf(homeId, principal.accountId);
  if (home === undefined || member === undefined) {
    throw problem(404, "no such home among the account's");
  }
  return { home, member };
}

function memberIn(context: Context, homeId: string, memberId: string): Member {
  const member = context.state.members.get(memberId);
  if (member === undefined || member.homeId !== homeId) {
    throw problem(404, 'no such person in the home');
  }
  return member;
}

/** Whether `member` may change the home, invite people, add profiles and devices, and rename
 *  and remove devices. */
export function checkMayManage(member: Member): void {
  if (member.role !== 'owner' && member.role !== 'admin') {
    throw typed('role_required', 'the owner or an admin may do this');
  }
}

function checkOwner(member: Member): void {
  if (member.role !== 'owner') {
    throw typed('role_required', 'only the owner may do this');
  }
}

/** Whether `actor` may rename or remove `target`, who is someone else: the owner anyone, and an
 *  admin members and profiles. */
function mayChange(actor: Member, target: Member): boolean {
  if (actor.role === 'owner') return true;
  return actor.role === 'admin' && (target.role === 'member' || target.role === undefined);
}

function hasOtherAccounts(context: Context, homeId: string, memberId: string): boolean {
  return context.state
    .membersOf(homeId)
    .some((member) => member.id !== memberId && member.accountId !== undefined);
}

function checkHomesOf(context: Context, accountId: string): void {
  const limit = context.settings.homes_per_account;
  const homes = [...context.state.members.values()].filter(
    (member) => member.accountId === accountId,
  );
  if (homes.length >= limit) {
    throw typed('home_limit_reached', `an account is in ${limit} homes at most`);
  }
}

function checkMembersOf(context: Context, homeId: string): void {
  const limit = context.settings.members_per_home;
  if (context.state.membersOf(homeId).length >= limit) {
    throw typed('member_limit_reached', `a home has ${limit} people at most`);
  }
}

/**
 * 400 for a time zone that the IANA database does not name. The simulated cloud asks the
 * JavaScript engine: in Node, ICU; on a phone, the platform's own, which Hermes's Intl uses
 * (Hermes's IntlAPIs.md). ai-cloud reads tzdata's list.
 */
function checkTimeZone(name: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
  } catch {
    throw problem(400, 'not a time zone of the IANA database');
  }
}
