# ESP32 firmware

The PlatformIO project is Arduino C++ for an ESP32 DevKit V1. Pins: DHT22 data GPIO15, photoresistor module AO GPIO34, and active-low inspection button GPIO18 (`INPUT_PULLUP`). Sampling defaults to 10 seconds.

1. Install PlatformIO CLI/extension and copy `include/config.example.h` to `include/config.h`.
2. For local Wokwi, use `WIFI_SSID "Wokwi-GUEST"`, an empty password and `API_BASE_URL "http://host.wokwi.internal:1880"` while the Wokwi private gateway is enabled.
3. For physical hardware, configure the local Wi-Fi credentials and a Node-RED host reachable on the device's LAN. Do not commit `config.h`.
4. Build from this directory using `pio run`; monitor serial with `pio device monitor` when using a connected board.

The firmware validates the DHT/ADC readings, synchronizes UTC through NTP when available, posts JSON, reports HTTP response codes and maintains bounded in-memory retry queues (20 readings, 10 inspections) with exponential backoff. Queue contents do not survive reset. Its light percentage maps ADC range to a relative proxy; it is not a calibrated lux value. HTTPClient calls are synchronous but have a 3-second timeout.

HTTPS requires a trusted CA PEM string in `API_TLS_ROOT_CA`; the code refuses an HTTPS connection without it and never disables certificate validation. If `PHARMA_INGEST_TOKEN` is set by the backend, set the matching token in the untracked firmware config.
