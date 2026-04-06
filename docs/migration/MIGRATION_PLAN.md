# Migration Plan

## Goal

Carry forward the reliable anonymization core from the old tool while removing batch, SPA, and deployment-heavy assumptions.

## Phase 1: Contract And Boundary Definition

- define localhost protocol in `packages/contracts`
- create engine-side API and domain models
- document what is reused versus discarded

## Phase 2: Engine Core Extraction

- port regex and dictionary detection concepts
- port deterministic pseudonymization behavior
- replace export-passphrase mapping encryption with installation-secret storage
- add session manager for conversation/tab flows

## Phase 3: Browser Workflow

- implement DOM adapter and paste interception
- replace separate review UI with inline drawer
- add submit guard and response rehydration

## Phase 4: Test Hardening

- unit coverage for crypto, session handling, regex detection, replacement planning
- adapter smoke tests on representative fixtures
- Playwright coverage for end-to-end flows

## Explicitly Removed During Migration

- batch queues
- file processing pipeline
- report generation
- auth and user management
- centralized deployment topology
