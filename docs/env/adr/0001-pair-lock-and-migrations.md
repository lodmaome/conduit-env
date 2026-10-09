# ADR 0001: The pair, the dependency lock and the migration step

- **Status:** draft for review (Milestone 1). Not tagged. Becomes final when lodmaome approves it.
- **Date:** 2026-10-09
- **Decider:** lodmaome. Drafted with AI assistance (Claude); every claim below carries its evidence path.
- **Evidence:** `PHASE1-REPORT.md` (the pair), `m1-evidence/` (everything measured in Milestone 1).
  Neither is on the `env/OWNED.txt` allow-list yet; where they live in the env repo is an open question (see Open items).

## 1. The pair

| | Repo | Pinned at | Notes |
|---|---|---|---|
| Frontend | `realworld-apps/vue-realworld-example-app` | `f7e48c8178602ce25d43293bc6f8ca51d84ae222` | API origin set through its own `VITE_API_URL` build hook; no patch |
| Backend | `c4ffein/realworld-django-ninja` | `04ef47ced437ee8795a13bdcbc2eff2be19e33bd` | Django 5.2.1 on PostgreSQL 18, Django `runserver` |

**How it was chosen:** by the frozen decision rule in `PHASE1-REPORT.md` section 1, applied mechanically; the trace is section 6 of that report.
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

## 2. Dependency lock: `env/backend/constraints.txt`

**Decision.** The backend's Python dependencies are installed from a hash-pinned file, generated once at pin time inside a Linux container on the digest-pinned Python base
(`tools/lock-backend.sh`, `env/backend/Dockerfile.lock`) and installed with `pip install --require-hashes`.
The file pins all 31 runtime packages with 527 hashes. A second file, `env/backend/build-tools.txt`, pins `setuptools`, `wheel` and `packaging` (see below).

**The lock reproduces what Phase 1 measured.** The generator resolves under `env/backend/lock-seed.txt`, which is the set Phase 1's build installed (`phase1-evidence/logs/django-ninja_k1.log`) and which scored 154/154.
Without the seed, a resolution run the next day differed in exactly one package: `dnspython` 2.8.0 became 2.9.0 (`m1-evidence/logs/constraints-experiments/unseeded_resolution_*`).
That is a transitive dependency of `email-validator==2.1.1`, so upstream's own exact pins did not prevent it. The installed set in the built image (`pip freeze`) equals the Phase 1 set, 31 packages, nothing added.

**Measured facts that shaped the design** (all in `m1-evidence/logs/constraints-experiments/`):
- *The obvious design does not work.* `pip install --require-hashes -c constraints.txt .` fails with
  `Can't verify hashes for these file:// requirements because they point to directories`. A constraints file that carries hashes puts pip into hash-checking mode, which cannot cover the local project.
  So the file is installed with `-r`, and the project itself is not installed (its `pyproject.toml` declares `py-modules = []`; the app runs from `/app`).
  The file is still called "constraints" because that is the term used throughout the plan; that name is slightly misleading and is one rename away from being fixed.
- *Hash enforcement is real, but a partial mutation proves nothing.* Zeroing every hash of one package makes the install fail (`Expected 000... Got 0641...`, exit 1).
  Corrupting only one hash did not report a mismatch: pip fell back to another distribution of the same version whose hash was still listed.
- *Two packages are source-only:* `psycopg2` 2.9.6 and `coreschema` 0.0.4. Both are built from source at image build time.
- *Hash checking does not cover pip's isolated build environment.* With default build isolation under `--require-hashes`, pip's build subprocess downloaded `setuptools-84.0.0` with no hash check (twice).
  The base image ships no setuptools or wheel. So `build-tools.txt` is installed first, hash-checked, and the real install uses `--no-build-isolation`; the build tools are uninstalled afterwards.
- *Upstream's `pip install --upgrade pip` is dropped.* It made the pip version a function of the day. The digest provides pip 25.0.1.

