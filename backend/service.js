'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DEFAULTS = Object.freeze({
  temperatureMin: 15,
  temperatureMax: 25,
  humidityMin: 30,
  humidityMax: 60,
  lightMaxPercent: 30,
  offlineAfterSeconds: 90,
  deviceId: 'PHARMA_ESP32_001'
});

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function parseDate(value, field) {
  if (value === undefined || value === '') return null;
  const isDateOnlyEnd = field === 'end' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = Date.parse(isDateOnlyEnd ? `${value}T23:59:59.999Z` : value);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError(400, 'INVALID_DATE', `${field} must be a valid ISO date or timestamp.`);
  }
  return new Date(timestamp).toISOString();
}

function isDeviceId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function createService(options = {}) {
  const root = path.resolve(__dirname, '..');
  const dbPath = options.dbPath || process.env.PHARMA_DB_PATH || path.join(root, 'data', 'pharma.sqlite');
  const ingestToken = options.ingestToken ?? process.env.PHARMA_INGEST_TOKEN ?? '';
  const config = {
    temperatureMin: Number(process.env.PHARMA_TEMP_MIN ?? DEFAULTS.temperatureMin),
    temperatureMax: Number(process.env.PHARMA_TEMP_MAX ?? DEFAULTS.temperatureMax),
    humidityMin: Number(process.env.PHARMA_HUMIDITY_MIN ?? DEFAULTS.humidityMin),
    humidityMax: Number(process.env.PHARMA_HUMIDITY_MAX ?? DEFAULTS.humidityMax),
    lightMaxPercent: Number(process.env.PHARMA_LIGHT_MAX_PERCENT ?? DEFAULTS.lightMaxPercent),
    offlineAfterSeconds: Number(process.env.PHARMA_OFFLINE_AFTER_SECONDS ?? DEFAULTS.offlineAfterSeconds),
    deviceId: process.env.PHARMA_DEVICE_ID || DEFAULTS.deviceId,
    ...options.config
  };

  if (!(config.temperatureMin < config.temperatureMax) || !(config.humidityMin < config.humidityMax) ||
      !Object.values({ temperatureMin: config.temperatureMin, temperatureMax: config.temperatureMax,
        humidityMin: config.humidityMin, humidityMax: config.humidityMax,
        lightMaxPercent: config.lightMaxPercent, offlineAfterSeconds: config.offlineAfterSeconds }).every(Number.isFinite) ||
      config.lightMaxPercent < 0 || config.lightMaxPercent > 100 || !Number.isInteger(config.offlineAfterSeconds) || config.offlineAfterSeconds < 5) {
    throw new Error('Invalid pharmaceutical monitoring configuration. Check PHARMA_* limits.');
  }
  if (!isDeviceId(config.deviceId)) throw new Error('PHARMA_DEVICE_ID must be a valid 1–64 character device identifier.');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));

  const statements = {
    latest: db.prepare('SELECT * FROM sensor_readings WHERE (? IS NULL OR device_id = ?) ORDER BY id DESC LIMIT 1'),
    device: db.prepare('SELECT * FROM devices WHERE device_id = ?'),
    insertReading: db.prepare(`INSERT OR IGNORE INTO sensor_readings
      (device_id, timestamp, ingested_at, temperature, humidity, light_raw, light_percentage, score_json, inspection_requested)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    readingByKey: db.prepare('SELECT * FROM sensor_readings WHERE device_id = ? AND timestamp = ?'),
    touchDevice: db.prepare(`INSERT INTO devices(device_id, first_seen, last_seen) VALUES (?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen`),
    activeAlert: db.prepare('SELECT * FROM alerts WHERE device_id = ? AND alert_type = ? AND active = 1 LIMIT 1'),
    updateActiveAlert: db.prepare('UPDATE alerts SET severity = ?, description = ? WHERE alert_id = ? AND active = 1'),
    insertAlert: db.prepare(`INSERT INTO alerts
      (alert_id, device_id, alert_type, severity, description, timestamp, acknowledged, active, source_alert_id)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`),
    resolveAlert: db.prepare('UPDATE alerts SET active = 0, recovered_at = ? WHERE alert_id = ? AND active = 1'),
    readingCount: db.prepare('SELECT COUNT(*) AS count FROM sensor_readings'),
    inspectionCount: db.prepare('SELECT COUNT(*) AS count FROM inspections'),
    activeAlertCount: db.prepare('SELECT COUNT(*) AS count FROM alerts WHERE active = 1'),
    insertInspection: db.prepare(`INSERT INTO inspections
      (inspection_id, device_id, timestamp, status, notes, source) VALUES (?, ?, ?, ?, ?, ?)`)
  };

  function scoreReading(reading) {
    if (!reading || !finiteNumber(reading.temperature) || !finiteNumber(reading.humidity) ||
        !finiteNumber(reading.light_percentage)) {
      return {
        temperature_score: null,
        humidity_score: null,
        light_score: null,
        overall_score: null,
        status: 'Unavailable',
        weights: { temperature: 45, humidity: 35, light: 20 },
        reason: 'One or more valid sensor readings are unavailable.'
      };
    }

    const temperatureDistance = reading.temperature < config.temperatureMin
      ? config.temperatureMin - reading.temperature
      : Math.max(0, reading.temperature - config.temperatureMax);
    const humidityDistance = reading.humidity < config.humidityMin
      ? config.humidityMin - reading.humidity
      : Math.max(0, reading.humidity - config.humidityMax);
    const temperatureScore = Math.max(0, 100 - temperatureDistance / 5 * 100);
    const humidityScore = Math.max(0, 100 - humidityDistance / 20 * 100);
    const lightExcess = Math.max(0, reading.light_percentage - config.lightMaxPercent);
    const lightRoom = Math.max(1, 100 - config.lightMaxPercent);
    const lightScore = Math.max(0, 100 * (1 - lightExcess / lightRoom));
    const overall = rounded(temperatureScore * 0.45 + humidityScore * 0.35 + lightScore * 0.20);

    let status = overall >= 90 ? 'Excellent' : overall >= 75 ? 'Good' : overall >= 50 ? 'Warning' : 'Critical';
    const hasBreach = temperatureDistance > 0 || humidityDistance > 0 || lightExcess > 0;
    if (hasBreach && ['Excellent', 'Good'].includes(status)) status = 'Warning';
    const criticalBreach = temperatureDistance >= 2 || humidityDistance >= 10 ||
      lightExcess >= Math.max(1, 70 - config.lightMaxPercent);
    if (criticalBreach) status = 'Critical';

    return {
      temperature_score: rounded(temperatureScore),
      humidity_score: rounded(humidityScore),
      light_score: rounded(lightScore),
      overall_score: overall,
      status,
      weights: { temperature: 45, humidity: 35, light: 20 },
      ranges: {
        temperature_c: [config.temperatureMin, config.temperatureMax],
        humidity_percent: [config.humidityMin, config.humidityMax],
        light_max_percent: config.lightMaxPercent
      }
    };
  }

  function raiseCondition(deviceId, type, severity, description, at = isoNow()) {
    const active = statements.activeAlert.get(deviceId, type);
    if (active) {
      if (active.severity !== severity || active.description !== description) {
        statements.updateActiveAlert.run(severity, description, active.alert_id);
      }
      return active.alert_id;
    }
    const alertId = randomUUID();
    statements.insertAlert.run(alertId, deviceId, type, severity, description, at, 1, null);
    return alertId;
  }

  function resolveCondition(deviceId, type, at = isoNow()) {
    const active = statements.activeAlert.get(deviceId, type);
    if (!active) return false;
    statements.resolveAlert.run(at, active.alert_id);
    statements.insertAlert.run(randomUUID(), deviceId, `${type}_recovered`, 'info',
      `Recovered: ${active.description}`, at, 0, active.alert_id);
    return true;
  }

  function validatePayload(input) {
    let body = input;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {
        throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
      }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'INVALID_BODY', 'Request body must be a JSON object.');
    }
    const issues = [];
    const deviceId = body.device_id;
    if (!isDeviceId(deviceId)) issues.push({ field: 'device_id', message: 'Must be 1–64 letters, numbers, dots, underscores, or hyphens.' });
    for (const field of ['temperature', 'humidity', 'light_raw', 'light_percentage']) {
      if (!(field in body)) issues.push({ field, message: 'Required field is missing.' });
      else if (!finiteNumber(body[field])) issues.push({ field, message: 'Must be a finite JSON number.' });
    }
    if (finiteNumber(body.temperature) && (body.temperature < -40 || body.temperature > 80)) {
      issues.push({ field: 'temperature', message: 'Must be between -40 and 80 °C.' });
    }
    if (finiteNumber(body.humidity) && (body.humidity < 0 || body.humidity > 100)) {
      issues.push({ field: 'humidity', message: 'Must be between 0 and 100%.' });
    }
    if (finiteNumber(body.light_raw) && (!Number.isInteger(body.light_raw) || body.light_raw < 0 || body.light_raw > 4095)) {
      issues.push({ field: 'light_raw', message: 'Must be an integer between 0 and 4095.' });
    }
    if (finiteNumber(body.light_percentage) && (body.light_percentage < 0 || body.light_percentage > 100)) {
      issues.push({ field: 'light_percentage', message: 'Must be between 0 and 100%.' });
    }
    if (body.inspection_requested !== undefined && typeof body.inspection_requested !== 'boolean') {
      issues.push({ field: 'inspection_requested', message: 'Must be a boolean when supplied.' });
    }
    let timestamp = isoNow();
    if (body.timestamp !== undefined) {
      if (typeof body.timestamp !== 'string' || !Number.isFinite(Date.parse(body.timestamp))) {
        issues.push({ field: 'timestamp', message: 'Must be a valid date-time string.' });
      } else {
        timestamp = new Date(Date.parse(body.timestamp)).toISOString();
      }
    }
    if (issues.length) {
      if (isDeviceId(deviceId)) {
        const missing = issues.some(issue => issue.message === 'Required field is missing.');
        raiseCondition(deviceId, missing ? 'missing_sensor_reading' : 'invalid_sensor_reading',
          missing ? 'critical' : 'warning',
          missing ? `Sensor payload is missing required readings: ${issues.filter(x => x.message.includes('missing')).map(x => x.field).join(', ')}.`
            : `Sensor payload failed validation: ${issues.map(x => x.field).join(', ')}.`);
      }
      throw new ApiError(400, 'VALIDATION_ERROR', 'Sensor payload failed validation.', issues);
    }
    return {
      device_id: deviceId,
      temperature: body.temperature,
      humidity: body.humidity,
      light_raw: body.light_raw,
      light_percentage: body.light_percentage,
      timestamp,
      inspection_requested: body.inspection_requested === true
    };
  }

  function recordSensor(input) {
    const reading = validatePayload(input);
    const ingestedAt = isoNow();
    const score = scoreReading(reading);
    const conditions = [];
    if (reading.temperature > config.temperatureMax) {
      const delta = reading.temperature - config.temperatureMax;
      conditions.push(['temperature_high', delta >= 2 ? 'critical' : 'warning',
        `Temperature ${reading.temperature} °C is above the configured maximum ${config.temperatureMax} °C.`]);
    }
    if (reading.temperature < config.temperatureMin) {
      const delta = config.temperatureMin - reading.temperature;
      conditions.push(['temperature_low', delta >= 2 ? 'critical' : 'warning',
        `Temperature ${reading.temperature} °C is below the configured minimum ${config.temperatureMin} °C.`]);
    }
    if (reading.humidity > config.humidityMax) {
      const delta = reading.humidity - config.humidityMax;
      conditions.push(['humidity_high', delta >= 10 ? 'critical' : 'warning',
        `Relative humidity ${reading.humidity}% is above the configured maximum ${config.humidityMax}%.`]);
    }
    if (reading.humidity < config.humidityMin) {
      const delta = config.humidityMin - reading.humidity;
      conditions.push(['humidity_low', delta >= 10 ? 'critical' : 'warning',
        `Relative humidity ${reading.humidity}% is below the configured minimum ${config.humidityMin}%.`]);
    }
    if (reading.light_percentage > config.lightMaxPercent) {
      const excess = reading.light_percentage - config.lightMaxPercent;
      conditions.push(['excessive_light', excess >= Math.max(1, 70 - config.lightMaxPercent) ? 'critical' : 'warning',
        `Light exposure ${reading.light_percentage}% exceeds the configured maximum ${config.lightMaxPercent}%.`]);
    }

    let inspection = null;
    let inserted = false;
    db.exec('BEGIN IMMEDIATE');
    try {
      statements.touchDevice.run(reading.device_id, ingestedAt, ingestedAt);
      inserted = statements.insertReading.run(reading.device_id, reading.timestamp, ingestedAt,
        reading.temperature, reading.humidity, reading.light_raw, reading.light_percentage,
        JSON.stringify(score), reading.inspection_requested ? 1 : 0).changes === 1;

      // An idempotent retry refreshes the heartbeat but cannot apply conflicting
      // values or create a second inspection against an already stored timestamp.
      if (inserted) {
        const active = new Set(conditions.map(condition => condition[0]));
        for (const type of ['temperature_high', 'temperature_low', 'humidity_high', 'humidity_low', 'excessive_light',
          'missing_sensor_reading', 'invalid_sensor_reading', 'device_offline']) {
          if (!active.has(type)) resolveCondition(reading.device_id, type, ingestedAt);
        }
        for (const [type, severity, description] of conditions) {
          raiseCondition(reading.device_id, type, severity, description, ingestedAt);
        }
        if (reading.inspection_requested) {
          inspection = createInspection({ device_id: reading.device_id, source: 'physical_button', timestamp: ingestedAt });
        }
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const storedScore = inserted ? score : JSON.parse(statements.readingByKey.get(reading.device_id, reading.timestamp).score_json);
    return {
      inserted,
      duplicate: !inserted,
      device_id: reading.device_id,
      timestamp: reading.timestamp,
      score: storedScore,
      alerts: activeAlertsForDevice(reading.device_id),
      inspection
    };
  }

  function mapReading(row, applyCurrentDeviceState = true) {
    if (!row) return null;
    const score = JSON.parse(row.score_json);
    const device = statements.device.get(row.device_id);
    const ageMs = device ? Math.max(0, Date.now() - Date.parse(device.last_seen)) : null;
    const age = ageMs === null ? null : Math.floor(ageMs / 1000);
    const online = ageMs !== null && ageMs <= config.offlineAfterSeconds * 1000;
    const currentScore = !applyCurrentDeviceState || online ? score : {
      temperature_score: null, humidity_score: null, light_score: null, overall_score: null,
      status: 'Unavailable', weights: score.weights, reason: 'The latest device reading is stale because the device is offline.'
    };
    const result = {
      device_id: row.device_id,
      temperature: row.temperature,
      humidity: row.humidity,
      light_raw: row.light_raw,
      light_percentage: row.light_percentage,
      timestamp: row.timestamp,
      ingested_at: row.ingested_at,
      inspection_requested: Boolean(row.inspection_requested),
      environmental_status: applyCurrentDeviceState && !online ? 'Unavailable' : score.status,
      medicine_storage_score: currentScore
    };
    if (applyCurrentDeviceState) {
      result.device_status = online ? 'online' : 'offline';
      result.last_communication_seconds = age;
    }
    return result;
  }

  function activeAlertsForDevice(deviceId) {
    return db.prepare('SELECT * FROM alerts WHERE device_id = ? AND active = 1 ORDER BY timestamp DESC').all(deviceId).map(mapAlert);
  }

  function mapAlert(row) {
    return {
      alert_id: row.alert_id,
      device_id: row.device_id,
      alert_type: row.alert_type,
      severity: row.severity,
      description: row.description,
      timestamp: row.timestamp,
      acknowledged: Boolean(row.acknowledged),
      acknowledged_at: row.acknowledged_at,
      active: Boolean(row.active),
      recovered_at: row.recovered_at,
      source_alert_id: row.source_alert_id
    };
  }

  function createInspection(body) {
    if (!body || !isDeviceId(body.device_id)) throw new ApiError(400, 'VALIDATION_ERROR', 'device_id is required and must be valid.');
    const notes = body.notes === undefined ? '' : body.notes;
    if (typeof notes !== 'string' || notes.length > 1000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'notes must be a string of at most 1000 characters.');
    }
    const status = body.status || 'requested';
    if (!['requested', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'status must be requested, in_progress, completed, or cancelled.');
    }
    const source = body.source || 'dashboard';
    if (typeof source !== 'string' || source.length > 64) throw new ApiError(400, 'VALIDATION_ERROR', 'source must be a string of at most 64 characters.');
    const timestamp = body.timestamp ? parseDate(body.timestamp, 'timestamp') : isoNow();
    const record = { inspection_id: randomUUID(), device_id: body.device_id, timestamp, status, notes, source };
    statements.insertInspection.run(record.inspection_id, record.device_id, record.timestamp,
      record.status, record.notes, record.source);
    return record;
  }

  function buildFilters(query) {
    const clauses = [];
    const params = [];
    if (query.device_id) {
      if (!isDeviceId(query.device_id)) throw new ApiError(400, 'INVALID_FILTER', 'device_id is invalid.');
      clauses.push('device_id = ?'); params.push(query.device_id);
    }
    const start = parseDate(query.start, 'start');
    const end = parseDate(query.end, 'end');
    if (start) { clauses.push('timestamp >= ?'); params.push(start); }
    if (end) { clauses.push('timestamp <= ?'); params.push(end); }
    if (start && end && start > end) throw new ApiError(400, 'INVALID_RANGE', 'start must be earlier than or equal to end.');
    return { clauses, params };
  }

  function pagination(query) {
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ApiError(400, 'INVALID_PAGINATION', 'limit must be an integer from 1 to 500.');
    if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000_000) throw new ApiError(400, 'INVALID_PAGINATION', 'offset must be a non-negative integer.');
    return { limit, offset };
  }

  function listReadings(query) {
    const { clauses, params } = buildFilters(query);
    const { limit, offset } = pagination(query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM sensor_readings ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS count FROM sensor_readings ${where}`).get(...params).count;
    return { data: rows.map(row => mapReading(row, false)), pagination: { limit, offset, total, has_more: offset + rows.length < total } };
  }

  function listAlerts(query) {
    const { clauses, params } = buildFilters(query);
    if (query.severity) {
      if (!['critical', 'warning', 'info'].includes(query.severity)) throw new ApiError(400, 'INVALID_FILTER', 'severity must be critical, warning, or info.');
      clauses.push('severity = ?'); params.push(query.severity);
    }
    if (query.active !== undefined) {
      if (!['true', 'false'].includes(String(query.active))) throw new ApiError(400, 'INVALID_FILTER', 'active must be true or false.');
      clauses.push('active = ?'); params.push(query.active === 'true' ? 1 : 0);
    }
    const { limit, offset } = pagination(query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const data = db.prepare(`SELECT * FROM alerts ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map(mapAlert);
    const total = db.prepare(`SELECT COUNT(*) AS count FROM alerts ${where}`).get(...params).count;
    return { data, pagination: { limit, offset, total, has_more: offset + data.length < total } };
  }

  function listInspections(query) {
    const { clauses, params } = buildFilters(query);
    const { limit, offset } = pagination(query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const data = db.prepare(`SELECT * FROM inspections ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS count FROM inspections ${where}`).get(...params).count;
    return { data, pagination: { limit, offset, total, has_more: offset + data.length < total } };
  }

  function checkOffline(at = Date.now()) {
    const cutoff = at - config.offlineAfterSeconds * 1000;
    const devices = db.prepare('SELECT device_id, last_seen FROM devices').all();
    for (const device of devices) {
      if (Date.parse(device.last_seen) < cutoff) {
        raiseCondition(device.device_id, 'device_offline', 'critical',
          `No sensor reading received for more than ${config.offlineAfterSeconds} seconds.`, new Date(at).toISOString());
      }
    }
    return devices.filter(device => Date.parse(device.last_seen) < cutoff).length;
  }

  function acknowledgeAlert(alertId) {
    const row = db.prepare('SELECT * FROM alerts WHERE alert_id = ?').get(alertId);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Alert was not found.');
    if (!row.acknowledged) db.prepare('UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE alert_id = ?').run(isoNow(), alertId);
    return mapAlert(db.prepare('SELECT * FROM alerts WHERE alert_id = ?').get(alertId));
  }

  function route(method, url, input) {
    const parsed = new URL(url || '/', 'http://localhost');
    const pathname = parsed.pathname;
    const query = Object.fromEntries(parsed.searchParams.entries());

    if (method === 'POST' && pathname === '/api/sensor-data') {
      const result = recordSensor(input);
      return { status: result.inserted ? 201 : 200, body: { ok: true, message: result.inserted ? 'Sensor reading stored.' : 'Duplicate sensor reading ignored.', ...result } };
    }
    if (method === 'GET' && pathname === '/api/latest') {
      const deviceId = query.device_id || null;
      if (deviceId && !isDeviceId(deviceId)) throw new ApiError(400, 'INVALID_FILTER', 'device_id is invalid.');
      const reading = mapReading(statements.latest.get(deviceId, deviceId));
      return { status: 200, body: { data: reading, device_status: reading?.device_status || 'offline', server_time: isoNow() } };
    }
    if (method === 'GET' && pathname === '/api/history') return { status: 200, body: listReadings(query) };
    if (method === 'GET' && pathname === '/api/score') {
      const deviceId = query.device_id || null;
      if (deviceId && !isDeviceId(deviceId)) throw new ApiError(400, 'INVALID_FILTER', 'device_id is invalid.');
      const reading = mapReading(statements.latest.get(deviceId, deviceId));
      return { status: 200, body: { device_id: reading?.device_id || deviceId, timestamp: reading?.timestamp || null,
        score: reading?.medicine_storage_score || scoreReading(null), environmental_status: reading?.environmental_status || 'Unavailable' } };
    }
    if (method === 'POST' && pathname === '/api/inspection') {
      const record = createInspection(input);
      return { status: 201, body: { ok: true, message: 'Inspection request stored.', data: record } };
    }
    if (method === 'GET' && pathname === '/api/inspections') return { status: 200, body: listInspections(query) };
    if (method === 'GET' && pathname === '/api/alerts') return { status: 200, body: listAlerts(query) };
    const acknowledgeMatch = pathname.match(/^\/api\/alerts\/([A-Za-z0-9-]+)\/acknowledge$/);
    if (method === 'PATCH' && acknowledgeMatch) return { status: 200, body: { ok: true, data: acknowledgeAlert(acknowledgeMatch[1]) } };
    if (method === 'GET' && pathname === '/api/devices') {
      const now = Date.now();
      const data = db.prepare('SELECT device_id, first_seen, last_seen FROM devices ORDER BY device_id').all().map(device => {
        const ageMs = Math.max(0, now - Date.parse(device.last_seen));
        const age = Math.floor(ageMs / 1000);
        return { ...device, status: ageMs <= config.offlineAfterSeconds * 1000 ? 'online' : 'offline', last_communication_seconds: age };
      });
      return { status: 200, body: { data } };
    }
    if (method === 'GET' && pathname === '/api/health') {
      checkOffline();
      return { status: 200, body: { ok: true, status: 'healthy', device_id: config.deviceId, timestamp: isoNow(), database: 'connected',
        counts: { readings: statements.readingCount.get().count, inspections: statements.inspectionCount.get().count,
          active_alerts: statements.activeAlertCount.get().count }, limits: {
          temperature_c: [config.temperatureMin, config.temperatureMax], humidity_percent: [config.humidityMin, config.humidityMax],
          light_max_percent: config.lightMaxPercent, offline_after_seconds: config.offlineAfterSeconds
        } } };
    }
    throw new ApiError(404, 'NOT_FOUND', `No API route for ${method} ${pathname}.`);
  }

  function handle(method, url, input, requestHeaders = {}) {
    try {
      if (Buffer.isBuffer(input)) {
        if (input.byteLength > 64 * 1024) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body exceeds 64 KiB.');
        try { input = JSON.parse(input.toString('utf8')); } catch {
          throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
        }
      }
      if (String(method).toUpperCase() === 'POST' && new URL(url || '/', 'http://localhost').pathname === '/api/sensor-data' && ingestToken) {
        const authorization = requestHeaders.authorization || requestHeaders.Authorization || '';
        const supplied = String(authorization).startsWith('Bearer ') ? String(authorization).slice(7) : '';
        const expectedBuffer = Buffer.from(ingestToken);
        const suppliedBuffer = Buffer.from(supplied);
        if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
          throw new ApiError(401, 'UNAUTHORIZED', 'A valid bearer token is required for sensor ingestion.');
        }
      }
      const result = route(String(method || 'GET').toUpperCase(), url, input);
      return { statusCode: result.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: result.body };
    } catch (error) {
      if (error instanceof ApiError) {
        return { statusCode: error.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
          body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } };
      }
      console.error('[pharma-api] Request failed:', error.message);
      return { statusCode: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        body: { error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } } };
    }
  }

  return {
    handle,
    scoreReading,
    checkOffline,
    close() { db.close(); },
    getConfig() { return { ...config }; },
    getDbPath() { return dbPath; }
  };
}

module.exports = { createService, DEFAULTS };
