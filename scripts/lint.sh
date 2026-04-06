#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

if [[ ! -x "$PYTHON_BIN" || ! -f "$REPO_ROOT/node_modules/.modules.yaml" ]]; then
  fail "Dipendenze mancanti. Esegui prima ./scripts/bootstrap.sh"
fi

log_note "Lint TypeScript"
pnpm_cmd lint:ts

log_note "Controllo formattazione"
pnpm_cmd format:check

log_note "Lint Python"
(
  cd "$REPO_ROOT/services/local-engine"
  "$PYTHON_BIN" -m ruff check .
)
