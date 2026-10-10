# ADR 0004: Milestone 3 decisions

- **Status:** draft, sections are added as each stage lands.
- **Date:** 2026-10-09
- **Decider:** lodmaome. Drafted with AI assistance (Claude).
- **Evidence:** outside the repository, in `C:\git\conduit-env-evidence\m3-evidence\` (cited by name only).

## 1. Release check 16: a scan of every reachable commit

**Why.** The earlier secret check (11) reads the tree. A secret that an old commit held and a later commit removed is invisible to it and still public once the history is pushed. Pushing makes the history public-readable the day the repository is made public, so the history is scanned first.
**What it scans** (`tools/lib/history-scan.mjs`, `git log -p --all`, every added line of every reachable commit; every commit message; every path ever touched; the 50 largest blobs): JWT-shaped strings, `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` and `github_pat_` tokens, AWS access key ids, private key blocks, credential assignments and URL credentials other than the documented local database password `0000` (exempt by value, as in check 11),
and files that should never be public (`.tar`, `.tgz`, `.zip`, `.gz`, `.7z`, `.dump`, `.sql`, `.sqlite`, `.har`, `.pem`, `.p12`, `.pfx`, a root `.env`, anything inside a folder named `*-evidence`) and any blob over 1 MB. The gate's own two fixture files are exempt, as in check 11. Findings name the kind, the short commit and the path, never the matched text.
**Local mode** (`node tools/release-gate.mjs env-vN --local`) also looks for this machine's Windows user name (derived at run time from `os.userInfo()`, never written into a tracked file; whole-word and case-insensitive, so a longer name that merely starts with it does not match) and for Windows home-directory paths as findings, and lists `C:\git\...` paths as information (the documents cite the evidence folder on purpose).
**Tests** (`m3-evidence\s0\selftest-check16.txt`, seen): the golden control passes; seven failing fixtures (a token in an old commit, a non-documented password in an old commit, a tar, an evidence folder, a 5 MB blob, the user name, a Windows home-directory path); a presence control inside the check (a probe token in a probe "old commit" and a probe tar path must be found, or the check refuses to pass);
and a real throwaway repository whose old commit holds a fake token (built at run time) that a later commit removed: the HEAD tree is clean, the history scan finds the token, normal mode does not report the user name, local mode does.
**Result on the real history** (`m3-evidence\s0\release-gate-normal.txt`, `release-gate-local.txt`, seen): 40 commits, 173 path entries, no finding; the largest blob is 61,150 bytes; local mode: no finding, 13 information lines about `C:\git\...` paths. Not rewriting history was not needed.
