# ADR 0002: Milestone 2 decisions

- **Status:** draft, written while Milestone 2 is in progress. Sections are added as each task lands; each carries its own evidence.
- **Date:** 2026-10-09
- **Decider:** lodmaome. Drafted with AI assistance (Claude).
- **Evidence:** raw logs are outside the repository, in `C:\git\conduit-env-evidence\m2-evidence\` (cited by name only), as in [ADR 0001](0001-pair-lock-and-migrations.md).

## 1. Project-name guard for `tools/reset.sh` and `tools/dump-state.sh`

**Problem (measured by lodmaome).** `COMPOSE_PROJECT_NAME=docker docker compose config` resolves the project name to `docker`, the owner's other project,
because `name: conduit-env` in `compose.yaml` has the lowest precedence. `tools/reset.sh` ran `docker compose down -v --remove-orphans`, which would then have deleted that project's containers and volumes.

**Pre-registered measurement** (read-only: `docker compose config`, working directory = repository root, Compose 5.5.1, Windows, 2026-10-09; the rule was written before running, in `m2-evidence\PREREGISTRATION.md`).
Temporary files were created only after asserting they did not exist and only those files were deleted; `git status` was clean afterwards.
Output: `m2-evidence\t0.1\project-name-measure.txt` (seen).

| Case | Resolved `name:` | Exit |
|---|---|---|
| control: nothing set | `conduit-env` | 0 |
| `COMPOSE_PROJECT_NAME=docker` in the environment | `docker` | 0 |
| root `.env` with `COMPOSE_PROJECT_NAME=docker` | `docker` | 0 |
| `compose.override.yaml` with a top-level `name: other` | `other` | 0 |
| environment variable `docker` **and** `-p conduit-env` | `conduit-env` | 0 |

So three independent routes (environment, root `.env`, override file) change the name, and only `-p` beats them. A root `.env` and an override are exactly where an attempt puts its own settings.
`COMPOSE_FILE` was not measured as a name source (it changes which files are read, not the name rule); a `COMPOSE_FILE` pointing at a different stack with `name: conduit-env` would pass the guard, and is not covered.

**Decision.** `tools/project-guard.sh` (sourced by both scripts) runs `docker compose config` with the caller's directory, environment and auto-loaded files, takes the single top-level `name:` line and
refuses unless it equals `conduit-env` exactly. It fails closed: non-zero exit of `config`, empty output, no `name:` line, or more than one. Indented `name:` keys (service names) are not matched.
`reset.sh` additionally passes `-p conduit-env` on `down` and on `up` (belt and braces: the guard protects against a wrong environment, `-p` against a guard bug). `dump-state.sh` passes it on every `exec`.
The guard makes `COMPOSE_FILE=compose.yaml tools/reset.sh` (the bypass `verify --fresh` will use) still pass, because the resolved name is still `conduit-env`; this is re-checked in task 1.

**Tests** (`tools/test-project-guard.sh`, a fake `docker` first on `PATH` that logs argv; each run first asserts `command -v docker` is the fake): name `docker`, name `some-other-project`, empty output, `config` exit 1, two `name:` lines, for both scripts:
exit status 1, message names the resolved name or the reason, and the call log has no `down`, no `up`, no `exec` (and is not empty, so the guard did call docker). Positive case: exit 0, `down -v --remove-orphans` and `up -d --wait` both carry `-p conduit-env`.
Mutation: a temp copy of `reset.sh` with the guard line removed, run against the fake with `name: docker`, puts `down` in the log: the refusal tests would catch a missing guard. Result: 0 failed checks (`m2-evidence\t0.1\guard-test.txt`, seen).
The guard was also run against the real `docker compose config` (read-only): rc 0 with nothing set, rc 1 with `COMPOSE_PROJECT_NAME=docker` (`guard-real-readonly.txt`, seen).
`sh -n` was controlled with a deliberately broken script (exit 2), because `sh -n` through PowerShell is vacuous.
**Real reset on the live stack (seen).** The first attempt, a single command that also deleted a directory, was refused by the harness permission layer (reason: irreversible local destruction); I did not work around it.
On 2026-10-09 you then authorized `sh tools/reset.sh` as its own call: exit 0 (`m2-evidence\t0.1\real-reset.txt`). A second call, `sh tools/dump-state.sh C:/git/conduit-env-evidence/m2-evidence/t0.1/reset-check-1` (directory asserted absent first, not removed afterwards),
gave sha256 values **equal to all four expected ones**: `data.txt` 330a6a86...2441, `migrations.txt` 1aa9e2d5...f9cb, `rowcounts.txt` f26855c7...2197, `schema.txt` 260a6eed...0ffb (`t0.1\dump-sha256.txt`). So the guarded reset reproduces the Milestone 1 initial state.
That `up` also recreated the frontend from an image built through compose with the new Dockerfile (`t0.1\frontend-after-reset.txt`): `docker compose ps -a` shows `api`, `db`, `frontend` healthy and `migrate` exited 0; the frontend container's image id and the tagged image
`conduit-env/frontend:f7e48c8...` are both `sha256:3074fa7313a0...` (same id, 12-character form `3074fa7313a0`); `GET http://127.0.0.1:4180/` returned 200.
A rebuild produces a new image id every time even from cache (`8a3d12b748e2` before, `16bd7eacd2ef` after `compose build`, `3074fa7313a0` after this `up`).

