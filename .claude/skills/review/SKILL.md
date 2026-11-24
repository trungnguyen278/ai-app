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
  - A new pin can narrow what a field takes: what the app and its tests send, tokens and settings among it, keeps to the pinned schema, or a test meets the schema's refusal instead of the answer it means, as two of ai-cloud's did with `not a token` (the app API 1.8). A setting that the app API bounds names the definition in its description, and `tests/config.test.ts` holds it to that definition's bounds: the app's identifier had fallen behind 1.8's pattern. A pin can widen a field as well: a test that expects a value refused, such as an unknown `token_type_hint` before the app API 1.9, then meets the answer, and the simulated cloud follows the cloud's new answer.
  - A form is written as the WHATWG URL Standard writes it (`formEncode`), which percent-encodes `~`, as the vectors' byte counts assume: Python's `urlencode` leaves it, and ai-cloud's tests sent a shorter form than the app does.
- Every message received is validated: its schema, its size, its numbers (finite), its strings (length); what fails is refused (SEC-14). Rates and sizes are limited (SEC-15).
  - A limit on a size holds while the bytes come, not once they are all held: the transport counts fetch's body as a stream, where `arrayBuffer()`, `text()` or OkHttp's `bytes()` hold the whole of it first, as the transport did until 2026-11-23. It stops the download with an abort: cancelling the reader stops expo/fetch giving the bytes, but on iOS its URLSession task goes on downloading them (`cancelStreaming` in `NativeResponse.swift`, expo 58.0.21). A test's fetch gives its body only as a stream, so that a whole read fails it.
- Every JSON text received is read with `readJson` (`src/shared/protocols/json.ts`), never `JSON.parse`: it refuses what no side can hold (ai-platform ADR-0014), a U+0000, a lone surrogate, nesting past 64, a number past a double or a name twice in one object, as one it cannot read. `JSON.parse` takes all of them, and an escaped lone surrogate passes a schema's patterns.
  - A check of the parsed value sees only what the parser kept: `JSON.parse` keeps a repeated name's last value, and the value it dropped, a U+0000 in it, went unchecked. The other sides refuse the text.
  - A scan of a text received reads each string once, passing over each escape: one that goes back at each escaped quote, or a pattern that needs the closing quote and tries again from each, takes time in the square of the length, as ai-robot's first depth count did.
  - A text received is read from its bytes with `utf8Text`, which refuses what is not UTF-8 and keeps a byte order mark for `readJson` to refuse; never through a reader that repairs, such as fetch's `text()`, the Fetch Standard's and expo/fetch's on Android alike. An answer of the cloud that was not UTF-8 was read with U+FFFD in it, where set-up refused the same bytes (2026-11-22). A limit on a size counts the bytes, not a string's units. The bytes are read where the protocol reads them: a transport that decoded every answer turned a 5xx, whose body the app does not read, into a protocol error. `exchange`'s `readBody` reads a body; the transport carries bytes.
  - The readers and the checks run ai-platform's vectors (`platform/vectors/`, in `tests/shared/vectors.test.ts`), each reader from the bytes its transport gives. A bug of reading or checking that a review finds becomes a vector there, so that every side runs it.
  - A list's `uniqueItems` compares every pair of items when they are `$ref`s: the checks are generated without `allErrors`, so that `maxItems` refuses a long list first.
- A device's name for a network goes as bytes: `ssid` only when they are UTF-8 without a NUL byte, `ssid_hex` otherwise, wherever a name goes. A set-up error replies to the message it is about whenever that message's `seq` can be read, even if the message breaks the schema.
- A replayed message has no effect beyond its first one, and credentials expire (SEC-12).
  - What is used once is used first of all, and the answer is kept with its Idempotency-Key whatever it is, a refusal included: a registration's challenge, once used, can give no other answer to a retry.
- A signature or a key is read as the protocol reads it, not as a library's default does. noble refuses a high `s` unless told (`lowS: false`), where JWS takes either (RFC 7518, 3.4). A key's coordinates are read canonically, as ai-cloud reads them: base64url with other unused bits would give one key two thumbprints.
- A device or a cloud that does not answer, answers late or answers twice leaves the app usable, and the owner is told what happened.
  - Every wait on a link ends by the app's own timer, since a session's timer for an answer starts only once its writes have settled: a connection within `[setup].connect_timeout`, a write within `[setup].write_timeout`, after which the link ends. The stack's own end of a link is not enough: an ATT transaction fails after 30 seconds (Bluetooth Core, Vol 3, Part F, 3.3.3), but react-native-ble-manager never settles an Android write that the device refused for its authentication, whatever the stack does (2026-11-21).
  - A failure is named after what the phone's radio says once it happened: Bluetooth turned off while the phone connects fails the connection, which set-up once told as a code that expired.
