# 0001 — Platforms and framework: React Native with Expo, Android first

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

- **What the app must do** ([README](../../README.md)): set-up, sign-in, homes, settings, control and notifications, in the owner's language, for every kind of device.
- **What set-up 2.0 asks of it** (`platform/protocols/setup/README.md`):
  - Bluetooth LE as a central: it scans for the set-up service, connects to each device in set-up until a discriminator matches, writes with a response, and takes indications, in fragments sized by the ATT MTU;
  - the device's code, read from a QR code with the camera or typed;
  - SPAKE2+ ([RFC 9383](https://www.rfc-editor.org/rfc/rfc9383)) on P-256, as the Prover. It needs arithmetic on elliptic-curve points, not just ECDH. It also needs scrypt with N = 32768, r = 8 and p = 1 (32 MiB), HKDF-SHA256, HMAC-SHA256 and AES-128-GCM.
- **Why set-up keeps Bluetooth LE, when the robot has a screen** (asked again on 2026-10-29):
  - the face's screen and its touch layer are the parts of a mobile robot most likely to break, and the robot has no camera;
  - over Bluetooth LE, the phone becomes the robot's screen and keyboard. Set-up, and joining a new Wi-Fi network, still work when the touch layer fails;
  - Google's Nest Hub has a screen, and still sets up through the Google Home app.
  - The robot's side, so that set-up survives a dead screen too (the code spoken or printed, a set-up button), is ai-robot's to decide.
- **Who uses it.** The cloud is built for its maker first, then for others ([ai-cloud's phases](https://github.com/trungnguyen278/ai-cloud/blob/main/docs/architecture.md#phases)). The maker has an Android phone and a Windows PC, and no Mac (2026-10-29). Later owners will have iPhones as well.
- **Who builds it.** One developer, with AI assistants. The project's other code is Python (the robot's software, the cloud) and JavaScript (the robot's screen renderer).
- **iOS needs Apple's tools.**
  - Xcode 27 installs on macOS Tahoe 26.6 or later only.
  - A free Apple Account runs one's own apps on up to 3 devices, with profiles that expire after 7 days.
  - TestFlight and the App Store need the Apple Developer Program, at 99 USD a year.
- **Android verifies developers.** From 2026-09-30, certified devices in Indonesia, Singapore and Thailand install only apps from verified developers, and everywhere in 2027.
  - Developers can still install their own builds over ADB.
  - A free account distributes to up to 20 devices without a government ID.
- **The libraries set-up needs**, by framework (GitHub, 2026-10-29):

  | Framework | Bluetooth LE | Cryptography for SPAKE2+ |
  |---|---|---|
  | React Native | react-native-ble-manager: Apache-2.0, released 2026-10-20. react-native-ble-plx: Apache-2.0, released 2026-02-18. | noble's curves, hashes and ciphers: MIT, audited by Cure53 (2022), released 2026-08-27. They cover points on P-256, scrypt, HKDF, HMAC and AES-GCM. react-native-quick-crypto: scrypt, HKDF, HMAC and ciphers in native code, released 2026-10-26. |
  | Flutter | flutter_blue_plus: a paid licence for for-profit use. flutter_reactive_ble: last release 2025-02-07. universal_ble: BSD-3-Clause, 171 stars. | pointycastle: points, scrypt, HKDF and GCM, but last changed 2025-03-08. |
  | Kotlin Multiplatform | Kable: Apache-2.0, released 2026-09-15. Nordic's Kotlin-BLE-Library 2.0: BSD-3-Clause, in beta. | cryptography-kotlin: Apache-2.0, with ECDH, AES-GCM, HKDF and scrypt, but no arithmetic on points. Bouncy Castle has it, on the JVM only, so on Android only. |

## Decision

1. **React Native, in TypeScript, with Expo** (Expo SDK 58 and React Native 0.88, as of 2026-10). Expo generates the Android and iOS projects from the app's configuration and its config plugins (Continuous Native Generation). The projects are neither kept by hand nor committed.
2. **Android first.** The app is built and run on Windows, and installed on the maker's phone over ADB. Other people's phones get it through the free limited-distribution account, or a store when the app is ready.
3. **iOS from the same code, released when an owner needs it, and planned for from the start:**
   - CI builds the app for iOS from its first code, for the simulator, which needs no Apple account. That build runs on GitHub Actions' macOS runners, or on Expo's EAS Build, so that the code never drifts into working on Android alone;
   - every library with native code supports both platforms;
   - iOS's rules go into the decisions they shape. App Store guideline 4.8, for one, applies to sign-in: an app whose accounts use a third-party login, such as Google's, must offer an equivalent private option too, such as Sign in with Apple, unless it uses its own accounts only;
   - no Mac is needed. An iPhone and Apple's program are needed to test the app on a phone and to distribute it, when an owner needs iOS.
4. **Set-up's cryptography comes from noble**: audited, and the same code on every platform. scrypt comes from native code if noble's is too slow on a phone, as measured when set-up is built.
5. **The Bluetooth LE library is chosen with set-up's code**, among those still maintained then, and is added through a config plugin.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Flutter | Its toolkit for the interface is mature, but set-up's libraries are weak. flutter_blue_plus needs a paid licence for for-profit use, and flutter_reactive_ble's last release was in 2025-02. pointycastle, the Dart library with arithmetic on points, has not changed since 2025-03. iOS still needs macOS to build. |
| Kotlin Multiplatform, with Compose Multiplatform | Kotlin is Android's own language, and Kable covers Bluetooth LE on both platforms. But cryptography-kotlin does no arithmetic on points, which SPAKE2+ needs, and Bouncy Castle runs on Android only. So iOS would need set-up's cryptography written a second time. iOS needs macOS to build. |
| Native: Kotlin for Android, Swift for iOS | Two apps to write and keep, for one developer, and set-up written twice. |
| A web app | Web Bluetooth is in neither Safari on iOS nor Firefox (caniuse, 2026-10), so an iPhone would lose the set-up path that survives a broken screen. |
| No Bluetooth: set-up on the robot's screen, then a code approved on the phone ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)) | The phone would need only a browser. But set-up, and joining a new Wi-Fi network, would fail with the screen or its touch layer, and the robot has no camera to read a code instead. A code approved on the phone can also be sent by a stranger to an owner, who then binds the stranger's device (RFC 8628, §5.4); Bluetooth's range closes that. |

## Consequences

- Positive:
  - one codebase for both platforms, in TypeScript;
  - JavaScript is already the language of the robot's screen renderer;
  - set-up's cryptography comes from an audited library;
  - iOS can come without a Mac;
  - Expo's modules cover the camera, secure storage, notifications and localization;
  - LiveKit has a React Native SDK (`@livekit/react-native` 3.1.0, 2026-10-17), should the app join a device's conversation one day.
- Negative / accepted trade-offs:
  - React Native and Expo move fast, so upgrades to each new Expo SDK are regular work;
  - React Native's Bluetooth LE libraries are community projects: one of them is chosen with set-up's code, with a simulated device in its tests;
  - scrypt in JavaScript may be slow on a phone, and native code would then replace it;
  - an iPhone and Apple's program are needed before iOS can be tested on a phone;
  - the macOS runners are free only while the repository is public. On GitHub Free, a private repository's 12 USD of included compute a month buys about 190 macOS minutes.
- Follow-up:
  - the app's skeleton: Expo, TypeScript, linting, tests, and CI on GitHub Actions, with the iOS simulator's build;
  - the catalogs' format, with ai-platform (its ADR-0002 leaves it open);
  - sign-in, and the app ⇄ cloud protocol, in ai-platform, with App Store guideline 4.8 in mind;
  - set-up 2.0, against a simulated device and then the robot;
  - in ai-robot, set-up without the screen.

## References

Retrieved 2026-10-29:

- Set-up 2.0: `platform/protocols/setup/README.md`.
- The libraries' repositories on GitHub, for licences, stars and releases: [react-native-ble-manager](https://github.com/innoveit/react-native-ble-manager), [react-native-ble-plx](https://github.com/dotintent/react-native-ble-plx), [noble-curves](https://github.com/paulmillr/noble-curves), [noble-hashes](https://github.com/paulmillr/noble-hashes) (its audit and scrypt), [noble-ciphers](https://github.com/paulmillr/noble-ciphers), [react-native-quick-crypto](https://github.com/margelo/react-native-quick-crypto) ([implementation coverage](https://github.com/margelo/react-native-quick-crypto/blob/main/.docs/implementation-coverage.md)), [flutter_blue_plus](https://pub.dev/documentation/flutter_blue_plus/latest/) (its licence), [flutter_reactive_ble](https://github.com/PhilipsHue/flutter_reactive_ble), [universal_ble](https://github.com/Navideck/universal_ble), [pointycastle](https://github.com/bcgit/pc-dart), [Kable](https://github.com/JuulLabs/kable), [Nordic's Kotlin-BLE-Library](https://github.com/nordicsemi/Kotlin-BLE-Library), [cryptography-kotlin](https://github.com/whyoleg/cryptography-kotlin), [@livekit/react-native](https://github.com/livekit/client-sdk-react-native).
- Versions: [React Native](https://github.com/facebook/react-native/releases) 0.88.1 (2026-10-27), [Expo](https://github.com/expo/expo) SDK 58, [Flutter](https://docs.flutter.dev/release/archive) 3.47.8 (2026-10-23), [Compose Multiplatform](https://github.com/JetBrains/compose-multiplatform/releases) 1.12.2 (2026-10-15).
- Expo: [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/), [pricing](https://expo.dev/pricing) (the free plan's builds), [builds for the iOS simulator](https://docs.expo.dev/build-reference/simulators/) (no Apple account).
- [GitHub Actions' billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): standard runners are free in public repositories; a private one on GitHub Free has 12 USD of compute a month, and macOS costs 0.062 USD a minute.
- Apple: [memberships compared](https://developer.apple.com/support/compare-memberships/), [enrolment](https://developer.apple.com/programs/enroll/) (99 USD a year), [Xcode's system requirements](https://developer.apple.com/xcode/system-requirements/), [App Store Review Guidelines, 4.8 Login Services](https://developer.apple.com/app-store/review/guidelines/#login-services).
- [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628#section-5.4), §5.4: remote phishing with the device authorization grant.
- Setting up a Nest Hub with the Google Home app: [Tech Advisor](https://www.techadvisor.com/article/732780/how-to-set-up-google-nest-hub.html).
- Google: [Android developer verification](https://support.google.com/android-developer-console/answer/16561738).
- [caniuse: Web Bluetooth](https://caniuse.com/web-bluetooth).
