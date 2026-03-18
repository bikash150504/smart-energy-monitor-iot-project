/*
 * ============================================================
 *   SMART ENERGY MONITORING SYSTEM — ESP32 Firmware
 *   Author : Your Name
 *   Board  : ESP32 DevKit V1
 *   Sensors: PZEM-004T v3 (Power), DHT22 (Temp/Humidity)
 *   Cloud  : Firebase RTDB + MQTT (HiveMQ)
 * ============================================================
 *
 *  WIRING GUIDE:
 *  ┌─────────────────────────────────────────────────┐
 *  │  PZEM-004T v3                                   │
 *  │  TX  ──►  GPIO 16 (ESP32 RX2)                   │
 *  │  RX  ──►  GPIO 17 (ESP32 TX2)                   │
 *  │  VCC ──►  5V                                    │
 *  │  GND ──►  GND                                   │
 *  │  (AC Line: Connect through current transformer) │
 *  │                                                 │
 *  │  DHT22                                          │
 *  │  DATA ──►  GPIO 4                               │
 *  │  VCC  ──►  3.3V                                 │
 *  │  GND  ──►  GND                                  │
 *  │                                                 │
 *  │  OLED SSD1306 (I2C)                             │
 *  │  SDA  ──►  GPIO 21                              │
 *  │  SCL  ──►  GPIO 22                              │
 *  │  VCC  ──►  3.3V                                 │
 *  │  GND  ──►  GND                                  │
 *  │                                                 │
 *  │  Status LED                                     │
 *  │  (+) ──► GPIO 2 (built-in LED)                  │
 *  └─────────────────────────────────────────────────┘
 *
 *  LIBRARIES REQUIRED (Install via Arduino Library Manager):
 *  - PZEM-004T-v30 by Jakub Mandula
 *  - DHT sensor library by Adafruit
 *  - Adafruit SSD1306
 *  - Adafruit GFX Library
 *  - PubSubClient by Nick O'Leary (MQTT)
 *  - ArduinoJson by Benoit Blanchon
 *  - Firebase ESP Client by Mobizt
 */

// ─── Core Libraries ───────────────────────────────────────
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Firebase_ESP_Client.h>
#include <time.h>

// ─── Credentials (Replace with your own) ──────────────────
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// Firebase
#define FIREBASE_API_KEY        "YOUR_FIREBASE_API_KEY"
#define FIREBASE_DATABASE_URL   "YOUR_PROJECT.firebaseio.com"
#define FIREBASE_USER_EMAIL     "YOUR_FIREBASE_EMAIL"
#define FIREBASE_USER_PASSWORD  "YOUR_FIREBASE_PASSWORD"

// MQTT — HiveMQ Cloud (free tier)
#define MQTT_BROKER   "YOUR_HIVEMQ_BROKER.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USER     "YOUR_MQTT_USERNAME"
#define MQTT_PASS     "YOUR_MQTT_PASSWORD"
#define MQTT_CLIENT_ID "ESP32_EnergyMonitor_001"

// MQTT Topics
#define TOPIC_ENERGY   "home/energy/live"
#define TOPIC_ALERT    "home/energy/alert"
#define TOPIC_COMMAND  "home/energy/command"

// ─── Pin & Hardware Config ─────────────────────────────────
#define DHT_PIN         4
#define DHT_TYPE        DHT22
#define PZEM_RX_PIN     16
#define PZEM_TX_PIN     17
#define STATUS_LED      2
#define SCREEN_WIDTH    128
#define SCREEN_HEIGHT   64
#define OLED_RESET      -1

// ─── Thresholds for Alerts ─────────────────────────────────
#define MAX_VOLTAGE     250.0   // Volts
#define MIN_VOLTAGE     200.0   // Volts
#define MAX_CURRENT     15.0    // Amps
#define MAX_POWER       3000.0  // Watts
#define MAX_TEMP        40.0    // Celsius
#define MAX_ENERGY_DAY  10.0    // kWh per day

// ─── Intervals ────────────────────────────────────────────
#define SENSOR_READ_INTERVAL   2000   // 2 seconds
#define FIREBASE_PUSH_INTERVAL 5000   // 5 seconds
#define MQTT_PUBLISH_INTERVAL  3000   // 3 seconds
#define DISPLAY_CYCLE_INTERVAL 4000   // 4 seconds

