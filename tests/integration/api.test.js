'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createService } = require('../../backend/service');
const { createHttpServer } = require('../../backend/server');

async function withApi(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pharma-api-'));
  const defaults = { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 };
  const service = createService({ dbPath: options.dbPath || path.join(directory, 'test.sqlite'), config: { ...defaults, ...options.config }, ingestToken: options.ingestToken ?? '' });
  const server = createHttpServer(service);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    service.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    service,
    base: `http://127.0.0.1:${address.port}`,
    async request(method, route, body, headers = {}) {
      const response = await fetch(`http://127.0.0.1:${address.port}${route}`, {
        method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return { status: response.status, body: await response.json() };
    }
  };
}

function reading(overrides = {}) {
  return {
    device_id: 'PHARMA_ESP32_001', temperature: 22.5, humidity: 48.4, light_raw: 3400,
    light_percentage: 17.0, timestamp: '2026-11-14T10:00:00.000Z', inspection_requested: false, ...overrides
  };
}

test('POST /api/sensor-data stores validated readings and returns a score', async t => {
  const api = await withApi(t);
  const result = await api.request('POST', '/api/sensor-data', reading());
  assert.equal(result.status, 201);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.score.overall_score, 100);
  const latest = await api.request('GET', '/api/latest');
  assert.equal(latest.status, 200);
  assert.equal(latest.body.data.device_id, 'PHARMA_ESP32_001');
  assert.equal(latest.body.data.environmental_status, 'Excellent');
  assert.equal(latest.body.data.device_status, 'online');
  const health = await api.request('GET', '/api/health');
  assert.equal(health.body.counts.readings, 1);
});

test('duplicate device/timestamp telemetry is idempotent', async t => {
  const api = await withApi(t);
  await api.request('POST', '/api/sensor-data', reading());
  const duplicate = await api.request('POST', '/api/sensor-data', reading({ temperature: 29, inspection_requested: true }));
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.score.overall_score, 100);
  assert.equal(duplicate.body.inspection, null);
  const history = await api.request('GET', '/api/history');
  assert.equal(history.body.pagination.total, 1);
  assert.equal((await api.request('GET', '/api/alerts?active=true')).body.pagination.total, 0);
  assert.equal((await api.request('GET', '/api/inspections')).body.pagination.total, 0);
});

test('missing, malformed, and out-of-range telemetry returns errors and raises alerts', async t => {
  const api = await withApi(t);
  const missing = await api.request('POST', '/api/sensor-data', { device_id: 'PHARMA_ESP32_001', temperature: 20 });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'VALIDATION_ERROR');
  assert.equal(missing.body.error.details.some(item => item.field === 'humidity'), true);
  const invalid = await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T10:00:01.000Z', temperature: 81 }));
  assert.equal(invalid.status, 400);
  const alerts = await api.request('GET', '/api/alerts?active=true');
  assert.deepEqual(new Set(alerts.body.data.map(alert => alert.alert_type)), new Set(['missing_sensor_reading', 'invalid_sensor_reading']));
  const malformed = await fetch(`${api.base}/api/sensor-data`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  const rawMalformed = api.service.handle('POST', '/api/inspection', Buffer.from('{'));
  assert.equal(rawMalformed.statusCode, 400);
  assert.equal(rawMalformed.body.error.code, 'INVALID_JSON');
  const oversizedRaw = api.service.handle('POST', '/api/sensor-data', Buffer.alloc(64 * 1024 + 1));
  assert.equal(oversizedRaw.statusCode, 413);
});

test('limit validation and date filtering keep history queries bounded', async t => {
  const api = await withApi(t);
  await api.request('POST', '/api/sensor-data', reading());
  await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T11:00:00.000Z', device_id: 'PHARMA_ESP32_002' }));
  const filtered = await api.request('GET', '/api/history?device_id=PHARMA_ESP32_001&start=2026-11-14T09%3A00%3A00Z&limit=1&offset=0');
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.pagination.total, 1);
  assert.equal(filtered.body.data[0].device_id, 'PHARMA_ESP32_001');
  const dateOnlyEnd = await api.request('GET', '/api/history?device_id=PHARMA_ESP32_001&end=2026-11-14');
  assert.equal(dateOnlyEnd.body.pagination.total, 1);
  const excessive = await api.request('GET', '/api/history?limit=501');
  assert.equal(excessive.status, 400);
  const reversed = await api.request('GET', '/api/history?start=2026-11-15&end=2026-11-14');
  assert.equal(reversed.status, 400);
});

