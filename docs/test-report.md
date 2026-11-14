# Verification report

## Completed checks

- **Unit and integration suite:** `npm test` — 18 passed, 0 failed.
- **API coverage:** payload validation and range errors, duplicate idempotency, weighted scoring, alert deduplication/recovery/acknowledgement, history filters and pagination, inspections, online/offline transitions, optional ingest-token handling, JSON errors, and SQLite persistence across service restarts.
- **Simulator:** the test suite launched `simulator/sensor-simulator.js` against an ephemeral local API and verified the reading was stored.
- **Node-RED runtime:** Node-RED 5.0.4 on Node.js 24.15.0 loaded generated `flows-api.json`; localhost smoke checks passed telemetry, latest, alerts/acknowledgement, inspection, history, score and health routes. A second runtime check confirmed malformed JSON returns structured 400 and oversized bodies return structured 413.
- **Static assets:** JavaScript syntax checks passed; tests parsed the generated flow JSON, Wokwi diagram and Postman collection and checked required route/part identifiers.

## Checks unavailable in this environment

- The full combined dashboard flow could not start because `@flowfuse/node-red-dashboard` was not installed. `npm view` failed with `ENOTFOUND registry.npmjs.org`; the full flow correctly remained waiting for Dashboard node types. `scripts/setup.sh` installs the palette when npm registry access is available.
- Dashboard rendering/interaction was not visually tested.
- PlatformIO and Wokwi CLI/private gateway were unavailable, so firmware compilation and Wokwi simulation were not run. No physical hardware was connected.
- The Postman collection was parsed and statically checked but not executed in Postman.

No test result in this report represents a physical sensor or Wokwi hardware test.
