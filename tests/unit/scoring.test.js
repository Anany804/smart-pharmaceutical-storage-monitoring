'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../../backend/service');

test('all parameters at or inside the demonstration limits score 100', t => {
  const service = createService({ dbPath: ':memory:', ingestToken: '', config: { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 } });
  t.after(() => service.close());
  const score = service.scoreReading({ temperature: 22, humidity: 48, light_percentage: 15 });
  assert.deepEqual([score.temperature_score, score.humidity_score, score.light_score], [100, 100, 100]);
  assert.equal(score.overall_score, 100);
  assert.equal(score.status, 'Excellent');
});

test('scores are weighted 45/35/20 and environmental breaches cap reassuring classifications', t => {
  const service = createService({ dbPath: ':memory:', ingestToken: '', config: { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 } });
  t.after(() => service.close());
  const score = service.scoreReading({ temperature: 26, humidity: 50, light_percentage: 10 });
  assert.equal(score.temperature_score, 80);
  assert.equal(score.humidity_score, 100);
  assert.equal(score.light_score, 100);
  assert.equal(score.overall_score, 91);
  assert.equal(score.status, 'Warning');
  const severalMildBreaches = service.scoreReading({ temperature: 26, humidity: 64, light_percentage: 10 });
  assert.equal(severalMildBreaches.overall_score, 84);
  assert.equal(severalMildBreaches.status, 'Warning');
});

test('missing or invalid measurements are unavailable rather than safe', t => {
  const service = createService({ dbPath: ':memory:', ingestToken: '', config: { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 } });
  t.after(() => service.close());
  const score = service.scoreReading({ temperature: 22, humidity: NaN, light_percentage: 0 });
  assert.equal(score.overall_score, null);
  assert.equal(score.temperature_score, null);
  assert.equal(score.status, 'Unavailable');
});

test('configuration rejects inverted ranges and invalid light thresholds', () => {
  const base = { temperatureMin: 15, temperatureMax: 25, humidityMin: 30, humidityMax: 60, lightMaxPercent: 30, offlineAfterSeconds: 90 };
  assert.throws(() => createService({ dbPath: ':memory:', ingestToken: '', config: { ...base, temperatureMin: 25, temperatureMax: 15 } }), /Invalid pharmaceutical monitoring configuration/);
  assert.throws(() => createService({ dbPath: ':memory:', ingestToken: '', config: { ...base, lightMaxPercent: 101 } }), /Invalid pharmaceutical monitoring configuration/);
  assert.throws(() => createService({ dbPath: ':memory:', ingestToken: '', config: { ...base, lightMaxPercent: NaN } }), /Invalid pharmaceutical monitoring configuration/);
});
