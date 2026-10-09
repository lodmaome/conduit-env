# conduit-env — Phase 1 report

> **Evidence location (added when this report was tracked under `docs/env/`; the body below is otherwise unchanged).** Every `phase1-evidence/` path in this report, including "next to this file", names a folder that is **outside the repository**, at `C:\git\conduit-env-evidence\phase1-evidence\`. It is external evidence, not a repo path, and is not in git. Statements below that this report is "uncommitted" or that nothing was committed are as of Phase 1.

**Status: complete, awaiting your review.** Uncommitted working file; no `git init`, no commits, no tags, no pushes, nothing opened on GitHub. It becomes the ADR in Phase 2.
**Run window:** 2026-10-08T23:43:56Z → ≈00:58Z (≈74 min). **Evidence:** `phase1-evidence/` next to this file (harness scripts, per-run JSON, screenshots, logs; index in §13).

---

## 0. Result in one screen

**Under the frozen rule, applied mechanically, the pair is:**
- **Frontend F\* = `realworld-apps/vue-realworld-example-app` @ `f7e48c8178602ce25d43293bc6f8ca51d84ae222`** (API origin set by build env `VITE_API_URL`, no patch).
- **Backend B\* = `c4ffein/realworld-django-ninja` @ `04ef47ced437ee8795a13bdcbc2eff2be19e33bd`** on **PostgreSQL 18** (the only survivor with a measured open-source server DB).
- `realworld-apps/nitro-prisma-zod` @ `c8c66858…` earned the **"control" label** (154/154 Hurl) and was the common backend (CB) for frontend attribution.
- **Pair check in real Chrome 154.0.8037.98:** register → logout → login → publish → read back, 8/8 steps, 18 API calls reached the Compose backend, **0 counted errors**, 0 Fetch/XHR to the old origin.
- **Local numbers (indicative, Docker Desktop laptop):** cold no-cache build **49 s** (images 727 MB + 94 MB); boot-only time-to-healthy **median 8.69 s** (9.39 / 8.69 / 7.70).

**How it was decided.** 8 backends → 4 survive (nitro, django-ninja, aspnetcore, spring: all 154/154 Hurl); ralscha, mikro-orm and symfony fall at **K4**, DataDog at **K1**. **Backend key 1 decided the outcome**: only django-ninja booted a server DB; it has **no lockfile** and would have lost key 2 to aspnetcore had key 1 not come first. "Cleaner wins" (key 3) never operated: all four survivors scored 100 %.
7 frontends → 3 survive **K5** (mutoe, angular, vue). R3 put **all three inside the tie set** (38 / 37 / 37, band 3), so keys 2–4 decided: angular loses key 3 (patch vs build arg); vue beats mutoe on recency (119 d vs 176 d).

**Needs your ruling — one is decisive (§10):**
1. **react-fsd** is out only through the frozen *"a second failure counts"* clause, caused by **my own harness failing twice**. My non-counting diagnostics show the app completes the flow (K5 ✓ against nitro **and** against django-ninja) and scores **R3 42/53, the highest**. **Reinstating it flips F\* to react-fsd; B\* does not change.** I recommend keeping the frozen outcome (reinstating after seeing it would win is exactly the post-hoc tuning the rule exists to prevent), but it is your call.
2. Elm is out by the same clause (two harness faults); diagnostics: build ✓ 99 s, K5 ✓, R3 37 with 5 absent elements. **Not decisive** — F\* stays vue either way.
3. Snapshot file in `env-v1` (a / b / c), flake policy numbers (d), the env's own licence, and 29.8 GB of reclaimable BuildKit cache.

**Rule amendments: none.** Interpretations and deviations I made are listed in §2 so you can overrule them. **Honest caveats up front:** the R3 instrument was debugged against the data (3 revisions, §9) — it did not decide F\* under the frozen rule, but it would if react-fsd is reinstated; browser results are Chrome-only; this ran on Windows Docker Desktop only (nothing on `ubuntu-24.04` yet).

---

## 1. The decision rule

(frozen text, copied verbatim from the approved plan, Part 1)

I have already seen the static screen, so these thresholds are **not** blind. The runtime phase is where a favourite would form, so
everything below is committed before anything runs. If data hit a case the rule doesn't cover, I **stop and ask**; any amendment is
logged in the report with before/after and reason. I never edit the rule silently.

**Gates (static, already applied, as of 2026-10-08):** G1 not archived · G2 explicit permissive LICENSE file (no file = out) ·
G3 ≥1 substantive commit in the last 180 days (non-bot, non-dependency, default branch) · G4 a genuine REST half, not a monolith.
Activity is **a gate only**; other windows change *who is measured*, not who wins.

#### Knockouts (runtime; cheapest first; first counted failure eliminates; evidence quoted verbatim)

| ID | Applies to | Eliminated if |
|---|---|---|
| K1 Build | both | `docker buildx build "<git-url>#<40-hex-SHA>"` (submodules as pinned) does not exit 0, under the rules below |
| K2 Origin | frontend | API origin is not settable by build arg/env **or** by a fail-closed patch (**exactly N matches** of the origin string that frontend actually uses — rule below the table). **That is the whole knockout.** Bundle greps — for the new origin or the old string — are **informational only**: minifiers split strings, an app may build the URL from a base plus `/api` or read the origin at runtime, and a footer link or comment can keep the old string without ever calling it. K2 eliminates and has no harness-fault retry, so a grep must not decide it. That the origin *took effect* is proven by K5: the page's own API calls reach the Compose backend |
| K3 Boot + API flow | backend | From empty state with migrations only (migration rule in K1 rules) it does not serve `GET /api/tags` 200, or register → login → create article → read back fails over plain HTTP |
| K4 Compliance | backend | **adjusted** pass rate of the pinned Hurl suite is **< 90 %** (rules below) |
| K5 Real browser | pair, attributed | register → login → publish → read back doesn't complete in a real browser, **or** the page's own API calls don't reach the Compose backend, **or** any **Fetch/XHR** request goes to that frontend's old origin, i.e. the string recorded at K2 (zero allowed; scoping explained below the table), **or** a counted error occurs (below). Frontends run against the common backend (CB); backends against the winning frontend F* |

**K2 patch rule — define the string first, then count it.** **N is counted for the API-origin string the frontend actually uses, identified by reading its source** (the interceptor, environment file or api module).
The report records that string, N, and each `file:line`. A frontend that already defaults to a different host (`localhost:3000`, `conduit.productionready.io`, `api.realworld.io`, …) is **patched on that host**:
`api.realworld.show` is only what Angular and sveltejs were seen to use, and the seven frontends have **not** all been read (sveltejs beyond `src/lib/api.js`, ngrx's `environment.ts` and mutoe's mechanism are unread).
The patch then asserts **exactly N** matches of that string, where **N is the count from a grep of the pinned source *before* patching**, and the build fails if the count is not N.
What makes the patch fail-closed is that the count is exactly what was expected, not that the expected count is one: a frontend that hardcodes its origin in two places (an interceptor and a service, say) is not eliminated for a fix that is just as safe.
**N = 0 fails only if the frontend has neither a build arg/env hook nor any hardcoded origin I can find after reading its source.** **N > 1 is allowed but flagged**, and counts against the repo only at frontend key 3 (patch vs build arg), which already prefers build args.

**K5 old-origin scoping.** "Old origin" is the host in the string K2 recorded for that frontend (`api.realworld.show` for Angular and sveltejs; whatever the others use). The zero-requests rule counts **Fetch/XHR only**, because such a host may also serve static assets:
`api.realworld.show` has historically served the RealWorld template's default avatar, and I can't confirm which of the seven frontends still load something from their old host.
**Every other request type to that host is listed in the report as informational and does not count.**
**If K2 records no old-origin string for a frontend (a build arg with no default), the K5 old-origin clause is vacuous for it and the report says so.** K5's other conditions still apply: the page's own API calls must reach the Compose backend.
(Vue is not such a case: its `config.js` reads `VITE_API_URL || "https://api.realworld.show/api"`, so it has a recorded default and the clause applies; whether other frontends are such a case is unread.)

**K1 rules.**
- *Toolchain:* chosen from the repo's own declaration (`.nvmrc`, `.tool-versions`, `global.json`, Gradle toolchain, `go.mod`, `engines`). None → the version in its CI config.
  The base image is pinned by digest; the report records the digest **and where the version came from**.
- *Allowed supplied config:* env vars and build args documented in the repo's README, compose file or CI (e.g. `Jwt__SigningKey` for aspnetcore), plus the K2 patch for frontends.
- *Migrations:* a migration command **documented by the repo itself**, run through **that repo's own tooling** as a **one-shot Compose service that must exit 0 before the backend starts**, is allowed — e.g. `goose up`,
  `prisma migrate deploy` or `prisma db push`, whichever the repo documents (Prisma and goose probably do not migrate at startup, so reading "no manual DB steps" literally would have knocked out nitro and ralscha for following their own docs).
  The report names the command and where it is documented. The initial state is migrations only.
  **Not allowed:** source edits other than the K2 patch, hand-written SQL, seed scripts, commands run inside a running container. Frozen lockfile where one exists; none = allowed, drift risk recorded.
- *Attribution:* a knockout counts only when the log shows a **repo-attributable** cause: compile error, failing frozen install, file missing from the pinned SHA, app crash on start.
  **Harness-attributable** causes (wrong base image, missing tool, network, my own command) get **one logged retry with the fix named**; a second failure counts. Every retry is listed in the report.
- *Box:* 45 min wall-clock per repo for the counted build (my reading: a harness-fault attempt does not eat the box — veto if you disagree).

**K4 rules (Hurl).** `hurl --test --continue-on-error --jobs 1`, **one fixed spec SHA (resolved once at the start of stage 1 and recorded in the report header)**, fresh DB, `uid` per run.
Pass rate = passed entries ÷ entries defined, **after cascade handling**: an entry that fails *only* because a variable captured by an earlier failed entry is undefined is a
**cascade failure** — excluded from numerator and denominator; the **root failure counts once**. Classification comes from Hurl's error text, **quoted verbatim**.
Reported side by side: raw rate, adjusted rate, per-file results, first failure cause per file. **The 90 % line applies to the adjusted rate, subject to the coverage floor.**
- **Coverage floor.** Excluding cascade entries shrinks the denominator, which would reward the failures that block the most: one root failure in the register file blocking 40 % of the suite scores ≈98 % adjusted
  while almost half the suite verified nothing. So: **if cascade-excluded entries exceed 10 % of entries defined, the K4 result is "inconclusive", not a pass.** Read the root failure and apply the existing attribution rule, logged:
  **repo-attributable ⇒ K4 knockout; harness-attributable ⇒ one retry**, and a second inconclusive result counts as repo-attributable. Either way the report shows the rate **with and without** the exclusion.
- **Spec age.** Every backend runs against the one fixed spec SHA but implements whatever revision it last tracked (aspnetcore has had spec-adaptation PRs), so K4 can partly measure spec age. For each backend the report records
  **the spec revision it claims** (submodule pin, CI reference or commit message; "unknown" if none can be found) and tags every failing entry whose Hurl **file** changed in the spec repo between that revision and the fixed SHA as
  **"spec-delta candidate"** (file-level, so coarse — labelled as such). Tagged failures are **shown separately and never excluded**: the 90 % line, the cascade handling and backend key 3 all use the same rate,
  so a recently updated backend is not rewarded for tracking the spec rather than for being clean.
- The 10 % line is a **pre-registered cliff** (a root failure cascading 9 % passes; 11 % is inconclusive). It is not evidence of anything, and the report shows the raw numbers beside it.

**K5 counted errors (defined now).** Counts: `console.error`, uncaught exceptions, any CORS error, any request to the app or API origin that ends in status ≥ 400 or a network error during the flow.
Does not count: favicon 404, `console.warn/info/debug`, browser-extension noise. The flow sends **no deliberately invalid requests**. **Production builds only.**

#### Common backend (CB) — an attribution tool; designating it selects nothing
After the backend stage: **nitro-prisma-zod if it reaches 100 % Hurl (adjusted = raw) and passes the CORS/origin check; otherwise the best-adjusted-Hurl backend that passes the CORS check**
(pool includes nitro unlabelled; tie → most recent substantive commit). CORS/origin check: preflight from `http://localhost:4180` with `authorization,content-type` and methods PUT/DELETE,
and no absolute URLs in responses pointing elsewhere.
**Nitro is eligible.** It is a gate-passing backend and is selected by the backend keys exactly like any other. "Control" names only its role as the Hurl baseline, and only if it scores 100 %:
the actual count is reported first; **< 100 % ⇒ I say so and do not call it a control** (it stays eligible either way). This reverses your earlier condition that it be excluded from ranking, on your later advice that
excluding the likely best backend because of a label looks like a rule tuned after the screen. There is **no escape clause**: no post-hoc "tell you and you decide" path; the lexicographic order below is the only way a backend wins.
If CB is also the selected backend, the F\* × CB K5 already run in stage 3 is reused, not repeated.

