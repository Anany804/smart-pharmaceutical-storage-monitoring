#include <Arduino.h>
#include <DHTesp.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <deque>
#include <cstring>

#if __has_include("config.h")
#include "config.h"
#else
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define API_BASE_URL "http://host.wokwi.internal:1880"
#define API_BEARER_TOKEN ""
#define API_TLS_ROOT_CA ""
#define DEVICE_ID "PHARMA_ESP32_001"
#define READING_INTERVAL_MS 10000UL
#define WIFI_RETRY_INTERVAL_MS 5000UL
#define HTTP_TIMEOUT_MS 3000
#define MAX_RETRY_MS 60000UL
#endif

namespace {
constexpr uint8_t DHT_PIN = 15;
constexpr uint8_t LDR_PIN = 34;
constexpr uint8_t BUTTON_PIN = 18;
constexpr uint32_t BUTTON_DEBOUNCE_MS = 40;
constexpr uint32_t NTP_RESYNC_MS = 600000UL;

DHTesp dht;
uint32_t lastReadingAt = 0;
uint32_t lastWifiAttemptAt = 0;
uint32_t lastNtpSyncAt = 0;
uint32_t lastButtonEdgeAt = 0;
struct PendingRequest {
  String payload;
  uint32_t retryAt;
  uint32_t backoffMs;
};
constexpr size_t MAX_QUEUED_READINGS = 20;
constexpr size_t MAX_QUEUED_INSPECTIONS = 10;
std::deque<PendingRequest> sensorQueue;
std::deque<PendingRequest> inspectionQueue;
bool rawButtonPressed = false;
bool stableButtonPressed = false;
bool sensorPending = false;
bool inspectionPending = false;
String pendingSensorPayload;
String pendingInspectionPayload;

String makeTimestamp() {
  const time_t now = time(nullptr);
  if (now < 1700000000) return String();
  struct tm utc;
  gmtime_r(&now, &utc);
  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(buffer);
}

bool validReading(float temperature, float humidity, int lightRaw) {
  return isfinite(temperature) && temperature >= -40.0F && temperature <= 80.0F &&
         isfinite(humidity) && humidity >= 0.0F && humidity <= 100.0F &&
         lightRaw >= 0 && lightRaw <= 4095;
}

String escapedJson(const char *text) {
  String result;
  for (const char *cursor = text; *cursor; ++cursor) {
    if (*cursor == '"' || *cursor == '\\') result += '\\';
    if (*cursor == '\n') result += "\\n";
    else if (*cursor == '\r') result += "\\r";
    else result += *cursor;
  }
  return result;
}

void buildSensorPayload(bool inspectionRequested) {
  const TempAndHumidity sample = dht.getTempAndHumidity();
  const int lightRaw = analogRead(LDR_PIN);
  if (dht.getStatus() != DHTesp::ERROR_NONE || !validReading(sample.temperature, sample.humidity, lightRaw)) {
    Serial.printf("Sensor reading rejected: %s, T=%.2f C, RH=%.2f%%, LDR=%d\n",
                  dht.getStatusString(), sample.temperature, sample.humidity, lightRaw);
    return;
  }

  // This normalized estimate is a dashboard proxy, not a calibrated lux value.
  // The Wokwi photoresistor module's AO voltage falls as illumination rises.
  const float lightPercentage = 100.0F * (1.0F - static_cast<float>(lightRaw) / 4095.0F);
  String payload = "{\"device_id\":\"" DEVICE_ID "\",\"temperature\":";
  payload += String(sample.temperature, 2);
  payload += ",\"humidity\":" + String(sample.humidity, 2);
  payload += ",\"light_raw\":" + String(lightRaw);
  payload += ",\"light_percentage\":" + String(lightPercentage, 2);
  const String timestamp = makeTimestamp();
  if (!timestamp.isEmpty()) payload += ",\"timestamp\":\"" + timestamp + "\"";
  payload += inspectionRequested ? ",\"inspection_requested\":true}" : ",\"inspection_requested\":false}";
  if (sensorQueue.size() >= MAX_QUEUED_READINGS) {
    sensorQueue.pop_front();
    Serial.println("Sensor retry queue full; dropped its oldest unsent sample.");
  }
  sensorQueue.push_back({payload, millis(), 1000});
  Serial.printf("Sample ready: T=%.2f C, RH=%.2f%%, LDR=%d, exposure=%.2f%%\n",
                sample.temperature, sample.humidity, lightRaw, lightPercentage);
}

void queueInspection() {
  const String note = "Inspection requested using ESP32 push button";
  String payload = "{\"device_id\":\"" DEVICE_ID "\",\"source\":\"physical_button\",\"notes\":\"";
  payload += escapedJson(note.c_str());
  payload += "\"}";
  if (inspectionQueue.size() >= MAX_QUEUED_INSPECTIONS) {
    inspectionQueue.pop_front();
    Serial.println("Inspection retry queue full; dropped its oldest unsent request.");
  }
  inspectionQueue.push_back({payload, millis(), 1000});
  Serial.println("Manual inspection request queued.");
}

int postJson(const String &path, const String &payload) {
  if (WiFi.status() != WL_CONNECTED) return 0;
  HTTPClient http;
  const String url = String(API_BASE_URL) + path;
  int status = -1;
  String response;
  const auto configureHeaders = [&http]() {
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");
    if (strlen(API_BEARER_TOKEN) > 0) http.addHeader("Authorization", String("Bearer ") + API_BEARER_TOKEN);
  };
  if (url.startsWith("https://")) {
    if (strlen(API_TLS_ROOT_CA) == 0) {
      Serial.println("HTTPS is configured without API_TLS_ROOT_CA; refusing an unverified TLS connection.");
      return -1;
    }
    WiFiClientSecure client;
    client.setCACert(API_TLS_ROOT_CA);
    if (!http.begin(client, url)) {
      Serial.printf("HTTPS setup failed for %s\n", url.c_str());
      return -1;
    }
    configureHeaders();
    status = http.POST(payload);
    response = http.getString();
    http.end();
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) {
      Serial.printf("HTTP setup failed for %s\n", url.c_str());
      return -1;
    }
    configureHeaders();
    status = http.POST(payload);
    response = http.getString();
    http.end();
  }
  if (status >= 200 && status < 300) {
    Serial.printf("POST %s -> %d %s\n", path.c_str(), status, response.c_str());
    return status;
  }
  Serial.printf("POST %s failed -> %d %s\n", path.c_str(), status, response.c_str());
  return status;
}

