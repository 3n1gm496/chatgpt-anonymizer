#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

install_workspace_dependencies
install_engine_dependencies
install_playwright_browsers_if_missing
print_toolchain_summary
log_note "Bootstrap completato."
