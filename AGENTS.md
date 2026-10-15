# For AI assistants: read this before you write any test

This repository is a base for test frameworks. It runs one application, the RealWorld "Conduit" blog (a Vue frontend, a REST API and a PostgreSQL database), on fixed local ports. It contains no tests. You are probably here to write some.

## 1. Read, in this order

1. [ENV-README.md](ENV-README.md) sections 4 to 6: how to start the stack, where it runs, how to reset it.
2. [docs/env/API-GUIDE.md](docs/env/API-GUIDE.md): every endpoint, field rule, status code and error text, with rule IDs (`API-001` ...).
3. [docs/env/UI-GUIDE.md](docs/env/UI-GUIDE.md): every page, form, message and permission, with rule IDs (`UI-001` ...).
4. [contract/openapi.04ef47c.json](contract/openapi.04ef47c.json): the API's own OpenAPI document. It differs from what the API really does for 23 of the 24 rows of the table in API guide section 8 (only `GET /api/tags` matches). Never assert from it alone.
5. [docs/env/ARCHITECTURE.md](docs/env/ARCHITECTURE.md): only if the stack itself is your subject.

## 2. Before you write a test

- Start the stack (`docker compose up -d --wait`) and run the smoke test (`node tools/verify.mjs --no-browser`, or with `CHROME_BIN` set to include the browser). Do not write tests against a stack you have not seen healthy.
- Probe the behaviour you are about to assert against the live app, then write the test. Say in your test or notes which rule ID it covers.
- Keep apart what you ran and what you assumed. Report failures, skipped checks and unverified claims plainly.

## 3. Facts that break tests

- The frontend is `http://localhost:4180`. Use `localhost`, not `127.0.0.1` (UI-GUIDE). The API is `http://localhost:4181`. The ports are fixed.
- A token lives 5 minutes (API-003). `Authorization: Token <jwt>` and `Bearer <jwt>` both work (API-005). A garbage or expired token on a protected endpoint answers `500` HTML, not `401` (API-007).
- Emails on reserved domains such as `@example.test` are rejected; use `@example.com` (API-025).
- Data survives between runs, and users cannot be deleted (API-080). Give every test its own username and email, or reset between suites with `sh tools/reset.sh`.
- Slugs are not the title: a repeated title gets a random suffix. Read the slug from the response (API-070). `GET /api/articles` ignores the token, so `favorited` and `following` are always false there (API-009).
- The UI has no `data-testid`, no labels and no ids; find elements by placeholder, text and role. Data arrives after the page: wait for an element, not for the route (UI-058, UI-059, UI-063). The page also requests external stylesheet and font hosts (UI-065).
- Pages and the API show server messages as they come. Do not hard-code a message you have not seen.
- The six `/auth/*` operations are not part of RealWorld. Leave them out of coverage counts (API guide section 3.2).
- The contract file has one extra root key, `x-conduit-env`, that is not part of the API's own document. Drop it before you give the file to an OpenAPI validator or a schema generator.

## 4. Known defects are test material, not bugs to work around

The guides list behaviour that looks like a defect (mostly `500` answers to bad input) as **possible defect**. Do not write a test that treats it as correct, and do not delete a test because it fails. Pin each one as a known issue that is expected to fail, so that it fails on purpose when the application changes. The lists are API guide section 9 and UI guide section 8.

## 5. Rules for working here

- The application is **not** in this repository. It is fetched at build time from pinned upstream commits, so you cannot fix an application defect here, and you should not try to patch around it in the stack.
- Do not edit the files this repository owns: `compose.yaml`, `env/`, `tools/`, `contract/`, `docs/env/`, `.github/workflows/env-*.yml`, `ENV-README.md`, `THIRD-PARTY.md`, `CHANGELOG.md`. Put your own services in `compose.override.yaml` (ENV-README section 8).
- One stack at a time: every copy uses the project name `conduit-env` and ports 4180 to 4182.

## 6. Safety defaults: a protection layer you can change

The application does not need the rules in this section, and writing tests does not need them either. They are a protection layer, on by default, because Docker on a developer machine is usually shared with other projects, and an assistant that runs a cleanup command can remove images, containers and volumes that belong to someone else.

- Never start or stop Docker Desktop.
- Never run `docker system prune`, `docker rm`, `docker rmi` or any Docker command with `-f`.
- The only command that removes this stack's data is `sh tools/reset.sh`. It refuses to run unless Docker Compose resolves the project name to exactly `conduit-env`, and it passes `-p conduit-env` itself.
- Ask the human before you push, publish, delete, change repository settings or touch secrets.
- If a command is refused by a permission rule, stop and tell the human. Do not look for another way.

**These are defaults, not requirements.** If you work alone, on a machine where Docker is yours, or you want other limits, change or delete this section in your copy. This file belongs to you once you have started a project from this repository.

## 7. Your project's own rules

Add them below this line.
