# check=skip=InvalidDefaultArgInFrom
# The base-image ARGs below have no default on purpose: compose.yaml supplies them from env/pins.env, the single place pins live.
# Backend image: c4ffein/realworld-django-ninja at the SHA in env/pins.env.
# Mirrors the upstream Dockerfile (python:3.12-slim-bookworm, libpq-dev + gcc, runserver) with these differences,
# listed here:
#   - the base is pinned by digest and the upstream source is fetched at the pinned SHA, never vendored;
#   - the fetch skips upstream's three git submodules (not needed to build or run; BuildKit's ADD <git> cannot skip them);
#   - Python dependencies come from the hash-pinned env/backend/requirements.lock.txt, not from `pip install .`;
#   - `pip install --upgrade pip` is dropped (pip stays at the version the digest provides).
# Build it through compose.yaml: it supplies the build args from env/pins.env.
ARG PYTHON_IMAGE

# ---- fetch: upstream source at the pinned commit, without submodules. Nothing from this stage but /src is shipped. ----
FROM ${PYTHON_IMAGE} AS fetch
ARG BACKEND_REPO
ARG BACKEND_SHA
# git comes from apt and is NOT version-pinned (known limitation, like gcc and libpq-dev below). A wrong or moved result cannot
# slip through: the checkout is asserted to be exactly BACKEND_SHA.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && dpkg-query -W -f='apt-installed: ${Package} ${Version}\n' git
RUN set -eu; \
    git init -q /src; cd /src; \
    git fetch -q --depth 1 "$BACKEND_REPO" "$BACKEND_SHA"; \
    git checkout -q --detach FETCH_HEAD; \
    test "$(git rev-parse HEAD)" = "$BACKEND_SHA"; \
    rm -rf .git

# ---- the image ----
FROM ${PYTHON_IMAGE} AS app
WORKDIR /app

# psycopg2==2.9.6 is published as a source distribution only, so it is compiled here.
# These two apt packages are NOT version-pinned: a known limitation.
RUN apt-get update \
    && apt-get install -y libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/* \
    && dpkg-query -W -f='apt-installed: ${Package} ${Version}\n' gcc gcc-12 libpq-dev libpq5 libc6-dev

COPY build-tools.lock.txt requirements.lock.txt /opt/lock/
# Build tools first, hash-checked, so the psycopg2 build does not fetch an unpinned setuptools from PyPI.
# They are removed afterwards: the runtime package set is exactly requirements.lock.txt.
RUN pip install --no-cache-dir --require-hashes --no-deps -r /opt/lock/build-tools.lock.txt \
    && pip install --no-cache-dir --require-hashes --no-build-isolation -r /opt/lock/requirements.lock.txt \
    && pip uninstall -y setuptools wheel packaging

COPY --from=fetch /src /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python3", "manage.py", "runserver", "0.0.0.0:8000"]
