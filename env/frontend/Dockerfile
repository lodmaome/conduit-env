# check=skip=InvalidDefaultArgInFrom
# The base-image ARGs below have no default on purpose: compose.yaml supplies them from env/pins.env, the single place pins live.
# Frontend image: realworld-apps/vue-realworld-example-app at the SHA in env/pins.env.
# Upstream source is fetched at the pinned SHA (ADD <git>), never vendored; no patch is applied.
# ADD <git> also checks out the repo's one submodule, `realworld` (realworld-apps/realworld). It is REQUIRED:
# src/main.js imports ../realworld/assets/theme/styles.css, so the build fails without it. Its commit is pinned as FRONTEND_REALWORLD_SHA
# and the `src` stage fails, printing expected and actual, unless the gitlink and the checked-out submodule HEAD both equal it.
# The API origin is baked in at build time through the repo's own VITE_API_URL hook (src/config.js).
# Build it through compose.yaml: it supplies the build args from env/pins.env.
ARG PYTHON_IMAGE
ARG BUN_IMAGE
ARG NGINX_IMAGE

# ---- src: upstream source with its git metadata, only to read and assert the submodule pin; then the metadata is dropped. ----
# git comes from apt and is NOT version-pinned (same known limitation as the backend's fetch stage, docs/env/adr/0001).
FROM ${PYTHON_IMAGE} AS src
ARG FRONTEND_REPO
ARG FRONTEND_SHA
ARG FRONTEND_REALWORLD_SHA
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
ADD --keep-git-dir=true ${FRONTEND_REPO}#${FRONTEND_SHA} /src
RUN set -eu; cd /src; \
    head="$(git rev-parse HEAD)"; \
    gitlink="$(git ls-tree HEAD realworld | awk '$1 == "160000" && $2 == "commit" { print $3 }')"; \
    checkedout="$(git -C realworld rev-parse HEAD)"; \
    echo "submodule pin: expected $FRONTEND_REALWORLD_SHA, gitlink in $head is $gitlink, checked-out HEAD is $checkedout"; \
    if [ "$head" != "$FRONTEND_SHA" ] || [ "$gitlink" != "$FRONTEND_REALWORLD_SHA" ] || [ "$checkedout" != "$FRONTEND_REALWORLD_SHA" ]; then \
      echo "SUBMODULE PIN MISMATCH: FRONTEND_REALWORLD_SHA expected=$FRONTEND_REALWORLD_SHA actual-gitlink=$gitlink actual-checkout=$checkedout (frontend HEAD $head, expected $FRONTEND_SHA)" >&2; \
      echo "To accept a new frontend pin, copy the actual value into FRONTEND_REALWORLD_SHA in env/pins.env." >&2; \
      exit 1; \
    fi; \
    rm -rf .git realworld/.git

FROM ${BUN_IMAGE} AS build
ARG VITE_API_URL
COPY --from=src /src /app
WORKDIR /app
RUN bun install --frozen-lockfile
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
