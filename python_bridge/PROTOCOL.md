# Generals Helper Python Bridge Protocol

This document defines the local HTTPS-first contract between the browser extension and the Python analysis bridge. HTTP remains available as an explicit fallback for local development.

## Base URL

By default, the bridge listens on HTTPS:

```text
http://127.0.0.1:8765
```

If you start the server without `--certfile` and `--keyfile`, it falls back to HTTP. For the normal HTTPS path, the same endpoints are available over:

```text
https://127.0.0.1:8765
```

> Local HTTPS usually requires a certificate trusted by your OS/browser, especially for `localhost` / `127.0.0.1`.

## Content Type

All request and response bodies use JSON encoded as UTF-8.

## Endpoints

### `GET /healthz`

Health check endpoint.

#### Response

```json
{
  "ok": true,
  "service": "generals-helper-python-bridge",
  "version": "v1"
}
```

---

### `POST /v1/ingest`

Upload one structured battle snapshot.

#### Request body

```json
{
  "type": "battle_snapshot",
  "source": "extension",
  "snapshot": {
    "gameId": "game-123",
    "matchId": "game-123",
    "turn": 42,
    "playerCount": 2,
    "aliveCount": 2,
    "players": [
      {
        "index": 0,
        "alive": true,
        "dead": false,
        "total": 120,
        "raw": { "total": 120, "dead": false }
      }
    ],
    "board": {
      "width": 18,
      "height": 18,
      "isComplete": true,
      "armyTable": [[10, 11]],
      "stateTable": [[1, 2]],
      "cells": [[{ "x": 0, "y": 0, "army": 10, "state": 1 }]],
      "trailingValues": []
    },
    "battle": {
      "mapDiff": [2, 1, 99, 11],
      "citiesDiff": [],
      "desertsDiff": [],
      "mapDiffPatch": null,
      "mapDiffInitial": null
    },
    "frame": {
      "id": "...",
      "tabId": 8,
      "frameId": 0,
      "direction": "inbound",
      "size": 128,
      "url": "https://generals.io/",
      "category": "event",
      "battleSummary": "Turn42 | Players2/2",
      "inMatch": true,
      "matchId": "game-123"
    },
    "summary": "optional display text"
  }
}
```

`battle` can be used as an alias of `snapshot`.

The browser extension may also send the full snapshot object at the top level of the request body. In that case, the server accepts the raw object directly as long as it contains the snapshot fields such as `board`, `players`, `turn`, and `frame`.

#### Required fields

- `type` must be `battle_snapshot`
- `snapshot`, `battle`, or a raw top-level snapshot object must be present
- `players` is a normalized list, but the analyzer also accepts raw player objects under `raw`
- `board` may include `cells`, `armyTable`, `stateTable`, and `trailingValues`

#### Response

```json
{
  "ok": true,
  "record": {
    "id": 1,
    "receivedAt": "2026-04-15T12:00:00+00:00",
    "source": "extension",
    "gameId": "game-123",
    "turn": 42,
    "summaryText": "game=game-123 | turn=42 | board=18x18 | players=2 | alive=2",
    "hasWarnings": false
  },
  "analysis": {
    "gameId": "game-123",
    "turn": 42,
    "summaryText": "game=game-123 | turn=42 | board=18x18 | players=2 | alive=2",
    "playerSummary": {
      "playerCount": 2,
      "aliveCount": 2,
      "valueStats": {
        "min": 98,
        "max": 120,
        "total": 218,
        "gap": 22,
        "average": 109.0
      }
    },
    "boardSummary": {
      "width": 18,
      "height": 18,
      "cellRows": 1,
      "cellColumns": 3,
      "hasCells": true,
      "occupiedCells": 1,
      "expectedCells": 324
    },
    "notes": [],
    "hasWarnings": false
  },
  "historySize": 1
}
```

#### Status codes

- `201 Created` on success
- `400 Bad Request` for invalid JSON or invalid payload

---

### `GET /v1/latest`

Return the latest stored record.

#### Response

```json
{
  "ok": true,
  "record": {
    "id": 1,
    "receivedAt": "2026-04-15T12:00:00+00:00",
    "source": "extension",
    "gameId": "game-123",
    "turn": 42,
    "snapshot": { "...": "full payload" },
    "analysis": { "...": "derived summary" }
  }
}
```

If there is no data yet, `record` is `null`.

---

### `GET /v1/analysis/latest`

Return only the latest analysis object.

#### Response

```json
{
  "ok": true,
  "analysis": {
    "summaryText": "..."
  }
}
```

If there is no data yet, `analysis` is `null`.

---

### `GET /v1/history?limit=25`

Return recent record summaries.

#### Query parameters

- `limit` - optional integer, default `25`

#### Response

```json
{
  "ok": true,
  "records": [
    {
      "id": 1,
      "receivedAt": "2026-04-15T12:00:00+00:00",
      "source": "extension",
      "gameId": "game-123",
      "turn": 42,
      "summaryText": "...",
      "hasWarnings": false
    }
  ]
}
```

## CORS

The bridge returns permissive CORS headers so the browser extension can call it directly from extension pages.

