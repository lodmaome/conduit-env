# conduit-env: Milestone 1 report

> **Revision note (after review).** This is the Milestone 1 report as first delivered and reviewed; it is kept as the record of that review. The review rulings changed several things it describes:
> `constraints.txt` is now `requirements.lock.txt` and `build-tools.txt` is `build-tools.lock.txt`; the migrations check is no longer in the `migrate` one-shot; the backend build no longer fetches the backend's three submodules;
> every built service has `pull_policy: build`; the bun image is `oven/bun:1.4.2@sha256:...`; boot times were re-measured. The current state is in [MILESTONE1-FOLLOWUP.md](MILESTONE1-FOLLOWUP.md) and the [ADR](adr/0001-pair-lock-and-migrations.md).
> Paths such as `m1-evidence/` and `phase1-evidence/` below name folders that are **outside the repository**, in `C:\git\conduit-env-evidence\` (`m1-evidence\`, `phase1-evidence\`): they are external evidence, not repo paths, and are not in git. Statements below that this file is "untracked" or that the evidence is "untracked" are historical; the file is now tracked.

**Status: complete, awaiting your review.** Local environment only. Five local commits on `main` (no push, no tag, no remote, nothing on GitHub). Docker is back to your baseline except for BuildKit cache (+4.2 GB, kept).
**Run window:** about 40 minutes of wall clock from the first Docker action (11:05 to 11:44 local, 2026-10-09). Docker was down when I started; I did not touch Docker Desktop, you restarted it.
This file is untracked, like `PHASE1-REPORT.md`. The decisions I need from you are in section 6.

## 1. Result in one screen

- **It boots cold from empty state on this machine.** `docker compose down -v` then `up -d --wait` returns 0 with `migrate` exited 0 and `db`, `api`, `frontend` healthy. Registered, logged in, created an article and read it back over plain HTTP; CORS preflight from `http://localhost:4180` passes; the three published ports are bound to `127.0.0.1` only.
- **Two reset cycles diff clean** on schema, exact row counts, applied migrations and a data dump, with a mutation control (one registered user makes the diff non-empty; a reset restores equality). The initial state also equals Phase 1's R6 dumps for the same backend SHA and PostgreSQL digest.
- **The lock reproduces what Phase 1 measured.** 31 packages, 527 hashes, identical to the set that scored 154/154. A `--no-cache` regeneration is byte-identical. Resolving without the seed one day later differed in one package (`dnspython` 2.8.0 to 2.9.0).
- **Timings (indicative, lower bounds):** `--no-cache` build **44.7 s** (images present: 43.2 s), `postgres` pull **14.4 s**, boot only **median 10.68 s** (10.7 / 10.6 / 10.7). Clone to healthy is about **70 s** as a sum of separately timed steps.
- **apt: I list the drift as a known limitation rather than pinning versions** (section 3).
- **Not proven by this milestone:** the Hurl suite and a real-browser flow were not re-run on the compose-built stack (section 7).

## 2. What was built (all committed locally)

| Commit | Content |
|---|---|
| `8ca171e` env: pins, ownership, seed lists | `env/pins.env`, `env/OWNED.txt`, `env/SEED.txt`, `env/.gitattributes`, `tools/.gitattributes` |
| `556c0e3` backend: lock and generator | `env/backend/{constraints.txt, build-tools.txt, build-tools.in, lock-seed.txt, Dockerfile.lock}`, `tools/lock-backend.sh` |
| `5d6e118` stack | `compose.yaml`, `env/stack.yaml`, `env/backend/Dockerfile`, `env/frontend/{Dockerfile, nginx.conf}`, `tools/reset.sh`, `tools/dump-state.sh`, `docs/env/reset-and-boot.md` |
| `4ed3448` ADR 0001 | `docs/env/adr/0001-pair-lock-and-migrations.md` (pair, rulings, lock, migrate deviation, stack, lessons, measurements, open items) |
| `6ff451c` ADR wording | counts the submodule checkouts correctly (four checkouts, three distinct repositories) |

No root `.gitignore`, `.gitattributes`, `.env` or `.dockerignore`. No verify script, browser check, workflow, THIRD-PARTY, WORKING-AGREEMENT, ATTEMPTS, README, LICENSE, snapshot or GitHub work.

## 3. Your question: pin the apt packages, or list the drift?