// ─── Object Initialization ────────────────────────────────
HardwareSerial pzemSerial(2);              // UART2 for PZEM
PZEM004Tv30 pzem(pzemSerial, PZEM_RX_PIN, PZEM_TX_PIN);
DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig fbConfig;

// ─── Global State ─────────────────────────────────────────
struct EnergyData {
  float voltage;
  float current;
  float power;
  float energy;      // kWh (cumulative from PZEM)
  float frequency;
  float powerFactor;
  float temperature;
  float humidity;
  bool  voltageAlert;
  bool  currentAlert;
  bool  powerAlert;
  bool  tempAlert;
  String timestamp;
};

EnergyData liveData;
unsigned long lastSensorRead   = 0;
unsigned long lastFirebasePush = 0;
unsigned long lastMqttPublish  = 0;
unsigned long lastDisplayCycle = 0;
int displayPage = 0;
float dailyEnergyStart = 0.0;
bool  firebaseReady = false;

// ─── HiveMQ Root CA Certificate ───────────────────────────
// Update with your broker's certificate
const char* mqtt_root_ca = \
  "-----BEGIN CERTIFICATE-----\n" \
  "MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
  "... (paste your HiveMQ CA cert here) ...\n" \
  "-----END CERTIFICATE-----\n";

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);

  // OLED Init
  Wire.begin();
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 allocation failed");
  }
  displaySplash();

  // Sensor Init
  dht.begin();
  Serial.println("DHT22 initialized");

  // WiFi
  connectWiFi();

  // Time Sync (NTP)
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Syncing time");
  while (!time(nullptr)) { Serial.print("."); delay(500); }
  Serial.println(" done");

  // Firebase
  initFirebase();

  // MQTT
  espClient.setCACert(mqtt_root_ca);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);
  connectMQTT();

  Serial.println("\n>>> Smart Energy Monitor ONLINE <<<");
}

// ═══════════════════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // Keep MQTT alive
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  // ── Read sensors every 2 seconds ──────────────────────
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;
    readSensors();
    checkAlerts();
    updateDisplay();
  }

  // ── Publish to MQTT every 3 seconds ───────────────────
  if (now - lastMqttPublish >= MQTT_PUBLISH_INTERVAL) {
    lastMqttPublish = now;
    publishMQTT();
  }

  // ── Push to Firebase every 5 seconds ──────────────────
  if (now - lastFirebasePush >= FIREBASE_PUSH_INTERVAL && firebaseReady) {
    lastFirebasePush = now;
    pushToFirebase();
  }
}

// ═══════════════════════════════════════════════════════════
//  SENSOR READING
// ═══════════════════════════════════════════════════════════
void readSensors() {
  // ── PZEM-004T (Electrical Parameters) ─────────────────
  float v = pzem.voltage();
  float c = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();
  float f = pzem.frequency();
  float pf = pzem.pf();

  // Validate readings (NaN check)
  liveData.voltage     = isnan(v)  ? 0.0 : v;
  liveData.current     = isnan(c)  ? 0.0 : c;
  liveData.power       = isnan(p)  ? 0.0 : p;
  liveData.energy      = isnan(e)  ? 0.0 : e;
  liveData.frequency   = isnan(f)  ? 0.0 : f;
  liveData.powerFactor = isnan(pf) ? 0.0 : pf;

  // ── DHT22 (Temperature & Humidity) ────────────────────
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  liveData.temperature = isnan(t) ? 0.0 : t;
  liveData.humidity    = isnan(h) ? 0.0 : h;

  // ── Timestamp (ISO 8601) ───────────────────────────────
  time_t now = time(nullptr);
  struct tm* timeinfo = gmtime(&now);
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", timeinfo);
  liveData.timestamp = String(buf);

  // Debug print
  Serial.printf("[%s] V:%.1f A:%.2f W:%.1f kWh:%.3f Hz:%.1f PF:%.2f T:%.1f H:%.1f\n",
    buf, liveData.voltage, liveData.current, liveData.power,
    liveData.energy, liveData.frequency, liveData.powerFactor,
    liveData.temperature, liveData.humidity);

  // Blink LED on successful read
  digitalWrite(STATUS_LED, HIGH);
  delay(50);
  digitalWrite(STATUS_LED, LOW);
}

