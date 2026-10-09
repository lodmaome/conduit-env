# ADR 0001: The pair, the dependency lock and the migration step

- **Status:** draft for review (Milestone 1, revised after review). Not tagged. Becomes final when lodmaome approves it.
- **Date:** 2026-10-09
- **Decider:** lodmaome. Drafted with AI assistance (Claude).
- **Evidence in this repository:** [PHASE1-REPORT.md](../PHASE1-REPORT.md) (the pair), [MILESTONE1-REPORT.md](../MILESTONE1-REPORT.md) (what was built and measured first)
  and [MILESTONE1-FOLLOWUP.md](../MILESTONE1-FOLLOWUP.md) (the review rulings and what they changed).
- **External evidence:** the raw logs, harness scripts, dumps and screenshots behind these numbers are **outside the repository**, in `C:\git\conduit-env-evidence\`
  (`phase1-evidence\` for Phase 1, `m1-evidence\` for Milestone 1 and its follow-up and close-out) and are cited below by name only. They are not repo paths and a reader of this repository cannot open them;
  every claim that matters is stated here with its numbers so it can be re-measured with the commands in `docs/env/reset-and-boot.md` and `tools/`.
  Their harness scripts take that location as an explicit, asserted root (they used to assume the evidence sat inside the repository).

## 1. The pair

| | Repo | Pinned at | Notes |
|---|---|---|---|
| Frontend | `realworld-apps/vue-realworld-example-app` | `f7e48c8178602ce25d43293bc6f8ca51d84ae222` | API origin set through its own `VITE_API_URL` build hook; no patch |
| Backend | `c4ffein/realworld-django-ninja` | `04ef47ced437ee8795a13bdcbc2eff2be19e33bd` | Django 5.2.1 on PostgreSQL 18, Django `runserver` |

**How it was chosen:** by the frozen decision rule in [PHASE1-REPORT.md](../PHASE1-REPORT.md) section 1, applied mechanically; the trace is section 6 of that report.
The backend was decided by key 1: only django-ninja booted an open-source server database in its default compose.
It would have lost key 2 (lockfile) to aspnetcore had key 1 not come first, and "cleaner wins" (key 3) never operated because all four survivors scored 154/154 Hurl.
The frontend came from keys 2 to 4 inside a three-way tie on locatability (38 / 37 / 37, band 3): angular lost on patch-versus-build-arg, vue beat mutoe on recency.

**Costs accepted with the backend:** no lockfile (addressed in section 2), Django's development server, `pydantic>=` and `typing-extensions>=` unpinned upstream and `jwtninja` with no version at all (addressed in section 2),
six `/auth/*` operations outside RealWorld (a coverage-gap flagger on the attempt side must exclude them), and wildcard CORS plus the upstream default credentials (see section 4).

**Rulings on record (lodmaome):**
- react-fsd stays out. It scored highest on the locatability instrument (42 against 38) but is eliminated by the frozen "a second failure counts" clause, and that second failure was a fault in the assistant's own harness.
  Reinstating it after seeing that it would win is the post-hoc tuning the frozen rule exists to prevent. Not reopened.
- Elm stays out by the same clause (two harness faults); it could not have changed the outcome.
- Hurl results are on Hurl 8.0.1 against spec commit `ebbcdeb8d55b42a3a613c787560498b8ef10003f`.

## 2. Dependency lock: `env/backend/requirements.lock.txt` and `build-tools.lock.txt`

**Decision.** The backend's Python dependencies are installed from hash-pinned lock files, generated at pin time inside a Linux container on the digest-pinned Python base
(`tools/lock-backend.sh`, `env/backend/Dockerfile.lock`) and installed with `pip install --require-hashes`.
`requirements.lock.txt` pins all 31 runtime packages with 527 hashes. `build-tools.lock.txt` pins `setuptools`, `wheel` and `packaging` (see below).
The files are requirements locks and are installed with `-r`; they used to be called `constraints.txt`, which was misleading (next section).

**The lock reproduces what Phase 1 measured.** The generator resolves under `env/backend/lock-seed.txt`, which is the set Phase 1's build installed and which scored 154/154.
Without the seed, a resolution run the next day differed in exactly one package: `dnspython` 2.8.0 became 2.9.0.
That is a transitive dependency of `email-validator==2.1.1`, so upstream's own exact pins did not prevent it. The installed set in the built image (`pip freeze`) equals the Phase 1 set: 31 packages, nothing added.
A `--no-cache` regeneration, also after the rename and after the fetch method changed (section 4), gives the same packages, versions and hashes; only the header comment differs.

**Measured facts that shaped the design** (external evidence: the Milestone 1 constraints experiments):
- *The obvious design does not work.* `pip install --require-hashes -c constraints.txt .` fails with
  `Can't verify hashes for these file:// requirements because they point to directories`. A constraints file that carries hashes puts pip into hash-checking mode, which cannot cover the local project.
  So the lock is installed with `-r`, and the project itself is not installed (its `pyproject.toml` declares `py-modules = []`; the app runs from `/app`).
- *Two packages are source-only:* `psycopg2` 2.9.6 and `coreschema` 0.0.4. Both are built from source at image build time.
- *Hash checking does not cover pip's isolated build environment.* With default build isolation under `--require-hashes`, pip's build subprocess downloaded `setuptools-84.0.0` with no hash check (twice).
  The base image ships no setuptools or wheel. So `build-tools.lock.txt` is installed first, hash-checked, and the real install uses `--no-build-isolation`; the build tools are uninstalled afterwards.
- *Upstream's `pip install --upgrade pip` is dropped.* It made the pip version a function of the day. The digest provides pip 25.0.1.

**Proof that no download escapes a hash check** (run on 2026-10-09 against both the real `--no-cache` build log and an instrumented copy of the same two commands with `-vv` and pip's JSON `--report`):
- the real build log shows 34 `Collecting` lines and 34 file downloads (3 build tools + 31 runtime packages), and all 34 `Collecting` lines name their lock file (`from -r /opt/lock/...`);
- none is an unpinned requirement and none belongs to a build-isolation subprocess (`Installing build dependencies`, `pip subprocess`, `Collecting setuptools>=...` all absent; the presence counts above show the log was read, which matters because it is UTF-16 when written through PowerShell and `grep` sees nothing in it until converted);
- in the instrumented run, every installed file's sha256 is one of that package's locked hashes, at the locked version, and the counts match the locks exactly (3 of 3, 31 of 31);
- pip opened connections to `pypi.org` and `files.pythonhosted.org` only. Other hosts appear in the log only inside message text (a yanked-release notice, the root-user warning, setuptools deprecation notes).
- *Enforcement,* not just presence: `tools/check-lock-hashes.sh` builds the real Dockerfile with **every** hash of one package zeroed and requires a failure that names the package; a control build of the unmodified files must succeed.
  It covers a runtime package (`annotated-types`) and a build tool (`setuptools`). Result: control builds, both mutations fail with `THESE PACKAGES DO NOT MATCH THE HASHES FROM THE REQUIREMENTS FILE ... Expected sha256 000... Got 0641...`.
  Zeroing every hash is necessary: corrupting only one made pip fall back to another listed file of the same version and no mismatch was reported (a partial mutation proves nothing).

**Snapshot header (decision "b+", extended to two lock files).** The served-OpenAPI snapshot (`docs/env/contract/openapi.<backend-sha7>.json`, Milestone 2) starts with a header that holds the backend sha7 and the hash of **each** lock file.
`tools/lock-hashes.sh` prints the header lines, exactly these three in this order:

```
backend-sha7: 04ef47c
requirements-lock-sha256: <64 hex>
build-tools-lock-sha256: <64 hex>
```

- `backend-sha7` is the first 7 hex characters of `BACKEND_SHA` in `env/pins.env`.
- Each hash is the SHA-256 of the file's bytes as committed. `env/.gitattributes` forces LF under `env/`, so the working-tree bytes equal the committed bytes on every platform and no normalisation is applied.
- One hash per file, never a combined hash, so a failing check names the file. The static release-gate check recomputes the three lines from `env/pins.env` and the two lock files and compares them with the snapshot header; any difference fails the gate.
- Both files are covered because a change in either changes what gets built, although only the runtime lock can change the served OpenAPI document. At this commit: `requirements-lock-sha256: bc0cbf461a121bc93d8829a502887c3b6321e72c5335b7b9b828e188042c15d0`, `build-tools-lock-sha256: 8d9339e27bd7cc752064a813d457ecebde5091e5d0799bb7fee8c297265cde64`.
  Regenerating either file changes its hash, which is the point.

**apt packages are not pinned. This is a known limitation (accepted in review), not an oversight.** `psycopg2` needs `gcc` and `libpq-dev` to compile, and the backend fetch stage needs `git` (section 4). The decision is to list the drift rather than pin versions, because:
- `apt-get install libpq-dev gcc` pulls **76** packages. Pinning only the two named packages leaves 74 floating; pinning all 76 means maintaining 76 version strings.
- The Debian mirror serves the current version of each package. At the time of measurement `libpq-dev` was offered in two versions at once (15.19 from `bookworm-security`, 15.18 from `bookworm`),
  so a version string pinned today stops resolving at the next security update, and the build fails instead of drifting.
- What was installed is recorded in every build log as `apt-installed:` lines: `gcc 4:12.2.0-3`, `gcc-12 12.2.0-14+deb12u1`, `libc6-dev 2.36-9+deb12u14`, `libpq-dev 15.19-0+deb12u1`, `libpq5 15.19-0+deb12u1`, and for the fetch stage `git 1:2.39.5-0+deb12u3`.
  `libpq5` is the one that matters at runtime (it is the client library `psycopg2` links against). `git` is in a throwaway build stage and ships in no image.
- **The fetch stage's `git` adds 17 more unpinned packages** (`apt-get install --no-install-recommends git` reports "17 newly installed"; the build log prints `apt-installed: git 1:2.39.5-0+deb12u3` through the same `dpkg-query` line as the others, confirmed in the `--no-cache` build log). That brings the unpinned apt surface to 76 packages in the image stage plus 17 in the throwaway fetch stage. Decision (lodmaome): keep apt `git` rather than a digest-pinned git image.

Not tried: `snapshot.debian.org` (would pin the whole apt state but adds a flaky third-party dependency) and `--no-install-recommends` for the compile step (31 packages instead of 76; the compile was not tested, and it would differ from the image that scored 154/154).

## 3. The migrate one-shot runs `migrate` only

**Decision.** The `migrate` service runs `python manage.py migrate` and nothing else, and must exit 0 before `api` starts.

**Deviation, logged.** The K1 rule cited the repo's own compose command, `makemigrations && migrate`. We do not run `makemigrations`.
The audit ([PHASE1-REPORT.md](../PHASE1-REPORT.md) section 14) showed it is a no-op at this SHA: 8 repo migrations are committed and 29 are applied in total.
Running it at boot would silently turn a pin bump that changes a model without a migration into a schema nobody reviewed.

**The "no model lacks a migration" check is not in the boot path** (review ruling). It belongs to the Milestone 2 verify script and to CI, where a failure is a test result and not a failed boot.
The command is `docker compose exec -T api python manage.py makemigrations --check --dry-run` (exit 0 means "No changes detected", exit 1 means a model has no migration; it writes nothing).
Evidence kept from Milestone 1: control at the pin exits 0; mutation (a model field added without a migration, in a throwaway container) prints the migration it would create and exits 1 (external evidence: the Milestone 1 mutation log).
Putting the check in the one-shot cost about 1.0 s per boot (measured three times); removing it is part of the boot-time change in section 6.

## 4. The stack

- **`compose.yaml` is a thin entry point.** It `include`s `env/stack.yaml` with `env_file: env/pins.env`, so every SHA and digest lives only in `env/pins.env`, and plain `docker compose up -d --wait`
  works with no `--env-file` flag and no root `.env` (a root `.env` is attempt territory). Accepted in review.
- **Order:** `db` (healthy) then `migrate` (exit 0) then `api` (healthy) then `frontend` (healthy).
- **Ports:** frontend 4180, API 4181 (`/api`), database 4182, all published on `127.0.0.1` only (verified with `Get-NetTCPConnection`: three listeners, all `127.0.0.1`).
- **No reverse proxy.** The frontend is built with `VITE_API_URL=http://localhost:4181/api` and talks to the API cross-origin, so attempts meet real CORS behaviour. Changing a port needs a rebuild.
- **API health** is `GET /api/tags` (no health endpoint exists), from inside the container with Python's `urllib`, because the image has neither `curl` nor `wget`.
- **Database volume** is a named volume mounted at `/var/lib/postgresql`, the path upstream's own compose mounts for PostgreSQL 18. `down -v` is therefore the explicit reset; a plain `down` keeps the data.
- **One build, two names.** `migrate` and `api` share one build definition; Compose builds it once and exports it under both service names.
- **Base images** are pinned by digest in `env/pins.env`. The bun image is `oven/bun:1.4.2@sha256:9114c058...`: that digest was inspected and is bun 1.4.2 on Debian 13, and `docker buildx imagetools inspect oven/bun:1.4.2` resolves to exactly it
  (so do `1.4`, `1` and `latest`; `1.4.2-debian` is a different digest, so the tag must not be "simplified").

**Upstream is fetched at build time, never vendored. Submodules (review item 3).**

| Repo | Submodule | Gitlinked commit | Needed to build or run? | What we do |
|---|---|---|---|---|
| backend | `realworld` (`realworld-apps/realworld`) | `450bbc5410c7c1b7feca0f238e002162468e2a6c` | no: only the Makefile and CI use it (Hurl suite) | **skipped** |
| backend | `fronts/vue3-realworld-example-app` (`mutoe/...`) | `b14ba5011cf9cc97babfcd7ca99dcfbb058862e7` | no | **skipped** |
| backend | `fronts/react-redux-realworld-example-app` (`khaledosman/...`) | `53b0b4c0b8c371053a8d082ff9a42bfae68f3755` | no | **skipped** |
| frontend | `realworld` (`realworld-apps/realworld`) | `dd53ae6ef11e492a74feabc8043133e9f5283967` | **yes**: `src/main.js` imports `../realworld/assets/theme/styles.css` | fetched, cannot be skipped |

- *Needed?* Checked by grepping the fetched sources: no application code under `apps/`, `config/`, `helpers/` or `manage.py` reads the backend's submodule directories; the frontend build imports its one.
- *Can they be skipped?* BuildKit's `ADD <git>` and git build contexts clone submodules recursively and document no option to disable that (`submodules` is not a URL parameter). So the backend uses a fetch stage that runs `git fetch --depth 1 <repo> <sha>`, checks out that commit, **asserts `git rev-parse HEAD` equals `BACKEND_SHA`** and discards `.git`, then copies the tree into the image.
  The cost is `git` from apt in a throwaway build stage (17 packages, not shipped, unpinned like the other apt packages). Measured: the result equals the `ADD` result in file content and in modes and owners for all 76 paths outside the three submodule directories, which are empty (0 entries against 10, 20 and 14);
  the tree is 372 KB against 6,044 KB, and the backend image went from 671 MB to 662 MB.
  The backend build no longer depends on two personal third-party repositories that the app never reads.
- The frontend keeps `ADD <git>#<sha>`, which fetches exactly its one required submodule at the commit above. `docs/env/THIRD-PARTY.md` (Milestone 2) needs a row for that spec checkout.

**Stale images and `pull_policy: build` (review item 10).** Images are tagged with the pinned SHA only, so with Compose's default `missing` policy a changed build arg, Dockerfile or lock file under an unchanged SHA silently reuses the old image.
Every service that has a `build:` now has `pull_policy: build`, so each `up` runs the (cached) build. Proof by build-arg mutation on the frontend, `VITE_API_URL` changed to `http://localhost:4999/api` by an override file:

| Step | Image id | Bundle contains `:4181` / `:4999` |
|---|---|---|
| baseline | `61e1c8f7c276` | 1 / 0 |
| control: `pull_policy: missing` + mutated arg | `61e1c8f7c276` (unchanged) | 1 / 0, **stale** |
| `pull_policy: build` (as committed) + mutated arg | `018901dfd1dc` (rebuilt) | 0 / 1 |
| restore: plain `up` | `32dcdbc81891` (rebuilt) | 1 / 0 |

The cost is a cached build pass inside every `up` (section 6). Not tested: `up` with no network at all (whether BuildKit contacts GitHub even when every step is cached).

**Where an attempt extends the stack (decision, lodmaome, 2026-10-09): `compose.override.yaml` at the repository root, beside `compose.yaml`.**
The environment never ships that file (it is attempt territory, so it is not on `env/OWNED.txt`). The environment's own CI will run `docker compose -f compose.yaml ...`, which disables Compose's auto-load, so a clone's override can never change what the environment's own verification proves.
The earlier default, `attempt/compose.yaml`, is dropped, and with it the `attempt/.gitkeep` seed (`env/SEED.txt` keeps `docs/attempt/.gitkeep`). The decision was gated on a test; the gate passed on its third run (the first two runs failed for reasons in the test, below).

Gate, run against the included stack on 2026-10-09 with a temporary `compose.override.yaml` and a temporary `attempt-probe/` directory in the repo root, both deleted afterwards (Compose 5.5.1, Windows). All paths in the override are written relative to the repo root:

| Check | Result |
|---|---|
| (a) plain `docker compose up -d --wait` auto-loads it | **yes**: exit 0; the running `api` container has the added environment variable; the added bind mount is visible inside it; the new `runner` service built from `./attempt-probe/runner`, ran, read the bind-mounted file and got `GET /api/tags` 200 |
| (b) `docker compose -f compose.yaml ...` | **does not load it**: `config` shows the 4 shipped services and no added variable; a real `up` recreated `api` without the variable (and warns about the `runner` container as an orphan) |
| (c) `COMPOSE_FILE` set in the environment | **does not auto-load it**: neither `config` nor a real `up` applied the override (tested with `COMPOSE_FILE=compose.yaml`) |
| (d) it can change an included service, add a service with a relative build context, add a bind mount | **yes to all three**, and the pins from `env/pins.env` were still interpolated in the merged result; the build context and the bind source resolved to absolute paths under the repo root |
| (e) `docker compose config` shows the merged result | **yes**: 5 services (`api`, `db`, `frontend`, `migrate`, `runner`) with the variable, the mount and the build context; `docker compose ls` shows `compose.yaml,compose.override.yaml` as the project's config files |

Known behaviour, to go into `ATTEMPTS.md` (Milestone 2) and the runbook:
- **The auto-load is invisible.** `up` prints nothing about the override; only `docker compose config` and `docker compose ls` show that it is in effect.
- **`-f` or `COMPOSE_FILE` bypasses it.** Anyone who sets either gets the bare environment, and an attempt's services become orphans (a warning, not an error).
- **Every `docker compose` call without `-f` picks it up**, including the environment's own `tools/reset.sh` and `tools/dump-state.sh` and every command in `docs/env/reset-and-boot.md`. In a clone that is intended (the reset resets the attempt's whole stack, and a broken override will make the reset fail), but the environment's verification must use `-f compose.yaml`.
- **A one-shot service in the override makes `up --wait` exit non-zero** (`container ... exited (0)`) unless another service depends on it with `service_completed_successfully`. Attempts should add long-running services, or keep one-shot runners out of `up`.
- **An attempt's built services need `pull_policy: build`** (as the environment's do): the stale-image behaviour above applies to them too, and the gate hit it (run 2 reused an image from run 1).

Not tested: other override file names (`compose.override.yml`), running `docker compose` from a subdirectory of the repo (Compose may search parent directories), an explicit `-f compose.yaml -f compose.override.yaml`, Linux and Actions.

Earlier tests of other extension styles, kept for the record (review item 13; an `attempt/` directory with a relative build context and a bind mount). They show paths resolve against the repo root, not the override file's own directory, whichever way an extra file is named:

| Variant (the extra file lived in `attempt/`) | Result |
|---|---|
| A. `-f compose.yaml -f attempt/compose.yaml`, paths written relative to the **repo root** | works: context and bind source resolve under `attempt/`; an override on `api` merges and the pins still interpolate |
| B. `COMPOSE_FILE=compose.yaml:attempt/compose.yaml` with `COMPOSE_PATH_SEPARATOR=:` | works, same result |
| B2. `COMPOSE_FILE=compose.yaml;attempt/compose.yaml` (the Windows default separator) | resolves to the same build context |
| C. the same file with paths written relative to `attempt/` (`./runner`, `./data`) | **pitfall**: paths resolve against the repo root (the project directory is the first file's), so the build fails with `unable to prepare context: path ".../runner" not found` |
| D. an attempt-owned file in `attempt/` that `include`s `../compose.yaml` | **fails** from the repo root (`GetFileAttributesEx ..\env\pins.env`): the nested `env_file` is resolved against the working directory, not the including file; works when run from inside `attempt/` |
| D3. an attempt-owned file **at the repo root** that `include`s `compose.yaml` | works, paths relative to that file |

Rules for `ATTEMPTS.md` that follow: write an attempt's extension as `compose.override.yaml` at the repo root, with every path relative to the repo root; do not `include` `compose.yaml` from a file in a subdirectory (D).

- **Safety statement.** The upstream defaults are insecure: PostgreSQL password `0000`, `ALLOWED_HOSTS=*`, Django `runserver`, wildcard CORS. That is acceptable only because every port is bound to `127.0.0.1`.
  Local and CI use only; not a production reference.

## 5. Lessons

**From Phase 1**
- Both formal knockouts (react-fsd and Elm) were harness faults, not faults of the repos: the "second failure counts" clause did exactly what it was written to do, and the price is a frontend that scored higher on one instrument.
- The per-stage wall-clock caps were about five times too high: Phase 1 took 74 minutes against a 6 hour cap.
- The R3 locatability instrument was revised three times after seeing results. Each time the cause was an instrument error, and the same final instrument was applied to every frontend, but it did not decide the frontend under the frozen rule.
- Positive controls and mutation checks caught real errors (a `head` cutoff that hid a CORS config; `pg_dump` nonce lines that made equal schemas differ).
- Docker Desktop's engine stopped once, unexplained, during Phase 1, and was found stopped again at the start of Milestone 1. The environment never starts or stops it.

**From Milestone 1 and its review**
- The same habit caught the assistant's own errors again: a one-hash mutation that proved nothing; a timing run whose first boot silently pulled an image; a regeneration check that only replayed the cache; a gate whose shell globbing made an ownership check pass or fail for the wrong reason; a log analysis that was blind because the log was UTF-16. Every check with an "absence" claim now has a presence control next to it.
- **Second Docker incident: a cleanup step deleted images that were not the environment's.** The cause was a deny-list cleanup ("remove everything not in the snapshot") run with an unchecked, empty snapshot: the script's repository-root path was wrong, the snapshot file was not found without any error, and `docker rmi -f` removed five of the owner's own images. A deny-list fails open: any bug in building the list turns it into "remove everything". (The first Docker incident was Phase 1's: the engine stopped unexplained and the harness tried to start Docker Desktop from a path that did not exist.)
  **Hard rule since (lodmaome):** no `rm`, `rmi`, `prune` or `-f` against Docker, except through **one reviewed script** that selects only resources carrying our label or the `conduit-env/` prefix, prints the list, and waits for explicit approval before removing anything. **No such script exists yet; until one is reviewed, nothing is removed.**
  A cold-build measurement needs no image removal: use `--no-cache`. If a permission rule refuses a Docker command, stop and say so; never work around it. Never start or stop Docker Desktop.
  The one removal that remains is the documented reset, `tools/reset.sh` (`docker compose down -v --remove-orphans`), which Compose scopes to this environment's own project (its containers, network and database volume); it runs only on request. Whether it falls under the hard rule is an open question for review (section 7).
  Harness scripts that removed images are disabled; the others take explicit, asserted roots. Scripts and tools that build use `--output type=cacheonly` where an image is not needed, so they do not leave untagged images that this rule would forbid removing.
- **Commit hygiene.** `git commit` takes everything already staged, including an earlier `git mv`. Commit `f368757` ("track PHASE1-REPORT.md, content unchanged") therefore also contains the two lock-file renames, and the message of `91731ad` describes renames that landed in `f368757`. Decision (lodmaome): **not rewritten now.** The author identity is decided (keep `leandro.donato@ymail.com`), so the only remaining reason is the misleading message, which is cosmetic. Any rewrite is optional, only just before the Milestone 3 push, after `git branch backup/pre-rewrite`, and only with explicit go-ahead.
  Since then: run `git status --short` before every commit and stage explicit paths.

## 6. Measurements

All numbers are **indicative**: one Windows 11 laptop (10.0.26300), Docker Desktop engine 29.8.2, Compose 5.5.1, buildx 0.37.2, 20 CPUs, about 15 GiB for the engine VM, a network whose throughput varied by about 30x during the first session
(the Debian mirror delivered 191 kB/s in one run and 6 MB/s in another). External evidence: the follow-up timing harness and its logs.

| Measurement | Result | What it includes |
|---|---|---|
| `docker compose build --no-cache`, this work's images removed first | **44.5 s** | the backend built once (shared by `migrate` and `api`), including the git fetch stage, and the frontend; no reused RUN/ADD cache |
| the same with all images present | **44.5 s** | |
| pull of the `postgres` image (`docker compose build` never pulls it) | **12.3 s** | |
| boot as documented: `down -v`, then `up -d --wait` (runs the cached build pass first) | **12.5 s, 11.9 s, 11.5 s; median 11.91 s** | database init, migrations, three health checks, and the `pull_policy: build` pass |
| the same with `up -d --wait --no-build` | **10.0 s, 9.8 s, 10.0 s; median 10.01 s** | the boot without the build pass |
| clone to healthy, **estimate** (12.3 + 44.5 + 11.9) | about **69 s** | a sum of separately timed steps, not one timed run |

**Read these as lower bounds.** The python, bun and nginx base layers live in BuildKit's content store, which was not pruned, so the 44.5 s row does not include a registry-cold pull of them;
the two build rows being equal is consistent with that. The BuildKit cache is kept, and every "builds from scratch" figure uses `--no-cache`. A green local build proves less than a green Actions run: nothing has run on `ubuntu-24.04` or on Actions yet.
Compare an Actions cold boot against the clone-to-healthy estimate, never against a boot-only row.

**Boot, against earlier numbers.** Phase 1: 8.69 s median (no check, no build pass). Milestone 1 as first built: 10.68 s (the migrations check inside `migrate`, about 1.0 s). Now: 10.01 s without the build pass, 11.91 s with it.
The build pass costs about 1.9 s per `up`. After removing the check the boot is still about 1.3 s slower than Phase 1's; that remainder is **not attributed** (candidates: the named volume, the published database port, machine state; none was isolated).

**Images:** backend 662 MB (Phase 1: 727 MB), frontend 94.1 MB (94 MB).

**Hurl (review item 1).** Hurl 8.0.1 (by digest `sha256:49a02dc3...`), spec `ebbcdeb8...`, `--test --continue-on-error --jobs 1`, fresh database, run once through the compose network against the final stack: **154 of 154 entries, 13 of 13 files, Hurl exit 0**; the Phase 1 scorer reports raw 100 %, adjusted 100 %, 0 cascade.
Control: the same runner and scorer pointed at an unreachable port exit 3 with 0 of 154 passing (49 failures, 105 cascade), so the pass is not vacuous. This matches Phase 1's 154/154 for the same backend SHA and spec, on an image that now differs from Phase 1's in pip 25.0.1, the hash-checked install and the skipped submodules.

**Reset cycles (R6, Milestone 1).** Two cycles of `tools/reset.sh` followed by `tools/dump-state.sh` gave **identical** schema, row counts, applied migrations and data dumps.
The initial state is 17 tables, 29 applied migrations, and only framework rows (`auth_permission` 40, `django_content_type` 10, `django_migrations` 29); no application rows.
Controls: two raw `pg_dump`s of one unchanged state carry different `\restrict` nonces, so stripping them is necessary; registering one user makes the diff non-empty and a reset restores equality.
The schema, row counts and migration list also equal Phase 1's R6 dumps for the same backend SHA and PostgreSQL digest (the schema after dropping comments, blank lines and `OWNER TO` statements).
That first measurement predates the follow-up changes (migrate command, backend fetch). **Repeated at the Milestone 1 close-out on the final stack:** two more cycles of `tools/reset.sh` and `tools/dump-state.sh` with the nonce lines stripped (0 left) are identical to each other and byte-identical to the original Milestone 1 initial state (`diff -r` exit 0, same file sizes). The registered-user mutation control was not repeated (the tool is unchanged, and the control was run when it was written).

## 7. Open items and known limitations

Accepted in review: the `include` plus `env_file` layout, and apt drift as a known limitation.

1. **`env/SEED.txt` lists three files that do not exist yet** (`README.md`, `LICENSE`, `docs/attempt/.gitkeep`; `attempt/.gitkeep` was dropped with the `compose.override.yaml` decision). Milestone 2 and the tag step create them. The release check that `attempt/` and `docs/attempt/` hold only `.gitkeep` becomes a check on `docs/attempt/` only, plus a check that no `compose.override.y*ml` is tracked by the environment.
2. **Not re-run:** a real-browser flow against the compose-built pair (the raw-CDP check is Milestone 2). The reset-cycle dumps were repeated at the close-out (section 6).
3. **`up` without network** was not tested (see section 4, `pull_policy: build`).
4. **Nested include from a subdirectory** fails (section 4, variant D); documented, not fixed.
5. **Three submodule repositories are no longer fetched by the backend build**, but the frontend still depends on `realworld-apps/realworld` at `dd53ae6ef11e492a74feabc8043133e9f5283967` existing at build time.
6. **apt packages float** (including `git` in the fetch stage); PyPI, GitHub, Docker Hub and the Debian mirror must be reachable at build time.
7. **One unattributed second** in the boot time against Phase 1 (section 6).
8. Nothing has run on `ubuntu-24.04` or on GitHub Actions; Chrome is the only browser measured in Phase 1.
9. **`tools/reset.sh` is a removal** (`docker compose down -v --remove-orphans`, scoped by Compose to this environment's project). It was run on request at the close-out. Whether the hard rule in section 5 covers it, or whether it needs to go through the reviewed script, is for review; until then it is only run when asked.
10. **The reviewed removal script does not exist.** Until one is written and approved, resources this work created and left (images tagged `conduit-env/...`, the `postgres` image pulled by digest, build cache) stay in place.
11. **Milestone 2 consequences of the override decision:** the environment's verification and gate call `docker compose -f compose.yaml`; `ATTEMPTS.md` documents section 4's known behaviour (invisible auto-load, `-f` and `COMPOSE_FILE` bypass, one-shot services, `pull_policy: build`).
