# Changelog

One entry per environment release, newest first. A release is an annotated tag `env-vN`; tags are never moved.
The release gate (`node tools/release-gate.mjs env-vN`) requires an entry for the tag with these two lines:

- `- class:` one or more of `pin`, `build`, `contract`, `docs` (comma separated): what kind of change it is.
- `- merge:` one of `required`, `recommended`, `not needed`: how urgently an attempt should merge it.

The meanings are in [ATTEMPTS.md](ATTEMPTS.md), section 7. Entry heading format: `## env-vN - date`.

## env-v1 - not yet tagged

- class: pin, build, contract, docs
- merge: required

The first release. Attempts start from it.

- **Pair:** `vue-realworld-example-app` at the pinned frontend commit and `realworld-django-ninja` at the pinned backend commit, on PostgreSQL 18 (ADR 0001). Every pin is in `env/pins.env`; base images are pinned by digest.
- **Stack:** `compose.yaml` includes `env/stack.yaml`; order `db`, `migrate` (runs `migrate` only), `api`, `frontend`; ports 4180, 4181 and 4182 on `127.0.0.1` only.
- **Backend lock:** hash-pinned `requirements.lock.txt` (31 packages) and `build-tools.lock.txt`, installed with `--require-hashes`; the backend source is fetched without its three unused submodules.
- **Frontend:** the one required submodule is pinned as `FRONTEND_REALWORLD_SHA`, and the build fails if the gitlink or checkout differs.
- **Contract:** `docs/env/contract/openapi.04ef47c.json`, with the header of lock hashes; six `/auth/` operations are not RealWorld.
- **Tooling:** `tools/verify.mjs` (with a raw-CDP browser check), `tools/gate.sh`, `tools/release-gate.mjs`, the project guard for `tools/reset.sh`, the snapshot and licence generators.
- **Docs:** README, ATTEMPTS, WORKING-AGREEMENT, THIRD-PARTY, FINDINGS, HOW-THIS-WAS-BUILT, ADRs 0001 to 0003.
- **Seed files** shipped once: `README.md`, `LICENSE`, `docs/attempt/.gitkeep`.
