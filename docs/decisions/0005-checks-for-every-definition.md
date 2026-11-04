# 0005 — The app API's checks: one for every definition

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

- **[ADR-0004](0004-talking-to-the-cloud.md), decision 1,** made checks for the bodies that the app receives: the 15 that the schema's `from_cloud` tells apart, as Ajv's standalone code, 107 KB.
- **The simulated cloud must refuse what ai-cloud refuses** (ADR-0004, decision 3). ai-cloud checks the body of every request against the schema (SEC-14), the forms of the OAuth endpoints included. So the simulated cloud needs the checks of the bodies that the app sends: 12 more.
- **Screens check what people type** before it goes, such as a home's name, which the protocol takes without control characters. The check must come from the schema itself, never from a copy of its patterns ([design rule 1](../../CONTRIBUTING.md#design-rules)). One field alone, such as `name` or `email`, is a definition of its own.
- **Measured with the generator** on 2026-11-04, at the app API 1.2:

  | Checks | How many | Size |
  |---|---|---|
  | The bodies the app receives (ADR-0004) | 15 | 107 KB |
  | Every definition of an object | 28 | 123 KB |
  | Every definition, but the two that only tell bodies apart | 47 | 140 KB |

- **The generated types** made a union of tuples for every list with bounds, such as `languages`, from 0 to 10 tags. A `string[]` from a screen does not fit such a type without a cast.

## Decision

1. **Every definition of the pinned schema has a check**, but `from_app` and `from_cloud`, which only tell bodies apart: each endpoint knows which body it takes and gives. `checked(definition, value)` replaces `received`.
2. **A list's type is an array.** json-schema-to-typescript's `ignoreMinAndMaxItems` leaves its bounds to its check.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Checks for the definitions of objects only | A screen could not check one field without building a body around it. |
| Ajv compiling the requests' checks inside the simulated cloud | It needs the Function constructor, which Hermes does not promise (ADR-0004). |
| Checks of the simulated cloud's own, written by hand | They would drift from the schema. |
| The tuples, for the types of lists | Code would cast to fit them, which hides real mistakes too. |

## Consequences

- Positive:
  - the simulated cloud refuses what ai-cloud refuses, from the same schema;
  - screens get the protocol's own rules, one field at a time.
- Negative / accepted trade-offs: 33 KB more code than ADR-0004's, 140 KB, before minification.
- Follow-up: what a screen tells people for each broken rule comes from the catalogs.

## References

- ADR-0004, decisions 1 and 3; ai-cloud checks every body against the schema (its `accounts/routes/http.py`, `json_body`).
- [json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) 16.0.0, its options `maxItems` and `ignoreMinAndMaxItems` (its README, read 2026-11-04).
