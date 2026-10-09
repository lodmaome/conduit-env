# ADR 0003: What is deferred to env-v2

- **Status:** accepted by the owner for env-v1 (2026-10-09). Each item has a trigger; none is built in env-v1.
- **Decider:** lodmaome. Drafted with AI assistance (Claude).

Three things were considered for env-v1 and deliberately left out. Each is listed with what env-v1 does instead, and the event that should make someone build it.

## 1. A check-owned runner

**Idea.** A tool that compares an attempt's OWNED paths against the env tag it claims to be on, so that an attempt that edited an environment file is caught mechanically.
**Instead, in env-v1:** `env/OWNED.txt` is a documented allow-list and the release gate checks, for the environment repository itself, that every tracked file is OWNED or SEED. Nothing checks an attempt.
**Trigger:** at the start of attempt 2, hand-diff attempt 1's OWNED paths against its env tag (`git diff env-vN -- compose.yaml env tools docs/env`). If that diff is not empty, or the hand-diff is tedious, build the runner.

## 2. A canary and an agent rehearsal for the `@docs/env/WORKING-AGREEMENT.md` import

**Idea.** A test that proves an assistant started in an attempt really loads the working agreement through the `@` import, for example a canary sentence it must quote, and a rehearsal run of an agent from a fresh clone.
**Instead, in env-v1:** [ATTEMPTS.md](../ATTEMPTS.md) says plainly that the import is unverified, and attempt 1's prompt checks by hand that the file is loaded.
**Trigger:** the first time that hand check fails, or at the start of attempt 2, whichever is first.

## 3. A snapshot regeneration gate

**Idea.** A CI job that regenerates the OpenAPI snapshot from a freshly built stack and fails when it differs from the committed file, so a drifting backend is caught automatically.
**Instead, in env-v1:** `sh tools/snapshot.sh` regenerates by hand, and the release gate checks that the snapshot's `x-conduit-env` key (backend sha7 and both lock-file hashes) equals the current pins. That catches a changed pin or lock with a stale snapshot, but not a changed served document under unchanged pins (for example a base-image or apt change that alters the output).
**Trigger:** the first pin bump (`class: pin`), or a drift report that shows a changed served document under unchanged pins, whichever is first.