- Only what the protocol makes safe to repeat is sent again: a request with an Idempotency-Key, with the same key each time. A refresh token works once, so a refresh is never retried.
- A simulated device or cloud keeps to the real one: the protocol's examples replay against it, and it refuses what the real one refuses, in the same order.
- A refusal is read as what its answer says it is. An OAuth endpoint refuses as OAuth does, but with Problem Details where it refuses as every endpoint does, such as a body over 64 KiB (`413`): the media type tells them apart, and reading every refusal there as OAuth's turned a `413` into a protocol error.
- A set-up session over a link: an answer can come before the app has written all it meant to, such as the device's error to the confirmation, in the clear. The app then stops writing, reads it, and takes in the clear only that error, before the device's first encrypted message. A link can also end before its listener is installed: the session ends at once.
- Set-up's flow sends no `configure` and no `register` to a device that is bound already, tries a code only on the device whose discriminator matches, and drops its session once the session ends. Each step after an `await` checks that the screen is still there, so that a flow closed meanwhile does nothing more to the device.
  - What a step got while it waited, such as a link made after the close, is let go when the flow finds itself closed: `end()` in `run`'s catch. Letting a device go is an `await` too, followed by a check. Both once left a link open, or connected to the next device.
  - Among several devices, one that refuses (`busy`, `version`) may not be the code's: the others are tried, and the person is told only if none is. A newer device once ended the search before the code's own.
  - What the phone allowed before, such as Bluetooth, is read again where it is needed: the person may turn it off between two steps, and is then told that, not that no device is near.
  - A failure is told by where it comes from, not by its type alone: `ProtocolError` is the cloud's answer as much as an outgoing message's check. The flow wraps each request to the cloud (`fromCloud`); a cloud answer that broke the app API once ended the device's session.
- What a device sends cannot grow the app's memory: a fragment while nothing is asked ends the session before it is kept, and a message being joined takes the length it announced, checked first, however many fragments come. Fragments without data once piled up without end.
- What is hashed or sealed is the exact bytes sent: set-up's context hashes both hellos as written. An example made by another JSON encoder, such as Python's spaced one, replays at the level of its parts, not of a whole session.
- A change makes the cache read again everything it touches at the cloud, the effects the protocol names included: removing or demoting a person revokes their invitations. It does so whatever the answer, since a lost answer may hide a change made.

### Security and privacy

- Secrets — the owner's session, a device's set-up code, the keys of a set-up session — stay in memory or in the phone's secure storage: never in plain files, logs, error reports or analytics.
- A secret that a screen shows or sends, such as an invitation's code, stays in the cache only while that screen is open (`gcTime: 0`), and in no route but the link that brought it.
- Every request is confined to the owner's homes and their devices (SEC-6).
- Plain HTTP reaches a developer's own cloud alone (SEC-1): Android's network security configuration and iOS's App Transport Security come from the cloud's address in `app.config.ts`, for its host only, never a wider rule, such as a `base-config` that permits it, or `NSAllowsArbitraryLoads`.
  - Once a network security configuration is named, Android ignores `usesCleartextTraffic`: the template's debug build types keep their development server in a file of their own. A mod that writes native files is tested by running it on a project (`compileModsAsync`).
- An error names what failed, never a value: no code, password, network or name, and no length or size taken from the data (SEC-5).
- The app asks for a permission, such as Bluetooth or notifications, when it first needs it, and says why, in the owner's language.
  - The phone's own question, such as iOS's reason for the camera, comes from the catalogs too, through `NATIVE_MESSAGES` in `app.config.ts`, as plain text.
  - A plugin asks for nothing the app does not use. The permissions a build gets are its merged manifest's (`aapt2 dump permissions` on the APK): `npx expo config --type introspect` shows only the plugins' part, in `uses-permission` and in `uses-permission-sdk-23`, and a library's own manifest merges in. react-native-ble-manager's plugin declares `BLUETOOTH` and `BLUETOOTH_ADMIN` for every Android, where its manifest limits them to Android 11.
  - Expo's permission hooks read the permission only as they start: a screen that sends the person to the settings reads it again when the app comes back to the front.

