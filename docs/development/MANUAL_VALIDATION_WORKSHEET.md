# Manual Validation Worksheet

Use this worksheet while executing the real-browser checks in [MANUAL_BROWSER_VALIDATION.md](/home/administrator/tools/chatgpt-anonymizer/docs/development/MANUAL_BROWSER_VALIDATION.md).

## Session Metadata

| Field            | Value |
| ---------------- | ----- |
| Date             |       |
| Tester           |       |
| Browser          |       |
| Browser version  |       |
| OS / environment |       |
| ChatGPT URL      |       |
| Extension build  |       |
| Engine URL       |       |
| Engine version   |       |
| Notes            |       |

## Evidence To Capture

- screenshot of the popup on `chatgpt.com`
- screenshot of the page status pill for each failure or unclear result
- `curl -s http://127.0.0.1:8765/health`
- last engine log lines if anything fails:

```bash
tail -n 60 .manual-browser-test/local-engine.log
```

## Minimum 15-Case Gate

Mark each case as `PASS`, `FAIL`, or `N/A`.

| #   | Case                          | Synthetic input / action                           | Expected result                                           | Result | Evidence | Notes |
| --- | ----------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ------ | -------- | ----- |
| 1   | Engine reachable              | `curl -s http://127.0.0.1:8765/health`             | `status: ok`, `bind: 127.0.0.1`                           |        |          |       |
| 2   | Extension load                | Load unpacked extension in browser                 | No manifest/runtime load errors                           |        |          |       |
| 3   | Popup context                 | Open popup on `chatgpt.com`                        | Engine reachable and active page context shown            |        |          |       |
| 4   | First paste sanitization      | `Contatta user@example.com dal nodo 203.0.113.15.` | Prompt replaced with placeholders                         |        |          |       |
| 5   | Second paste append           | Paste a second sensitive block in the same prompt  | Second block is appended, not overwritten                 |        |          |       |
| 6   | Safe append after sanitize    | Add harmless text after a protected block          | Submit still allowed                                      |        |          |       |
| 7   | Manual clean prompt           | Write a harmless prompt without prior sanitization | Submit allowed even with engine down                      |        |          |       |
| 8   | Unchanged protected prompt    | Sanitize, stop engine, submit unchanged prompt     | Submit still allowed                                      |        |          |       |
| 9   | Risky append with engine down | Sanitize, stop engine, append new email/IP         | Submit blocked with engine-unreachable message            |        |          |       |
| 10  | Risky append with engine up   | Sanitize, append new email/IP                      | Submit blocked as stale                                   |        |          |       |
| 11  | Review drawer opens           | Paste ambiguous text                               | Review drawer appears                                     |        |          |       |
| 12  | Review exclusion works        | Exclude one low-confidence finding                 | Prompt reflects the chosen exclusion                      |        |          |       |
| 13  | Rehydration toggle            | Toggle placeholders on a response                  | Originals show locally, toggle back restores placeholders |        |          |       |
| 14  | File-only notice              | Paste or drag a file without text                  | Clear notice, no fake sanitization                        |        |          |       |
| 15  | Session reset                 | Use popup reset and retry                          | Old mapping no longer treated as active                   |        |          |       |

## Extended Matrix

Use this section if you want full regression coverage beyond the minimum gate.

| #   | Case                      | Synthetic input / action                          | Expected result                             | Result | Evidence | Notes |
| --- | ------------------------- | ------------------------------------------------- | ------------------------------------------- | ------ | -------- | ----- |
| 16  | Text + file mixed paste   | Paste text together with a file/image             | Text is protected, attachment warning shown |        |          |       |
| 17  | File drag only            | Drag only a file into composer                    | Clear file limitation notice                |        |          |       |
| 18  | Textarea fallback         | Use textarea fixture or alternate composer layout | Protection still works                      |        |          |       |
| 19  | Response rehydrate off/on | Toggle repeatedly                                 | Behavior remains reversible and stable      |        |          |       |
| 20  | Reload current tab        | Reload `chatgpt.com` with active session          | Extension reattaches cleanly                |        |          |       |
| 21  | New chat scope            | Open a new chat                                   | New scope shown in popup                    |        |          |       |
| 22  | Duplicate tab             | Duplicate the current tab                         | Scope remains understandable and isolated   |        |          |       |
| 23  | Reset after review        | Reset after applying review decisions             | Session is cleared fully                    |        |          |       |
| 24  | Engine down on startup    | Open popup while engine is not running            | Error message remains user-friendly         |        |          |       |
| 25  | No findings paste         | Paste harmless text                               | No unnecessary block or scary message       |        |          |       |

## Final Summary

| Summary field                | Value |
| ---------------------------- | ----- |
| Minimum 15-case gate         |       |
| Extended matrix              |       |
| Blockers found               |       |
| Non-blockers found           |       |
| Recommended rollout decision |       |
| Follow-up ticket links       |       |
