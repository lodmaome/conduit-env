# Starting an attempt

An attempt is a separate repository cloned from this one. It adds its own tests, tooling and notes and leaves the environment alone.
Read [README.md](README.md) first for how the stack runs, and [WORKING-AGREEMENT.md](WORKING-AGREEMENT.md) for the rules.

## 1. Start

```bash
git clone <environment-repository-url> my-attempt
cd my-attempt
git remote rename origin env
git remote add origin <url of the new, empty repository you created>
git push -u origin main
```

`env` stays as the remote that new environment tags come from. Check that it works: `docker compose up -d --wait` (see README), then `node tools/verify.mjs`.

## 2. Territory: OWNED, SEED, and yours

| Kind | What | Rule |
|---|---|---|
| **OWNED** | `compose.yaml`, `env/**`, `tools/**`, `docs/env/**`, `.github/workflows/env-*.yml` (the list is `env/OWNED.txt`) | The environment owns these. An attempt does not edit them. If one is wrong, write a proposed env change (section 6). |
| **SEED** | `README.md`, `LICENSE`, `docs/attempt/.gitkeep` (`env/SEED.txt`) | Shipped once, at `env-v1`. You may replace or edit them freely; later env tags never touch them. |
| **Yours** | everything else, including a root `.gitignore`, `.gitattributes`, `.env`, `.dockerignore`, `package.json`, your tests, and `compose.override.yaml` | The environment never ships these and never touches them. |

All documents an attempt writes go under `docs/attempt/`.

## 3. Your instructions file

Add this line to the attempt's own `CLAUDE.md`:

```
@docs/env/WORKING-AGREEMENT.md
```

**This import is unverified.** I have not shown that an assistant started in an attempt actually loads the file through that line. Until that is checked
(deferred, see [adr/0003-env-v2-deferrals.md](adr/0003-env-v2-deferrals.md)), the prompt of the first attempt should check by hand that the agreement is loaded, for example by asking the assistant to quote rule 9 of section 1. Every rule in section 1 says whom it applies to: **[everyone]**, **[environment repo only]** (not yours: for example the release gate and the stdlib-only tooling rule) or **[attempts only]** (written for you).

## 4. Extending the stack: `compose.override.yaml`

An attempt adds services, mounts or settings with a file named exactly **`compose.override.yaml`** at the **repository root**, next to `compose.yaml`. Docker Compose loads it automatically.
The environment never ships that file, and its own checks bypass it. The rules below were measured (ADR 0001 section 4, Compose 5.5.1 on Windows; Linux and Actions are untested):

- **Paths in the override are relative to the repository root**, not to the override file or any subdirectory. A build context or bind mount written relative to a subdirectory fails.
- **Do not `include` `compose.yaml` from a file in a subdirectory**: the nested `env_file` resolves against the working directory and fails from the repository root.
- **The auto-load is invisible.** `docker compose up` prints nothing about the override. `docker compose config` shows the merged result and `docker compose ls` lists `compose.yaml,compose.override.yaml`.
- **`-f` or `COMPOSE_FILE` bypasses it.** Anyone who sets either gets the bare environment, and the attempt's own services become orphans (a warning, not an error).
- **A top-level `name:` in the override, or `COMPOSE_PROJECT_NAME` anywhere, changes the project name.** `tools/reset.sh` and `tools/dump-state.sh` then refuse to run (the project guard); remove the name.
- **A one-shot service in the override makes `up --wait` exit non-zero** (`container ... exited (0)`) unless another service depends on it with `service_completed_successfully`. Add long-running services, or keep one-shot runners out of `up`.
- **Your built services need `pull_policy: build`**, as the environment's do. Images are tagged with a pinned value only, so without it a changed Dockerfile or build argument under the same tag silently reuses the old image.
- **`-f compose.yaml up` with your extra service running prints a warning** `Found orphan containers (conduit-env-<service>-1) for this project` and leaves the service running (seen).
- **Two clones share one project name** (`conduit-env`) and the fixed ports; starting the second recreates the project's containers (seen, after stopping the first). Run one stack at a time. (`docker compose ls` then lists the config files of every directory the project was started from.)
- The stack's ports are fixed: frontend 4180, API 4181, database 4182, on `127.0.0.1` only. The frontend has the API origin `http://localhost:4181/api` built in, so changing a port means rebuilding it.

