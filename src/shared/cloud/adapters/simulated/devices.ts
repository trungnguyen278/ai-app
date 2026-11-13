// SPDX-License-Identifier: MIT
// The simulated cloud's devices (the app API, Devices), as ai-cloud's devices service and routes
// do them: challenges, registrations, a home's devices, their names, and removing one. The
// devices' own side, their control channels, is the simulation's: a device says when it
// connects, with the key it registered, and what it is.
import type { CloudResponse } from '../../transport';
import {
  authenticate,
  firstAnswer,
  idempotencyKey,
  keepFirstAnswer,
  limitRate,
  page,
  pageRequest,
  type Context,
} from './context';
import { checkMayManage, inHome, itemId } from './homes';
import { etag, etagMatches, instant, newToken, type Description, type Device } from './model';
import {
  challengeOf,
  RegistrationInvalid,
  thumbprint,
  verifyRegistration,
  type PublicJwk,
} from './registration';
import { Answered, empty, json, problem, tagged, typed, type Incoming } from './wire';

// Adding a device.

/** A challenge to register one device into the home, for the owner or an admin. */
export function issueChallenge(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const homeId = itemId(id);
  limitRate(context, 'challenge', principal.accountId, context.settings.challenge_rate);
  checkMayManage(inHome(context, homeId, principal).member);
  for (const [challenge, issued] of context.state.challenges) {
    if (issued.expireTime <= context.now) context.state.challenges.delete(challenge);
  }
  const lifetime = context.settings.challenge_lifetime;
  const challenge = newToken(context.random);
  context.state.challenges.set(challenge, {
    homeId,
    accountId: principal.accountId,
    expireTime: context.now + lifetime * 1000,
  });
  return json({ challenge, server: context.settings.server, expires_in: lifetime }, 201);
}

/**
 * Register the device that signed the registration into the home, with the name the app sent,
 * if any. Its challenge is used first of all, and the answer kept with it, whatever it is: so a
 * challenge works once, a retry gets the first answer, and nothing is tried twice on one
 * challenge.
 */
export function registerDevice(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const body = request.json('device_registration');
  const key = idempotencyKey(request);
  const view = inHome(context, itemId(id), principal);
  const first = firstAnswer(context, principal, key);
  if (first !== undefined) return first;
  checkMayManage(view.member);
  const challenge = challengeOf(body.registration);
  if (challenge === null) throw typed('registration_invalid', 'it names no challenge');
  const issued = context.state.challenges.get(challenge);
  if (
    issued === undefined ||
    issued.homeId !== view.home.id ||
    issued.accountId !== principal.accountId ||
    issued.expireTime <= context.now
  ) {
    throw typed('registration_invalid', "its challenge is unknown, expired, used, or another's");
  }
  context.state.challenges.delete(challenge);
  let answer: CloudResponse;
  let shown: string | undefined;
  try {
    const { device, added } = bind(context, view.home.id, body.registration, body.name);
    answer = tagged(deviceAnswer(device), added ? 201 : 200);
    shown = device.id;
  } catch (error) {
    if (!(error instanceof Answered)) throw error;
    answer = error.response;
  }
  return keepFirstAnswer(context, principal, key, answer, view.member.id, shown);
}

/**
 * The device that signed the registration, in the home: as it was, if it is there with the same
 * key, or new there with `name`. A device that lost what it kept, but not its key, registers
 * again into its home, which keeps its name, and takes the registration's only if it has none.
 */
