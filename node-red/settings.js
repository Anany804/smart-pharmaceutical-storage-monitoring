'use strict';

const path = require('node:path');
require('../backend/load-env').loadEnv(path.join(__dirname, '..', '.env'));
const { createService } = require('../backend/service');

const databasePath = process.env.PHARMA_DB_PATH || path.join(__dirname, '..', 'data', 'pharma.sqlite');
const service = createService({ dbPath: databasePath });
const exposeHost = process.env.NODE_RED_HOST || '127.0.0.1';
const disableEditor = process.env.NODE_RED_DISABLE_EDITOR === 'true';
const adminHash = process.env.NODE_RED_ADMIN_HASH;
if (!['127.0.0.1', 'localhost', '::1'].includes(exposeHost) && !disableEditor && !adminHash) {
  throw new Error('Binding Node-RED beyond loopback requires NODE_RED_ADMIN_HASH or NODE_RED_DISABLE_EDITOR=true.');
}

module.exports = {
  uiPort: Number(process.env.PORT || 1880),
  uiHost: exposeHost,
  httpAdminRoot: disableEditor ? false : '/red',
  apiMaxLength: '64kb',
  ...(adminHash ? { adminAuth: { type: 'credentials', users: [{ username: process.env.NODE_RED_ADMIN_USER || 'admin', password: adminHash, permissions: '*' }] } } : {}),
  httpNodeRoot: '/',
  flowFile: process.env.NODE_RED_FLOW_FILE || path.join(__dirname, 'flows.json'),
  functionGlobalContext: { pharmaService: service },
  functionTimeout: 5,
  logging: { console: { level: process.env.NODE_RED_LOG_LEVEL || 'info', metrics: false, audit: false } },
  editorTheme: { page: { title: 'Pharmaceutical Storage Monitor' } }
};
