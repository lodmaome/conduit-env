#!/bin/sh
# Tests tools/project-guard.sh through tools/reset.sh and tools/dump-state.sh against a FAKE docker on PATH that only logs its argv.
# The real docker is never called: every run asserts that `docker` resolves to the fake first.
# usage: sh tools/test-project-guard.sh        exit status = number of failed checks
set -u
here=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d) || exit 99
case "$T" in ''|/) echo "bad temp dir" >&2; exit 99 ;; esac
trap 'rm -rf "$T"' EXIT INT HUP TERM
mkdir "$T/bin" "$T/mut" "$T/mut/tools"

cat > "$T/bin/docker" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_LOG"
if [ "${1:-}" = compose ] && [ "${2:-}" = config ]; then
  case "$FAKE_MODE" in
    docker) printf 'name: docker\nservices:\n  x:\n    name: not-top-level\n' ;;
    other)  printf 'name: some-other-project\nservices: {}\n' ;;
    empty)  ;;
    fail)   echo "fake docker: config failed" >&2; exit 1 ;;
    multi)  printf 'name: conduit-env\nname: conduit-env\n' ;;
    ok)     printf 'name: conduit-env\nservices:\n  x:\n    name: not-top-level\n' ;;
  esac
  exit 0
fi
case " $* " in *' exec '*) echo "fake output" ;; esac
exit 0
EOF
chmod +x "$T/bin/docker"
PATH="$T/bin:$PATH"
export FAKE_LOG="$T/log"
[ "$(command -v docker)" = "$T/bin/docker" ] || { echo "ABORT: docker is not the fake"; exit 99; }

fails=0
pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }

# run <label> <mode> <script> [args]: runs the script, leaves rc in $rc, stderr in $T/err, calls in $T/log
run() {
  label=$1; FAKE_MODE=$2; export FAKE_MODE; shift 2
  : > "$FAKE_LOG"; : > "$T/err"
  rc=0
  sh "$@" > "$T/out" 2> "$T/err" || rc=$?
}
# refuse <label> <mode> <message regex> <script> [args]
refuse() {
  label=$1; mode=$2; re=$3; shift 3
  run "$label" "$mode" "$@"
  [ "$rc" -eq 1 ] && pass "$label: exit status 1" || fail "$label: exit status $rc, expected 1"
  grep -q -E "$re" "$T/err" && pass "$label: message matches /$re/" || fail "$label: message does not match /$re/ (stderr: $(cat "$T/err"))"
  if grep -q -w down "$FAKE_LOG"; then fail "$label: call log contains down"; else pass "$label: call log has no down"; fi
  if grep -q -w up "$FAKE_LOG"; then fail "$label: call log contains up"; else pass "$label: call log has no up"; fi
  if grep -q -w exec "$FAKE_LOG"; then fail "$label: call log contains exec"; else pass "$label: call log has no exec"; fi
  [ -s "$FAKE_LOG" ] && pass "$label: call log is non-empty (the guard did call docker)" || fail "$label: call log is empty"
}

for s in reset.sh dump-state.sh; do
  arg=""; [ "$s" = dump-state.sh ] && arg="$T/dump-$s"
  refuse "$s name=docker" docker "resolves the project name to 'docker', not 'conduit-env'.*" "$here/$s" $arg
  refuse "$s name=other" other "resolves the project name to 'some-other-project'" "$here/$s" $arg
  refuse "$s empty output" empty "printed no top-level 'name:' line" "$here/$s" $arg
  refuse "$s config exits non-zero" fail "exited 1, so the project name could not be resolved" "$here/$s" $arg
  refuse "$s two name lines" multi "more than one top-level 'name:' line" "$here/$s" $arg
  [ ! -e "$T/dump-$s" ] && pass "$s refusal wrote no output directory" || fail "$s refusal created an output directory"
done
run hint docker "$here/reset.sh"
grep -q 'Unset COMPOSE_PROJECT_NAME' "$T/err" && pass "hint: refusal says what to unset or change" || fail "hint: refusal does not say what to unset or change"

