# ChatGPT Anonymizer Local Engine

FastAPI service bound to `127.0.0.1` that receives pasted text from the browser extension, detects sensitive values, stores reversible mappings in encrypted local state, and supports local rehydration through the shared localhost protocol.

Run locally after dev install:

```bash
chatgpt-anonymizer-engine
```