#### Selection among survivors (lexicographic; no composite score; every K-survivor is eligible, nitro included)
- *Frontend:* (1) **semantic locatability** (R3) — the **tie set** is every K5-survivor whose semantic count is within the band **of the top semantic count** (band measured from the top, never pairwise);
  frontends outside the tie set are out of contention, and keys 2–4 apply only inside the tie set; (2) lockfile with a working frozen install; (3) origin via build arg beats a patch (less drift surface); (4) most recent substantive commit.
- *Backend:* (1) **a server DB on an open-source engine (PostgreSQL, MySQL, MariaDB) that actually boots in the default compose — measured, not claimed.** Reasons: image size, cold-start time, no EULA step, portability for attempts that query the DB.
  **SQL Server and embedded DBs (SQLite, H2) do not earn this key but are not disqualified; they fall through to key 2.** If no survivor earns key 1, the key is a tie and selection continues on key 2.
  (2) lockfile with a working frozen install; (3) **cleaner wins: higher adjusted Hurl rate** (your tiebreak; I don't select for defects to pin); (4) most recent substantive commit.
- *Pair:* F* × B* run K5 **in selection order and stop at the first pass**; candidates behind the first pass are not run. On failure the guilty half is knocked out (F* is proven against CB) and the next in order runs.
- **Consequence of the key order, stated now:** key 1 outranks compliance by your decision, and "cleaner wins" only operates at key 3, after keys 1 and 2 — so it is weaker than it reads.
  **A PostgreSQL/MySQL/MariaDB backend at 91 % adjusted Hurl beats nitro at 100 % if both survive K1–K5.** Known candidate: **mikro-orm (MySQL)**. ralscha (Postgres) would qualify but is expected to fall at K5 (no CORS).
  DataDog/fastapi, symfony, django-ninja and alexey qualify only if their DB turns out to be a server DB on one of those engines (not yet read). The report states this beside the selection trace,
  so a lower-compliance winner is not a surprise and is never described as "the cleanest".
- SQL Server is recorded as **"not booted, not verified; excluded from key 1 for the reasons above."** The report says plainly if key 1 ended up deciding nothing.

#### R3 locatability (defined now)
Fixed **target list**: the functional elements of the seven pages (`/`, `/login`, `/register`, `/editor`, `/settings`, article, profile) — links, buttons, inputs, article card, comment card, tag pill, nav tabs —
enumerated from the shared RealWorld template (used to say *which* elements, not to test selectors). Same list for every frontend; an absent element counts as not locatable. Categories, with **N reported per page and in total for each**:
(a) **semantic** = exactly one match by role + accessible name, or label/placeholder/alt; (b) visible text only; (c) CSS class / `name` only; (d) test-id only; (e) structural/position only; plus test-id attribute counts in the rendered DOM.
**Only (a) counts as semantic for frontend key 1.** Tie band = **5 pp or 3 elements, whichever is larger**: band = max(3, ⌈0.05·N⌉) elements, N = size of the fixed target list.
**Tie set (defined now, non-transitive by construction):** `{ f : semantic(top) − semantic(f) ≤ band }`. A can be 3 below the top and B 3 below the top while A and B are 6 apart; both are in the set, because
membership is measured from the top only. Anything further than the band from the top is out, even if it is within the band of a member.
Stated up front: all RealWorld frontends share the Conduit theme, so scores will probably cluster inside the band and the decision will probably fall to keys 2 and 3. That is an expected outcome, not a flaw.
Instrument: throwaway script on a digest-pinned Playwright image, not shipped; data seeded by API calls against CB.

#### K6 — parallel writes (report-only; cannot affect selection)
For **embedded-DB finalists only** (SQLite/H2), after selection: 8 concurrent workers for 60 s, each looping register → login → create article → read back with unique data.
Report: requests/s, p95 latency, count of 5xx, count of "locked"/"busy" errors in the backend log, count of read-back mismatches. DB file on a **named volume, never a bind mount**
(bind-mount locking on Docker Desktop for Windows would be an invalid check). **Mutation check:** the same load generator against a stopped backend must report failures.
**Consequence written into the plan:** if the winner is embedded and K6 shows lock errors or serialised writes, the ADR and `docs/env/contract/` state the **worker limit attempts must respect**,
and the report says so in its summary. Phase 2 repeats K6 on Windows and on ubuntu-24.04 Actions. Instrument: throwaway Node 22 `fetch` script.

#### Thresholds I set, all before running
90 % Hurl (adjusted) · K4 cascade rule with a **10 % coverage floor** · 45 min K1 box · 5 pp / **3-element floor** tie band, measured from the top · 180 d gate · **per-stage wall-clock caps (Part 3): 3 h / 0.25 h / 2 h / 0.75 h = 6 h for stages 1–4, 2 h for stage 5** ·
**K6 = 8 workers / 60 s** · R9 = build time once + boot-only time-to-healthy as median of 3, both labelled *indicative* (Part 3). The caps are **my estimates, not measurements** — see Part 3.

---

---

## 2. Run facts, budget, deviations

**Environment.** Windows 11; Docker Desktop engine 29.8.2, Compose v5.5.1, buildx 0.37.2; Node 22.23.1; Chrome **154.0.8037.98** (host, headless); `playwright-core` **1.64.0** (scratchpad only, not shipped); Hurl **8.0.1** (`ghcr.io/orange-opensource/hurl@sha256:49a02dc39d7084e5a6e8c57e2d4754ef102e4ee3761a02ef6dc0e305ab1a832d`); fixed spec SHA `realworld-apps/realworld@ebbcdeb8d55b42a3a613c787560498b8ef10003f` (2026-08-26).
Pinning method tested: `docker buildx build -f - "https://github.com/<o>/<r>.git#<40-hex>" < Dockerfile`, base images by digest (`phase1-evidence/logs/digests_*.txt`).

**Budget actually used** (caps: 3 h / 0.25 h / 2 h / 0.75 h / 2 h): Stage 1 **31 min** (23:45:09→00:16:19, incl. a ≈7 min Docker outage) · Stage 2 ≈3 min · Stage 3 **29 min** (00:15:09→00:44:21) · Stage 4 ≈1 min · Stage 5 ≈8 min + ≈4 min of diagnostics. **No cap was reached**; processing order was the pre-registered one (Go → Node/Bun → Python/PHP → .NET → Java; frontends mutoe → angular → vue → ngrx → svelte → react-fsd → Elm). Builds ran up to four in parallel; stage clocks overlapped slightly (spring was still compiling while Stage 2/3 prep ran).

**Interpretations and deviations (overrule any):**
- **I-1** *ralscha env override*: its viper `REALWORLD_*` env overrides appear in source (`config.go`), not in the README/compose/CI the K1 rule names. I used them and flagged it. **Moot**: ralscha fell at K4.
- **I-2** *mikro-orm config*: README and CI both say to `cp` two `*.example` config files; I did exactly that, and ran the app in the DB container's network namespace (MySQL on `--port=3307`) so the example's `localhost:3307` works unedited. **Moot** (K4).
- **Instrument deviation**: the plan said R3 would use a digest-pinned Playwright **image**. A container's `localhost` is the container, so a frontend built with API origin `http://localhost:4181` cannot reach the published port faithfully. K5, R3 and the CB check used **host Chrome + `playwright-core`**; versions above.
- **Hurl version**: first run used 7.1.0 (the `latest` tag lags); switched to 8.0.1 (matches nitro's and spring's CI) and **re-scored ralscha: identical** numbers. All K4 results are on 8.0.1.
- **Hurl `host`**: the Hurl files already prefix `/api`; the spec README's example (`HOST=…/api`) is misleading. `host` = origin only.
- **Box reading**: 45 min applies to the counted build; every K1 finished in ≤ 385 s.
- **BuildKit git context**: `BUILDKIT_CONTEXT_KEEP_GIT_DIR=1` for repos that need `.git` (angular's submodule step, spring's versioning plugin).

---

## 3. Backends (Stage 1)

### 3.1 Knockout table

| # | Repo @ SHA | K1 build | K3 boot + API flow | K4 Hurl (raw / adjusted / cascade) | Outcome |
|---|---|---|---|---|---|
| 1 | ralscha/realworld-go `0ba51c8` | ✓ 67 s | ✓ Postgres 18.6; goose `up` as one-shot; boot 4 s | 19.5 % (30/154) / 27.0 % (30/111) / 27.9 % (43) → floor tripped | **K4 knockout**, repo-attributable |
| 2 | mikro-orm/nestjs `a6818d8` | ✓ 54 s | ✓ MySQL 26.7; migrates at start; boot 36 s | 18.2 % (28) / 26.7 % (28/105) / 31.8 % (49) → floor tripped | **K4 knockout**, repo-attributable |
| 3 | realworld-apps/nitro-prisma-zod `c8c6685` | ✓ 46 s | ✓ libSQL file; `prisma db push` one-shot; boot 3 s | **100 %** (154/154, 13/13 files) / 100 / 0 | passes — **control label earned** |
| 4 | c4ffein/realworld-django-ninja `04ef47c` | ✓ 69 s | ✓ Postgres 18 from the repo's own compose values; `makemigrations && migrate` one-shot (a no-op: migrations are committed, see §14); boot 8 s (after 1 logged harness retry) | **100 %** (154/154) / 100 / 0 | passes |
| 5 | DataDog/fastapi `a31ab8e` | ✗ 18 s | — | — | **K1 knockout**, repo-attributable and **proven** |
| 6 | igoryok-zp/symfony `3c367b0` | ✓ 103 s + 7 s | ✓ Postgres 18; entrypoint migrates (8 migrations) + JWT keypair; boot 32 s | 42.2 % (65) / 47.8 % (65/136) / 11.7 % (18) → floor tripped | **K4 knockout**, repo-attributable |
| 7 | realworld-apps/aspnetcore `a51468c` | ✓ 132 s | ✓ SQLite (SQL Server **never booted**); EF migrates at start; boot 4 s | **100 %** (154/154) / 100 / 0 | passes |
| 8 | alexey-lapin/spring `068b51b` | ✓ 385 s | ✓ H2 in memory + Liquibase at start; boot 10 s | **100 %** (154/154) / 100 / 0 | passes |

**Why each knockout is repo-attributable (evidence, quoted):**
- **DataDog K1:** `uv sync --frozen --no-group dev` aborts with `OSError: Readme file does not exist: README.rst` — hatchling builds the project at sync time but the Dockerfile has only copied `pyproject.toml` and `uv.lock`. **Proof it's the repo, not my Dockerfile:** the repo's own `Dockerfile`, run verbatim with only the base image pinned by digest, fails identically (`logs/datadog_upstream_dockerfile_diag.log`).
- **ralscha K4** (first root failures): `POST /api/articles` → `actual value is <200>` (suite expects 201); `jsonpath "$.user.image" == null` → `actual: string <>`; error bodies use `required` where the suite expects `can't be blank`. The missing `slug` from the failed create cascades through 43 entries.
- **mikro-orm K4:** `jsonpath "$.user.bio" == null` → `actual: string <>` (auth.hurl:14, which cascades 18 entries); `jsonpath "$.articles[0].body" not exists` → body is present in lists; `errors_auth` expects 422, gets 400.
- **symfony K4:** same `bio ""`/list-body deviations plus **HTTP 500 where the suite expects 422/403/404** (`errors_auth`, `errors_authorization`, `errors_profiles`), and `POST /favorite` → 201 where 200 is expected. Cascade 11.7 % is *just over* the 10 % floor; adjusted 47.8 % is far below 90 % regardless.
- **Spec-age tagging:** nitro and django-ninja pin the spec submodule at `450bbc5` (2026-05-05); **no Hurl file changed between `450bbc5` and my fixed SHA**, so there is nothing to tag. spring's CI pins `SPEC_REF = ebbcdeb…` = my fixed SHA. For ralscha, mikro-orm, symfony the **claimed spec revision is "unknown"** (they ship the older Postman/newman collection or nothing); the Hurl suite itself only dates from 2026-02-21, so these low scores partly measure *age of the contract they track*, not sloppiness — tagged here as the plan requires, **never excluded**.
- **Per-file first failure for the three K4 knockouts:** `phase1-evidence/evidence/k4_failing_summary.txt`; raw per-entry data in `k4_*.json`.

### 3.2 What each backend exposes (cheap probes, measured on every backend that booted)

| Backend | DB engine that actually ran | Lockfile / frozen install | Health | Served spec | CORS (preflight from `http://localhost:4180`) | Notes |
|---|---|---|---|---|---|---|
| ralscha | Postgres 18.6 | `go.sum`; `-mod=readonly` ✓ | none (`/`, `/api/health` → 404) | none | **none** (405, no ACAO) | `httprate` 1000 req/min/IP; Argon2 128 MiB × 20 |
| mikro-orm | MySQL 26.7 | `yarn.lock`; `--immutable` ✓ | none | Swagger UI `/docs` (HTML) | `*`, headers `authorization,content-type` | `yarn start` compiles TS at boot |
| nitro | libSQL (SQLite) file | `bun.lock`; `--frozen-lockfile` ✓ | none (`/api/health` → 405 catch-all) | none | `*` / `*` / `*` (wildcard headers) | JWT secret env required |
| **django-ninja** | **Postgres 18** | **none** (exact pins except `jwtninja`, `pydantic>=`, `typing-extensions>=`) | none | **`/openapi.json` (3.1.0), `/docs`** | `*`, explicit `authorization` in allowed headers | documented command is Django **`runserver`** (dev server); 6 extra `/auth/*` JWT-session ops beyond the 19 RealWorld ones |
| symfony | Postgres 18 | `composer.lock` ✓ | `/` → 200 only | none | echoes `http://localhost:4180` | nginx + php-fpm + db (3 services) |
| aspnetcore | SQLite (named volume) | `packages.lock.json`; `--locked-mode` ✓ | **none** (all candidates 404) | `/swagger/v1/swagger.json` (3.0.4) | `*`, echoes requested headers | needs base64 `Jwt__SigningKey` ≥ 32 bytes |
| spring | H2 in memory | **none** (version catalog + Spring BOM; Gradle wrapper, no `distributionSha256Sum`) | **`/actuator/health` 200** | `/v3/api-docs`, `/swagger-ui` | `*`, explicit headers | Java 25; `Dockerfile.native` is unusable (expects a CI binary) |

---

## 4. Common backend (Stage 2)

**CB = nitro-prisma-zod.** Condition 1 (Hurl): 154/154. Condition 2 (origin/CORS), tested in a **real browser** from a page served at `http://localhost:4180`: six preflighted requests — GET `/tags`, GET `/user` + `Authorization`, POST `/users/login` + JSON, PUT `/user`, DELETE `/articles/x`, POST `/articles/x/favorite` — **all allowed in Chrome 154.0.8037.98**; no external absolute URLs in any response. (`evidence/cors_browser_nitro.json`.)
**Refuted prediction:** I expected `Access-Control-Allow-Headers: *` not to cover `Authorization` in a browser. Chrome 154 allowed it. Only Chrome was measured.

---

## 5. Frontends (Stage 3), against CB

### 5.1 K1 / K2 / K5

| # | Frontend @ SHA | K1 | K2: recorded origin string, N, mechanism | K5 vs CB (real Chrome) | Outcome |
|---|---|---|---|---|---|
| 1 | mutoe/vue3 `741c215` | ✓ 14 s | build env `VITE_API_HOST` | ✓ 8/8, 14 API calls, 0 counted | survivor |
| 2 | realworld-apps/angular `dd99ed2` | ✓ 25 s | **patch**, `https://api.realworld.show/api`, **N=1** (`src/app/core/interceptors/api.interceptor.ts:4`) | ✓ 8/8, 13 API calls, 0 counted | survivor |
| 3 | realworld-apps/vue `f7e48c8` | ✓ 14 s | **build env** `VITE_API_URL` (source fallback `https://api.realworld.show/api`) | ✓ 8/8, 18 API calls, 0 counted | survivor |
| 4 | stefanoslig/ngrx `bc7158d` | ✓ 145 s | patch, `https://real-world-app-39656dff2ddc.herokuapp.com/api`, **N=2** in `apps/conduit/src/environments/` (2 more in e2e helpers: out of scope) | **✗** 13 counted errors: Chrome blocks every XHR — *"The value of the 'Access-Control-Allow-Origin' header … must not be the wildcard '*' when the request's credentials mode is 'include'"* | **K5 knockout** |
| 5 | sveltejs/realworld `df79670` | **✗** 15 s | would be patch, N=1 (`src/lib/api.js:3`) | — | **K1 knockout**, repo-attributable |
| 6 | yurisldk/react-fsd `969709a` | ✓ 97 s | build arg `API_URL` (no default string) | **formally ✗**; diagnostic ✓ (§5.3) | **K5 knockout by the second-failure clause — your ruling** |
| 7 | dwayne/elm-conduit `57f8256` | **formally ✗**; diagnostic ✓ 99 s (§5.3) | patch, **N=1** (`html/index.html:43`) | not run (diagnostic ✓) | **K1 knockout by the second-failure clause — your ruling** |

- **sveltejs K1:** committed `pnpm-lock.yaml` contains `devalue@5.8.1:` **twice** (lines 653/656 and again 1358/1360; verified in an independent clone) → `ERR_PNPM_BROKEN_LOCKFILE … duplicated mapping key (656:3)` under the declared pnpm 10.20.0. (Possibly related to the failing Dependabot runs I had earlier mistaken for "CI red"; I did not check that.) The repo also builds with `@sveltejs/adapter-vercel`, so even a good lockfile gives no standalone server from its own tooling.
- **ngrx K5:** the failure is an interaction — the app sends credentialed XHR (`withCredentials`), which a wildcard-CORS backend can never satisfy. Under the frozen rule frontends are tested against CB, so it counts against the frontend. A backend that echoes the origin with `Allow-Credentials` might pass; **not measured**.
- **Hypothesis "submodule defeats a plain tarball":** a GitHub tarball of angular's SHA contains **only the empty `realworld/` directory entry** (1 entry); the Docker git-URL context **did** populate it (10 entries before any submodule command). Our pinning method avoids the trap; a tarball would not.
- **Old-origin informational:** requests to template-era hosts (`code.ionicframework.com`, Google Fonts) appear on every frontend and are not counted (not Fetch/XHR to the old API origin). Angular's bundle contains the new origin and not the old string; mutoe's `vue-router` chunk still contains `api.realworld.show` (informational only: K5 saw 0 requests to it).

### 5.2 R3 locatability (N = 53 target elements over 10 page states; tie band = max(3, ⌈0.05·53⌉) = 3)

| Frontend | semantic (a) | of which name = visible text / ≠ | text only (b) | css/name (c) | test-id only (d) | structural (e) | absent | test-id attrs in rendered DOM |
|---|---|---|---|---|---|---|---|---|
| mutoe | **38** | 18 / 20 | 3 | 3 | 0 | 8 | 1 | **74** |
| angular | 37 | 22 / 15 | 4 | 4 | 0 | 7 | 1 | 0 |
| vue | 37 | 22 / 15 | 5 | 4 | 0 | 7 | 0 | 7 |
| *diag* react-fsd | *42* | | 1 | 3 | 0 | 7 | 0 | 43 |
| *diag* Elm | *37* | | 5 | 1 | 0 | 5 | 5 | 0 |

**Tie set** (top 38; within 3): **mutoe, angular, vue — all three**, as pre-registered ("scores cluster inside the band; the decision falls to keys 2–4: expected, not a flaw"). The "name ≠ visible text" column is mostly inputs (their names come from placeholders, expected). The meaningful finding is on **mutoe**: its links carry `aria-label` **identifiers** that differ from the visible text — the Global Feed tab is `"global-feed"`, Your Feed is `"my-feed"`, every article-card link is `"article"`, every author link `"profile"` — so role+name finds nothing by visible title, and the app ships 74 test-id attributes. That is test-hook naming leaking into `aria-label`; it still counts as "semantic" under the frozen definition, which is why the rule alone can't see it.
Per-element detail: `evidence/r3_*.json`.

### 5.3 Non-counting diagnostics (shown so you can rule with data; **not used in the selection**)
- **react-fsd:** my K5 flow pressed Enter in the tags field; in this UI that **submits the form**, so the article was created (`POST /api/articles 201`, screenshot `k5_react-fsd.png` shows it) and the Publish button was already `disabled` when my script clicked it (Playwright API log: `element is not enabled`). With a flow that doesn't click a disabled button: **K5 ✓ 8/8, 0 counted vs nitro, and ✓ vs django-ninja**; R3 = 42.
- **Elm:** failures were `sed: command not found`, then `/bin/bash: no such file` in the `nixos/nix` image (its tools are under `/root/.nix-profile/bin`). With the right shell path the documented `nix build .#prod` **succeeds in 99 s**; K5 ✓ 8/8; R3 = 37.

---

## 6. Selection trace (Stage 4)

**Backend order** (keys 1–4 over the four K4 survivors):
1. **Key 1 — a measured open-source server DB in the default compose:** **django-ninja only** (Postgres 18). aspnetcore: SQLite, SQL Server **"not booted, not verified; excluded from key 1 for the reasons above"**; nitro: libSQL; spring: H2. None of the other survivors claims PostgreSQL/MySQL/MariaDB anywhere in code/config/docs (grep). **Key 1 decided something** — it separated one backend from three.
2. Key 2 (lockfile with working frozen install) among the rest: aspnetcore ✓, nitro ✓, spring ✗.
3. Key 3 (higher adjusted Hurl): aspnetcore 100 = nitro 100 → tie.
4. Key 4 (recency): aspnetcore (0 d) before nitro (155 d).
→ **order: django-ninja → aspnetcore → nitro → spring.**
**Consequence stated in the plan, now concrete:** key 1 outranks compliance, and django-ninja is *not* the best on lockfile (it has none). Had lockfile come first, aspnetcore would have won. "Cleaner wins" never operated.

**Frontend order** (K5 survivors mutoe, angular, vue): key 1 → tie set = all three; key 2 → pnpm / bun lockfiles all work frozen → tie; **key 3 removes angular** (patch vs build arg); **key 4 → vue (119 d) before mutoe (176 d)** → **F\* = vue**.

**Pair K5 (F\* × B\*), stop at first pass:** vue × django-ninja ✓ → **B\* = django-ninja**. aspnetcore, nitro, spring were **not run** (untested by rule).

**Decision matrix over your open rulings:**

| If you rule… | F\* | B\* |
|---|---|---|
| keep the frozen result (my recommendation) | vue | django-ninja |
| reinstate react-fsd (with or without Elm) | **react-fsd** (42 vs 37–38: alone in the tie set) | django-ninja (K5 diag ✓) |
| reinstate only Elm | vue (R3 37 in the set, but key 3: patch loses to build arg) | django-ninja |

---

## 7. Expensive measurements (Stage 5) — winner django-ninja, runner-up aspnetcore

**R6 — two reset cycles (`down -v`, up), initial state diffed:**
- **django-ninja:** schema **identical** (377 lines once the random `\restrict` nonce lines `pg_dump` emits are removed — my first diff flagged them, §9); exact row counts **identical**; applied migrations identical (29). Non-empty tables after migrations only: `auth_permission` 40, `django_content_type` 10, `django_migrations` 29 — **framework bookkeeping only; no application rows**.
- **aspnetcore:** schema (19 statements, 9 tables), row counts and migration history **identical**; only `__EFMigrationsHistory` has rows (2).
**Hurl second run (flakiness):** django-ninja 154/154 → 154/154; aspnetcore 154/154 → 154/154. No flakiness in 2 runs (not a proof).
**R5 — served OpenAPI, judged as a drift flagger needs it:**

| | django-ninja | aspnetcore |
|---|---|---|
| Generated from code? | **yes** (django-ninja) — 3.1.0, title "NinjaAPI" | **yes** (Swashbuckle) — 3.0.4, "RealWorld API" |
| Operations | 25 (the 19 RealWorld + `POST /auth/login`, `/auth/refresh`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/logout`, `/auth/logout/all`) | 19 |
| Ops with 2xx response schema (or no-content) | **25 / 25** | 19 / 19 |
| Ops documenting any 4xx/5xx with a schema | **17 / 25** | **0 / 19** |
| Write ops with a request-body schema | 8 / 12 | 6 / 8 |
| Security schemes | TokenAuth, JWTAuth | Bearer |
| Canonical hash identical across **two cold boots** | **yes**, and **byte-identical** (23,090 B) | **yes**, byte-identical |

→ **Snapshot decision (rule):** all three conditions hold for the winner (code-generated, 2xx schemas, identical across two cold boots), so `docs/env/contract/openapi.04ef47c.json` **would ship**, canonical sha256 `a8c0a6e9fcf090ad8c1cdc1f70713591c106a66a5b2912da6162616e4d6aa5a3`. Caveats: it includes 6 non-RealWorld `/auth/*` operations; the title is generic. Whether the file ships *without* its regeneration gate is the open question in §10.
**K6** (embedded-DB finalists only: **aspnetcore**; the winner is Postgres, so none is needed for it): 8 workers × 60 s, SQLite on a **named volume**: 928 requests, **15.1 req/s**, p50 119 ms, **p95 2,374 ms, p99 5,237 ms**, **0** 5xx, **0** 4xx, **0** network errors, **0** read-back mismatches, **0** locked/busy log lines, 232/232 iterations completed. **Mutation check:** the same generator against a stopped backend reports 6,411 network errors and 0 completions. So no lock errors in this run; the long tail under 8 workers is worth knowing but is not attributed (password hashing vs serialised writes were not separated).
**Rate-limit burst:** **not run** — only ralscha has a limiter in source and it was eliminated.
**R9 — final pair (vue + django-ninja), two numbers, never conflated:**
(i) **build:** one cold `--no-cache` build, both images in parallel: **49 s wall-clock** (django-ninja 49 s, vue 6 s); registry pulls of base images already on disk are excluded (I will not delete your images to force pulls), so this is a **lower bound**. (ii) **boot only** (`down -v`, then `up -d --wait`, images built): **9.39 s, 8.69 s, 7.70 s → median 8.69 s**; `--wait` returned 0 with the migration one-shot exited and all three long-running services healthy; frontend and `/api/tags` both 200. **The Phase 2 Actions cold-boot number must be compared with (i) + (ii) + pulls, never with (ii) alone.**

---

## 8. Hypothesis ledger (every pre-registered one; confirmed / refuted / untested)

| Hypothesis | Status | Notes |
|---|---|---|
| Angular needs a patch and the submodule defeats a plain tarball | **confirmed, qualified** | patch needed (N=1). Tarball lacks the submodule; the Docker git context includes it. |
| Vue / react-fsd build args suffice | **confirmed** | vue K5 ✓; react-fsd diagnostic ✓ |
| ralscha fails K5 on missing CORS | **untested** | eliminated at K4; a direct preflight shows no CORS headers (405, no ACAO) |
| alexey's Java 25 build is the slowest K1 and may exceed the box | **slowest: confirmed (385 s); exceeds box: refuted** | box is 45 min |
| aspnetcore needs `Jwt__SigningKey` supplied and has no health endpoint | **health: confirmed; key: read, not run without it** | every candidate path 404 incl. `/` |
| react-fsd's `data-test` coverage is partial | **not testable as worded** | 43 test-id attributes in its rendered DOM; 0 elements classified test-id-*only* |
| nitro scores 100 % Hurl | **confirmed** | 154/154 |
| elm's Nix build exceeds the box | **refuted** | diagnostic build 99 s (the formal K1 failed on harness faults, not time) |
| aspnetcore's adjusted Hurl rate is within the top three of K4 reachers | **confirmed** | 100 %, tied with three others |
| K6 shows lock errors on ≥ 1 embedded-DB backend that reaches it | **refuted** | aspnetcore (the only one K6'd): 0 lock/busy lines |
| ≥ 1 backend's adjusted Hurl rate is above its raw rate | **confirmed** | ralscha 19.5→27.0, mikro-orm 18.2→26.7, symfony 42.2→47.8 |
| Every K5-surviving frontend lands inside the R3 tie set | **confirmed** | 38 / 37 / 37, band 3 |
| nitro is the selected backend | **refuted — by the key order, not by nitro** | django-ninja earns key 1; nitro scored 100 % and passed CB |
| vue is F\*, by the four-link chain | **outcome confirmed; reasoning partly refuted** | (i) cluster ✓ (ii) key 2 tie ✓ (iii) key 3 removed *angular only* — sveltejs fell at K1, ngrx at K5, react-fsd formally at K5; (iv) vue before mutoe ✓. **Reinstating react-fsd changes the outcome.** |
| *(my own, during the run)* "nitro's wildcard `Allow-Headers` won't cover `Authorization` in a browser" | **refuted** | Chrome 154 |
| *(my own)* "F\* = vue is robust to both rulings" | **refuted** by the react-fsd diagnostic (R3 42) | caught before this report |

---

## 9. Invalid checks, harness faults, retries, refuted claims (all of them)

**Retries under the frozen rule (each listed with the fix named):**
1. *ralscha K4* — passed Hurl `host` with `/api` (the files add it) → `/api/api/…` 404s. Fix: origin only. **Retry 1 (allowed).**
2. *django-ninja K3* — my probe registered `…@x.test`; `email-validator` rejects the reserved TLD (server message quoted). Fix: `@test.com`, the spec's choice. **Retry 1.** (Earlier probe passes used `x.test`; the change can't turn a pass into a fail, so they were not re-run.)
3. *Elm K1* — `sed: command not found` (1st fault), then `/bin/bash: no such file` (2nd fault) in `nixos/nix`. **"A second failure counts" → formal knockout.** Flagged.
4. *react-fsd K5* — click timeout; my first diagnosis (Playwright waits for navigation → `noWaitAfter`) was **wrong**; the real cause is the disabled button (above). **"A second failure counts" → formal knockout.** Flagged. The three passing frontends were re-run on the identical v2 flow (unchanged).

**Invalid checks I made and discarded:**
- **R3 v1:** ground-truth selectors depended on `name` attributes, so existing elements scored "absent" (mutoe's editor, though K5 published through it). **R3 v2:** opened authenticated pages by direct URL, which mutoe's session restore bounced. **R3 v3:** navigated by role+name, which cannot work on mutoe (its accessible names are identifiers). **R3 v4 (final):** finds elements by CSS *or* role *or* placeholder *or* text, navigates by clicking visible text, classifies independent of how found. **All earlier numbers discarded.** *Forking-paths risk:* I revised this instrument three times after looking at results — each time because of evidence of an instrument error, not because of rank, and the same final instrument was applied to every frontend — but you should weigh R3 accordingly. Under the frozen rule R3 did **not** decide F\*.
- `pg_dump` random `\restrict`/`\unrestrict` nonce lines made two identical schemas diff on lines 1 and 379.
- Earlier (plan §Screen): code-search 0 hits, `pushed_at`, "CI red" (Dependabot runs), CodebaseShow.
- **Tool quirk:** the Bash tool halves doubled backslashes inside heredocs; it corrupted a regex and a Windows path in two scripts before any result was recorded. Scripts with backslashes were rewritten with the file-write tool.

**Stray process (mine, found when you asked):** a malformed command in the Elm step (a Python heredoc nested with a Node fallback) left `python3.exe -` waiting on stdin for ≈1 h 44 m, which kept one background task listed as running. It had **no effect on any result** (the intended Dockerfile fix was written separately by another tool). My earlier `pkill` could not see native Windows processes; I ended the process tree with `taskkill /T` after confirming by start time and command line that all four processes were mine.

**Incident:** Docker Desktop's engine was found **stopped** at ≈23:48Z (the `docker-desktop` WSL distro "Stopped") after a successful 67 s build, and was running again within ≈7 min. **Cause unknown.** I tried to start it from `C:Program FilesDockerDockerDocker Desktop.exe`, which does not exist on this machine, so my attempt cannot have been what brought it back; it returned by itself or by some other means. Your containers/images/volumes were intact afterwards (§13).
**Observation, not yet reproduced (do not cite as a defect):** on angular, opening another user's profile and then your own showed the *other* user's articles under "My Posts" once (stale list on route-param change).

---

## 10. Rulings and decisions needed from you

1. **react-fsd (decisive).** Rule under the frozen clause, or amend with a logged reason. *If you amend:* the amendment is made after seeing it flips F\*, so record that. *My recommendation: keep the frozen outcome (F\* = vue)*, list react-fsd as the measured-testability near-miss in the ADR, and revisit it in a later env tag if you want it. Either way B\* = django-ninja.
2. **Elm:** no ruling needed (it cannot change the outcome); I only want you to know the formal knockout rests on my errors.
3. **Snapshot file in `env-v1`** (the gate that regenerates it is deferred): **(a)** ship with a by-hand regeneration step only; **(b)** ship **plus a static release-gate check** that the filename's SHA7 equals the backend SHA7 in `env/pins.env` (no Docker, covers the main rot path; your stated lean); **(c)** don't ship it in `env-v1`. R5 says the file *can* exist.
4. **Flake policy (d):** the three numbers only you can set — flake budget, measurement window, quarantine expiry. Until then `env-v1` can't be tagged (`NOT YET WRITTEN` marker).
5. **The env's own licence** (the `LICENSE` seed).
6. **BuildKit cache:** my builds grew it from 8.7 GB to 34 GB (29.8 GB reclaimable). Pruning it would also drop your older cache entries, so I left it. If you want it gone: `docker builder prune` (affects all unused cache, not only mine).
7. **Spec version for Phase 2:** the pair was measured against the spec at `ebbcdeb`; Hurl is 8.0.1.

---

## 11. What this means for Phase 2 (deltas to the approved plan's Parts 4–5)

- **`env/pins.env`** holds: frontend `f7e48c8178602ce25d43293bc6f8ca51d84ae222`; backend `04ef47ced437ee8795a13bdcbc2eff2be19e33bd`; image digests (`python:3.12-slim-bookworm@sha256:34386ef0…`, `postgres@sha256:74935e72…` (Postgres 18), `oven/bun@sha256:9114c058…`, `nginx:1-alpine@sha256:df221db8…`; full list in `logs/digests_*.txt`).
- **Compose shape (measured, working):** `db` → `migrate` (one-shot: `python manage.py makemigrations && python manage.py migrate`) → `api` (Django `runserver 0.0.0.0:8000`) → `frontend` (nginx, static). Healthchecks that worked: `pg_isready`; for the API **there is no health endpoint**, so a Python one-liner GET `/api/tags` inside the container; frontend `wget` on `/`. `up --wait` returned 0 with the one-shot exited. The verify script's "backend health" = `GET /api/tags` 200.
- **API origin:** build env `VITE_API_URL=http://localhost:4181/api` — **no patch, no proxy**; K5 passes with real cross-origin (CORS `*`, explicit `authorization`).
- **Ports/origins** as planned (4180 / 4181 / 4182), all free on this machine during the run.
- **Drift risk to record (no lockfile):** `pip install .` with exact pins except `jwtninja`, `pydantic>=2.9.2`, `typing-extensions>=4.12.2`, and unpinned transitive dependencies. **Proposal for your approval:** generate a `constraints.txt` once at pin time (env-owned, not vendored upstream source) and install with `pip -c`; the pin-drift workflow then also reports changes to it.
- **Dev-server caveat:** the documented start is Django's `runserver`. Fine for an environment; say so in the ADR.
- **Verify-script data:** use `@test.com`-style emails (reserved TLDs are rejected); each run needs unique users.
- **`FINDINGS.md`:** no defect in the chosen pair was reproduced in Phase 1 (django-ninja passes the full suite; vue completed the flow with 0 errors). Expect few or none at `env-v1` unless Phase 2 probing finds some — your trade-off #5, now measured: the compliant backend wins, so there is little to pin.
- **Embedded-DB worker limit:** not applicable (winner is Postgres); K6's aspnetcore numbers are kept for the ADR.
- **Browser check (Phase 2):** this run's Playwright flow and the counted-error definition worked as specified; Phase 2 re-implements it as raw CDP plus the two mutation checks.
- **Windows reliability note:** Docker Desktop's engine stopped once during the run (§9). The README's reset/boot commands should say what to do if the engine is down.

---

## 12. Still unverified / known limitations (seed for the Phase 2 list)

- **Nothing was run on `ubuntu-24.04` or on GitHub Actions** (Phase 2). All timings are one Windows laptop, Docker Desktop, images cached; (i) is a lower bound.
- **Chrome only** for CORS and K5; Firefox/WebKit untested. K5 is a happy-path flow of one user.
- **Ownership is documented, not enforced; the `@docs/env/WORKING-AGREEMENT.md` import is not verified; a shipped OpenAPI snapshot is not checked against the running stack** (the three deferred items, each with its trigger, in the plan's "Deferred to env-v2").
- **SQL Server never booted**; django-ninja's SQLite mode (claimed by its CI) not run; MySQL/Postgres alternatives for other backends not run.
- **Hurl flakiness:** 2 runs on two backends. **Spec age:** one fixed spec SHA; backends that track older revisions are scored against the newest.
- ngrx's CORS failure is **pair-dependent** (credentialed XHR vs a wildcard backend); not tried against an origin-echoing backend.
- Only the 6 `GET`/`POST` preflight shapes in §4 were exercised; request bodies > default limits, unicode, and large lists were not.
- The `\restrict` nonce, the Docker outage and the BuildKit-cache growth are environment facts I observed, not explained.
- The silent-failure cases already in the plan: 60-day cron disablement; missing `ENV_CANONICAL` repository variable. Docker Hub pull limits on Actions.

---

## 13. Cleanup and evidence index

**Cleanup (verified):** removed all labelled containers/networks, the labelled volume `conduit-measure_data`, and **23 images** (the `conduit-measure/*` builds plus the base images I pulled); `docker inventory` of **containers (4), images (5), volumes (6), networks** is **identical to the pre-run snapshot** (`logs/docker_inventory_before.txt` vs `_after.txt`); `docker system df` images 5 / 7.87 GB again. **Left in place:** BuildKit cache (§10.6). No listeners remain on 4180/4181.
**Evidence (`phase1-evidence/`):** `harness/` (every Dockerfile, compose file and script used; the aspnetcore measurement key is redacted) · `evidence/k4_*.json` + `hurl_*/{stdout,stderr,exit}.txt` (per-entry Hurl results; response bodies omitted for size) · `probe_*.json` · `cors_browser_nitro.json` · `k5_*.json|png` (incl. `diag-*`) · `r3_*.json` · `stage5/` (state dumps, OpenAPI documents, K6, R9 timings) · `logs/` (K1 build logs, `incidents.txt`, pins, digests, inventories).
**Commands (one per method):**
- K1: `docker buildx build --progress=plain --label com.conduit-measure=1 [--build-arg BUILDKIT_CONTEXT_KEEP_GIT_DIR=1] -t <tag> -f - "https://github.com/<owner>/<repo>.git#<40-hex>" < Dockerfile`
- K4: `docker run --rm --network <compose-net> -v <spec>/specs/api/hurl:/hurl:ro -v <out>:/out ghcr.io/orange-opensource/hurl@sha256:49a02dc3… --test --continue-on-error --jobs 1 --variable host=<origin> --variable uid=<unique> --report-json /out/report --glob '/hurl/*.hurl'` then `node harness/hurl_score.mjs <hurl dir> <stderr>`
- K5 / R3 / CB-CORS: `harness/k5_run.sh`, `harness/r3_run.sh`, `harness/pw/cors_browser.mjs` (host Chrome + `playwright-core`); K6: `harness/k6_load.mjs`; OpenAPI: `harness/openapi_quality.mjs`.

---

## 14. Post-review audit — how django-ninja earned key 1 (added after your question)

**Question:** did django-ninja get Postgres from repo-documented config (allowed), or did my harness supply it? Is the driver the repo's own? Is `makemigrations && migrate` what the repo documents, and does `makemigrations` generate files at boot?
**Verdict: all three hold; key 1 was earned inside the rule; no amendment, selection order unchanged.** Evidence read at the pinned SHA `04ef47c` and, for item 3, re-run (`evidence/stage5/django_makemigrations_check.txt`).

**1. The Postgres settings come from the repo, not the harness.**
- The repo's own `docker-compose.yml` sets `DATABASE_URL=postgresql://postgres:0000@db:5432/postgres`, `ALLOWED_HOSTS=*`, `image: postgres:18`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=0000`, `POSTGRES_DB=postgres`. My compose uses **exactly those values**; the only change is that `postgres:18` is pinned by digest.
- Documented in all three sources the K1 rule names: **README** (`DATABASE_URL=postgresql://… make migrate`; `make run DATABASE_URL=… ALLOWED_HOSTS=*`; "Using Docker and Docker Compose": `docker compose up`), **compose file** (above), **CI** (`test-hurl-docker.yml` runs `docker compose up -d --wait`; `test-hurl-postgresql.yml` runs `migrate`/`make run` with a `postgresql://` `DATABASE_URL`).
- The code makes Postgres the *primary* database: `config/settings.py` uses SQLite only when `DEBUG` is on (or `DATABASE_URL` is `:memory:`/`file:`, DEBUG only); with `DATABASE_URL` unset and `DEBUG` unset the app **exits** with `You should set-up at least one of: - DATABASE_URL to use PostgreSQL …`. I set no `DEBUG`, so the non-debug path was the one exercised.
- **Harness-only differences from the repo's compose (orchestration, not database config):** (a) the `postgres:18` digest pin; (b) a `pg_isready` healthcheck; (c) `makemigrations && migrate` split into a **separate one-shot service** that must exit 0 before `api` starts, whereas the repo runs `makemigrations && migrate && runserver` in one container command — this is the arrangement the K1 migration paragraph asks for; (d) no `.:/app` bind mount, no `db-data` volume, no `restart: always`.

**2. The driver is the repo's own dependency; the harness added nothing.** `pyproject.toml` line 24: `"psycopg2==2.9.6"`. The harness Dockerfile's install steps are the repo's own — `apt-get install libpq-dev gcc`, `pip install --upgrade pip`, `pip install .` — differing from the repo's Dockerfile only in the digest-pinned base image, merged `RUN`/`ENV` lines and an apt-cache cleanup (`phase1-evidence/evidence/stage5/django_harness_vs_repo_diff.txt`). There is no extra `pip install` of any package.

**3. `makemigrations` is documented and is a no-op at this SHA.**
- `makemigrations && migrate` is the repo's own compose `command`. CI's Postgres job runs only `manage.py migrate`; both paths are documented.
- **The repo commits its migrations** (11 files: `accounts` 0001–0003, `articles` 0001–0004, `comments` 0001; no `.gitignore` rule). Re-running the documented command on a fresh Postgres 18 printed **`No changes detected`** first, then `migrate` applied 29 migrations (Django/`jwt_ninja` library ones plus exactly those 8 committed repo ones); a following `makemigrations --check --dry-run` printed `No changes detected` and **exited 0**. The set my two reset cycles applied is **identical to the committed set**, so nothing was generated at boot.
- So here it is equivalent to running committed migrations. It would *not* be if a future pin changes a model without a migration; the pin-drift report should flag that, and an env that wants committed-only behaviour can run `migrate` alone (CI's own Postgres path does).

**What this does not show.** It doesn't make django-ninja *better* than aspnetcore or nitro; it only confirms key 1 was earned legitimately. django-ninja still has **no lockfile** (exact pins except `jwtninja`, `pydantic>=`, `typing-extensions>=`), uses Django's `runserver`, and ships 6 extra `/auth/*` operations. Had lockfile ranked ahead of server-DB, aspnetcore would have won (§6).

---

## Appendix A — the screen that fixed the measured set (verbatim from the approved plan)

### Part 2 — Screen results (read-only, done; `gh api` GETs, 2026-10-08)

**Pool:** org moved `gothinkster/*` → `realworld-apps/*` (both your repos live there). Independent search (9 topic + 4 name/description queries, several hundred raw rows, mostly mirrors/copies)
reduced to **58 canonical candidates** (21 F, 37 B) + your two. Not exhaustive: CodebaseShow's 100+ catalog is client-rendered and unreadable. "Substantive" = default-branch commit, non-bot author, message not a dependency bump.

**Gate passers = what gets measured (7 F, 8 B — nitro is both the Hurl baseline and an eligible backend):**

| Role | Repo | 180d | 365d | last | lockfile | upstream CI on pinned HEAD |
|---|---|---|---|---|---|---|
| F | realworld-apps/vue-realworld-example-app | 24 | 24 | 119d | bun.lock | green |
| F | yurisldk/realworld-react-fsd | 5 | 5 | 135d | yarn.lock | green |
| F | realworld-apps/angular-realworld-example-app *(yours)* | 5 | 83 | 148d | bun.lock | green (format only) |
| F | stefanoslig/angular-ngrx-nx-… | 4 | 12 | 152d | package-lock | none |
| F | dwayne/elm-conduit | 2 | 20 | 160d | elm.lock+flake.lock | green (deploy) |
| F | sveltejs/realworld | 3 | 11 | 58d | pnpm-lock | none |
| F | mutoe/vue3-realworld-example-app | 5 | 5 | 176d | pnpm-lock | green (CodeQL only) |
| B | alexey-lapin/realworld-backend-spring | 32 | 66 | 35d | **none** (Gradle) | green |
| B | ralscha/realworld-go | 16 | 27 | 26d | go.sum | none |
| B | realworld-apps/aspnetcore-realworld-example-app *(yours)* | 7 | 7 | 0d | packages.lock.json | green |
| B | igoryok-zp/symfony-realworld-example-app | 6 | 16 | 38d | composer.lock | none |
| B | c4ffein/realworld-django-ninja | 3 | 49 | 155d | **none** | green (Hurl) |
| B | mikro-orm/nestjs-realworld-example-app | 2 | 6 | 50d | yarn.lock | green |
| B | DataDog/fastapi-realworld-example-app | 1 | 11 | 117d | uv.lock | **red (own tests fail)** |
| B (Hurl baseline) | realworld-apps/nitro-prisma-zod-… | 4 | 18 | 155d | bun.lock | green (Hurl) |

**Rejected:** *no licence* — the whole `adr1enbe4udou1n/*` family (6 backends + vue-ts/react-ts; the most active matched set in the pool), olenderhub/ember, borys25ol/fastapi, tanem/express-bookshelf, profjordanov.
*No substantive commit in 180d* — bedstack/elysia-*, hono-prisma, illright, err0r500, raeperd, gothinkster/golang-gin (2026-01-03), uptrace (2020), gothinkster/spring-boot (2022), jetli/yew, mint, nextjs-rsc, likui628, leosuncin, xstate, clojure, haskell, swift.
*Archived* — nsidnev/fastapi, gothinkster/react-redux. *Not a half* — lifeiscontent (Next+Rails), Bechma/leptos + actix-fullstack, martenframework (server-rendered), TonyMckes, saviorand/lean (both ends, 1 day old).

**Invalid / refuted checks (go in the ADR):**
- *Invalid:* GitHub code-search returned 0 for strings that exist → replaced by fetch-and-grep with positive controls. CodebaseShow unreadable. `pushed_at` ≠ default-branch activity. My "CAPPED" flag fired on fetch size, not truncation.
  **"Latest CI run on branch" was a Dependabot run for sveltejs, mutoe and symfony — I wrongly marked them "CI red" until I re-queried excluding Dependabot.** CI is evidence only, not a key.
- *Refuted by me:* "alexey-lapin has no CORS" (a `head` cutoff hid `WebConfig.addCorsMappings`; a positive control caught it); "Angular `NOASSERTION` = licence problem" (MIT + logo-trademark paragraph);
  "no lockfile ⇒ reject" (recorded drift risk); elm lockfile false negative.
- *Dropped on your review:* ranking by commit count; rank-matched pairing; shared-e2e pass counts (requires `window.__conduit_debug__`, a conformance hook) and served-spec-vs-official-spec diff as selection evidence.

**Static facts shaping the build (confirmed at runtime):** Angular hardcodes `https://api.realworld.show/api` in `api.interceptor.ts`, needs the `realworld` submodule, no test ids in `src`. Vue: `VITE_API_URL`. react-fsd: `API_URL` build arg + Dockerfile/nginx.
sveltejs: hardcoded in `src/lib/api.js`. ngrx: `environment.ts`, heavy `data-testid`. aspnetcore: SQLite|SQL Server, migrations at startup, base64 `Jwt__SigningKey` required, CORS open, Swashbuckle at `/swagger/v1/swagger.json`, no health endpoint.
ralscha: Postgres+goose, **no CORS middleware**, `httprate`. alexey: Java 25/Gradle w/o lockfile, `Dockerfile.native` unusable, `/actuator/health`, springdoc, H2 console enabled. mikro-orm: MySQL only.
Hurl suite: 13 files in `specs/api/hurl`, `HOST` includes `/api`, `uid` var for unique users.

---
