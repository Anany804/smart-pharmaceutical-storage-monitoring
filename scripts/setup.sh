#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) { console.error('Node.js 22.13 or newer is required (built-in node:sqlite).'); process.exit(1); }"
if [[ ! -f .env ]]; then cp .env.example .env; echo "Created .env from .env.example. Review the limits before use."; fi
npm install
mkdir -p node-red/data
npm install --prefix node-red/data --no-save '@flowfuse/node-red-dashboard@^1.34.1'
mkdir -p data node-red/data
node scripts/build-flow.js
echo "Setup complete. Start Node-RED with: npm start"