**apt packages are not pinned. This is a known limitation, not an oversight.** `psycopg2` needs `gcc` and `libpq-dev` to compile. The decision is to list the drift rather than pin versions, because:
- `apt-get install libpq-dev gcc` pulls **76** packages. Pinning only the two named packages leaves 74 floating; pinning all 76 means maintaining 76 version strings.
- The Debian mirror serves the current version of each package. At the time of measurement `libpq-dev` was offered in two versions at once (15.19 from `bookworm-security`, 15.18 from `bookworm`),
  so a version string pinned today stops resolving at the next security update, and the build fails instead of drifting (`m1-evidence/logs/apt_versions.txt`).
- What was installed is recorded in every build log as `apt-installed:` lines: `gcc 4:12.2.0-3`, `gcc-12 12.2.0-14+deb12u1`, `libc6-dev 2.36-9+deb12u14`, `libpq-dev 15.19-0+deb12u1`, `libpq5 15.19-0+deb12u1`.
  `libpq5` is the one that matters at runtime (it is the client library `psycopg2` links against).

Not tried: `snapshot.debian.org` (would pin the whole apt state but adds a flaky third-party dependency) and `--no-install-recommends` (31 packages instead of 76; the compile was not tested, and it would differ from the image that scored 154/154).

## 3. The migrate one-shot runs `migrate`, then checks

**Decision.** The `migrate` service runs `python manage.py migrate` and then `python manage.py makemigrations --check --dry-run`, in that order, as one one-shot that must exit 0 before `api` starts.

**Deviation, logged.** The K1 rule cited the repo's own compose command, `makemigrations && migrate`. We do not run `makemigrations` to generate anything.
The audit (`PHASE1-REPORT.md` section 14) showed it is a no-op at this SHA: 8 repo migrations are committed and 29 are applied in total.
Running it at boot would silently turn a pin bump that changes a model without a migration into a schema nobody reviewed.
The `--check --dry-run` form generates nothing and exits non-zero in that case, so the stack fails at `up` instead.

**Evidence.** Control at the pin: `No changes detected`, exit 0. Mutation (a model field added without a migration, in a throwaway container): the check prints the migration it would create and exits 1; the dry run wrote no file
(`m1-evidence/logs/makemigrations_check_mutation.txt`).

**Why in the same one-shot.** A failing check then blocks `api` on every boot, in CI and on a laptop. A separate service or a step in the verify script (Milestone 2) are alternatives; the cost of this choice is that an attempt whose stack stops here gets the failure at `up` rather than in a test report.

## 4. The stack

- **`compose.yaml` is a thin entry point.** It `include`s `env/stack.yaml` with `env_file: env/pins.env`, so every SHA and digest lives only in `env/pins.env`, and plain `docker compose up -d --wait`
  works with no `--env-file` flag and no root `.env` (a root `.env` is attempt territory). Rendered config checked with `docker compose config`.
  Not yet checked: how an attempt's override file merges with a service defined in an included file (flagged for the attempt rehearsal in Milestone 3).
- **Order:** `db` (healthy) then `migrate` (exit 0) then `api` (healthy) then `frontend` (healthy).
- **Ports:** frontend 4180, API 4181 (`/api`), database 4182, all published on `127.0.0.1` only (verified with `Get-NetTCPConnection`: three listeners, all `127.0.0.1`).
- **No reverse proxy.** The frontend is built with `VITE_API_URL=http://localhost:4181/api` and talks to the API cross-origin, so attempts meet real CORS behaviour. Changing a port needs a rebuild.
- **API health** is `GET /api/tags` (no health endpoint exists), from inside the container with Python's `urllib`, because the image has neither `curl` nor `wget`.
- **Database volume** is a named volume mounted at `/var/lib/postgresql`, the path upstream's own compose mounts for PostgreSQL 18. `down -v` is therefore the explicit reset; a plain `down` keeps the data.
- **One build, two names.** `migrate` and `api` share one build definition; Compose built it once and exported it under both service names.
- **Upstream is fetched at build time, never vendored,** with `ADD <repo>#<sha>`. This also checks out the repos' **git submodules**, which the plan did not list:
  the backend has three (`realworld-apps/realworld`, `mutoe/vue3-realworld-example-app`, `khaledosman/react-redux-realworld-example-app`, about 5.7 MB, unused at runtime) and the frontend has one (`realworld-apps/realworld`).
  That is four checkouts from three distinct repositories (the spec is shared), and the builds depend on them existing at the gitlinked commits. Phase 1's `docker buildx build <git-url>#<sha>` populated submodules the same way (observed there for angular's; `PHASE1-REPORT.md` section 5.1), so this is expected parity, not a verified one for the backend's image.
  They need rows in `docs/env/THIRD-PARTY.md`.
