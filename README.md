# conduit-env

A base repository for test frameworks: the RealWorld "Conduit" app (a Vue frontend, a django-ninja API and PostgreSQL 18), pinned by commit and image digest and started with `docker compose up -d --wait`. It holds what is needed to run the app and its API, a smoke test, the API contract snapshot, and the documents that explain them.

- [ENV-README.md](ENV-README.md): the manual (requirements, setup, use, using it as a base).
- [docs/env/ARCHITECTURE.md](docs/env/ARCHITECTURE.md): how it is built.
- [docs/env/UI-GUIDE.md](docs/env/UI-GUIDE.md) and [docs/env/API-GUIDE.md](docs/env/API-GUIDE.md): what the application's user interface and API do, as observed, for people who write tests.
- [THIRD-PARTY.md](THIRD-PARTY.md): licences of what it fetches. [CHANGELOG.md](CHANGELOG.md): releases. [LICENSE](LICENSE): MIT.

Replace this README with your own when you build a framework on top of this repository.
Built with AI assistance (Claude, from Anthropic) under its owner's direction and review.
