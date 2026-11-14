# Tests

Run `npm test` or `bash scripts/test.sh`. The suite uses Node's built-in test runner and temporary local SQLite databases; no physical hardware, Postman installation or remote service is required. It covers the service over HTTP, simulator submission, score/error behavior, alert transitions, pagination, inspections, persistence and static flow/diagram/collection artifacts.

See [verification report](../docs/test-report.md) for the actual checks run and hardware/dashboard checks that were unavailable.
