# Working agreement

How work on this environment, and on the attempts built from it, is done. Attempts import this file into their own `CLAUDE.md`
(see [ATTEMPTS.md](ATTEMPTS.md)); it applies to an AI assistant and to a human equally.

**Each rule in section 1 carries its scope**, because attempts import the whole file but some rules only fit the environment repository:
**[everyone]** applies to the environment repository and to every attempt; **[environment repo only]** applies only where the environment's own files are edited;
**[attempts only]** is guidance for an attempt. Where one rule has more than one kind of content, its parts are tagged separately. Rule numbers do not change; attempts quote them.

## 1. Working rules

1. **[everyone]** **Probe the real app before assuming.** Run the thing, read the output, then write the sentence. A claim is either "seen" (with where) or "not seen".
2. **[everyone]** **An ADR for every meaningful decision**, with measured evidence, including refuted hypotheses and checks that turned out to be invalid. The environment's ADRs are in [adr/](adr/0001-pair-lock-and-migrations.md); an attempt keeps its ADRs under `docs/attempt/`.
3. **[everyone]** **Run pipeline features on real GitHub Actions and read the logs back.** A workflow that has only been linted has not been run.
4. **[everyone]** **Report failures, skips and unverified claims plainly.** Name the cause as the repository, the harness, or your own check.
5. **[everyone]** **No commit, push, tag, issue, pull request, settings change or third-party change without the owner's go-ahead for that action.** Approval for one action does not extend to the next.
6. **[everyone]** **Small themed commits.** One theme per commit; the message names every file group in it; run `git status --short` and `git diff --cached --stat` first and stage explicit paths.
7. **Run the full gate before asking for review.**
   - **[environment repo only]** `sh tools/gate.sh`, `node tools/release-gate.mjs <tag>` and `node --test tools/test/*.test.mjs`.
   - **[attempts only]** Your own test suite and lint, plus `node tools/verify.mjs` after any change to `compose.override.yaml`.
     An attempt does not run `node tools/release-gate.mjs`: it checks the environment repository and fails on attempt files by design.
     An attempt may run `sh tools/gate.sh` as a lint of its own files with the environment's configs; a finding in an environment-owned file is a proposed env change ([ATTEMPTS.md](ATTEMPTS.md) section 6).
8. **Tooling conventions.**
   - **[everyone]** Pin exactly. Deterministic ordering and output; no timestamps in verdict lines. A "from scratch" claim means `--no-cache`.
   - **[environment repo only]** Small, stdlib-only tooling (sh, Node 22 standard library).
   - **[attempts only]** An attempt chooses its own test stack.
9. **[everyone]** **Docker deletion rule.** Docker on the owner's machine is shared with other projects.
   - Never start or stop Docker Desktop. Never prune. No `rm`, `rmi` or `-f` against Docker. No `docker compose run --rm` (use `exec` on the running stack).
   - Exactly two exemptions. (1) `tools/reset.sh`, which removes only the project `conduit-env` (`down -v --remove-orphans`, guarded by `tools/project-guard.sh`). (2) `docker run --rm` inside `tools/gate.sh` only, for the digest-pinned gate images, label `conduit-env.gate=1`, repository mounted read-only.
     The two exemptions are the shipped `tools/reset.sh` and `tools/gate.sh`; an attempt's own scripts get no exemption.
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