// ═══════════════════════════════════════════════════════════
//  ALERT CHECKING
// ═══════════════════════════════════════════════════════════
void checkAlerts() {
  bool prevVoltAlert   = liveData.voltageAlert;
  bool prevCurrAlert   = liveData.currentAlert;
  bool prevPowerAlert  = liveData.powerAlert;
  bool prevTempAlert   = liveData.tempAlert;

  liveData.voltageAlert = (liveData.voltage > MAX_VOLTAGE || liveData.voltage < MIN_VOLTAGE);
  liveData.currentAlert = (liveData.current > MAX_CURRENT);
  liveData.powerAlert   = (liveData.power   > MAX_POWER);
  liveData.tempAlert    = (liveData.temperature > MAX_TEMP);

  // Publish alert only when state changes to ACTIVE
  if (!prevVoltAlert && liveData.voltageAlert)
    publishAlert("VOLTAGE", String("Voltage out of range: ") + liveData.voltage + "V");
  if (!prevCurrAlert && liveData.currentAlert)
    publishAlert("CURRENT", String("High current: ") + liveData.current + "A");
  if (!prevPowerAlert && liveData.powerAlert)
    publishAlert("POWER", String("High power draw: ") + liveData.power + "W");
  if (!prevTempAlert && liveData.tempAlert)
    publishAlert("TEMPERATURE", String("High temperature: ") + liveData.temperature + "°C");
}

// ═══════════════════════════════════════════════════════════
//  MQTT FUNCTIONS
// ═══════════════════════════════════════════════════════════
void publishMQTT() {
  StaticJsonDocument<512> doc;
  doc["deviceId"]     = MQTT_CLIENT_ID;
  doc["timestamp"]    = liveData.timestamp;
  doc["voltage"]      = serialized(String(liveData.voltage, 1));
  doc["current"]      = serialized(String(liveData.current, 2));
  doc["power"]        = serialized(String(liveData.power, 1));
  doc["energy"]       = serialized(String(liveData.energy, 3));
  doc["frequency"]    = serialized(String(liveData.frequency, 1));
  doc["powerFactor"]  = serialized(String(liveData.powerFactor, 2));
  doc["temperature"]  = serialized(String(liveData.temperature, 1));
  doc["humidity"]     = serialized(String(liveData.humidity, 1));
  doc["voltageAlert"] = liveData.voltageAlert;
  doc["currentAlert"] = liveData.currentAlert;
  doc["powerAlert"]   = liveData.powerAlert;
  doc["tempAlert"]    = liveData.tempAlert;

  char payload[512];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_ENERGY, payload, true); // retained message
}

void publishAlert(String type, String message) {
  StaticJsonDocument<256> doc;
  doc["type"]      = type;
  doc["message"]   = message;
  doc["deviceId"]  = MQTT_CLIENT_ID;
  doc["timestamp"] = liveData.timestamp;
  doc["severity"]  = "HIGH";

  char payload[256];
  serializeJson(doc, payload);
  mqttClient.publish(TOPIC_ALERT, payload);
  Serial.printf("[ALERT] %s: %s\n", type.c_str(), message.c_str());
}

void mqttCallback(char* topic, byte* message, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) msg += (char)message[i];
  Serial.printf("[MQTT CMD] %s: %s\n", topic, msg.c_str());

  // Handle remote commands
  if (String(topic) == TOPIC_COMMAND) {
    StaticJsonDocument<128> cmd;
    deserializeJson(cmd, msg);
    if (cmd["action"] == "reset_energy") pzem.resetEnergy();
    if (cmd["action"] == "reboot")       ESP.restart();
  }
}

