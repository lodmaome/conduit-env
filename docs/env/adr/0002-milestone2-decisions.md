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

## 3. The verify script (`node tools/verify.mjs`)

**Pre-registered rule** (`m2-evidence\PREREGISTRATION.md`, "Task 1"): healthy stack gives exit 0 and four PASS lines; every check has a failing fixture; the migrations mutation must fail the check and leave the tracked tree and the running stack unchanged.

**What it does.** Node 22, stdlib only; pure parts in `tools/lib/verify-lib.mjs`, I/O-injected checks in `tools/lib/verify-checks.mjs`. Default mode checks whatever listens on `127.0.0.1:4180-4182` and runs one compose command, an `exec`
(`docker compose -f compose.yaml -p conduit-env exec -T api python manage.py makemigrations --check --dry-run`, so an attempt's override is bypassed). All HTTP uses `127.0.0.1`, never `localhost`.
Checks: `tags` (200 and a `tags` array), `api-flow` (register 201, login 200, current user 200, create article 201, read back 200; fields compared, and the read-back must equal the create response), `frontend` (200, `text/html`, `#app`), `migrations`.
Exit status is the number of failed checks; **90** means it could not run (preflight failed, bad argument, reset failed). Verdict lines carry no timestamps. The tool writes no file; credentials are generated per run (`verify-<10 hex>`, `@example.com`
because `.test` is rejected by the backend's email validator, measured; random password) and are redacted from any output, with a JWT-shape redaction as a second layer.

**Preflight, and where the Compose minimum comes from.** Node >= 22, engine reachable (`docker version`; it never starts Docker), Compose >= **2.20.0**, and the state of the three ports (they must listen in the default mode; informational with `--fresh`).
The 2.20.0 bound: the docker/compose v2.20.0 release notes list "Add support for `include`" (read 2026-10-09). The Compose docs page for `include` gives no version for it or for its `env_file` and `project_directory` attributes, which `compose.yaml` also uses.
**So 2.20.0 is a documented lower bound only: untested, and possibly too low.** Only 5.5.1 was ever run; any other accepted version prints a note saying so.

**Tests.** `node --test tools/test/*.test.mjs`: 23 tests, 0 failed (preflight problems, version parsing, article comparison, migrations evaluator including exit 1, odd output, crash and missing docker, redaction with a control, and one fixture per HTTP fault
against a fake server: `tags-500`, `tags-no-array`, `register-422`, `login-401`, `login-no-token`, `me-wrong-user`, `create-500`, `create-alters-body`, `create-alters-tags`, `readback-404`, `readback-differs`, `frontend-500`, `frontend-not-app`, an unreachable server),
each of which must fail exactly the named check; the healthy fake passes all (control). Two tests of mine failed first, both faults in the test (a one-character "secret" that matched inside "text", and a `\n` that became a real newline in a script patch).

**Real runs** (`m2-evidence\t1\`, seen). Default mode on the live stack: exit 0, 4 PASS. `--fresh`: exit 0 after a real `tools/reset.sh` (`verify-fresh.txt`); the project-name guard passes under `COMPOSE_FILE=compose.yaml` (`guard-under-composefile.txt`).
**What one run leaves in the database** (`db-before`/`db-after` dumps, `rowcounts.diff`): `accounts_user` +1, `articles_article` +1, `articles_article_tags` +2, `articles_tag` +2, `jwt_ninja_session` +3. There is no user-delete endpoint, so rows stay until the next reset.
**Migrations mutation** (`tools/check-migrations-mutation.mjs`, `migrations-mutation.txt`): control exit 0 "No changes detected"; in a copy of `/app` made with Python's `tempfile.TemporaryDirectory` inside the running api container, a field added to `Tag` gives exit 1 and `Migrations for 'articles': ... Add field mutation_probe to tag`,
which the verify evaluator reports as FAIL. Unchanged before and after: `git status --porcelain` and HEAD, and for all 4 containers id, start time and state, and `docker diff` of the api container (0 entries both times). The snapshot comparison was itself mutation-tested in-process
(an extra `docker diff` line, or a changed container line, makes the snapshots unequal). Not verified: that `docker diff` reports a write the way I expect (the control would have meant writing into the running container, which I did not do).

**Not verified.** A failing run of the real script against a really broken stack (stack down, a stopped engine): those paths are covered by fixtures and unit tests only. A Compose version other than 5.5.1.

## 4. The raw-CDP browser check (`tools/browser-check.mjs`)

**Correction to the brief (lodmaome):** the expected API origin is not `http://127.0.0.1:4181`. The frontend is built with `VITE_API_URL=http://localhost:4181/api` (`env/stack.yaml`), so the origin baked into the build is `http://localhost:4181`.

**Pre-registered CORS probe** (`m2-evidence\PREREGISTRATION.md`, "Task 2"; output `m2-evidence\t2\cors-probe.txt`, seen). `GET /api/tags` and a preflight `OPTIONS /api/articles` with `Origin` set to `http://localhost:4180`, `http://127.0.0.1:4180` and a control `http://evil.example`:
all three get `access-control-allow-origin: *`; the preflight allows `accept, authorization, content-type, user-agent, x-csrftoken, x-requested-with` and `DELETE, GET, OPTIONS, PATCH, POST, PUT`. So the API accepts any origin (the wildcard was in the ADR; now measured), and the frontend works from either host name.
**Decision:** the docs tell users to open **`http://localhost:4180`**, because that is the name the build was made for (its API calls go to `localhost:4181` either way), and the check loads exactly that URL. Opening `http://127.0.0.1:4180` also works: the check was run against it once (`alt-url-127.txt`, 3 of 3 pass); the page still calls `http://localhost:4181`.
Informational: this machine resolves `localhost` to `::1, 127.0.0.1` in that order; the stack publishes IPv4 only, and Chrome's API responses came from `127.0.0.1`. No failure or visible difference was seen; no timing was measured.

**What it does.** Creates a user and an article through the API (known title), launches its own headless Chrome (`--headless=new`, `--remote-debugging-port=0`, fresh profile `conduit-env-chrome-*` under `os.tmpdir()` with a marker file holding a per-run token, port read from `DevToolsActivePort`),
and over a raw CDP websocket (Node's global `WebSocket`) records `Network.requestWillBeSent`. Assertions: every Fetch/XHR goes to `http://localhost:4181`; none goes to the old origin `https://api.realworld.show` (the Vue source's fallback, PHASE1-REPORT K5 scoping); the rendered page contains the known title.
Non-Fetch/XHR requests to the old origin are printed as informational. Chrome is stopped with `Browser.close`, and only if it is still there, `taskkill /PID <child pid> /T /F` (by PID, never by name); the profile directory is deleted only after re-checking temp dir, prefix and marker.
Without `CHROME_BIN`, or with a path that does not exist, it exits 90 with a readable message (`chrome-bin-errors.txt`, seen); `verify` fails its preflight the same way unless `--no-browser` is given, and then prints `SKIP browser` (never silent).

**Results (seen, `m2-evidence\t2\`, Chrome 154.0.8037.98).** Control, unmutated: 3 of 3 pass (`browser-control.txt`).
Mutation 1, expected origin `http://localhost:9999`: fails with `expected API origin http://localhost:9999, observed http://localhost:4181 (2 Fetch/XHR requests)` (`mut1-wrong-origin.txt`).
Mutation 2, `Network.setBlockedURLs` on the API origin: fails with `2 API request(s) failed (blocked by the DevTools client, reason inspector) and the page did not render the article ...` (`mut2-blocked.txt`). Its first version printed `( (inspector))` for the empty `errorText`; fixed to the readable text above.
After all runs no `conduit-env-chrome-*` directory and no Chrome process whose command line names one was left (checked both ways). `verify` with the browser: 5 PASS (`verify-with-browser.txt`); one browser check adds 1 user, 1 article, 2 article-tag links, 1 tag, 1 session (`browser-rowcounts.diff`).
Unit tests (`tools/test/browser.test.mjs`, 33 tests in all, 0 failed) cover the request evaluation, both mutations, a wrong-origin fixture, an old-origin Fetch, informational-only old-origin images, the presence control (no Fetch/XHR at all must not "pass" the old-origin assertion), the profile-deletion guard and the preflight.

**Unmutated assertion, stated plainly:** `no-old-origin` has no clean mutation in the real browser (it would need a frontend built without `VITE_API_URL`, i.e. a change to the stack); it is mutated in the unit fixtures only, and in the real run it is protected by the presence control above.
**Not verified:** Chrome other than 154, Linux, Actions, headless-shell or Chromium builds; a run with the stack down (the setup step reports `could not run`, not exercised); the check does not click or type (no real user flow; Phase 1's 8-step flow was not repeated).

## 5. Gate tooling (`tools/gate.sh`, `env/gate/`)

**Tools and pins** (`env/gate/tools.env`; digests read 2026-10-09 with `docker buildx imagetools inspect <image>:<tag>`, line `Digest:` of the top-level index; tags are the newest stable release tags the Docker Hub tags API listed that day; `m2-evidence\t3\tags-listing.txt`, `digests-raw.txt`, seen):
shellcheck v0.11.0, actionlint 1.7.12, yamllint (image `pipelinecomponents/yamllint` 0.35.13; the better-known `cytopia/yamllint` was last updated 2023-08-04), hadolint v2.15.1, lychee 0.24.2. Each image is pulled by digest and run only by `tools/gate.sh`, the one `docker run --rm` in the repository:
label `conduit-env.gate=1`, repo mounted read-only after asserting `compose.yaml`, `env/OWNED.txt` and `env/gate/tools.env` exist, `--network none` for all five (lychee's `--online` run is the exception and is informational), a tag-only image reference is refused (tested in the gate: refused, and the pinned control accepted).
The Windows path is handled with `pwd -W` and `MSYS_NO_PATHCONV=1`. File lists come from `git ls-files`, sorted; configs are in `env/gate/` (none at the repo root). Host steps: `docker compose config` with and without `-f compose.yaml` (valid, and identical while no override exists) and `node --test tools/test/*.test.mjs`.

**Fixtures** (`env/gate/fixtures/`, excluded from every real list, and the gate prints the exclusion count): for each of shellcheck, yamllint, actionlint, hadolint, lychee (links and anchors), `docker compose config` and `node --test` a failing file that must fail with the expected rule (`SC2086`, `trailing-spaces`, `runs-on`, `DL3006`, a missing file and a missing anchor,
`imagee`) and a clean control that must pass. The bad workflow fixture fails both actionlint and yamllint. All 16 fixture checks passed in the final run (`gate-run6.txt`, seen). `actionlint` on real files prints `SKIP ... 0 files` because `.github/workflows/` is empty until Milestone 3; it is never a silent pass.
**Mutation, stated plainly:** the fixtures are the mutation of each tool invocation (a bad input must be caught). Mutating a tool's configuration (for example adding `DL3006` to hadolint's ignore list and expecting its fixture check to fail) was not run, so the config files themselves are unmutated.

**What the first runs found** (repo, not harness): shellcheck, `SC2164` in two check scripts (fixed) and `SC1091` for sourced files (directives added, `-x -P SCRIPTDIR:/repo`); `SC2015`/`SC2016`/`SC2086` in the guard test (a file-level disable with reason, one line-level disable, quoting). hadolint reported `DL3003`, `DL3008`, `DL3015`, `DL3020`, `DL4006` on the Dockerfiles; I did **not** change the Dockerfiles. Each rule is ignored in `env/gate/hadolint.yaml` with its reason
(throwaway fetch stages use `cd` inside one `set -eu` RUN; apt drift is accepted in ADR 0001; the app stage's `libpq-dev gcc` install is as upstream and the slimmer one was never tested; `ADD <git>` is the pinned fetch; dash has no `pipefail` and the pipes feed assertions that fail closed). Two of my own harness faults: an `--online` lychee run reported the stack's `localhost` links as refused (the container cannot see the host's localhost; excluded in `lychee.toml`), and file-level `shellcheck disable` lines must sit before the first command.
`--online` run: exit 0 and the verdict unchanged (`gate-online.txt`, seen).

**Not covered by any linter here:** the `.mjs` tools (no JavaScript linter was requested; they are covered by `node --test` and their own mutation checks) and shell code inside Dockerfile `RUN` lines beyond what hadolint's embedded shellcheck sees.

**Known limitation, counted (requested):** the frontend `src` stage installs `git` from apt without pinning it: `apt-get install -y --no-install-recommends git` reported **17 newly installed** packages in a `--no-cache` build of that stage (`m2-evidence\t3\frontend-src-nocache.log`, seen), the same 17 as the backend's fetch stage. Both stages are throwaway and ship in no image; the unpinned apt surface is 76 packages in the backend image stage, 17 in the backend fetch stage and 17 in the frontend `src` stage.
`PYTHON_IMAGE` is therefore now used by the frontend build as well as the backend (`THIRD-PARTY.md` will say so).
