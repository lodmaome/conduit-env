# conduit-env: Milestone 1 follow-up report

**Status: all 13 review rulings done, one incident open (section 1), awaiting your review.** Local only: no push, no tag, no GitHub work.
Raw evidence (logs, harness scripts, dumps, scans) is **outside the repository**, in `C:\git\conduit-env-evidence\` (`phase1-evidence\` and `m1-evidence\`); it is cited below by name only, as external evidence. The [ADR](adr/0001-pair-lock-and-migrations.md) carries the numbers and decisions.

> **Close-out update (Milestone 1 closed, after the owner's answers).** The status above and sections 1, 5 and 6 are as delivered and are partly superseded:
> the owner restored the five Docker images and told me not to touch them or anything else of theirs (incident closed on their side; the cause and the rules stay recorded in the ADR);
> commit `f368757` is **not** rewritten now (the ADR, section 5, records the decision and the conditions for any later rewrite);
> an attempt extends the stack with `compose.override.yaml` at the **repo root**, not `attempt/compose.yaml` (the gate and the decision are in the ADR, section 4; ruling 13 below describes the earlier `attempt/` tests, which stay as a record);
> the fetch stage keeps apt `git`; and the hard rule on Docker removals is in the ADR, section 5.

## 1. Incident: a cleanup step of mine deleted Docker images that were not mine

**What happened.** The follow-up timing script ended its cold-start step with `docker rmi -f` on every image "not in the pre-run snapshot". It resolved the repository root one directory too high, so the snapshot file was not found, the snapshot list was empty without any error,
and the script removed every image it could, including five of your own: three built locally from another project, and two public images (a Playwright image and `rhysd/actionlint`). Images in use by running containers were not removable, which is why mine survived.

**Damage, checked read-only afterwards.** Your four stopped containers, all six volumes and all four networks are intact (the stopped containers still reference their image ids and their filesystems are still there). Nothing in your project's sources was touched. What is gone are the five image records.
**It is not restored.** Restoring means re-pulling about 3.4 GB and rebuilding from your project's own compose file, and the rebuilt images will not be byte-identical to the removed ones (your project's Dockerfile pins a newer Playwright tag than the removed image used, and `rhysd/actionlint:latest` is a floating tag).
I have made no change to your objects since noticing, and I am asking you before touching them (section 6).

**Fixes already made.** The script now derives the repo root from its own location and asserts it, refuses to run if the snapshot has fewer than 5 ids, removes only an allow-list (repository `conduit-env/*` and the one `postgres` digest this work pulled), prints the removal list first and stops if any entry is in your snapshot;
its selection was dry-run before the real run. The older Milestone 1 script with the same deny-list pattern is disabled. The stray log folder the broken run created next to the repository was mine and is removed. The rule is recorded in the ADR (section 5) and in the assistant's memory.

## 2. The 13 rulings

| # | Ruling | Result |
|---|---|---|
| 1 | Hurl 8.0.1 once against the M1 stack, same spec SHA, fresh DB | **154 of 154 entries, 13 of 13 files, Hurl exit 0** (raw 100 %, adjusted 100 %, 0 cascade). Control: the same runner and scorer against an unreachable port exit 3 with 0 of 154 passing. Matches Phase 1. Run on the final stack, after items 3 to 6 and 10. |
| 2 | pip log proving no download outside a hash check; mutation check | Real `--no-cache` build log: 34 `Collecting` and 34 downloads (3 + 31), all 34 cite a lock file, none unpinned, no build-isolation lines. Instrumented run: every installed file's sha256 is a locked hash; connections to `pypi.org` and `files.pythonhosted.org` only. **`tools/check-lock-hashes.sh`**: control build passes; zeroing every hash of `annotated-types` (runtime lock) and of `setuptools` (build-tools lock) each fails the real build with a hash mismatch naming the package. |
| 3 | Are the submodules needed? Skip or list | Backend's three: **not needed**, and **skipped** now (a `git fetch <sha>` stage with an assertion `HEAD == BACKEND_SHA`; BuildKit's `ADD <git>` has no way to skip them). Result equals the old tree in content, modes and owners outside those directories. Frontend's one (`realworld`): **needed** (`src/main.js` imports its theme CSS), cannot be skipped, listed with its commit. All four with SHAs are in ADR section 4. |
| 4 | Rename `constraints.txt`; define the b+ header hashing | `requirements.lock.txt` and `build-tools.lock.txt` (`git mv`, every reference updated, a gate check for stale names). Header: `backend-sha7`, `requirements-lock-sha256`, `build-tools-lock-sha256`, one hash per file over the committed bytes (LF is enforced), printed by `tools/lock-hashes.sh`; the static release-gate check recomputes and compares (ADR section 2). The lock was regenerated with `--no-cache` and has identical packages, versions and hashes; only its header comment changed. |
| 5 | Remove the migrations check from the migrate one-shot; re-measure boot | `migrate` runs `python manage.py migrate` only. The check (`makemigrations --check --dry-run`) is documented as an M2 verify-script and CI item. Boot re-measured: see item 10. |
| 6 | Replace `oven/bun:latest` | `oven/bun:1.4.2@sha256:9114c058...`: the pinned digest was inspected (bun 1.4.2, Debian 13) and the `1.4.2` tag resolves to exactly it. `1.4.2-debian` is a different digest, noted next to the pin. |
| 7 | Track both reports under `docs/env/`; raw evidence out of git; grep for secrets | Both moved to `docs/env/` (contents of the Phase 1 report unchanged, byte count identical). Evidence folders were kept out of git through `.git/info/exclude`; at the close-out they were moved outside the repository to `C:\git\conduit-env-evidence\` and those exclude lines were removed. Secret scan, with a positive control that fires on all 7 categories: **nothing in anything git will track.** Raw evidence holds test data only: ~1,500 access tokens issued by throwaway test stacks inside Hurl reports, test passwords (`Passw0rd!x`, `pass12345`, the database `0000`), per-run `@test.com` users, and one `JWT_SECRET` in a Phase 1 harness file commented as copied from the nitro repo's own docs. Six Phase 1 harness scripts contain a local Windows username in a path. PNG screenshots and SQLite files were not scanned (binary). |
| 8 | include + env_file and apt drift accepted; label "clone to healthy" as an estimate | Done in the ADR and in this report: "clone to healthy" is labelled an estimate (a sum of separately timed steps) everywhere. |
| 9 | Print git log authors and file list per commit | In the chat message that accompanies this report (a report cannot list the commit that adds it). |
| 10 | `pull_policy: build` and a build-arg mutation proof; re-measure boot-only | `pull_policy: build` on `migrate`, `api` and `frontend`. Proof: with `pull_policy: missing` and `VITE_API_URL` changed to `:4999` the image id stays `61e1c8f7c276` and the bundle still contains `:4181` (**stale**); with `pull_policy: build` the image is rebuilt (`018901dfd1dc`) and the bundle contains `:4999`; a plain `up` rebuilds it back. **Boot as documented: median 11.91 s (12.5 / 11.9 / 11.5); with `--no-build`: median 10.01 s (10.0 / 9.8 / 10.0).** The build pass costs about 1.9 s per `up`. Compare Phase 1 8.69 s and the first M1 build 10.68 s; about 1.3 s of the gap to Phase 1 is still not attributed. |
| 11 | ADR section 5 wording | "a likely better frontend" replaced by "a frontend that scored higher on one instrument"; the lesson that both formal knockouts were harness faults is stated. |
| 12 | Update ADR links; cite raw evidence as external | ADR links point to `../PHASE1-REPORT.md`, `../MILESTONE1-REPORT.md` and `../MILESTONE1-FOLLOWUP.md`; the evidence is cited by name as external. The first M1 report carries a revision note that its `m1-evidence/` paths are external and that parts of it are superseded. |
| 13 | Relative build context and bind mount against the included stack, now | Tested with an `attempt/` directory on the live stack (ADR section 4): override files via `-f` and via `COMPOSE_FILE` work when paths are written relative to the **repo root**; the natural attempt-relative paths fail (the project directory is the first file's); an `attempt/` file that includes `../compose.yaml` **fails** (the nested `env_file` resolves against the working directory) unless run from inside `attempt/`; a root-level file that includes `compose.yaml` works. |

Other numbers: `--no-cache` build 44.5 s (images present: 44.5 s), `postgres` pull 12.3 s, clone to healthy about 69 s (estimate). Images: backend 662 MB (was 671 MB), frontend 94.1 MB.

## 3. Deviations and interpretations (overrule any)

1. **Item 3 is implemented with `git` from apt in a throwaway fetch stage,** not with a new pinned base image: no new pin, but 17 more unpinned apt packages in a stage that ships nowhere. The alternative is a git-capable image by digest.
2. **The lock-generation Dockerfile also uses the git fetch stage** (it needs only `pyproject.toml`), so lock generation no longer clones the three backend submodules either.
3. **The header-hash definition covers both lock files** although only the runtime lock can change the served OpenAPI document. This is how I read "hashes both lock files".
4. **The ADR and the first report are edited in place** (no ADR numbering change), with the first report keeping its original body behind a revision note.
5. **The three stack-extension patterns documented as working** (override via `-f`, via `COMPOSE_FILE`, root-level include) come from one machine and one Compose version (5.5.1, Windows); Linux and Actions are untested.

## 4. Mistakes of mine caught in this round (all redone or fixed)

- The deletion incident above (a wrong path and a deny-list).
- An override test log relied on a relative path while the working directory had changed, so one variant's result was lost and had to be rerun.
- The first pip-proof check counted any URL in message text as a "host contacted" and failed on warnings; it now counts real connections only.
- A first `grep` over the real build log returned all zeros because the log is UTF-16 when written through PowerShell; the "absence" checks were vacuous until converted, and presence controls were added.
- The first secret scan had a positive control for none of its categories except the one that happened to fire on real data (JWTs); an empty result for the others meant nothing until a decoy file with one fake of every shape was added and caught in all 7 categories.

## 5. Still unverified

- **Whether `up` works with no network at all** now that every `up` runs a build pass (does BuildKit contact GitHub when every step is cached?). Not tested.
- **Reset cycles were not repeated** after the follow-up changes (the Hurl run did start from a fresh database on the final stack).
- **A real-browser flow** against the compose-built pair; the raw-CDP check is Milestone 2.
- **Stack-extension behaviour on Linux and Actions**, and with a Compose version other than 5.5.1.
- **Nothing on `ubuntu-24.04` or Actions.** One Windows laptop; timings are lower bounds and the network varied.
- **apt packages float** (now including `git` in the fetch stage); the frontend build depends on `realworld-apps/realworld` existing at its gitlinked commit; PyPI, GitHub, Docker Hub and the Debian mirror must be reachable.
- **PNG and SQLite evidence files were not secret-scanned.**
- **One second of the boot time is unattributed** against Phase 1.

## 6. Decisions I need from you

1. **Restoring your five images.** Options: (a) you restore them yourself from your project; (b) I restore them with your go-ahead: pull the public Playwright image, rebuild your project's three images from its compose file, and pull `rhysd/actionlint`. Tell me which, or that you want to do it differently. Until then I touch nothing of yours.
2. **Keep the fetch-stage approach for item 3,** or use a digest-pinned git image instead of apt?
3. **Anything else you want changed** after reading the ADR section 4 attempt-extension rules (they will become an `ATTEMPTS.md` item in Milestone 2).
