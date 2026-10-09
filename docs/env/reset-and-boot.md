# Reset and boot

Stopgap written in Milestone 1. `docs/env/README.md` (Milestone 2) will absorb it and become the single place for exact commands.

## Before you start

- Docker Desktop (or another Docker engine) must already be running. Nothing in this environment starts or stops it.
  If a command fails with `open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`, the engine is down:
  start it yourself, wait until it reports running, and run the command again.
- Host ports 4180, 4181 and 4182 must be free. They are bound to `127.0.0.1` only.

## Reset and boot

Run these from the repository root, one after the other. They are two separate commands on purpose: Windows PowerShell 5.1 has no `&&`.

```bash
docker compose down -v --remove-orphans
docker compose up -d --wait
```

`tools/reset.sh` runs the same two commands (`sh tools/reset.sh`; on Windows use Git Bash or WSL).

What this does:

1. `down -v` removes the containers, the network **and the database volume**. Everything stored in the database is lost.
2. `up -d --wait` builds the images (every `up` runs the build, which is a quick cache hit when nothing changed), then starts `db`,
   runs the `migrate` one-shot (`python manage.py migrate`, nothing is generated), starts `api`, then `frontend`,
   and returns when every long-running service is healthy and `migrate` has exited with code 0.
   If `migrate` fails, `up` fails and `api` never starts.

The result is the empty initial state: migrations applied, no application rows, and no users, so register through the app or API.

| What | Where |
|---|---|
| Frontend | http://localhost:4180 |
| API | http://localhost:4181/api (health: `GET /api/tags` returns 200) |
| Database | `127.0.0.1:4182`, user `postgres`, password `0000`, database `postgres` |

Use `localhost`, not `127.0.0.1`, for the frontend in a browser: the API origin baked into it is `http://localhost:4181/api`.

## Rebuild after a pin change

Images are tagged with the pinned SHAs, and every `up` runs the build (`pull_policy: build`), so a change to a pin, a build arg, a Dockerfile or a lock file is picked up on the next `up`.
To rebuild without any build cache:

```bash
docker compose build --no-cache
```

## Compare two initial states

```bash
sh tools/dump-state.sh state-a
docker compose down -v --remove-orphans
docker compose up -d --wait
sh tools/dump-state.sh state-b
diff -r state-a state-b
```

The dump holds the schema, exact row counts per table, the applied migrations and the data of every table except `django_migrations`.
`pg_dump` writes random `\restrict` nonce lines; the tool strips them, so identical states compare equal.

## Not state-neutral

The API has no user-delete endpoint, so anything you register stays until the next reset.