function bind(
  context: Context,
  homeId: string,
  registration: string,
  name: string | undefined,
): { device: Device; added: boolean } {
  let verified;
  try {
    verified = verifyRegistration(registration, context.settings.server);
  } catch (error) {
    if (error instanceof RegistrationInvalid) throw typed('registration_invalid', error.message);
    throw error;
  }
  const holder = context.state.devices.get(verified.deviceId);
  const keyHolder = context.state.deviceWithKey(verified.key);
  if (holder !== undefined || keyHolder !== undefined) {
    if (holder === undefined || holder.homeId !== homeId || keyHolder !== holder) {
      throw typed('device_taken', 'the cloud holds its identifier or its key elsewhere');
    }
    if (holder.name === undefined && name !== undefined) {
      holder.name = name;
      holder.version += 1;
    }
    return { device: holder, added: false };
  }
  // The limit counts new devices only: a full home takes back one that lost what it kept.
  const limit = context.settings.devices_per_home;
  if (context.state.devicesOf(homeId).length >= limit) {
    throw typed('device_limit_reached', `a home has ${limit} devices at most`);
  }
  const device: Device = {
    id: verified.deviceId,
    homeId,
    key: verified.key,
    ...(name === undefined ? {} : { name }),
    connected: false,
    createTime: context.now,
    version: 1,
  };
  context.state.devices.set(device.id, device);
  return { device, added: true };
}

// A home's devices.

/** A page of the home's devices, in the order of their identifiers, for anyone in it. */
export function listDevices(context: Context, request: Incoming, [id]: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const { size, after } = pageRequest(request);
  const homeId = itemId(id);
  inHome(context, homeId, principal);
  const shown = page(context.state.devicesOf(homeId), size, after);
  return json({ devices: shown.items.map(deviceAnswer), next_page_token: shown.next });
}

export function readDevice(context: Context, request: Incoming, ids: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const [homeId, deviceId] = ids.map(itemId);
  inHome(context, homeId, principal);
  return tagged(deviceAnswer(deviceIn(context, homeId, deviceId)));
}

/** Rename one of the home's devices, for the owner or an admin, if `If-Match` names its ETag,
 *  or is absent. */
export function renameDevice(context: Context, request: Incoming, ids: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const { name } = request.json('device_update');
  const [homeId, deviceId] = ids.map(itemId);
  checkMayManage(inHome(context, homeId, principal).member);
  const device = deviceIn(context, homeId, deviceId);
  const ifMatch = request.header('if-match');
  if (ifMatch !== undefined && !etagMatches(ifMatch, etag(device.version))) {
    throw problem(412, 'the device changed since that ETag');
  }
  device.name = name;
  device.version += 1;
  return tagged(deviceAnswer(device));
}

/** Remove a device from the home, which revokes it, for the owner or an admin: the cloud
 *  forgets its key, and its control channel ends. */
export function removeDevice(context: Context, request: Incoming, ids: string[]): CloudResponse {
  const principal = authenticate(context, request);
  const [homeId, deviceId] = ids.map(itemId);
  checkMayManage(inHome(context, homeId, principal).member);
  deviceIn(context, homeId, deviceId);
  context.state.deleteDevice(deviceId);
  return empty(204);
}

// The devices' side.

/**
 * The device whose key this is opens its control channel, and says what it is in its hello
 * (the cloud link, Hello): false if the cloud holds no device with that key, as its token
 * endpoint refuses one that was removed.
 */
export function connect(context: Context, key: PublicJwk, hello: Description): boolean {
  const device = context.state.deviceWithKey(thumbprint(key));
  if (device === undefined) return false;
  device.connected = true;
  device.description = { kind: hello.kind, model: hello.model, software: hello.software };
  return true;
}

/** The device's control channel closes, as when it stops. */
export function disconnect(context: Context, key: PublicJwk): void {
  const device = context.state.deviceWithKey(thumbprint(key));
  if (device !== undefined) device.connected = false;
}

// Helpers.

function deviceIn(context: Context, homeId: string, deviceId: string): Device {
  const device = context.state.devices.get(deviceId);
  if (device === undefined || device.homeId !== homeId) {
    throw problem(404, 'no such device in the home');
  }
  return device;
}

function deviceAnswer(device: Device) {
  const { description } = device;
  return {
    id: device.id,
    // Absent for a device that an app of 1.4 registered, until someone names it.
    ...(device.name === undefined ? {} : { name: device.name }),
    // Absent until its first hello.
    ...(description === undefined
      ? {}
      : { kind: description.kind, model: description.model, software: description.software }),
    connected: device.connected,
    create_time: instant(device.createTime),
    etag: etag(device.version),
  };
}
