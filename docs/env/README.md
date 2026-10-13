# conduit-env

A framework-neutral, self-hosted RealWorld "Conduit": the Vue frontend `vue-realworld-example-app` and the django-ninja backend `realworld-django-ninja` on PostgreSQL 18, each pinned by commit SHA (`env/pins.env`), started with Docker Compose.
Why this pair: [ADR 0001](adr/0001-pair-lock-and-migrations.md). Starting an attempt on top of it: [ATTEMPTS.md](ATTEMPTS.md). Rules: [WORKING-AGREEMENT.md](WORKING-AGREEMENT.md).

**Local and CI use only; not a production reference.** The upstream defaults are insecure (database password `0000`, `ALLOWED_HOSTS=*`, Django `runserver`, CORS for any origin) and are acceptable only because every port is bound to `127.0.0.1`.

## What you need

Measured on one machine (Windows 11 10.0.26300): Docker Desktop engine 29.8.2, Docker Compose 5.5.1, buildx 0.37.2, Node 22.23.1, Git Bash for `sh`, Chrome 154.0.8037.98 (only for the browser check).

| Tool | Needed for | Minimum |
|---|---|---|
| Docker engine and Compose | everything | Compose 2.20.0 is a **documented lower bound only** (the release that introduced `include`); **untested**. Only 5.5.1 was run. |
| `sh` | `tools/*.sh` | on Windows use Git Bash or WSL; PowerShell has no `sh` |
| Node | `tools/*.mjs`, `node --test` | 22 (standard library only; nothing to install) |
| Chrome or Chromium | the browser check | set `CHROME_BIN` to the executable; tested with 154.0.8037.98 only |
| Network | the first build | GitHub, PyPI, Docker Hub and the Debian mirror must be reachable at build time |

The environment never starts or stops Docker Desktop. If a command says it cannot reach the engine, start Docker yourself, wait until it reports running, and run the command again.

## Clone to healthy

```bash
git clone <environment-repository-url> conduit-env
cd conduit-env
docker compose up -d --wait
```

`up` builds the two images (a cold first build downloads base images and sources), starts `db`, runs the `migrate` one-shot (`python manage.py migrate`, nothing is generated), then `api`, then `frontend`, and returns when every long-running service is healthy and `migrate` has exited 0.
Every `up` runs the build step first (`pull_policy: build`), which is a quick cache hit when nothing changed.

| What | Where |
|---|---|
| Frontend | <http://localhost:4180> (open **`localhost`**: the API origin built into the frontend is `http://localhost:4181/api`; `127.0.0.1:4180` also works, because the API accepts any origin) |
| API | <http://localhost:4181/api> (health: `GET /api/tags` returns 200); OpenAPI document at `/openapi.json` (not under `/api`); interactive docs at `/docs` |
| Database | `127.0.0.1:4182`, user `postgres`, password `0000`, database `postgres`. **The password is the upstream default, fixed, local-only.** |

Ports are fixed. Changing one needs a rebuild of the frontend. The result is the empty initial state: migrations applied, no application rows, no users.
For a build from scratch (no cache), run `docker compose build --no-cache` before `docker compose up -d --wait`.

**Measured clone-to-healthy** (2026-10-09, one Windows 11 laptop, a rehearsal that followed these commands in a fresh clone; one run each): **cold** 56.7 s, which is the clone (0.3 s), `docker compose build --no-cache` (44.5 s) and `docker compose up -d --wait` (11.9 s);
**warm** 11.4 s, the clone (0.3 s) and `up -d --wait` (11.1 s) with the build cache present. These do **not** include pulling the `postgres` image (12.3 s when it was measured separately) or a registry-cold pull of the Python, bun and nginx base images:
all of those were already on the machine, so the first run on a machine without them is slower, by an amount not measured here. Compare an Actions boot against these numbers only with that in mind.
Two clones on one machine share the project name `conduit-env` and the fixed ports, so run one stack at a time.

## Reset

```bash
sh tools/reset.sh
```

Deletes this project's containers, network **and database volume** (all data in it), then boots again. It refuses to run unless Compose resolves the project name to exactly `conduit-env` (an environment variable, a root `.env` or an override with another `name:` would otherwise point `down -v` at a different project)
and it passes `-p conduit-env` itself. Details and the raw commands: [reset-and-boot.md](reset-and-boot.md). A plain `docker compose down` keeps the data; `down -v` deletes it.
Two resets in a row give identical schema, row counts, applied migrations and data (`sh tools/dump-state.sh <dir>` writes the four files to compare).

## Verify

```bash
CHROME_BIN="/c/Program Files/Google/Chrome/Application/chrome.exe" node tools/verify.mjs
node tools/verify.mjs --no-browser     # leave the browser check out (printed as SKIP, never silent)
node tools/verify.mjs --fresh          # DESTRUCTIVE: sh tools/reset.sh first, then the checks
```

