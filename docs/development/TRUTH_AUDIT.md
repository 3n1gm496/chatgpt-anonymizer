# Truth Audit — chatgpt-anonymizer

**Date:** 2026-04-07
**Branch:** main (commit `039e876`)
**Auditor:** automated code-vs-docs verification pass

This file is the result of a line-by-line comparison between documentation claims and actual source code. No claim is accepted on faith. Evidence is cited by file and function.

---

## 1. CLAIMS PRINCIPALI DEL REPO

Extracted from README, RELEASE_NOTES, RELEASE_READINESS_REPORT, AGENTS, PILOT_SMOKE_TESTS:

| #   | Claim                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- |
| C1  | Paste-First: every paste is intercepted, sanitized immediately, written back — original text never reaches the composer |
| C2  | Write-back verification: `replaceComposerText` return value checked AND read-back comparison                            |
| C3  | IME composition guard: paste skipped during active compositionstart/compositionend                                      |
| C4  | Caret positioned at end of sanitized text after replaceChildren                                                         |
| C5  | DOM resilience: loose selector strategies work without `<form>` context                                                 |
| C6  | Submit guard broadened click detection: falls back to `looksLikeSubmitButton` when `findSubmitButton()` returns null    |
| C7  | Submit blocked when native uploads present (C7 added in hardening-2)                                                    |
| C8  | PDF and DOCX files are extracted and sanitized on paste/drop (C8 added in hardening-2)                                  |
| C9  | Typed text sanitized on-the-fly with 1500ms debounce (C9 added in hardening-2)                                          |
| C10 | Localhost-only binding enforced — engine hardcoded to 127.0.0.1                                                         |
| C11 | No silent failure — errors surface visibly instead of false "ready" state                                               |
| C12 | "no file or image anonymization" (from RELEASE_NOTES Known Limitations)                                                 |
| C13 | "optional ML detector is still a placeholder hook" (from README Known Limitations)                                      |
| C14 | "54 unit/integration tests pass" (from RELEASE_READINESS_REPORT)                                                        |
| C15 | S11 smoke test: pasting a PDF shows "not anonymized" notice                                                             |
| C16 | "optional ML detector enablement" listed under Out of Scope for Pilot                                                   |

---

## 2. EVIDENZE NEL CODICE

### C1 — Paste-First strategy

**Files:** `apps/extension/src/chatgpt/pasteInterceptor.ts`

- `registerPasteInterceptor` registers `document.addEventListener('paste', handlePaste, true)` — capture phase, fires before browser delivers to editor.
- `handlePaste` calls `event.preventDefault()` at line 332 before any async work.
- `sanitizeInterceptedText` is called and `deps.adapter.replaceComposerText(fullComposerText)` writes back at line 131.
- `registerInputDebouncer` additionally sanitizes typed text on `input` events.

**Verdict: TRUE**

---

### C2 — Write-back verification

**Files:** `apps/extension/src/chatgpt/pasteInterceptor.ts` lines 131–149

```typescript
const written = deps.adapter.replaceComposerText(fullComposerText);
if (!written) {
  throw new Error('...');
}
const actualText = deps.adapter.getComposerText();
const expectedNorm = normalizeLineBreaks(fullComposerText)
  .replace(/\n+$/, '')
  .trim();
const actualNorm = normalizeLineBreaks(actualText).replace(/\n+$/, '').trim();
if (actualNorm !== expectedNorm) {
  throw new Error('...');
}
```

Both the return value check and the read-back comparison are present. Same pattern repeated in `sanitizeComposerText` (lines 224–242).

**Verdict: TRUE**

---

### C3 — IME composition guard

**Files:** `apps/extension/src/chatgpt/pasteInterceptor.ts` lines 299–305, 307–309

```typescript
let isComposing = false;
const handleCompositionStart = () => { isComposing = true; };
const handleCompositionEnd = () => { isComposing = false; };
// ...
const handlePaste = async (event: ClipboardEvent) => {
  if (isComposing) { return; }
```

Also present in `registerInputDebouncer`.

**Verdict: TRUE**

---

### C4 — Caret positioning after replaceChildren

