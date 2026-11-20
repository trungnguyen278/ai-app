# Architecture

> **Status:** accepted in [ADR-0002](decisions/0002-architecture.md) (the shape), on [ADR-0001](decisions/0001-platforms-and-framework.md) (the framework). Its skeleton is built: the routes, the catalogs and the foundation of the design system in `shared`, and the `studio`. So are the client of the app API, a home's devices included, with its simulated cloud, in `shared/cloud`; the cloud's cache, in `shared/queries`; `account`: signing in with the development provider, the session, and the person's account; and the first of `homes`: the main screen, which is one home and its people; creating a home; inviting people with a link or its QR code, and the invitations not yet used; adding profiles; joining a home from a link, a pasted one, or a QR code read with `shared/scanner`; and each person's page, to rename them, make them an admin or a member, or remove them, or to leave; and the first of `devices`: a home's devices on its screen, online or not, and each device's page, to rename it or remove it from the home.

The app is how an owner reaches their devices and their home. It sets a device up, signs in to ai-cloud, manages homes and their people, changes settings and controls devices. One person builds it, for Android first and iOS from the same code (ADR-0001), and it serves every kind of device the project makes.

## Principles

1. **Modules with boundaries, in one codebase**, as in ai-cloud. Each module owns its screens, its rules and its state, and offers a public API. No module reaches into another's internals, and CI checks it.
2. **Ports and adapters, as on the robot and in the cloud.** Everything outside the app sits behind a port: a device over Bluetooth LE, ai-cloud, the phone's secure storage, its notifications, its camera. Simulated adapters serve tests, and running without a device or a cloud.
3. **Contracts come from ai-platform**, pinned at `platform/`: set-up, and the app API.
   - Types are generated from the schemas, never written by hand ([ADR-0004](decisions/0004-talking-to-the-cloud.md)).
   - Every message received is checked against its schema (SEC-14).
4. **A device is the authority on itself.** The app shows and drives what a device declares, within its owner's safety classes (SEC-8, SEC-9). It never assumes one kind of device.
5. **Secrets stay in the phone's secure storage:** the Keystore on Android, the Keychain on iOS. They are never in logs, error reports or analytics, and logs carry no content.
6. **Every text comes from a catalog**, in the owner's language (ai-platform ADR-0002). Layouts hold longer translations and larger text.
7. **Unreachable is a normal state.** A device out of range, a cloud that does not answer, a phone offline: each screen says what it can and cannot do then.

## The big picture

```
                 ┌──────────────── ai-app ────────────────┐
 device ◀──BLE──▶│ setup, and what the cloud may not set   │
                 │ account · homes · devices · settings    │──HTTPS──▶ ai-cloud ──control channel──▶ device
                 │ control · notifications                 │◀──push─── ai-cloud
                 └─────────────────────────────────────────┘
```

- **Near a device, over Bluetooth LE:** set-up (set-up 2.2). Later, what must not go through the cloud, such as the classes of capabilities the cloud may use (SEC-9).
- **Through ai-cloud, everything else:**
  - sign-in, homes and the devices' state;
  - the settings the cloud may change;
  - control, for which the cloud calls the device on its control channel;
  - notifications.

## Modules

| Module | Owns |
|---|---|
| `setup` | Finding a device in set-up, its code (from a QR code or typed), the SPAKE2+ session, the Wi-Fi network and first settings, and relaying the registration (set-up 2.2) |
| `account` | Signing in to ai-cloud, the session, the owner's profile |
| `homes` | Homes, their members and profiles, invitations ([ai-platform ADR-0005](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0005-homes.md)) |
| `devices` | A home's devices: their kind, model, state, health and updates, and what each declares |
| `settings` | A device's settings: through the cloud, or near the device for those the cloud cannot change |
| `control` | Driving a device's capabilities, within their safety classes |
| `notifications` | Registering the phone for push, and showing what the cloud sends |
| `studio` | The design system, a page for each of its parts, in both themes: in the development app only ([ADR-0003](decisions/0003-interface-and-motion.md)) |
| `shared` | Configuration, catalogs, the protocols' schemas read from `platform/`, errors, logs, the [design system](design.md), reading QR codes with the camera (`scanner`), for `homes` and `setup`, and going back from a page that a link may have opened, with nothing behind it (`navigation`) |

Each module has the same shape:

```
src/<module>/
├── index.ts      what other modules may import: the only import they may make
├── domain/       its rules and types, without I/O
├── ports/        what it needs from outside
├── adapters/     the ports' implementations: real ones, and simulated ones
├── services/     its use cases, joining the domain and the ports
└── screens/      its screens and their components
```

`app/`, Expo Router's directory, holds only routes: each route renders a module's screen. Every screen then has an address, so a notification or a QR code can open it.

## How modules talk

