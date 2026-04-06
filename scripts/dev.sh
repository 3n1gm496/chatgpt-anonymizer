#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

if [[ ! -x "$PYTHON_BIN" || ! -f "$REPO_ROOT/node_modules/.modules.yaml" ]]; then
  fail "Dipendenze mancanti. Esegui prima ./scripts/bootstrap.sh"
fi

trap 'kill 0 >/dev/null 2>&1 || true' EXIT

log_note "Avvio local engine su 127.0.0.1:8765"

(
  cd "$REPO_ROOT/services/local-engine"
  PYTHONPATH=src "$PYTHON_BIN" -m local_engine.main
) &

log_note "Avvio extension WXT in modalita sviluppo"
pnpm_cmd --filter @chatgpt-anonymizer/extension dev &

wait
