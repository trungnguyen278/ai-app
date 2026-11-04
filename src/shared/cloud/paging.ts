// SPDX-License-Identifier: MIT
// A list read whole, page after page (the app API, Sessions: paging).
import type { PageRequest } from './client';

/** A page of a list, as the app API answers one. */
export interface Page {
  next_page_token: string;
}

/**
 * Every item of a list: `read` gives each page, `items` what it holds. A page token given
 * twice ends the walk, so that a cloud that loops cannot keep the app reading.
 */
export async function everyPage<P extends Page, T>(
  read: (page: PageRequest) => Promise<P>,
  items: (page: P) => T[],
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await read({ pageToken });
    all.push(...items(page));
    pageToken = page.next_page_token || undefined;
    if (pageToken !== undefined && seen.has(pageToken)) break;
    if (pageToken !== undefined) seen.add(pageToken);
  } while (pageToken !== undefined);
  return all;
}
