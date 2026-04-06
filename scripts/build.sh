#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

TARGET="${1:-all}"

if [[ ! -x "$PYTHON_BIN" || ! -f "$REPO_ROOT/node_modules/.modules.yaml" ]]; then
  fail "Dipendenze mancanti. Esegui prima ./scripts/bootstrap.sh"
fi

build_contracts() {
  log_note "Build contracts"
  pnpm_cmd --filter @chatgpt-anonymizer/contracts build
}

build_extension_dev() {
  log_note "Build extension (development)"
  pnpm_cmd --filter @chatgpt-anonymizer/extension build:dev
}

build_extension_prod() {
  log_note "Build extension (production)"
  pnpm_cmd --filter @chatgpt-anonymizer/extension build:prod
}

package_extension_zip() {
  log_note "Packaging extension ZIP"
  rm -f "$REPO_ROOT/apps/extension/.output/"*.zip
  pnpm_cmd --filter @chatgpt-anonymizer/extension package
}

build_engine_package() {
  log_note "Build local engine wheel/sdist"
  rm -rf "$REPO_ROOT/services/local-engine/dist"
  "$PYTHON_BIN" -m build --no-isolation "$REPO_ROOT/services/local-engine" --outdir "$REPO_ROOT/services/local-engine/dist"
}

case "$TARGET" in
  contracts)
    build_contracts
    ;;
  extension)
    build_contracts
    build_extension_prod
    ;;
  extension:dev)
    build_contracts
    build_extension_dev
    ;;
  extension:zip)
    build_contracts
    package_extension_zip
    ;;
  engine)
    build_engine_package
    ;;
  all)
    build_contracts
    build_extension_prod
    build_engine_package
    ;;
  *)
    fail "Target build non supportato: $TARGET"
    ;;
esac
