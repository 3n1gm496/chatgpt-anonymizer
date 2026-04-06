# Admin Guide

## Overview

This guide covers installation, configuration, operation, and removal of `chatgpt-anonymizer` for the `v0.1.0-enterprise-pilot` rollout. It is written for a support operator or admin who is not expected to know the source code.

---

## Prerequisites

**Machine requirements:**

- Linux or macOS desktop with a `bash` shell
- Python `>= 3.12` — check with `python3 --version`
- `pip` available — check with `python3 -m pip --version`
- A Chromium-based browser (Chrome, Edge, Brave, Chromium) — version >= 100 recommended
- Outbound network access to `chatgpt.com` from the browser (the engine itself runs locally)
- No special ports required beyond `8765` (or the approved local port) on `127.0.0.1`

**Firewall note:** the engine binds only to `127.0.0.1`. Inbound firewall rules do not need to be changed. Outbound rules must allow the browser to reach `chatgpt.com` normally.

---

## Install The Local Engine

### Option A — From Built Wheel (Recommended For Pilot)

```bash
python3 -m pip install chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl
```

Replace the filename with the exact wheel provided in the pilot artifact package.

### Option B — From Source (Development Or Validation)

```bash
./scripts/bootstrap.sh
```

This provisions a repo-local Python virtualenv and installs the engine in development mode.

### Verify The Install

```bash
chatgpt-anonymizer-engine --help
```

Expected: help text showing `--port`, `--host`, and `--debug` options.

---

## Start The Engine

```bash
chatgpt-anonymizer-engine --port 8765
```

The engine starts on `http://127.0.0.1:8765`.

Keep the terminal open while using the extension. Closing the terminal stops the engine.

**Verify the engine is running:**

```bash
curl -s http://127.0.0.1:8765/health
```

Expected response:

```json
{ "status": "ok", "bind": "127.0.0.1", "engineVersion": "0.1.0" }
```

---

## Stop The Engine

Close the terminal where the engine is running, or send `Ctrl+C` to the engine process.

If the engine is running as a background process, find and stop it:

```bash
pkill -f chatgpt-anonymizer-engine
```

---

## Load The Extension In Chrome

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the unpacked extension directory:
   - for internal validation: `apps/extension/.output/chrome-mv3/`
   - for signed pilot distribution: unzip the signed pilot zip and load the unpacked directory

**If you are on Windows 11 + WSL:**
Use the UNC path, for example:

```
\\wsl$\Ubuntu-24.04\home\administrator\tools\chatgpt-anonymizer\apps\extension\.output\chrome-mv3
```

**Verify the extension loaded:**

- it appears in `chrome://extensions` without any error badge
- the extension icon appears in the browser toolbar

---

## Configure The Engine URL

1. Right-click the extension icon → **Options** (or open the popup → settings gear).
2. Confirm the engine URL is `http://127.0.0.1:8765`.
3. If the default was changed, reset it to `http://127.0.0.1:8765`.

The extension validates and rejects any non-localhost URL. The URL must match exactly what the engine is listening on.

---

## Verify The Extension Is Active On ChatGPT

1. Open `https://chatgpt.com/` in the browser.
2. Click the extension icon to open the popup.
3. Confirm:
   - engine shows as **reachable**
   - endpoint matches `http://127.0.0.1:8765`
   - current conversation or tab context appears
4. Paste synthetic test text: `Contatta user@example.com dal nodo 203.0.113.15`
5. Confirm the composer shows placeholders immediately after paste.

---

## Upgrade The Engine

1. Stop the running engine.
2. Install the new wheel:
   ```bash
   python3 -m pip install --upgrade chatgpt_anonymizer_local_engine-<new-version>-py3-none-any.whl
   ```
3. Restart the engine:
   ```bash
   chatgpt-anonymizer-engine --port 8765
   ```
4. Verify health:
   ```bash
   curl -s http://127.0.0.1:8765/health
   ```

---

## Reset A User Session

From the extension popup:

- Click the **Reset** (or session reset) action for the active conversation scope.

From the engine directly (operator use):

```bash
curl -s -X POST http://127.0.0.1:8765/sessions/reset \
  -H 'Content-Type: application/json' \
  -d '{"sessionKey": "<session-key>"}'
```

Use only when a user reports a stuck or inconsistent session state.

---

## Collect Logs Safely

Engine logs are written to stdout. To capture them to a file:

```bash
chatgpt-anonymizer-engine --port 8765 > engine.log 2>&1
```

**Before sharing any log file:**

- Verify it contains no clipboard text, no sanitized full text, no email addresses, no IP addresses, no names.
- The engine is designed to log only events, counts, and metadata — but always verify before sharing.
- If you are unsure, strip any lines containing `@`, `/sanitize`, or `text` before sharing.

---

## Escalation Path

If you observe any of the following, escalate immediately to the pilot security contact:

- the engine is reachable on any address other than `127.0.0.1`
- the extension is sending sanitization requests to a remote URL (check browser DevTools → Network tab)
- raw text appears in logs
- a user reports that their original sensitive text appeared on `chatgpt.com` without any placeholder replacement
- submit succeeds when the engine is down and the prompt contains known sensitive text

For non-security issues (extension not loading, engine crash, DOM changes breaking paste), follow the triage steps in [TROUBLESHOOTING.md](TROUBLESHOOTING.md) and [RUNBOOK.md](RUNBOOK.md).

---

## Rollback The Pilot

To remove the pilot from a user's machine:

1. Remove the extension from `chrome://extensions` → Remove.
2. Uninstall the engine:
   ```bash
   python3 -m pip uninstall chatgpt-anonymizer-local-engine
   ```
3. (Optional) Clear local engine state if required by your incident response policy:
   ```bash
   rm -rf ~/.local/share/chatgpt-anonymizer-engine/
   ```
   Or, from the repo:
   ```bash
   rm -rf services/local-engine/.engine-state
   ```
4. Confirm the engine process is no longer running:
   ```bash
   curl -s http://127.0.0.1:8765/health
   # Expected: connection refused
   ```

---

## Uninstall And Cleanup

```bash
# Remove the engine
python3 -m pip uninstall chatgpt-anonymizer-local-engine

# Remove the extension from the browser
# chrome://extensions → Remove

# Remove local state (only if no data retention requirements apply)
rm -rf services/local-engine/.engine-state

# Remove virtualenv (if installed via bootstrap.sh)
rm -rf .venv
```

---

## Known Operational Caveats

- extension signing and enterprise browser policy rollout are still manual steps
- the optional ML detector is not enabled in this pilot; detection is regex/dictionary based
- duplicate-tab session isolation is weaker when the browser does not provide a valid `tabId`
- IME composition flows (Japanese, Chinese, Korean) are implemented but not yet validated with real users in a pilot session
