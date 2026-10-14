# Third-party notices

Everything this repository fetches, builds on or runs that it did not write, one row per pin. The repository's own files are MIT, Copyright (c) 2026 lodmaome ([LICENSE](LICENSE)).

Each licence below was read from a file; the file and its revision or URL are in the table, and the date is the day it was read. Nothing comes from memory. The SPDX column is a reading of the text that was read; where the text does not settle a version, the cell says so.

**Fetched at build or run, not redistributed.** The repository contains none of the upstream source. Images are built or pulled locally by the person who runs the stack, from the pins in `env/pins.env`. This file is a notice and a record, not legal advice.

| Pin | What | Version, commit or digest | SPDX licence (as read) | File and revision or URL it was read from | Date read | Fetched at build or redistributed |
|---|---|---|---|---|---|---|
| `BACKEND_REPO`, `BACKEND_SHA` | Backend: `c4ffein/realworld-django-ninja` (django-ninja RealWorld API) | repo `c4ffein/realworld-django-ninja.git`, commit `04ef47ced437ee8795a13bdcbc2eff2be19e33bd` (`04ef47ced437...`) | MIT | `LICENSE` at that commit, https://raw.githubusercontent.com/c4ffein/realworld-django-ninja/04ef47ced437ee8795a13bdcbc2eff2be19e33bd/LICENSE; header "MIT License", "Copyright (c) 2021 RealWorld", "Copyright (c) 2024 c4ffein", MIT permission text present | 2026-10-09 | fetched at build, copied into the locally built image `conduit-env/backend`; the repository ships none of it |
| `FRONTEND_REPO`, `FRONTEND_SHA` | Frontend: `realworld-apps/vue-realworld-example-app` | repo `realworld-apps/vue-realworld-example-app.git`, commit `f7e48c8178602ce25d43293bc6f8ca51d84ae222` (`f7e48c817860...`) | MIT | `LICENSE` at the repository root of that commit, read from the source tree exported by the build (`The MIT License (MIT)`, "Copyright (c) 2017-present all contributors", MIT permission text present) | 2026-10-09 | fetched at build; its built bundle is served from the locally built image `conduit-env/frontend`. Its npm dependencies are bundled into that bundle and are **not inventoried** here (see "Not covered") |
| `FRONTEND_REALWORLD_SHA` | Frontend submodule `realworld` (`realworld-apps/realworld`): the spec repository; its `assets/theme/styles.css` is imported by the frontend and ships in the built bundle | commit `dd53ae6ef11e492a74feabc8043133e9f5283967` (`dd53ae6ef11e...`), the gitlink of `FRONTEND_SHA` | MIT (the logos under `assets/media/frameworks.svg` are expressly **not** covered) | `LICENSE` at that commit in the exported source tree: "MIT License", "Copyright (c) 2021 Thinkster", "Copyright (c) 2026 c4ffein", MIT permission text, then a note that third-party framework logos in `assets/media/frameworks.svg` are not covered by the licence | 2026-10-09 | fetched at build; the stylesheet is redistributed inside the locally built frontend image. This row is a hand-checked value, enforced by the build (ADR 0002 section 2) |
| `PYTHON_IMAGE` | Base image of the backend image, of the backend fetch stage and of the frontend `src` stage (the frontend build uses it as well as the backend): `python:3.12-slim-bookworm`, Python 3.12.15, Debian 12 | `python:3.12-slim-bookworm@sha256:34386ef0cb08...` | PSF-2.0 for Python (the file says "licensed under the Python Software Foundation License Version 2"), plus "different licenses" for some incorporated code; Debian packages carry their own | `/usr/local/lib/python3.12/LICENSE.txt` read inside the running api container (image `conduit-env/backend`, same base). Debian packages: each has `/usr/share/doc/<package>/copyright`; **not inventoried** (76 + 17 + 17 apt packages) | 2026-10-09 | redistributed inside the locally built backend image; the frontend `src` stage is throwaway |
| `POSTGRES_IMAGE` | Database: `postgres:18` (PostgreSQL 18.6, Debian 13) | `postgres:18@sha256:74935e722416...` | PostgreSQL licence (a BSD-style licence); the Debian copyright file also lists Custom-regex, Tcl and a custom pg_dump grant for parts | `/usr/share/doc/postgresql-18/copyright` read inside the running db container ("License: PostgreSQL" paragraph and the per-file list) | 2026-10-09 | pulled and run unmodified (nothing is built on it) |
| `BUN_IMAGE` | Frontend build stage: `oven/bun` 1.4.2 (Debian 13) | `oven/bun:1.4.2@sha256:9114c058aeae...` | MIT for Bun itself; statically linked JavaScriptCore is LGPL-2; a table of further linked libraries and licences (BSD, Apache-2.0, zlib, LGPL-2.1 for tinycc, others) | `LICENSE.md` at tag `bun-v1.4.2`, https://raw.githubusercontent.com/oven-sh/bun/bun-v1.4.2/LICENSE.md; the image itself was not searched for licence files | 2026-10-09 | fetched at build, build stage only: not in the final frontend image |
| `NGINX_IMAGE` | Frontend runtime: `nginx:1-alpine` (nginx 1.31.6 on Alpine 3.24.2) | `nginx:1-alpine@sha256:df221db836e1...` | nginx: BSD-2-Clause (the file is the two-clause BSD text, "Copyright (C) Igor Sysoev", "Copyright (C) Nginx, Inc."); Alpine packages carry their own | `/usr/share/licenses/nginx/COPYRIGHT` read inside the running frontend container. Alpine packages: **not inventoried** | 2026-10-09 | redistributed inside the locally built frontend image together with the static bundle |
| `actions/checkout` | GitHub Action used by both workflows (pinned in `.github/workflows/*.yml`) | tag `v7.0.1`, commit `3d3c42e5aac5ba805825da76410c181273ba90b1` (`3d3c42e5aac5...`); runs on Node 24 per its `action.yml` | MIT | `LICENSE` at that commit, https://raw.githubusercontent.com/actions/checkout/3d3c42e5aac5ba805825da76410c181273ba90b1/LICENSE ("The MIT License (MIT)", "Copyright (c) 2018 GitHub, Inc. and contributors", MIT permission text present); tag-to-commit verified with `git ls-remote` | 2026-10-09 | fetched by GitHub at run time; nothing is redistributed |
| `actions/setup-node` | GitHub Action used by the reusable workflow (pinned in `.github/workflows/env-verify-core.yml`) | tag `v7.1.0`, commit `949feb2413d6458794dcd2491c4babbbce0c15c1` (`949feb2413d6...`); runs on Node 24 per its `action.yml` | MIT | `LICENSE` at that commit, https://raw.githubusercontent.com/actions/setup-node/949feb2413d6458794dcd2491c4babbbce0c15c1/LICENSE (same header and text as above); tag-to-commit verified with `git ls-remote` | 2026-10-09 | fetched by GitHub at run time; nothing is redistributed |
| Python packages (31) | the backend's runtime dependencies | [`env/backend/requirements.lock.txt`](env/backend/requirements.lock.txt) (31 packages with hashes) and [`env/backend/build-tools.lock.txt`](env/backend/build-tools.lock.txt) (3 build tools, uninstalled after the build) | see the table below | the package metadata, as printed by `importlib.metadata` inside the running `api` container | 2026-10-09 | installed into the backend image at build time |

