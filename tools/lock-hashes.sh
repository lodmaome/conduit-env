#!/bin/sh
# Prints the lock-file lines of the OpenAPI snapshot's `x-conduit-env` values (decision "b+", ADR 0001 section 6) and checks nothing else.
# Output, exactly these three lines in this order:
#   backend-sha7: <first 7 hex chars of BACKEND_SHA in env/pins.env>
#   requirements-lock-sha256: <sha256 of env/backend/requirements.lock.txt>
#   build-tools-lock-sha256: <sha256 of env/backend/build-tools.lock.txt>
# Each hash is of the file's bytes as committed. env/.gitattributes forces LF under env/, so the working-tree bytes equal the committed
# bytes on every platform; no normalisation is applied here. One hash per file, never a combined hash, so a mismatch names the file.
set -eu
cd "$(dirname "$0")/.."
. ./env/pins.env

hash() { sha256sum "$1" | cut -d' ' -f1; }

echo "backend-sha7: $(echo "$BACKEND_SHA" | cut -c1-7)"
echo "requirements-lock-sha256: $(hash env/backend/requirements.lock.txt)"
echo "build-tools-lock-sha256: $(hash env/backend/build-tools.lock.txt)"
