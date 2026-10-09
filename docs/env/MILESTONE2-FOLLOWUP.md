# conduit-env: Milestone 2 follow-up

**Status: the five fixes (F1 to F5) are done locally and await your review.** Five commits on `main` after `cc60810`, plus the commit that adds this report. Nothing was pushed, tagged or created on GitHub, nothing under `.github/` exists, M3 is not started.
Raw evidence is outside the repository, in `C:\git\conduit-env-evidence\m2-followup-evidence\` (cited by sub-folder and file name; a reader of this repository cannot open it). Each claim is **seen** (with where) or **not seen**.
The reasoning and numbers are in [ADR 0002](adr/0002-milestone2-decisions.md) sections 9 (F1) and 10 (F4); the pre-registered rules are in `PREREGISTRATION.md` there.

## 1. Tasks

| Fix | Result | Evidence |
|---|---|---|
| **F1** the snapshot is one valid JSON document | `docs/env/contract/openapi.04ef47c.json` is the normalised OpenAPI object plus root key `x-conduit-env` with `backend-sha7`, `requirements-lock-sha256`, `build-tools-lock-sha256`. (1) `JSON.parse` passes; (2) the document minus `x-conduit-env` is deep-equal to the body of the `cc60810` file (first four lines dropped), with a control (a changed title makes the comparison throw); (3) two regenerations are byte-identical; (4) the three values equal `tools/lock-hashes.sh`. Release check 5 fails readably for a changed sha7, a changed requirements hash, a changed build-tools hash, a missing key, and a non-JSON file, and passes on the control. The `/auth/` and 19-operation test still passes. All seen. | `f1/verify-snapshot.txt`, `f1/regen-identical.txt`, `f1/selftest-check5.txt` |
| **F2** every rule of the working agreement is scoped | Section 1 rewritten; section 2 is byte-identical (proof below). Release check 15 added (cheap: one function, three failing fixtures, a tagged golden agreement). Seen. | `f2/section2-proof.txt`, `f2/section2-old.txt`, `f2/section2-new.txt`, `f2/wa.diff`, `f2/selftest.txt` |
| **F3** two factual corrections | "The owner restored the five images themselves." deleted from `HOW-THIS-WAS-BUILT.md`; the same claim removed from two other tracked documents (section 5, decision 3). The errata rows for `93f58d0` and `df05072` now name the sources you gave. Seen (`git diff`). | commit `44f7b6b` |
| **F4** the page is not hermetic | Measured with the CDP tool; informational external-host line added; README, ATTEMPTS, THIRD-PARTY updated. **A third host appeared** (`fonts.gstatic.com`). Seen. | `f4/` |
| **F5** two text fixes | ADR 0003 deferral 1 command has the workflow pathspec and a note that it is untested; CHANGELOG has the "heading becomes `## env-v1 - YYYY-MM-DD`" line; the release gate is unchanged for this and check 1 still passes. Seen. | commit `788f324` |

**F4 numbers** (one run each, Chrome 154.0.8037.98, one machine and network; `f4/unblocked.txt`, `f4/blocked.txt`): unblocked, 3 of 3 assertions pass, load event 262 ms, hosts `code.ionicframework.com`, `fonts.googleapis.com`, `fonts.gstatic.com`; both stylesheet hosts blocked, 3 of 3 pass, load event 65 ms.
From the two screenshots (`f4/unblocked.png`, `f4/blocked.png`, which I looked at): the blocked page has the same layout and the article, but system fonts and no icons next to "Sign in", "Sign up" and no heart in the like button. I did not look at other pages. A first measurement was invalid (the check stopped before the load event) and is kept in `f4/first-attempt/`.

**Close-out run at HEAD before this report** (all in `final/`, seen): `sh tools/gate.sh` exit 0; `node tools/release-gate.mjs env-v1` exit 0; `--self-test` exit 0; `node --test` **69 of 69**; `sh tools/test-project-guard.sh` exit 0; `node tools/verify.mjs` with the browser 5 of 5 PASS.
**Changes in counts:** release checks **20 to 21** (check 15 added: 15 numbered checks plus the six ported ones `M1a` to `M1f`; the real run shows 20 PASS and 1 SKIP, check 4 "first release"); unit tests **65 to 69** (contract tests rewritten for the new form, one fixture-loop change, check 15, `externalHosts`); the release self-test has 50 PASS lines (check 5 now has five fixtures, check 15 three).

## 2. Commits since `cc60810`

I compared each message with `git show --stat`: **no mismatch found**. The table cannot list the commit that adds this report.

