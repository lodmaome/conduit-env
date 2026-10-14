# ADR 0002: Milestone 2 decisions

- **Status:** draft, written while Milestone 2 is in progress. Sections are added as each task lands; each carries its own evidence.
- **Date:** 2026-10-09
- **Decider:** lodmaome. Drafted with AI assistance (Claude).
- **Evidence:** raw logs are outside the repository, in `C:\git\conduit-env-evidence\m2-evidence\` (cited by name only), as in [ADR 0001](0001-pair-lock-and-migrations.md).

## 1. Project-name guard for `tools/reset.sh` and `tools/dump-state.sh`

**Problem (measured in the advisor review, read-only).** `COMPOSE_PROJECT_NAME=docker docker compose config` resolves the project name to `docker`, the owner's other project,
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
It re-tagged `conduit-env/frontend:f7e48c8...` (image id `8a3d12b748e2` to `16bd7eacd2ef`). **Correction (advisor review, confirmed by the building session):** the previous image does **not** stay. Docker here uses the containerd image store (`docker info`: driver `io.containerd.snapshotter.v1`).
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

**Correction to the brief (advisor session; the building session flagged the conflict):** the expected API origin is not `http://127.0.0.1:4181`. The frontend is built with `VITE_API_URL=http://localhost:4181/api` (`env/stack.yaml`), so the origin baked into the build is `http://localhost:4181`.

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

## 6. OpenAPI snapshot (`docs/env/contract/`)

