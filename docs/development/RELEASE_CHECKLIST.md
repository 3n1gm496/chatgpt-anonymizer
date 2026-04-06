# Release Checklist

## Pilot Release: v0.1.0-enterprise-pilot

Complete this checklist before tagging and distributing each pilot wave.

---

## 1. Versioning And Notes

- [ ] root `package.json` version is `0.1.0`
- [ ] `apps/extension/package.json` version is `0.1.0`
- [ ] `packages/contracts/package.json` version is `0.1.0`
- [ ] `services/local-engine/pyproject.toml` version is `0.1.0`
- [ ] `CHANGELOG.md` entry for this release is present and accurate
- [ ] `RELEASE_NOTES_v0.1.0-enterprise-pilot.md` is current (known caveats documented)
- [ ] `README.md` reflects pilot scope and out-of-scope items
- [ ] `RELEASE_READINESS_REPORT.md` contains an explicit pilot recommendation

---

## 2. Test Matrix

- [ ] `pnpm lint` passes (zero lint errors)
- [ ] `pnpm test:unit` passes (all 54 unit/integration tests)
- [ ] Python engine tests pass: `./.venv/bin/python -m pytest services/local-engine/tests -q`
- [ ] `pnpm test:e2e` passes (all 12 e2e fixture tests)
- [ ] CI workflows are configured and passing in the target CI environment:
  - [ ] `ci-contracts-extension`
  - [ ] `ci-engine`
  - [ ] `ci-e2e`
  - [ ] `release-readiness`

---

## 3. Build Artifacts

- [ ] `pnpm build` completes without errors
- [ ] `packages/contracts/dist/` exists and contains `index.js` and `index.d.ts`
- [ ] `apps/extension/.output/chrome-mv3/` exists and contains `manifest.json`
- [ ] `apps/extension/.output/chrome-mv3/manifest.json` contains the correct version (`0.1.0`) and host permissions
- [ ] `pnpm build:extension:zip` (or `pnpm build:extension && pnpm package`) completes
- [ ] `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip` exists
- [ ] `services/local-engine/dist/` exists and contains:
  - [ ] `chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl`
  - [ ] `chatgpt_anonymizer_local_engine-0.1.0.tar.gz`

---

## 4. Artifact Checksums

Record checksums before distributing. Use `sha256sum` on Linux/macOS:

```bash
sha256sum apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip
sha256sum services/local-engine/dist/chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl
sha256sum services/local-engine/dist/chatgpt_anonymizer_local_engine-0.1.0.tar.gz
```

- [ ] Extension zip checksum recorded: `sha256: ________________________`
- [ ] Engine wheel checksum recorded: `sha256: ________________________`
- [ ] Engine sdist checksum recorded: `sha256: ________________________`
- [ ] Checksums archived in the internal release ticket

---

## 5. Manual Smoke Checks

All smoke tests from [PILOT_SMOKE_TESTS.md](PILOT_SMOKE_TESTS.md) must pass before signing and distributing.

- [ ] S1 — Engine health and popup state: pass
- [ ] S2 — Paste sanitization (paste-first, placeholders appear immediately): pass
- [ ] S3 — Submit allowed when protected prompt is unchanged and engine is down: pass
- [ ] S4 — Submit blocked when engine down and new check required: pass
- [ ] S5 — Stale-after-edit submit blocking with engine running: pass
- [ ] S6 — Harmless append does not block submit: pass
- [ ] S7 — Low-confidence review flow: pass / caveat noted
- [ ] S8 — Response rehydration toggle: pass
- [ ] S9 — Session reset: pass
- [ ] S10 — Manual clean prompt is sendable with engine down: pass
- [ ] S11 — File limitation notice shown: pass / caveat noted
- [ ] S12 — Extension popup state after reload: pass / caveat noted

---

## 6. Security Review

- [ ] engine still binds only to `127.0.0.1` (verified from `curl /health` → `"bind": "127.0.0.1"`)
- [ ] no newly introduced raw-text logging (grep engine and extension source for new `console.log`, `logger.info` calls with text/content parameters)
- [ ] extension settings still reject non-localhost engine URLs
- [ ] `SECURITY.md` reflects current behavior — no drift from the documented security controls
- [ ] no new external network calls in the extension source (grep for `fetch`, `XMLHttpRequest`, `chrome.runtime.sendMessage` to external origins)

---

## 7. Known Caveats Approved

The following known caveats must be explicitly accepted by the pilot owner before distribution:

- [ ] IME composition flows not validated with real Japanese/Chinese/Korean users
- [ ] Caret position after paste lands at end of sanitized text (expected behavior, not a bug)
- [ ] Playwright e2e is fixture-based, not packaged-extension-in-browser
- [ ] Extension signing and enterprise browser policy rollout are manual
- [ ] Duplicate-tab session isolation depends on browser `tabId`; `tabId = 0` fallback is weaker

**Pilot owner sign-off:** \***\*\*\*\*\***\_\_\_\***\*\*\*\*\*** Date: \***\*\_\_\_\*\***

---

## 8. Signing And Distribution

- [ ] extension zip is signed with the enterprise-approved signing process for the target browser
- [ ] signed extension and engine wheel are distributed only through the approved internal channel
- [ ] install instructions (`ADMIN_GUIDE.md`) are included with the distribution package
- [ ] pilot invite communication states text-only scope and local-engine requirement

---

## 9. Release Tag

- [ ] git tag `v0.1.0-enterprise-pilot` is created on the release commit
- [ ] tag is annotated: `git tag -a v0.1.0-enterprise-pilot -m "Enterprise pilot release v0.1.0"`
- [ ] tag is pushed to the internal repository: `git push origin v0.1.0-enterprise-pilot`
- [ ] release ticket references the tag, artifact checksums, and pilot approver

---

## Build Commands Reference

```bash
# Full build
pnpm build

# Extension zip only
pnpm build:extension:zip

# Engine wheel only
./.venv/bin/python -m build --no-isolation services/local-engine --outdir services/local-engine/dist

# Full test suite
pnpm test

# Checksums
sha256sum apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip
sha256sum services/local-engine/dist/chatgpt_anonymizer_local_engine-0.1.0-py3-none-any.whl
```
