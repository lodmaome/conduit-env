# Findings

Defects of the app under test (the frontend and the backend as pinned), each with a reproduction that was **run before it was written down**,
with its command, output, date and versions. A reproduction that has not been run does not appear here as a finding.

## Defects

**None reproduced.** [PHASE1-REPORT.md](PHASE1-REPORT.md) says so for the chosen pair, and the rules this page follows are in [WORKING-AGREEMENT.md](WORKING-AGREEMENT.md) section 2(b):
the backend passes the whole RealWorld Hurl suite (154 of 154 entries on Hurl 8.0.1), and the frontend completed a register, log in, publish and read-back flow in a real browser with no counted errors.
That is the absence of a reproduced defect, not a proof that there are none. The Phase 1 report also records one observation on a frontend that was **not** chosen (angular), which was not reproduced and is not cited.

## Behaviour that tests will meet (reproduced, not defects)

Run on 2026-10-09 against the running stack: backend `04ef47c` (Django 5.2.1, django-ninja 1.4.1), frontend `f7e48c8`, Docker engine 29.8.2, Compose 5.5.1.
Raw output: `findings-probe.txt` in the external evidence folder (see [HOW-THIS-WAS-BUILT.md](HOW-THIS-WAS-BUILT.md)); the relevant lines are quoted here.

**B1. Emails on reserved or special-use top-level domains are rejected at registration.**

```
POST /api/users  {"user":{"username":"...","email":"<name>@example.test","password":"..."}}
-> HTTP/1.1 422 Unprocessable Entity
{"errors": {"email": ["value is not a valid email address: The part after the @-sign is a special-use or reserved name that cannot be used with email."]}}
```

Use an ordinary domain such as `example.com` for test users (the verify script does).

**B2. A second article with the same title gets a different slug, with a random suffix.** Two `POST /api/articles` with the same title both answered `201 Created`; the slugs were `same-title-slug6810` and `same-title-slug6810-eaf03849`, and `GET /api/articles/same-title-slug6810` answered `200`.
Tests must read the slug from the response, never derive it from the title.

**B3. Duplicate username is `409`.** `POST /api/users` with an existing username answered `409 Conflict` with `{"errors": {"username": ["has already been taken"]}}`.

**B4. The API allows any origin.** `GET /api/tags` with `Origin: http://evil.example` answered `access-control-allow-origin: *`. This is the upstream default and it is acceptable only because every port is bound to `127.0.0.1`; see the safety statement in [adr/0001-pair-lock-and-migrations.md](adr/0001-pair-lock-and-migrations.md) section 4.

## Format for a defect

When a defect is found, add it above with: a one-line title; the exact command; the output; what the RealWorld spec or the contract says should happen; the date; the versions; and how a test should pin it (a known-issue label, so that it fails on purpose when the defect is fixed).
