#!/bin/sh
# Reset the environment to its empty initial state and boot it.
# Removes the stack's containers, its network and the database volume (all data in it is lost), then starts
# db -> migrate -> api -> frontend and waits until everything is healthy. Builds the images first if they are missing.
# Needs a running Docker engine; it never starts or stops Docker Desktop.
# Refuses unless Compose resolves the project name to exactly conduit-env (tools/project-guard.sh), and passes -p on both commands.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=project-guard.sh
. "$here/project-guard.sh"
cd "$here/.."
require_project || exit 1
echo "reset: project $PROJECT: down -v --remove-orphans (deletes its database volume), then up -d --wait"
docker compose -p "$PROJECT" down -v --remove-orphans
docker compose -p "$PROJECT" up -d --wait
