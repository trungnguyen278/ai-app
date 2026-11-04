// SPDX-License-Identifier: MIT
// What a session is called in the person's list of their sessions: the phone's model, such as
// "Pixel 8" (the app API, The exchange).

// Fixed by the app API's schema: $defs/token_exchange_request, session_label's maxLength.
const SESSION_LABEL_MAX = 100;

/**
 * The label for a phone of `model`: without control characters, which the cloud refuses in a
 * label, and cut to what the schema allows; none if nothing is left.
 */
export function sessionLabel(model: string | null | undefined): string | undefined {
  const kept = [...(model ?? '')].filter((character) => !isControl(character)).join('');
  const label = [...kept.trim()].slice(0, SESSION_LABEL_MAX).join('');
  return label === '' ? undefined : label;
}

/** Unicode's control characters, Cc: U+0000 to U+001F, and U+007F to U+009F. */
function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}
