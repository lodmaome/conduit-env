#!/bin/sh
# Reset the environment to its empty initial state and boot it.
# Removes the stack's containers, its network and the database volume (all data in it is lost), then starts
# db -> migrate -> api -> frontend and waits until everything is healthy. Builds the images first if they are missing.
# Needs a running Docker engine; it never starts or stops Docker Desktop.
set -eu
cd "$(dirname "$0")/.."
docker compose down -v --remove-orphans
docker compose up -d --wait
