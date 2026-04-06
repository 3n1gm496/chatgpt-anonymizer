# UX Flows

## Paste Sanitization

1. User pastes into the ChatGPT composer.
2. Extension prevents the native paste from committing raw text.
3. A local-only processing state appears near the composer.
4. Sanitized text replaces the composer contents.
5. A status pill confirms local anonymization and replacement count.

## Engine Down Submit Block

1. User tries to submit without a reachable local engine.
2. Extension blocks the submit action.
3. An inline message explains that local anonymization is mandatory in MVP.
4. The user can retry after the engine becomes healthy.

## Low-Confidence Review

1. Sanitization finishes with low-confidence or ambiguous findings.
2. A compact drawer opens from the page edge.
3. Each item shows entity type, placeholder, confidence, and detector.
4. The user accepts or excludes specific replacements.
5. Composer text updates immediately after review choices.

## Response Rehydration

1. ChatGPT returns a response that includes known placeholders.
2. User toggles "Show original values" for a rendered answer.
3. Extension resolves placeholders locally through the current session mapping.
4. DOM text nodes update in place without persisting the reverted text.
5. Toggling off restores the original rendered placeholder view.

## Session Reset

1. User opens popup on the active ChatGPT tab.
2. Popup shows session health, TTL, and mapping counts.
3. User triggers reset.
4. Extension clears local state and requests engine session reset.
