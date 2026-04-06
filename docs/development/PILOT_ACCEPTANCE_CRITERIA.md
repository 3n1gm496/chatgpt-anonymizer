# Pilot Acceptance Criteria

## Acceptance Decision

`v0.1.0-enterprise-pilot` is accepted for pilot continuation only if all required criteria below are met.

## Product Criteria

- paste sanitization works on supported ChatGPT Web desktop flows
- submit is blocked when the engine is unreachable
- submit is blocked after meaningful edits following sanitization
- low-confidence review decisions are deterministic and persist within the current session scope
- response rehydration remains local to the browser DOM and can be toggled off cleanly

## Security Criteria

- local engine binds only to `127.0.0.1`
- no raw input text or full sanitized text is written to logs
- no sanitization data is sent to remote services
- encrypted mapping persistence remains enabled for stored session mappings
- pilot deployment instructions do not require insecure overrides

## Operational Criteria

- signed extension artifact is available for the target browser
- engine wheel or approved install package is available for pilot distribution
- smoke matrix passes in the target pilot environment
- support operators can verify engine health and perform session reset without code changes

## Quality Criteria

- `./scripts/lint.sh` passes
- `./scripts/test.sh unit` passes
- `./scripts/build.sh all` passes
- `./scripts/build.sh extension:zip` passes
- CI workflows remain configured for contracts/extension, engine, e2e, and release readiness

## Documentation Criteria

- README reflects pilot scope and out-of-scope items
- release notes and changelog are published for the pilot label
- rollout plan, smoke tests, and troubleshooting guides are available to operators
- release readiness report contains an explicit pilot recommendation

## Rejection Criteria

Reject or pause the pilot if any of the following occurs:

- the engine accepts non-localhost binding in the approved pilot configuration
- submit blocking fails open on engine outage
- sanitized content can bypass the local-only processing boundary
- rollout requires undocumented manual steps that operators cannot reproduce
- blocker issues remain open on any required pilot flow
