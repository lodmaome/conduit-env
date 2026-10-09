#!/bin/sh
# The gate's tooling: shellcheck, actionlint, yamllint, hadolint and lychee as digest-pinned containers, plus `docker compose config` and `node --test` on the host.
#
# usage: sh tools/gate.sh [--online]        exit status = number of failed checks
#   --online   also run lychee against external links. INFORMATIONAL: it never changes the exit status (a third-party outage must not fail the gate).
#
# This is the ONLY place in the repository that uses `docker run --rm` (the Docker rule, ADR 0001 section 5, exemption 2). Every container:
#   - is started from an image reference pinned by digest (env/gate/tools.env); a tag-only reference is refused,
#   - carries the label conduit-env.gate=1,
#   - sees the repository mounted READ-ONLY at /repo (the root is asserted first),
#   - has --network none (all five tools work offline; the --online lychee run is the one exception).
# File lists come from `git ls-files`, sorted. Tool configs live in env/gate/, never at the repo root (root files are attempt territory).
# Every tool is also run on a failing fixture (must fail) and a clean control (must pass) from env/gate/fixtures/, which the real lists exclude.
# shellcheck disable=SC2329  # the t_* functions are invoked indirectly through "$_runner"
set -u
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 90
if [ ! -f compose.yaml ] || [ ! -f env/OWNED.txt ] || [ ! -f env/gate/tools.env ]; then
  echo "refusing: $root is not the conduit-env repository root (compose.yaml, env/OWNED.txt or env/gate/tools.env missing)."; exit 90
fi
. ./env/gate/tools.env

online=0
for a in "$@"; do
  case "$a" in --online) online=1 ;; *) echo "unknown argument: $a"; echo "usage: sh tools/gate.sh [--online]"; exit 90 ;; esac
done

work="$(mktemp -d)" || exit 90
trap 'rm -rf "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
fail=0
pass() { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); }

# Windows (Git Bash): `pwd -W` gives C:/...; MSYS_NO_PATHCONV stops the shell rewriting /repo. Linux: plain pwd.
mount="$(pwd -W 2>/dev/null || pwd)"

require_digest() {  # $1 = image reference; refuses anything not pinned by a sha256 digest
  case "$1" in *@sha256:*) ;; *) echo "refusing image '$1': not pinned by digest" >&2; return 1 ;; esac
  printf '%s' "${1##*@sha256:}" | grep -q -E '^[0-9a-f]{64}$' || { echo "refusing image '$1': malformed digest" >&2; return 1; }
}

# drun <network> <image> [tool args...]; set EP to override the entrypoint. The only `docker run --rm` in the repository.
drun() {
  _net="$1"; _img="$2"; shift 2
  require_digest "$_img" || return 97
  if [ "$_net" = none ]; then _netflag="--network none"; else _netflag=""; fi
  # shellcheck disable=SC2086  # _netflag and the EP expansion are intentionally word-split
  MSYS_NO_PATHCONV=1 docker run --rm --label conduit-env.gate=1 $_netflag ${EP:+--entrypoint "$EP"} -v "$mount:/repo:ro" -w /repo "$_img" "$@"
}

t_shellcheck() { drun none "$SHELLCHECK_IMAGE" -x -P SCRIPTDIR:/repo "$@"; }
t_actionlint() { drun none "$ACTIONLINT_IMAGE" -no-color "$@"; }
t_yamllint() { EP=yamllint drun none "$YAMLLINT_IMAGE" -c env/gate/yamllint.yaml -f parsable "$@"; }
t_hadolint() { drun none "$HADOLINT_IMAGE" /bin/hadolint --config env/gate/hadolint.yaml "$@"; }
t_lychee() { drun none "$LYCHEE_IMAGE" --offline --include-fragments --no-progress --config env/gate/lychee.toml "$@"; }
t_lychee_online() { drun default "$LYCHEE_IMAGE" --include-fragments --no-progress --config env/gate/lychee.toml "$@"; }
t_compose() { docker compose -f "$1" config --quiet; }
t_nodetest() { node --test "$@"; }

# ---- file lists ----
FIX="env/gate/fixtures/"
all="$work/all.txt"
git ls-files | LC_ALL=C sort > "$all"
excluded="$(grep -c "^$FIX" "$all")"
grep -v "^$FIX" "$all" > "$work/real.txt"
list() { grep -E "$1" "$work/real.txt"; }  # list <regex on path> -> sorted paths

echo "gate: real file lists come from git ls-files, sorted; $excluded tracked file(s) under $FIX are excluded from every real list (they are broken on purpose)."
if [ -n "$(git status --porcelain)" ]; then echo "note: the working tree has uncommitted changes; the gate reads the working tree, not the last commit."; fi

