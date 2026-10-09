# conduit-env: Milestone 2 report

**Status: Milestone 2 is done locally and awaits your review.** HEAD is the commit that adds this report; before it there are 19 commits since `7d87171` (33 on `main` in all, 14 from before Milestone 2). Nothing was pushed, tagged, or created on GitHub, nothing under `.github/` exists, and no third-party repository was touched.
Raw evidence is **outside the repository**, in `C:\git\conduit-env-evidence\m2-evidence\` (cited below by sub-folder and file name only; you can open them, a reader of this repository cannot). Each claim below is marked **seen** (with where) or **not seen**. The decisions and measurements are in [ADR 0002](adr/0002-milestone2-decisions.md) (sections 1 to 8) and [ADR 0003](adr/0003-env-v2-deferrals.md).

**For your review before `env-v1`:** [WORKING-AGREEMENT.md](WORKING-AGREEMENT.md). Section 1 (rules 1 to 9) and the wording around the rules are mine; (a) to (c) are yours, verbatim and unedited; (d) carries your flake policy values. The marker is gone, so release check 2 passes, but you have not read the file yet.

## 1. What was done

| Task | Result | Evidence (m2-evidence) |
|---|---|---|
| 0.1 project guard | `tools/project-guard.sh` sourced by `reset.sh` and `dump-state.sh`; `-p conduit-env` on `down` and `up`. Name resolution measured for env var, root `.env`, override `name:` (all three change it; only `-p` wins). Fake-docker tests: 5 refusal cases x 2 scripts, positive case, mutation (guard removed shows `down` in the log): 0 failed. **Real `reset.sh` plus `dump-state.sh`: the four sha256 values equal yours** (seen). | `t0.1/project-name-measure.txt`, `guard-test.txt`, `guard-test-2.txt`, `dump-sha256.txt`, `frontend-after-reset.txt` |
| 0.1b | `dump-state.sh` makes a relative output directory absolute before the `cd`; test plus a mutation. | `t0.1/guard-test-2.txt` |
| 0.2 submodule pin | Probe: `--keep-git-dir` reads gitlink and checkout, both equal the GitHub API value. `FRONTEND_REALWORLD_SHA` in `env/pins.env`, `src` stage asserts it, `tools/check-submodule-pin.sh` (control, wrong pin, neutralised-assertion mutant): 0 failed. No `.git` in the final image (2168 entries) or the `src` stage; presence control 271. Licence read. | `t0.2/` |
| 1 verify | `node tools/verify.mjs [--fresh] [--no-browser]`: tags, api-flow, frontend, migrations (+ browser). 65 unit tests in all, one fixture per fault. Migrations mutation on the live stack with invariance snapshots (git, 4 containers, `docker diff`): unchanged. `--fresh` ran for real. DB footprint measured. | `t1/` |
| 2 browser check | `tools/browser-check.mjs`, raw CDP, own Chrome 154.0.8037.98 and profile, killed by PID. CORS probe (`*` for all origins). Control 3/3; mutation 1 and 2 fail readably; `CHROME_BIN` unset or wrong exits 90. | `t2/` |
| 3 gate tooling | `tools/gate.sh`: shellcheck, actionlint, yamllint, hadolint, lychee as digest-pinned containers; 16 fixture checks; real lists clean; `--online` informational. | `t3/` |
| 4 snapshot | `docs/env/contract/openapi.04ef47c.json` with the b+ header; `tools/snapshot.sh`; regeneration twice byte-identical; six `/auth/` operations listed. | `t4/` |
| 5 release gate | `node tools/release-gate.mjs env-v1`: 14 release checks and 6 ported M1 checks; `--self-test` runs each against a golden control and a failing fixture. Final run at HEAD: exit 0, one visible SKIP (check 4, first release). | `t5/`, `final/` |
| 6 docs | README (root, seed), LICENSE (seed), `docs/attempt/.gitkeep` (seed), `docs/env/` README, ATTEMPTS, CHANGELOG, FINDINGS, HOW-THIS-WAS-BUILT, WORKING-AGREEMENT, THIRD-PARTY, ADR 0002 and 0003, `tools/python-licences.sh` and its generated listing. | `t6/` |
| 7 rehearsal | Clone, `git remote rename origin env`, README and ATTEMPTS followed: **cold 56.7 s, warm 11.4 s** (one run each). Override behaviour checked. Frontend cold build: **old 7.5 s and 6.0 s, new 13.9 s and 18.1 s**. Gate, self-test, `makemigrations --check` through verify, all green in the clone after two fixes. | `t7/` |

Final verification at HEAD (all seen in `final/`): `sh tools/gate.sh` 0 failed; `node tools/release-gate.mjs env-v1` 0 failed (1 SKIP); `--self-test` 0 failed; `node --test` 65 of 65; `tools/test-project-guard.sh` 0 failed; `node tools/verify.mjs` with the browser 5 of 5 PASS; `tools/check-migrations-mutation.mjs` 0 failed;
`tools/check-lock-hashes.sh` 0 failed (control builds, both mutations fail with a hash mismatch); `tools/check-submodule-pin.sh` 0 failed.

## 2. Commits since `7d87171` (hash, message, files)

I compared every message with `git show --stat` for the commit. **No mismatch found** (every file group is named in its message). The table cannot list the commit that adds this report.

| Hash | Message | Files |
|---|---|---|
| `e5fb6cc` | tools: project-name guard for reset.sh and dump-state.sh | `tools/project-guard.sh`, `tools/reset.sh`, `tools/dump-state.sh`, `tools/test-project-guard.sh`, `docs/env/reset-and-boot.md`, `docs/env/adr/0002-milestone2-decisions.md` |
| `791b44e` | env: pin the frontend submodule (FRONTEND_REALWORLD_SHA) and fail the build when it differs | `env/pins.env`, `env/frontend/Dockerfile`, `env/stack.yaml`, `tools/check-submodule-pin.sh`, ADR 0002, ADR 0001 |
| `5297c56` | docs: ADR 0002: record the real reset result and the containerd image-store correction | ADR 0002 |
| `aea9a47` | tools: dump-state.sh resolves a relative output directory against the caller's cwd | `tools/dump-state.sh`, `tools/test-project-guard.sh` |
| `884a66e` | tools: verify.mjs (tags, api flow, frontend, migrations) with unit tests and a migrations mutation | `tools/verify.mjs`, `tools/lib/verify-lib.mjs`, `tools/lib/verify-checks.mjs`, `tools/test/verify.test.mjs`, `tools/test/fake-conduit.mjs`, `tools/check-migrations-mutation.mjs`, ADR 0002 |
| `fc3ef21` | tools: raw-CDP browser check, wired into verify with an explicit --no-browser | `tools/browser-check.mjs`, `tools/lib/browser-lib.mjs`, `tools/test/browser.test.mjs`, `tools/verify.mjs`, `tools/lib/verify-lib.mjs`, ADR 0002 |
| `7c8c22a` | tools: fix the shellcheck findings the new gate reported | `tools/check-lock-hashes.sh`, `tools/check-submodule-pin.sh`, `tools/reset.sh`, `tools/dump-state.sh`, `tools/test-project-guard.sh` |
| `058ab7b` | tools: gate.sh runs shellcheck, actionlint, yamllint, hadolint, lychee as digest-pinned containers, with fixtures | `env/gate/tools.env`, `env/gate/{yamllint.yaml,hadolint.yaml,lychee.toml}`, 15 files under `env/gate/fixtures/`, `tools/gate.sh`, ADR 0002 |
| `2240da4` | tools: the gate lints itself clean (gate.sh shellcheck findings, hadolint.yaml line length) | `tools/gate.sh`, `env/gate/hadolint.yaml` |
| `5b9e69c` | contract: OpenAPI snapshot with the b+ header, its regeneration tool and tests | `docs/env/contract/openapi.04ef47c.json`, `docs/env/contract/README.md`, `tools/lib/openapi.mjs`, `tools/openapi-snapshot.mjs`, `tools/snapshot.sh`, `tools/test/contract.test.mjs`, ADR 0002 |
| `1f3df15` | contract: force LF under docs/env/contract (the snapshot is byte-sensitive) | `docs/env/contract/.gitattributes` |
| `590ea9a` | tools: release gate (14 release checks and 6 ported M1 checks) with a self-test | `tools/release-gate.mjs`, `tools/lib/release-checks.mjs`, `tools/lib/golden-tree.mjs`, `tools/lib/release-ctx.mjs`, `tools/gate.sh`, `tools/test/release.test.mjs`, `env/gate/license-mit.txt`, ADR 0002 |
| `0991c83` | tools: release gate secret scan exempts only its own fixture files, and says how many | `tools/lib/release-checks.mjs` |
| `719d14a` | docs: seed files README.md, LICENSE and docs/attempt/.gitkeep | `README.md`, `LICENSE`, `docs/attempt/.gitkeep` |
| `a561d8c` | docs: third-party notices and the generated Python licence listing | `docs/env/THIRD-PARTY.md`, `tools/python-licences.sh`, `docs/env/third-party/python-licences.txt` |
| `2f6ff71` | docs: README, ATTEMPTS, WORKING-AGREEMENT, CHANGELOG, FINDINGS, HOW-THIS-WAS-BUILT and ADR 0003 | the seven files named |
| `6fa427a` | tools: release gate looks at committed line endings and ignores CRLF checkout conversion | `tools/lib/release-ctx.mjs`, `tools/lib/release-checks.mjs` |
| `e4b5700` | tools: yamllint ignores line-ending style (compose.yaml is CRLF in Windows clones) | `env/gate/yamllint.yaml` |
| `a84e818` | docs: rehearsal results in README, ATTEMPTS and ADR 0002 section 8 | `docs/env/README.md`, `docs/env/ATTEMPTS.md`, ADR 0002 |

Authors are all `lodmaome <leandro.donato@ymail.com>`; each message ends with the `Co-Authored-By: Claude Sonnet 5.5` line.

## 3. Corrections you asked for

- **The previous frontend image does not stay.** Recorded in ADR 0002 section 2 with the outputs: Docker uses the containerd image store, `8a3d12b748e2` is not listed and `docker image inspect` on its full id says "No such image" although the running container was created from it. A rebuild under the same tag drops the previous image: no rollback target. Seen (`t0.1/frontend-after-reset.txt`).
  Image ids also change on every rebuild even from cache (`8a3d12b748e2`, `16bd7eacd2ef`, `3074fa7313a0`, and later `bedf55b12f05`).
- **Expected API origin is `http://localhost:4181`**, not `127.0.0.1:4181` (ADR 0002 section 4). `localhost` resolves to `::1, 127.0.0.1` here; Chrome's API responses came from `127.0.0.1`; nothing different was observed (informational, no timing).
- **Known limitation, counted:** the frontend `src` stage installs apt `git`, 17 newly installed packages (same as the backend fetch stage); the unpinned apt surface is 76 (backend image stage) + 17 (backend fetch) + 17 (frontend `src`). `PYTHON_IMAGE` is used by the frontend build as well; THIRD-PARTY.md says so. Seen (`t3/frontend-src-nocache.log`).
- **M3 evidence archive** will exclude the large tar exports `t0.2\final.tar`, `src.tar` and `mutsrc.tar`.