- **Through each other's `index.ts`**, and nothing else.
- **What ai-cloud holds** goes through one query cache (TanStack Query). Screens share it, and it knows when to fetch again; no module keeps a copy of its own.
- **A screen of one module that shows another's part** takes it as a slot that its route fills: the home's screen, in `homes`, shows its devices, from `devices`, which reads `homes` for the home and the person's role. Importing back would be a cycle, which the boundaries refuse.
- **State that is the app's own** stays in the module that owns it, or in a small store when several modules need it.
- **A device's session**, over Bluetooth LE, belongs to the module that opened it, and ends with the screen that needs it.

## Set-up, end to end

1. The owner or an admin taps "Add a device" on the home (`/homes/[id]/devices/new`), reads why Bluetooth is needed, and allows it.
2. They scan the device's QR code, or type its code. `setup` scans for the set-up service, and keeps the device whose discriminator matches; a typed code, with several devices in set-up, asks for the discriminator first, so that no code is tried on another device.
3. The session: the hellos, then SPAKE2+ with the code. Every message after that is encrypted.
4. The Wi-Fi network, from the device's own scan, unless it reaches the Internet already; then the home's languages and its time zone.
5. `setup` asks ai-cloud for a challenge for the home. The device signs its registration with it, and the app relays the registration to ai-cloud, with the device's name.
6. The device is bound once ai-cloud accepts its first assertion. The app asks for its name in the home, then says it is ready once the cloud sees it online, and opens its page.

A device that is bound already, in one of the person's homes, is given its new network and nothing else, then `finish`. One in no home of theirs is taken. After an interruption, the app looks the device up in the home by its identifier, and otherwise starts again from the code the device shows then (set-up 2.2, How the app runs it).

