# Changelog

One entry per release, newest first. A release is an annotated tag `env-vN`; tags are never moved. Each entry has two lines:

- `- class:` one or more of `pin`, `build`, `contract`, `docs`: what kind of change it is (`pin`: an upstream pin or lock; `build`: how the images or stack are built or started; `contract`: the served API contract; `docs`: documents and tooling that do not change the running stack).
- `- merge:` one of `required`, `recommended`, `not needed`: how urgently a framework built on this repository should merge it.

## env-v3 - 2026-10-15

- class: docs
- merge: recommended

Documents only. Nothing the stack builds or runs changed.

- **Moved.** `ARCHITECTURE.md` moved to `docs/env/ARCHITECTURE.md` (moved first without any edit, then its links were corrected); links to it are updated. The root keeps `README.md`, `ENV-README.md`, `CHANGELOG.md`, `THIRD-PARTY.md` and `LICENSE`.
- **New.** `docs/env/UI-GUIDE.md` and `docs/env/API-GUIDE.md`: what the user interface and the API do, as observed against the running stack, with stable rule IDs (`UI-001`..., `API-001`...), a permission matrix, the contract snapshot compared with what happened, and a checklist of what can be tested. Behaviour that looks like a defect is listed as "possible defect" with a reproduction.
- **Shortened.** Section 9 of `ENV-README.md` now keeps only the headline behaviours and links to the guides, which are the single place for application behaviour. The sentence about what not to edit includes `docs/env/`.
- **Merging.** `docs/env/` is a path you should not edit. A framework that has its own file at `docs/env/...` will see a conflict; `ARCHITECTURE.md` at the root disappears.
- **Unchanged.** `compose.yaml`, `env/`, `tools/`, `contract/` and `.github/`: `git diff env-v2 -- compose.yaml env tools contract .github` is empty.

## env-v2 - 2026-10-14

- class: docs
- merge: recommended

The repository is now a slim base for test frameworks.

- **Documents replaced.** `README.md` is a short front page (keep your own `README.md` when you merge); the manual is `ENV-README.md`, the build description is `ARCHITECTURE.md`; `THIRD-PARTY.md` and this file moved to the repository root; the OpenAPI snapshot moved to `contract/`. The folder `docs/` is gone.
- **Removed.** The maintenance tooling (the lint gate, the release gate, the pin-drift report, the lock, snapshot and licence generators, the mutation checks), the files that only they used, and every report and decision document. They remain in the `env-v1` tag and in the history. `ARCHITECTURE.md` says how to take the generators from the tag when a pin is bumped.
- **Kept.** `tools/reset.sh`, `tools/project-guard.sh`, `tools/dump-state.sh`, the smoke test `tools/verify.mjs` with its browser check, and the unit tests of exactly those tools.
- **CI.** `.github/workflows/env-pin-drift.yml` is deleted. The reusable `env-verify-core.yml` no longer has the inputs `run-gate` and `run-release-gate`, **a caller that passes either gets an error: drop them**; it no longer checks out the full history, and it always runs the unit tests (`node --test tools/test/*.test.mjs`) and the guard test (`sh tools/test-project-guard.sh`). `env-verify.yml` no longer passes those inputs. Seen on GitHub Actions (rehearsal repository, 2026-10-14; The rehearsal repository was private and throwaway; its run URLs are kept for the record and will not open for a reader.): the reduced core run succeeded on `ubuntu-24.04` with verify 5 PASS, 34 of 34 unit tests and the guard test passing (https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38642228161); a caller passing `run-gate: true` is rejected before any job runs, with `Invalid input, run-gate is not defined in the referenced workflow` (https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38642488107).
- **Merging.** Accept the deletions. Files you edited that were deleted here will conflict: keep your version or delete them. `tools/verify.mjs` now looks for `env/pins.env` (not `env/OWNED.txt`) to recognise the repository root.
- **Unchanged.** The pins, both lock files, the stack and the snapshot's content. Checked against the `env-v1` tag: `env/pins.env` differs in one comment line only (the non-comment lines are identical), and `git diff env-v1 -- env/backend/requirements.lock.txt env/backend/build-tools.lock.txt` is empty; the snapshot moved with a rename of 100% similarity; `compose.yaml`, `env/stack.yaml`, both Dockerfiles and the tools that were kept differ only in comments, except `tools/verify.mjs` (the root marker, and the wording of one usage line and one printed note).

## env-v1 - 2026-10-14

- class: pin, build, contract, docs
- merge: required

The first release: the RealWorld pair (Vue frontend, django-ninja backend, PostgreSQL 18) pinned and started with Docker Compose, with its tooling, documents and CI.
