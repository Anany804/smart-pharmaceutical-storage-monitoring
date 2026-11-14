PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  temperature REAL NOT NULL,
  humidity REAL NOT NULL,
  light_raw INTEGER NOT NULL,
  light_percentage REAL NOT NULL,
  score_json TEXT NOT NULL,
  inspection_requested INTEGER NOT NULL DEFAULT 0 CHECK (inspection_requested IN (0, 1)),
  UNIQUE(device_id, timestamp)
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  description TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1)),
  acknowledged_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  recovered_at TEXT,
  source_alert_id TEXT REFERENCES alerts(alert_id)
);

CREATE TABLE IF NOT EXISTS inspections (
  inspection_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'in_progress', 'completed', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'dashboard'
);

CREATE INDEX IF NOT EXISTS idx_readings_device_time ON sensor_readings(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_readings_ingested ON sensor_readings(ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_time ON alerts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device_active ON alerts(device_id, active, severity);
CREATE INDEX IF NOT EXISTS idx_inspections_device_time ON inspections(device_id, timestamp DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_one_active_condition
  ON alerts(device_id, alert_type) WHERE active = 1;