**Files:** `apps/extension/src/chatgpt/composerAdapter.ts` lines 133–148

```typescript
element.replaceChildren(buildEditableBlocks(text));
dispatchTextInput(element);
const endSel = element.ownerDocument.defaultView?.getSelection?.() ?? null;
if (endSel) {
  try {
    const endRange = element.ownerDocument.createRange();
    endRange.selectNodeContents(element);
    endRange.collapse(false);
    endSel.removeAllRanges();
    endSel.addRange(endRange);
  } catch {
    /* best-effort */
  }
}
return true;
```

**Verdict: TRUE** — best-effort, with documented caveat that it cannot preserve the original paste cursor position.

---

### C5 — Loose selector strategies

**Files:** `apps/extension/src/chatgpt/selectors.ts` lines 59–76

Eight strict strategies (with `main form`) + five loose strategies without form context, including `[data-testid="prompt-textarea"]`. Backed by 2 fixture variants in composerVariants.ts.

**Verdict: TRUE**

---

### C6 — Broadened click detection

**Files:** `apps/extension/src/chatgpt/submitGuard.ts` lines 350–360

```typescript
const clickedButton =
  target instanceof HTMLButtonElement
    ? target
    : target instanceof Element
      ? target.closest('button')
      : null;
const isRelevantClick =
  event instanceof MouseEvent &&
  target instanceof Element &&
  (options.adapter.findSubmitButton()?.contains(target) ||
    looksLikeSubmitButton(clickedButton));
```

`looksLikeSubmitButton` checks `type='submit'`, aria-label 'send'/'invia', and `data-testid` containing 'send'.

**Verdict: TRUE**

---

### C7 — Submit blocked when native uploads present

**Files:** `apps/extension/src/chatgpt/submitGuard.ts` lines 149–157

```typescript
if (sessionState?.unsafeAttachmentsPresent) {
  return {
    allowed: false,
    state: 'unsafe_attachments',
    reason: sessionState.unsafeAttachmentsReason ?? '...',
    currentFingerprint,
  };
}
```

This guard runs BEFORE the empty-text check, blocking submit even with an empty composer.

**Verdict: TRUE**

---

### C8 — PDF and DOCX extracted and sanitized on paste

**Files:** `apps/extension/src/lib/richText.ts`

- `isSanitizableBinaryFile()`: returns true for MIME `application/pdf`, `.pdf` extension, DOCX MIME, `.docx` extension.
- `extractTextFromPdf()`: dynamic import of `pdfjs-dist/legacy/build/pdf.mjs`, iterates pages, collects `item.str`, no-worker mode for MV3 CSP.
- `extractTextFromDocx()`: dynamic import of `mammoth`, calls `extractRawText({ arrayBuffer })`.
- Loop in `extractSanitizableTextFromDataTransfer` now has 3 branches: textual files (existing), binary extractable (PDF/DOCX), other (skip).

Password-protected PDFs, corrupt DOCX, and scanned PDFs (no text layer) fall through to `skippedFileCount`.

**Verdict: TRUE** (added in commit 039e876)

---

### C9 — Typed text sanitized on-the-fly (1500ms debounce)

**Files:** `apps/extension/src/chatgpt/pasteInterceptor.ts` lines 422–511, `apps/extension/src/entrypoints/content.tsx`

`registerInputDebouncer` registers `document.addEventListener('input', handleInput, true)`, debounces at `debounceMs ?? 1500`, has `isSanitizing` reentrance guard, IME guard, and cleanup on unmount. Wired in content.tsx alongside paste interceptor.

**Verdict: TRUE** (added in commit 039e876)

---

### C10 — Localhost-only binding

**Files:**

- `services/local-engine/src/local_engine/main.py` line 128: `host="127.0.0.1"` hardcoded in `build_cli_settings`
- `apps/extension/src/services/settingsStore.ts` lines 93–98: `normalizeEngineBaseUrl` rejects any non-`127.0.0.1` hostname

**Verdict: TRUE**

---

### C11 — No silent failure

**Files:** `apps/extension/src/chatgpt/pasteInterceptor.ts`

