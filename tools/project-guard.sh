#!/bin/sh
# Sourced (not executed) by tools/reset.sh and tools/dump-state.sh.
# Refuses to go on unless Compose resolves the project name to exactly "conduit-env".
#
# Why: Compose picks the project name with this precedence, and `name:` in compose.yaml comes LAST (measured 2026-10-09,
# docs/env/adr/0001 section 4 and the guard section of ADR 0002): -p, then COMPOSE_PROJECT_NAME in the environment, then
# COMPOSE_PROJECT_NAME in a root .env, then a top-level `name:` in a merged file (an override can change it), then compose.yaml's own
# `name: conduit-env`. So `COMPOSE_PROJECT_NAME=docker sh tools/reset.sh` would otherwise run `down -v` against another project.
#
# The check calls `docker compose config` with the caller's cwd, environment and (auto-loaded) files, which is what the commands
# that follow will see. Fail closed: a non-zero exit, empty output, no `name:` line or more than one all refuse.
PROJECT=conduit-env

require_project() {
  _rc=0
  _cfg=$(docker compose config) || _rc=$?
  if [ "$_rc" -ne 0 ]; then
    echo "refusing: 'docker compose config' exited $_rc, so the project name could not be resolved (expected $PROJECT)." >&2
    return 1
  fi
  _names=$(printf '%s\n' "$_cfg" | tr -d '\r' | sed -n 's/^name: //p')
  case "$_names" in
    '')
      echo "refusing: 'docker compose config' printed no top-level 'name:' line, so the project name could not be resolved (expected $PROJECT)." >&2
      return 1 ;;
    *'
'*)
      echo "refusing: 'docker compose config' printed more than one top-level 'name:' line; cannot tell which project this is (expected $PROJECT)." >&2
      return 1 ;;
  esac
  if [ "$_names" != "$PROJECT" ]; then
    echo "refusing: Compose resolves the project name to '$_names', not '$PROJECT'; this would act on another project's containers and volumes." >&2
    echo "  Unset COMPOSE_PROJECT_NAME in the environment, remove it from a root .env, or remove a top-level 'name:' from compose.override.yaml, then run again." >&2
    return 1
  fi
  return 0
}
