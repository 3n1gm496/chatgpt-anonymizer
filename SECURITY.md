# Security Policy

## Scope

This repository is designed for local-only anonymization of pasted ChatGPT Web content. Sensitive text must never leave the user device except through the user's normal ChatGPT interaction after anonymization has already happened.

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
- submit guard blocks unsanitized or stale content
- local response rehydration only mutates the current DOM
- shared contracts in `packages/contracts` reduce schema drift between extension and engine
- CI covers engine unit/integration, extension unit/integration, and fixture-based e2e

## Known Security Limitations

- manual typing after sanitization can still introduce sensitive text
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