| Hash | Message | Files |
|---|---|---|
| `65c904f` | contract: the snapshot becomes one valid JSON document with a root key x-conduit-env (follow-up F1) | `docs/env/contract/openapi.04ef47c.json`, `tools/lib/openapi.mjs`, `tools/openapi-snapshot.mjs`, `tools/snapshot.sh`, `tools/lib/release-checks.mjs`, `tools/lib/golden-tree.mjs`, `tools/release-gate.mjs`, `tools/test/release.test.mjs`, `tools/test/contract.test.mjs`, `docs/env/contract/README.md`, `docs/env/contract/.gitattributes`, `docs/env/CHANGELOG.md`, `docs/env/README.md`, `tools/lock-hashes.sh`, ADR 0001, 0002, 0003 |
| `5f8dac8` | docs: working agreement scopes every rule; release check 15 enforces it (follow-up F2) | `docs/env/WORKING-AGREEMENT.md`, `docs/env/ATTEMPTS.md`, `tools/lib/release-checks.mjs`, `tools/lib/golden-tree.mjs` |
| `44f7b6b` | docs: remove the unproven image-restoration claim, correct two errata sources (follow-up F3) | `docs/env/HOW-THIS-WAS-BUILT.md`, `docs/env/MILESTONE1-FOLLOWUP.md`, `docs/env/MILESTONE2-REPORT.md` |
| `84d9e88` | tools, docs: document and measure that the served page is not hermetic (follow-up F4) | `tools/browser-check.mjs`, `tools/lib/browser-lib.mjs`, `tools/test/browser.test.mjs`, ADR 0002, `docs/env/README.md`, `docs/env/ATTEMPTS.md`, `docs/env/THIRD-PARTY.md` |
| `788f324` | docs: two small text fixes (follow-up F5) | `docs/env/adr/0003-env-v2-deferrals.md`, `docs/env/CHANGELOG.md` |

Authors are all `lodmaome <leandro.donato@ymail.com>`; messages end with the `Co-Authored-By: Claude Sonnet 5.5` line. `git add -N` was not used.

## 3. F2 scope table (rule by rule)

Tags used: **[everyone]**, **[environment repo only]**, and a third, **[attempts only]**, which I added for the parts you described as "Attempts: ..." (decision 1 in section 5). Section 2 (a) to (c) is untouched; (d) is unchanged and tagged by its position in section 2 (not part of section 1, no tag added).
Proof that section 2 is unchanged: `sed -n '/^## 2\. Rules for tests/,$p'` of the file at `cc60810` and now are byte-identical (`cmp` exit 0, `f2/section2-proof.txt`), and `git diff` has one hunk, all above section 2.

| Rule | Scope as tagged | What changed |
|---|---|---|
| 1 Probe the real app | everyone | tag only |
| 2 An ADR per decision | everyone | tag; "The environment's ADRs are in adr/; an attempt keeps its ADRs under `docs/attempt/`" |
| 3 Run pipeline features on real Actions | everyone | tag only |
| 4 Report failures plainly | everyone | tag only |
| 5 No commit, push, tag ... without go-ahead | everyone | tag only |
| 6 Small themed commits | everyone | tag only |
| 7 Run the full gate before review | split: **environment repo only** (`sh tools/gate.sh`, `node tools/release-gate.mjs <tag>`, `node --test tools/test/*.test.mjs`); **attempts only** (own tests and lint, `node tools/verify.mjs` after any change to `compose.override.yaml`; an attempt does not run `release-gate.mjs` because it checks the environment repository and fails on attempt files by design; it may run `sh tools/gate.sh` on its own files, and a finding in an environment-owned file is a proposed env change) | split into two tagged sub-bullets; wording as you assigned |
| 8 Tooling conventions | split: **everyone** (pin exactly; deterministic ordering and output, no timestamps in verdict lines; "from scratch" means `--no-cache`); **environment repo only** (small stdlib-only tooling: sh, Node 22 standard library); **attempts only** (an attempt chooses its own test stack) | split into three tagged sub-bullets; the rule's title is now "Tooling conventions" |
| 9 Docker deletion rule | everyone | tag; added "The two exemptions are the shipped `tools/reset.sh` and `tools/gate.sh`; an attempt's own scripts get no exemption" |
| Heading and opening paragraph | n/a | heading is now "1. Working rules" (was "Rules for the environment"); the opening paragraph says each rule carries its scope and that numbers do not change |

Numbers did not change; `ATTEMPTS.md` section 3 still says "quote rule 9" and works, and now says that each rule is tagged. Other places that referred to the old wording: `HOW-THIS-WAS-BUILT.md` (rule 9 and rule 6 pointers still correct; one sentence added), `README.md` (a link only, no change). **You review this wording before `env-v1`.**

## 4. What I changed because of F1's search

