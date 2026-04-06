# Troubleshooting

## `bootstrap.sh` fails on Node or pnpm

- confirm `npm` is installed
- confirm `python3 --version` is at least `3.12`
- remove partial `.tooling/` directories and rerun bootstrap if a download was interrupted

## Engine health check fails

- verify the engine process is running
- run `curl -s http://127.0.0.1:8765/health`
- confirm the extension options still point to `http://127.0.0.1:<port>`

## Paste non anonimizza (il testo resta originale nel composer)

Questa era la regressione principale del prodotto — ora corretta con la strategia paste-first.

Se il testo incollato non viene sostituito con i placeholder:

1. Verificare che il motore locale sia avviato e risponda su `http://127.0.0.1:8765/health`
2. Se il motore è giù, l'extension mostra un errore esplicito nello status pill (non passerà silenziosamente)
3. Se lo status pill non appare affatto, l'extension potrebbe non essere attiva: verificare `chrome://extensions` e ricaricare la pagina
4. Se appare "Il campo di testo non è stato trovato", il DOM di ChatGPT è cambiato: aggiornare l'extension o ricaricare la pagina
5. Verificare che l'extension sia caricata dalla cartella corretta (`apps/extension/.output/chrome-mv3/`)

Nota: con la strategia paste-first, ogni paste di testo ordinario genera una chiamata `/sanitize` visibile. Se il testo non cambia dopo il paste, il motore ha risposto ma non ha trovato dati sensibili (nessuna sostituzione applicata). Questo è comportamento corretto.

## Submit stays blocked

- confirm the protected portion of the prompt still matches the last sanitized content
- confirm the new text you added is actually risky and not just harmless notes or ticket text
- confirm the engine is reachable if the prompt needs a new local check
- if you pasted a new risky fragment, rerun sanitization only for that fragment

## Review drawer behaves unexpectedly

- rerun sanitization so the review draft is recreated from a clean original-text baseline
- confirm the current session was not reset or expired

## Rehydration does not show originals

- confirm the assistant response still contains placeholders for the current session
- confirm response rehydration is enabled in options
- remember that code blocks and complex markdown are only conservatively supported

## Python integration tests fail to import FastAPI or pytest plugins

- activate `.venv/`
- reinstall engine development dependencies:

```bash
./.venv/bin/python -m pip install -e "./services/local-engine[dev]"
```

## Playwright e2e fails to launch Chromium on Linux sandboxed environments

- if Chromium exits with sandbox or Crashpad errors, retry with:

```bash
PLAYWRIGHT_BROWSER=firefox ./scripts/test.sh e2e
```

- confirm the required browser binaries exist under `~/.cache/ms-playwright/`
- prefer running e2e in CI or in an unsandboxed local shell when browser automation is heavily restricted
- keep Chromium as the default CI browser unless there is a verified product-level compatibility issue

## Manual browser validation issues

### Extension not visible on `chatgpt.com`

- verify the extension is enabled in `chrome://extensions`
- verify you loaded `apps/extension/.output/chrome-mv3/`, not the parent folder
- refresh `chatgpt.com` after loading or rebuilding the extension
- if you are on Windows 11 + WSL, reload the extension from the `\\wsl$\\...` path printed by `./scripts/manual-browser-test.sh start`

### Engine unreachable

- run `curl -s http://127.0.0.1:8765/health`
- if the helper started the engine, inspect:

```bash
tail -n 60 .manual-browser-test/local-engine.log
```

- verify the options page still points to `http://127.0.0.1:8765`
- if Chrome on Windows cannot reach a WSL-hosted engine, verify WSL localhost forwarding is working on the host

### Popup shows the wrong status

- reopen the popup after the engine finishes starting
- check the configured endpoint shown in the popup
- use the reset action and reload the ChatGPT tab if the page context looks stale

### Submit is not blocked when it should be

- verify the engine is actually down before retesting the submit guard
- verify the composer was changed after sanitization and not before it
- capture popup state, on-page status, and the exact step order; this is a blocker for the pilot if reproducible

### Composer not detected

- refresh the ChatGPT page after loading the extension
- verify you are on a normal text composer flow, not a browser or ChatGPT UI experiment that hides the standard composer
- if ChatGPT markup changed, capture the page variant and treat it as a DOM-adapter compatibility issue

### Extension build exists but is not loadable

- rebuild with:

```bash
pnpm build:extension:dev
```

- verify `apps/extension/.output/chrome-mv3/manifest.json` exists
- ensure you selected the unpacked directory itself, not the zip file

### Mismatch between configured engine URL and actual engine URL

- open the options page and compare the configured URL with the engine URL printed by `./scripts/manual-browser-test.sh status`
- the supported configuration remains only `http://127.0.0.1:<port>`
- if you changed the port, rerun the helper with the same `ENGINE_PORT`

### Browser-specific issues

- Chrome or Edge on Windows should load the unpacked extension from the WSL UNC path if the repo is inside WSL
- if a Chromium-based browser caches an older unpacked build, remove and reload the extension
- if Firefox is used for local validation, remember the pilot baseline remains Chromium-based even if a fallback check is useful
