# Security Policy

## Scope

This repository is designed for local-only pseudonymization of pasted ChatGPT Web content. Sensitive text must never leave the user device except through the user's normal ChatGPT interaction after pseudonymization has already happened.

## Supported Security Posture

The maintained security baseline assumes:

- browser extension and local engine are from the same repo version line
- the local engine binds only to `127.0.0.1`
- settings keep the engine URL on `http://127.0.0.1:<port>`
- reversible mappings remain encrypted at rest
- raw clipboard text and decrypted mappings are not logged

## Security Controls

- strict localhost-only engine binding enforced in code
- no remote sanitization services, telemetry, or analytics
- encrypted session persistence with installation secret, derived session secret, and record-scoped DEK
- submit guard blocks unsanitized or stale content; PARTITA_IVA detection uses checksum validation to prevent false positives on ticket numbers and phone numbers; payment card detection now uses Luhn validation in the submit guard as well as the engine
- extended detectors cover IPv6 addresses, dates of birth (labeled context), national identifiers (passport, residence permit), and street addresses (labeled context) — all with explicit keyword requirements to control false positives
- local response rehydration only mutates the current DOM
- shared contracts in `packages/contracts` reduce schema drift between extension and engine
- CI covers engine unit/integration, extension unit/integration, and fixture-based e2e
- engine endpoints protected by bearer-token middleware (token generated at startup, surfaced via health endpoint)
- IBAN detection uses full MOD-97 checksum (ISO 13616); payment card detection uses Luhn algorithm + BIN-prefix filter
- secrets detector covers AWS access keys, GitHub/GitLab PATs, Stripe keys, npm tokens, Google API keys, JWTs, PEM private keys, Bearer tokens, and database connection strings

## Known Security Limitations

- manual typing after sanitization can still introduce sensitive text; the contextual heuristic detector helps catch labeled names and usernames but is not exhaustive
- text-node-based rehydration remains conservative and not structure-aware for every rich response layout
- local browser compromise or malicious extension interference is outside the app's control
- duplicate-tab isolation depends on a valid browser `tabId`

## Reporting A Security Issue

Do not open public issues with sensitive examples, raw logs, or real production secrets.

Instead, provide:

- affected component
- repo version or commit reference
- reproduction steps with synthetic data
- observed impact
- expected secure behavior

When triaging, prefer synthetic fixtures and never paste real confidential material into the issue description.
