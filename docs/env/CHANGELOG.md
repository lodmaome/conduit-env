# Changelog

One entry per environment release, newest first. A release is an annotated tag `env-vN`; tags are never moved.
The release gate (`node tools/release-gate.mjs env-vN`) requires an entry for the tag with these two lines:

- `- class:` one or more of `pin`, `build`, `contract`, `docs` (comma separated): what kind of change it is.
- `- merge:` one of `required`, `recommended`, `not needed`: how urgently an attempt should merge it.

The meanings are in [ATTEMPTS.md](ATTEMPTS.md), section 7. Entry heading format: `## env-vN - date`.

## env-v1 - 2026-10-14

- class: pin, build, contract, docs
- merge: required

The first release. Attempts start from it.

- **Pair:** `vue-realworld-example-app` at the pinned frontend commit and `realworld-django-ninja` at the pinned backend commit, on PostgreSQL 18 (ADR 0001). Every pin is in `env/pins.env`; base images are pinned by digest.
- **Stack:** `compose.yaml` includes `env/stack.yaml`; order `db`, `migrate` (runs `migrate` only), `api`, `frontend`; ports 4180, 4181 and 4182 on `127.0.0.1` only.
- **Backend lock:** hash-pinned `requirements.lock.txt` (31 packages) and `build-tools.lock.txt`, installed with `--require-hashes`; the backend source is fetched without its three unused submodules.
- **Frontend:** the one required submodule is pinned as `FRONTEND_REALWORLD_SHA`, and the build fails if the gitlink or checkout differs.
- **Contract:** `docs/env/contract/openapi.04ef47c.json`, with a root key `x-conduit-env` holding the lock hashes; six `/auth/` operations are not RealWorld.
- **Tooling:** `tools/verify.mjs` (with a raw-CDP browser check), `tools/gate.sh`, `tools/release-gate.mjs` (23 checks, with a self-test; check 4 compares the seed files with their content at the tag `env-v1`, check 16 scans the history of `main` and the tags, check 17 the workflow files), `tools/pin-drift.mjs`, the project guard for `tools/reset.sh`, the snapshot and licence generators.
- **CI:** `.github/workflows/env-verify-core.yml` (reusable; attempts call it), `env-verify.yml` (push, pull request and dispatch; runs only where the variable `ENV_CANONICAL` is `true`) and `env-pin-drift.yml` (weekly and dispatch; same guard). Every action is pinned by commit SHA. Run on GitHub Actions: see ADR 0004 sections 4 and 5.
- **Docs:** README, ATTEMPTS, WORKING-AGREEMENT, THIRD-PARTY, FINDINGS, RUNBOOK, HOW-THIS-WAS-BUILT, the milestone reports, ADRs 0001 to 0004.
- **Seed files** shipped once: `README.md`, `LICENSE`, `docs/attempt/.gitkeep`.
