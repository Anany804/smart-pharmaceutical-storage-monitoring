# REST API

Base URL in local Node-RED mode: `http://127.0.0.1:1880`. All success and error bodies are JSON. Timestamps are UTC ISO 8601 strings. Requests with JSON bodies must use `Content-Type: application/json`.

## POST `/api/sensor-data`

Required fields: `device_id` (1–64 `[A-Za-z0-9._-]`), `temperature` (finite number, −40…80 °C), `humidity` (0…100% RH), `light_raw` (integer 0…4095), `light_percentage` (0…100). `timestamp` is optional; if omitted, server UTC time is used. `inspection_requested` is optional boolean.

```json
{
  "device_id": "PHARMA_ESP32_001",
  "temperature": 24.5,
  "humidity": 55.2,
  "light_raw": 1850,
  "light_percentage": 45.2,
  "timestamp": "2026-11-14T14:30:00Z",
  "inspection_requested": false
}
```

- **201**: new sensor record stored; returns `inserted`, `score`, and active alert details.
- **200**: duplicate `(device_id, timestamp)` ignored.
- **400**: invalid JSON/body, missing fields, non-finite/type/range issue. A valid `device_id` causes one `missing_sensor_reading` or `invalid_sensor_reading` alert to be raised until valid telemetry arrives.
- If `.env` configures `PHARMA_INGEST_TOKEN`, sensor submissions require `Authorization: Bearer <token>`; missing/incorrect tokens return **401**.

## GET `/api/latest`

Optional query: `device_id`. Returns `{ "data": <reading|null>, "device_status": "online|offline", "server_time": ... }`. The reading contains device ID, temperature, humidity, raw/normalized light values, sample and ingest timestamps, inspection flag, environmental status, score breakdown, current device state and last communication age. A stale/offline reading's current score/status is `Unavailable`; use history to see its score at the time it was recorded.

## GET `/api/history`

Optional query parameters:

- `start`, `end`: ISO date or timestamp; inclusive bounds.
- `device_id`: one device.
- `limit`: integer 1–500, default 100.
- `offset`: non-negative integer, default 0.

Returns `{ "data": [...], "pagination": { "limit", "offset", "total", "has_more" } }`, ordered newest sample timestamp first. Queries use parameters, not interpolated user values.

## GET `/api/score`

Optional `device_id`. Returns latest sample timestamp/device, score component breakdown, weighted score and classification. With no latest sample or an offline device, classification is `Unavailable` and values are null; stale numeric observations remain visible through `/api/latest` and `/api/history`.

## POST `/api/inspection`

Requires valid `device_id`. Optional `notes` (string up to 1,000 characters), `status` (`requested`, `in_progress`, `completed`, `cancelled`), `source` (string up to 64 characters). Status and source default to `requested` and `dashboard`. Returns **201** and a UUID inspection record. The physical button uses `source: physical_button`.

## GET `/api/inspections`

Supports `device_id`, `start`, `end`, `limit`, `offset`. Same inclusive date filters and pagination contract as history.

## GET `/api/alerts`

Supports `device_id`, `start`, `end`, `limit`, `offset`; `severity` is `critical`, `warning` or `info`; `active` is `true` or `false`. The `active=false` view includes both resolved original alerts and recovery event records.

## PATCH `/api/alerts/:alert_id/acknowledge`

Acknowledges a known UUID alert, idempotently. Returns the updated alert record or **404** if no alert exists.

## GET `/api/devices`

Returns known devices with first/last valid reading timestamps, computed `online`/`offline` status and seconds since last communication. Offline threshold is `PHARMA_OFFLINE_AFTER_SECONDS` (default 90).

## GET `/api/health`

Returns API/database health, configured device ID and demonstration limits plus counts of readings, inspections and active alerts. This read also evaluates offline alerts.

## Common error codes

`INVALID_JSON`, `INVALID_BODY`, `BODY_TOO_LARGE`, `VALIDATION_ERROR`, `INVALID_DATE`, `INVALID_FILTER`, `INVALID_RANGE`, `INVALID_PAGINATION`, `UNAUTHORIZED`, `NOT_FOUND`, and `INTERNAL_ERROR`. Error responses have an `error` object and do not expose SQL details. Request bodies are limited to 64 KiB.
