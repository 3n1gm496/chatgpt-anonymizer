# Manual Browser Validation

## Purpose

This guide prepares a real manual validation run on a local desktop browser against `chatgpt.com`, outside CI and outside the Playwright sandbox. The goal is to validate the actual extension behavior, the localhost engine connection, and the main pilot flows on a real user setup.

## Prerequisites

- repository bootstrapped with repo-local toolchain support
- `npm` available for first-time bootstrap
- `python3 >= 3.12`
- Chrome or another Chromium-based browser
- if you run from WSL on Windows 11:
  - keep the engine in WSL
  - load the unpacked extension in Windows Chrome through the `\\wsl$\\...` path printed by the manual script

## Exact Commands

First-time setup:

```bash
./scripts/bootstrap.sh
```

Prepare the real manual validation session:

```bash
./scripts/manual-browser-test.sh start
```

Check current status later:

```bash
./scripts/manual-browser-test.sh status
```

Stop the engine started by the helper:

```bash
./scripts/manual-browser-test.sh stop
```

Alternative root package commands:

```bash
pnpm manual:browser
pnpm manual:browser:status
pnpm manual:browser:stop
```

## What The Helper Does

- verifies repo-local Node, pnpm, Python venv, workspace deps, and engine deps
- starts the local engine on `http://127.0.0.1:8765` if it is not already reachable
- builds the extension in unpacked production-like mode for real browser loading
- prints:
  - exact unpacked extension path
  - exact engine URL
  - engine log file
  - WSL-to-Windows path hint when relevant

## Start The Engine Manually

If you prefer not to use the helper script, you can start the engine directly:

```bash
pnpm dev:engine
```

or:

```bash
chatgpt-anonymizer-engine --port 8765
```

Expected endpoint:

```bash
curl -s http://127.0.0.1:8765/health
```

## Build The Extension Manually

If you prefer to build the extension without the helper script:

```bash
pnpm build:extension
```

Expected unpacked output:

```text
apps/extension/.output/chrome-mv3/
```

## Load The Extension In The Real Browser

For Chrome:

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:
   `/home/administrator/tools/chatgpt-anonymizer/apps/extension/.output/chrome-mv3/`

If you are on Windows 11 + WSL, use the UNC path printed by `./scripts/manual-browser-test.sh start`, for example:

```text
\\wsl$\Ubuntu-24.04\home\administrator\tools\chatgpt-anonymizer\apps\extension\.output\chrome-mv3
```

## Verify The Extension Is Active On ChatGPT

1. Open `https://chatgpt.com/`
2. Open the extension popup
3. Confirm:
   - engine shows as reachable
   - endpoint matches `http://127.0.0.1:8765`
   - a current conversation or tab context appears when on ChatGPT
4. Open the options page if needed and confirm the engine URL is still `http://127.0.0.1:8765`

## Verify The Local Engine Is Reachable

From the same shell where you prepared the test:

```bash
curl -s http://127.0.0.1:8765/health
```

Expected:

- `status: "ok"`
- `bind: "127.0.0.1"`
- a valid `engineVersion`

## Expanded Manual Validation Checklist

Use this checklist for a real browser session on `chatgpt.com`. It is intentionally broader than the pilot smoke matrix and is meant to flush out UX regressions, state bugs, and edge cases before wider rollout.

For a fillable companion sheet, use [MANUAL_VALIDATION_WORKSHEET.md](/home/administrator/tools/chatgpt-anonymizer/docs/development/MANUAL_VALIDATION_WORKSHEET.md).

Record for each case:

- pass or fail
- browser and version
- exact synthetic text used
- screenshot if the result is unclear
- popup state and on-page status text when relevant

### A. Basic Health

| #   | Step                                   | Expected Result                                                    | Priority    |
| --- | -------------------------------------- | ------------------------------------------------------------------ | ----------- |
| 1   | Start helper script or engine manually | engine health endpoint responds on `127.0.0.1:8765`                | blocker     |
| 2   | Load extension in Chrome               | extension appears in `chrome://extensions` without manifest errors | blocker     |
| 3   | Open popup on `chatgpt.com`            | popup shows engine reachable and current page context              | blocker     |
| 4   | Use reset action in popup              | reset action is visible and can be invoked                         | non-blocker |

### B. Paste Sanitization

**Strategia attiva: Paste-First Robusta.**  
Ogni paste di testo testuale (semplice o con file allegati) viene intercettato immediatamente dall'extension, inviato al motore locale `/sanitize`, e riscritto nel composer con i placeholder prima che il browser applichi il testo originale. Il submit guard rimane attivo come rete di sicurezza per il testo digitato manualmente.

