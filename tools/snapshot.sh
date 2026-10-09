#!/bin/sh
# Regenerates docs/env/contract/openapi.<backend-sha7>.json BY HAND. There is no automatic regeneration gate in env-v1.
# The file is ONE valid JSON document: the normalised served OpenAPI object plus the root key `x-conduit-env`, which holds the three values
# printed by tools/lock-hashes.sh (decision b+) under exactly those names. Needs the stack running; refuses unless the running api image is
# the one pinned in env/pins.env (otherwise the header would describe a different backend than the document).
# usage: sh tools/snapshot.sh
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 90
[ -f compose.yaml ] && [ -f env/OWNED.txt ] || { echo "refusing: $root is not the conduit-env repository root"; exit 90; }
. ./env/pins.env

running="$(docker compose -f compose.yaml -p conduit-env ps api --format '{{.Image}}')"
if [ "$running" != "conduit-env/backend:$BACKEND_SHA" ]; then
  echo "refusing: the running api image is '$running', not conduit-env/backend:$BACKEND_SHA (is the stack up and built from env/pins.env?)"; exit 1
fi

sha7="$(echo "$BACKEND_SHA" | cut -c1-7)"
out="docs/env/contract/openapi.$sha7.json"
tmp="$(mktemp)"
hashes="$(mktemp)"
trap 'rm -f "$tmp" "$hashes"' EXIT
sh tools/lock-hashes.sh > "$hashes"
node tools/openapi-snapshot.mjs "$hashes" > "$tmp"
mkdir -p docs/env/contract
cp "$tmp" "$out"
echo "wrote $out ($(wc -c < "$out") bytes)"
