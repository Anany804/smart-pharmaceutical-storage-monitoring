# Node-RED runtime

`flows.json` is the complete generated flow: REST API routes, SQLite service dispatch, 15-second offline check and FlowFuse Dashboard 2.0. `flows-api.json` is generated from the same API nodes and omits UI nodes for API-only runtime checks. The source Vue widget is `dashboard-ui.vue`; API and offline Function node sources are beside it. Run `npm run build:flow` after changing those sources.

`settings.js` loads `.env`, initializes the shared service into `functionGlobalContext.pharmaService`, binds loopback by default and points Node-RED at the complete flow. `npm start` launches it. Install `@flowfuse/node-red-dashboard` inside the configured user directory with `bash scripts/setup.sh`; the main flow cannot run until those node types are installed.

Node-RED editor: `http://127.0.0.1:1880/red` (loopback only by default). Dashboard: `http://127.0.0.1:1880/dashboard/overview`. For a separate Node-RED user directory, configure the same `functionGlobalContext`, database path and complete flow import.