It checks whatever listens on 4180 to 4182: `GET /api/tags`; register, log in, read the current user, create an article and read it back; the frontend page; `makemigrations --check --dry-run` in the running api container;
and a headless Chrome of its own that loads the frontend and asserts that every Fetch/XHR goes to the baked-in API origin and that the page shows a known article. The exit status is the number of failed checks; **90** means it could not run (preflight failed, bad argument, reset failed).
Credentials are generated per run and never printed or written to disk. **What a run leaves in the database** (measured; there is no user-delete endpoint, so it stays until the next reset): the API checks add 1 user, 1 article, 2 article-tag links, 2 tags the first time after a reset (1 later) and 3 sessions; the browser check adds 1 user, 1 article, 2 links, 1 tag and 1 session.
`--fresh` also removes the project's orphans, including an attempt's extra services; it prints this and is never the default. Why each check exists and how it was mutation-tested: [ADR 0002](adr/0002-milestone2-decisions.md) sections 3 and 4.

## Gate (before asking for review)

```bash
sh tools/gate.sh                       # shellcheck, actionlint, yamllint, hadolint, lychee (digest-pinned containers), docker compose config, node --test
node tools/release-gate.mjs env-v1     # the release checks for a candidate tag (it creates nothing)
node tools/release-gate.mjs --self-test
node --test tools/test/*.test.mjs
```

`sh tools/gate.sh --online` also checks external links, informationally (it never changes the exit status). `.github/workflows/` is empty until Milestone 3, so `actionlint` reports `SKIP ... 0 files`.

## Dependencies, pins and the contract

- **Pins:** `env/pins.env` (upstream commits, base image digests, the frontend submodule commit) and `env/gate/tools.env` (the gate tools). Changing a line is an env change (class `pin` in the [changelog](CHANGELOG.md)).
- **Python lock:** `env/backend/requirements.lock.txt` and `build-tools.lock.txt`, installed with `--require-hashes`. `sh tools/lock-backend.sh` regenerates them, `sh tools/check-lock-hashes.sh` proves a corrupted hash fails the build, `sh tools/lock-hashes.sh` prints the three values that the snapshot's `x-conduit-env` holds.
  The frontend submodule pin is checked by `sh tools/check-submodule-pin.sh`.
- **Contract:** [contract/README.md](contract/README.md), the served OpenAPI snapshot, regenerated by hand with `sh tools/snapshot.sh`.
- **Licences:** [THIRD-PARTY.md](THIRD-PARTY.md); `sh tools/python-licences.sh` regenerates the Python listing.

## What is not claimed

- An **offline** `docker compose up`: not tested. Every `up` runs a build pass, and whether BuildKit contacts the network when everything is cached was not checked.
- **macOS**, and Linux other than the one runner described next: nothing has run there. Every local measurement is from one Windows 11 laptop.
- **GitHub Actions: seen once, in a private rehearsal repository on 2026-10-13** (not the canonical repository), on one `ubuntu-24.04` runner (Ubuntu 24.04.5, kernel 6.17, `/bin/sh` is dash, runner image `ubuntu24/20261004.327`) with Docker 28.0.4, **Docker Compose v2.38.2**, Node 22.23.1 (installed by `actions/setup-node`) and **Google Chrome 154.0.8037.97**. There `docker compose -f compose.yaml up -d --wait` took 66 to 67 s from a cold runner, `node tools/verify.mjs` passed 5 of 5 including the browser check, Chrome started with its own sandbox (the `--no-sandbox` opt-in was not needed), and the gate (`sh tools/gate.sh`) and the unit tests passed. Evidence and the runs: ADR 0004 section 4.
- A **Compose version other than 5.5.1 (local) and 2.38.2 (the runner)**: the documented lower bound 2.20.0 is still untested. A **Chrome other than 154.0.8037.98 (local) and 154.0.8037.97 (the runner)**, and Chromium or headless-shell builds.
- A **scheduled** run of the pin-drift workflow: not seen (only manual dispatch was run).
- **A hermetic page.** The served `index.html` loads two external stylesheets at view time, `//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css` and `//fonts.googleapis.com/css?family=Lora:400,700|Source+Sans+Pro:300,400,600,700`, and the font stylesheet in turn requests font files from `fonts.gstatic.com`. With the two stylesheet hosts blocked, the browser check's three assertions still passed (one run, 2026-10-09): the load event came after 65 ms against 262 ms unblocked, and the page showed system fonts and no icons (ADR 0002 section 10). A blocked or offline network changes timing and looks, not the stack.
- **Byte-identical rebuilds of the images.** The Python packages are hash-pinned; the apt packages are not (76 in the backend image stage, 17 in each throwaway fetch stage), so rebuilt images can differ.
- Anything about **production use**.
