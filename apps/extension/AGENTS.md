# Module Ownership

Owns browser extension behavior: ChatGPT DOM adapter, paste interception (Paste-First strategy), submit guard, popup/options UX, response rehydration, and non-sensitive session metadata.

## Current Phase

Feature freeze — `v0.1.0-enterprise-pilot`. See root `AGENTS.md` for the pilot hotfix protocol.

## Local Commands

- dev: `pnpm --filter @chatgpt-anonymizer/extension dev`
- build prod: `pnpm --filter @chatgpt-anonymizer/extension build:prod`
- package zip: `pnpm --filter @chatgpt-anonymizer/extension package`
- tests: `pnpm --filter @chatgpt-anonymizer/extension test`

## Responsibility Boundaries

- keep ChatGPT DOM discovery in `src/chatgpt/selectors.ts`
- keep read/write/clear/submit logic in `src/chatgpt/composerAdapter.ts`
- keep paste interception and sanitization flow in `src/chatgpt/pasteInterceptor.ts`
- keep submit guard state machine in `src/chatgpt/submitGuard.ts`
- keep review/session business logic in services or hooks, not in presentational components
- keep only non-sensitive workflow metadata in browser storage
- keep all engine calls pointed at `127.0.0.1`

## Paste-First Strategy — Do Not Break

The paste interceptor (`pasteInterceptor.ts`) is the primary protection path:

1. `handlePaste` / `handleDrop` calls `event.preventDefault()` before anything else
2. Text is sent to the local engine via `sanitize()`
3. `replaceComposerText(fullComposerText)` writes the sanitized result back
4. Read-back verification (`getComposerText()` comparison) confirms the DOM persisted the write
5. If either step 3 or step 4 fails, an error is thrown and shown to the user

The IME composition guard (`isComposing` flag gated by `compositionstart`/`compositionend`) must remain intact.

The submit guard is a secondary safety net for typed text only — it must not become the primary paste path.

## Known Fragilities

- ChatGPT DOM drift can invalidate selectors and composer heuristics — loose fallback strategies are active but require monitoring
- runtime `tabId` fallback to `0` is weaker than the normal tab-scoped isolation path
- rehydration is intentionally conservative on complex rich responses
- IME composition flows implemented but not validated with real pilot users

## Do Not Touch From Here

- do not add bypass paths in the paste interceptor
- do not remove write-back verification or read-back comparison
- do not remove loose selector strategies (they cover form-less ChatGPT DOM variants)
- do not reimplement detector or crypto logic in the extension
- do not store reversible mappings in browser storage
- do not add remote network calls or broaden engine URL trust beyond localhost
- do not place business logic into `ReviewDrawer.tsx` or other UI-only components

## Minimum Tests Before Merge

- composer adapter fixture coverage across all variants including no-form and prompt-textarea-testid
- submit-guard coverage for stale, never-sanitized, engine-unreachable, and broadened click detection states
- paste interceptor coverage: IME guard, write-back failure, DOM mismatch, paste-with-files
- response rehydration integration coverage when DOM overlay logic changes

Run: `pnpm --filter @chatgpt-anonymizer/extension test`

## Release Rules

- build must still produce `apps/extension/.output/`
- package zip path must remain `apps/extension/.output/chatgpt-anonymizer-extension-0.1.0-chrome.zip`
- popup/options UX changes must keep engine status and current session visibility clear
- manifest.json must not add new host permissions without a security review
