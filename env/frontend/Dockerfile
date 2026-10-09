# check=skip=InvalidDefaultArgInFrom
# The base-image ARGs below have no default on purpose: compose.yaml supplies them from env/pins.env, the single place pins live.
# Frontend image: realworld-apps/vue-realworld-example-app at the SHA in env/pins.env.
# Upstream source is fetched at the pinned SHA (ADD <git>#<sha>), never vendored; no patch is applied.
# ADD <git> also checks out the repo's one submodule, `realworld` (realworld-apps/realworld; its commit is in docs/env/adr/0001, section 4).
# It is REQUIRED: src/main.js imports ../realworld/assets/theme/styles.css, so the build fails without it.
# The API origin is baked in at build time through the repo's own VITE_API_URL hook (src/config.js).
# Build it through compose.yaml: it supplies the build args from env/pins.env.
ARG BUN_IMAGE
ARG NGINX_IMAGE

FROM ${BUN_IMAGE} AS build
ARG FRONTEND_REPO
ARG FRONTEND_SHA
ARG VITE_API_URL
ADD ${FRONTEND_REPO}#${FRONTEND_SHA} /app
WORKDIR /app
RUN bun install --frozen-lockfile
ENV VITE_API_URL=${VITE_API_URL}
RUN bun run build

FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