# real <name> <runner> <regex> <expect-at-least>: run the tool on the matching tracked files
real() {
  _name="$1"; _runner="$2"; _re="$3"
  files="$(list "$_re")"
  n="$(printf '%s' "$files" | grep -c .)"
  if [ "$n" -eq 0 ]; then echo "SKIP  $_name: 0 files match (nothing to check; this is reported, not a pass)"; return; fi
  # shellcheck disable=SC2086  # the file list is one path per line without spaces (checked below)
  if printf '%s' "$files" | grep -q ' '; then bad "$_name: a tracked path contains a space"; return; fi
  # shellcheck disable=SC2086
  if out="$($_runner $files 2>&1)"; then pass "$_name: $n file(s) clean"; else bad "$_name: findings in $n file(s):"; printf '%s\n' "$out" | head -n 40; fi
}

# fixture <name> <runner> <bad file> <good file> <regex the failure output must match>
fixture() {
  _name="$1"; _runner="$2"; _bad="$3"; _good="$4"; _re="$5"
  if out="$($_runner "$FIX$_bad" 2>&1)"; then bad "fixture $_name: the failing fixture $_bad PASSED (the tool cannot fail)"
  elif printf '%s' "$out" | grep -q -E "$_re"; then pass "fixture $_name: $_bad fails as intended (/$_re/)"
  else bad "fixture $_name: $_bad failed, but not for the expected reason (/$_re/): $(printf '%s' "$out" | head -n 5)"; fi
  if out="$($_runner "$FIX$_good" 2>&1)"; then pass "fixture $_name: control $_good passes"; else bad "fixture $_name: control $_good FAILED: $(printf '%s' "$out" | head -n 5)"; fi
}

echo "== digest guard"
if (require_digest "alpine:3.20" > /dev/null 2>&1); then bad "a tag-only image reference was accepted"; else pass "a tag-only reference is refused"; fi
if (require_digest "$SHELLCHECK_IMAGE" > /dev/null 2>&1); then pass "a digest-pinned reference is accepted (control)"; else bad "the digest-pinned control was refused"; fi

echo "== fixtures: each tool must fail on its bad file and pass on its control"
fixture shellcheck t_shellcheck bad.sh good.sh 'SC2086'
fixture yamllint t_yamllint bad.yaml good.yaml 'trailing-spaces'
fixture "actionlint (bad workflow)" t_actionlint bad-workflow.yml good-workflow.yml 'runs-on|required'
fixture "yamllint (bad workflow)" t_yamllint bad-workflow.yml good-workflow.yml 'trailing-spaces'
fixture hadolint t_hadolint Dockerfile.bad Dockerfile.good 'DL3006'
fixture "lychee (links and anchors)" t_lychee bad.md good.md 'missing-file|no-such-heading|Cannot find'
fixture "docker compose config" t_compose bad-compose.yaml good-compose.yaml 'imagee|additional properties|invalid'
fixture "node --test" t_nodetest failing.test.mjs passing.test.mjs 'fails on purpose|fail'

echo "== real files"
real shellcheck t_shellcheck '\.sh$'
if [ "$(list '^\.github/workflows/.*\.ya?ml$' | grep -c .)" -eq 0 ]; then echo "SKIP  actionlint: 0 files (.github/workflows/ has no workflow yet; workflows are Milestone 3). The fixture above proves the tool fails on a bad workflow."
else real actionlint t_actionlint '^\.github/workflows/.*\.ya?ml$'; fi
real yamllint t_yamllint '\.ya?ml$'
real hadolint t_hadolint '(^|/)Dockerfile[^/]*$'
real "lychee (internal links and anchors, offline)" t_lychee '\.md$'

# compose: rendered with and without -f compose.yaml must be identical while no override exists, and must be valid either way
if t_compose compose.yaml; then pass "docker compose -f compose.yaml config: valid"; else bad "docker compose -f compose.yaml config failed"; fi
if docker compose config --quiet; then pass "docker compose config (no -f): valid"; else bad "docker compose config (no -f) failed"; fi
docker compose -f compose.yaml config > "$work/with-f.txt" 2>&1; docker compose config > "$work/without-f.txt" 2>&1
if [ -f compose.override.yaml ] || [ -f compose.override.yml ]; then echo "SKIP  with/without -f comparison: a compose.override file exists here (attempt territory), so the two renderings differ by design"
elif cmp -s "$work/with-f.txt" "$work/without-f.txt" && [ -s "$work/with-f.txt" ]; then pass "docker compose config renders identically with and without -f compose.yaml (no override present)"
else bad "docker compose config differs with and without -f compose.yaml"; fi
if out="$(t_nodetest tools/test/*.test.mjs 2>&1)"; then pass "node --test tools/test: $(printf '%s' "$out" | grep -E '^# pass' | tr -d '#')"; else bad "node --test failed:"; printf '%s\n' "$out" | tail -n 30; fi

if [ "$online" -eq 1 ]; then
  echo "== external links (informational: not part of the verdict)"
  files="$(list '\.md$')"
  # shellcheck disable=SC2086
  t_lychee_online $files 2>&1 | tail -n 25 || true
  echo "informational: the external-link run above never changes the exit status"
fi

echo "---"
echo "failed checks: $fail"
exit "$fail"
