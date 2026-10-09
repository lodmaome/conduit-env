# Gate fixtures

Each tool of `tools/gate.sh` has a failing fixture (`bad*`, `failing*`) that must make it fail and a clean control (`good*`, `passing*`) that must pass.
These files are broken ON PURPOSE. They are excluded from every real file list of the gate, and the gate prints that exclusion.
