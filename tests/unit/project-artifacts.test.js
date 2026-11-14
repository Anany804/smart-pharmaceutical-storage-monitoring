'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('Node-RED flow contains the documented HTTP API and Dashboard 2.0 template', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(root, 'node-red/flows.json'), 'utf8'));
  const inputs = flow.filter(node => node.type === 'http in');
  const expected = [
    ['post', '/api/sensor-data'], ['get', '/api/latest'], ['get', '/api/history'], ['get', '/api/score'],
    ['post', '/api/inspection'], ['get', '/api/inspections'], ['get', '/api/alerts'],
    ['patch', '/api/alerts/:id/acknowledge'], ['get', '/api/devices'], ['get', '/api/health']
  ];
  for (const route of expected) assert.equal(inputs.some(node => node.method === route[0] && node.url === route[1]), true, `missing ${route.join(' ')}`);
  const dashboardTemplate = flow.find(node => node.type === 'ui-template');
  assert.ok(dashboardTemplate);
  assert.equal(dashboardTemplate.z, flow.find(node => node.type === 'tab').id);
  assert.equal(dashboardTemplate.group, flow.find(node => node.type === 'ui-group').id);
  assert.equal(dashboardTemplate.format.includes('export default') && dashboardTemplate.format.includes("getJson('/api/latest')"), true);
  assert.equal(inputs.filter(node => node.method === 'post').every(node => node.skipBodyParsing === true), true);
  assert.equal(new Set(flow.map(node => node.id)).size, flow.length, 'node IDs are unique');
  assert.equal(flow.some(node => node.type === 'function' && node.name.includes('offline')), true);
  const apiOnly = JSON.parse(fs.readFileSync(path.join(root, 'node-red/flows-api.json'), 'utf8'));
  assert.equal(apiOnly.some(node => node.type.startsWith('ui-')), false);
  assert.equal(apiOnly.filter(node => node.type === 'http in').length, expected.length);
});

test('Wokwi diagram has documented parts and required pin connections', () => {
  const diagram = JSON.parse(fs.readFileSync(path.join(root, 'wokwi/diagram.json'), 'utf8'));
  const types = new Set(diagram.parts.map(part => part.type));
  for (const type of ['wokwi-esp32-devkit-v1', 'wokwi-dht22', 'wokwi-photoresistor-sensor', 'wokwi-pushbutton', 'wokwi-resistor']) {
    assert.equal(types.has(type), true, `missing Wokwi part ${type}`);
  }
  const links = diagram.connections.map(connection => connection.slice(0, 2).join(' ')).join('\n');
  for (const pin of ['esp:15', 'esp:34', 'esp:18', 'esp:3V3', 'esp:GND.1']) assert.match(links, new RegExp(pin.replace('.', '\\.'), 'u'));
});

test('Postman collection is valid JSON and covers every API path', () => {
  const collection = JSON.parse(fs.readFileSync(path.join(root, 'postman/Pharmaceutical-Storage.postman_collection.json'), 'utf8'));
  const requests = collection.item.map(item => item.request);
  const urlText = requests.map(request => typeof request.url === 'string' ? request.url : request.url.raw).join('\n');
  for (const route of ['/api/sensor-data', '/api/latest', '/api/history', '/api/score', '/api/inspection', '/api/inspections', '/api/alerts', '/api/devices', '/api/health']) {
    assert.match(urlText, new RegExp(route.replaceAll('/', '\\/'), 'u'));
  }
});