- **Safety statement.** The upstream defaults are insecure: PostgreSQL password `0000`, `ALLOWED_HOSTS=*`, Django `runserver`, wildcard CORS. That is acceptable only because every port is bound to `127.0.0.1`.
  Local and CI use only; not a production reference.

## 5. Lessons carried from Phase 1

- Both formal knockouts (react-fsd, Elm) came from the assistant's own harness faults, not from the repos. The "second failure counts" clause did what it was written to do, at the price of a likely better frontend.
- The per-stage wall-clock caps were about five times too high: Phase 1 took 74 minutes against a 6 hour cap.
- The R3 locatability instrument was revised three times after seeing results. Each time the cause was an instrument error, and the same final instrument was applied to every frontend, but it did not decide the frontend under the frozen rule.
- Positive controls and mutation checks caught real errors (a `head` cutoff that hid a CORS config; `pg_dump` nonce lines that made equal schemas differ). The same habit caught two errors in this milestone (section 2: a one-hash mutation that proved nothing; an installed-package check that needed `-r`, not `-c`).
- Docker Desktop's engine stopped once, unexplained, during Phase 1. It was found stopped again at the start of Milestone 1. The environment never starts or stops it.

## 6. Measurements (Milestone 1)

All numbers are **indicative**: one Windows 11 laptop (10.0.26300), Docker Desktop engine 29.8.2, Compose 5.5.1, buildx 0.37.2, 20 CPUs, about 15 GiB for the engine VM, a network whose throughput varied by about 30x during the session
(the Debian mirror delivered 191 kB/s in one run and 6 MB/s in another). Raw logs and the harness are in `m1-evidence/measurements/` and `m1-evidence/harness/measure_m1.ps1`.

| Measurement | Result | What it includes |
|---|---|---|
| `docker compose build --no-cache`, locally listed images removed first | **44.7 s** | the backend built once (shared by `migrate` and `api`), the frontend, no reused RUN/ADD cache |
| the same with all images present | **43.2 s** | |
| pull of the `postgres` image (`docker compose build` never pulls it) | **14.4 s** | |
| boot only: `down -v`, then `up -d --wait`, images built | **10.7 s, 10.6 s, 10.7 s; median 10.68 s** | database init, migrations, the migrations check, three health checks |
| clone to healthy, as a sum of the three rows above | about **70 s** | a sum of separately timed steps, not one timed run |

**Read these as lower bounds.** The python, bun and nginx base layers live in BuildKit's content store, which this milestone did not prune (it holds your older cache entries), so the 44.7 s row does not include a registry-cold pull of them;
the two build rows being nearly equal is consistent with that. The BuildKit cache is kept, and every "builds from scratch" figure uses `--no-cache`. A green local build proves less than a green Actions run: nothing has run on `ubuntu-24.04` or on Actions yet.
Compare an Actions cold boot against the clone-to-healthy sum, never against the boot-only row.

**Against Phase 1** (49 s build, 8.69 s boot median): the build is about 5 s faster, which is within what network variation explains. The boot is 2.0 s slower. The added migrations check costs about 1.0 s per run (measured three times, including `docker exec` overhead),
so about half of the difference is explained; the other second is not attributed (candidates: the named volume, the published database port, a different machine state; none was isolated).
A first run of the harness was discarded because its boot 1 silently pulled `postgres` (25.6 s); it is kept as `m1-evidence/measurements_run1_boot1_included_a_pull/` with the reason.

