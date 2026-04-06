# Runbook

## Standard Local Start

1. Run `./scripts/bootstrap.sh`.
2. Start the engine with `pnpm dev:engine`.
3. Start the extension with `pnpm dev:extension`.
4. Load the unpacked extension from `apps/extension/.output/chrome-mv3/` in a Chromium-based browser.
5. Open `chatgpt.com` and paste synthetic test data into the composer.

## Health Checks

- engine health:

```bash
curl -s http://127.0.0.1:8765/health
```

- unit/integration suite:

```bash
pnpm test:unit
```

- full suite:

```bash
pnpm test
```

## Manual Smoke Checks

- paste sanitize success on a current ChatGPT page
- submit still allowed for an unchanged protected prompt even if the engine is down
- submit blocked when the engine is down and the protected prompt needs a new check
- submit blocked after meaningful risky edits post-sanitization, but not after harmless additions
- low-confidence review drawer opens and applies decisions
- response rehydration toggles on/off without corrupting the response DOM
- popup shows engine state and current session metadata

## Safe Operational Checks

- engine must bind only to `127.0.0.1`
- logs must not contain raw clipboard text, sanitized full text, or decrypted mappings
- extension settings must keep the engine URL on `http://127.0.0.1:<port>`
- clear local sessions from the popup after manual testing if mappings are no longer needed

## Paste-First Robusta — Active Behavior

Every text paste is intercepted immediately before the browser delivers the raw text to the ChatGPT editor. The extension:

1. Calls `preventDefault()` to block the native paste.
2. Sends the pasted text to the local engine `/sanitize`.
3. Writes the sanitized result back into the composer using `replaceComposerText`.
4. Reads back the composer text immediately and throws a visible error if the DOM did not persist the write (prevents false "ready" status).

The submit guard remains active as a secondary safety net for text typed manually.

**IME safety**: Paste events that arrive during an active IME composition session (Japanese, Chinese, Korean input methods) are skipped — the composition events `compositionstart`/`compositionend` gate the interceptor flag.

**Caret position**: After a paste, the caret is placed at the end of the sanitized text. This is expected enterprise behavior.

**DOM resilience**: Composer and submit button discovery uses layered selector strategies. If ChatGPT changes its DOM and removes the `<form>` wrapper, loose fallback strategies (no form context required) activate automatically. If `findSubmitButton()` returns null, the submit guard falls back to heuristic detection of the clicked element.

## Incident-Like Triage

- engine unreachable:
  confirm the process is running and `curl /health` succeeds
- submit unexpectedly blocked:
  compare current composer content with the last sanitized state and verify the engine is healthy
- paste error visible ("il campo di testo non è stato trovato"):
  the composer DOM was not found or the write-back failed — reload the page; if it persists, open an issue with the ChatGPT DOM selector that failed
- paste error visible ("il testo nel composer non corrisponde"):
  the React/framework layer reset the composer after the write — reload and retry; if persistent, downgrade to manual sanitize via the popup button
- rehydration missing:
  confirm placeholders still exist in the rendered assistant response and that the current session id is active
- startup failure:
  confirm `./scripts/bootstrap.sh` completed and both `.venv/` and `node_modules/` exist
