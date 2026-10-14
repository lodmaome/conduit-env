# conduit-env: architecture

How the repository is built and why it is shaped this way. How to use it is in [ENV-README.md](ENV-README.md).

## 1. Services and start order

Four services, started in this order by Docker Compose (`env/stack.yaml`):

```text
  db  (postgres:18, healthcheck pg_isready)
   |  service_healthy
   v
  migrate  (backend image, one-shot: python manage.py migrate, restart "no")
   |  service_completed_successfully
   v
  api  (backend image, Django runserver on 8000, healthcheck GET /api/tags)
   |  service_healthy
   v
  frontend  (nginx serving the built Vue app, healthcheck wget /)
```

- `migrate` runs `migrate` only. It never runs `makemigrations`: it applies the migrations the backend repository committed and generates nothing (upstream's own compose file runs `makemigrations && migrate`; this stack deliberately does not). Whether any model lacks a migration is checked by the smoke test (`makemigrations --check --dry-run` in the running `api` container), not on the boot path.
- If `migrate` fails, `up` fails and `api` never starts.
- The `api` health check is `GET /api/tags` from inside the container, because the backend has no health endpoint and this is the cheapest endpoint that touches the database.
- `docker compose up -d --wait` returns when every long-running service is healthy and `migrate` has exited 0.

## 2. How the images are built

All inputs are pins in **`env/pins.env`**, the one place where versions live:

| Pin | What |
|---|---|
| `BACKEND_REPO`, `BACKEND_SHA` | the django-ninja backend repository and its commit |
| `FRONTEND_REPO`, `FRONTEND_SHA` | the Vue frontend repository and its commit |
| `FRONTEND_REALWORLD_SHA` | the commit of the frontend's one required submodule (`realworld`) |
| `PYTHON_IMAGE`, `POSTGRES_IMAGE`, `BUN_IMAGE`, `NGINX_IMAGE` | base images, each pinned by `sha256` digest |

Upstream source is never copied into this repository. It is fetched at build time at the pinned commit.

**Backend image (`env/backend/Dockerfile`).** Two stages. The `fetch` stage runs on the pinned Python image, does `git fetch --depth 1` of the pinned commit, checks that the checkout is exactly `BACKEND_SHA`, and removes `.git`; it skips upstream's three git submodules (not needed to build or run). The final stage installs `libpq-dev` and `gcc` (psycopg2 is compiled from source), installs the Python dependencies from two **hash-pinned lock files** with `pip install --require-hashes` (`env/backend/build-tools.lock.txt` first, so building psycopg2 does not fetch an unpinned setuptools; then `requirements.lock.txt`, 31 packages), uninstalls the build tools, copies the fetched source in, and runs `manage.py runserver 0.0.0.0:8000`. The apt packages (`git`, `libpq-dev`, `gcc`) are not version-pinned.

**Frontend image (`env/frontend/Dockerfile`).** Three stages. `src` fetches the frontend at the pinned commit **with** its git metadata and **fails the build** unless the frontend's own commit equals `FRONTEND_SHA` and both the submodule's gitlink and its checked-out commit equal `FRONTEND_REALWORLD_SHA` (the message prints expected and actual); then it drops the git metadata. The submodule is required: the frontend imports a stylesheet from it. `build` runs `bun install --frozen-lockfile` and `bun run build` with `VITE_API_URL=http://localhost:4181/api`, which is the frontend's own build-time hook: **the API origin is baked into the built page**, no patch and no proxy; the browser talks to the API across origins. The last stage is `nginx:1-alpine` serving the built files.

**`pull_policy: build`.** Every service with a `build:` has it, and images are tagged with the pinned SHA only. Without it a changed build argument, Dockerfile or lock file under an unchanged SHA would silently reuse the old image. With it, every `up` runs the build step, a quick cache hit when nothing changed.

## 3. Compose layout

`compose.yaml` at the root is the entry point: `name: conduit-env` and one `include` of `env/stack.yaml` with `project_directory: .` and `env_file: env/pins.env`. The stack lives under `env/` and is only fed its variables by the root file, so a plain `docker compose up -d --wait` works with no `--env-file` flag and no root `.env`. Why this shape: a consumer of this repository needs the root of the repository for its own files (a root `.env`, a `compose.override.yaml`), and with `include` the consumer's override merges on top of the stack without anyone editing it.

## 4. Ports and networking

| Service | Host | Container |
|---|---|---|
| frontend | `127.0.0.1:4180` | 80 |
| api | `127.0.0.1:4181` | 8000 |
| db | `127.0.0.1:4182` | 5432 |

All three are bound to `127.0.0.1` only. Services reach each other on the project network by service name (`db`, `api`). The browser reaches the API directly at `http://localhost:4181/api` (the baked-in origin), so the frontend page and the API are different origins and the API answers with `access-control-allow-origin: *`. The database volume is `db-data`, mounted at `/var/lib/postgresql` (PostgreSQL 18 images keep their data under a versioned subdirectory of that path).

## 5. Data, reset and the project-name guard

State lives in the `db-data` volume only. `tools/reset.sh` runs `docker compose -p conduit-env down -v --remove-orphans` and then `up -d --wait`: containers, network **and volume** are deleted and the stack boots to the empty state (migrations applied, no rows).
Compose chooses the project name by this precedence: `-p`, then `COMPOSE_PROJECT_NAME` in the environment, then in a root `.env`, then a top-level `name:` in a merged file, and the `name: conduit-env` of `compose.yaml` comes last. So an environment variable, a `.env` or an override could silently point `down -v` at another project. `tools/project-guard.sh` (sourced by `reset.sh` and `dump-state.sh`) therefore resolves the name with `docker compose config` first, in the same directory with the same environment and files as the commands that follow, and refuses unless it is exactly `conduit-env`; it fails closed (non-zero exit, empty output, no `name:` line or more than one all refuse). Both scripts also pass `-p conduit-env` explicitly. `tools/test-project-guard.sh` tests the guard against a fake `docker` that only logs its arguments, and includes a mutation that removes the guard line to prove the tests would notice.
`tools/dump-state.sh <dir>` writes `schema.txt`, `data.txt` (every table except `django_migrations`), `rowcounts.txt` and `migrations.txt`, with `pg_dump`'s random `\restrict` lines stripped so equal states compare equal.

## 6. The contract snapshot

`contract/openapi.04ef47c.json` is the OpenAPI document the pinned backend serves at `http://127.0.0.1:4181/openapi.json`, normalised: keys sorted at every level, 2-space indent, LF, one trailing newline (`contract/.gitattributes` forces LF, since the file is byte-sensitive). It has 25 operations: 19 RealWorld and six under `/auth/`. It also has one root key, `x-conduit-env`, an OpenAPI extension key:

```json
"x-conduit-env": {
  "backend-sha7": "<first 7 hex characters of BACKEND_SHA>",
  "build-tools-lock-sha256": "<sha256 of env/backend/build-tools.lock.txt>",
  "requirements-lock-sha256": "<sha256 of env/backend/requirements.lock.txt>"
}
```

It records which pins and locks the snapshot belongs to. Compute the three values by hand:

```bash
echo "backend-sha7: $(sed -n 's/^BACKEND_SHA=\(.......\).*/\1/p' env/pins.env)"
```

```bash
sha256sum env/backend/requirements.lock.txt env/backend/build-tools.lock.txt
```

## 7. Bumping a pin

Nothing in this repository regenerates the locks or the snapshot: the tools for that live in the `env-v1` tag and are taken from it when needed. **Nothing in this repository proves that a corrupted lock hash fails the build, or that a wrong submodule pin fails it**: those were proven once, in the `env-v1` tag's tools, and are not re-run here. After any bump, run the smoke test.

*Frontend, base images.* Edit the value in `env/pins.env` (a digest for an image; for a frontend bump also `FRONTEND_REALWORLD_SHA`, set to the submodule commit the new frontend commit points to: the build's error message prints the actual value). Then `docker compose up -d --wait` and the smoke test.

*Backend commit.* The locks must be regenerated and the snapshot with them. Take the generator from the tag (these write five temporary files; delete them afterwards):

```bash
git show env-v1:tools/lock-backend.sh > tools/lock-backend.sh
git show env-v1:tools/lock-hashes.sh > tools/lock-hashes.sh
git show env-v1:env/backend/Dockerfile.lock > env/backend/Dockerfile.lock
git show env-v1:env/backend/build-tools.in > env/backend/build-tools.in
git show env-v1:env/backend/lock-seed.txt > env/backend/lock-seed.txt
```

Edit `BACKEND_SHA` in `env/pins.env`. Resolution is held to the versions in `lock-seed.txt`; to move versions on purpose, edit that file. Then:

```bash
sh tools/lock-backend.sh
```

This rewrites the two lock files in `env/backend/` and prints the three snapshot values. Then boot the new stack, and regenerate the snapshot with the two tools from the tag:

```bash
git show env-v1:tools/openapi-snapshot.mjs > tools/openapi-snapshot.mjs
git show env-v1:tools/lib/openapi.mjs > tools/lib/openapi.mjs
```

```bash
docker compose up -d --wait
```

```bash
sh tools/lock-hashes.sh > hashes.tmp
node tools/openapi-snapshot.mjs hashes.tmp > contract/openapi.NEWSHA7.json
```

Replace `NEWSHA7` with the first seven characters of the new `BACKEND_SHA`, remove the old snapshot file, delete the temporary files (`hashes.tmp` and the files taken from the tag), and note the change in `CHANGELOG.md`.

## 8. Extension mechanism for consumers

A consumer adds services, mounts or settings with `compose.override.yaml` at the repository root; Compose loads it automatically and it merges over `compose.yaml` and the included stack. The measured rules (paths relative to the repository root, no nested `include`, `-f` bypasses it, a `name:` is refused by the guard, one-shot services and `--wait`, `pull_policy: build`) are in [ENV-README.md](ENV-README.md) section 8. The reusable workflow `.github/workflows/env-verify-core.yml` starts the stack with `-f compose.yaml` on purpose, so an override never changes what it verifies.

## 9. Security posture

The upstream defaults are insecure and are kept: database password `0000`, `ALLOWED_HOSTS=*`, Django's development server, CORS for any origin. They are acceptable only because every port is bound to `127.0.0.1`. Do not change a binding to `0.0.0.0` and do not expose these ports. The frontend page loads two stylesheets and fonts from third-party hosts when viewed.

## 10. Map of the repository

| Path | What it is |
|---|---|
| `README.md` | front page; replace it with your own |
| `ENV-README.md` | the manual |
| `ARCHITECTURE.md` | this document |
| `THIRD-PARTY.md` | licences of what the images fetch or run |
| `CHANGELOG.md` | releases, with class and merge guidance |
| `LICENSE` | MIT |
| `compose.yaml` | entry point: project name, includes the stack |
| `env/stack.yaml` | the four services |
| `env/pins.env` | every upstream pin |
| `env/.gitattributes` | forces LF under `env/` (the lock files are hashed) |
| `env/backend/Dockerfile`, `build-tools.lock.txt`, `requirements.lock.txt` | backend image and its hash-pinned locks |
| `env/frontend/Dockerfile`, `nginx.conf` | frontend image and its web server config |
| `contract/openapi.04ef47c.json`, `contract/.gitattributes` | the contract snapshot and its LF rule |
| `tools/reset.sh`, `project-guard.sh`, `dump-state.sh` | reset, the project-name guard, state dump |
| `tools/test-project-guard.sh` | tests the guard against a fake `docker` |
| `tools/verify.mjs`, `browser-check.mjs`, `lib/` | the smoke test (HTTP checks plus a real Chrome) |
| `tools/test/` | unit tests of the smoke test (`node --test tools/test/*.test.mjs`) |
| `tools/.gitattributes` | line-ending rules for the tools |
| `.github/workflows/env-verify-core.yml` | reusable boot-and-verify workflow |
| `.github/workflows/env-verify.yml` | this repository's own wrapper (runs only where `ENV_CANONICAL` is `true`) |

The lock files' header lines say they were generated by `tools/lock-backend.sh` and mention `lock-seed.txt`; both are in the `env-v1` tag (section 7), not in this tree. The header lines are left as generated because the lock files' hashes are part of the snapshot.