# positive cases
run "reset.sh name=conduit-env" ok "$here/reset.sh"
[ "$rc" -eq 0 ] && pass "positive reset: exit 0" || fail "positive reset: exit $rc (stderr: $(cat "$T/err"))"
grep -q -x 'compose -p conduit-env down -v --remove-orphans' "$FAKE_LOG" && pass "positive reset: down carries -p conduit-env" || fail "positive reset: no 'down -p conduit-env' call in log"
grep -q -x 'compose -p conduit-env up -d --wait' "$FAKE_LOG" && pass "positive reset: up carries -p conduit-env" || fail "positive reset: no 'up -p conduit-env' call in log"
grep -w down "$FAKE_LOG" | grep -q -v -- '-p conduit-env' && fail "positive reset: a down call lacks -p conduit-env" || pass "positive reset: every down call has -p conduit-env"
run "dump-state.sh name=conduit-env" ok "$here/dump-state.sh" "$T/dump-ok"
[ "$rc" -eq 0 ] && pass "positive dump-state: exit 0" || fail "positive dump-state: exit $rc (stderr: $(cat "$T/err"))"
[ -s "$T/dump-ok/schema.txt" ] && pass "positive dump-state: wrote schema.txt" || fail "positive dump-state: no schema.txt"
grep -w exec "$FAKE_LOG" | grep -q -v -- '-p conduit-env' && fail "positive dump-state: an exec call lacks -p conduit-env" || pass "positive dump-state: every exec call has -p conduit-env"

# a relative output directory is resolved against the caller's cwd, not the repo root
mkdir "$T/cwd"
: > "$FAKE_LOG"; FAKE_MODE=ok; export FAKE_MODE
( cd "$T/cwd" && sh "$here/dump-state.sh" rel-out > "$T/out" 2> "$T/err" ) && rc=0 || rc=$?
[ "$rc" -eq 0 ] && pass "relative output dir: exit 0" || fail "relative output dir: exit $rc (stderr: $(cat "$T/err"))"
[ -s "$T/cwd/rel-out/schema.txt" ] && pass "relative output dir: written under the caller's cwd (presence control)" || fail "relative output dir: nothing under the caller's cwd"
[ ! -e "$here/../rel-out" ] && pass "relative output dir: nothing created under the repo root" || fail "relative output dir: created under the repo root"

# mutation: dump-state.sh without the absolute-path line puts the relative directory under its repo root (here a temp tree)
mkdir -p "$T/mut2/tools"; cp "$here/project-guard.sh" "$T/mut2/tools/"
grep -v '^case "\$out" in' "$here/dump-state.sh" > "$T/mut2/tools/dump-state.sh"
cmp -s "$here/dump-state.sh" "$T/mut2/tools/dump-state.sh" && fail "mutation 2 did not change dump-state.sh" || pass "mutation 2 applied: absolute-path line removed"
[ "$(command -v docker)" = "$T/bin/docker" ] || { echo "ABORT: docker is not the fake before running mutant 2"; exit 99; }
( cd "$T/cwd" && sh "$T/mut2/tools/dump-state.sh" rel-out2 > "$T/out" 2> "$T/err" ) || true
if [ -s "$T/mut2/rel-out2/schema.txt" ] && [ ! -e "$T/cwd/rel-out2" ]; then pass "mutant 2: output lands under its repo root, so the relative-dir test detects the missing line"; else fail "mutant 2: relative-dir test could not detect the missing line"; fi

# mutation: reset.sh with the guard call removed, against the fake only, in a temp tree
cp "$here/reset.sh" "$T/mut/tools/reset.sh"; cp "$here/project-guard.sh" "$T/mut/tools/project-guard.sh"
before=$(wc -l < "$T/mut/tools/reset.sh")
grep -v 'require_project ||' "$T/mut/tools/reset.sh" > "$T/mut/tools/reset.sh.new" && mv "$T/mut/tools/reset.sh.new" "$T/mut/tools/reset.sh"
after=$(wc -l < "$T/mut/tools/reset.sh")
[ "$after" -eq $((before - 1)) ] && pass "mutation applied: guard line removed (reset.sh $before -> $after lines)" || fail "mutation did not remove exactly one line"
[ "$(command -v docker)" = "$T/bin/docker" ] || { echo "ABORT: docker is not the fake before running the mutant"; exit 99; }
run "mutant reset.sh (no guard) name=docker" docker "$T/mut/tools/reset.sh"
if grep -q -w down "$FAKE_LOG"; then pass "mutant: call log shows down, so the refusal tests would detect a missing guard"; else fail "mutant: no down in log, the refusal tests cannot detect a missing guard"; fi

echo "failed checks: $fails"
exit "$fails"