## The 31 locked Python packages

A record of what each package **declared** in its own metadata (License field, SPDX License-Expression field, trove classifiers), taken from a listing generated inside the running `api` container at backend `04ef47c` against the lock whose sha256 is `bc0cbf461a121bc93d8829a502887c3b6321e72c5335b7b9b828e188042c15d0`. It is not a legal reading: "-" means the package declared nothing in that field, and a licence is listed here only as declared (for example psycopg2 declares "LGPL with exceptions"). Two cells hold long licence texts in the package's own metadata and are shortened here.
The same listing found one installed package that is not in the lock: pip 25.0.1 (it comes with the Python base image).

| Package | Version | License field | License-Expression field | Classifiers |
|---|---|---|---|---|
| annotated-types | 0.6.0 | - | - | MIT License |
| asgiref | 3.8.1 | BSD-3-Clause | - | BSD License |
| certifi | 2026.7.22 | MPL-2.0 | - | Mozilla Public License 2.0 (MPL 2.0) |
| charset-normalizer | 3.5.2 | MIT | - | - |
| coreapi | 2.3.3 | BSD | - | BSD License |
| coreschema | 0.0.4 | BSD | - | BSD License |
| Django | 5.2.1 | BSD-3-Clause | - | BSD License |
| django-cors-headers | 4.3.1 | MIT | - | MIT License |
| django-extensions | 3.2.3 | MIT License | - | MIT License |
| django-ninja | 1.4.1 | - | - | MIT License |
| dnspython | 2.8.0 | ISC | - | ISC License (ISCL) |
| email_validator | 2.1.1 | Unlicense | - | The Unlicense (Unlicense) |
| idna | 3.20 | - | BSD-3-Clause | - |
| itypes | 1.2.0 | BSD | - | BSD License |
| Jinja2 | 3.1.6 | - | - | BSD License |
| jwtninja | 1.1.0 | MIT | - | MIT License |
| Markdown | 3.4.3 | (a long licence text, not repeated here) | - | BSD License |
| MarkupSafe | 3.0.4 | - | BSD-3-Clause | - |
| parameterized | 0.9.0 | FreeBSD | - | BSD License |
| psycopg2 | 2.9.6 | LGPL with exceptions | - | GNU Library or Lesser General Public License (LGPL) |
| pydantic | 2.14.0 | - | MIT | - |
| pydantic_core | 2.50.0 | - | MIT | - |
| pydantic-settings | 2.15.0 | - | MIT | MIT License |
| PyJWT | 2.15.1 | - | MIT | - |
| python-dotenv | 1.2.4 | BSD-3-Clause | - | - |
| requests | 2.34.2 | Apache-2.0 | - | Apache Software License |
| sqlparse | 0.4.4 | - | - | BSD License |
| typing_extensions | 4.16.0 | - | PSF-2.0 | - |
| typing-inspection | 0.4.4 | - | MIT | - |
| uritemplate | 4.2.0 | BSD 3-Clause OR Apache-2.0 | - | - |
| urllib3 | 2.8.0 | - | MIT | - |

## Not covered

- **npm packages bundled into the frontend** (from the frontend's `bun.lock`): not inventoried. The built bundle contains them; their licences were not read.
- **Debian and Alpine packages** in the images: not inventoried (they are not version-pinned).
- **Google Fonts and Ionicons** are loaded by the frontend page from their CDNs at view time; no licence was read for them. The page is therefore not hermetic.
