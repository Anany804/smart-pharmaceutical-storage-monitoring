#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { loadEnv } = require('../backend/load-env');

const root = path.resolve(__dirname, '..');
loadEnv(path.join(root, '.env'));

try {
  fs.accessSync(path.join(root, 'node-red', 'data', 'node_modules', '@flowfuse', 'node-red-dashboard', 'package.json'));
} catch {
  console.error('Node-RED Dashboard 2.0 is not installed. Run npm install from the project directory.');
  process.exit(1);
}

const build = spawnSync(process.execPath, [path.join(__dirname, 'build-flow.js')], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const localBin = path.join(root, 'node_modules', '.bin', 'node-red');
const command = fs.existsSync(localBin) ? localBin : (process.env.NODE_RED_BIN || 'node-red');
const userDir = path.join(root, 'node-red', 'data');
const settings = path.join(root, 'node-red', 'settings.js');
const child = spawn(command, ['-u', userDir, '-s', settings], { cwd: root, env: process.env, stdio: 'inherit' });
child.on('error', error => {
  console.error(`Could not start Node-RED: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code || 0;
});
