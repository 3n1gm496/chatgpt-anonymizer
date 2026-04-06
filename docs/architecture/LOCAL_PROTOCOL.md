# Localhost Protocol

All localhost payloads carry `protocolVersion: "v1"` and are intended for `http://127.0.0.1:8765`.

## GET /health

Response fields:

- `protocolVersion`
- `status`: `ok | degraded`
- `engineVersion`
- `bind`
- `mlEnabled`
- `detectors`
- `storage.encrypted`
- `storage.dataDir`
- `uptimeSeconds`

## POST /sanitize

Request:

- `protocolVersion`
- `conversationId`
- `sessionId` optional
- `text`
- `detectedContentType`: `paste | drop | manual`
- `exclusions`: array of finding ids to keep untouched
- `options.enableMl`
- `options.sessionTtlMinutes`

Response:

- `protocolVersion`
- `sessionId`
- `sanitizedText`
- `sanitizedFingerprint`
- `expiresAt`
- `findings[]`
- `replacements[]`
- `riskSummary`

`findings[]` include `id`, `entityType`, `originalText`, `placeholder`, `detector`, `confidence`, `confidenceLevel`, `start`, `end`, `reviewRecommended`, and optional `rationale`.

`replacements[]` include `findingId`, `start`, `end`, `originalText`, `placeholder`, `confidence`, `applied`, and `entityType`.

## POST /revert

Request:

- `protocolVersion`
- `sessionId`
- `text`

Response:

- `protocolVersion`
- `sessionId`
- `revertedText`
- `totalReplacements`
- `replacements[]` with `placeholder`, `originalText`, and `count`

## POST /sessions/reset

Request accepts either:

- `sessionId`
- or `conversationId`

Response:

- `protocolVersion`
- `reset`
- `sessionId`
- `conversationId`
- `clearedMappings`

## GET /sessions/{id}

Response:

- `protocolVersion`
- `sessionId`
- `conversationId`
- `createdAt`
- `updatedAt`
- `expiresAt`
- `mappingCount`
- `replacementCount`
- `lowConfidenceCount`
- `reviewPending`
