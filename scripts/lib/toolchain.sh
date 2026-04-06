#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOLCHAIN_DIR="${TOOLCHAIN_DIR:-$REPO_ROOT/.tooling}"
VENV_DIR="${VENV_DIR:-$REPO_ROOT/.venv}"

LOCAL_NODE_VERSION="${LOCAL_NODE_VERSION:-20.19.0}"
LOCAL_PNPM_VERSION="${LOCAL_PNPM_VERSION:-9.15.0}"

NODE_PREFIX="$TOOLCHAIN_DIR/node20"
NODE_BIN="$NODE_PREFIX/node_modules/node/bin/node"
NODE_HOME="$(dirname "$NODE_BIN")"
PNPM_PREFIX="$TOOLCHAIN_DIR/pnpm"
PNPM_CLI="$PNPM_PREFIX/node_modules/pnpm/bin/pnpm.cjs"

PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"

log_note() {
  printf '[chatgpt-anonymizer] %s\n' "$*"
}

fail() {
  printf '[chatgpt-anonymizer] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  local command_name="$1"
  local install_hint="$2"
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name non trovato. $install_hint"
}

require_python_312() {
  require_command python3 "Installa Python 3.12 o superiore prima di eseguire gli script."
  python3 - <<'PY' || fail "Python 3.12 o superiore richiesto."
import sys
raise SystemExit(0 if sys.version_info >= (3, 12) else 1)
PY
}

ensure_local_node_runtime() {
  if [[ -x "$NODE_BIN" ]]; then
    return
  fi

  require_command npm "Installa un runtime Node.js con npm disponibile per bootstrap iniziale."
  mkdir -p "$NODE_PREFIX"
  log_note "Installazione runtime Node $LOCAL_NODE_VERSION in $NODE_PREFIX"
  npm install "node@$LOCAL_NODE_VERSION" --prefix "$NODE_PREFIX"
}

ensure_local_pnpm() {
  if [[ -x "$PNPM_CLI" ]]; then
    return
  fi

  require_command npm "Installa un runtime Node.js con npm disponibile per bootstrap iniziale."
  mkdir -p "$PNPM_PREFIX"
  log_note "Installazione pnpm $LOCAL_PNPM_VERSION in $PNPM_PREFIX"
  npm install "pnpm@$LOCAL_PNPM_VERSION" --prefix "$PNPM_PREFIX"
}

activate_local_node() {
  ensure_local_node_runtime
  ensure_local_pnpm
  export PATH="$NODE_HOME:$REPO_ROOT/node_modules/.bin:$PATH"
  export npm_config_user_agent="chatgpt-anonymizer-local-toolchain"
}

pnpm_cmd() {
  activate_local_node
  "$NODE_BIN" "$PNPM_CLI" "$@"
}

ensure_python_venv() {
  require_python_312
  if [[ -x "$PYTHON_BIN" ]]; then
    return
  fi

  log_note "Creazione virtualenv Python in $VENV_DIR"
  python3 -m venv "$VENV_DIR"
}

pip_cmd() {
  ensure_python_venv
  "$PYTHON_BIN" -m pip "$@"
}

install_workspace_dependencies() {
  ensure_local_node_runtime
  ensure_local_pnpm
  if [[ -f "$REPO_ROOT/pnpm-lock.yaml" ]]; then
    pnpm_cmd install --frozen-lockfile
    return
  fi
  pnpm_cmd install
}

install_engine_dependencies() {
  ensure_python_venv
  pip_cmd install --upgrade pip wheel build
  pip_cmd install -e "$REPO_ROOT/services/local-engine[dev]"
}

install_playwright_browsers_if_missing() {
  activate_local_node
  local playwright_browser
  local browser_module
  local install_target
  local expected_browser_path
  playwright_browser="${PLAYWRIGHT_BROWSER:-chromium}"

  case "$playwright_browser" in
    firefox)
      browser_module="firefox"
      install_target="firefox"
      ;;
    *)
      browser_module="chromium"
      install_target="chromium"
      ;;
  esac

  expected_browser_path="$(
    cd "$REPO_ROOT" &&
      "$NODE_BIN" -e "const { ${browser_module} } = require('@playwright/test'); process.stdout.write(${browser_module}.executablePath());"
  )"

  if [[ -n "$expected_browser_path" && -x "$expected_browser_path" ]]; then
    return
  fi

  log_note "Installazione browser Playwright richiesti dal lockfile corrente ($install_target)"
  pnpm_cmd exec playwright install "$install_target"
}

print_toolchain_summary() {
  ensure_local_node_runtime
  ensure_local_pnpm
  ensure_python_venv
  log_note "Node: $("$NODE_BIN" -v)"
  log_note "pnpm: $(pnpm_cmd -v)"
  log_note "Python: $("$PYTHON_BIN" --version)"
}

is_wsl_environment() {
  if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    return 0
  fi
  grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null
}

detect_local_browser_commands() {
  local candidate
  for candidate in \
    google-chrome \
    google-chrome-stable \
    chromium \
    chromium-browser \
    microsoft-edge \
    microsoft-edge-stable
  do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
    fi
  done
}

to_wsl_unc_path() {
  local linux_path="$1"
  local distro_name="${WSL_DISTRO_NAME:-}"
  if [[ -z "$distro_name" ]]; then
    return 1
  fi

  local windows_path
  windows_path="${linux_path//\//\\}"
  printf '\\\\wsl$\\%s%s\n' "$distro_name" "$windows_path"
}
