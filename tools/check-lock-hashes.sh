#!/bin/sh
# Mutation check for the hash-pinned lock files: with every hash of ONE package corrupted, the backend image build must fail with a
# hash mismatch that names that package. A control build of the unmodified lock files must succeed, so a failing mutation cannot be
# an unrelated build error. Covers both lock files (a runtime package and a build tool).
# Why every hash: with only one of several hashes corrupted, pip falls back to another listed file of the same version and
# the install does not fail (measured in Milestone 1, docs/env/adr/0001), so a partial mutation proves nothing.
#
# usage: sh tools/check-lock-hashes.sh        needs a running Docker engine; builds only the `app` stage; changes nothing tracked.
# exit status: number of failed checks.
#
# Every temporary file lives under one directory (.lock-check/) that is removed on exit, on error and on INT, TERM or HUP; nothing is
# left in the repo root. A failing check prints the tail of its log instead of keeping the file. The builds export no image
# (type=cacheonly), so the tool leaves no untagged image behind either.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
. ./env/pins.env

work=".lock-check"
ctx="$work/ctx"
logs="$work/logs"
rm -rf "$work"
mkdir -p "$ctx" "$logs"
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
fail=0

# Zero every sha256 hash of one package in a lock file. The package's block runs from its "name==" line to the next "name==" line.
zero_hashes() {  # $1 = lock file, $2 = package name, $3 = output file
  zeros="$(printf '%064d' 0)"   # built, not written out, so no 64-hex literal sits in this file next to the real pins
  awk -v pkg="$2" -v zeros="$zeros" '
    /^[A-Za-z0-9_.-]+==/ { inblock = (index($0, pkg "==") == 1) }
    { if (inblock) gsub(/sha256:[0-9a-f]{64}/, "sha256:" zeros); print }
  ' "$1" > "$3"
}

# build <context-dir> <log-file>: the real Dockerfile, only the stage that installs the lock files; no image exported.
build() {
  docker buildx build --progress=plain --target app --output type=cacheonly \
    --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "BACKEND_REPO=$BACKEND_REPO" --build-arg "BACKEND_SHA=$BACKEND_SHA" \
    "$1" > "$2" 2>&1
}

fresh_context() {  # copy of env/backend with the two lock files, then mutate on request
  rm -rf "$ctx"; mkdir -p "$ctx"
  cp env/backend/Dockerfile env/backend/requirements.lock.txt env/backend/build-tools.lock.txt "$ctx/"
}

echo "== control: unmodified lock files must build"
fresh_context
if build "$ctx" "$logs/control.log"; then
  echo "PASS  control build succeeds"
else
  echo "FAIL  control build failed; last lines of its log:"; tail -n 25 "$logs/control.log"; fail=$((fail + 1))
fi

mutate() {  # $1 = lock file name, $2 = package, $3 = label
  fresh_context
  zero_hashes "env/backend/$1" "$2" "$ctx/$1"
  if cmp -s "env/backend/$1" "$ctx/$1"; then echo "FAIL  $3: mutation did not change the file"; fail=$((fail + 1)); return; fi
  log="$logs/mutation-$2.log"
  if build "$ctx" "$log"; then
    echo "FAIL  $3: build SUCCEEDED with all hashes of $2 corrupted"; fail=$((fail + 1))
  elif grep -q "DO NOT MATCH THE HASHES" "$log" && grep -q "$2==" "$log" && grep -q "Expected" "$log"; then
    echo "PASS  $3: build fails with a hash mismatch naming $2"
  else
    echo "FAIL  $3: build failed, but not with a hash mismatch for $2; last lines of its log:"; tail -n 25 "$log"; fail=$((fail + 1))
  fi
}

echo "== mutations"
mutate requirements.lock.txt annotated-types "runtime package"
mutate build-tools.lock.txt setuptools "build tool"

echo "---"
echo "failed checks: $fail"
exit "$fail"
