# Runbook: known silent failures of the pipeline

Small on purpose. Each entry says what fails quietly, how to see it, and what to do. **Observed** means I saw it; **documented, not observed** means I read it and did not see it.
Observed facts are added after the rehearsal on real GitHub Actions (Milestone 3, stage 2); until then every entry below is about what the files say, not about what Actions did.

## 1. A missing `ENV_CANONICAL` skips the wrapper and the drift workflow with no alert

`env-verify.yml` and `env-pin-drift.yml` run only where the repository variable `ENV_CANONICAL` is `true` (`if: ${{ vars.ENV_CANONICAL == 'true' }}`); the guard is the variable, not a repository-name slug, so a fork or a clone stays quiet until its owner sets it.
The price: if the variable is missing, misspelt, or set to anything but `true`, the jobs are **skipped**. A skipped job is not a failure and sends no notification.

- **How to see it:** `gh variable list --repo <owner>/<repo>` must list `ENV_CANONICAL` with the value `true`; `gh run list --repo <owner>/<repo> --workflow env-verify.yml` shows the runs and their conclusion (a skipped run shows as `skipped`, not `failure`).
- **What to do:** set the variable (`gh variable set ENV_CANONICAL --body true --repo <owner>/<repo>`) on the canonical repository only. Attempts must not set it: they call `env-verify-core.yml` from their own workflow instead ([ATTEMPTS.md](ATTEMPTS.md)).
- **Observed:** not yet (stage 2 of Milestone 3 records exactly what the run page and `gh run list` show).

## 2. GitHub disables scheduled workflows after a period of repository inactivity

*Documented, not observed.* GitHub's page "Events that trigger workflows" (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows, read 2026-10-09) says that in a public repository scheduled workflows are automatically disabled when no repository activity has occurred in 60 days;
it does not define "activity" and does not say whether private repositories are affected. It also says scheduled workflows run only on the default branch (the workflow file must exist there) and that runs can be delayed under load, especially at the start of every hour (`env-pin-drift.yml` is scheduled at minute 17 for that reason).

- **How to see it:** the Actions tab shows a disabled workflow with a banner, and `gh workflow list --repo <owner>/<repo> --all` lists its state (`disabled_inactivity`). A missing weekly run in `gh run list --workflow env-pin-drift.yml` is the other sign.
- **What to do:** re-enable it (`gh workflow enable env-pin-drift.yml`) or run it once by hand (`gh workflow run env-pin-drift.yml`), and make sure the repository sees some activity.
- **Observed:** no. A cron trigger cannot be rehearsed in a short session; "schedule: not seen" until the first scheduled run has been watched.

## 3. A failed drift run

`env-pin-drift.yml` runs `node tools/pin-drift.mjs`. It compares each repository pin with the remote default branch head and each image pin with what its tag resolves to now, prints a table to the job summary, and **exits non-zero if any pin drifted or could not be read**. It never edits a pin, opens an issue or pushes.

- **A `DRIFT` row** means the upstream moved (a new commit on the default branch, or a floating tag such as `postgres:18` or `nginx:1-alpine` now pointing at a new digest). It is information, not an emergency: the environment keeps building the pinned versions. Decide whether to bump; a bump is an env change (class `pin`, a new `env-vN` tag, a CHANGELOG entry, a THIRD-PARTY row update, regenerated locks and snapshot if the backend changes).
- **An `ERROR` row** means the pin could not be checked (network, registry, a malformed pin line). Re-run the workflow once; if it persists, read the row's note.
- **Run it by hand:** `node tools/pin-drift.mjs` (needs `git` and Docker with buildx; read-only).
- **Observed locally** (2026-10-09, before any push): no drift in any of the 11 pins that can be compared; the derived `FRONTEND_REALWORLD_SHA` is skipped by design.
