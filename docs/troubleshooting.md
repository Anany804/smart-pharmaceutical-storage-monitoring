# Troubleshooting

| Symptom | Checks |
|---|---|
| `npm start` says Dashboard 2.0 is not installed | Run `bash scripts/setup.sh` with npm registry access. The package is installed under `node-red/data`, the configured Node-RED user directory. |
| Node.js cannot load `node:sqlite` | Use Node.js 22.13 or later. The setup script checks this before installing dependencies. |
| `EADDRINUSE` on port 1880 | Stop the process already using it or set another `PORT` in `.env`; update the simulator/Wokwi API URL too. |
| Device POST times out locally | Confirm Node-RED health locally, API host/port, firewall and route. Wokwi public gateway cannot call a local computer; enable the private gateway and use `host.wokwi.internal`. |
| `401 UNAUTHORIZED` on telemetry | Match `PHARMA_INGEST_TOKEN` in backend `.env` with `API_BEARER_TOKEN` in untracked `firmware/include/config.h`. |
| HTTPS POST fails before reaching the server | Verify the correct hostname, trusted root CA in `API_TLS_ROOT_CA`, device/system time and certificate chain. Firmware intentionally does not allow insecure TLS. |
| Dashboard says API unavailable | Confirm Node-RED is running and `/api/health` returns JSON. Inspect Node-RED logs, imported FlowFuse Dashboard 2.0 nodes and the browser console. |
| Dashboard has no sensor values | Start the simulator or physical device, check `/api/latest`, confirm sensor POSTs pass validation and check the device ID. The UI does not generate sample data. |
| Missing DHT readings / NaN | Check 3.3 V/GND, GPIO15, the data pull-up, DHT22 timing and serial output. DHT22 should not be sampled more often than its supported interval. |
| GPIO34 reading is always invalid or saturated | Check divider wiring, common ground and that analog voltage does not exceed 3.3 V; confirm the LDR AO connection and `light_raw` 0–4095 range. |
| Device remains offline | Online state uses server receipt time. Send a valid reading and confirm the default 90-second heartbeat timeout or raise/lower `PHARMA_OFFLINE_AFTER_SECONDS`. |
| SQLite cannot write | Ensure project `data/` is writable, the DB path is valid and no other process holds an incompatible lock. Check free disk space and WAL/SHM files. |
| Build fails in PlatformIO | Confirm a supported ESP32 Arduino toolchain, registry connectivity, and the pinned ESP32 DHT library install. The library was selected because Wokwi recommends its ESP32 behavior. |

For a clean prototype reset, stop Node-RED first and remove `data/pharma.sqlite` plus its `-wal`/`-shm` companions if present. The next startup recreates an empty schema.
