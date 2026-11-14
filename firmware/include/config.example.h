#pragma once

// Copy this file to config.h and edit values for the target network.
// Wokwi users can keep WIFI_SSID as Wokwi-GUEST and WIFI_PASSWORD empty.
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// For the Wokwi private gateway / VS Code extension, the local host is exposed
// to the simulated ESP32 as host.wokwi.internal. For a physical device use the
// reachable LAN address of the Node-RED host (for example http://192.168.1.20:1880).
#define API_BASE_URL "http://host.wokwi.internal:1880"

// Optional bearer token checked by the backend on sensor ingestion.
// Keep this out of source control. An empty value disables the Authorization header.
#define API_BEARER_TOKEN ""

// For HTTPS endpoints, paste the trusted server CA certificate as a PEM string.
// Leave empty for private-gateway/local HTTP. TLS verification is never disabled.
#define API_TLS_ROOT_CA ""

#define DEVICE_ID "PHARMA_ESP32_001"
#define READING_INTERVAL_MS 10000UL
#define WIFI_RETRY_INTERVAL_MS 5000UL
#define HTTP_TIMEOUT_MS 3000
#define MAX_RETRY_MS 60000UL
