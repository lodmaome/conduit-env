# conduit-env: manual

## 1. What this is

conduit-env is a **base repository** for test frameworks. It runs one application, the RealWorld "Conduit" blogging app, on your machine with a single command: a Vue frontend (`vue-realworld-example-app`), a django-ninja REST API (`realworld-django-ninja`) and a PostgreSQL 18 database, each pinned to an exact upstream commit or image digest and started with Docker Compose.
You start a project from it (section 8), add your own tests and tooling on top, and point them at the fixed local addresses. What you get: the running app on `127.0.0.1` ports 4180 to 4182, an empty database every time you reset, a command that returns the stack to that empty state, a smoke test that proves the stack works, and a snapshot of the API contract.
It is for local and CI use only. It is **not** a production reference: it keeps the upstream defaults (database password `0000`, any CORS origin, Django's development server) and is safe only because every port is bound to `127.0.0.1`.

The repository is marked as a GitHub **template**: the button *Use this template* creates your own repository from it with a clean history. Section 8 shows this and the two other ways to start.

Other documents: [docs/env/ARCHITECTURE.md](docs/env/ARCHITECTURE.md) (how it is built), [docs/env/UI-GUIDE.md](docs/env/UI-GUIDE.md) (what the user interface does) and [docs/env/API-GUIDE.md](docs/env/API-GUIDE.md) (what the API does), [THIRD-PARTY.md](THIRD-PARTY.md) (licences of what it fetches), [CHANGELOG.md](CHANGELOG.md) (releases), [AGENTS.md](AGENTS.md) (for AI assistants).

## 2. Requirements

| Needed | Why | Notes |
|---|---|---|
| Docker Engine with Docker Compose v2 | everything | Compose 2.20.0 is the lowest version that supports the `include` the stack uses; that lower bound is documented, **not tested** here. Seen working: Compose 5.5.1 (Windows) and 2.38.2 (Linux). |
| Git | clone, and the images fetch upstream sources from GitHub at build time | `git init -b main` (section 8) needs Git 2.28 or newer |
| GitHub CLI (`gh`) | only for the template command in section 8 | not needed to run the stack; you can use the button "Use this template" on the repository page instead |
| `sh` | `tools/*.sh` | Linux and macOS have it. On Windows use Git Bash (installed with Git for Windows), WSL, or put `C:\Program Files\Git\bin` on your PATH so that `sh` works from PowerShell too (seen). |
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

On Windows the `docker compose` and `node` commands work in PowerShell, Git Bash and cmd. Only the `sh tools/*.sh` commands need Git Bash (install Git for Windows, https://git-scm.com/download/win) or a `sh` on your PATH (Git for Windows ships it as `C:\Program Files\Git\bin\sh.exe`; with that folder on the PATH, `sh tools/test-project-guard.sh` ran from a new PowerShell process and passed). Install Node 22 (https://nodejs.org/) only if you want the smoke test and the unit tests:

```bash
node --version
```

## 4. Quick start

```bash
git clone https://github.com/lodmaome/conduit-env.git conduit-env
cd conduit-env
docker compose up -d --wait
```

This is the way to try the environment. To start a project of your own, see section 8.

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

(On Linux, `CHROME_BIN=/usr/bin/google-chrome`.) In PowerShell set the variable first:

```powershell
$env:CHROME_BIN = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

```powershell
node tools/verify.mjs
```

Leave the browser check out; it is printed as `SKIP`, never silently:

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

There are three ways to start. They give you the same files. They differ in the history you get and in how newer releases reach you.

| | **A. Fresh copy from the template** | **B. Fresh copy from a release ZIP** | **C. Linked clone** |
|---|---|---|---|
| History in your repository | one "Initial commit" | one commit you make | this repository's full history and tags |
| Link to this repository | none (GitHub shows "generated from") | none | the remote `env` |
| Newer releases | by hand ("Getting newer releases") | by hand | `git fetch env --tags` and `git merge env-vN` |
| Needs | GitHub and the `gh` CLI, or the web button | Git, any Git host | Git |
| Choose it when | you want a clean start (most people) | you want one exact release, or you do not use GitHub | you want fixes to merge in |

### A. Fresh copy from the template

```bash
gh repo create my-automation-project --template lodmaome/conduit-env --private --clone
```

This creates a new private repository under your account, with one "Initial commit" and no history or tags, and clones it into `my-automation-project`. On the repository page the button "Use this template" does the same (documented behaviour, not run by the author). The template feature copies the files of the default branch only: no history, no tags, no link to this repository. The copy is the current state of `main`, which is the latest release unless something was committed after it. Then go into the folder:

```bash
cd my-automation-project
```

If you skip that step, `docker compose` says `no configuration file provided: not found`, because it only looks in the current folder.

### B. Fresh copy from a release ZIP

Download the ZIP of a release tag. Replace the tag with the release you want:

`https://github.com/lodmaome/conduit-env/archive/refs/tags/env-v3.zip`

The ZIP holds one folder, `conduit-env-env-v3`, and no `.git`. Unzip it, rename the folder and go into it. In PowerShell:

```powershell
Expand-Archive env-v3.zip -DestinationPath .
```

```powershell
Rename-Item conduit-env-env-v3 my-automation-project
```

```powershell
cd my-automation-project
```

On macOS and Linux use `unzip env-v3.zip`, then `mv conduit-env-env-v3 my-automation-project` (documented behaviour, not run by the author). Then start your own history. `git init -b main` needs Git 2.28 or newer (Git 2.55 was used here):

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-NEW-REPO.git
git push -u origin main
```

On Windows `git add .` prints warnings that LF will be replaced by CRLF; they are harmless. A copy made from the ZIP on Windows records the two scripts `tools/reset.sh` and `tools/dump-state.sh` without the executable bit; they are run as `sh tools/reset.sh`, which does not need it. The last two lines (`git remote add` and `git push`) were not run.

### C. Linked clone

Clone, keep this repository as the remote `env`, and push to your own new repository:

```bash
git clone https://github.com/lodmaome/conduit-env.git my-framework
cd my-framework
git remote rename origin env
git remote add origin https://github.com/YOUR-USERNAME/YOUR-NEW-REPO.git
git push -u origin main
```

Your repository then contains this repository's whole history and tags.

### After you have your copy

- **Replace `README.md`** with your own. **Keep `LICENSE` and `THIRD-PARTY.md`**: the MIT notice and the third-party notices travel with the files. Your own code may have its own licence; keep this repository's `LICENSE` for the files you took from it.
- **Check it works:** `docker compose up -d --wait`, then `node tools/verify.mjs` (section 6).
- **GitHub Actions in a copy.** The copy includes `.github/workflows/env-verify.yml`. In your repository its run shows **skipped**, because the variable `ENV_CANONICAL` is not set there. That is normal. Do not set it (see "CI" below).
- **One stack at a time.** Every copy uses the Compose project name `conduit-env` and the fixed ports 4180 to 4182.
- **AI assistants.** Open `AGENTS.md` and add your project's own rules below the marked line. Its safety section (no `prune`, `rm` or `rmi`, ask before pushing) is a protection layer that is on by default; you may change or remove it. Claude Code reads `CLAUDE.md`, which imports `AGENTS.md` with the line `@AGENTS.md` (documented behaviour, not run by the author).

### What to edit and what not to

These files belong to this repository: `compose.yaml`, everything under `env/`, `tools/`, `contract/` and `docs/env/`, `.github/workflows/env-*.yml`, `ENV-README.md`, `THIRD-PARTY.md` and `CHANGELOG.md`. Leave them as they are and a newer release can replace them cleanly (A and B) or merge without conflicts (C). This repository does not take issues or contributions; keep a change you need in your own copy. The application itself, the frontend and the API, is not in this repository: it is fetched at build time from upstream repositories at the commits pinned in `env/pins.env`, so a defect in the application cannot be fixed here. The defects that were found are listed as possible defects in the API guide and the UI guide, and they are meant to be pinned by the tests you write as known issues. A defect in the application can be reported to the upstream projects: https://github.com/c4ffein/realworld-django-ninja (API) and https://github.com/realworld-apps/vue-realworld-example-app (frontend). Defects in this repository's own files (the stack, the tools, the documents) you can fix in your copy; in A and B nothing stops you editing your copy, but you then carry that edit into every update.

`README.md`, `LICENSE`, `AGENTS.md` and `CLAUDE.md` are yours. `README.md` and `LICENSE` are yours to replace (see above for `LICENSE`); `AGENTS.md` and `CLAUDE.md` are shipped as a starting point: extend them with your project's rules, and change or delete the safety section if you do not want it. A newer release will not replace them in a fresh copy (in a linked clone a merge may conflict on them if you edited them: keep your version). Everything else you add (your tests, your `package.json`, a root `.gitignore`, `.gitattributes`, `.env`, `.dockerignore`, `compose.override.yaml`) is yours; this repository never ships those files and never changes them.

### Getting newer releases

Every release has an entry in [CHANGELOG.md](CHANGELOG.md) with a **class** (`pin`: an upstream pin or lock changed; `build`: how the images or stack are built or started; `contract`: the served API contract changed; `docs`: documents and tooling only) and a **merge** value (`required`: take it before more test work; `recommended`: take it when convenient; `not needed`). Tags are annotated, named `env-vN`, and never moved.

**Linked clone (C).**

```bash
git fetch env --tags
```

```bash
git merge env-vN
```

(Replace `N` with the release you want.) The fetch and the merge of an existing tag were run in a throwaway clone; the merge of a second release was not, because no second release existed yet. A merge conflicts only where you edited a file you were asked not to edit, or on `README.md` if you replaced it and the release changes it (read the CHANGELOG entry).

**Fresh copy (A or B).** There is nothing to merge: your history and this repository's are unrelated. Take the owned files of the new release instead. From inside your project folder, clone this repository next to it and turn the difference between the two releases into a patch. Replace `env-v2` with the release you started from and `env-v3` with the one you want:

```bash
git clone https://github.com/lodmaome/conduit-env.git ../conduit-env-base
```

```bash
git -C ../conduit-env-base diff env-v2 env-v3 -- compose.yaml env tools contract .github docs ARCHITECTURE.md ENV-README.md THIRD-PARTY.md CHANGELOG.md > update.patch
```

(`ARCHITECTURE.md` is in the list because releases before `env-v3` had it at the root; the patch then moves it to `docs/env/`. Without it the old file stays behind.) Check that the patch fits, and apply it only if the check passes:

```bash
git apply --check update.patch
```

```bash
git apply update.patch
```

Delete `update.patch` afterwards (do not commit it). If the check fails, you edited an owned file: read the patch, apply it by hand, or leave that file. Then run `docker compose up -d --wait` and `node tools/verify.mjs`.
This was run end to end from a fresh copy of `env-v2` to `env-v3`: the check and the apply succeeded, the move of `ARCHITECTURE.md` was applied, and afterwards every owned path had the content of `env-v3` (the two scripts of a Windows ZIP copy still differed in the executable bit only). It was not run for any other pair of releases.

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

**CI.** `.github/workflows/env-verify-core.yml` is a reusable workflow that starts the stack on an `ubuntu-24.04` runner and runs the smoke test, the unit tests and the guard test. It was run on GitHub Actions in a throwaway repository on 2026-10-14 and passed, and it runs on every push to `main` of this repository (the run for `env-v3` passed on 2026-10-15). Call it from a workflow of your own:

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

It starts the stack with `docker compose -f compose.yaml up -d --wait`, so your `compose.override.yaml` does not change what it verifies; run your own tests against your override in your own job. Chrome comes from the runner image and floats; the workflow prints its version. If Chrome cannot start with its sandbox on some runner, pass the input `chrome-no-sandbox: true` (it was not needed on the runner that was tested). The workflow has one input, `chrome-no-sandbox`. Callers written for the first release that pass `run-gate` or `run-release-gate` are rejected before any job runs; seen on Actions for `run-gate` in the throwaway repository: the run ended as a startup failure with no jobs and the annotation `The workflow is not valid. .github/workflows/caller-rungate.yml (Line: 14, Col: 17): Invalid input, run-gate is not defined in the referenced workflow.` Remove those inputs from your caller. Do not set the repository variable `ENV_CANONICAL` in your repository: it switches on this repository's own wrapper workflow (`env-verify.yml`), which is not meant for a framework.

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

These commands change what is on your machine. **AI assistants are asked not to run `down`, `down -v` or image removal (the safety defaults in `AGENTS.md`); the owner of the machine does.** Never run `docker system prune`, `docker rm`, `docker rmi` or `-f` against containers or images that are not this project's: Docker on a developer machine is shared with other projects, and `prune` reaches all of them.

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
| `sh: command not found` or `sh` is not recognised on Windows | `sh` is not on your PATH. Use Git Bash or WSL, or put `C:\Program Files\Git\bin` on your PATH. |
| `no configuration file provided: not found` | you are not in the folder that contains `compose.yaml`. Go into your project folder (`cd my-automation-project`) and run the command again. |

## 12. What was tested and what was not

Tested: Windows 11 with Docker Desktop (Docker engine 29.8.2, Compose 5.5.1, Node 22.23.1, Chrome 154.0.8037.98), and GitHub Actions `ubuntu-24.04` (Docker 28.0.4, Compose v2.38.2, Node 22.23.1, Chrome 154.0.8037.97): the stack boots, the smoke test passes (5 checks including the browser), the 34 unit tests pass and the guard test passes. The Actions run of the current workflow files was on 2026-10-14 in a throwaway repository, and this repository's own wrapper workflow passed on a push to `main` on 2026-10-15.
A fresh copy from the template (Windows 11, Docker Desktop), tested on 2026-10-15: the stack started with an empty Docker image store but a warm build cache (not a cold build), the smoke test passed with a real Chrome, the guard refused a hostile project name and the reset returned the database to empty. A fresh copy from the ZIP of `env-v3` was made on Windows and `docker compose config --quiet` passed in it; its stack was not started.
Not tested: macOS; any Linux other than that runner; any Compose version other than 5.5.1 and 2.38.2 (2.20.0 is a documented lower bound only); another Chrome version; an offline `docker compose up` (every `up` runs a build pass and whether it contacts the network when everything is cached was not checked); byte-identical image rebuilds (they are not: apt packages are not pinned); production use.

## 13. Licences

The repository's own files are MIT (see [LICENSE](LICENSE)). Everything the images fetch or run has its own licence: [THIRD-PARTY.md](THIRD-PARTY.md). This repository was built with AI assistance (Claude, from Anthropic) under its owner's direction and review.
