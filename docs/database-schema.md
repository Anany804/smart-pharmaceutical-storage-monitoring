# Database schema

Database: SQLite at `data/pharma.sqlite` by default. It initializes from `database/schema.sql` at service startup, uses WAL mode and foreign keys, and stores timestamps as UTC ISO 8601 text. No database bootstrap command or external SQLite server is needed.

| Table | Stored fields and purpose |
|---|---|
| `devices` | Device ID primary key, first valid sample time and last server ingest time. Last seen is server time so device status does not depend on a possibly incorrect device clock. |
| `sensor_readings` | Unique `(device_id,timestamp)` samples with ingest time, raw/normalized sensor values, JSON score breakdown and inspection flag. |
| `alerts` | UUID, device/type/severity/description, raised time, acknowledgement and recovery state, optional source alert ID for recovery events. |
| `inspections` | UUID, device, request time, lifecycle status, notes and request source. |

Indexes cover device/time history, ingest order, alert time/state and inspection history. A partial unique index permits at most one active row per `(device_id,alert_type)`, preventing repeated unchanged conditions from spamming alerts. Sensor inserts use `INSERT OR IGNORE` on the device/timestamp unique key.

See `database/schema.sql` for the exact schema. Remove the SQLite file only when intentionally resetting all stored prototype data; close Node-RED first and remove its `-wal`/`-shm` files with it if present.