test('environmental alerts stay unique during a condition and recover with an event', async t => {
  const api = await withApi(t);
  await api.request('POST', '/api/sensor-data', reading({ temperature: 28.5, humidity: 72, light_percentage: 72 }));
  await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T10:00:10.000Z', temperature: 29, humidity: 73, light_percentage: 75 }));
  const active = await api.request('GET', '/api/alerts?active=true');
  assert.equal(active.body.pagination.total, 3);
  assert.equal(active.body.data.every(alert => alert.severity === 'critical'), true);
  const score = await api.request('GET', '/api/score');
  assert.equal(score.body.environmental_status, 'Critical');
  const alertId = active.body.data[0].alert_id;
  const acknowledged = await api.request('PATCH', `/api/alerts/${alertId}/acknowledge`);
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.body.data.acknowledged, true);

  await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T10:00:20.000Z' }));
  const after = await api.request('GET', '/api/alerts?active=true');
  assert.equal(after.body.pagination.total, 0);
  const history = await api.request('GET', '/api/alerts?severity=info&limit=20');
  assert.equal(history.body.data.filter(alert => alert.alert_type.endsWith('_recovered')).length, 3);
});

test('an active alert escalates severity in place without a duplicate alert', async t => {
  const api = await withApi(t);
  await api.request('POST', '/api/sensor-data', reading({ temperature: 25.5 }));
  const first = await api.request('GET', '/api/alerts?active=true&device_id=PHARMA_ESP32_001');
  assert.equal(first.body.pagination.total, 1);
  assert.equal(first.body.data[0].severity, 'warning');
  await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T10:00:10.000Z', temperature: 28 }));
  const escalated = await api.request('GET', '/api/alerts?active=true&device_id=PHARMA_ESP32_001');
  assert.equal(escalated.body.pagination.total, 1);
  assert.equal(escalated.body.data[0].alert_id, first.body.data[0].alert_id);
  assert.equal(escalated.body.data[0].severity, 'critical');
});

test('inspection requests persist notes and physical sensor inspections are recorded', async t => {
  const api = await withApi(t);
  const created = await api.request('POST', '/api/inspection', { device_id: 'PHARMA_ESP32_001', notes: 'Check cabinet door seal' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'requested');
  assert.equal(created.body.data.notes, 'Check cabinet door seal');
  const physical = await api.request('POST', '/api/sensor-data', reading({ timestamp: '2026-11-14T10:00:01.000Z', inspection_requested: true }));
  assert.equal(physical.body.inspection.source, 'physical_button');
  const history = await api.request('GET', '/api/inspections?device_id=PHARMA_ESP32_001');
  assert.equal(history.body.pagination.total, 2);
  assert.equal((await api.request('GET', '/api/devices')).body.data[0].status, 'online');
});

test('offline monitoring changes device state and writes an active alert', { timeout: 12000 }, async t => {
  const api = await withApi(t, { config: { offlineAfterSeconds: 5 } });
  await api.request('POST', '/api/sensor-data', reading());
  await new Promise(resolve => setTimeout(resolve, 5200));
  const latest = await api.request('GET', '/api/latest');
  assert.equal(latest.body.device_status, 'offline');
  await api.request('GET', '/api/health');
  const alerts = await api.request('GET', '/api/alerts?active=true&severity=critical');
  assert.equal(alerts.body.data.some(alert => alert.alert_type === 'device_offline'), true);
});

test('optional ingestion bearer token is required when configured', async t => {
  const api = await withApi(t, { ingestToken: 'test-long-token' });
  const denied = await api.request('POST', '/api/sensor-data', reading());
  assert.equal(denied.status, 401);
  const accepted = await api.request('POST', '/api/sensor-data', reading(), { authorization: 'Bearer test-long-token' });
  assert.equal(accepted.status, 201);
});

test('SQLite persists data across service restarts', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pharma-persistence-'));
  const dbPath = path.join(directory, 'storage.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const first = createService({ dbPath, ingestToken: '', config: { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 } });
  assert.equal(first.handle('POST', '/api/sensor-data', reading()).statusCode, 201);
  first.close();
  const second = createService({ dbPath, ingestToken: '', config: { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 } });
  t.after(() => second.close());
  const latest = second.handle('GET', '/api/latest', undefined);
  assert.equal(latest.body.data.temperature, 22.5);
});

test('realistic simulator submits readings through the HTTP API', async t => {
  const api = await withApi(t);
  const script = path.resolve(__dirname, '../../simulator/sensor-simulator.js');
  const child = spawn(process.execPath, [script, '--base-url', api.base, '--device-id', 'SIMULATOR_TEST_001', '--scenario', 'normal', '--count', '1', '--interval-ms', '1000'], {
    cwd: path.resolve(__dirname, '../..'), stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr || stdout);
  assert.match(stdout, /201 .*score/);
  const latest = await api.request('GET', '/api/latest?device_id=SIMULATOR_TEST_001');
  assert.equal(latest.body.data.device_id, 'SIMULATOR_TEST_001');
});