**Which scripts honour the override, and which bypass it:**

| Script | Override |
|---|---|
| `docker compose ...` without `-f`, `tools/reset.sh`, `tools/dump-state.sh` | **honoured** (auto-loaded). `reset.sh` resets the attempt's whole stack (seen: the extra service was stopped and started again). A broken override makes `reset.sh` **refuse** before it touches anything: the project guard cannot resolve the project name (seen). |
| `node tools/verify.mjs` (default) | HTTP checks hit the fixed ports whatever runs there; its one `exec` uses `-f compose.yaml` (**bypassed**) |
| `node tools/verify.mjs --fresh` | **bypassed** on purpose (`COMPOSE_FILE=compose.yaml`): it deletes the database volume, removes the project's orphans **including your extra services**, and brings up the bare environment. It prints this and is never the default. |
| `tools/snapshot.sh`, `tools/python-licences.sh`, `tools/check-migrations-mutation.mjs`, `node tools/release-gate.mjs` | **bypassed** (`-f compose.yaml`) |
| `sh tools/gate.sh` | renders `docker compose config` with and without `-f`; with an override present it skips the comparison of the two and says so |
| `tools/check-lock-hashes.sh`, `tools/check-submodule-pin.sh` | not affected: they call `docker buildx build` directly |

## 5. Extra operations to exclude from coverage

The backend serves 25 operations: the 19 RealWorld ones and six under `/auth/` that are not part of RealWorld. A coverage-gap flagger must exclude every `/auth/` path.
The list and the snapshot are in [contract/README.md](contract/README.md).

## 5b. The page requests external hosts

The frontend's `index.html` loads two external stylesheets from `code.ionicframework.com` and `fonts.googleapis.com`, and the font stylesheet requests files from `fonts.gstatic.com`. A test run on a blocked or offline network sees different timing (measured once: load event 65 ms with the two stylesheet hosts blocked against 262 ms unblocked) and different fonts and icons, but the stack itself works (the browser check's assertions passed either way).
Whether an attempt blocks or mocks those requests is the attempt's own decision; write it down in `docs/attempt/`. `node tools/browser-check.mjs` lists the external hosts it saw as an informational line.

## 6. An env-level defect

If something owned by the environment is wrong (a script, a pin, the stack, a document), do not edit it in the attempt. Write it up in `docs/attempt/` as a **proposed env change**:
what you saw, the exact command and its output, the files involved and the change you suggest. The repository owner decides whether and where to file it.
Defects of the app itself go in your own findings page, with reproductions you have run (see [FINDINGS.md](FINDINGS.md) for the format).

## 7. Merging a new env tag

```bash
git fetch env --tags
git merge env-v2        # or the tag you are moving to
```

Every release has an entry in [CHANGELOG.md](CHANGELOG.md) with a **class** and a **merge** value. The meanings used here:

| Class | The release changes |
|---|---|
| `pin` | an upstream pin or a gate-tool pin (backend, frontend, base images, lock files) |
| `build` | how the images or the stack are built or started |
| `contract` | the served API contract (the OpenAPI snapshot) |
| `docs` | documents and tooling that do not change the running stack |

| Merge | Meaning |
|---|---|
| `required` | merge before doing more work on tests: the stack or contract your tests run against changes |
| `recommended` | merge when convenient: fixes and tooling you will want |
| `not needed` | nothing your attempt depends on changed |

Tags are annotated, named `env-vN`, and never moved. Because a release changes only OWNED paths, a merge should conflict only if you edited an OWNED path, which you should not have. (Not yet tried: the first real merge of a second tag has not happened.)