### The interface

- Nothing blocks the interface: network, Bluetooth and storage work asynchronously.
- A page drawn from a query shows its error page only when the query never succeeded (TanStack's `isLoadingError`). A background read that fails keeps the page, and with it what lives under it: a set-up's session once ended when the homes could not be read again.
- Every text comes from the catalogs, and layouts hold longer translations and larger text sizes.
- A catalog's text that becomes data, such as a default name the person may keep or a message they send, comes from `usePlainText`: MF2 isolates every value with invisible marks, which would be stored with it.
- Dates, numbers and plurals are formatted by the catalogs' messages (`:datetime`, `:number`, `.match`), never by hand. The catalogs load the polyfills of what Hermes lacks (ADR-0008): a new catalog's language brings its plural rules to `src/shared/catalog/intl.ts`.
  - `:datetime` formats a time whatever `dateFields` says (messageformat 4.1.0): a day alone is `:date`, with `fields` and `length`.
- Jest runs on Node, the phone on Hermes, whose `Intl` has fewer parts than Node's: messageformat builds an `Intl.Locale` for every message, which passed every test and left every text of the app unformatted on a phone (2026-11-21). What a change or a library calls is checked against Hermes's `Intl` (ADR-0008), which `tests/hermes.ts` builds for a test, and ESLint refuses what Hermes lacks; the change is tried on a phone. When React Native or the polyfills move, Hermes's `lib/VM/JSLib/Intl.cpp` is read again at React Native's version, and `tests/hermes.ts` follows it.
- What a platform did before is read too, down to the app's lowest version: before Android 12, a Bluetooth scan finds nothing while Location is off (AOSP's `GattService`), which a phone on Android 17 never shows.
  - Another app's page, opened with `Linking.sendIntent`, is declared in a manifest's `<queries>`: React Native resolves the activity first, which from Android 11 sees only the apps declared. Its promise is caught, since a phone may have no such page.
