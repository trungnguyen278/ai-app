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
- Every message received is validated: its schema, its size, its numbers (finite), its strings (length); what fails is refused (SEC-14). Rates and sizes are limited (SEC-15).
- A replayed message has no effect beyond its first one, and credentials expire (SEC-12).
- A device or a cloud that does not answer, answers late or answers twice leaves the app usable, and the owner is told what happened.

### Security and privacy

- Secrets — the owner's session, a device's set-up code, the keys of a set-up session — stay in memory or in the phone's secure storage: never in plain files, logs, error reports or analytics.
- Every request is confined to the owner's homes and their devices (SEC-6).
- The app asks for a permission, such as Bluetooth or notifications, when it first needs it, and says why, in the owner's language.

### The interface

- Nothing blocks the interface: network, Bluetooth and storage work asynchronously.
- Every text comes from the catalogs, and layouts hold longer translations and larger text sizes.
- What people use has a label for screen readers, and enough contrast in the light and dark themes.

### Tests

- Each behaviour change has a test that would fail on the old code; check it is not vacuous (an exact float compare that never matches, a loop that never runs).
- Protocol exchanges are tested against ai-platform's examples, and against a simulated device.
- No fixed sleeps to wait for readiness: wait for the condition, with a timeout.

### Repository rules (CONTRIBUTING.md, AGENTS.md)

- English everywhere; SPDX header on new source files; no personal or machine-specific values; no product name.
- Docs travel with the change: the README, ADRs (`Proposed` unless explicitly agreed), the dev log.
- `<type>(<scope>): <summary>`, one commit per pull request, `<type>/<short-description>` branch.

## 4. Confirm, then fix

For each suspicion, write the smallest script that shows it. Drop whatever does not reproduce. Fix what does in the pull request's single commit (`git commit --amend`, `git push --force-with-lease`), adding a test for it.

## 5. Report

When handing the change over, say in the conversation what the review found and how each item was fixed, or why it was left, and what was not checked. Keep it out of the commit message and the pull request description, which stay short (CONTRIBUTING.md).
