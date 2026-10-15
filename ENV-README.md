# conduit-env: manual

## 1. What this is

conduit-env is a **base repository** for test frameworks. It runs one application, the RealWorld "Conduit" blogging app, on your machine with a single command: a Vue frontend (`vue-realworld-example-app`), a django-ninja REST API (`realworld-django-ninja`) and a PostgreSQL 18 database, each pinned to an exact upstream commit or image digest and started with Docker Compose.
You clone it, add your own tests and tooling on top, and point them at the fixed local addresses. What you get: the running app on `127.0.0.1` ports 4180 to 4182, an empty database every time you reset, a command that returns the stack to that empty state, a smoke test that proves the stack works, and a snapshot of the API contract.
It is for local and CI use only. It is **not** a production reference: it keeps the upstream defaults (database password `0000`, any CORS origin, Django's development server) and is safe only because every port is bound to `127.0.0.1`.

Other documents: [docs/env/ARCHITECTURE.md](docs/env/ARCHITECTURE.md) (how it is built), [docs/env/UI-GUIDE.md](docs/env/UI-GUIDE.md) (what the user interface does) and [docs/env/API-GUIDE.md](docs/env/API-GUIDE.md) (what the API does), [THIRD-PARTY.md](THIRD-PARTY.md) (licences of what it fetches), [CHANGELOG.md](CHANGELOG.md) (releases).

## 2. Requirements

| Needed | Why | Notes |
|---|---|---|
| Docker Engine with Docker Compose v2 | everything | Compose 2.20.0 is the lowest version that supports the `include` the stack uses; that lower bound is documented, **not tested** here. Seen working: Compose 5.5.1 (Windows) and 2.38.2 (Linux). |
| Git | clone, and the images fetch upstream sources from GitHub at build time | |
| `sh` | `tools/*.sh` | Linux and macOS have it; on Windows use Git Bash (installed with Git for Windows) or WSL. PowerShell has no `sh`. |
| Node 22 or newer | `tools/verify.mjs` and the unit tests (standard library only, nothing to install) | not needed to run the stack |
| Chrome or Chromium | the browser part of the smoke test | set `CHROME_BIN` to the executable; tested with Chrome 154 |
| Network | the first build | GitHub, PyPI, Docker Hub and the Debian mirror must be reachable; later builds are cache hits |
| Free ports 4180, 4181, 4182 on `127.0.0.1` | the stack | fixed, not configurable (section 5) |

## 3. Setting up Docker

Install Docker from Docker's own pages and follow their instructions for your system:

- Windows: https://docs.docker.com/desktop/setup/install/windows-install/ (Docker Desktop)
- macOS: https://docs.docker.com/desktop/setup/install/mac-install/ (Docker Desktop)
- Linux: https://docs.docker.com/engine/install/ (Docker Engine, plus the Compose plugin: https://docs.docker.com/compose/install/linux/)

Then check the versions and that the engine is running. Each command is one block:

```bash
docker --version
```

```bash
docker compose version
```

```bash
docker info
```

`docker info` prints a "Server" section only when the engine is running. If it says it cannot connect (on Windows with Docker Desktop: `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`), start Docker yourself, wait until it reports running, and run the command again. Nothing in this repository starts or stops Docker Desktop.

On Windows, install Git for Windows (https://git-scm.com/download/win) for Git Bash and run the commands below from a Git Bash window. Install Node 22 (https://nodejs.org/) only if you want the smoke test and the unit tests:

```bash
node --version
```

## 4. Quick start

```bash
git clone <this-repository-url> conduit-env
cd conduit-env
docker compose up -d --wait
```

`up` builds the two images (a cold first build downloads base images and fetches the upstream sources), starts `db`, runs the `migrate` one-shot (`python manage.py migrate`, nothing else), then `api`, then `frontend`, and returns when every long-running service is healthy and `migrate` has exited with code 0. Every `up` runs the build step first, which is a quick cache hit when nothing changed.
The data lives in a Docker volume, so it survives `stop` and the next `up`: only the first `up` on a machine, or a reset, gives the empty database. **Healthy** means: `docker compose ps` shows `db`, `api` and `frontend` as `healthy`, and `migrate` as exited with code 0.

```bash
docker compose ps -a
```

Measured on 2026-10-14, one run each on one Windows 11 laptop with Docker Desktop, with the base images already pulled: 54 s cold (clone 0.3 s, `docker compose build --no-cache` 43 s, `up -d --wait` 11 s) and 11 s warm (`up -d --wait` with the build cache present). These numbers do not include pulling base images on a machine that has none; a first run there is slower by an amount not measured. On a GitHub Actions `ubuntu-24.04` runner, `up -d --wait` took 65 to 67 s from a cold runner.
Two clones on one machine share the project name `conduit-env` and the fixed ports, so run one stack at a time.

## 5. Where everything runs

Everything is bound to `127.0.0.1` only.

| What | Address | Notes |
|---|---|---|
| Frontend | http://localhost:4180 | open **`localhost`**, not `127.0.0.1`: the API origin built into the frontend is `http://localhost:4181/api` |
| API | http://localhost:4181/api | health check: `GET /api/tags` returns 200 |
| OpenAPI document | http://localhost:4181/openapi.json | served at the root, **not** under `/api` |
| Interactive API docs | http://localhost:4181/docs | |
| Database | `127.0.0.1:4182` | user `postgres`, password `0000`, database `postgres`. The password is the upstream default, fixed, local-only. |

- The API accepts requests from **any origin** (CORS `*`), so a page served from another port can call it.
- The ports are fixed. The frontend has the API origin baked in at build time, so changing a port means rebuilding the frontend image.
- The frontend page requests two external stylesheet hosts when it is viewed, `code.ionicframework.com` and `fonts.googleapis.com`, and the font stylesheet requests font files from `fonts.gstatic.com`. With those hosts blocked the app still works; load timing differs and fonts and icons fall back. The page is therefore not hermetic.

## 6. Day-to-day use

Show the services:

```bash
docker compose ps -a
```

Follow the logs of one service (`db`, `api`, `frontend`):

```bash
docker compose logs -f api
```

Stop the stack and keep its data:

```bash
docker compose stop
```

Start it again (this also rebuilds if a pin or Dockerfile changed):

```bash
docker compose up -d --wait
```

Reset to the empty initial state. This deletes the project's containers, its network **and its database volume**, then boots again (guarded, see [docs/env/ARCHITECTURE.md](docs/env/ARCHITECTURE.md)):

```bash
sh tools/reset.sh
```

Health check:

```bash
curl http://localhost:4181/api/tags
```

Open a database shell:

```bash
docker compose exec db psql -U postgres -d postgres
```

Write the database state (schema, row counts per table, applied migrations, data) to a directory, for comparing two states with `diff -r`:

```bash
sh tools/dump-state.sh state-a
```

Rebuild without any build cache:

```bash
docker compose build --no-cache
```

**The smoke test.** It checks whatever listens on ports 4180 to 4182: `GET /api/tags`; register, log in, read the current user, create an article and read it back; the frontend page; `makemigrations --check --dry-run` in the running `api` container; and a real headless Chrome that loads the frontend and asserts that every Fetch/XHR goes to the baked-in API origin and that the page shows a known article.

```bash
CHROME_BIN="/c/Program Files/Google/Chrome/Application/chrome.exe" node tools/verify.mjs
```

(On Linux, `CHROME_BIN=/usr/bin/google-chrome`.) Leave the browser check out; it is printed as `SKIP`, never silently:

```bash
node tools/verify.mjs --no-browser
```

The exit status is the number of failed checks; 90 means it could not run (preflight failed, bad argument). `node tools/verify.mjs --fresh` runs `sh tools/reset.sh` first and then the checks; it is destructive and never the default. Credentials are generated per run and never printed or written to disk.
The API has no user-delete endpoint, so what a run registers stays until the next reset. Run the unit tests of the smoke test (they need no stack):

```bash
node --test tools/test/*.test.mjs
```

## 7. Capabilities

- Runs the RealWorld API (19 operations under `/api/`) and its Vue frontend against a PostgreSQL 18 database, with pinned upstream versions; the same pins give the same sources every time (the apt packages inside the images are not pinned, so a rebuilt image can differ).
- Boots to a defined empty state (migrations applied, no application rows, no users) and returns to it with one command.
- Ships the served OpenAPI document as `contract/openapi.04ef47c.json`, for contract tests and for coverage tooling.
- Ships a smoke test that proves the stack works from the outside, including a real browser.
- Lets you extend the stack with your own services through `compose.override.yaml` (section 8).
- Does **not** provide: seed data, user deletion, hot reload, a production-grade server, TLS, authentication hardening, a hermetic frontend, or any test suite for the app itself. Those belong to the framework you build on top.

## 8. Using it as a base for a test framework

Start your repository from a clone of this one and keep this one as the remote that new releases come from:

```bash
git clone <this-repository-url> my-framework
cd my-framework
git remote rename origin env
git remote add origin <url of your own, new, empty repository>
git push -u origin main
```

`env` stays as the source of new releases. Check that it works: `docker compose up -d --wait`, then `node tools/verify.mjs`.

**What to edit and what not to.** Do not edit these; a new release changes them and your edits would conflict: `compose.yaml`, everything under `env/`, `tools/`, `contract/` and `docs/env/`, `.github/workflows/env-*.yml`, `ENV-README.md`, `THIRD-PARTY.md`, `CHANGELOG.md`. If one of them is wrong for you, write down what you saw and the change you propose rather than editing it in place.
`README.md` and `LICENSE` are yours to replace: write your own README. Everything else you add (your tests, your `package.json`, a root `.gitignore`, `.gitattributes`, `.env`, `.dockerignore`, `compose.override.yaml`) is yours; this repository never ships those files and never changes them.

**Extending the stack: `compose.override.yaml`.** Put a file named exactly `compose.override.yaml` at the repository root, next to `compose.yaml`; Docker Compose loads it automatically. Rules measured with Compose 5.5.1 on Windows (not repeated on Linux):

- Paths in the override are relative to the repository root, not to the override file or a subdirectory. A build context or bind mount written relative to a subdirectory fails.
- Do not `include` `compose.yaml` from a file in a subdirectory: the nested `env_file` resolves against the working directory and fails from the repository root.
- The auto-load is invisible: `docker compose up` prints nothing about the override. `docker compose config` shows the merged result and `docker compose ls` lists `compose.yaml,compose.override.yaml`.
- `-f` or `COMPOSE_FILE` bypasses the override. Whoever sets either gets the bare stack, and your own services become orphans (a warning, not an error).
- A top-level `name:` in the override, or `COMPOSE_PROJECT_NAME` anywhere, changes the project name. `tools/reset.sh` and `tools/dump-state.sh` then refuse to run; remove the name.
- A one-shot service in the override makes `up --wait` exit non-zero (`container ... exited (0)`) unless another service depends on it with `service_completed_successfully`. Add long-running services, or keep one-shot runners out of `up`.
- Give your built services `pull_policy: build`, as the stack's services have. Images are tagged with a pinned value only, so without it a changed Dockerfile or build argument under the same tag silently reuses the old image.
- `docker compose -f compose.yaml up` with your extra service running prints `Found orphan containers (conduit-env-<service>-1) for this project` and leaves the service running.
- `tools/reset.sh` and `tools/dump-state.sh` honour the override (they reset your whole stack); `node tools/verify.mjs` runs its HTTP checks against the fixed ports whatever runs there, and its one `docker compose exec` uses `-f compose.yaml`; `node tools/verify.mjs --fresh` deliberately bypasses the override, deletes the database volume and removes the project's orphans, **including your extra services**.

**Merging a newer release.**

```bash
git fetch env --tags
```

```bash
git merge env-v2
```

(Replace `env-v2` with the tag you are moving to. The fetch and the merge of an existing tag were run in a throwaway clone; the merge of a second release was not, because no second release existed yet.) Every release has an entry in [CHANGELOG.md](CHANGELOG.md) with a **class** (`pin`: an upstream pin or lock changed; `build`: how the images or stack are built or started; `contract`: the served API contract changed; `docs`: documents and tooling only) and a **merge** value (`required`: merge before more test work; `recommended`: merge when convenient; `not needed`). Tags are annotated, named `env-vN`, and never moved. A merge conflicts only where you edited a file you were asked not to edit, or on `README.md` if you replaced it and a release changes it (read the CHANGELOG entry).

**CI.** `.github/workflows/env-verify-core.yml` is a reusable workflow that starts the stack on an `ubuntu-24.04` runner and runs the smoke test, the unit tests and the guard test. It was run on GitHub Actions in a throwaway repository on 2026-10-14 and passed (https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38642228161; The rehearsal repository was private and throwaway; its run URLs are kept for the record and will not open for a reader.). Call it from a workflow of your own:

```yaml
name: verify-env

on:
  push:

permissions:
  contents: read

jobs:
  env:
    uses: ./.github/workflows/env-verify-core.yml
    permissions:
      contents: read
```

It starts the stack with `docker compose -f compose.yaml up -d --wait`, so your `compose.override.yaml` does not change what it verifies; run your own tests against your override in your own job. Chrome comes from the runner image and floats; the workflow prints its version. If Chrome cannot start with its sandbox on some runner, pass the input `chrome-no-sandbox: true` (it was not needed on the runner that was tested). The workflow has one input, `chrome-no-sandbox`. Callers written for the first release that pass `run-gate` or `run-release-gate` are rejected before any job runs; seen on Actions for `run-gate` (https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38642488107): the run ended as a startup failure with no jobs and the annotation `The workflow is not valid. .github/workflows/caller-rungate.yml (Line: 14, Col: 17): Invalid input, run-gate is not defined in the referenced workflow.` Remove those inputs from your caller. Do not set the repository variable `ENV_CANONICAL` in your repository: it switches on this repository's own wrapper workflow (`env-verify.yml`), which is not meant for a framework.

**Exclude `/auth/` from coverage.** The API serves 25 operations: the 19 RealWorld ones and six that are not part of RealWorld. A coverage-gap tool must exclude every path under `/auth/`.

## 9. Behaviour your tests will meet

The headline behaviours are below; everything else, with every limit, message and status, is in [docs/env/API-GUIDE.md](docs/env/API-GUIDE.md) (the API) and [docs/env/UI-GUIDE.md](docs/env/UI-GUIDE.md) (the user interface), which are the single place for application behaviour.

- **Empty initial state.** After a reset there are no users and no articles. Register through the API or the app.
- **Emails on reserved or special-use domains are rejected at registration** (`@example.test`); use an ordinary domain such as `example.com`.
- **Slugs are not the title alone.** Two articles with the same title both succeed, with different slugs. Read the slug from the response.
- **A duplicate username or email is `409`.** Any origin is allowed by CORS.
- **Tokens last 5 minutes**, and several requests with a bad or expired token answer `500`, not `401`.
- **Six extra operations under `/auth/`** are not part of RealWorld: a coverage tool must exclude them (the snapshot `contract/openapi.04ef47c.json` lists all 25 operations).
- **No user-delete endpoint.** What you register stays until the next reset.
- The guides list behaviour that looks like a defect (labelled "possible defect", each with a reproduction); tests will meet it.

## 10. Stop and clean up

These commands change what is on your machine. **AI assistants working in this repository do not run `down`, `down -v` or image removal; the owner of the machine does.** Never run `docker system prune`, `docker rm`, `docker rmi` or `-f` against containers or images that are not this project's: Docker on a developer machine is shared with other projects, and `prune` reaches all of them.

| Command | What it removes | What it never touches |
|---|---|---|
| `docker compose stop` | nothing: stops the project's containers | images, volumes, the network, other projects |
| `docker compose down` | the project's containers and its network | the database volume (your data stays), images, other projects |
| `docker compose down -v` | the project's containers, its network and **its database volume** (all data in it) | images, other projects |
| `docker rmi conduit-env/backend:<BACKEND_SHA> conduit-env/frontend:<FRONTEND_SHA>` | the two images this stack builds (the full tags are in `env/pins.env`) | the base images (Python, Postgres, Bun, Nginx), other projects' images |

```bash
docker compose stop
```

Documented Docker behaviour, not run by the author:

```bash
docker compose down
```

Documented Docker behaviour, not run by the author:

```bash
docker compose down -v
```

Run `docker compose down` first: stopped containers still reference the images, and `docker rmi` refuses to remove an image that a container uses.
Documented Docker behaviour, not run by the author (replace the two tags with the values of `BACKEND_SHA` and `FRONTEND_SHA` from `env/pins.env`):

```bash
docker rmi conduit-env/backend:04ef47ced437ee8795a13bdcbc2eff2be19e33bd conduit-env/frontend:f7e48c8178602ce25d43293bc6f8ca51d84ae222
```

`sh tools/reset.sh` is the guarded way to wipe the project's database: it passes `-p conduit-env` itself and refuses unless Compose resolves the project name to exactly `conduit-env`.

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `port is already allocated` or `address already in use` on 4180, 4181 or 4182 | something else uses the port, or a second clone's stack is running. Stop it (`docker compose stop` in that clone) or free the port. The ports cannot be changed without rebuilding the frontend. |
| `Cannot connect to the Docker daemon` or `open //./pipe/dockerDesktopLinuxEngine` | the engine is not running. Start Docker yourself and wait until it reports running. |
| The first `up` takes minutes | a cold build downloads base images and fetches the upstream sources and Python packages. Later runs are cache hits. |
| The frontend opens but shows no data, or requests fail | the API origin built into the frontend is `http://localhost:4181/api`, so `localhost` must reach `127.0.0.1` on your machine (it did on the machines tested; a machine where it does not was not seen). Open the frontend at `http://localhost:4180`. |
| `toomanyrequests` while pulling base images | Docker Hub's anonymous rate limit. Sign in with `docker login` or wait. |
| `tools/reset.sh` or `tools/dump-state.sh` says `refusing: Compose resolves the project name to ...` | a `COMPOSE_PROJECT_NAME` variable, a root `.env` or a `name:` in your override changed the project name. Unset or remove it. |
| `node tools/verify.mjs` exits 90 | it could not run: a port is not listening, Node is older than 22, `CHROME_BIN` is not set (use `--no-browser`) or not found. The message says which. |
| `sh: command not found` on Windows | use Git Bash or WSL, not PowerShell or cmd. |

## 12. What was tested and what was not

Tested: Windows 11 with Docker Desktop (Docker engine 29.8.2, Compose 5.5.1, Node 22.23.1, Chrome 154.0.8037.98), and GitHub Actions `ubuntu-24.04` (Docker 28.0.4, Compose v2.38.2, Node 22.23.1, Chrome 154.0.8037.97): the stack boots, the smoke test passes (5 checks including the browser), the 34 unit tests pass and the guard test passes. The Actions run of the current workflow files was on 2026-10-14 in a throwaway repository (private, so its URL will not open for a reader).
Not tested: macOS; any Linux other than that runner; any Compose version other than 5.5.1 and 2.38.2 (2.20.0 is a documented lower bound only); another Chrome version; an offline `docker compose up` (every `up` runs a build pass and whether it contacts the network when everything is cached was not checked); byte-identical image rebuilds (they are not: apt packages are not pinned); production use.

## 13. Licences

The repository's own files are MIT (see [LICENSE](LICENSE)). Everything the images fetch or run has its own licence: [THIRD-PARTY.md](THIRD-PARTY.md). This repository was built with AI assistance (Claude, from Anthropic) under its owner's direction and review.
