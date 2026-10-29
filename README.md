# ai-app

> **Status:** new. The repository's conventions are in place; there is no code yet. Proposed so far: React Native with Expo, Android first ([ADR-0001](docs/decisions/0001-platforms-and-framework.md)), and the [architecture](docs/architecture.md) ([ADR-0002](docs/decisions/0002-architecture.md)). How owners sign in to ai-cloud comes next ([dev log](docs/devlog/2026-10.md)).

The owner's app for the project's AI devices, the first of which is [ai-robot](https://github.com/trungnguyen278/ai-robot), a mobile robot with an expressive face that people talk to. With it, an owner sets a device up, brings the people of their home in, changes a device's settings and controls it. The app signs in to [ai-cloud](https://github.com/trungnguyen278/ai-cloud), which registers the devices it sets up.

## What it does

The protocols it speaks, and their requirements, are defined in [ai-platform](https://github.com/trungnguyen278/ai-platform), with the decisions behind them: set-up with a device (`platform/protocols/setup/`) now, and the app's link to the cloud later.

- **Set-up.** It finds a device waiting to be set up, over Bluetooth LE, and opens a session secured by the code the device shows. It gives the device its Wi-Fi network, its first languages and its time zone, then relays the device's registration to ai-cloud, which binds the device into the home the owner chose (SEC-3, [ai-platform ADR-0005](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0005-homes.md)).
- **Homes and their people.** The owner signs in to ai-cloud. A home has an owner, admins and members, and profiles for people who never sign in (ai-platform ADR-0005).
- **Settings.** It shows and changes a device's settings over Bluetooth LE, such as its languages, and which classes of capabilities the cloud may use: a setting the cloud itself cannot change (SEC-9).
- **Control.** It drives what a device offers, within the safety classes its owner allows (SEC-8, SEC-9).
- **Notifications.** It tells the owner what the cloud pushes, such as a device that needs an update.
- **For every device, in the owner's language.** It handles each kind of device through what the device declares, and every text comes from a catalog, Vietnamese first ([ai-platform ADR-0002](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0002-languages.md)).

## Repository layout

```
ai-app/
├── docs/        Decision records (ADRs) and the dev log
├── platform/    ai-platform, pinned: the protocols, and the decisions that span the repositories
└── .claude/     Task checklists for AI assistants (see AGENTS.md)
```

The code's layout comes with the decision on the framework. Clone with `git clone --recurse-submodules`, or run `git submodule update --init` after a plain clone.

## Documentation

- [docs/architecture.md](docs/architecture.md) — modules, ports and adapters, set-up end to end, testing
- [docs/](docs/README.md) — the app's own decisions and its dev log
- [ai-platform](https://github.com/trungnguyen278/ai-platform) — the protocols, and the decisions that span the repositories
- [CONTRIBUTING.md](CONTRIBUTING.md) — branches, commits, documentation, secrets, licensing

## Related repositories

| Repository | What it is |
|---|---|
| [ai-robot](https://github.com/trungnguyen278/ai-robot) | The robot: hardware, software, face, firmware |
| [ai-cloud](https://github.com/trungnguyen278/ai-cloud) | The cloud side of the devices: their AI, their tokens, set-up's registration, updates |
| [ai-platform](https://github.com/trungnguyen278/ai-platform) | What the repositories share: the protocols, and the decisions that span them |

## License

Released under the [MIT License](LICENSE).