**List it.** `apt-get install libpq-dev gcc` pulls **76** packages, so pinning the two named ones leaves 74 floating and pinning all of them means maintaining 76 version strings. The mirror serves only the current version per package; during the session `libpq-dev` was offered as 15.19 (security) and 15.18 (main) at once,
so a pinned string stops resolving at the next security update and the build fails instead of drifting. Every build log now prints the installed versions (`apt-installed:` lines: gcc 4:12.2.0-3, gcc-12 12.2.0-14+deb12u1, libc6-dev 2.36-9+deb12u14, libpq-dev and libpq5 15.19-0+deb12u1); `libpq5` is the only one linked at runtime.
Evidence: `m1-evidence/logs/apt_versions.txt`. **Not tried:** `snapshot.debian.org` (pins everything but adds a flaky dependency) and `--no-install-recommends` (31 packages, compile untested, differs from the image that scored 154/154).

psycopg2 2.9.6 is source-only, as you suspected, and so is `coreschema` 0.0.4 (pure Python, no apt needed). A finding you did not list: pip's isolated build environment **downloads setuptools outside the hash check** (`setuptools-84.0.0`, twice, measured). Hash-pinning the runtime packages alone would have left that open.
So there is a second hashed file, `build-tools.txt` (setuptools, wheel, packaging), installed first and removed afterwards; the installed set is exactly the 31 packages. You may veto it; the alternative is listing it as a second known limitation.

## 4. Deviations and interpretations (overrule any)

