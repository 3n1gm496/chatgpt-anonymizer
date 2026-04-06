# Module Ownership

This package owns the versioned localhost API contracts and browser-runtime message schemas shared by the extension.

# Local Commands

- `pnpm --filter @chatgpt-anonymizer/contracts build`
- `pnpm --filter @chatgpt-anonymizer/contracts test`
- `pnpm --filter @chatgpt-anonymizer/contracts lint`

# Responsibility Boundaries

- Define payload shapes, enums, and runtime validation for the localhost protocol.
- Define extension runtime message schemas used across popup, background, and content script.
- Keep protocol versioning explicit and backwards-safe.

# Do Not Touch From Here

- Do not add engine-only business logic.
- Do not encode ChatGPT DOM assumptions here.
- Do not depend on WXT, React, or FastAPI internals.

# Minimum Tests Before Merge

- Validate at least one sample for `/health`, `/sanitize`, `/revert`, and session payloads.
- Validate runtime message schemas for context and reset flows.
