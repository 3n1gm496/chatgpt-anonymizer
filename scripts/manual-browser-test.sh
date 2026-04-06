#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib/toolchain.sh
source "$SCRIPT_DIR/lib/toolchain.sh"

COMMAND="${1:-start}"
ENGINE_PORT="${ENGINE_PORT:-8765}"
ENGINE_URL="http://127.0.0.1:${ENGINE_PORT}"
MANUAL_STATE_DIR="$REPO_ROOT/.manual-browser-test"
ENGINE_PID_FILE="$MANUAL_STATE_DIR/local-engine.pid"
ENGINE_LOG_FILE="$MANUAL_STATE_DIR/local-engine.log"
ENGINE_DATA_DIR="$REPO_ROOT/services/local-engine/.engine-state"
EXTENSION_DIR="$REPO_ROOT/apps/extension/.output/chrome-mv3"
EXTENSION_ZIP="$REPO_ROOT/apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip"

usage() {
  cat <<EOF
Uso: ./scripts/manual-browser-test.sh [start|status|stop]

Comandi:
  start   Verifica prerequisiti, avvia il local engine e builda l'estensione unpacked
  status  Mostra stato engine, path artefatti e hint per il browser reale
  stop    Ferma il local engine avviato da questo script

Variabili supportate:
  ENGINE_PORT=<porta>   default: 8765
EOF
}

require_manual_validation_prerequisites() {
  require_command curl "Installa curl per eseguire health check locali."
  ensure_local_node_runtime
  ensure_local_pnpm
  ensure_python_venv

  if [[ ! -f "$REPO_ROOT/node_modules/.modules.yaml" ]]; then
    fail "Dipendenze workspace mancanti. Esegui prima ./scripts/bootstrap.sh"
  fi
}

cleanup_stale_pid_file() {
  if [[ ! -f "$ENGINE_PID_FILE" ]]; then
    return
  fi

  local pid
  pid="$(cat "$ENGINE_PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]] || ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$ENGINE_PID_FILE"
  fi
}

engine_healthcheck() {
  curl -fsS "$ENGINE_URL/health" >/dev/null 2>&1
}

