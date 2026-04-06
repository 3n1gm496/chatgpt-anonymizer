# Pilot Rollout Plan

## Objective

Roll out `v0.1.0-enterprise-pilot` to a controlled desktop-user cohort while preserving the local-only privacy boundary and keeping operational risk low.

## Pilot Wave Structure

1. Internal validation wave
   Scope: engineering and security operators only.
   Exit gate: smoke matrix passes and artifact checksums are recorded.
2. Limited user wave
   Scope: a small approved cohort of pilot users.
   Exit gate: no blocker issue on required flows and support handling is understood.
3. Expanded pilot wave
   Scope: a broader but still controlled enterprise cohort.
   Exit gate: pilot acceptance criteria met and manual distribution process considered stable.

## Pre-Rollout Tasks

- freeze pilot artifacts and checksums
- sign the extension for the target browser
- publish the approved engine package to the internal distribution channel
- confirm [PILOT_SMOKE_TESTS.md](/home/administrator/tools/chatgpt-anonymizer/docs/development/PILOT_SMOKE_TESTS.md) passes in the target environment
- confirm rollback instructions are available to the operators

## Rollout Execution

### Wave 1: Internal Validation

- install the engine and extension on operator devices
- validate popup health, submit blocking, review drawer, and rehydration flows
- collect any environment-specific browser or host constraints

### Wave 2: Limited Pilot

- distribute the signed extension and engine package to the approved cohort
- provide install and reset instructions
- ask users to validate one synthetic prompt before real usage
- review issues daily during the initial adoption period

### Wave 3: Expanded Pilot

- expand only if Wave 2 shows no blocker on required flows
- keep the same artifacts; do not introduce mid-wave code changes unless a blocker fix is approved
- repeat the smoke matrix after any environment or browser-policy change

## Rollback Plan

- disable or remove the extension from pilot users
- uninstall the local engine package
- clear local engine data directories if required by the incident response decision
- revert browser policy distribution to the previous approved state

## Communications

- pilot invite message should state text-only scope and local-engine requirement
- support instructions should include engine health verification and session reset steps
- any issue affecting submit blocking or local-only processing is treated as high priority

## Exit Conditions For Pilot Completion

- pilot acceptance criteria satisfied
- operator documentation validated in practice
- no unresolved blocker affecting the required pilot flows
- decision recorded on whether to proceed to a broader release wave
