# Architectural Decisions

## ADR-001: Extension-First UX

Decision: build the product around a browser extension instead of a separate web app.

Why:

- privacy protection must happen before ChatGPT submit
- users want minimal workflow disruption
- the browser already hosts the composer and rendered responses

## ADR-002: Localhost Protocol With Shared Contracts

Decision: define a versioned localhost protocol in `packages/contracts` and mirror it in Python models.

Why:

- extension and engine must evolve safely together
- tests can validate payload compatibility
- docs and code can stay aligned around one protocol source

## ADR-003: Deterministic Placeholders Per Session

Decision: placeholders remain stable only inside the current session boundary.

Why:

- consistency improves readability
- limiting stability to a session reduces long-term correlation risk

## ADR-004: Encrypted Mapping At Rest

Decision: encrypt session payloads with AES-GCM using an installation secret on disk, a derived session secret in memory, and a record-scoped DEK per persisted blob.

Why:

- plaintext mapping on disk is too risky
- installation-secret derivation is simpler than user-managed passphrases in MVP
- record-scoped DEKs let the store rotate nonce and derivation salt per blob without changing the root model

## ADR-005: Text-First MVP

Decision: scope MVP to pasted and dropped text only.

Why:

- file parsing would add large attack surface and complexity
- composer protection is the urgent workflow need

## ADR-006: No Engine-Down Override In MVP

Decision: block submit when sanitization cannot be guaranteed.

Why:

- safety must be the default
- override UX without policy controls would create silent leakage risk

## ADR-007: Tab-Scoped Conversation Identity

Decision: treat the engine conversation scope as `tab:{tabId}:{conversationId}` instead of only the ChatGPT conversation id.

Why:

- duplicated tabs must not silently share the same reversible mapping
- a tab reload may reuse the same ChatGPT conversation while still needing deterministic local-session isolation
- the popup, content script, and engine need one explicit scope invariant

## ADR-008: Submit Guard As A State Machine

Decision: model submit eligibility with explicit states instead of a binary boolean.

States:

- `never_sanitized`
- `sanitized_current`
- `stale_after_edit`
- `engine_unreachable`

Why:

- guard failures need to be debuggable and testable without a live DOM
- UI messaging should map to a stable reason, not ad hoc string assembly
- coding agents can evolve guard behavior more safely when the state space is explicit

## ADR-009: Review Decisions Stay In Session State

Decision: low-confidence review decisions are persisted in the active extension session state, while original raw text stays only in the in-memory review draft.

Why:

- decisions must survive drawer rerenders and repeated apply operations
- the apply flow must be idempotent from the original text baseline
- persisting only decisions avoids storing extra raw sensitive text in browser storage

## ADR-010: Rehydration Is DOM-Local And Text-Node Based

Decision: response rehydration only mutates local DOM text nodes and keeps a reversible snapshot per rendered response container.

Why:

- this keeps the privacy boundary on the user device
- repeated toggles must be reversible without persisting rehydrated output
- a conservative text-node strategy is safer for MVP than trying to own all ChatGPT widget semantics
