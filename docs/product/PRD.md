# Product Requirements Document

## Problem

Users want to work inside ChatGPT Web with logs, tickets, snippets, and internal notes, but they cannot safely paste raw operational data into a remote model. The old batch-style tool interrupts the workflow and assumes file-oriented review, not inline browser usage.

## Product Goal

Provide a desktop-browser workflow that pseudonymizes sensitive text locally before any content is submitted to ChatGPT Web.

## Primary User

- engineers and analysts who paste logs, incidents, shell output, tickets, or short reports into ChatGPT
- privacy-conscious teams that need a strict localhost trust boundary

## Core Jobs To Be Done

- sanitize pasted text inline with minimal friction
- block unsafe submit when sanitization is missing or stale
- keep reversible mappings only on the user machine
- let the user rehydrate placeholders locally when interpreting model output

## Non-Goals

- enterprise user management
- centralized policy admin
- server-side storage or review queues
- file batch processing and reporting UI

## MVP Success Criteria

- pasted text is sanitized before it can be sent
- engine-down state clearly blocks submit only when the current prompt needs a fresh local check
- session mappings survive short browser and engine restarts
- low-confidence findings can be reviewed inline
- users can toggle local rehydration for known placeholders

## Functional Requirements

1. Intercept paste and text drop events on ChatGPT Web.
2. Send plain text only to `127.0.0.1`.
3. Replace composer content with sanitized text.
4. Persist encrypted mapping per conversation/tab session.
5. Block submit if previously protected content becomes stale or requires a fresh local check while the engine is unavailable.
6. Offer lightweight review for low-confidence findings.
7. Offer local-only response rehydration.

## Quality Requirements

- selectors resilient to DOM drift
- deterministic placeholder generation within a session
- no raw text in logs
- clear module boundaries and testability

## Risks

- ChatGPT DOM changes can break composer access
- overly aggressive replacements can hurt prompt quality
- local engine availability becomes a user workflow dependency

## MVP Exit Criteria

- end-to-end local paste sanitization works on a realistic fixture
- health, sanitize, revert, and session APIs are stable
- CI covers extension, engine, and e2e paths separately