Both `sanitizeInterceptedText` (lines 131–148) and `sanitizeComposerText` (lines 224–242) throw on `!written` AND on read-back mismatch. The caller in content.tsx calls `onError(message)` which sets the status pill to 'error'. No path exists from a failed write to a 'ready' state.

**Verdict: TRUE**

---

### C12 — "no file or image anonymization" (RELEASE_NOTES Known Limitations)

**Files:** `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` lines 64–65:

> "text-first scope only"
> "no file or image anonymization"

**Reality:** After commit 039e876, PDFs and DOCX files pasted into the composer ARE extracted and their text is sanitized. This claim is FALSE for pasted PDFs and DOCX.

PNG, JPEG, and other binary files without text layers remain unsanitized. Image files are still not supported.

**Verdict: FALSE** — needs correction

---

### C13 — "optional ML detector is still a placeholder hook"

**Files:**

- README "Known Limitations" and RELEASE_NOTES "Known Limitations"
- `services/local-engine/src/local_engine/detectors/ml_detector.py`
- `apps/extension/src/chatgpt/pasteInterceptor.ts` lines 94–96

Reality:

1. `OptionalMlDetector` has 4 functioning heuristic rules: `ml:username-labeled`, `ml:person-intro`, `ml:person-salutation`, `ml:custom-labeled-id`.
2. The extension always passes `options: { enableMl: true }` in all sanitize calls (`sanitizeInterceptedText` and `sanitizeComposerText`).
3. Therefore the "optional" ML detector runs on every sanitization request.

The detector is regex-based heuristics, not a neural network. The "ML" label is a misnomer. But calling it a "placeholder hook" is false — it has real rules and produces findings.

**Verdict: PARTIALLY FALSE** — the detector exists and runs; "placeholder hook" is inaccurate. "Not a real ML model" is accurate.

---

### C14 — "54 unit/integration tests pass"

**Files:** `docs/development/RELEASE_READINESS_REPORT.md`, `CHANGELOG.md`

**Reality:** Current test count after commit 039e876: **69 TS unit/integration + 28 Python = 97 total**.
The 54 count predates the hardening-2 pass (+15 new tests).

**Verdict: FALSE (outdated)**

---

### C15 — S11 smoke test expects PDF → "not anonymized" notice

**Files:** `docs/development/PILOT_SMOKE_TESTS.md` lines 207–215

> "Paste or drag a binary file (e.g. a PDF or PNG)"
> Expected: "the extension shows a visible notice that the attachment was not anonymized automatically"

**Reality:** After commit 039e876, pasting a PDF invokes `extractTextFromPdf`, extracts text, sends to engine, sanitizes, and writes back to composer. The PDF is sanitized — the "not anonymized" notice will NOT appear. The S11 test would fail its own expected result for PDFs.

PNG and other true binary files still trigger the notice.

**Verdict: FALSE for PDF — the test describes the wrong expected behavior**

---

### C16 — "optional ML detector enablement" listed as out of scope

**Files:** README line 188: "optional ML detector enablement"

Context is "Out of Scope for Pilot" — meaning the UI/settings toggle for the user to enable/disable ML is out of scope. This is accurate: there is no `enableMl` field in `settingsStore.ts`. The extension hard-codes `enableMl: true`.

**Verdict: TRUE** (as written — it means the user-facing toggle, not the detector itself)

---

## 3. CONTRADDIZIONI

### K1 — RELEASE_NOTES claim "no file or image anonymization" vs code that extracts PDFs/DOCX

- **Doc file:** `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` Known Limitations
- **Code file:** `apps/extension/src/lib/richText.ts` `extractTextFromPdf`, `extractTextFromDocx`, `isSanitizableBinaryFile`
- **Risk:** Operators running S11 with a PDF will see sanitization, not the expected notice. Operators told there is "no file anonymization" will not inform users that PDFs are protected — users may assume PDF content is unprotected and behave accordingly.
- **Severity: MAJOR**

### K2 — PILOT_SMOKE_TESTS S11 expected behavior wrong for PDFs

- **Doc file:** `docs/development/PILOT_SMOKE_TESTS.md` S11
- **Code file:** `apps/extension/src/lib/richText.ts`
- **Risk:** Smoke test passes when it should fail, or fails when the code is correct. Creates false pass/fail signal during pilot validation.
- **Severity: MAJOR**

