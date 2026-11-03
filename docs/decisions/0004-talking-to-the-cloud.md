# 0004 — Talking to ai-cloud: types and checks made from the protocol, one client, a session in secure storage

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

- **[ADR-0002](0002-architecture.md) sets the shape:**
  - the contracts come from ai-platform, pinned at `platform/`;
  - types are generated from the schemas, never written by hand, and every message received is checked against its schema (SEC-14);
  - what ai-cloud holds goes through one query cache, TanStack Query;
  - secrets stay in the phone's secure storage;
  - simulated adapters serve tests, and running without a cloud.
- **The app API 1.2** (ai-platform's `protocols/app/`) signs people in, and keeps their account and their homes. Its schema is JSON Schema 2020-12, with patterns that every engine reads alike (ai-platform ADR-0010).
- **The app runs on Hermes.** Its documentation lists what it leaves out, and does not promise the Function constructor. Ajv, which already checks the app's configuration, compiles each schema into a function with that constructor while the app runs. Its standalone mode writes the same code beforehand instead, "to avoid dynamic code evaluation with Function constructor".
- **The candidates,** on npm on 2026-11-04, all MIT:

  | Need | Library | Version |
  |---|---|---|
  | Types from JSON Schema | json-schema-to-typescript | 16.0.0 (2026-08-28) |
  | Checks | Ajv, in standalone mode | 8.20.0 (2026-04-24) |
  | The query cache | @tanstack/react-query | 5.105.3 (2026-11-02) |
  | Secure storage | expo-secure-store | 58.0.2 (2026-10-01): encrypted with the Keystore on Android, the Keychain on iOS |
  | Random identifiers | expo-crypto | 58.0.7 (2026-10-16): `randomUUID`, version 4, from a cryptographic source |

## Decision

1. **Types and checks are made from the pinned schema** by `npm run protocols`, into `src/shared/protocols/generated/`, and committed, so that a review sees what a new pin changes. CI makes them again, and fails on any difference.
   - **Types:** json-schema-to-typescript, for every definition.
   - **Checks:** Ajv's standalone code, for each body that the schema's `from_cloud` tells apart. Nothing is compiled while the app runs.
   - **A refused body** is described by where it breaks, and which rule: never by its value, which may be a token or a person's name.
2. **One client speaks the app API,** in `shared/cloud`, over `fetch`:
   - it adds the access token, refreshes once on `401`, and turns Problem Details into errors that carry their `type`;
   - it makes each `Idempotency-Key` with expo-crypto's `randomUUID`, and keeps it for every retry of one request;
   - it sends `If-Match` with the ETag it read, and walks pages by their tokens.
3. **Its transport is a port:** `fetch`, to a cloud, or a **simulated cloud**, the app API in memory, in TypeScript. The development app runs on it with no cloud, and the tests run on it end to end. ai-platform's examples are replayed against it, as they are against ai-cloud, so that it keeps to the protocol.
4. **The session belongs to `account`:**
   - the refresh token is in expo-secure-store, and the access token in memory only;
   - one refresh at a time, whoever asks for it; `invalid_grant` ends the session, and the person signs in again;
   - the providers are a port. The development cloud's provider comes first. Google, through Android's Credential Manager, and Apple come with the project's client IDs, and their libraries are chosen then.
5. **TanStack Query holds what the cloud answers,** with keys by resource. A change invalidates what it touched.
6. **The cloud a build talks to is a setting.** Every build runs on the simulated cloud unless its machine names one: a developer's own cloud, or a release's, in `config/local.toml` or the build's environment, never committed.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Ajv compiling the schema while the app runs | It needs the Function constructor, which Hermes does not promise, and it compiles at every start. |
| Types written by hand | ADR-0002 rules them out: they would drift from the protocol. |
| Types inferred by TypeScript from the schema (json-schema-to-ts) | It needs the schema as a TypeScript constant, not as the JSON that ai-platform publishes. |
| An OpenAPI generator | The protocol is JSON Schema and a README, not OpenAPI. |
| A simulated cloud at each module's port | Each module would fake its own part, and the client's code would go untested. |
| The access token in secure storage too | It lasts minutes (`access_lifetime`). In memory, nothing durable holds it, and a start refreshes it. |

## Consequences

- Positive:
  - a new pin shows, in the diff of the generated files, exactly what the protocol changed;
  - a body the cloud sends that breaks the protocol fails where it arrives, and what is logged holds no value;
  - every screen runs with no cloud, in tests and in the development app.
- Negative / accepted trade-offs:
  - the checks add about 107 KB of code to the bundle, before minification;
  - the simulated cloud must follow the protocol: when it changes, the simulation changes with it, and the examples tell when it does not;
  - on Android the session goes when the app is uninstalled (expo-secure-store), and the person signs in again. On iOS it may outlive a reinstall.
- Follow-up:
  - `shared/cloud`, the simulated cloud and `account`, with the development provider;
  - `homes`, on the same client;
  - Google's and Apple's sign-in, with the project's client IDs.

## References

Retrieved 2026-11-04:

- npm: [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript), [ajv](https://www.npmjs.com/package/ajv), [@tanstack/react-query](https://www.npmjs.com/package/@tanstack/react-query), [expo-secure-store](https://www.npmjs.com/package/expo-secure-store), [expo-crypto](https://www.npmjs.com/package/expo-crypto).
- [Hermes's features](https://github.com/facebook/hermes/blob/main/doc/Features.md); [Ajv's standalone validation code](https://ajv.js.org/standalone.html).
- Expo SDK 58: [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), [Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/).
- ai-platform: [the app API](https://github.com/trungnguyen278/ai-platform/blob/main/protocols/app/README.md), [ADR-0008](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0008-sign-in.md), [ADR-0010](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0010-patterns.md).
