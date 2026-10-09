# check=skip=InvalidDefaultArgInFrom
# The base-image ARGs below have no default on purpose: compose.yaml supplies them from env/pins.env, the single place pins live.
# Backend image: c4ffein/realworld-django-ninja at the SHA in env/pins.env.
# Mirrors the upstream Dockerfile (python:3.12-slim-bookworm, libpq-dev + gcc, runserver) with these differences,
# each recorded in docs/env/adr/0001:
#   - the base is pinned by digest and the upstream source is fetched at the pinned SHA (ADD <git>#<sha>), never vendored;
#   - Python dependencies come from the hash-pinned env/backend/constraints.txt, not from `pip install .`;
#   - `pip install --upgrade pip` is dropped (pip stays at the version the digest provides).
# Build it through compose.yaml: it supplies the build args from env/pins.env.
ARG PYTHON_IMAGE
FROM ${PYTHON_IMAGE}
ARG BACKEND_REPO
ARG BACKEND_SHA

WORKDIR /app

# psycopg2==2.9.6 is published as a source distribution only, so it is compiled here.
# These two apt packages are NOT version-pinned: a known limitation (docs/env/adr/0001).
RUN apt-get update \
    && apt-get install -y libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/* \
    && dpkg-query -W -f='apt-installed: ${Package} ${Version}\n' gcc gcc-12 libpq-dev libpq5 libc6-dev

COPY build-tools.txt constraints.txt /opt/lock/
# Build tools first, hash-checked, so the psycopg2 build does not fetch an unpinned setuptools from PyPI.
# They are removed afterwards: the runtime package set is exactly constraints.txt.
RUN pip install --no-cache-dir --require-hashes --no-deps -r /opt/lock/build-tools.txt \
    && pip install --no-cache-dir --require-hashes --no-build-isolation -r /opt/lock/constraints.txt \
    && pip uninstall -y setuptools wheel packaging

# ADD <git> also checks out upstream's three git submodules (the RealWorld spec and two example frontends, about 5.7 MB).
# The app never reads them; they are extra upstream content fetched at build time (docs/env/THIRD-PARTY.md, adr/0001).
ADD ${BACKEND_REPO}#${BACKEND_SHA} /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python3", "manage.py", "runserver", "0.0.0.0:8000"]
