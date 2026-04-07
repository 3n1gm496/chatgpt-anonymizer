# Pilot Smoke Tests

## Purpose

This smoke matrix is the minimum validation set for `v0.1.0-enterprise-pilot` before each pilot wave and after any pilot-environment change.

For a broader real-browser regression pass, use the expanded checklist in [MANUAL_BROWSER_VALIDATION.md](MANUAL_BROWSER_VALIDATION.md).

## Preconditions

- local engine installed and running on `http://127.0.0.1:8765` (or the approved local port)
- extension installed from `apps/extension/.output/chrome-mv3/` or from the signed pilot zip
- extension options page confirms engine URL is `http://127.0.0.1:8765`
- test user is signed into ChatGPT Web on a desktop browser
- use synthetic data only — never real PII in smoke tests

## Evidence To Capture

- extension version shown in browser extensions UI
- engine health response: `curl -s http://127.0.0.1:8765/health`
- screenshot or short note for each failed or blocked case
- final pass/fail/caveat summary for the environment wave

---

## Smoke Matrix

### S1 — Engine Health And Popup State

**Steps:**

1. Run `curl -s http://127.0.0.1:8765/health` from the shell.
2. Open ChatGPT Web in a signed-in browser session.
3. Click the extension icon to open the popup.

**Expected:**

- health endpoint returns `{"status": "ok", "bind": "127.0.0.1"}` with a valid `engineVersion`
- popup shows engine as reachable, displays active page context (tab/conversation scope)
- no error banner in the popup

**Failure severity:** `blocker`

---

### S2 — Paste Sanitization (Paste-First)

**Steps:**

1. Focus the ChatGPT composer.
2. Copy the synthetic text: `Contatta user@example.com dal nodo 203.0.113.15 per Mario Rossi.`
3. Paste into the composer (Ctrl+V / Cmd+V).

**Expected:**

- the pasted text is NEVER visible in the composer in its original form — placeholders appear immediately at paste time, before any submit action
- composer shows something like: `Contatta [EMAIL_001] dal nodo [IP_001] per [PERSON_001].`
- status pill shows local anonymization success

**Failure severity:** `blocker` — if original text appears even briefly before sanitization, or if sanitization only happens at submit, this is a regression on the paste-first strategy

---

### S3 — Submit Allowed When Protected Prompt Is Unchanged

**Steps:**

1. Paste and sanitize the synthetic prompt from S2.
2. Stop the local engine: `./scripts/manual-browser-test.sh stop` or kill the engine process.
3. Do not edit the composer. Click the Send button.

**Expected:**

- message is sent normally — no block, no error

**Failure severity:** `blocker` — blocking valid sends when the engine is down is a major UX regression

---

### S4 — Submit Blocked When Engine Down And New Check Required

**Steps:**

1. Paste and sanitize the synthetic prompt from S2 (engine running).
2. Stop the local engine.
3. Add a new risky text after the sanitized block, e.g.: `Contatta anche altro@acme.com`
4. Click the Send button.

**Expected:**

- submit is blocked with a visible error message: engine unreachable, re-run protection before sending

**Failure severity:** `blocker` — submit must not go through when sensitive text requires a new check and the engine is unavailable

---

### S5 — Stale-After-Edit Submit Blocking (Engine Running)

**Steps:**

1. Paste and sanitize the synthetic prompt (engine running).
2. Add new sensitive text: `Telefono: +39 347 555 0101`
3. Click the Send button (engine still running).

**Expected:**

- submit is blocked with a "stale after edit" message indicating the prompt needs re-sanitization
- after accepting the auto-sanitize prompt or clicking the action button, the new content is also protected and send proceeds

**Failure severity:** `blocker`

---

### S6 — Harmless Append Does Not Block

**Steps:**

1. Paste and sanitize a prompt.
2. Add plain harmless text after the sanitized block: `Grazie mille.`
3. Click the Send button.

**Expected:**

- submit proceeds without block
- extension does not force a new sanitization run for harmless additions

**Failure severity:** `major` — false positives on harmless text degrade the user experience significantly

---

### S7 — Low-Confidence Review Flow

**Steps:**

