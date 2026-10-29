# 0002 — The architecture: modules with ports and adapters, as on the robot and in the cloud

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

- **The app's work** ([README](../../README.md)): set-up over Bluetooth LE, sign-in, homes, the devices' state, settings, control and notifications, for every kind of device. React Native with Expo, in TypeScript ([ADR-0001](0001-platforms-and-framework.md)).
- **The project's other repositories** are built the same way:
  - modules that talk through public interfaces;
  - ports for everything outside;
  - simulated adapters for tests and for running without hardware (ai-robot's architecture, [ai-cloud's ADR-0001](https://github.com/trungnguyen278/ai-cloud/blob/main/docs/decisions/0001-architecture.md)).
- **The app talks to things that are often missing:**
  - a device, which is far away, out of range, or not built yet;
  - a cloud that is down, or not built yet: ai-cloud has no sign-in or devices yet.
- **The contracts are ai-platform's**: set-up 2.0 now, the app ⇄ cloud protocol to come.
- **One developer**, who reads the code with AI assistants. A shape that stays the same across the repositories, and that CI checks, keeps the code findable.
- **The tools** (as of 2026-10-29):
  - Expo's documentation recommends Jest with `jest-expo`, and React Native Testing Library for components (`react-test-renderer` is deprecated), and names Maestro for end-to-end tests;
  - Expo Router derives the routes from files, types them, and makes every screen deep-linkable;
  - `expo-secure-store` keeps values in the Keystore and the Keychain;
  - the libraries below are maintained (latest releases, GitHub).

  | Library | For | Licence | Latest release |
  |---|---|---|---|
  | TanStack Query | The cache of the cloud's data | MIT | 2026-10-26 |
  | Zustand | A small shared store, where needed | MIT | 5.0.16, 2026-10-22 |
  | dependency-cruiser | Checking the boundaries in CI | MIT | 18.7.0, 2026-10-19 |
  | React Native Testing Library | Component tests | MIT | 14.1.0, 2026-10-08 |
  | Maestro | End-to-end flows | Apache-2.0 | CLI 2.12.0, 2026-10-26 |
  | Ajv | Checking messages against the JSON Schemas | MIT | 8.20.0, 2026-04-24 |

## Decision

1. **Modules with boundaries:** `setup`, `account`, `homes`, `devices`, `settings`, `control`, `notifications`, and `shared` beneath them.
   - Each module exports its interface from `index.ts`, and other modules import nothing else.
   - dependency-cruiser checks this in CI ([architecture](../architecture.md#modules)).
2. **Ports and adapters.** Every outside thing sits behind a port: the Bluetooth LE link, the cloud's API, secure storage, push and the camera. Each port has a real adapter and a simulated one.
   - The simulated device speaks the device's side of set-up 2.0.
   - The simulated cloud speaks the app ⇄ cloud protocol.
3. **ai-platform's contracts** are read from `platform/`.
   - The protocols' types are generated from their schemas.
   - Every message received is checked against its schema, with Ajv.
4. **Routes stay thin.** Expo Router's `app/` holds only routes, each rendering a module's screen.
5. **The cloud's data goes through one query cache** (TanStack Query), never copied into a store. A store (Zustand) holds only the app's own state that several modules share.
6. **Secrets go to secure storage** (`expo-secure-store`), and never into logs or reports.
7. **Tests, by layer:**
   - unit and component tests with Jest, `jest-expo` and React Native Testing Library;
   - protocol tests against ai-platform's examples;
   - end to end with the simulated device and cloud;
   - Maestro on an emulator and the simulator, once there are flows.
8. **Configuration:** required settings, one file for every build and one per environment (development and production), and a git-ignored file for one machine. The app holds no secret of the project's.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Folders by kind of code (`screens/`, `services/`, `store/`) | Simple at first. But each feature then touches every folder, and no boundary between features can be checked. The robot and the cloud are organized by module. |
| One global store (Redux) for everything, the cloud's data included | Data copied from the cloud into a store needs invalidation written by hand, and goes stale. A query cache does that, and is shared by every screen. |
| React Navigation, configured by hand | Expo's documentation names it as the alternative. Expo Router gives routes from files, typed links, and an address for every screen, which notifications and QR codes need. |
| Detox for end-to-end tests | It is maintained, but its last release was in 2026-05, and it is set up for each platform. Maestro drives the app from outside, with flows that serve both platforms, and Expo's documentation names it. |
| Types written by hand for the protocols' messages | They drift from ai-platform's schemas, against [design rule 1](../../CONTRIBUTING.md#design-rules). |
| No simulated device or cloud: test against the real ones | The robot is not always at hand, and the cloud has no sign-in or devices yet. Set-up could then not be built or tested now, nor run in CI. |

## Consequences

- Positive:
  - the same shape as the robot and the cloud, so one way to read all three repositories;
  - set-up can be built and tested end to end before a robot or a cloud can take part;
  - boundaries and contracts are checked by CI, not by memory.
- Negative / accepted trade-offs:
  - more structure than a small app needs at first;
  - generating types from the schemas is a build step to keep;
  - the simulated device and cloud are code to maintain alongside the real ones.
- Follow-up:
  - the app's skeleton, step by step: Expo, TypeScript, the module boundaries, linting, tests, configuration, and CI with Android's build and the iOS simulator's;
  - in ai-platform: the owners' sign-in, the app ⇄ cloud protocol, and the catalogs' format.

## References

Retrieved 2026-10-29:

- Expo: [Expo Router](https://docs.expo.dev/router/introduction/), [unit testing](https://docs.expo.dev/develop/unit-testing/), [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).
- The libraries on GitHub: [TanStack Query](https://github.com/TanStack/query), [Zustand](https://github.com/pmndrs/zustand), [dependency-cruiser](https://github.com/sverweij/dependency-cruiser), [React Native Testing Library](https://github.com/callstack/react-native-testing-library), [Maestro](https://github.com/mobile-dev-inc/Maestro), [Detox](https://github.com/wix/Detox), [Ajv](https://github.com/ajv-validator/ajv).
- [ai-cloud's architecture](https://github.com/trungnguyen278/ai-cloud/blob/main/docs/architecture.md), and the robot's [architecture](https://github.com/trungnguyen278/ai-robot/blob/main/docs/architecture.md).
