// SPDX-License-Identifier: MIT
// An invitation's link (the app API, Invitations): the cloud's address, then /join#, then the
// code. The code is the fragment, which a browser keeps from every server and log.
import { createURL } from 'expo-linking';

import { SIMULATED } from '@/src/shared/cloud';
import { accepts } from '@/src/shared/protocols';

/**
 * The link that shares `code`. The simulated cloud has no address: its link is the app's own,
 * which only this app, on this phone, can follow.
 */
export function invitationLink(address: string, code: string): string {
  const base = address === SIMULATED ? createURL('join') : `${address.replace(/\/$/, '')}/join`;
  return `${base}#${code}`;
}

/** The code in what a person pasted or a link brought: a whole link, or the code alone. */
export function codeIn(text: string): string | null {
  const trimmed = text.trim();
  const mark = trimmed.lastIndexOf('#');
  const code = mark < 0 ? trimmed : trimmed.slice(mark + 1);
  return accepts('invitation_code', code) ? code : null;
}
