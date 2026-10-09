#!/bin/sh
# Writes docs/env/third-party/python-licences.txt: the licence metadata of every package in env/backend/requirements.lock.txt, as installed in the
# running api container (Python stdlib importlib.metadata through `docker compose exec`). Deterministic: packages sorted by name, no timestamps.
# The first line names the sha256 of the requirements lock the listing was generated from; release-gate check 13 compares it with the current lock.
# The listing is metadata as the packages declare it (License, License-Expression, "License ::" classifiers and the first line of each bundled
# licence file). It is a starting point for reading the licence files, not a legal opinion.
# usage: sh tools/python-licences.sh      needs the stack running and built from the pinned lock; writes only the output file.
set -eu
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" || exit 90
[ -f compose.yaml ] && [ -f env/OWNED.txt ] || { echo "refusing: $root is not the conduit-env repository root"; exit 90; }
. ./env/pins.env

running="$(docker compose -f compose.yaml -p conduit-env ps api --format '{{.Image}}')"
if [ "$running" != "conduit-env/backend:$BACKEND_SHA" ]; then
  echo "refusing: the running api image is '$running', not conduit-env/backend:$BACKEND_SHA"; exit 1
fi

names="$(grep -E '^[A-Za-z0-9_.-]+==' env/backend/requirements.lock.txt | cut -d= -f1 | LC_ALL=C sort | tr '\n' ' ')"
count="$(printf '%s' "$names" | wc -w | tr -d ' ')"
out="docs/env/third-party/python-licences.txt"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

code='
import sys
from importlib import metadata

def norm(n):
    return n.lower().replace("_", "-").replace(".", "-")

wanted = sorted(sys.argv[1:], key=norm)
installed = {norm(d.metadata["Name"]): d for d in metadata.distributions()}
for name in wanted:
    d = installed.get(norm(name))
    if d is None:
        print(f"{name} | NOT INSTALLED in the image")
        continue
    m = d.metadata
    lic = (m.get("License") or "").strip().replace("\n", " ")
    if len(lic) > 80:
        lic = "(long text, see file) " + lic[:60]
    expr = m.get("License-Expression") or ""
    cls = "; ".join(sorted(c.split("::")[-1].strip() for c in (m.get_all("Classifier") or []) if c.startswith("License ::")))
    files = []
    for f in sorted(m.get_all("License-File") or []):
        first = ""
        for cand in d.files or []:
            if str(cand).endswith(f):
                try:
                    first = next((l.strip() for l in cand.read_text().splitlines() if l.strip()), "")
                except Exception as e:
                    first = f"(unreadable: {e})"
                break
        files.append(f"{f}: {first[:60]}")
    nm = m["Name"]
    fl = " || ".join(files) or "-"
    print(nm + " " + d.version + " | License: " + (lic or "-") + " | Expression: " + (expr or "-") + " | Classifiers: " + (cls or "-") + " | Files: " + fl)
extra = sorted(n for n in installed if n not in {norm(w) for w in wanted})
print("installed but not in the lock: " + (", ".join(installed[n].metadata["Name"] + " " + installed[n].version for n in extra) or "none"))
'

{
  sh tools/lock-hashes.sh | sed -n 1,2p
  echo "packages-in-lock: $count"
  echo "generated-by: tools/python-licences.sh (importlib.metadata in the api container; metadata as declared by each package)"
  echo
  # shellcheck disable=SC2086  # $names is a space-separated list of package names without spaces
  docker compose -f compose.yaml -p conduit-env exec -T api python -c "$code" $names
} > "$tmp"
mkdir -p docs/env/third-party
cp "$tmp" "$out"
echo "wrote $out ($(grep -c ' | ' "$out") package lines)"
