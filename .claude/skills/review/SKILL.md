---
name: review
description: Review a pull request or the current branch of this repository before handing it over; run it inline, without subagents, to keep the cost low. Use before telling the user a pull request is ready, and when asked to review a PR, a branch or a diff here.
---

# Reviewing a change

Goal: find the bugs before the user does, at a reasonable cost. Work in the main conversation: no subagents, no fan-out. Read the diff once, run the checks, walk the areas the diff touches, and confirm each suspicion by running code before reporting it. Add to this checklist each kind of bug the project meets, so that it is not met twice.

## 1. Scope it

```sh
git fetch -q origin
git diff --stat origin/main...HEAD     # which areas, how big
git diff origin/main...HEAD            # read it once, in full
```

Read whole files only where a hunk cannot be judged alone (an enclosing function, a caller). Note which areas below the diff touches; skip the others.

## 2. Run the checks

The linters and the tests the README lists, as CI runs them. A failing check is a finding; fix it before reading further.

## 3. Walk the areas the diff touches

### Data crossing a boundary (a device over Bluetooth LE, the cloud)

- The protocol changed first, in ai-platform, and the submodule's pin moved with the code that speaks it.
- Every message received is validated: its schema, its size, its numbers (finite), its strings (length); what fails is refused (SEC-14). Rates and sizes are limited (SEC-15).
- Every JSON text received is read with `readJson` (`src/shared/protocols/json.ts`), never `JSON.parse`: it refuses what no side can hold (ai-platform ADR-0014), a U+0000, a lone surrogate, nesting past 64 or a number past a double, as one it cannot read. `JSON.parse` takes all of them, and an escaped lone surrogate passes a schema's patterns.
- A device's name for a network goes as bytes: `ssid` only when they are UTF-8 without a NUL byte, `ssid_hex` otherwise, wherever a name goes. A set-up error replies to the message it is about whenever that message's `seq` can be read, even if the message breaks the schema.
- A replayed message has no effect beyond its first one, and credentials expire (SEC-12).
  - What is used once is used first of all, and the answer is kept with its Idempotency-Key whatever it is, a refusal included: a registration's challenge, once used, can give no other answer to a retry.
- A signature or a key is read as the protocol reads it, not as a library's default does. noble refuses a high `s` unless told (`lowS: false`), where JWS takes either (RFC 7518, 3.4). A key's coordinates are read canonically, as ai-cloud reads them: base64url with other unused bits would give one key two thumbprints.
- A device or a cloud that does not answer, answers late or answers twice leaves the app usable, and the owner is told what happened.
- Only what the protocol makes safe to repeat is sent again: a request with an Idempotency-Key, with the same key each time. A refresh token works once, so a refresh is never retried.
- A simulated device or cloud keeps to the real one: the protocol's examples replay against it, and it refuses what the real one refuses, in the same order.
- A set-up session over a link: an answer can come before the app has written all it meant to, such as the device's error to the confirmation, in the clear. The app then stops writing, reads it, and takes in the clear only that error, before the device's first encrypted message. A link can also end before its listener is installed: the session ends at once.
- What a device sends cannot grow the app's memory: a fragment while nothing is asked ends the session before it is kept, and a message being joined takes the length it announced, checked first, however many fragments come. Fragments without data once piled up without end.
- What is hashed or sealed is the exact bytes sent: set-up's context hashes both hellos as written. An example made by another JSON encoder, such as Python's spaced one, replays at the level of its parts, not of a whole session.
- A change makes the cache read again everything it touches at the cloud, the effects the protocol names included: removing or demoting a person revokes their invitations. It does so whatever the answer, since a lost answer may hide a change made.

### Security and privacy

- Secrets — the owner's session, a device's set-up code, the keys of a set-up session — stay in memory or in the phone's secure storage: never in plain files, logs, error reports or analytics.
- A secret that a screen shows or sends, such as an invitation's code, stays in the cache only while that screen is open (`gcTime: 0`), and in no route but the link that brought it.
- Every request is confined to the owner's homes and their devices (SEC-6).
- An error names what failed, never a value: no code, password, network or name, and no length or size taken from the data (SEC-5).
- The app asks for a permission, such as Bluetooth or notifications, when it first needs it, and says why, in the owner's language.
  - The phone's own question, such as iOS's reason for the camera, comes from the catalogs too, through `NATIVE_MESSAGES` in `app.config.ts`, as plain text.
  - A plugin asks for nothing the app does not use: `npx expo config --type introspect` shows the permissions a build gets.
  - Expo's permission hooks read the permission only as they start: a screen that sends the person to the settings reads it again when the app comes back to the front.

### The interface

- Nothing blocks the interface: network, Bluetooth and storage work asynchronously.
- Every text comes from the catalogs, and layouts hold longer translations and larger text sizes.
- A catalog's text that becomes data, such as a default name the person may keep or a message they send, comes from `usePlainText`: MF2 isolates every value with invisible marks, which would be stored with it.
- Dates and numbers are formatted by the catalogs' messages (`:datetime`, `:number`), never by hand. Hermes has no `Intl.PluralRules` (its IntlAPIs.md, read 2026-11-04): a message that selects a plural waits for a polyfill.
  - `:datetime` formats a time whatever `dateFields` says (messageformat 4.1.0): a day alone is `:date`, with `fields` and `length`.
