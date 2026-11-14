#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { loadEnv } = require('../backend/load-env');

const root = path.resolve(__dirname, '..');
loadEnv(path.join(root, '.env'));
const build = spawnSync(process.execPath, [path.join(__dirname, 'build-flow.js')], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const localBin = path.join(root, 'node_modules', '.bin', 'node-red');
const command = fs.existsSync(localBin) ? localBin : (process.env.NODE_RED_BIN || 'node-red');
const env = { ...process.env, NODE_RED_FLOW_FILE: path.join(root, 'node-red', 'flows-api.json') };
const child = spawn(command, ['-u', path.join(root, 'node-red', 'data'), '-s', path.join(root, 'node-red', 'settings.js')], {
  cwd: root, env, stdio: 'inherit'
});
child.on('error', error => { console.error(`Could not start Node-RED: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code || 0;
});