**Probe** (`m2-evidence\t4\`, seen): the backend serves its document at **`/openapi.json`** on port 4181, not under `/api` (`/api/openapi.json`, `/api/docs`, `/api/schema`, `/api/openapi` and `/api/v1/openapi.json` answer 404; `/docs` answers 200 as HTML). Two raw fetches are byte-identical (23,090 bytes, the size Phase 1 recorded for the same backend).
Document: OpenAPI 3.1.0, title "NinjaAPI", 25 operations (19 under `/api/`, 6 under `/auth/`).

**Normalisation** (`tools/lib/openapi.mjs`): keys sorted at every level, arrays keep their order, 2-space indent, LF, one trailing newline; the tool refuses input that is not JSON or not OpenAPI. `tools/openapi-snapshot.mjs` fetches twice and refuses if the raw bodies differ.
`sh tools/snapshot.sh` regenerates by hand: it refuses unless the running `api` image is `conduit-env/backend:$BACKEND_SHA` (so the header cannot describe a different backend than the document), prints the header with `tools/lock-hashes.sh`, one blank line, then the document. Regenerating twice gives a byte-identical file (`regen-identical.txt`, seen). No automatic regeneration gate in env-v1.

**(Superseded by section 9: the snapshot is now one valid JSON document with a root key `x-conduit-env`; the paragraph below is the history.) Decision to overrule if you disagree:** ADR 0001 says the snapshot "starts with a header" and is named `openapi.<backend-sha7>.json`. JSON cannot hold a header, so the file is three header lines, one blank line, then JSON, and **is not valid JSON as a whole** (`tail -n +5` parses it). The alternative (an `x-conduit-env` key inside the document, or a separate header file) would change what ADR 0001 section 2 specifies, so I did not take it. The format is stated in `docs/env/contract/README.md` and enforced by `splitSnapshot` in the tests.
**Phase 1's canonical hash was not reproduced.** Phase 1 recorded `a8c0a6e9...aa5a3` for the canonical form of this document without recording the canonicalisation; four plausible formats (compact or indent 2, with or without a final LF) gave four other hashes (`hash-variants.txt`, seen). The raw size matches; the hashes are not comparable.

**The six `/auth/` operations** (`POST /auth/login/`, `POST /auth/refresh/`, `GET /auth/sessions/`, `DELETE /auth/sessions/{session_id}/`, `POST /auth/logout/`, `POST /auth/logout/all/`) match PHASE1-REPORT section 14 and the served document. `docs/env/contract/README.md` lists them and says an attempt's coverage-gap flagger must exclude them.
`tools/test/contract.test.mjs` fails if the README's table stops matching the snapshot's `/auth/` operations or the RealWorld count leaves 19, and has a presence control (removing an operation from the document makes the comparison unequal). 38 tests, 0 failed.

## 7. The release gate (`node tools/release-gate.mjs env-vN`)

**Shape.** Node 22, stdlib only. `node tools/release-gate.mjs env-vN` runs 14 release checks plus six ported from the Milestone 1 gate (`M1a` to `M1f`); without a tag the three tag checks print `SKIP ... no tag given`, never a silent pass. It creates nothing and tags nothing.
Exit status is the number of failed checks, 90 for bad usage. Checks live in `tools/lib/release-checks.mjs` and read the repository through a `ctx`, so the same code runs on the real tree and on fixtures.

**Self-test** (`node tools/release-gate.mjs --self-test`, `m2-evidence\t5\selftest.txt`, seen, 0 failed): for every check, the golden tree (`tools/lib/golden-tree.mjs`, a small synthetic repository held in memory) must pass, and the same tree broken one way by the check's own fixture must fail with the expected message.
No tracked file is ever mutated: check 11's mutation, like every other, is made on an in-memory copy. Check 4 runs against a throwaway git repository (own directory under the temp dir, own marker, deleted only after re-checking both); check 14 additionally runs the real lychee on `bad.md` (must fail) and `good.md` (must pass) through `tools/gate.sh --links-only`.
`node --test` runs the same control and fixture pairs in-process (65 tests, 0 failed).

**Decisions to overrule:**
- **The changelog is `docs/env/CHANGELOG.md`**, not a root `CHANGELOG.md`: a root file is neither OWNED nor SEED, so check 3 would reject it. Entry format (checked): a heading `## env-vN ...`, then lines `- class: pin|build|contract|docs` (a comma list is allowed) and `- merge: required|recommended|not needed`.
- **Check 4 at `env-v1`** prints `first release: skipped` (a `SKIP` line). Otherwise it needs the tag `env-v1` to exist and uses `git diff --name-only env-v1 -- <seed files>` against the working tree.
- **Check 7 needs both the key and the pinned value** in one table row of `THIRD-PARTY.md`: the key in backticks, and the first 12 hex characters of the digest or SHA (a stale row after a pin bump fails). It covers `env/pins.env` and `env/gate/tools.env`.
- **Check 8's allow-list** is the code constant `RECORD_DOCS` (the reports, ADR 0001 and 0002, `HOW-THIS-WAS-BUILT.md`, `docs/env/CHANGELOG.md`, `env/backend/lock-seed.txt` and the gate's own sources). The retired names are `constraints.txt`, `build-tools.txt`, `attempt/compose.yaml` and `attempt/.gitkeep`; the two `attempt/` names do not match when preceded by `docs/`, because `docs/attempt/.gitkeep` is a live seed path (found by the self-test control, a harness fault of mine).
- **Check 11 exempts the documented local database password by value** (`0000`), wherever it appears, because the reports and the runbook quote upstream's defaults. Any other value is a finding. With a colon, an unquoted all-letter value is ignored (prose such as "secret: replaces ..."). Its presence control: the documented value must be seen in `env/stack.yaml` by the raw patterns, or the check refuses to pass.
- **Check 12's expected text** is `env/gate/license-mit.txt`: the body of `realworld/LICENSE` (MIT) read at the pinned submodule commit (`t0.2\lic\realworld-LICENSE`), from "Permission is hereby granted" to "SOFTWARE.", under "MIT License / Copyright (c) 2026 lodmaome". I dropped that file's trailing note about third-party logos (it concerns that repository's assets). The root `LICENSE` must equal it byte for byte.

**First real run, before the docs exist** (`real-run-before-docs.txt`): 8 failures, all of them real and expected at that point (no CHANGELOG, WORKING-AGREEMENT, THIRD-PARTY, LICENSE, `docs/attempt/.gitkeep`, python-licences) except two that were faults of the check: the secret scan flagged a prose line in `verify-lib.mjs` and the upstream defaults quoted in PHASE1-REPORT (now handled as described above), and the old lock-names check matched `--check` in a comment of `env/stack.yaml` (now a separate check that ignores comments).

**Unmutated or weakly mutated, stated plainly:** the `ports` check is mutated on the rendered JSON only (the real `docker compose config` was not run with a `0.0.0.0` override); the `snapshot-header` and `python-licences` checks compare against a hash computed from the in-memory tree in the self-test, not against a run of `tools/lock-hashes.sh` (the real run does use the script); `no-crlf` was not run against a real CRLF checkout.

## 8. The close-out rehearsal (clone, README and ATTEMPTS followed as written)

**Method** (`m2-evidence\t7\`, seen). `git clone` of the working copy into a new directory under the evidence folder, `git remote rename origin env` (as ATTEMPTS.md says), then the commands of README.md. The clone shares the project name `conduit-env` and the fixed ports with the working copy, so the shared stack was stopped (`docker compose stop`, nothing removed) before each timing and then replaced by `up`.
The clone directories were deleted afterwards with a script that asserts each path (fixed names, directly under the evidence folder, a `.git` present); `tools/reset.sh` from the working copy then made the running stack belong to the working copy again (the container label `project.working_dir` is `C:\git\conduit-env`).

**Clone to healthy, measured** (`timing-cold.txt`, `timing-warm.txt`; one run each; the `postgres`, Python, bun and nginx images were already on the machine, so this is not a registry-cold run):
cold = clone 0.3 s + `docker compose build --no-cache` 44.5 s + `docker compose up -d --wait` 11.9 s = **56.7 s**; warm = clone 0.3 s + `up -d --wait` 11.1 s = **11.4 s**. This replaces the "about 69 s" estimate of ADR 0001 section 6, which added a 12.3 s `postgres` pull that this run did not include (56.7 + 12.3 = 69.0 s, the same figure, now with the build and boot measured in one sequence).

**Frontend cold build, before and after the submodule pin** (requested; `frontend-cold-compare.txt`, `cold-*.log`): the frontend Dockerfile as of `7d87171` against the current one, both `docker buildx build --no-cache --output type=cacheonly`, alternating, two runs each:
old 7.5 s and 6.0 s; new 13.9 s and 18.1 s. So the added `src` stage (apt `git`, a `--keep-git-dir` clone, the assertion) costs about **8 to 12 s** on a cold frontend build. In the full `compose build --no-cache` the frontend builds in parallel with the backend (44.5 s), so the whole-stack cold build did not visibly change (44.5 s before the pin, 44.5 s after).
Two runs each, one machine, a network that varies: indicative only.

**Findings of the rehearsal, all about the repository** (fixed unless noted):
1. The gate's yamllint failed in the clone only: `compose.yaml` was checked out with CRLF (`core.autocrlf=true`, no root `.gitattributes` by design), tripping `new-lines`. Fixed by disabling that one rule with a reason in `env/gate/yamllint.yaml`.
2. The release gate would have failed in a Windows clone for the same reason (`no-crlf` read the working tree; check 13's header regex too). It now reads committed line endings (`git ls-files --eol`, index side) and normalises CRLF when it reads files. The snapshot directory has its own `.gitattributes` (`* text eol=lf`) for the same reason.
3. In the clone: `verify` 5 of 5 PASS (including the real Chrome), `sh tools/gate.sh` exit 0 (after fix 1), `node tools/release-gate.mjs env-v1` exit 0, its self-test exit 0, `node --test` 65 of 65 (`clone-*.txt`, seen).

**What ATTEMPTS.md says about an override, checked in the clone** (`override-*.txt`, seen): a root `compose.override.yaml` adding a long-running `extra` service (built from an existing local image, `pull_policy: never`):
(a) plain `docker compose up -d --wait` started it and `docker compose ls` listed `compose.yaml` and `compose.override.yaml`; (b) `sh tools/reset.sh` stopped and started `extra` again, so the reset honours the override; (c) `node tools/verify.mjs` default passed 4 of 4 (browser skipped on request) and left `extra` running;
(d) `docker compose -f compose.yaml up -d --wait` printed `Found orphan containers (conduit-env-extra-1) for this project` and left it running; (e) with a broken override (`imagee`), `sh tools/reset.sh` printed Compose's validation error and `refusing: 'docker compose config' exited 1 ...`, exit 1, nothing touched (my first wording in ATTEMPTS.md said "makes the reset fail"; it refuses);
(f) `node tools/verify.mjs --fresh --no-browser` removed `extra` as an orphan and brought up the bare environment, 4 of 4 PASS. Also seen: with several clones sharing the project name, `docker compose ls` lists the config files of every directory the project was started from.
**Not tested:** a real second env tag merged into a clone (ATTEMPTS.md section 7 is untested), the `@docs/env/WORKING-AGREEMENT.md` import, Linux, Actions.

## 9. The snapshot becomes one valid JSON document (follow-up F1, decision by lodmaome)

**Why.** Section 6 shipped a file that started with three header lines, so it was not valid JSON as a whole: `JSON.parse`, `jq`, editors and OpenAPI linters fail on it, and working agreement 2(c) has attempts validate real responses against this file at run time, which they could not do without first stripping lines.
**What changed.** The snapshot is one JSON document: the normalised OpenAPI object plus a root key `x-conduit-env` holding the three values that `sh tools/lock-hashes.sh` prints, under exactly those names (`backend-sha7`, `requirements-lock-sha256`, `build-tools-lock-sha256`). Normalisation is unchanged (keys sorted at every level, 2-space indent, LF, one trailing newline), so the three keys appear in alphabetical order. The file name is unchanged.
**Cost.** `tools/lib/openapi.mjs` (parser and builder for the new form), `tools/openapi-snapshot.mjs` (takes the lock-hashes output as a file), `tools/snapshot.sh`, release check 5 and its fixtures, `tools/test/contract.test.mjs`, `docs/env/contract/README.md`, and a regenerated snapshot. The release self-test now supports several fixtures per check.

**Pre-registered rule** (`m2-followup-evidence\PREREGISTRATION.md`), results seen in `m2-followup-evidence\f1\`:
(1) the whole file passes `JSON.parse`: seen. (2) the document minus `x-conduit-env` is deep-equal to the body of the previous file (`git show cc60810:docs/env/contract/openapi.04ef47c.json`, first four lines dropped), so nothing but the header moved: seen, with a control (a changed title makes the same comparison throw). (3) two regenerations are byte-identical: seen. (4) `x-conduit-env` equals `tools/lock-hashes.sh`: seen (`verify-snapshot.txt`, `regen-identical.txt`).
**What the tests prove.** Release check 5 fails, each with its own readable message, for a changed sha7, a changed requirements hash, a changed build-tools hash, a missing `x-conduit-env`, and a file that is not valid JSON, and passes on the golden control (`selftest-check5.txt`, seen; unit tests 67 of 67). The `/auth/` operations and 19 RealWorld operations test is unchanged and passes.
It does not prove that the served document stays the same under unchanged pins (ADR 0003, deferral 3).
**Statements corrected by this change:** ADR 0001 section 2 (a superseded note at the snapshot-header paragraph), ADR 0002 section 6 (note), ADR 0003 deferral 3, `docs/env/contract/README.md`, `docs/env/contract/.gitattributes` (comment), `docs/env/CHANGELOG.md`, `docs/env/README.md` (the `lock-hashes.sh` bullet), the comment in `tools/lock-hashes.sh`. `docs/env/ATTEMPTS.md` needed no change (it only links the contract README). The reports `MILESTONE1-FOLLOWUP.md` and `MILESTONE2-REPORT.md` are history and were not edited.

## 10. The served page is not hermetic (follow-up F4)

**Seen** in the served `index.html` (`curl http://127.0.0.1:4180/`, 2026-10-09): two external render-blocking stylesheets, `//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css` (icons) and `//fonts.googleapis.com/css?family=Lora:400,700|Source+Sans+Pro:300,400,600,700` (web fonts). The frontend is not changed.

**Pre-registered** (`m2-followup-evidence\PREREGISTRATION.md`): with both hosts blocked through `Network.setBlockedURLs`, do the browser check's three assertions still pass; load-event time against the unblocked run, one run each; appearance only if a screenshot is taken and read.
**Results** (`m2-followup-evidence\f4\`, seen; Chrome 154.0.8037.98, one run each, one machine, one network, so indicative only):

| Run | Assertions | Load event after navigation | External hosts requested |
|---|---|---|---|
| unblocked | 3 of 3 pass | 262 ms | `code.ionicframework.com`, `fonts.googleapis.com`, **`fonts.gstatic.com`** |
| both stylesheet hosts blocked | 3 of 3 pass | 65 ms | `code.ionicframework.com`, `fonts.googleapis.com` (both blocked) |

The assertions do not depend on those hosts. The page is also not usable as "offline-identical": blocked, the screenshot (`unblocked.png`, `blocked.png`, read by me) shows the same layout and the article, but system fonts instead of Lora and Source Sans Pro (a serif heading and a sans-serif body of a different design) and no icons next to "Sign in" and "Sign up" and no heart in the like button. That is all I can see in the screenshots; I did not look at other pages.
**A third host appears, which the review did not name:** `fonts.gstatic.com`, the host of the font files that the Google stylesheet refers to, requested only when that stylesheet loads. So the real unblocked control lists three hosts, not two; the unit test uses a fixture with a third host and the sorted, unique listing.
A first measurement was invalid and is kept (`f4\first-attempt\`): the check stopped at the first success, before the load event, so the unblocked run showed no load time; with `--timing` it now also waits for the load event (bounded by the same 20 s deadline).
**Tool changes:** `tools/browser-check.mjs` prints an informational line with the external hosts (never part of the exit status) and has measurement switches `--block-hosts a,b`, `--timing` and `--screenshot <file>`; `externalHosts` in `tools/lib/browser-lib.mjs` is unit tested (own origins, other ports, non-http schemes and duplicates left out; control with only own origins gives none).
