# Architecture decision records (ADRs)

Each significant decision is a short file: context, decision, alternatives considered and consequences — so that years from now we still know **why**.

- Template: [0000-template.md](0000-template.md). How to write one: the `adr` checklist (`.claude/skills/adr/SKILL.md`).
- Never edit an old ADR to change a decision; write a new one and mark the old one "Superseded by …".
- These are the app's own decisions. A decision that spans repositories, such as a protocol, is recorded in [ai-platform's decisions](https://github.com/trungnguyen278/ai-platform/tree/main/docs/decisions); cite it as "ai-platform ADR-NNNN".

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-platforms-and-framework.md) | Platforms and framework: React Native with Expo, Android first | Accepted | 2026-10-29 |
| [0002](0002-architecture.md) | The architecture: modules with ports and adapters, as on the robot and in the cloud | Accepted | 2026-10-29 |
| [0003](0003-interface-and-motion.md) | The interface: the robot's visual language, in motion | Accepted | 2026-10-30 |
| [0004](0004-talking-to-the-cloud.md) | Talking to ai-cloud: types and checks made from the protocol, one client, a session in secure storage | Accepted; decision 1 widened by 0005 | 2026-11-04 |
| [0005](0005-checks-for-every-definition.md) | The app API's checks: one for every definition | Accepted | 2026-11-04 |
| [0006](0006-set-up-cryptography.md) | Set-up's cryptography: noble's libraries, in JavaScript, and the phone's randomness | Accepted (delegated) | 2026-11-12 |
