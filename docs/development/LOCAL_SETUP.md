# Local Setup

## Required Versions

- Python `>= 3.12`
- Node `20.19.0` preferred
- pnpm `9.15.0` preferred

The repository can bootstrap a repo-local Node runtime and repo-local `pnpm` under `.tooling/` if the system runtime is older.

## Bootstrap

```bash
./scripts/bootstrap.sh
```

Expected local state after bootstrap:

- `node_modules/`
- `.venv/`
- `.tooling/node20/`
- `.tooling/pnpm/`
- `.pnpm-store/`

## Start Commands

- engine only:

```bash
pnpm dev:engine
```

- extension only:

```bash
pnpm dev:extension
```

- both:

```bash
pnpm dev
```

## Build Commands

- all release artifacts:

```bash
pnpm build
```

- extension zip:

```bash
pnpm build:extension:zip
```

- engine wheel/sdist only:

```bash
pnpm build:engine
```

## Playwright Notes

- default local e2e target: `pnpm test:e2e`
- fallback in sandboxed Linux environments:

```bash
PLAYWRIGHT_BROWSER=firefox ./scripts/test.sh e2e
```

- if both Chromium and Firefox automation are blocked by the host sandbox, run the e2e suite in CI or in a less restricted local environment
