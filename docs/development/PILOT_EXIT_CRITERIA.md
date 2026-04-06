# Pilot Exit Criteria

## Purpose

This document defines when the `v0.1.0-enterprise-pilot` is considered complete and what decision should follow.

---

## Decision Framework

At the end of each pilot wave, the pilot owner reviews all open findings against the criteria below and records one of three decisions:

| Decision                      | Meaning                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pilot passed**              | All required criteria met, no blockers, no unresolved majors. Ready to proceed to the next wave or broader release.                                                       |
| **Pilot passed with caveats** | All blocker and most major criteria met. Known gaps are documented, accepted, and do not affect the core privacy boundary. Next wave can proceed with documented caveats. |
| **Pilot failed**              | One or more blocker criteria are unmet, or the privacy boundary cannot be verified. Pilot must pause until the issue is resolved.                                         |

---

## Blocker Criteria — Must All Pass

Failure on any blocker criterion triggers `Pilot failed`.

### Security boundary

- [ ] The local engine binds only to `127.0.0.1` in all tested environments. No external network interface is reachable on the engine port.
- [ ] No raw clipboard text, sanitized full text, or sensitive values appear in any log file, browser console, or network request captured during pilot testing.
- [ ] Sanitization requests are sent only to `http://127.0.0.1:<port>`. No external service is contacted for anonymization or mapping storage.
- [ ] The extension setting validation rejects non-localhost engine URLs — it is not possible to point the extension at a remote server without code changes.

### Core functionality

- [ ] Paste sanitization works on the current `chatgpt.com` desktop layout: pasted text is replaced inline with placeholders before the message is sent.
- [ ] Original sensitive text never reaches the ChatGPT submit payload without placeholder replacement.
- [ ] Submit is blocked when the engine is down and a previously protected prompt requires a new local check.
- [ ] A clean prompt (manually typed, no protected content) can always be sent even when the engine is down.

### Installability

- [ ] A non-developer admin can install the engine wheel and load the extension in Chrome following only the `ADMIN_GUIDE.md` instructions, without needing access to the repository source.
- [ ] `curl http://127.0.0.1:8765/health` returns `{"status": "ok"}` after installation.
- [ ] The extension can be uninstalled and the engine can be removed cleanly following the documented rollback steps.

---

## Major Criteria — Must Pass Or Be Explicitly Accepted

Failure on a major criterion without explicit acceptance triggers `Pilot passed with caveats` at best. More than two unresolved majors triggers reconsideration.

### Reliability

- [ ] Paste sanitization works consistently in at least 95% of tested paste operations (not intermittent failures without a reproducible pattern).
- [ ] Submit guard does not produce false positives on clean harmless prompts at a rate that degrades the user experience.
- [ ] Session reset from the popup clears state reliably without requiring a page reload.

### Usability

- [ ] The extension status pill correctly reflects the current state (sanitized, error, processing) for tested flows.
- [ ] Error messages are visible and actionable when the engine is unreachable or a write-back fails.
- [ ] The admin can perform session reset without referring to source code or internal documentation beyond `ADMIN_GUIDE.md`.

### Documentation

- [ ] `PILOT_SMOKE_TESTS.md` was executed and all blocker/major checks passed.
- [ ] `RELEASE_CHECKLIST.md` was completed before the wave.
- [ ] At least one operator validated `ADMIN_GUIDE.md` end-to-end in the target environment.

---

## Minor Criteria — Document And Track

Minor failures are recorded in the pilot findings log but do not block wave progression.

- Caret position after paste lands at end of sanitized text rather than original cursor position (known caveat)
- IME composition flows (Japanese/Chinese/Korean) not yet validated with real pilot users
- Session state after duplicate-tab operation may be ambiguous (known `tabId` limitation)
- Rehydration is conservative around complex rich-response layouts (known limitation)
- Response rehydration toggle visual flicker on slow connections
- File-only paste notice uses Italian-language text regardless of browser locale (localization out of scope)

---

## Quantitative Thresholds

| Metric                                            | Threshold | Action if missed                        |
| ------------------------------------------------- | --------- | --------------------------------------- |
| Blocker findings open                             | 0         | Pause pilot                             |
| Major findings open and not accepted              | ≤ 1       | Review and explicitly accept or fix     |
| Paste sanitization success rate (tested sessions) | ≥ 95%     | Investigate before next wave            |
| Admin install success (following guide only)      | 100%      | Fix guide or artifacts before next wave |
| Security boundary verified (no external contacts) | 100%      | Pause pilot immediately                 |

---

## Pilot Completion Record

To close a pilot wave, record:

- wave number and date
- environment (browser version, OS, engine version, extension version)
- list of findings with severity and status (open/accepted/fixed)
- decision: passed / passed with caveats / failed
- approver name
- artifact checksums frozen at wave start
- next action (proceed to next wave / fix and re-validate / pause)