- A library with a native module loads only where the module is. react-native-ble-manager's throws as it loads on the web, in Expo Go and in Jest: its adapter `require`s it once `TurboModuleRegistry.get` has found the module.
- Every route guard names where it leads (`redirectTo`): without one, Expo Router leads to the first open route in its own order, by name.
- A page that a link can open, as any route can, may have nothing behind it: after an action that leaves it, it goes back only when `router.canGoBack()`, and to the page above it otherwise: `goBack(above)` in `shared/navigation`. A bare `router.back()` left three pages stuck (2026-11-20).
- A screen a link opens signs the person in on that screen (`SignInScreen`'s `reason`), so that the link keeps its place: a guard would replace it.
- What people use has a label for screen readers, and enough contrast in the light and dark themes.
- A message that appears or changes, such as a failure or what a change did, is a `Notice`, which each platform's screen reader says. A role alone says nothing on iOS, and React Native's `Text` drops `aria-live` (only its `View` maps it). An Android live region speaks a change to a view already on the screen, not a view that arrives with its text; and a `View` with nothing but a live region is flattened away.
- What cannot be undone is a `danger` button, confirmed in the phone's own dialog (`Alert`) that says what goes.
- A change sent with its etag that the cloud refuses as stale (`Refused.stale`, `etag_mismatch`) keeps what the person typed, and says that someone changed it meanwhile. A component keyed by the ETag would forget both.
- Changes to one thing sent with its etag, such as a person's name and role, go one at a time: a second sent while the first is under way carries the same ETag, and is refused as stale, as if someone else had changed it.
- A choice the cloud makes, such as a role, shows the option chosen while the cloud is asked, then what the cloud has: after a refusal, never the option refused.
- A text has a key for each use: a state shown and a button to press are two keys (`setup.simulated.state.open`, `setup.simulated.open`), even where their English words are the same, as their translations need not be.
- A group of radio buttons is a `radiogroup` that is not an element of its own: an `accessible` container would hide its options from screen readers.

### Tests

- Each behaviour change has a test that would fail on the old code; check it is not vacuous (an exact float compare that never matches, a loop that never runs).
- A test of one rule isolates it. When two rules could refuse the same request, set them apart, or the test passes for the wrong reason: a fresh sign-in too old to be recent was also past its nonce's lifetime; bytes that are no UTF-8 sat outside a JSON string, which JSON refused first. A mutant of the rule shows it.
- What the build reads, `app.config.ts`, is tested through Expo's own reader (`getConfig`), as the build reads it: calling the function alone missed tables without a prototype, which broke the builds.
- Protocol exchanges are tested against ai-platform's examples, and against a simulated device.
- A fake keeps to its port's contract as the real adapter will: a fake link that skipped the listener of a link already ended hid a listener left installed. A rule that no session can reach today, such as a long message after the one that opens the channel, is tested on the unit that holds it, the `Conversation`.
- No fixed sleeps to wait for readiness: wait for the condition, with a timeout.
- A test of time grows its input, with a budget at each size. Jest cannot stop synchronous code at its timeout: code that took the square of the length would hang on a large input alone, where it fails at a small one among growing sizes.
- A time reads the same on every machine: the tests run in UTC (`jest.config.js`), and the simulated cloud takes a clock.
- Invisible characters in source, such as MF2's isolating marks (U+2066 to U+2069), are written as escapes, which a reviewer can see. Some editing tools write the character itself: check the file's bytes.
- TanStack Query shows a mutation's pending state a tick after `mutate`: a test waits for it (`waitFor`). To see a screen while the cloud is asked, a transport holds the request until the test lets it go.
- `jest.restoreAllMocks` restores spies only (jest-mock 30): the `jest.fn()`s of a `jest.mock` factory keep their calls from test to test, so a file that asserts a call did not happen clears them first (`jest.clearAllMocks`).
- React Native Testing Library 14 renders, fires events and unmounts asynchronously: a test awaits `unmount` and every `fireEvent`, or its `act` overlaps the next render, and the tests after it fail.
- A text with a value in it holds MF2's isolating marks: a test reads it with a normalizer that drops them, and names a button with them.
- A test file run alone, as a mutant's run does, runs in band, and Jest waits for any handle left open; pass `--forceExit` to a mutant's run, never to the suite.
- A timer left running keeps Jest's worker alive, and Jest kills it: "A worker process has failed to exit gracefully". TanStack Query's gc timers did, 5 minutes by default where it sees a window, as under jest-expo. `tests/setup.ts` gives every cache that `newQueryClient` makes a gcTime of Infinity, and a test that makes a `QueryClient` of its own does the same. Such a timer is found with Node's `async_hooks`: the `Timeout`s created and not destroyed once the file's tests end, with their stacks.
- An error that the runtime throws, such as `TextDecoder`'s with `fatal`, can be of another realm's class under Jest: `instanceof TypeError` was false there, and a header that was no UTF-8 failed the simulated cloud instead of being refused. Catch such a call alone, without testing the class, as `readMessage` does.
- What a screen reader hears is tested on each platform, with `jest.replaceProperty(Platform, 'OS', …)`, restored after each test (`jest.restoreAllMocks`). A test that renders again uses `rerender`, which keeps `renderScreen`'s providers.

### Types

- `Omit` on a type with an index signature, such as one generated from a schema that allows more properties, drops every named key: `Pick` the keys wanted.
- A rule across fields, such as a change that brings at least one field beside its etag (`dependentSchemas`), is not in the generated type, whose index signature takes anything: the client says it in a type of its own (`Changes`), and a test holds it with `@ts-expect-error`.
- A type named as one of TypeScript's own (`Awaited`, `Record`) hides it in its file.

### Repository rules (CONTRIBUTING.md, AGENTS.md)

- English everywhere; SPDX header on new source files; no personal or machine-specific values; no product name.
- Docs travel with the change: the README, ADRs (`Proposed` unless explicitly agreed), the dev log.
- `<type>(<scope>): <summary>`, one commit per pull request, `<type>/<short-description>` branch.

## 4. Confirm, then fix

For each suspicion, write the smallest script that shows it. Drop whatever does not reproduce. Fix what does in the pull request's single commit (`git commit --amend`, `git push --force-with-lease`), adding a test for it.

## 5. Report

When handing the change over, say in the conversation what the review found and how each item was fixed, or why it was left, and what was not checked. Keep it out of the commit message and the pull request description, which stay short (CONTRIBUTING.md).
