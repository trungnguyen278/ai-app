# 0006 — Set-up's cryptography: noble's libraries, in JavaScript, and the phone's randomness

- **Status:** Accepted (delegated to the developer, 2026-11-12)
- **Date:** 2026-11-12

## Context

- **Set-up 2.0** ([ai-platform ADR-0013](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0013-setting-devices-up.md); [the protocol](https://github.com/trungnguyen278/ai-platform/blob/main/protocols/setup/README.md)) needs, on the app's side:
  - SPAKE2+ (RFC 9383) on P-256: points added, subtracted and multiplied, in SEC1's uncompressed form;
  - scrypt (RFC 7914), with N = 32768, r = 8, p = 1, for w0 and w1;
  - SHA-256, HMAC-SHA256 and HKDF-SHA256;
  - AES-128-GCM for every message after the exchange;
  - random scalars, from the phone's secure source.
- **It must run in Hermes and in Jest alike,** so that the tests replay ai-platform's examples byte for byte on the code that ships. React Native 0.88.1 ships Hermes V1 (`sdks/.hermesv1version`: `hermes-v260318099.0.5`). Hermes' `Features.md` (branch `static_h`, read 2026-11-12) lists `BigInt`, `TextEncoder` and `TextDecoder`, the last with `fatal`, in its contributed extensions, which are on by default. Hermes has no global `crypto`.
- **A library that does cryptography must be audited and maintained,** since the code and the keys of set-up depend on it.

## Decision

1. **noble's libraries, in JavaScript:** `@noble/curves` for P-256's points, `@noble/hashes` for SHA-256, HMAC, HKDF and scrypt (`scryptAsync`, which yields to the event loop), and `@noble/ciphers` for AES-GCM. Each is pinned to an exact version, 2.4.0 today, and each upgrade replays the examples.
   - Audits: `@noble/curves` by Trail of Bits (2026-08, at 2.3.0), Cure53 (2024), Kudelski Security (2023) and Trail of Bits (2023); `@noble/hashes` by Cure53 (2022); `@noble/ciphers` by Cure53 (2024, at 1.0.0). They have no dependencies but each other.
   - They are ESM only: Jest transforms them (`jest.config.js`, `transformIgnorePatterns`).
2. **Randomness:** `expo-crypto`'s `getRandomValues`, which reads `SecRandomCopyBytes` on iOS and `SecureRandom` on Android (expo-crypto 58.0.7's source), passed in as a `Random`, as the simulated cloud already does. A scalar comes from 48 random bytes, reduced modulo the order (noble's `mapHashToField`, FIPS 186-5, A.2.1), so that it is uniform.
3. **UTF-8:** `TextDecoder` with `fatal`, so that a message that is not UTF-8 is refused, not repaired.

## Alternatives considered

| Alternative | Why not |
|---|---|
| `expo-crypto`'s AES-GCM, native | Tested in Jest only through a stand-in, so the examples would not replay on the code that ships; it has no P-256 points, so noble would still be needed. |
| `react-native-quick-crypto` | Native scrypt, faster, but Node's API has no point addition for SPAKE2+; a native module tested in Jest only through a stand-in, as above. |
| A package for SPAKE2+ | The exchange is about 250 lines on noble's audited primitives, checked against RFC 9383's vector and ai-platform's example; a package for it would be one more dependency to audit, for the part that the vectors check already. |
| `Math.random`, or a seeded generator | Not a secure source: the scalars would be guessable. |

## Consequences

- Positive: one code in the phone and in the tests; RFC 9383's vector and ai-platform's example of a whole set-up replay byte for byte in Jest; no native module to build.
- Negative / accepted trade-offs: scrypt in JavaScript is slower than native. Its time on a phone, under Hermes, is not measured yet.
- Follow-up: measure scrypt's time on a phone with the Bluetooth step. If it keeps a person waiting too long, a native scrypt behind the same function is the next choice, still checked against the same examples.

## References

- RFC 9383 (SPAKE2+), RFC 7914 (scrypt), RFC 5869 (HKDF), NIST SP 800-38D (GCM), FIPS 186-5, A.2.1.
- noble: github.com/paulmillr/noble-curves, noble-hashes and noble-ciphers, their READMEs' audit sections, read 2026-11-12.
- Hermes: github.com/facebook/hermes, branch `static_h`, `doc/Features.md` and `API/hermes/extensions/contrib`, read 2026-11-12.
- expo-crypto 58.0.7: `ios/CryptoModule.swift`, `android/src/main/java/expo/modules/crypto/CryptoModule.kt`, read 2026-11-12.
