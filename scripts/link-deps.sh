#!/usr/bin/env bash
# Link the pi SDK packages into a project-local node_modules so the standalone
# check scripts (checks/*.mjs) can resolve
# `@earendil-works/*` and `typebox`. These resolve from the globally installed
# pi package; nothing is copied. Safe to re-run.
set -euo pipefail

GLOBAL_NM="$(npm root -g)"
PKG="$GLOBAL_NM/@earendil-works/pi-coding-agent"

if [ ! -d "$PKG" ]; then
  echo "error: pi is not installed globally (looked in $PKG)." >&2
  echo "Install pi first: https://pi.dev" >&2
  exit 1
fi

mkdir -p node_modules/@earendil-works
ln -sfn "$PKG"                                        node_modules/@earendil-works/pi-coding-agent
ln -sfn "$PKG/node_modules/@earendil-works/pi-ai"         node_modules/@earendil-works/pi-ai
ln -sfn "$PKG/node_modules/@earendil-works/pi-agent-core" node_modules/@earendil-works/pi-agent-core
ln -sfn "$PKG/node_modules/@earendil-works/pi-tui"        node_modules/@earendil-works/pi-tui
ln -sfn "$PKG/node_modules/typebox"                       node_modules/typebox
ln -sfn "$PKG/node_modules/yaml"                          node_modules/yaml

echo "Linked pi SDK packages into ./node_modules (from $PKG)."
