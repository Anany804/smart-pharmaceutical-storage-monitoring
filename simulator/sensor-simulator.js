#!/usr/bin/env node
'use strict';

const { loadEnv } = require('../backend/load-env');
const path = require('node:path');
loadEnv(path.join(__dirname, '..', '.env'));

function parseArgs(argv) {
  const values = { baseUrl: process.env.SIMULATOR_API_URL || `http://127.0.0.1:${process.env.PORT || 1880}`,
    deviceId: process.env.PHARMA_DEVICE_ID || 'PHARMA_ESP32_001', intervalMs: 10000, count: 0, scenario: 'cycle' };
  for (let index = 0; index < argv.length; index++) {
    const [key, inline] = argv[index].split('=', 2);
    const value = inline ?? argv[++index];
    if (key === '--help' || key === '-h') { values.help = true; continue; }
    if (key === '--base-url') values.baseUrl = value;
    else if (key === '--device-id') values.deviceId = value;
    else if (key === '--interval-ms') values.intervalMs = Number(value);
    else if (key === '--count') values.count = Number(value);
    else if (key === '--scenario') values.scenario = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  if (!Number.isInteger(values.intervalMs) || values.intervalMs < 1000) throw new Error('--interval-ms must be at least 1000.');
  if (!Number.isInteger(values.count) || values.count < 0) throw new Error('--count must be zero (continuous) or a positive integer.');
  if (!['cycle', 'normal', 'unsafe'].includes(values.scenario)) throw new Error('--scenario must be cycle, normal, or unsafe.');
  return values;
}

function createReading(index, scenario) {
  const wave = Math.sin(index / 5);
  let temperature = 22.1 + wave * 0.55;
  let humidity = 47 + Math.sin(index / 7) * 3.5;
  let lightPercentage = 15 + Math.sin(index / 4) * 4;
  if (scenario === 'unsafe' || (scenario === 'cycle' && index % 24 >= 15 && index % 24 <= 17)) {
    temperature = 28.4 + wave * 0.3;
    humidity = 67 + Math.abs(wave) * 2;
    lightPercentage = 61;
  }
  const lightRaw = Math.max(0, Math.min(4095, Math.round(4095 * (1 - lightPercentage / 100))));
  return {
    device_id: process.env.PHARMA_DEVICE_ID || 'PHARMA_ESP32_001',
    temperature: Number(temperature.toFixed(2)),
    humidity: Number(humidity.toFixed(2)),
    light_raw: lightRaw,
    light_percentage: Number(lightPercentage.toFixed(2)),
    timestamp: new Date().toISOString(),
    inspection_requested: false
  };
}

async function sleep(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node simulator/sensor-simulator.js [--base-url URL] [--device-id ID] [--interval-ms N] [--count N] [--scenario cycle|normal|unsafe]');
    process.exit(0);
  }
  console.log(`Sending realistic sensor readings to ${options.baseUrl}/api/sensor-data (${options.scenario} scenario). Ctrl+C to stop.`);
  let index = 0;
  while (options.count === 0 || index < options.count) {
    const payload = createReading(index, options.scenario);
    payload.device_id = options.deviceId;
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    const token = process.env.SIMULATOR_BEARER_TOKEN || process.env.PHARMA_INGEST_TOKEN;
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/api/sensor-data`, {
        method: 'POST', headers,
        body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(result)}`);
      console.log(`${response.status} ${payload.timestamp} · ${payload.temperature} °C · ${payload.humidity}% RH · ${payload.light_percentage}% light · score ${result.score.overall_score} ${result.score.status}`);
    } catch (error) {
      console.error(`Reading ${index + 1} was not accepted: ${error.message}`);
      process.exitCode = 1;
    }
    index++;
    if (options.count === 0 || index < options.count) await sleep(options.intervalMs);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 2; });
