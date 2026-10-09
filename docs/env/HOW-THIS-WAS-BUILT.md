# How this was built

## AI assistance

This repository was built with AI assistance. The code, the tooling, the measurements and the first drafts of the documents were written by Claude (Anthropic), working inside the owner's Claude Code sessions.
lodmaome, the owner, a QA engineer, decided what to build, set the rules it was built under, reviewed every report and approved every step. Commits carry a `Co-Authored-By: Claude` line; the author identity is the owner's.
Nothing was pushed, tagged or published without the owner's go-ahead for that action.

**What is the owner's own writing.** Rules (a), (b) and (c) of section 2 of the [working agreement](WORKING-AGREEMENT.md) are written by the owner, in the owner's words, and are quoted there unedited.
Everything else in the working agreement, section 2(d) (the flake policy values) aside, was drafted by the assistant and is reviewed by the owner before the first release. Each rule of its section 1 carries a scope tag (everyone, environment repository only, attempts only) because attempts import the whole file.

## The path

1. **Phase 1** chose the application pair by a decision rule frozen before anything was measured, applied mechanically ([PHASE1-REPORT.md](PHASE1-REPORT.md)).
2. **Milestone 1** built the stack, the dependency lock and the migration step, and measured them ([MILESTONE1-REPORT.md](MILESTONE1-REPORT.md), [MILESTONE1-FOLLOWUP.md](MILESTONE1-FOLLOWUP.md), [ADR 0001](adr/0001-pair-lock-and-migrations.md)).
3. **Milestone 2** added the verification script, a raw-CDP browser check, the gate tooling, the OpenAPI snapshot, the release gate and these documents ([ADR 0002](adr/0002-milestone2-decisions.md), `MILESTONE2-REPORT.md` in this folder).

## Two incidents, and what they taught

**1. The Docker engine stopped (Phase 1).** Docker Desktop's engine stopped once during Phase 1, unexplained, and was found stopped again at the start of Milestone 1. In Phase 1 the harness tried to start Docker Desktop from a path that did not exist.
*Lesson:* the environment and its tools never start or stop Docker Desktop. A tool that needs the engine says so and stops; the runbook says what to do when the engine is down.

**2. Five of the owner's Docker images were deleted (Milestone 1 follow-up).** A timing script ended with `docker rmi -f` on every image "not in the snapshot taken before the run". It resolved the repository root one directory too high, the snapshot file was not found without any error,
the snapshot list was empty, and the script removed every image it could, including five that belonged to the owner's other projects. Images used by running containers could not be removed, which is why this environment's own images survived.
*Lessons:* a deny-list fails open (any bug in building the list turns "remove what is not listed" into "remove everything"); a script whose root path is wrong must refuse, not assume; and measuring a cold build needs no image removal (use `--no-cache`).
*The rule since:* no `rm`, `rmi`, `prune` or `-f` against Docker, except two named exemptions ([WORKING-AGREEMENT.md](WORKING-AGREEMENT.md) section 1, rule 9); destructive scripts are tested first against a fake `docker` that only logs its arguments, with a mutation that proves the test would notice a missing guard.
A related measurement from Milestone 2: `COMPOSE_PROJECT_NAME=docker` makes Compose resolve the project name to the owner's other project, which `tools/reset.sh` would then have reset; the project guard refuses that ([ADR 0002](adr/0002-milestone2-decisions.md) section 1).

## Errata: four commits whose messages are not exact

History is not rewritten (the owner's decision). The messages stay as they are; this table says what each commit actually contains. "Seen" means I read the commit's file list with `git show --stat`.

| Commit | What its message says | What it contains (seen) | Source of the mismatch |
|---|---|---|---|
| `f368757` | "track PHASE1-REPORT.md under docs/env (content unchanged)" | the report (451 added lines) **and two renames**: `build-tools.txt` to `build-tools.lock.txt` and `constraints.txt` to `requirements.lock.txt` | an earlier `git mv` was already staged and `git commit` takes everything staged |
| `91731ad` | "backend: rename the lock files, fetch without submodules, add lock-hash tools" | the fetch change, the lock-hash tools and a small content edit to `requirements.lock.txt`; **the renames themselves are in `f368757`** | same cause as above |
| `93f58d0` | "stack: migrate only, pull_policy build, bun 1.4.2 tag" | the stack and pin changes it names, **and** an edit to `docs/env/reset-and-boot.md`, which the message does not name | the commit message does not name every file group; found by the Milestone 1 close-out commit audit |
| `df05072` | "docs: say where the external evidence lives; close-out note in the follow-up" | three report edits and a comment-only change to `env/backend/lock-seed.txt`; the title names only documents | found in review of the close-out: its title names only documents, but it also changes `env/backend/lock-seed.txt` (the body does mention it) |

From the next commit on, messages name every file group (see [WORKING-AGREEMENT.md](WORKING-AGREEMENT.md) section 1, rule 6) and the Milestone 2 report carries a table of each commit's hash, message and files.

## Where the evidence lives, and why

The raw evidence (logs, harness scripts, dumps, screenshots, build logs, exported image tars) is **outside this repository**, in `C:\git\conduit-env-evidence\` on the owner's machine (folders `phase1-evidence`, `m1-evidence`, `m2-evidence`). It holds test tokens and test passwords, a local Windows user name in some harness paths, and large files,
and it is not published raw. The documents here state every claim that matters with its numbers and name the evidence file; a reader of this repository cannot open those files. The claims can be re-measured with the commands in [README.md](README.md).

## What was not verified

Nothing has run on Linux or on GitHub Actions; every measurement is from one Windows 11 laptop. A Compose version other than 5.5.1, a Chrome other than 154.0.8037.98, an offline `docker compose up`, and the `@docs/env/WORKING-AGREEMENT.md` import ([ATTEMPTS.md](ATTEMPTS.md)) were not tested.
apt packages float. The npm packages in the frontend bundle and the Debian and Alpine packages in the images are not inventoried ([THIRD-PARTY.md](THIRD-PARTY.md)). The full list for Milestone 2 is in the Milestone 2 report.
