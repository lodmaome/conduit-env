#!/bin/sh
# Mutation check for the frontend submodule pin (FRONTEND_REALWORLD_SHA in env/pins.env).
#   control: the real env/frontend/Dockerfile, `src` stage, with the real pins must build.
#   wrong pin: the same build with the last hex digit of FRONTEND_REALWORLD_SHA changed must FAIL, and the failure must print both the
#     expected (wrong) value and the actual gitlink and checkout values.
#   harness mutation: a copy of the Dockerfile with the assertion removed, built with the wrong pin, must SUCCEED. That shows the
#     wrong-pin check can tell a present assertion from a missing one (otherwise a failure could be an unrelated build error).
#
# usage: sh tools/check-submodule-pin.sh      needs a running Docker engine and network access to GitHub; changes nothing tracked.
# exit status: number of failed checks.
#
# Same style as tools/check-lock-hashes.sh: every temporary file lives under one directory (.submodule-check/) that is removed on exit,
# on error and on INT, TERM or HUP; builds export no image (type=cacheonly), so no untagged image is left behind.
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 1
. ./env/pins.env

work=".submodule-check"
ctx="$work/ctx"
logs="$work/logs"
rm -rf "$work"
mkdir -p "$ctx" "$logs"
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
fail=0

# build <log-file> <realworld-sha> [context]: the `src` stage only; no image exported.
build() {
  docker buildx build --progress=plain --target src --output type=cacheonly \
    --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "BUN_IMAGE=$BUN_IMAGE" --build-arg "NGINX_IMAGE=$NGINX_IMAGE" \
    --build-arg "FRONTEND_REPO=$FRONTEND_REPO" --build-arg "FRONTEND_SHA=$FRONTEND_SHA" \
    --build-arg "FRONTEND_REALWORLD_SHA=$2" "${3:-$ctx}" > "$1" 2>&1
}

cp env/frontend/Dockerfile "$ctx/Dockerfile"

# A wrong value that cannot equal the real one: flip the last hex digit.
last="$(printf '%s' "$FRONTEND_REALWORLD_SHA" | tail -c 1)"
if [ "$last" = "0" ]; then flip=1; else flip=0; fi
wrong="$(printf '%s' "$FRONTEND_REALWORLD_SHA" | sed 's/.$//')$flip"
if [ "$wrong" = "$FRONTEND_REALWORLD_SHA" ] || [ "${#wrong}" -ne "${#FRONTEND_REALWORLD_SHA}" ]; then
  echo "FAIL  harness: could not derive a different pin of the same length"; exit 1
fi

echo "== control: the real pin must build"
if build "$logs/control.log" "$FRONTEND_REALWORLD_SHA"; then
  echo "PASS  control build succeeds with the real pin"
else
  echo "FAIL  control build failed; last lines of its log:"; tail -n 25 "$logs/control.log"; fail=$((fail + 1))
fi

echo "== wrong pin must fail and print expected and actual"
wrongrc=0
build "$logs/wrong.log" "$wrong" || wrongrc=$?
# Only a real output line counts: BuildKit also echoes the RUN command text, which contains the same words with unexpanded variables.
msg="$(grep -E '^#[0-9]+ [0-9.]+ SUBMODULE PIN MISMATCH' "$logs/wrong.log" | head -n 1)"
if [ "$wrongrc" -eq 0 ]; then
  echo "FAIL  build SUCCEEDED with a wrong FRONTEND_REALWORLD_SHA"; fail=$((fail + 1))
elif [ -n "$msg" ] && printf '%s' "$msg" | grep -q "expected=$wrong" \
  && printf '%s' "$msg" | grep -q "actual-gitlink=$FRONTEND_REALWORLD_SHA" \
  && printf '%s' "$msg" | grep -q "actual-checkout=$FRONTEND_REALWORLD_SHA"; then
  echo "PASS  wrong pin fails and the message prints expected (wrong) and actual (real) values:"
  printf '%s\n' "$msg" | sed 's/^#[0-9]* [0-9.]* /  /'
else
  echo "FAIL  build failed, but not with the pin-mismatch message; last lines of its log:"; tail -n 25 "$logs/wrong.log"; fail=$((fail + 1))
fi

echo "== harness mutation: assertion removed, wrong pin must build"
mutctx="$work/mutctx"
mkdir -p "$mutctx"
# Replace the failing branch's `exit 1` so the assertion can no longer fail; the file must change.
sed 's/^      exit 1; \\$/      true; \\/' env/frontend/Dockerfile > "$mutctx/Dockerfile"
if cmp -s env/frontend/Dockerfile "$mutctx/Dockerfile"; then
  echo "FAIL  harness mutation did not change the Dockerfile"; fail=$((fail + 1))
elif build "$logs/mutant.log" "$wrong" "$mutctx"; then
  echo "PASS  with the assertion neutralised the wrong pin builds, so the wrong-pin check can detect a missing assertion"
else
  echo "FAIL  mutant build failed although its assertion was removed; last lines of its log:"; tail -n 25 "$logs/mutant.log"; fail=$((fail + 1))
fi

echo "---"
echo "failed checks: $fail"
exit "$fail"