| #   | Step                                                        | Expected Result                                                                                               | Priority    |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 5   | Open `chatgpt.com` and focus the composer                   | composer is editable and extension is active on the page                                                      | blocker     |
| 6   | Paste synthetic text containing email and IP                | composer content is replaced inline with placeholders **immediatamente** al paste — senza attendere il submit | blocker     |
| 7   | Paste a second synthetic block into the same prompt         | second sanitized block is appended, not overwritten                                                           | blocker     |
| 8   | Paste safe text after a protected block                     | safe text stays in the prompt and the extension does not force a new sanitization                             | blocker     |
| 9   | Manually write a clean prompt without any prior sanitize    | submit remains allowed even if the engine is down                                                             | blocker     |
| 10  | Submit an unchanged protected prompt with the engine down   | submit is still allowed because no new local check is needed                                                  | blocker     |
| 11  | Add new risky text to a protected prompt with engine down   | submit is blocked with a clear engine-unreachable message                                                     | blocker     |
| 12  | Add new risky text to a protected prompt with engine up     | submit is blocked as stale and asks for a fresh local protection pass                                         | blocker     |
| 13  | Paste text plus a small textual file in one action          | text is protected and the extension also extracts/protects readable file text, explaining what stayed out     | non-blocker |
| 14  | Paste only a small textual file or drag only a textual file | the file text is extracted into the composer, sanitized locally, and no broken upload state appears           | non-blocker |
| 15  | Paste or drag only an unsupported/binary/oversized file     | no false sanitization happens; a clear notice explains why the file was ignored                               | non-blocker |
| 16  | Use the textarea fallback page or another composer layout   | the extension still protects pasted text if ChatGPT serves a fallback or changed DOM structure                | non-blocker |

Suggested text:

```text
Contatta user@example.com dal nodo 203.0.113.15 per Maria Rossi.
```

### E. Manual Review Only For Ambiguous Cases

| #   | Step                                                                | Expected Result                                                       | Priority    |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| 17  | Paste a merely low-confidence but still obvious phone/email pattern | the extension protects it without opening the review automatically    | non-blocker |
| 18  | Paste truly ambiguous content likely to trigger review              | review drawer opens only for the ambiguous case                       | non-blocker |
| 19  | Exclude one replacement                                             | drawer records the decision consistently                              | non-blocker |
| 20  | Apply the review                                                    | resulting sanitized text matches the chosen include/exclude decisions | blocker     |

Suggested ambiguous text:

```text
Parla con Jordan a Milano e verifica se Apple indica la societa o il frutto nel contesto.
```

### F. Response Rehydration

| #   | Step                                                      | Expected Result                                       | Priority    |
| --- | --------------------------------------------------------- | ----------------------------------------------------- | ----------- |
| 21  | Use a conversation response containing known placeholders | placeholders are visible in the rendered response     | setup       |
| 22  | Toggle `show/hide originals`                              | original values appear only in the local DOM          | non-blocker |
| 23  | Toggle back                                               | placeholders return and the toggle remains reversible | blocker     |

### G. Session Reset

| #   | Step                                                 | Expected Result                                      | Priority    |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | ----------- |
| 24  | Use popup reset on the active session                | session state clears                                 | non-blocker |
| 25  | Retry rehydration or submit without new sanitization | extension no longer treats the old mapping as active | blocker     |
| 26  | Paste again                                          | a new sanitization run recreates valid state         | blocker     |

### H. Reload / New Chat / Duplicate Tab

| #   | Step                           | Expected Result                                                                      | Priority    |
| --- | ------------------------------ | ------------------------------------------------------------------------------------ | ----------- |
| 27  | Reload the current ChatGPT tab | extension reattaches and popup shows coherent state                                  | non-blocker |
| 28  | Open a new chat                | new conversation scope is visible                                                    | non-blocker |
| 29  | Duplicate the tab              | session behavior remains understandable and does not silently leak state across tabs | non-blocker |

Known caveat:

- duplicate-tab behavior depends on browser tab identity and conversation detection; unexpected scope reuse is a pilot caveat to record, not an immediate architecture change for this task

## Minimum 15-Case Gate

If you need a faster pass instead of the full matrix above, run these 15 cases in order:

1. engine health reachable
2. extension loads without manifest errors
3. popup shows reachable engine and active page context
4. first paste sanitizes email/IP correctly
5. second paste appends instead of overwriting
6. safe append after sanitize still allows submit
7. manual clean prompt still allows submit
8. unchanged protected prompt still allows submit with engine down
9. risky append blocks with engine down
10. risky append blocks as stale with engine up
11. low-confidence drawer opens
12. exclude decision is applied correctly
13. rehydration toggle works both directions
14. file-only paste shows a clear notice
15. reset clears active session state cleanly

## What To Capture If A Bug Appears

- timestamp
- browser and version
- whether you are running from Windows native shell or WSL
- exact prompt pattern used, but redact any real sensitive content
- screenshot of popup, page status, and options page if relevant
- output of:

```bash
curl -s http://127.0.0.1:8765/health
```

- last local engine log lines:

```bash
tail -n 60 .manual-browser-test/local-engine.log
```

## Stop And Clean Up

Stop the engine started by the helper:

```bash
./scripts/manual-browser-test.sh stop
```

Optional cleanup:

- unload the extension from `chrome://extensions`
- delete `.manual-browser-test/local-engine.log` if you do not need it anymore
- keep `.output/` if you want to reload the same unpacked build later
