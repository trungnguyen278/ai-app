// SPDX-License-Identifier: MIT
import { router, type Href } from 'expo-router';

/**
 * Back where the person came from, after an action that leaves a page. A link can open any
 * route, and a page it opened has nothing behind it: the person goes to `above` then, the page
 * above this one, as its own back button would lead.
 */
export function goBack(above: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(above);
}
