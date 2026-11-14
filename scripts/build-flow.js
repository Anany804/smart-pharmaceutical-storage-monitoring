#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'node-red', 'dashboard-ui.vue'), 'utf8');
const apiDispatcher = fs.readFileSync(path.join(root, 'node-red', 'api-dispatch.js.txt'), 'utf8').replace(/^\/\/.*\n/, '');
const offlineCheck = fs.readFileSync(path.join(root, 'node-red', 'offline-check.js.txt'), 'utf8');
const tabId = 'a0a1a1a1a1a1a1a1';
const baseId = 'b0b1b1b1b1b1b1b1';
const themeId = 'c0c1c1c1c1c1c1c1';
const pageId = 'd0d1d1d1d1d1d1d1';
const groupId = 'e0e1e1e1e1e1e1e1';
const dispatchId = 'f0f1f1f1f1f1f1f1';
const responseId = '0101010101010101';
const offlineId = '0202020202020202';
const injectId = '0303030303030303';
const uiId = '0404040404040404';
const routes = [
  ['POST', '/api/sensor-data'],
  ['GET', '/api/latest'],
  ['GET', '/api/history'],
  ['GET', '/api/score'],
  ['POST', '/api/inspection'],
  ['GET', '/api/inspections'],
  ['GET', '/api/alerts'],
  ['PATCH', '/api/alerts/:id/acknowledge'],
  ['GET', '/api/devices'],
  ['GET', '/api/health']
];

const flow = [
  { id: tabId, type: 'tab', label: 'Pharmaceutical Storage Monitor', disabled: false, info: 'REST API, SQLite, device monitoring and Dashboard 2.0.' },
  {
    id: baseId, type: 'ui-base', name: 'Pharmaceutical Storage Monitor', path: '/dashboard', appIcon: '',
    includeClientData: true, acceptsClientConfig: ['ui-notification', 'ui-control'], showPathInSidebar: false,
    headerContent: 'page', navigationStyle: 'default', titleBarStyle: 'fixed', showReconnectNotification: true,
    notificationDisplayTime: 2, showDisconnectNotification: true, allowInstall: false, allowTempTheme: true,
    hideHeader: false, hideSinglePage: false, lockPage: false
  },
  {
    id: themeId, type: 'ui-theme', name: 'Cold Chain Dark', colors: {
      surface: '#111b25', primary: '#39b895', bgPage: '#0b1118', groupBg: '#0f1821', groupOutline: '#243444'
    }, sizes: { density: 'default', pagePadding: '0px', groupGap: '0px', groupBorderRadius: '0px', widgetGap: '0px' }
  },
  {
    id: pageId, type: 'ui-page', name: 'Overview', ui: baseId, path: '/overview', icon: 'monitor-dashboard',
    layout: 'grid', theme: themeId, breakpoints: [
      { name: 'Default', px: '0', cols: '3' }, { name: 'Tablet', px: '576', cols: '6' },
      { name: 'Laptop', px: '768', cols: '9' }, { name: 'Desktop', px: '1024', cols: '12' }
    ], order: 1, className: '', visible: 'true', disabled: 'false'
  },
  {
    id: groupId, type: 'ui-group', name: 'Environmental Monitoring', page: pageId, width: '12', height: '1',
    order: 1, showTitle: false, className: ''
  },
  {
    id: uiId, type: 'ui-template', z: tabId, group: groupId, page: '', ui: '', name: 'Live Storage Monitor', order: 1,
    width: '12', height: '0', head: '', format: template, storeOutMessages: false, passthru: false,
    resendOnRefresh: true, templateScope: 'local', className: '', x: 180, y: 80, wires: [[]]
  },
  ...routes.map(([method, url], index) => ({
    id: `1000000000000${String(index).padStart(2, '0')}`, type: 'http in', z: tabId,
    name: `${method} ${url}`, url, method: method.toLowerCase(), upload: false,
    skipBodyParsing: method === 'POST', swaggerDoc: '',
    x: 130, y: 110 + index * 55, wires: [[dispatchId]]
  })),
  {
    id: dispatchId, type: 'function', z: tabId, name: 'Validate, store, score and respond', func: apiDispatcher,
    outputs: 1, timeout: 5, noerr: 0, initialize: '', finalize: '', libs: [],
    x: 465, y: 355, wires: [[responseId]]
  },
  { id: responseId, type: 'http response', z: tabId, name: 'JSON API response', statusCode: '', headers: {}, x: 745, y: 355, wires: [] },
  {
    id: injectId, type: 'inject', z: tabId, name: 'Check device heartbeat every 15 seconds', props: [{ p: 'payload' }],
    repeat: '15', crontab: '', once: true, onceDelay: '2', topic: '', payload: '', payloadType: 'date',
    x: 155, y: 810, wires: [[offlineId]]
  },
  {
    id: offlineId, type: 'function', z: tabId, name: 'Create and recover offline alerts', func: offlineCheck,
    outputs: 0, timeout: 5, noerr: 0, initialize: '', finalize: '', libs: [], x: 470, y: 810, wires: []
  }
];

fs.writeFileSync(path.join(root, 'node-red', 'flows.json'), `${JSON.stringify(flow, null, 2)}\n`);
const apiFlow = flow.filter(node => node.type === 'tab' || ['http in', 'function', 'http response', 'inject'].includes(node.type));
fs.writeFileSync(path.join(root, 'node-red', 'flows-api.json'), `${JSON.stringify(apiFlow, null, 2)}\n`);
console.log('Wrote node-red/flows.json and node-red/flows-api.json');