## 2. The frontend submodule is pinned and the build checks it

**Pre-registered probe** (`m2-evidence\PREREGISTRATION.md`, section 0.2, written before running). Question: can a throwaway fetch stage read (a) the gitlink commit of `realworld` in the pinned frontend commit and
(b) the checked-out submodule HEAD, with `ADD --keep-git-dir=true <git>#<sha>`? Rule: YES only if both are readable and both equal the value the GitHub contents API gives for path `realworld` at the pinned frontend SHA.

**Result: yes** (`m2-evidence\t0.2\probe.log`, `api-gitlink.json`, seen). In a `python` stage with apt `git`: `git ls-tree HEAD realworld` printed mode `160000`, type `commit`, the commit `dd53ae6e...3967`;
`git -C /app/realworld rev-parse HEAD` printed the same; the API reported `type: submodule` with the same sha. `FRONTEND_REALWORLD_SHA` in `env/pins.env` was filled from that real build output, not typed from memory.

**Decision.** `env/frontend/Dockerfile` has a new `src` stage (python base from `PYTHON_IMAGE`, apt `git`, the same unpinned-apt limitation as the backend fetch stage) that fetches with `--keep-git-dir=true`,
asserts the frontend HEAD equals `FRONTEND_SHA`, and the gitlink and the checked-out submodule HEAD both equal `FRONTEND_REALWORLD_SHA`, then deletes `.git` and `realworld/.git`; the build stage copies `/src`.
On mismatch the build fails with one line `SUBMODULE PIN MISMATCH: FRONTEND_REALWORLD_SHA expected=... actual-gitlink=... actual-checkout=...`, so a pin bump costs one copy and paste.
`env/stack.yaml` passes `FRONTEND_REALWORLD_SHA` and `PYTHON_IMAGE` to the frontend build. This supersedes the ADR 0001 statement that the frontend keeps a bare `ADD <git>#<sha>`.

**Tests** (`tools/check-submodule-pin.sh`, `m2-evidence\t0.2\check-submodule-pin.txt`, seen; exit 0, 0 failed): the real pin builds (control); the last hex digit flipped fails, and the message carries the wrong value as expected and the real value as actual;
a copy of the Dockerfile with the failing branch neutralised builds with the wrong pin, so the wrong-pin check can tell a present assertion from a missing one.
Two earlier runs of this script failed for reasons in my script, not in the repo (`check-submodule-pin.run1-...` and `run2-...`): BuildKit needs every base-image `ARG` even when only one stage is built, then a stray `\n` from a `sed` edit.
A first version of the message check also matched the echoed `RUN` command text instead of a real output line; it now matches only `#N seconds` output lines and compares against the real values.

**No `.git` in the shipped image** (`no-git-check.txt`, seen). A `docker run` is not allowed here, so the stages were exported as tars (`--output type=tar`; a `type=local` export fails on Windows with a symlink privilege error) and listed:
final image stage 2168 entries, 0 `.git`; `src` stage 9435 entries, 0 `.git`; presence control, the `src` stage of a Dockerfile copy with the `rm -rf .git ...` line neutralised: 9706 entries, **271** `.git` entries.
The final stage was exported from a build with the same arguments as compose uses, not from the compose-built image itself; `docker compose build frontend` through compose also succeeded (`compose-build-frontend.log`).
It re-tagged `conduit-env/frontend:f7e48c8...` (image id `8a3d12b748e2` to `16bd7eacd2ef`). **Correction (lodmaome, confirmed by me):** the previous image does **not** stay. Docker here uses the containerd image store (`docker info`: driver `io.containerd.snapshotter.v1`).
`docker images -a` does not list `8a3d12b748e2`, and `docker image inspect sha256:8a3d12b748e2ffa89973aef4619545daa4ea536ec9c47753422059a5c1b72217` answers "No such image", although the running frontend container had been created from it
(`m2-evidence\t0.2\` and `t0.1\frontend-after-reset.txt`, seen). So a rebuild under the same tag drops the previous image: there is no rollback target. Docker did this, not a command of mine; no rule was broken. The `16bd7eacd2ef` image is gone the same way.
**Licence read.** `realworld/LICENSE` at the pinned submodule commit, read from the exported `src` tree (`m2-evidence\t0.2\lic\realworld-LICENSE`, sha256 `a999311c...fc9dd`): MIT, "Copyright (c) 2021 Thinkster" and "Copyright (c) 2026 c4ffein".
Its `assets/theme/styles.css` is built into the frontend bundle. The row for `THIRD-PARTY.md` is written in task 6 from this read.

**SHA repetition check.** The existing M1 check (a full SHA or digest outside `env/pins.env`) scans `compose.yaml`, `env/stack.yaml`, `env/frontend`, the backend Dockerfiles, `tools/` and `docs/env/reset-and-boot.md`, and exempts the lock files.
It stays green on this change (no match; positive control: the same pattern over `env/pins.env` and `compose.yaml` matches 7 lines). Record documents (ADRs, reports) cite SHAs on purpose; they are outside that scan and stay outside it when the check is ported into the release gate (task 3).