1. **Lock installed with `-r`, not `-c`.** The design "constraints file plus `--require-hashes` plus `pip install .`" fails: `Can't verify hashes for these file:// requirements because they point to directories` (measured). So the project itself is not installed (it declares `py-modules = []`), and the file called `constraints.txt` is a requirements lock. The name is misleading; I kept your term.
2. **Two extra files beside `constraints.txt`:** `build-tools.txt` (above) and `lock-seed.txt` (Phase 1's resolved set, used so the lock reproduces the measured build instead of re-resolving PyPI).
3. **`pip install --upgrade pip` dropped.** The image keeps the digest's pip 25.0.1 (Phase 1's image had 26.2.1). Upstream's `pip install .` is replaced by the hashed install. Net package set is unchanged.
4. **The migrations check lives inside the `migrate` one-shot** (`migrate && makemigrations --check --dry-run`), so a failure blocks `api` on every boot. Mutation check: a model field added without a migration makes it exit 1 and print the migration it would create; the dry run writes nothing. Alternative: a separate step in the M2 verify script.
5. **Pins reach compose through `include` with `env_file: env/pins.env`.** Plain `docker compose up -d --wait` works with no flag and no root `.env`. I verified `-f compose.yaml`, an absolute `-f` from another directory, an override file via `-f`, and `COMPOSE_FILE` with a relative override path. The alternative would be `--env-file env/pins.env` on every command.
6. **Named volume `db-data` at `/var/lib/postgresql`** (the path upstream's own compose uses for PostgreSQL 18), so `down -v` is the explicit reset and plain `down` keeps data. Phase 1 had no volume.
7. **Submodules.** `ADD <git>#<sha>` also checks out upstream's submodules: three for the backend (the spec and two full example frontends, about 5.7 MB, unused at runtime) and one for the frontend. That is four extra checkouts from three distinct repositories (the `realworld` spec is shared) fetched at build time; `THIRD-PARTY.md` will need rows for them.
8. **Added small tools and a stopgap doc:** `tools/reset.sh`, `tools/dump-state.sh`, `tools/lock-backend.sh`, `docs/env/reset-and-boot.md` (to be absorbed by `docs/env/README.md` in M2).
9. **`git init -b main` and five commits.** Your brief allows local commits, and a repo did not exist. `PHASE1-REPORT.md`, `phase1-evidence/` and `m1-evidence/` are untracked because they are not on the OWNED allow-list.
10. **`# check=skip=InvalidDefaultArgInFrom`** in the three Dockerfiles: the base-image ARGs deliberately have no default (a default would duplicate the pin). BuildKit's check then reports no warnings.
11. **`env/SEED.txt` lists four files that do not exist yet** (README, LICENSE, two `.gitkeep`).
12. **Build contexts are `env/backend` and `env/frontend`; the pins are tags like `conduit-env/backend:<40-hex SHA>`.** Compose builds the backend once and names it for both `migrate` and `api`.

## 5. Mistakes of mine caught during the milestone (invalid checks, all redone)

- **One-hash mutation proved nothing.** I corrupted a single wheel hash; pip fell back to the sdist and failed on a missing `hatchling`, not on a mismatch. Redone by zeroing all hashes of a package: install fails with `Expected 000... Got 0641...`.
- **First timing run was invalid.** Its boot 1 pulled `postgres` (25.6 s) because the harness had removed it and `compose build` never pulls `db`. Discarded, kept with the reason in `m1-evidence/measurements_run1_boot1_included_a_pull/`, harness fixed and rerun in full.
- **"Base images NOT on disk" overstated.** Base images used only by `buildx` live in BuildKit's content store, which I will not prune. So the cold-build row is a lower bound; the two build numbers being nearly equal is consistent with that. Note in `m1-evidence/measurements/NOTE.txt`.
- **First regeneration check replayed the cache** (every step `CACHED`), so identical output proved nothing. Redone with `--no-cache` (55.8 s of real work): byte-identical.
- **A control regex was halved by the Bash tool** (the known backslash quirk), so the nonce control printed nothing and the chain silently skipped control 2. Redone from a script file.
- **My gate script's ownership check was wrong** (the shell glob-expanded the patterns, so only direct children matched). Fixed with `set -f` and a negative control for the matcher.
- **Cleanup missed 5 dangling images** from my own `--target` experiments (hidden from plain `docker images`, counted by `docker system df`). Removed after identifying them by ID and creation time; the diff against your baseline is now empty.

## 6. Decisions I need from you

1. **Where do the report and evidence live in the env repo?** `PHASE1-REPORT.md`, `phase1-evidence/`, `m1-evidence/` (and this file) are not OWNED. Options: move under `docs/env/` (owned), or keep outside and cite as external.
2. **Keep `build-tools.txt`** (closes the setuptools hole) or drop it and list the gap?
3. **Rename `constraints.txt`** (it is installed with `-r`)?
4. **Migrations check:** keep it in the `migrate` one-shot, or move it to the M2 verify script?
5. **`include` indirection or `--env-file`?**
6. **`oven/bun:latest@sha256:...`:** the digest is the pin; the `latest` label only records what Phase 1 used, and a drift report that resolves the tag will fire on every bun release. Drop the tag label, or pin a version tag?

## 7. Still unverified

- **Hurl 154/154 was not re-run on this stack.** What carries over: identical 31 package versions, identical PostgreSQL digest, identical schema, row counts and migrations, plus the manual HTTP flow. What differs from Phase 1's image: pip 25.0.1, the hash-checked install path, no `pip install .` of an empty project, lock files in `/opt/lock`. Re-running Hurl is the direct proof.
- **No real-browser flow** against the compose-built pair; only HTTP checks and a bundle grep (informational: the origin string is in the built JS). The raw-CDP check is M2.
- **Nothing on `ubuntu-24.04` or Actions.** One Windows laptop, Docker Desktop. Timings are lower bounds; the network varied about 30x within the session (the Debian mirror delivered 191 kB/s in one run and 6 MB/s in another).
- **Boot is 2.0 s slower than Phase 1's median (10.68 s against 8.69 s).** About 1.0 s is the added migrations check (measured three times); the other second is **not attributed** (named volume, published DB port or machine state, none isolated).
- **apt packages float**; the **three submodule repositories** (four checkouts) must exist at their gitlinked commits; PyPI, GitHub and Docker Hub availability at build time.
- **An attempt's override file:** relative paths inside it (build contexts, bind mounts, `env_file`) against this layout were not tested (M3 rehearsal).
- **Behaviour when ports 4180 to 4182 are taken** was not exercised. The engine-down message in `reset-and-boot.md` is quoted from what I saw, but the instruction was not tested.
- **Windows checkout line endings:** with `core.autocrlf=true` and no root `.gitattributes`, `compose.yaml` and `docs/env/**` check out as CRLF (blobs are LF). Harmless for YAML and Markdown; scripts and Dockerfiles are covered by the nested LF rules.
- The two probe users registered during checks (`m1probe`, `r6mutant`) lived only in stacks that were reset.

## 8. Evidence index (`m1-evidence/`, untracked)

`logs/` (docker baseline and after, first and second builds, lock generation and regeneration, `constraints-experiments/` with its README, apt versions, makemigrations mutation, `m1_gate.txt`) · `measurements/` (timing results, build logs, NOTE) · `measurements_run1_boot1_included_a_pull/` (discarded run, WHY-DISCARDED) ·
`r6/` (cycle dumps, controls, diffs against Phase 1) · `harness/` (`measure_m1.ps1`, `r6_controls.sh`, `m1_gate.sh`, the override probe) · `phase1_resolved_set.txt`.

**Local gate (manual, since gate tooling is M2):** `sh m1-evidence/harness/m1_gate.sh` gave 0 failed checks: compose renders, scripts parse, no CRLF, every file OWNED or SEED (with a negative control), no forbidden root files, every pin used and none duplicated, three ports on `127.0.0.1`, reset exits 0, API 200, frontend 200, `migrate` exited 0, three services healthy.

## 9. Commands

```bash
docker compose down -v --remove-orphans
docker compose up -d --wait
```

`docker compose build --no-cache` rebuilds from scratch. The images are not on your machine right now (I removed what I created); the first `up` builds them in about 45 s plus the 14 s `postgres` pull.
