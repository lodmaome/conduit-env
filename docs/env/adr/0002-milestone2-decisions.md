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
**Real reset on the live stack: not done at the time of this section.** The one real `sh tools/reset.sh` plus `dump-state.sh` compare required by the task was refused by the harness permission layer
(classifier reason: irreversible local destruction), and I did not work around it. The expected dump hashes are in the task; the result is recorded in a later commit once the run is allowed (not seen yet).