## 4. Docker before and after

Snapshots of `docker images -a`, `docker ps -a` and `docker volume ls` (names only) at the start and end of M2 are in `docker/`. Seen.

- **Volumes:** identical (7 names, including `conduit-env_db-data`). No volume of yours was touched.
- **Containers:** the same 8 names and images (the four `conduit-env-*` containers are re-created, your `docker-*`, `playwright-devbox` and `crazy_rhodes` untouched). No `conduit-env.gate=1` container is left.
- **Images:** `conduit-env/backend` `a583654d2ebf` to `b8fa3cd98c5a` and `conduit-env/frontend` `8a3d12b748e2` to `bedf55b12f05` (rebuilds; the old ones are gone from the image store); four gate images added by digest: `hadolint/hadolint`, `koalaman/shellcheck`, `lycheeverse/lychee`, `pipelinecomponents/yamllint`.
  `rhysd/actionlint:latest` (`b1934ee5f1c5`) is unchanged and **has the same digest as the actionlint pin** (`sha256:b1934ee5...`), so my pull of the pinned reference was a no-op and the gate runs your restored image's content; the gate never removes it. `conduit-env/override-probe:gate` and your Playwright image are unchanged.
- Nothing was removed with `rm`, `rmi`, `prune` or `-f`. The only `--rm` runs are the gate's, and the only removal is the project-scoped `tools/reset.sh` (run for the real reset check, `verify --fresh` twice, and the rehearsal).
- During the rehearsal I ran `docker compose -p conduit-env stop` (stops, removes nothing) so the clone's stack could replace the working copy's. At the end `tools/reset.sh` from the working copy made the running stack belong to it again.