1. Paste a prompt containing an ambiguous name that the engine detects but does not fully anonymize:  
   `Parla con Jordan a Milano per la questione Apple.`
2. Check if a review drawer or notification appears.
3. If a review UI appears, make a decision (include or exclude one replacement) and apply.

**Expected:**

- decision is applied deterministically
- the sanitized text in the composer reflects the decision
- session state records the decision consistently

**Failure severity:** `major` — review flow is a required pilot feature

**Known caveat:** low-confidence handling may not trigger a drawer for all engine confidence levels; verify with the specific text used in the target environment.

---

### S8 — Response Rehydration Toggle

**Steps:**

1. Complete a full sanitize-and-send flow (placeholders appear in the prompt).
2. Wait for an assistant response that repeats back the placeholders.
3. Use the extension popup or the on-page toggle to show original values.
4. Toggle back to placeholder view.

**Expected:**

- original values appear in the local DOM view (not sent to the network)
- toggling back restores placeholder view cleanly without DOM corruption

**Failure severity:** `major` — if rehydration leaks to a network request or corrupts the DOM, it is a `blocker`

---

### S9 — Session Reset

**Steps:**

1. Perform a full sanitize-and-send flow.
2. Open the extension popup and use the reset session action.

**Expected:**

- session mapping clears for the current scope
- subsequent submit or rehydration actions do not use the old mapping

**Failure severity:** `major`

---

### S10 — Manual Clean Prompt Is Sendable

**Steps:**

1. Type (do not paste) a harmless prompt that was never through anonymization: `Ciao, come posso aiutarti oggi?`
2. Stop the local engine.
3. Click Send.

**Expected:**

- submit proceeds — no block, no engine error, because no protected content requires a check

**Failure severity:** `blocker` — blocking clean manually-typed prompts is a critical UX regression

---

### S11a — PDF and DOCX Text Extraction on Paste

**Steps:**

1. Paste or drag a PDF file that contains a text layer (not a scanned image PDF) with no accompanying text.
2. Observe the extension behavior.

**Expected:**

- the extension extracts the text content from the PDF, sanitizes it, and writes it to the composer as plain text
- the status pill shows a sanitized/ready state (not an error or skip notice)
- the original PDF file is not uploaded to ChatGPT; only the extracted sanitized text appears in the composer

Repeat with a `.docx` file — same expected behavior: text extracted, sanitized, written to composer.

**Failure severity:** `major` — PDF/DOCX text content must be sanitized before it reaches the composer

---

### S11b — Non-Extractable File Notice

**Steps:**

1. Paste or drag a binary file that is not a PDF or DOCX (e.g. a PNG image or a zip archive) with no accompanying text.
2. Observe the extension behavior.

**Expected:**

- the extension shows a visible notice that the file was not sanitized automatically (skipped file count > 0)
- no false sanitization happens
- no broken upload state in the ChatGPT composer

Also verify with: a password-protected PDF, a scanned PDF (no text layer), and a corrupt DOCX — all three should show the skip notice, not an error crash.

**Failure severity:** `minor` — the notice must appear; silent skip would be `major`

---

### S12 — Extension Popup Shows Correct State After Reload

**Steps:**

1. Complete a sanitize-and-send flow.
2. Reload the ChatGPT tab.
3. Open the extension popup.

**Expected:**

- popup shows coherent state — either active session for the conversation or a clean new-chat state
- no stale error banners from the previous page load

**Failure severity:** `minor`

---

## Pass Criteria

- S1 through S10 all pass (`blocker` and `major` items)
- S11a passes — PDF and DOCX text is extracted and sanitized (`major`)
- S11b and S12 pass or are accepted as known pilot caveats with documented evidence
- no raw text appears in logs, console output, or operator-visible diagnostics
- no unexpected external network requests are observed for sanitization flows
- no crash or unrecoverable error on any required pilot workflow

## Fail Criteria — Pilot Must Pause

- submit guard fails open when the engine is unreachable (S3/S4 failure)
- original sensitive text appears in the composer after paste without being replaced by placeholders (S2 failure)
- review decisions produce inconsistent output on repeated application (S7 failure)
- response rehydration leaks outside the local browser DOM
- extension or engine crash on a standard pilot workflow
- raw text appears in any log file visible to the operator
