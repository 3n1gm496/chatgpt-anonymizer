# Pilot Feedback Template

Use this template to report findings from a `v0.1.0-enterprise-pilot` test session. One form per session or per distinct issue.

---

## Reporter Information

- **Date:** YYYY-MM-DD
- **Browser and version:** (e.g. Chrome 126.0.6478.127)
- **OS:** (e.g. macOS 14.5 / Windows 11 / Ubuntu 24.04)
- **Engine version:** (from `curl -s http://127.0.0.1:8765/health` → `engineVersion`)
- **Extension version:** (from `chrome://extensions`)

---

## Session Setup

- **Engine started:** yes / no
- **Engine health before session:** ok / unreachable / error (paste response if not ok)
- **Extension loaded from:** unpacked build / signed zip / other
- **ChatGPT UI observed:** standard web / anything unusual

---

## Scenario Tested

Describe what you were testing. Reference the smoke test number if applicable (e.g. S2 — Paste Sanitization).

```
[describe the scenario]
```

**Synthetic text used (never real PII):**

```
[paste the exact test string here]
```

---

## Outcome

- **Result:** pass / fail / partial / unexpected behavior

**Description of what happened:**

```
[describe what you observed]
```

---

## Bug Or Issue Details

_(Skip this section if the result was a clean pass)_

**Frequency:** every time / intermittent / once only

**Steps to reproduce:**

1.
2.
3.

**Expected behavior:**

```
[what should have happened]
```

**Actual behavior:**

```
[what actually happened]
```

**Console errors or logs (sanitized — no real PII):**

```
[paste relevant lines, remove any sensitive content]
```

**Screenshot available:** yes / no (attach separately if yes)

---

## Classification

Select the most specific category that applies:

- [ ] **Functional bug** — a required pilot flow does not work as specified
- [ ] **UX issue** — the flow works but is confusing, slow, or produces unexpected visual output
- [ ] **Deployment issue** — installation, loading, or configuration did not follow documented steps
- [ ] **False positive** — the extension anonymized text that should not have been anonymized
- [ ] **False negative** — the extension missed sensitive text that should have been anonymized
- [ ] **Known limitation** — the issue is already documented in the release notes or known caveats
- [ ] **Performance issue** — the flow worked correctly but with unacceptable delay

---

## Severity Assessment

- [ ] **Blocker** — the issue prevents the tested pilot flow from completing and has no workaround
- [ ] **Major** — the issue degrades a required pilot flow but a workaround exists
- [ ] **Minor** — the issue is an annoyance or edge case that does not block required flows
- [ ] **Informational** — observation with no negative impact; included for completeness

---

## Security Observation

_(Complete only if you observed a potential security issue)_

- [ ] Raw sensitive text appeared in a log, console output, or network request
- [ ] The engine appeared to receive requests from a non-localhost origin
- [ ] Sanitized text was submitted to ChatGPT without placeholder replacement
- [ ] Other (describe):

**If any security observation is checked:** escalate immediately to the pilot security contact before sharing this form broadly.

---

## Additional Context

```
[any other relevant information — browser extensions installed, VPN, proxy, corporate firewall, etc.]
```