## 5. Decisions I made that you can overrule

1. **The pin is kept** (your decision); `THIRD-PARTY.md` also has a hand-written row for it.
2. **Snapshot file format:** three header lines, a blank line, then the JSON. The file is not valid JSON as a whole (ADR 0002 section 6).
3. **`docs/env/CHANGELOG.md`**, not a root `CHANGELOG.md` (a root file is neither OWNED nor SEED). The env-v1 entry says `class: pin, build, contract, docs`, `merge: required`, and "not yet tagged" in the heading.
4. **Verify exit status 90** means "could not run" (preflight, bad argument, reset failed); otherwise the exit status is the number of failed checks. The browser check is a fifth check, and a missing `CHROME_BIN` fails verify's preflight unless `--no-browser` is given (printed as SKIP).
5. **Compose minimum 2.20.0** is a documented lower bound only (the release notes mention `include`; the docs do not say when `env_file` or `project_directory` arrived). Untested.
6. **Gate images:** `pipelinecomponents/yamllint` instead of the stale `cytopia/yamllint`; newest stable release tags from Docker Hub on 2026-10-09.
7. **hadolint ignores five rules** (DL3008, DL3003, DL3015, DL3020, DL4006), each with a written reason in `env/gate/hadolint.yaml`; I did not change any Dockerfile.
8. **yamllint `new-lines` is disabled** because a Windows clone has CRLF in the root `compose.yaml`.
9. **The release gate** checks 7 (key and the first 12 hex of the pinned value in one `THIRD-PARTY.md` row), 8 (the allow-list of record documents is a code constant), 11 (the documented local password `0000` is exempt by value anywhere; the gate's own two fixture files are exempt) and 12 (expected text is `env/gate/license-mit.txt`) have rules you did not specify (ADR 0002 section 7).
10. **`LICENSE`** is the MIT body of the realworld `LICENSE` I read, under "Copyright (c) 2026 lodmaome"; I dropped that file's trailing note about third-party logos.
11. **`reset.sh` passes `-p conduit-env` on `up` as well as on `down`**, and `dump-state.sh` on every `exec`.
12. **ADR 0003 triggers:** the triggers for deferrals 2 and 3 are mine (you gave one for deferral 1 and an interim for 2): "the first time the hand check fails, or the start of attempt 2" and "the first `class: pin` release or a drift report showing a changed document under unchanged pins".
13. **`FINDINGS.md`** lists no defect (Phase 1 reproduced none) and four behaviours I reproduced on 2026-10-09 (reserved-TLD emails rejected, same-title slug suffix, duplicate username 409, any-origin CORS).
14. **I used `git add -N .`** once, so that untracked new files were visible to the gate's `git ls-files` lists before I committed; it stages no content, and each commit used explicit paths.
15. **`docs/env/third-party/python-licences.txt`** includes only the metadata packages declare and the first line of each licence file; four packages ship no licence file.

## 6. Failures, and what caused them

| What happened | Cause | Fixed |
|---|---|---|
| The first real `reset.sh` call (combined with a directory delete) was refused by the permission layer | permission layer, not a repository fault; I did not retry or work around it | you authorised it as its own call; it passed |
| A stray `python3` heredoc hung a command | my own command (harness) | stopped |
| `check-submodule-pin.sh` runs 1 and 2 failed | missing base-image build args, then a `\n` left by a `sed` edit (harness); its first message check also matched the echoed `RUN` text (my check) | fixed, 3 of 3 pass |
| `type=local` image export failed with a symlink privilege error | Windows (environment) | exported tars instead |
| Verify unit tests: 2 failures | one-character "secret" that matched inside "text"; a `\n` that became a newline in a patch (my tests) | fixed |
| Browser mutation 2 first printed `( (inspector))` | my message format | fixed |
| `gate.sh` first run: shellcheck `SC2164`, `SC1091`, `SC2015`, `SC2016`, `SC2086`, `SC2329` | repo scripts (fixed or disabled with a reason); `SC2329` and the directive placement were my gate's own files | fixed; hadolint's five rules ignored with reasons (not a change to the Dockerfiles) |
| `--online` lychee reported `localhost` links as refused | harness (the container cannot see the host's localhost) | excluded in `lychee.toml` |
| Release gate: CHANGELOG location, a retired-name false positive on `docs/attempt/.gitkeep`, secret-scan false positives (prose, upstream defaults quoted in a report, a code comment), `--check` found in a comment, two leftover temp repositories | my checks and my design (the golden-tree controls found them); the temp directories were mine and were deleted with asserted paths | fixed; self-test 0 failed |
| A JavaScript `String.replace` treated `$'` in my replacement text as a pattern and corrupted `tools/gate.sh` | my patch tooling | restored with `git show HEAD:tools/gate.sh` and redone with the edit tool |
| Several `node -e` and heredoc patches lost or doubled backslashes (the shell tool halves them) | the known tool quirk | files rewritten through the file tools; I stopped patching with `node -e` |
| `python-licences.sh` first had escaped quotes in an f-string | my script | fixed |
| Gate failed only in the clone (yamllint `new-lines`); the release gate would have failed there on CRLF | repository: root `compose.yaml` is CRLF in a Windows clone | fixed (finding 1 and 2 of ADR 0002 section 8) |
| A `docker compose exec ... sh -c` command was blocked by a built-in safety check | the check misjudged a read-only command; I did not run it and rewrote it without `sh -c` | n/a |

## 7. Still unverified (not seen)

- **A real second env tag merged into a clone** (ATTEMPTS.md section 7), and any merge conflict behaviour.
- **The `@docs/env/WORKING-AGREEMENT.md` import** (deferred to env-v2 by ADR 0003).
- **Linux, macOS, GitHub Actions**; a **Compose version other than 5.5.1** (including the 2.20.0 lower bound); a **Chrome other than 154.0.8037.98**.
- **`up` with no network.** Every `up` runs a build pass; not tested.
- **A failing run of the real verify against a really broken stack** (stack down, engine stopped): covered by fixtures only.
- **`no-old-origin` in the real browser** has no clean mutation (it would need a frontend built without `VITE_API_URL`); mutated in unit fixtures only. The `ports`, `snapshot-header` and `python-licences` release checks are mutated on in-memory data, not on a real changed compose render or lock; the gate configs are unmutated (ADR 0002 sections 5 and 7).
- **The yamllint version inside its image**, and the licence of the wrapper at the pinned revision (THIRD-PARTY.md says so); the image's Debian and Alpine packages and the frontend's npm packages are not inventoried.
- **Phase 1's canonical OpenAPI hash** was not reproduced (its canonicalisation is not recorded).
- **Clone-to-healthy timings** are one run each, with all base images already on the machine.
- **The Docker `rhysd/actionlint:latest` image** is yours; the gate runs the same content by digest.
- **The apt packages float**: 76 + 17 + 17, none version-pinned; rebuilt images can differ.
- **Whether `docker diff` reports a write the way I expect** (the migrations invariance control would need a write into the running container, which I did not make).