void retrySoon(PendingRequest &request) {
  request.retryAt = millis() + request.backoffMs;
  request.backoffMs = min(request.backoffMs * 2U, static_cast<uint32_t>(MAX_RETRY_MS));
}

void sendPending() {
  const uint32_t now = millis();
  if (!sensorQueue.empty() && static_cast<int32_t>(now - sensorQueue.front().retryAt) >= 0) {
    const int status = postJson("/api/sensor-data", sensorQueue.front().payload);
    if (status >= 200 && status < 300) sensorQueue.pop_front();
    else retrySoon(sensorQueue.front());
  }
  if (!inspectionQueue.empty() && static_cast<int32_t>(now - inspectionQueue.front().retryAt) >= 0) {
    const int status = postJson("/api/inspection", inspectionQueue.front().payload);
    if (status >= 200 && status < 300) inspectionQueue.pop_front();
    else retrySoon(inspectionQueue.front());
  }
}

void updateButton(uint32_t now) {
  const bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed != rawButtonPressed) {
    rawButtonPressed = pressed;
    lastButtonEdgeAt = now;
  }
  if ((now - lastButtonEdgeAt) >= BUTTON_DEBOUNCE_MS && rawButtonPressed != stableButtonPressed) {
    stableButtonPressed = rawButtonPressed;
    if (stableButtonPressed) queueInspection();
  }
}

void maintainWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (lastNtpSyncAt == 0 || now - lastNtpSyncAt >= NTP_RESYNC_MS) {
      configTime(0, 0, "pool.ntp.org", "time.nist.gov");
      lastNtpSyncAt = now;
    }
    return;
  }
  if (now - lastWifiAttemptAt >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiAttemptAt = now;
    Serial.printf("Wi-Fi disconnected; retrying SSID '%s'\n", WIFI_SSID);
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  analogReadResolution(12);
  dht.setup(DHT_PIN, DHTesp::DHT22);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.printf("Pharmaceutical monitor %s starting. API: %s\n", DEVICE_ID, API_BASE_URL);
}

void loop() {
  const uint32_t now = millis();
  maintainWifi(now);
  updateButton(now);

  if (now - lastReadingAt >= READING_INTERVAL_MS) {
    lastReadingAt = now;
    buildSensorPayload(false);
  }
  sendPending();
  yield();
}
