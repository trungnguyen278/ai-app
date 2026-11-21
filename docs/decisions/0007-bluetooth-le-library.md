# 0007 — The Bluetooth LE library: react-native-ble-manager, behind the radio port

- **Status:** Accepted (delegated to the developer, 2026-11-12)
- **Date:** 2026-11-21

## Context

- [ADR-0001](0001-platforms-and-framework.md)'s decision 5 left the Bluetooth LE library to set-up's code, chosen among those still maintained then, and added through a config plugin.
- Set-up's protocol ([The Bluetooth service](https://github.com/trungnguyen278/ai-platform/blob/main/protocols/setup/README.md)) asks little of the phone's central: a scan for one service, a connection, Answer's indications turned on before the first write, and writes with a response of at most the ATT MTU less 3 bytes, one at a time. No pairing, no notification, no write without a response.
- React Native 0.82 and later run the new architecture only. A library that is a legacy module runs through its interop layer, which React Native keeps "for the foreseeable future", with no date (React Native's 0.82 post).
- Three libraries were maintained on 2026-11-12, all Apache-2.0 or MIT, all with an Expo plugin: react-native-ble-manager, react-native-ble-plx and react-native-ble-nitro. None has a test double, and none runs on the web or in Expo Go.
- The app runs from Android 7 (API 24). Before Android 12, the Bluetooth stack drops every result of an app's scan while the phone's Location setting is off (AOSP, `packages/apps/Bluetooth`, `GattService.hasScanResultPermission`, in `android11-release` and `pie-release`). React Native, Expo's modules installed and the library do not read that setting.

## Decision

react-native-ble-manager (13.0.1), behind set-up's radio port ([ADR-0002](0002-architecture.md)): a `Central` of the few operations set-up uses (`src/setup/adapters/bluetooth/central.ts`), the library's adapter (`phone.ts`), loaded only where its native module is, and the radio over any `Central` (`radio.ts`). Its config plugin declares the permissions, with `neverForLocation`, and the iPhone's reason, from the catalogs.

Two things the library does not do are the app's own:

- **A timer on each write,** `[setup].write_timeout`, after which the radio ends the link: the library never settles an Android write that the device refused for its authentication.
- **Android's Location setting, read before Android 12,** by a local Expo module of the app's own, `modules/location-setting`: one Kotlin function, which reads the setting as the stack does. While it is off, set-up says so and opens Android's location settings, as Nordic's scanner does (`Android-Common-Libraries`, `scanner-ble`, `ScanEmptyView`). The module's manifest declares that page in `<queries>`, since React Native's `Linking.sendIntent` resolves it first, which from Android 11 sees only the apps declared or those the phone shows to all; a phone without the page leaves the notice alone, as Android's reference of the action asks.

## Alternatives considered

| Alternative | Why not |
|---|---|
| react-native-ble-plx 3.5 | A legacy module, through the interop layer; an open crash on iOS under the new architecture (#1278); no commit since 2026-03-09; its compatibility table stops at Expo 51. |
| react-native-ble-nitro 1.16 | A year old, with one maintainer; a synchronous MTU on Android, whose request is asynchronous. A candidate to watch. |
| A native module of the app's own | Two platforms' code to write and keep, for operations the library already has on both. |
| The library called from the flow | The tests need a radio without a phone: ADR-0002 puts each port's real adapter beside a simulated one, as LedgerHQ's device SDK and MentraOS do with their Bluetooth libraries. |
| expo-location, for the Location setting (`hasServicesEnabledAsync`) | Its manifest declares the location's permissions on every Android, where the app asks for them up to Android 11 only and declares Bluetooth's as never used for the location. |
| react-native-device-info, for the Location setting (`isLocationEnabled`) | A library of the whole device's facts, kept up to date for one of them. |
| No Location check: "no device" alone | A person on Android 11 or older with Location off would be told that no device is near, and would look for the fault in the device. |

## Consequences

- Positive:
  - A TurboModule, on the new architecture.
  - Each platform's own size of a write: Android asks for the MTU and gets the one agreed, 517 on an Android 17 phone (developer.android.com, Android 14's behaviour changes); an iPhone says the length of a write without a response, by name (`maximumWriteValueLength`).
  - `startNotification` settles once the device has confirmed the descriptor's write, so the first write follows the indications, as the protocol asks: seen on a phone on 2026-11-21 (dev log).
- Negative / accepted trade-offs:
  - Not in Expo Go: set-up runs in a development build or a store build, and Expo Go and the web get a radio that says set-up is not supported there.
  - Its plugin declares `BLUETOOTH` and `BLUETOOTH_ADMIN` on every Android, where its own manifest limits them to Android 11: install-time permissions that ask nothing.
  - It never settles an Android write that the device refused for its authentication, status 5 or 137 (`Peripheral.java`, `onCharacteristicWrite`: no callback, and its queue stays busy), where Android passes the status to the app. The radio's `write_timeout` ends the link, and the library's `disconnect` fails the callbacks waiting and empties its queue. Reported upstream as [innoveit/react-native-ble-manager#1463](https://github.com/innoveit/react-native-ble-manager/issues/1463), opened 2026-11-21.
  - Native code of the app's own, one function for Android, which only a development or store build carries.
  - No test double: the tests stand in for the part of it the adapter uses.
- Follow-up: try set-up on an iPhone, once there is one to test on (ADR-0001).

## References

- The research of 2026-11-12: the three libraries' npm entries, repositories, plugins and issues; LedgerHQ's `device-sdk-ts` (`packages/transport/rn-ble`) and MentraOS, read 2026-11-12.
- react-native-ble-manager 13.0.1: `src/index.ts`, `android/src/main/java/it/innove/Peripheral.java`, `ios/SwiftBleManager.swift`, `plugin/build/`, read 2026-11-21.
- Android: [Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions), [Android 14's behaviour changes](https://developer.android.com/about/versions/14/behavior-changes-all), `ScanSettings`, `Settings.ACTION_LOCATION_SOURCE_SETTINGS`, [package visibility](https://developer.android.com/training/package-visibility/declaring), and the Bluetooth stack's `system/stack/gatt/gatt_utils.cc` (`gatt_rsp_timeout`), read 2026-11-21.
- AOSP `packages/apps/Bluetooth`: `src/com/android/bluetooth/gatt/GattService.java` and `Utils.java` (`blockedByLocationOff`) in `android11-release`, and `GattService.java` with `res/values/config.xml` (`strict_location_check`) in `pie-release`, read 2026-11-21.
- Nordic Semiconductor's `Android-Common-Libraries`: `permissions-ble` (`RequireLocation.kt`) and `scanner-ble` (`ScanEmptyView.kt`), read 2026-11-21.
- Expo's local module template, `packages/expo-module-template`, and `expo-modules-autolinking` 58 (`nativeModulesDir`, `./modules` by default), read 2026-11-21. expo-location's `AndroidManifest.xml` and react-native-device-info's README, read 2026-11-21.
- Apple: `CBCharacteristicWriteType` and `CBPeripheral.maximumWriteValueLength(for:)`, read 2026-11-21.
