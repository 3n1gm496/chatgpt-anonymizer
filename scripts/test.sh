#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

MODE="${1:-all}"

if [[ ! -x "$PYTHON_BIN" || ! -f "$REPO_ROOT/node_modules/.modules.yaml" ]]; then
  fail "Dipendenze mancanti. Esegui prima ./scripts/bootstrap.sh"
fi

run_unit_suite() {
  log_note "Esecuzione test contracts"
  pnpm_cmd --filter @chatgpt-anonymizer/contracts test

  log_note "Esecuzione test extension"
  pnpm_cmd --filter @chatgpt-anonymizer/extension test

  log_note "Esecuzione test engine (unit + integration)"
  (
    cd "$REPO_ROOT/services/local-engine"
    PYTHONPATH=src "$PYTHON_BIN" -m pytest tests/unit tests/integration -q
  )
}

case "$MODE" in
  unit)
    run_unit_suite
    ;;
  e2e)
    log_note "Esecuzione test e2e"
    install_playwright_browsers_if_missing
    pnpm_cmd --filter @chatgpt-anonymizer/e2e test
    ;;
  all)
    run_unit_suite
    log_note "Esecuzione test e2e"
    install_playwright_browsers_if_missing
    pnpm_cmd --filter @chatgpt-anonymizer/e2e test
    ;;
  *)
    fail "Modalita non supportata per test.sh: $MODE. Usa all, unit oppure e2e."
    ;;
esac
