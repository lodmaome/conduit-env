# conduit-env: Milestone 3 report

**Status: stages 0 to 3 are complete; stages 4 and 5 (the push of `main`, the tag `env-v1` and what follows it) are marked "after the tag, see the release notes".** Nothing is committed after the tag, so this report cannot describe the tag; the release notes do.
Date of this report and of the entry in the [changelog](CHANGELOG.md): 2026-10-14. Decisions and measurements: [ADR 0004](adr/0004-milestone3-decisions.md). Raw evidence is **outside the repository**, in `C:\git\conduit-env-evidence\m3-evidence\` (cited by sub-folder and file name only; a reader of this repository cannot open it).
The rules I worked under: "seen" means I read the output; every failure below is attributed to the repository, the harness or my own check; and the decision rule for "green" was written before the first run (`m3-evidence\PREREGISTRATION.md`, with two dated amendments, none editing earlier text).

## 1. What each stage did

| Stage | What | Result |
|---|---|---|
| 0 | Release check 16 (history scan), check 17 (workflow rules), `tools/pin-drift.mjs`, three workflows, the runbook; the first local-mode run; the history rewrite; check 16 limited to what will be pushed | local checks all green; one rewrite (section 2); ADR 0004 sections 1 to 3 |
| 1 | The workflows linted and run locally: gate, release gate, self-test, unit tests, `verify`, with the stack up | one failure, my own file (section 4, failure 3) |
| 2 | The rehearsal on GitHub Actions, in a **private throwaway** repository (`lodmaome/conduit-env-rehearsal`) | nine runs (section 3), two failures explained, ADR 0004 section 4 |
| 3 | The first push to the canonical repository (`lodmaome/conduit-env`, **private**), variable set first | three runs, all success, none skipped (section 3), ADR 0004 section 5 |
| 4r | Check 4 with a tag on real Actions, in the rehearsal repository, before the canonical tag (pre-registered as Amendment 4) | two dispatched runs on commit `c8122b7`: PASS with the tag, FAIL (check 4 only) with a changed seed (section 3) |
| 4 | Release preparation, local only: this report, the changelog heading, the README line, corrections to the documents; after the owner's review of the first version of that commit, also check 4 (the seed files are compared with the tag `env-v1` whenever it exists, ADR 0004 section 6), the advisor session named, and a note on the rehearsal's URLs | the one commit that adds this file (amended twice for the review, local only) |
| 5 | The push of that commit, the tag `env-v1`, the read-back | **after the tag, see the release notes** |

Commits of Milestone 3 before this one (49 on `main` when it was pushed, 40 before Milestone 3's first commit):

| Commit | Message | Files |
|---|---|---|
| `aa431f9` | tools: release check 16 scans every reachable commit, with a --local mode | `history-scan.mjs`, `release-checks.mjs`, `release-ctx.mjs`, `release-gate.mjs`, `release.test.mjs`, ADR 0004 |
| `8fb383b` | tools: pin-drift.mjs reports drift of every pin, read-only, with failing fixture and control | `pin-drift.mjs`, `pin-drift-lib.mjs`, `pin-drift.test.mjs` |
| `407e2e9` | tools: browser-check starts Chrome with --no-sandbox only on explicit opt-in | `browser-check.mjs` |
| `ba959ee` | ci: three workflows (core, wrapper, pin drift), release check 17 and the runbook | the three workflows, `release-checks.mjs`, `golden-tree.mjs`, RUNBOOK, THIRD-PARTY, ADR 0004 |
| `b37206b` | tools: check 16 scans what will be pushed (main and tags) by default, --all-refs for everything | `history-scan.mjs`, `release-ctx.mjs`, `release-gate.mjs`, ADR 0004 |
| `d7f0ad4` | ci: the core's gate and unit tests become opt-in (run-gate), the wrapper turns them on | `env-verify-core.yml`, `env-verify.yml` |
| `af9b7fc` | ci: wrap the run-gate input description (yamllint line-length) | `env-verify-core.yml` |
| `cbd540a` | tools: check 16 uses HEAD when there is no local main (a pull_request checkout is detached) | `history-scan.mjs`, `release-gate.mjs` |
| `f6704cf` | docs: what the Actions rehearsal showed (README, ATTEMPTS, RUNBOOK, ADR 0004 section 4) | `ATTEMPTS.md`, `README.md`, `RUNBOOK.md`, ADR 0004 |

I compared each message with `git show --stat` for the commit; every file group is named. (The four commits that follow `a113f62` in the first part of this table were rewritten, section 2; their messages, authors and dates are unchanged.)

## 2. The history rewrite

The first local-mode run of check 16 found this machine's Windows user name and a home-directory path example in my own ADR 0004 text, in a local commit that had never been pushed. With the owner's decision, the five local commits after `a113f62` were rewritten (into four: the one-line fix was folded into the check 16 commit and the fix commit itself dropped), using `git cherry-pick`, which keeps author, author date, message and trailer byte for byte.
`backup/pre-rewrite` (local only, never pushed) still holds the old five. Proof (`s0\rewrite-proof.txt`, seen): `git diff backup/pre-rewrite HEAD` empty; the four rewritten commits have identical author, author date, subject and body; no tracked file cites an old hash; no whole-word match of the user name on `main`.
Method and reasons: ADR 0004 section 3. No name is given in any document of the repository.

## 3. The runs on GitHub Actions

Runner (the same in both repositories): `ubuntu-24.04`, image `ubuntu24/20261004.327`, Ubuntu 24.04.5 LTS, `/bin/sh` is dash, Docker 28.0.4, **Docker Compose v2.38.2**, Node 22.23.1 (installed by `actions/setup-node`), **Chrome 154.0.8037.97**, Chrome's own sandbox working without `--no-sandbox`.

**Rehearsal (private throwaway repository), 2026-10-13** (ADR 0004 section 4). The rehearsal repository was private and throwaway; its run URLs are kept for the record and will not open for a reader.

| Run | Trigger | Variable | Result | URL |
|---|---|---|---|---|
| `attempt-verify` | push | unset | success (both jobs) | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475199746 |
| `env-verify` | push | unset | skipped (1 s) | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475200062 |
| `env-pin-drift` | dispatch | unset | skipped (1 s) | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475223987 |
| `env-verify` | dispatch | true | **failure** (release check 3) | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475629380 |
| `env-pin-drift` | dispatch | true | success, 0 drift | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475633129 |
| `env-verify` | push | true | success | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38475940227 |
| `env-verify` | pull_request | true | **failure** (release check 16) | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38476237516 |
| `env-verify` | push | true | success | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38476581702 |
| `env-verify` | pull_request | true | success | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38476604426 |

**Canonical repository (private), 2026-10-13**, all on `f6704cf0884e` (ADR 0004 section 5):

| Run | Trigger | Result | Time | URL |
|---|---|---|---|---|
| `env-verify` | push to main | success | 2 m 0 s | https://github.com/lodmaome/conduit-env/actions/runs/38480389953 |
| `env-verify` | dispatch | success | 1 m 49 s | https://github.com/lodmaome/conduit-env/actions/runs/38480657330 |
| `env-pin-drift` | dispatch | success, 11 pins compared, 0 drift | 26 s | https://github.com/lodmaome/conduit-env/actions/runs/38480661317 |

**Check 4 with a tag, rehearsal repository, 2026-10-14** (stage 4r; The rehearsal repository was private and throwaway; its run URLs are kept for the record and will not open for a reader. Both runs are on commit `c8122b7`, the stage 4 commit as it was before its last amendment, which differs from the tagged commit in documentation text only. The rehearsal repository received an annotated tag `env-v1` on that commit and two branches, `stage4-check4` at it and `stage4-check4-seed` with one more commit that appends a line to `README.md`; its `main` was not touched):

| Run | Branch | Result | Check 4 | URL |
|---|---|---|---|---|
| `env-verify` dispatch | `stage4-check4` | success, 2 m 4 s | `PASS [ 4] seeds-unchanged: 3 seed files compared against the tag env-v1: identical`; release gate 23 PASS, 0 SKIP; self-test 78 PASS; verify 5 PASS; gate 0 failed; unit tests 77 of 77 | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38621695440 |
| `env-verify` dispatch | `stage4-check4-seed` | **failure**, 1 m 48 s, in the step "Release gate" only | `FAIL [ 4] seeds-unchanged: seed file changed since env-v1: README.md`, the only failing check (22 PASS, `failed checks: 1`); verify 5 PASS, gate 0 failed, unit tests 77 of 77; the self-test, which runs after the release gate in the same step, did not run | https://github.com/lodmaome/conduit-env-rehearsal/actions/runs/38622028562 |

Both logs were scanned before anything was quoted (0 findings, presence control found its probe). The CI checkout sees the tag (full history), which was the thing to learn.

In the canonical repository: exactly these three runs, none skipped (the variable `ENV_CANONICAL=true` was set before the first push), the remote holds the branch `main` only and no tag, and its `main` equals the local `main`. In each wrapper run: verify 5 PASS, gate 0 failed, unit tests 76 of 76, release gate for `env-v1` 22 PASS and 1 SKIP (check 4), the self-test passed.

## 4. Failures and their causes

1. **Rehearsal, dispatched wrapper, release check 3** (`ownership: not OWNED or SEED: .github/workflows/attempt-verify.yml`). **Cause: harness.** I had put an attempt-only caller workflow into the repository that also runs the wrapper with `ENV_CANONICAL=true`. The gate rejecting it is a positive control. The caller was removed from the rehearsal; [ATTEMPTS.md](ATTEMPTS.md) says not to set the variable in an attempt. No change to the environment.
2. **Rehearsal, first pull_request run, release check 16** (`fatal: ambiguous argument 'refs/heads/main'`). **Cause: my own check (the repository).** A pull_request checkout is detached and has no local `main`. Fixed in `cbd540a` (the scan uses `HEAD` then), with a detached-checkout self-test case; the next pull_request run was green.
3. **Stage 1, the first local gate run with the workflows present: yamllint, line too long** in `env-verify-core.yml` (249 against 200 characters; `s1\gate-first-run-yamllint-fail.txt`, seen). **Cause: the repository (my file).** The gate found it, which is what it is for. Fixed in `af9b7fc`.
4. **Stage 0, local-mode check 16 found the user name and a home path** (section 2). **Cause: the repository (my own document text),** found by the check built for it; the fix was the rewrite.
No failed run happened in the canonical repository.

## 5. Log scans

Every log was scanned before anything from it was quoted (`m3-evidence\scan-log.mjs`: token shapes, credential assignments, this machine's user name, home paths; each run has its presence control, which must find a fake token). Rehearsal: 0 findings in every log it was run on (`s2`). Canonical: 0 findings in each of the three logs (`s4\s3-log-scan.txt`, 2238, 2233 and 202 lines).
The advisor session (a separate Claude conversation that reviews this work for the owner) scanned the same logs read-only with the owner's gh login: no user name, no token shape; a broader home-path pattern matched one line per long run, which is the self-test printing its own fixture label `a C:\Users path` (harmless).

## 6. What is still not seen

- A **scheduled** run of `env-pin-drift.yml` (only manual dispatches), and whether GitHub notifies anyone about a skipped run.
- The repository **once public** (scheduled-workflow behaviour, an anonymous clone).
- **Check 4 on the canonical repository after the tag: not seen at the time of writing.** It compares the seed files against the tag `env-v1` whenever that tag exists (ADR 0004 section 6). Seen: the self-test, the post-tag test in a throwaway clone (section 9), and two runs on real Actions in the rehearsal repository with a tag (PASS) and with a changed seed (FAIL, check 4 only; section 3). The release notes will record the run on the canonical repository after the tag.
- macOS, another Linux, another runner image; a Compose other than 5.5.1 (local) and 2.38.2 (runner), including the documented lower bound 2.20.0; a Chrome other than 154.0.8037.98 and 154.0.8037.97; an offline `docker compose up`; the `@` import of the working agreement.
- Whether the first real merge of a second tag goes as [ATTEMPTS.md](ATTEMPTS.md) says.

## 7. Docker, before and after

Snapshots of images, containers and volumes taken before and after each stage that touched Docker (`m3-evidence\docker`, `docker2`, `docker3`, `docker4`; a read-only listing, nothing was removed, no `rm`, `rmi`, `prune` or `-f` was used):

- **Stage 0** (`docker`): images, containers and volumes identical before and after.
- **Stages 1 and 2** (`docker2`): the only difference is the environment's own two image tags (`conduit-env/backend:04ef47c...` and `conduit-env/frontend:f7e48c8...`), which the stage 1 `compose up` rebuilt, so their image ids changed (`b8fa3cd98c5a` to `f6ce196df025` and `bedf55b12f05` to `cc7697afbf3f`) and the frontend container now runs the new one; volumes identical; no other project's image, container or volume changed.
- **Stage 3** (`docker3`): identical before and after.
- **Stage 4** (`docker4`, `docker5`): the one difference is again the environment's own two image tags, rebuilt by each `compose up` that `verify` needs (same tags, new image ids after every `up`, so a rebuild is not byte-identical, see the README; the ids are in the snapshot files); containers and volumes identical; the stack was stopped again with `docker compose stop` (not `down`), as it was found.

The images, containers and volumes of the owner's other projects were present and unchanged at every "after".

## 8. What the owner does

1. **Flip the repository's visibility** (private to public) when ready, and only then; check afterwards that the first anonymous clone works.
2. **Delete the rehearsal repository** `lodmaome/conduit-env-rehearsal` (it holds an open pull request and a run history; it has no value after the release).
3. **Check that scheduled workflows are enabled** on the canonical repository (Actions tab, or `gh workflow list --all`), and **watch the first scheduled drift run** (Mondays 05:17 UTC): it is the one thing never seen.
4. **Decide about the `C:\git\...` evidence paths** that the documents cite on purpose (local mode lists them as information, not as findings: 17 before the release commit, 21 with it, because this report and ADR 0004 section 5 name the evidence folder too): keep them as they are, since they say where the evidence lives and carry no user name, or replace them with a folder name only. Either way the evidence itself stays outside the repository.
5. Decide whether and when to bump pins if the first scheduled drift run reports drift (RUNBOOK section 3).

## 9. Final local verification at the commit that adds this report

All run at the final commit, local checks, Windows 11 laptop (`m3-evidence\s4\`, the `-g25b` files):

- `sh tools/gate.sh`: **0 failed** (shellcheck 11 files, actionlint 3, yamllint 7, hadolint 3, lychee 21 files, both `compose config` checks, `node --test` 77).
- `node tools/release-gate.mjs env-v1`: 23 checks over **96 tracked files**: 22 PASS, 1 SKIP, **0 failed**. The only SKIP is check 4 ("first release: skipped": the tag does not exist yet in this repository). Check 1 reads the dated heading `## env-v1 - 2026-10-14`: "entry env-v1: class pin, build, contract, docs, merge required". Check 16: 50 commits, 217 path entries, no finding, largest blob 61,150 bytes.
- `node tools/release-gate.mjs env-v1 --local` (also the user name and home-path scan): the same 22 PASS, 1 SKIP, 0 failed, no finding, 21 information lines about `C:\git\...` paths.
- `node tools/release-gate.mjs --self-test`: **78 PASS**, 0 failed (74 before check 4 was extended: four more lines for its new fixtures and controls); check 1's failing fixture ("class: banana") still fails as intended.
- `node --test tools/test/*.test.mjs`: **77 of 77** (76 before: the seeds test was rewritten and one real-repository test added). `sh tools/test-project-guard.sh`: 0 failed (mutant detected).
- `node tools/verify.mjs` with Chrome 154.0.8037.98: tags, api-flow, frontend, migrations and the browser check (3 assertions) PASS, `failed checks: 0`.
- `git status`: empty.
- **Post-tag test** in a fresh throwaway clone (annotated `env-v1` at HEAD, no remote, nothing pushed; pre-registered as Amendment 3, expectation N): at the tag check 4 PASSES ("3 seed files compared against the tag env-v1: identical"), 23 of 23 PASS, exit 0; after a docs-only commit the same; after a further commit that changes the seed `README.md` check 4 FAILS ("seed file changed since env-v1: README.md"), nothing else fails, exit 1. Before the extension, the same third step had passed with a SKIP, which is why check 4 was extended.