Steps 5 and 6 need the owner's sign-in and the app ⇄ cloud protocol, which ai-platform decides. `shared/cloud` speaks the app's part of step 5 (the app API's Devices): `createDeviceChallenge`, then `registerDevice`, with an Idempotency-Key, which tells a device new to the home from one the home held already, such as a device that lost what it kept.

### The session, in `setup`

- **`domain/`**: set-up 2.2 itself, without I/O: the fragments, never more than 512 bytes (`fragments.ts`), SPAKE2+ (`spake2plus.ts`), the context, the session keys and AES-GCM (`channel.ts`), the messages, read as JSON that every side can hold (`shared/protocols`' `readJson`, ai-platform ADR-0014) and checked against the schema (`messages.ts`), the set-up string and the typed code (`code.ts`), and what a session can end in (`errors.ts`). The cryptography is noble's ([ADR-0006](decisions/0006-set-up-cryptography.md)).
- **`ports/link.ts`**: what set-up needs of the radio, a link to one device's set-up service, its indications enabled: write a fragment, hear the device's, close.
- **`ports/radio.ts`**: the phone's radio: whether Bluetooth may be used (`ready`, `ask`, `blocked`, `off`, `unsupported`), asking for it, and the devices that advertise the set-up service, each a `Link` to connect. `adapters/connect.ts`' `radioFor` gives the one `[setup].radio` names: the simulated radio, or the phone's Bluetooth LE, or `NoRadio`, which says set-up is not supported, in an app without Bluetooth: the web's, Expo Go's.
- **`services/session.ts`**: the app's side. `greet` says hello and gives the device's discriminator; `exchange` runs SPAKE2+ with the code, then `info`; `Session` sends the requests, encrypted, one at a time.
  - Every message the device sends is checked: its fragments, its JSON, its schema, its `seq` and `reply_to`, its encryption. Anything else ends the session (`SessionLost`, `broken`), as does a link that ends (`ended`) or no answer within `[setup].answer_timeout` (`timeout`).
  - A device's error comes as `DeviceRefused`, with its code, and leaves the session open; a wrong confirmation of the device's, as `NotConfirmed`.
  - The app ends a session by disconnecting: it sends no error of its own.
- **`services/flow.ts`**: `SetupFlow`, the steps a person goes through, as a store that the screens read (`subscribe` and `current`): finding the device, the exchange, the network, the settings, the registration and `finish`, and each failure the screens name. It sends no `configure` and no `register` to a bound device, and drops the session once it ends. Closed while it waits, it lets go of whatever it got meanwhile. It tells the cloud's failures from the device's by where they come from: each request to the cloud is wrapped, and only those leave the device's session open.
- **`screens/`**: `SetupScreen` and its steps; `RadioProvider`, which the app's root fills with `radioFor`'s radio; and `SimulatedDevicesScreen`, the studio's page of the simulated devices' screens, their codes and QR codes.
- **`adapters/bluetooth/`**: the phone's radio, Bluetooth LE ([ADR-0001](decisions/0001-platforms-and-framework.md)). `radio.ts`' `BluetoothRadio` scans for the set-up service, connects, learns the size of a write and turns on Answer's indications before the first write, all within `[setup].connect_timeout`, else lets the device go; its link writes one fragment per write with a response, ends when the device disconnects, and ends a write that the device does not confirm within `[setup].write_timeout`. It speaks to a `Central` (`central.ts`), the few GATT operations set-up uses. `phone.ts`' `PhoneCentral` is react-native-ble-manager's, loaded only where its native module is: Android's runtime permissions, the MTU that Android asks for, and on an iPhone the length of a write without a response. Before Android 12 it reads the Location setting too, through the app's own Expo module `modules/location-setting`, since a scan finds nothing while Location is off ([ADR-0007](decisions/0007-bluetooth-le-library.md)).
- **`adapters/simulated/device.ts`**: a device in set-up, in memory, as the robot runs it: its code and discriminator, drawn again after a failed attempt; one session at a time; its networks, settings and key; and every error the protocol names. Its set-up opens and closes as the robot's does, and once registered it reaches the simulated cloud, if that is the server its registration names. `adapters/simulated/radio.ts` hears those that advertise.

## Security and privacy

- **The owner's session** lives in secure storage: its refresh token, under a name of the cloud's own; its access token only in memory.
  - Only while the phone is unlocked, and never restored to another phone (iOS's `WHEN_UNLOCKED_THIS_DEVICE_ONLY`); Android's Keystore keeps it out of backups.
  - Android loses it when the app is uninstalled, and the owner then signs in again.
  - A read guarded by biometrics blocks the interface, so none happens on the path that starts the app.
  - On the simulated cloud, which forgets its sessions when the app stops, the session is kept in memory too.
- **TLS on every connection to the cloud** (SEC-1). Plain HTTP only to a development cloud on the developer's own machine.
- **Permissions** (Bluetooth, the camera, notifications) are asked for when first needed, with the reason in the owner's language.
- **Logs and error reports** carry no secrets and no content: no codes, tokens, Wi-Fi passwords or conversations.

## Testing

- **Unit and component tests:** Jest, with Expo's `jest-expo` preset, and React Native Testing Library.
- **Protocols:** set-up's exchange is replayed from ai-platform's examples, byte for byte.
- **A simulated device:** the device's side of set-up 2.2, as the robot speaks it (ai-robot's `modules/setup.py` and `core/setup_session.py`), in TypeScript, behind the Bluetooth LE port. Set-up then runs end to end in tests, and on a phone with no robot nearby.
- **A simulated cloud:** the app API in memory, behind the transport of `shared/cloud`. ai-platform's examples are replayed against it, as against ai-cloud.
  - It verifies a device's registration as ai-cloud does, and the tests' robot (`tests/shared/cloud/robot.ts`) signs registrations with a key of its own.
  - It plays what the app sees of a device's own side: a device opens its control channel with the key it registered and says what it is (`connectDevice`), or stops (`disconnectDevice`).
- **End to end:** Maestro, on an Android emulator and the iOS simulator, once the first flows exist.
- **Boundaries:** dependency-cruiser in CI, as import-linter does in ai-cloud.

## Configuration

- **What someone may tune** (a timeout, a retry, a limit, a colour) is in the app's configuration, required and commented. It comes as one file for every build, then a file for each environment: development, with the simulated device and cloud, and production.
- **What belongs to one machine,** such as the address of a developer's own cloud, goes in `config/local.toml`, which git ignores; a cloud's address may come from the environment instead (`AI_APP_CLOUD_ADDRESS`). Without one, the app runs on the simulated cloud.
- **The app holds no secret of the project's:** the cloud keeps the providers' keys.
- **The name people see** comes from one setting.

## Builds and releases

- **Expo generates** the Android and iOS projects from the configuration (ADR-0001).
- **Android** is built on Windows, and in CI.
- **iOS** is built for the simulator in CI, from the first code.
- **Releases:** Android first, to the owner's phone, then to other people's phones (ADR-0001). iOS comes when an owner needs it.

## Repository layout

```
ai-app/
├── platform/        ai-platform, pinned
├── app/             routes (Expo Router), each rendering a module's screen
├── src/
│   ├── shared/
│   ├── setup/  account/  homes/  devices/
│   └── settings/  control/  notifications/
├── modules/         the app's own native modules (Expo's local modules)
├── config/          the app's settings, per environment
├── assets/          icons, fonts and images
├── tests/           per module, and end to end against a simulated device and cloud
└── docs/
```

## Decisions

| ADR | Decides |
|---|---|
| [0001](decisions/0001-platforms-and-framework.md) | The platforms and the framework: React Native with Expo, Android first |
| [0002](decisions/0002-architecture.md) | This architecture |
| [0003](decisions/0003-interface-and-motion.md) | The interface: the robot's visual language, in motion |
| [0004](decisions/0004-talking-to-the-cloud.md) | Talking to ai-cloud: types and checks made from the protocol, one client, a session in secure storage |
| [0005](decisions/0005-checks-for-every-definition.md) | The app API's checks: one for every definition |
| [0006](decisions/0006-set-up-cryptography.md) | Set-up's cryptography: noble's libraries, in JavaScript, and the phone's randomness |
| [ai-platform 0007](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0007-catalogs.md) | The catalogs: Unicode MessageFormat 2, one JSON file per language |
| [ai-platform 0008](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0008-sign-in.md), [0009](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0009-people-in-a-home.md) | The owners' sign-in, and the people in a home, which the app API carries ([`platform/protocols/app/`](https://github.com/trungnguyen278/ai-platform/blob/main/protocols/app/README.md)) |
