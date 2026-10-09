# API contract snapshot

`openapi.04ef47c.json` is the OpenAPI document the pinned backend serves (`GET http://127.0.0.1:4181/openapi.json`; it is served at the root, not under `/api`),
normalised: keys sorted at every level, 2-space indent, LF, one trailing newline. Two fetches of the live document are byte-identical (checked on every regeneration).

**The file is not valid JSON as a whole.** It starts with a three-line header, then one blank line, then the JSON. Drop the first four lines to parse it (`tail -n +5`).
The header is exactly what `sh tools/lock-hashes.sh` prints:

```
backend-sha7: <first 7 hex characters of BACKEND_SHA in env/pins.env>
requirements-lock-sha256: <sha256 of env/backend/requirements.lock.txt>
build-tools-lock-sha256: <sha256 of env/backend/build-tools.lock.txt>
```

The release gate recomputes those three lines and requires them to equal the file's header, so a changed backend pin or lock file with a stale snapshot fails the gate.
Regeneration is by hand: `sh tools/snapshot.sh` (the stack must be running and built from the pins; the script refuses otherwise). There is no automatic regeneration gate in env-v1.

## The six operations that are not RealWorld

The served document has 25 operations: the 19 RealWorld operations under `/api/`, and these six under `/auth/`, from the `jwtninja` package that the backend uses:

| Operation | Purpose |
|---|---|
| `POST /auth/login/` | log in (JWT login of the package, not the RealWorld `POST /api/users/login`) |
| `POST /auth/refresh/` | new refresh token |
| `GET /auth/sessions/` | list active sessions |
| `DELETE /auth/sessions/{session_id}/` | revoke a session |
| `POST /auth/logout/` | log out |
| `POST /auth/logout/all/` | log out everywhere |

**An attempt's coverage-gap flagger must exclude every path under `/auth/`.** Otherwise it reports six operations as untested that no RealWorld spec describes.
The list comes from PHASE1-REPORT section 14 and was re-checked against the served document on 2026-10-09; `tools/test/contract.test.mjs` fails if the snapshot's `/auth/` operations stop matching this table, or if the RealWorld count is no longer 19.

Source of the snapshot's information: generated from code by django-ninja (OpenAPI 3.1.0, title "NinjaAPI", which is generic). Phase 1 recorded a "canonical hash" for this document; the form of that canonicalisation is not recorded, and none of four plausible formats reproduced it,
so this snapshot's hashes are not comparable with it (the raw document is the same size, 23,090 bytes).
