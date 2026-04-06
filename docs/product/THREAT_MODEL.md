# Threat Model

## Protected Assets

- raw clipboard text captured from paste/drop events
- sanitized composer text before submit
- placeholder-to-original mappings
- installation secret stored locally
- derived session secrets held in memory
- record-scoped data encryption keys used for persisted blobs
- current session metadata in browser local storage
- locally rehydrated DOM content
- low-confidence review state held in memory during review

## Plausible Attackers

- malware or local users with filesystem access to the workstation
- another browser extension with excessive privileges
- a developer or operator accidentally enabling insecure logging or non-local endpoints
- a remote service that would receive unsanitized text if the guardrails failed
- a user workflow error such as editing or typing sensitive text after sanitization

## Trust Boundaries

- trusted:
  - browser extension runtime from this repository
  - local engine process bound to `127.0.0.1`
  - local encrypted storage under the engine data directory
- untrusted:
  - remote web pages
  - remote networks and cloud services
  - browser sync and third-party storage surfaces
  - CI logs and artifacts unless explicitly curated

## Implemented Controls

- localhost-only binding is enforced in `EngineSettings`
- the extension validates engine base URL so it remains on `http://127.0.0.1:<port>`
- no raw clipboard text, sanitized full text, or decrypted mappings are logged
- session persistence uses installation secret -> session secret -> record-scoped DEK derivation
- AES-GCM protects persisted session blobs
- submit guard blocks `stale_after_edit` and `engine_unreachable` when a protected prompt needs a new local check, while allowing harmless manual additions
- review decisions persist without persisting extra raw text
- response rehydration is local DOM-only and reversible
- contracts are centralized in `packages/contracts` to reduce protocol drift

## Key Security Risks

| Risk                                  | Impact                                         | Implemented control                                             |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Engine binds beyond localhost         | Sensitive text exposed on the network          | Hard fail if host is not `127.0.0.1`                            |
| Raw text reaches logs                 | Data leakage on disk or CI                     | Structured safe logging and explicit no-raw-text rule           |
| Encrypted mapping stolen from disk    | Placeholder re-identification                  | AES-GCM with local root secret and restrictive file permissions |
| Composer changes after sanitization   | Unsanitized text could be submitted            | Fingerprint-aware submit guard plus change-ratio check          |
| Duplicate tabs reuse the same mapping | Cross-tab correlation or wrong revert behavior | Tab-scoped conversation identity                                |
| Rehydration persists sensitive text   | Sensitive data escapes local view              | No persistence of rehydrated content beyond current DOM session |

## Residual Risks

- a user can manually type new secrets after sanitization
- complex markdown widgets, code blocks, and tables are only conservatively handled during rehydration
- browser compromise or hostile local extensions remain outside the product trust boundary
- local admin or malware with runtime memory access can still observe plaintext while the app is running

## Future Controls

- stronger structure-aware rehydration for code blocks and complex rich responses
- optional enterprise packaging for locked-down engine startup and upgrades
- additional safe diagnostics around protocol/version mismatch without increasing sensitive logging