wait_for_engine_health() {
  local attempt
  for attempt in $(seq 1 20); do
    if engine_healthcheck; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_engine_if_needed() {
  mkdir -p "$MANUAL_STATE_DIR"
  cleanup_stale_pid_file

  if engine_healthcheck; then
    log_note "Local engine gia raggiungibile su $ENGINE_URL"
    return
  fi

  log_note "Avvio local engine su $ENGINE_URL"
  if command -v setsid >/dev/null 2>&1; then
    env PYTHONPATH="$REPO_ROOT/services/local-engine/src" \
      setsid "$PYTHON_BIN" -m local_engine.main \
      --port "$ENGINE_PORT" \
      --data-dir "$ENGINE_DATA_DIR" \
      >"$ENGINE_LOG_FILE" 2>&1 < /dev/null &
  else
    nohup env PYTHONPATH="$REPO_ROOT/services/local-engine/src" \
      "$PYTHON_BIN" -m local_engine.main \
      --port "$ENGINE_PORT" \
      --data-dir "$ENGINE_DATA_DIR" \
      >"$ENGINE_LOG_FILE" 2>&1 < /dev/null &
  fi

  local engine_pid
  engine_pid="$!"
  disown "$engine_pid" >/dev/null 2>&1 || true
  printf '%s\n' "$engine_pid" >"$ENGINE_PID_FILE"

  if ! wait_for_engine_health; then
    if engine_healthcheck; then
      log_note "Local engine raggiungibile dopo il bootstrap; continuo con la validazione manuale."
      if ! kill -0 "$engine_pid" >/dev/null 2>&1; then
        rm -f "$ENGINE_PID_FILE"
      fi
      return 0
    fi
    printf '\n[chatgpt-anonymizer] Ultime righe log engine:\n' >&2
    tail -n 40 "$ENGINE_LOG_FILE" >&2 || true
    rm -f "$ENGINE_PID_FILE"
    return 1
  fi

  return 0
}

build_manual_extension() {
  log_note "Build extension unpacked per test browser reale"
  pnpm_cmd --filter @chatgpt-anonymizer/extension build:prod
}

print_browser_hints() {
  local browser_commands
  browser_commands="$(detect_local_browser_commands || true)"
  if [[ -n "$browser_commands" ]]; then
    printf 'Browser rilevati in questo ambiente:\n'
    printf '%s\n' "$browser_commands" | sed 's/^/  - /'
  fi

  if is_wsl_environment && [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    printf 'Path Windows 11 / Chrome (WSL UNC):\n'
    printf '  %s\n' "$(to_wsl_unc_path "$EXTENSION_DIR")"
  fi
}

print_manual_next_steps() {
  printf '\nManual browser validation ready.\n'
  printf 'Engine URL:\n'
  printf '  %s\n' "$ENGINE_URL"
  printf 'Unpacked extension path:\n'
  printf '  %s\n' "$EXTENSION_DIR"
  if [[ -f "$EXTENSION_ZIP" ]]; then
    printf 'Signed-release candidate zip (se gia generato):\n'
    printf '  %s\n' "$EXTENSION_ZIP"
  fi
  printf 'Engine log:\n'
  printf '  %s\n' "$ENGINE_LOG_FILE"
  printf 'Stop command:\n'
  printf '  ./scripts/manual-browser-test.sh stop\n'
  print_browser_hints
  printf '\nPassi manuali successivi:\n'
  printf '  1. Apri chrome://extensions\n'
  printf '  2. Abilita Developer mode\n'
  printf '  3. Seleziona "Load unpacked"\n'
  printf '  4. Carica la cartella stampata sopra\n'
  printf '  5. Apri l options page o il popup e verifica endpoint = %s\n' "$ENGINE_URL"
  printf '  6. Apri https://chatgpt.com/ e prova i flussi in docs/development/MANUAL_BROWSER_VALIDATION.md\n'
  printf '\nHealth check manuale:\n'
  printf '  curl -s %s/health\n' "$ENGINE_URL"
}

print_engine_start_fallback() {
  printf '\nExtension build pronta, ma il local engine non e rimasto attivo abbastanza da superare il health check.\n' >&2
  printf 'Percorso estensione unpacked:\n' >&2
  printf '  %s\n' "$EXTENSION_DIR" >&2
  if is_wsl_environment && [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    printf 'Path Windows 11 / Chrome (WSL UNC):\n' >&2
    printf '  %s\n' "$(to_wsl_unc_path "$EXTENSION_DIR")" >&2
  fi
  printf 'Avvio alternativo engine in terminale dedicato:\n' >&2
  printf '  pnpm dev:engine\n' >&2
  printf 'Oppure:\n' >&2
  printf '  chatgpt-anonymizer-engine --port %s\n' "$ENGINE_PORT" >&2
  printf 'Dopo l avvio, verifica con:\n' >&2
  printf '  curl -s %s/health\n' "$ENGINE_URL" >&2
}

show_status() {
  require_manual_validation_prerequisites
  cleanup_stale_pid_file
  print_toolchain_summary
  printf 'Engine URL: %s\n' "$ENGINE_URL"
  if engine_healthcheck; then
    printf 'Engine health: reachable\n'
  else
    printf 'Engine health: unreachable\n'
  fi
  if [[ -f "$ENGINE_PID_FILE" ]]; then
    printf 'Engine PID file: %s (pid=%s)\n' "$ENGINE_PID_FILE" "$(cat "$ENGINE_PID_FILE")"
  else
    printf 'Engine PID file: none managed by this script\n'
  fi
  printf 'Unpacked extension path: %s\n' "$EXTENSION_DIR"
  if [[ -d "$EXTENSION_DIR" ]]; then
    printf 'Extension build: present\n'
  else
    printf 'Extension build: missing\n'
  fi
  print_browser_hints
}

stop_engine() {
  cleanup_stale_pid_file
  if [[ ! -f "$ENGINE_PID_FILE" ]]; then
    if engine_healthcheck; then
      fail "Il local engine e raggiungibile, ma non e gestito da questo script. Fermalo manualmente."
    fi
    log_note "Nessun local engine gestito da questo script da fermare."
    return
  fi

  local pid
  pid="$(cat "$ENGINE_PID_FILE")"
  log_note "Arresto local engine (pid=$pid)"
  kill "$pid" >/dev/null 2>&1 || true
  rm -f "$ENGINE_PID_FILE"
}

case "$COMMAND" in
  start)
    require_manual_validation_prerequisites
    build_manual_extension
    if ! start_engine_if_needed; then
      print_engine_start_fallback
      fail "Il local engine non ha risposto su $ENGINE_URL"
    fi
    print_manual_next_steps
    ;;
  status)
    show_status
    ;;
  stop)
    stop_engine
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    fail "Comando non supportato: $COMMAND"
    ;;
esac
