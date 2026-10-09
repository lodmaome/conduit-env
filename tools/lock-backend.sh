#!/bin/sh
# Regenerates the hash-pinned files in env/backend/ (constraints.txt, build-tools.txt) in a Linux container
# on the digest-pinned Python base. Needs a running Docker engine; changes only the two output files.
#
# Run it only when a pin changes (a pin bump is an env change: new tag, CHANGELOG entry, re-run of the Hurl suite).
# Resolution is held to the versions in env/backend/lock-seed.txt, so re-running with unchanged inputs gives the same
# versions. To move versions on purpose, edit lock-seed.txt (or delete the lines to move) and review the diff.
set -eu

PIP_TOOLS_VERSION=7.6.2   # generator only; recorded in the header of constraints.txt, not part of the runtime image

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
. ./env/pins.env

# Relative on purpose: docker.exe under Git Bash does not understand MSYS paths such as /tmp/...
tmp=".lock-out"
rm -rf "$tmp"
trap 'rm -rf "$tmp"' EXIT

# LOCK_BUILD_FLAGS is for extra buildx flags, e.g. LOCK_BUILD_FLAGS=--no-cache to prove a regeneration does not just replay the cache.
# shellcheck disable=SC2086
docker buildx build ${LOCK_BUILD_FLAGS:-} \
  --file env/backend/Dockerfile.lock \
  --target out \
  --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" \
  --build-arg "BACKEND_REPO=$BACKEND_REPO" \
  --build-arg "BACKEND_SHA=$BACKEND_SHA" \
  --build-arg "PIP_TOOLS_VERSION=$PIP_TOOLS_VERSION" \
  --output "type=local,dest=$tmp" \
  env/backend

cp "$tmp/constraints.txt" env/backend/constraints.txt
cp "$tmp/build-tools.txt" env/backend/build-tools.txt
echo "wrote env/backend/constraints.txt and env/backend/build-tools.txt"
sha256sum env/backend/constraints.txt env/backend/build-tools.txt