`git grep` for "three-line header", "starts with", "tail -n +5", "not valid JSON" and "header" in `docs/`, `tools/` and `env/` found these statements, all now corrected (record documents excepted): `docs/env/contract/README.md` (rewritten paragraphs, the `tail -n +5` advice removed), `docs/env/contract/.gitattributes` (comment), `docs/env/CHANGELOG.md` ("with a root key `x-conduit-env` ..."), `docs/env/README.md` (the `lock-hashes.sh` bullet),
`docs/env/adr/0003-env-v2-deferrals.md` (deferral 3), `tools/lock-hashes.sh` (comment), ADR 0001 (one-line superseded note at the snapshot-header paragraph), ADR 0002 (superseded note in section 6, new section 9). `docs/env/ATTEMPTS.md` needed no change for F1 (it only links the contract README).
**Left as written, because they are history:** `MILESTONE1-FOLLOWUP.md` lines 31 and 48 (the original header definition), `MILESTONE2-REPORT.md` (it still says "three header lines ... not valid JSON" at its tasks table and decision 2, and "33 on main"; you told me not to edit it beyond the pointer, and it is now superseded on that point by this report and ADR 0002 section 9).

## 5. Decisions I made that you can overrule

1. **A third scope tag, `[attempts only]`,** for the parts you wrote as "Attempts: ..." in rules 7 and 8. The two tags you named cannot describe those parts. Release check 15 accepts all three.
2. **Check 15's rule:** a rule passes if its own line carries a tag, or it has sub-bullets and every sub-bullet carries one. Rules 7 and 8 have no tag on their own line, by design.
3. **Restoration claim, beyond `HOW-THIS-WAS-BUILT.md`:** I removed the same claim from `MILESTONE1-FOLLOWUP.md` (close-out block: "the owner restored the five Docker images and told me not to touch them" became "the owner told me not to touch the five Docker images ...") and changed one word in `MILESTONE2-REPORT.md` ("your restored image" to "your own image"), because you asked to search every tracked document. That second edit goes against "do not otherwise edit that report" apart from the pointer line; I judged the factual correction to win. Revert that one word if you disagree. `MILESTONE1-FOLLOWUP.md` section 6 still records, as history, the question of restoring the images (it states nothing as done).
4. **F4 line wording:** the informational line says "external hosts requested (every host other than the stack's own localhost and 127.0.0.1 ports 4180 to 4182)". A request to `localhost` on another port would be listed as an external host.
5. **Measurement switches** `--block-hosts`, `--timing`, `--screenshot` exist on the browser check; none is used by `verify`, and none changes the exit status.
6. **ATTEMPTS.md** has a new "5b" section for the external hosts so that "section 6" (referenced by the working agreement) keeps its number.
7. **`openapi-snapshot.mjs` takes the lock-hashes output as a file argument** (`snapshot.sh` writes it to a temp file).

## 6. Failures and their causes

| What happened | Cause | Fixed |
|---|---|---|
| First F4 measurement: the unblocked run printed "load event did not fire" | my check (the wait loop stopped at the first success, before the load event) | `--timing` waits for the load event; the first outputs are kept in `f4/first-attempt/` |
| Your expectation that the control lists "exactly the two known hosts" was not met: it lists three | the page (the Google font stylesheet requests files from `fonts.gstatic.com`) | documented; not a fault of the tool |
| Several scripted patches failed at their anchors or wrote corrupt text: the shell tool halves backslashes in arguments | harness (the known quirk) | redone with the file edit tools; no corrupt file was committed |
| One scripted edit of the golden tree did not match its anchor | the same quirk | redone with the edit tool |

No repository fault was found in this round.

## 7. Docker before and after

Snapshots of `docker images -a`, `docker ps -a` and `docker volume ls` are in `docker/` (seen). **All three are identical before and after** (images, containers by name and image, volumes). No `conduit-env.gate=1` container is left. This round did not rebuild images or run `tools/reset.sh`; the gate's `docker run --rm` runs and the browser runs were the only Docker-touching steps.

## 8. Still unverified (not seen)

- Everything listed as unverified in `MILESTONE2-REPORT.md` section 7 still stands (Linux, Actions, other Compose and Chrome versions, offline `up`, a second env tag merged, the `@docs/env/WORKING-AGREEMENT.md` import).
- **Whether the scope tags change how an assistant behaves**: the tags are text; whether an assistant honours them was not tested.
- **The F4 numbers are one run each**; the 262 ms against 65 ms difference is indicative of the network round trips to the external hosts but was not repeated, and no claim is made about other machines or networks.
- **How the page looks blocked beyond the home page** (other routes were not loaded).
- **The new snapshot form against an external OpenAPI linter or `jq`**: `JSON.parse` was run (Node); `jq` and a linter were not.
- **`x-conduit-env` as an OpenAPI extension key** is valid by the `x-` convention, but no OpenAPI validator was run on the file.
- **The `git diff`-based command in ADR 0003 deferral 1** is untested until a tag exists.