- Every route guard names where it leads (`redirectTo`): without one, Expo Router leads to the first open route in its own order, by name.
- A page that a link can open, as any route can, may have nothing behind it: after an action that leaves it, it goes back only when `router.canGoBack()`, and to the page above it otherwise.
- A screen a link opens signs the person in on that screen (`SignInScreen`'s `reason`), so that the link keeps its place: a guard would replace it.
- What people use has a label for screen readers, and enough contrast in the light and dark themes.
- A message that appears or changes, such as a failure or what a change did, is a `Notice`, which each platform's screen reader says. A role alone says nothing on iOS, and React Native's `Text` drops `aria-live` (only its `View` maps it). An Android live region speaks a change to a view already on the screen, not a view that arrives with its text; and a `View` with nothing but a live region is flattened away.
- What cannot be undone is a `danger` button, confirmed in the phone's own dialog (`Alert`) that says what goes.
- A change sent with `If-Match` that the cloud refuses as stale (`Refused.stale`) keeps what the person typed, and says that someone changed it meanwhile. A component keyed by the ETag would forget both.
- Changes to one thing sent with `If-Match`, such as a person's name and role, go one at a time: a second sent while the first is under way carries the same ETag, and is refused as stale, as if someone else had changed it.
- A choice the cloud makes, such as a role, shows the option chosen while the cloud is asked, then what the cloud has: after a refusal, never the option refused.
- A group of radio buttons is a `radiogroup` that is not an element of its own: an `accessible` container would hide its options from screen readers.

### Tests

- Each behaviour change has a test that would fail on the old code; check it is not vacuous (an exact float compare that never matches, a loop that never runs).
- A test of one rule isolates it. When two rules could refuse the same request, set them apart, or the test passes for the wrong reason: a fresh sign-in too old to be recent was also past its nonce's lifetime; bytes that are no UTF-8 sat outside a JSON string, which JSON refused first. A mutant of the rule shows it.
- What the build reads, `app.config.ts`, is tested through Expo's own reader (`getConfig`), as the build reads it: calling the function alone missed tables without a prototype, which broke the builds.
- Protocol exchanges are tested against ai-platform's examples, and against a simulated device.
- A fake keeps to its port's contract as the real adapter will: a fake link that skipped the listener of a link already ended hid a listener left installed. A rule that no session can reach today, such as a long message after the one that opens the channel, is tested on the unit that holds it, the `Conversation`.
- No fixed sleeps to wait for readiness: wait for the condition, with a timeout.
- A time reads the same on every machine: the tests run in UTC (`jest.config.js`), and the simulated cloud takes a clock.
- Invisible characters in source, such as MF2's isolating marks (U+2066 to U+2069), are written as escapes, which a reviewer can see. Some editing tools write the character itself: check the file's bytes.
- TanStack Query shows a mutation's pending state a tick after `mutate`: a test waits for it (`waitFor`). To see a screen while the cloud is asked, a transport holds the request until the test lets it go.
- `jest.restoreAllMocks` restores spies only (jest-mock 30): the `jest.fn()`s of a `jest.mock` factory keep their calls from test to test, so a file that asserts a call did not happen clears them first (`jest.clearAllMocks`).
- React Native Testing Library 14 renders and unmounts asynchronously: a test awaits `unmount`, or its `act` overlaps the next render, and the tests after it fail.
- A test file run alone, as a mutant's run does, runs in band, and Jest waits for any handle left open; pass `--forceExit`.
- An error that the runtime throws, such as `TextDecoder`'s with `fatal`, can be of another realm's class under Jest: `instanceof TypeError` was false there, and a header that was no UTF-8 failed the simulated cloud instead of being refused. Catch such a call alone, without testing the class, as `readMessage` does.
- What a screen reader hears is tested on each platform, with `jest.replaceProperty(Platform, 'OS', …)`, restored after each test (`jest.restoreAllMocks`). A test that renders again uses `rerender`, which keeps `renderScreen`'s providers.

### Repository rules (CONTRIBUTING.md, AGENTS.md)

- English everywhere; SPDX header on new source files; no personal or machine-specific values; no product name.
- Docs travel with the change: the README, ADRs (`Proposed` unless explicitly agreed), the dev log.
- `<type>(<scope>): <summary>`, one commit per pull request, `<type>/<short-description>` branch.

## 4. Confirm, then fix

For each suspicion, write the smallest script that shows it. Drop whatever does not reproduce. Fix what does in the pull request's single commit (`git commit --amend`, `git push --force-with-lease`), adding a test for it.

## 5. Report

When handing the change over, say in the conversation what the review found and how each item was fixed, or why it was left, and what was not checked. Keep it out of the commit message and the pull request description, which stay short (CONTRIBUTING.md).