### K3 — "ML detector is a placeholder hook" vs functional heuristic detector always enabled

- **Doc files:** `README.md` Known Limitations, `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` Known Limitations
- **Code files:** `services/local-engine/src/local_engine/detectors/ml_detector.py`, `apps/extension/src/chatgpt/pasteInterceptor.ts` (always passes `enableMl: true`)
- **Risk:** Operators/developers expect the ML path is a no-op and do not account for PERSON/USERNAME detections from the heuristic rules. Could cause surprise false positives in pilot.
- **Severity: MINOR**

### K4 — Stale test count "54" in RELEASE_READINESS_REPORT and CHANGELOG

- **Doc files:** `docs/development/RELEASE_READINESS_REPORT.md`, `CHANGELOG.md`
- **Reality:** 69 TS unit/integration tests after commit 039e876
- **Risk:** Low operational risk, but undermines the credibility of the report and the changelog as canonical records.
- **Severity: MINOR**

### K5 — CHANGELOG has no entry for commit 039e876 (pilot-hardening-2)

- **Doc file:** `CHANGELOG.md` — last entry is dated 2026-04-06 for the pilot-hardening-1 pass
- **Reality:** Commit 039e876 (2026-04-07) added 3 significant features: typed-text debouncer (Gap 1), PDF/DOCX extraction (Gap 2), native-upload submit block (Gap 3). This commit is unlogged.
- **Severity: MAJOR** — anyone reading the changelog has no record of these changes

### K6 — README "Enterprise Pilot Scope" supported content types don't mention PDF/DOCX

- **Doc file:** `README.md` line 164: "pasted text, logs, and small textual files surfaced through paste/drop"
- **Reality:** PDFs and DOCX are now also supported through paste/drop
- **Severity: MINOR**

---

## 4. VERDETTO DEL BRANCH CORRENTE

**Classification: functional with caveats**

**Reasoning:**

The core protection mechanisms are all implemented and verified:

- Paste-first strategy works correctly
- Write-back verification prevents silent failures
- IME guard is present
- Typed text is now sanitized via the 1500ms debouncer
- PDF/DOCX text is extracted and sanitized on paste
- Native ChatGPT uploads block submit

The code is **ahead of the documentation** in two areas (PDF/DOCX, native upload blocking) and the documentation contains one actively incorrect smoke test scenario and multiple stale counts/claims.

The product is not "overstated" in the classic sense — the code does MORE than some docs say. But the documentation is inconsistent: some docs (README) are nearly current, others (RELEASE_NOTES, RELEASE_READINESS_REPORT, CHANGELOG) are snapshots of an older state.

This matters operationally: a pilot operator running S11 with a PDF following the documented expected behavior will get the wrong answer. A developer reading "ML detector is a placeholder" will be wrong.

---

## 5. PIANO DI CORREZIONE

The following are the minimum fixes required to make documentation consistent with code:

| Fix | File                                                        | What to change                                                                                         |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F1  | `CHANGELOG.md`                                              | Add entry for commit 039e876 (Gap 1, 2, 3)                                                             |
| F2  | `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` | Remove "no file or image anonymization", replace with accurate description of PDF/DOCX text extraction |
| F3  | `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` | Update test count from 54 to 69 (and Python 28)                                                        |
| F4  | `docs/development/RELEASE_READINESS_REPORT.md`              | Add hardening-2 section; update test count from 54 to 69; update artifact checksums                    |
| F5  | `docs/development/PILOT_SMOKE_TESTS.md`                     | Split S11 into S11a (PDF/DOCX: now sanitized) and S11b (images/binary: notice shown)                   |
| F6  | `README.md`                                                 | Replace "placeholder hook" with accurate description of the heuristic ML detector                      |
| F7  | `README.md`                                                 | Add PDF/DOCX to supported content types in Enterprise Pilot Scope                                      |
| F8  | `docs/development/RELEASE_NOTES_v0.1.0-enterprise-pilot.md` | Replace "optional ML detector remains a placeholder hook" with accurate description                    |