**Images:** backend 671 MB (Phase 1: 727 MB), frontend 94.1 MB (94 MB).

**Reset cycles (R6).** Two cycles of `tools/reset.sh` followed by `tools/dump-state.sh` gave **identical** `schema.txt`, `rowcounts.txt`, `migrations.txt` and `data.txt` (`diff -r` exit 0, `m1-evidence/r6/`).
The initial state is 17 tables, 29 applied migrations, and only framework rows (`auth_permission` 40, `django_content_type` 10, `django_migrations` 29); no application rows.
Controls: two raw `pg_dump`s of one unchanged state carry different `\restrict` nonces, so stripping them is necessary, and the shipped dumps contain none;
registering one user makes the diff non-empty (`accounts_user` 0 to 1, the user row, the id sequence) and a reset restores equality with cycle 1.
The schema, row counts and migration list also equal Phase 1's own R6 dumps for the same backend SHA and PostgreSQL digest (the schema after dropping comments, blank lines and `OWNER TO` statements, which Phase 1's dump format did not contain).

**Other checks run:** the booted stack serves `GET /api/tags` 200, register, login, create article and read back over plain HTTP, a CORS preflight from `http://localhost:4180` (`Access-Control-Allow-Origin: *`, `authorization` allowed),
the SPA fallback, and the bundle contains `http://localhost:4181/api`. BuildKit's own Dockerfile check reports no warnings for the three Dockerfiles. Regenerating the lock with `--no-cache` is byte-identical.

## 7. Open items

These need your decision or are known gaps. None blocks Milestone 1.

1. **Where the evidence lives in the env repo.** `PHASE1-REPORT.md`, `phase1-evidence/` and `m1-evidence/` are not on the `env/OWNED.txt` allow-list, so the release check "every tracked file is OWNED or SEED" would reject them if they were tracked at the root.
   They are untracked for now. Options: move them under `docs/env/` (owned), or keep them outside the env repo and have the ADR cite them as external.
2. **The file name `constraints.txt`.** It is installed with `-r`, not `-c`, so the name is misleading (section 2). Renaming is one line in the script and the Dockerfile.
3. **Where the migrations check runs.** Today inside the `migrate` one-shot (section 3). The alternative is a separate step in the Milestone 2 verify script.
4. **The `include` indirection.** Verified: `-f compose.yaml`, an absolute `-f` from another directory, an override file via `-f`, and `COMPOSE_FILE` with a relative override path all merge cleanly onto the included services.
   Not verified: relative paths inside an attempt's override file (build contexts, bind mounts, `env_file`) against this layout; that belongs to the Milestone 3 attempt rehearsal.
5. **Four extra build-time checkouts from three distinct repositories** (submodules, section 4; the `realworld` spec is shared by both apps). Accepting them is the simplest option and matches how Phase 1 fetched upstream. They are not in the brief's list of upstream components, so `THIRD-PARTY.md` needs rows for them.
6. **`oven/bun:latest@sha256:...`.** The digest is the pin; the `latest` label only records what Phase 1 used. A drift report that resolves the tag will report a change whenever bun publishes a release, which is noise, not drift in the pin.
7. **`env/SEED.txt` lists four files that do not exist yet** (`README.md`, `LICENSE`, two `.gitkeep`). The Milestone 2 and tag steps create them; creating them now was outside this milestone's scope.
8. **Not re-run on the compose-built stack: the Hurl suite and a real-browser flow.** The claim that this stack behaves like the Phase 1 pair rests on identical dependency versions (31 of 31), identical PostgreSQL digest, identical schema, row counts and migrations, and the manual HTTP flow above.
   The image does differ from Phase 1's in pip (25.0.1, no upgrade), the hash-checked install path, and the missing `pip install .` of an empty project. Re-running Hurl 154/154 against it is the direct proof; it was not part of this milestone.