void connectMQTT() {
  Serial.print("Connecting to MQTT...");
  while (!mqttClient.connected()) {
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
      Serial.println(" connected!");
      mqttClient.subscribe(TOPIC_COMMAND);
    } else {
      Serial.printf(" failed (rc=%d), retry in 5s\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  FIREBASE FUNCTIONS
// ═══════════════════════════════════════════════════════════
void initFirebase() {
  fbConfig.api_key          = FIREBASE_API_KEY;
  fbConfig.database_url     = FIREBASE_DATABASE_URL;
  auth.user.email           = FIREBASE_USER_EMAIL;
  auth.user.password        = FIREBASE_USER_PASSWORD;
  fbConfig.token_status_callback = tokenStatusCallback;

  Firebase.begin(&fbConfig, &auth);
  Firebase.reconnectWiFi(true);

  Serial.print("Connecting to Firebase");
  while (auth.token.uid == "") { Serial.print("."); delay(500); }
  firebaseReady = true;
  Serial.println(" ready! UID: " + String(auth.token.uid.c_str()));
}

void pushToFirebase() {
  String devicePath = "/devices/ESP32_001";

  // ── Live data (overwrites) ─────────────────────────────
  FirebaseJson json;
  json.set("voltage",      liveData.voltage);
  json.set("current",      liveData.current);
  json.set("power",        liveData.power);
  json.set("energy",       liveData.energy);
  json.set("frequency",    liveData.frequency);
  json.set("powerFactor",  liveData.powerFactor);
  json.set("temperature",  liveData.temperature);
  json.set("humidity",     liveData.humidity);
  json.set("voltageAlert", liveData.voltageAlert);
  json.set("currentAlert", liveData.currentAlert);
  json.set("powerAlert",   liveData.powerAlert);
  json.set("tempAlert",    liveData.tempAlert);
  json.set("lastUpdated",  liveData.timestamp);
  json.set("online",       true);

  if (!Firebase.RTDB.updateNode(&fbdo, devicePath + "/live", &json)) {
    Serial.println("Firebase live update failed: " + fbdo.errorReason());
    return;
  }

  // ── Historical data (push new entry every 5s) ─────────
  FirebaseJson histJson;
  histJson.set("v",  liveData.voltage);
  histJson.set("i",  liveData.current);
  histJson.set("p",  liveData.power);
  histJson.set("e",  liveData.energy);
  histJson.set("t",  liveData.temperature);
  histJson.set("h",  liveData.humidity);
  histJson.set("ts", liveData.timestamp);

  String histPath = devicePath + "/history";
  if (!Firebase.RTDB.pushJSON(&fbdo, histPath, &histJson)) {
    Serial.println("Firebase history push failed: " + fbdo.errorReason());
  }
}

void tokenStatusCallback(TokenInfo info) {
  if (info.status == token_status_error)
    Serial.printf("Token error: %s\n", info.error.message.c_str());
}

// ═══════════════════════════════════════════════════════════
//  OLED DISPLAY
// ═══════════════════════════════════════════════════════════
void displaySplash() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 10);
  display.println("Smart Energy");
  display.setCursor(10, 22);
  display.println("Monitor v1.0");
  display.drawLine(0, 35, 127, 35, SSD1306_WHITE);
  display.setCursor(10, 42);
  display.println("Initializing...");
  display.display();
  delay(2000);
}

void updateDisplay() {
  unsigned long now = millis();
  if (now - lastDisplayCycle >= DISPLAY_CYCLE_INTERVAL) {
    lastDisplayCycle = now;
    displayPage = (displayPage + 1) % 3;  // Cycle 3 pages
  }

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Page indicator dots
  for (int i = 0; i < 3; i++) {
    if (i == displayPage) display.fillCircle(57 + i*7, 60, 2, SSD1306_WHITE);
    else                  display.drawCircle(57 + i*7, 60, 2, SSD1306_WHITE);
  }

  switch (displayPage) {
    case 0: // Power Page
      display.setTextSize(1);
      display.setCursor(35, 0); display.println("POWER");
      display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(15, 18);
      display.printf("%.0fW", liveData.power);
      display.setTextSize(1);
      display.setCursor(0, 42);
      display.printf("%.1fV  %.2fA", liveData.voltage, liveData.current);
      break;

    case 1: // Energy / Cost Page
      display.setTextSize(1);
      display.setCursor(25, 0); display.println("ENERGY USE");
      display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(5, 18);
      display.printf("%.3fkWh", liveData.energy);
      display.setTextSize(1);
      display.setCursor(0, 42);
      display.printf("PF:%.2f  Hz:%.1f", liveData.powerFactor, liveData.frequency);
      break;

    case 2: // Environment Page
      display.setTextSize(1);
      display.setCursor(20, 0); display.println("ENVIRONMENT");
      display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
      display.setTextSize(2);
      display.setCursor(5, 18);
      display.printf("%.1f%cC", liveData.temperature, (char)247);
      display.setCursor(70, 18);
      display.printf("%.0f%%", liveData.humidity);
      display.setTextSize(1);
      display.setCursor(0, 42);
      // Show any active alerts
      if (liveData.powerAlert)   display.print("! HIGH POWER ");
      if (liveData.voltageAlert) display.print("! VOLTAGE ");
      if (!liveData.powerAlert && !liveData.voltageAlert) display.print("All systems normal");
      break;
  }

  display.display();
}

// ═══════════════════════════════════════════════════════════
//  WIFI
// ═══════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.display();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi FAILED — rebooting in 5s");
    delay(5000);
    ESP.restart();
  }
}
