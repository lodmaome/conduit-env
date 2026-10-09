# Working agreement

How work on this environment, and on the attempts built from it, is done. Attempts import this file into their own `CLAUDE.md`
(see [ATTEMPTS.md](ATTEMPTS.md)); it applies to an AI assistant and to a human equally.

## 1. Rules for the environment

1. **Probe the real app before assuming.** Run the thing, read the output, then write the sentence. A claim is either "seen" (with where) or "not seen".
2. **An ADR for every meaningful decision**, with measured evidence, including refuted hypotheses and checks that turned out to be invalid. The ADRs are in [adr/](adr/0001-pair-lock-and-migrations.md).
3. **Run pipeline features on real GitHub Actions and read the logs back.** A workflow that has only been linted has not been run.
4. **Report failures, skips and unverified claims plainly.** Name the cause as the repository, the harness, or your own check.
5. **No commit, push, tag, issue, pull request, settings change or third-party change without the owner's go-ahead for that action.** Approval for one action does not extend to the next.
6. **Small themed commits.** One theme per commit; the message names every file group in it; run `git status --short` and `git diff --cached --stat` first and stage explicit paths.
7. **Run the full gate before asking for review** (`sh tools/gate.sh`, `node tools/release-gate.mjs`, `node --test tools/test/*.test.mjs`).
8. **Small, stdlib-only tooling** (sh, Node 22 standard library). Pin exactly. Deterministic ordering and output; no timestamps in verdict lines. A "from scratch" claim means `--no-cache`.
9. **Docker deletion rule.** Docker on the owner's machine is shared with other projects.
   - Never start or stop Docker Desktop. Never prune. No `rm`, `rmi` or `-f` against Docker. No `docker compose run --rm` (use `exec` on the running stack).
   - Exactly two exemptions. (1) `tools/reset.sh`, which removes only the project `conduit-env` (`down -v --remove-orphans`, guarded by `tools/project-guard.sh`). (2) `docker run --rm` inside `tools/gate.sh` only, for the digest-pinned gate images, label `conduit-env.gate=1`, repository mounted read-only.
   - A script that touches Docker asserts its paths and names and prints what it will do. Destructive paths are tested first against a fake `docker` on `PATH` that logs its arguments. A mutated script never runs against the real Docker.
   - If a permission rule refuses a Docker command, stop and say so. Never work around it.

## 2. Rules for tests

These three are the owner's own words and are not edited.

(a) Mutation-check every assertion that says something did not happen: remove the failure and confirm the test fails.

(b) Where the app has a defect, pin it as observed with a known-issue label so it fails on purpose when fixed. Collect defects in a findings page with reproductions, and run each reproduction before publishing it.

(c) If the spec or contract is incomplete, validate real responses against it at run time, label any schema you supplement yourself, and add a test that fails when the spec improves.

(d) **Flake policy.** Retries: 0 locally, 1 in the pull-request smoke run, 1 in the regression run on `main`, 0 in the nightly run.
The flake budget is 2% of distinct tests over a window of 14 days. A test is quarantined only with a written reason, an owner and an expiry of 14 days.
The values are reviewed after 30 nightly runs.
