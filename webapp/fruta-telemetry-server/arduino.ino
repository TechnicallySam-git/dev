  #include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include <time.h>
#include <mbedtls/base64.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/sha1.h>
#include <mbedtls/error.h>
#include <mbedtls/pk.h>
// persist daily counters
#include <Preferences.h>

// =============================
// WiFi Configuration
// =============================
const char* ssid = "fruta";
const char* password = "password123";

// =============================
// Azure IoT Hub MQTT Configuration
// =============================
// device identity (plain device id)
const char* device_id = "FRUTA-Proto";
// MQTT client id must be the device id for IoT Hub
const char* mqtt_client_id = device_id;
// MQTT username: "<iothub_hostname>/<device_id>/?api-version=2018-06-30"
const char* mqtt_username = "FRUTA-IoTHub2.azure-devices.net/FRUTA-Proto/?api-version=2018-06-30";
const char* mqtt_password = "";

// =============================
// Certificates (base64 embedded)
// =============================
// Device certificate PEM (use the same PEM file you tested with mosquitto)
const char* device_cert_pem = R"PEM(-----BEGIN CERTIFICATE-----
MIIDDTCCAfWgAwIBAgIUZ4pTIJYaqvZOsTAN1JeAX366R7AwDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLRlJVVEEtUHJvdG8wHhcNMjUxMDI0MTMxNTMxWhcNMjYx
MDI0MTMxNTMxWjAWMRQwEgYDVQQDDAtGUlVUQS1Qcm90bzCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBALeLHo22smEl4MogBbelJkgBiNy8TdYo2UtrgDSj
yDo4MsSrICCfGuG3mueoQJZ0B3Tm7Lqs+1HRAPhe1AavWix3amA0MhXGaKyXx6xW
CFey5DZlGPDQ88Ik7qYxa5z2Wo9Ocr6+kACKxqLs0a1IBEIEgdegbPemj6ekpqOq
CSIQGq4BXmkM07VL+iPp5FKjt/0qWkbcFusr4N65FsgimR4BmLj+K8y6XjAYAf1O
lG4v0UzPq6KW/J+6OWwBX/TIvALpR0/ElDmgh5a63Je9tZV04Y6bD5NEDydCgDuj
VYwqp29DVsYENE+CCGLb8SPqdIMoq/VzN7gfBIqdeDi2/vcCAwEAAaNTMFEwHQYD
VR0OBBYEFKhzPbCJqMpO0MkM28GhIS6xPo+zMB8GA1UdIwQYMBaAFKhzPbCJqMpO
0MkM28GhIS6xPo+zMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEB
ADRiSs++B/lr2B9bz4w02TPUHCYkNqXI8kIExymRwwUxLkw3MIlMEoYN6Q6AfMEi
XElpjDnC5/f4xEUM8oH2tagsGECQLMdeFKhs+mvydLlfEg1dPDP7/LC8LCuMPpze
idWxoQYLbpIWXaFFqT9QwUwf671tGnY1MJGgiUvhphstL2LbnEhzkOy9zwPNJIuJ
cmvIj09kZYe3Z8g/sPp1E9mAHUdY58ywoUgTwWPbnPo9XWkre+5cGRc6kNoyEQvJ
L80dWUCsD4nJPUdx/u/bL+Y2R40j9t+w3UC9ct8HnPkUKflRAEruUQONruqFIcv1
kFA+ZEKIbP47SeKCWC1GHbo=
-----END CERTIFICATE-----)PEM";

// Device private key PEM (must be unencrypted)
const char* device_priv_key_pem = R"PEM(-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3ix6NtrJhJeDK
IAW3pSZIAYjcvE3WKNlLa4A0o8g6ODLEqyAgnxrht5rnqECWdAd05uy6rPtR0QD4
XtQGr1osd2pgNDIVxmisl8esVghXsuQ2ZRjw0PPCJO6mMWuc9lqPTnK+vpAAisai
7NGtSARCBIHXoGz3po+npKajqgkiEBquAV5pDNO1S/oj6eRSo7f9KlpG3BbrK+De
uRbIIpkeAZi4/ivMul4wGAH9TpRuL9FMz6uilvyfujlsAV/0yLwC6UdPxJQ5oIeW
utyXvbWVdOGOmw+TRA8nQoA7o1WMKqdvQ1bGBDRPgghi2/Ej6nSDKKv1cze4HwSK
nXg4tv73AgMBAAECggEAAchXnR+7nsbr5nqmI5D2jLd7GU244c4Wwi1CmwBGNw6J
q7BPyRFShQOv/PT835kz41ZE0VFRxYsmm8LsAz6bvRfR0CphnCWHqbl1pn5VaWii
38ZeliQpYebS7IlJVsZrvb2QzrpyEpdGc5miNbEf3XZGvo3f0Q3skj++oJNLsGl8
ZUO3uub3znBz703EHTV5JUn2PSMPXz6vCg7IPePxxmZxEL1aZqBQ/iYVFSN1xDmV
GqPAwHw0TcG/gnGjDx8fUogcZDg/Bjid7RVzMmomT1DcwEceyNj7FhNw5Cy5AxpP
HTfYvu7PWv7BvPtov4y8O9r3y0FMYO1IvKIbBAElsQKBgQDwM68YOtJEOeNJndVw
bp4uMCJi30yWu886Dij9yZ3wVFbcv92HhxsxZIuxtLdmOoghtaU3isR4ehxEDAvJ
EBgXoVWafZJyWNFMSGXSNOaqFItXLenOuL/uSb8t9i6G72lHgL/5OEIH7Aid6Je6
LtBHY+JuYZj5dfDzsJoUyDXREQKBgQDDnXfhyJf86uo/moLjtlY84BekHAcmxioP
sQ/gam8TO2b6Pbw8g0WjQcO5XrHDi2Uwzu2QWjPu8lDUhLOgpKrVL7sfHSaSTloh
4v6n5tK7R1QYszHuneDcq22dox93NEFjVuZSLgM2uRj+ywyeVtfmf+wWeXin8kcj
L1fKW7nPhwKBgDe1xQZ5ngr04iJQ2RAal9VelJsZ70mGhamRXzB9coQrC3pnhZnJ
XCU4jK3KnD65lJk85/TZ2neW2rdtk84uTWgtow0R0sVylBh9MiBu5JDN8wNlQrUP
ZHR/5jdiwafKH0DWO7AxvB7aP6VgLNChyuzD3eB8Al7ZW+kpLJNlXBYBAoGBAIVi
iqxaq8i6JqDYKwg6/PLlmzk8I2Q9G9E3WywbZ0Il70ITdpeMq5926I8uEujT1FxD
vZoA6Ai3EobXNeUEY7iao23D4tlAtBUHQ74Zlvg82ws8pX+gCARwoH4tDPermiqy
xrqixW47KOAUdLZDYVS7RbDNg4iBnCBR1/sUMM9hAoGALBHmxB2txNKt5cFGpP3F
/40sXBEGKl7o4pDATSyQ/x2MohILDEURjz5i1VG3wgt8ICqJ4737yMw1P+wBSoih
T/yf50SiRd4oJdT32xpXo8MSB0m0pSAN703bonq71Fqov45S7clhsft2jUwQIU3b
rQtUqsu/BchevrYSFm2hT4c=
-----END PRIVATE KEY-----)PEM";

// optional: if you have the CA in base64, add it here. otherwise the existing azure_root_ca PEM can be used.
// const char* azure_root_ca_base64 = NULL; // or paste base64 string if needed
const char* azure_root_ca_base64 = NULL; // disabled previous Baltimore base64 so direct PEM is used

// MQTT server/port (used for TLS test and PubSubClient)
const char* mqtt_server = "FRUTA-IoTHub2.azure-devices.net";
const uint16_t mqtt_port = 8883;

// Replace azure_root_ca with DigiCert Global Root G2 PEM
const char* azure_root_ca =
"-----BEGIN CERTIFICATE-----\n"
"MIIDjjCCAnagAwIBAgIQAzrx5qcRqaC7KGSxHQn65TANBgkqhkiG9w0BAQsFADBh\n"
"MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3\n"
"d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH\n"
"MjAeFw0xMzA4MDExMjAwMDBaFw0zODAxMTUxMjAwMDBaMGExCzAJBgNVBAYTAlVT\n"
"MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j\n"
"b20xIDAeBgNVBAMTF0RpZ2lDZXJ0IEdsb2JhbCBSb290IEcyMIIBIjANBgkqhkiG\n"
"9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuzfNNNx7a8myaJCtSnX/RrohCgiN9RlUyfuI\n"
"2/Ou8jqJkTx65qsGGmvPrC3oXgkkRLpimn7Wo6h+4FR1IAWsULecYxpsMNzaHxmx\n"
"1x7e/dfgy5SDN67sH0NO3Xss0r0upS/kqbitOtSZpLYl6ZtrAGCSYP9PIUkY92eQ\n"
"q2EGnI/yuum06ZIya7XzV+hdG82MHauVBJVJ8zUtluNJbd134/tJS7SsVQepj5Wz\n"
"tCO7TG1F8PapspUwtP1MVYwnSlcUfIKdzXOS0xZKBgyMUNGPHgm+F6HmIcr9g+UQ\n"
"vIOlCsRnKPZzFBQ9RnbDhxSJITRNrw9FDKZJobq7nMWxM4MphQIDAQABo0IwQDAP\n"
"BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBhjAdBgNVHQ4EFgQUTiJUIBiV\n"
"5uNu5g/6+rkS7QYXjzkwDQYJKoZIhvcNAQELBQADggEBAGBnKJRvDkhj6zHd6mcY\n"
"1Yl9PMWLSn/pvtsrF9+wX3N3KjITOYFnQoQj8kVnNeyIv/iPsGEMNKSuIEyExtv4\n"
"NeF22d+mQrvHRAiGfzZ0JFrabA0UWTW98kndth/Jsw1HKj2ZL7tcu7XUIOGZX1NG\n"
"Fdtom/DzMNU+MeKNhJ7jitralj41E6Vf8PlwUHBHQRFXGU7Aj64GxJUTFy8bJZ91\n"
"8rGOmaFvE7FBcf6IKshPECBV1/MUReXgRPTqh5Uykw7+U0b6LJ3/iyK5S9kJRaTe\n"
"pLiaWN0bfVKfjllDiIGknibVb63dDcY3fe0Dkhvld1927jyNxF1WW6LZZm6zNTfl\n"
"MrY=\n"
"-----END CERTIFICATE-----\n";

// decoded PEM storage (keep alive for WiFiClientSecure)
static String g_device_cert_pem;
static String g_device_key_pem;
static String g_azure_root_ca_pem;

// helper: decode base64 into Arduino String (uses mbedtls)
String decodeBase64ToString(const char* b64) {
  if (!b64 || !b64[0]) return String();
  size_t in_len = strlen(b64);
  // allocate buffer same size as input (decoded <= input)
  unsigned char* out = (unsigned char*)malloc(in_len + 1);
  if (!out) return String();
  size_t out_len = 0;
  int ret = mbedtls_base64_decode(out, in_len, &out_len, (const unsigned char*)b64, in_len);
  if (ret != 0) {
    free(out);
    return String();
  }
  // construct String from decoded bytes
  String s;
  s.reserve(out_len + 1);
  s = String((const char*)out, out_len);
  free(out);
  return s;
}

// compute SHA1 fingerprint (DER) of a PEM certificate
String computeCertSHA1Fingerprint(const String &pem) {
  if (pem.length() == 0) return String();
  mbedtls_x509_crt crt;
  mbedtls_x509_crt_init(&crt);
  int ret = mbedtls_x509_crt_parse(&crt, (const unsigned char*)pem.c_str(), pem.length() + 1);
  if (ret != 0) {
    mbedtls_x509_crt_free(&crt);
    return String();
  }
  unsigned char sha1sum[20];
  ret = mbedtls_sha1(crt.raw.p, crt.raw.len, sha1sum);
  if (ret != 0) {
    mbedtls_x509_crt_free(&crt);
    return String();
  }
  char tmp[4];
  String fp = "";
  for (int i = 0; i < 20; ++i) {
    if (i) fp += ":";
    sprintf(tmp, "%02X", sha1sum[i]);
    fp += tmp;
  }
  mbedtls_x509_crt_free(&crt);
  return fp;
}

// =============================
// Camera GPIO configuration (AI-Thinker)
// =============================
// --- Camera GPIO configuration for ESP32-WROOM-32E + extension module ---
#define PWDN_GPIO_NUM     32   // Power down pin
#define RESET_GPIO_NUM    -1   // Reset pin
#define XCLK_GPIO_NUM      0   // XCLK
#define SIOD_GPIO_NUM     26   // SCCB data
#define SIOC_GPIO_NUM     27   // SCCB clock

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18  // <-- corrected from 19 to 18
#define Y2_GPIO_NUM       5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

#define LED_GPIO_NUM       4

WiFiClientSecure net;
PubSubClient client(net);
unsigned long lastCaptureTime = 0;

// new: guard to prevent concurrent MQTT/telemetry during blocking uploads
static volatile bool isUploading = false;

// make prefs and photoCounter available to functions defined earlier
// (moved here so capture_and_send_image() and callback() can use them)
Preferences prefs;
long photoCounter = 0;
// last captured blob filename (for telemetry) and capture timestamp
String lastImageFilename = "";
unsigned long lastCaptureMs = 0;
// telemetry timer (moved to global so capture can reset it)
unsigned long lastTelemetryMs = 0;

// add globals for deferred publish
static String pendingTopic = "";
static String pendingMessage = "";
static unsigned long pendingPublishAt = 0;

// Add IoT Hub system properties suffix so Hub stores JSON bodies (content type + encoding)
const char* IOTHUB_SYS_PROPS = "/?$.ct=application%2Fjson&$.ce=utf-8";

// =============================
// Camera setup
// =============================
void setup_camera() {
  camera_config_t config;
  // zero init to be safe
  memset(&config, 0, sizeof(config));
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  // Choose conservative settings when PSRAM is not available
  if (psramFound()) {
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_SVGA; // or UXGA if you enabled PSRAM+large partition
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
  } else {
    // No PSRAM: use small frame, single FB in DRAM
    config.xclk_freq_hz = 10000000; // lower XCLK to reduce DMA burden
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_QVGA; // MUCH smaller
    config.jpeg_quality = 15; // lower quality -> smaller buffer
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
  }

  esp_err_t err = esp_camera_init(&config);

  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }

  camera_fb_t * fb = esp_camera_fb_get();
  if(!fb){
    Serial.println("Camera still not found!");
  } else {
    Serial.println("Camera detected!");
    esp_camera_fb_return(fb);
  }

  Serial.println("Camera initialized successfully");
}

// =============================
// WiFi setup
// =============================
void setup_wifi() {
  Serial.printf("Connecting to WiFi: %s\n", ssid);
  WiFi.begin(ssid, password);
  uint8_t retries = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++retries > 40) {
      Serial.println("\nWiFi connection failed, rebooting...");
      ESP.restart();
    }
  }
  Serial.printf("\nWiFi connected! IP address: %s\n", WiFi.localIP().toString().c_str());
}

// =============================
// MQTT callback
// =============================
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("Message arrived [%s]: ", topic);
  for (unsigned int i = 0; i < length; i++) Serial.print((char)payload[i]);
  Serial.println();

  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, payload, length);
  if (!err) {
    if (doc.containsKey("command")) {
      String cmd = doc["command"];
      if (cmd == "capture_image") {
        Serial.println("Command received: capture_image");
        capture_and_send_image();
        return;
      } else if (cmd == "reboot") {
        Serial.println("Command received: reboot");
        ESP.restart();
        return;
      }
    }
    Serial.println("JSON processed but no recognized command.");
    return;
  }

  // fallback for plain-text commands
  String payloadStr = String((char*)payload, length);
  payloadStr.trim();
  if (payloadStr == "capture_image") {
    Serial.println("Plain text capture_image received (fallback)");
    capture_and_send_image();
    return;
  }

  Serial.printf("JSON parse failed: %s\n", err.c_str());
}

// =============================
// Reconnect MQTT
// =============================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    // For X.509 auth use NULL for password (not empty string "")
    if (client.connect(mqtt_client_id, mqtt_username, NULL)) {
      Serial.println("connected");
      Serial.printf("reconnect: client.state=%d net.connected=%d\n", client.state(), net.connected() ? 1 : 0);
      String sub = String("devices/") + device_id + "/messages/devicebound/#";
      client.subscribe(sub.c_str());
      Serial.println("Subscribed to: " + sub);

      // Example — call after reconnect() succeeds to send an immediate test telemetry
      // DynamicJsonDocument d(256);
      // d["test"]="hello";
      // String s;
      // serializeJson(d,s);
      // publish with content-type and encoding system properties so IoT Hub writes JSON body
      // String testTopic = String("devices/") + device_id + "/messages/events" + String(IOTHUB_SYS_PROPS);
      // client.publish(testTopic.c_str(), s.c_str());
      // NOTE: removed automatic test telemetry publish to avoid polluting capture blobs.
      // If you need a health-check message, send it conditionally or via a debug menu.
    } else {
      int rc = client.state();
      Serial.printf("failed, rc=%d. Retrying in 5s...\n", rc);
      delay(5000);
    }
  }
}

// Add this constant (set to a container/blob SAS URL you create in Azure)
const char* BLOB_SAS_URL = "https://frutablob.blob.core.windows.net/fruta-container?sp=racwli&st=2025-10-28T11:52:46Z&se=2026-10-28T20:07:46Z&spr=https&sv=2024-11-04&sr=c&sig=HRhJI8VansI4xw3q2HHiMkXuEIGABlWo4mfGfKw5xeo%3D";
// =============================
// Upload image buffer to Azure Blob (PUT BlockBlob). Returns true on 201 created.
bool uploadImageToBlob(const char* sasUrl, const uint8_t* data, size_t len) {
  if (!sasUrl || !sasUrl[0] || !data || len == 0) return false;
  String url = String(sasUrl);
  int scheme = url.indexOf("://");
  int start = scheme >= 0 ? scheme + 3 : 0;
  int slash = url.indexOf('/', start);
  String host = (slash == -1) ? url.substring(start) : url.substring(start, slash);
  String path = (slash == -1) ? String("/") : url.substring(slash);

  WiFiClientSecure https;
  https.setCACert(azure_root_ca);

  Serial.printf("Uploading to host=%s path=%s len=%u\n", host.c_str(), path.c_str(), (unsigned)len);
  if (!https.connect(host.c_str(), 443)) {
    Serial.println("HTTPS connect to blob failed");
    return false;
  }

  // Build HTTP PUT headers
  String hdr = String("PUT ") + path + " HTTP/1.1\r\n";
  hdr += String("Host: ") + host + "\r\n";
  hdr += "x-ms-blob-type: BlockBlob\r\n";
  hdr += "x-ms-version: 2020-04-08\r\n";
  hdr += "Content-Type: image/jpeg\r\n";
  hdr += "Content-Length: " + String(len) + "\r\n";
  hdr += "Connection: close\r\n\r\n";

  // send headers
  if (https.print(hdr) == 0) {
    Serial.println("Failed to send HTTP headers");
    https.stop();
    return false;
  }

  // send body in chunks with small delay/retry to avoid internal buffer overflow
  const size_t CHUNK = 4096; // safe chunk size
  size_t offset = 0;
  while (offset < len) {
    size_t toSend = (len - offset) > CHUNK ? CHUNK : (len - offset);
    size_t sent = https.write(data + offset, toSend);
    if (sent == 0) {
      // retry a few times if transient
      int retries = 0;
      while (sent == 0 && retries++ < 6) {
        delay(50);
        sent = https.write(data + offset, toSend);
      }
      if (sent == 0) {
        Serial.printf("Failed to send chunk at offset %u (tried %d times)\n", (unsigned)offset, retries);
        https.stop();
        return false;
      }
    }
    offset += sent;
    // small pause to let TLS layer flush
    // allow MQTT stack to run during long blocking upload
    if (client.connected()) client.loop();
    delay(5);
  }

  // Wait for response status line
  String status = https.readStringUntil('\n'); // e.g. HTTP/1.1 201 Created
  Serial.println("Blob upload response: " + status);
  bool ok = status.indexOf("201") != -1;
  // drain rest
  while (https.connected()) {
    while (https.available()) https.read();
    delay(1);
  }
  https.stop();
  return ok;
}

// =============================
// Capture and send image
// =============================
bool capture_and_send_image() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    return false;
  }

  // build uploadUrl (existing logic)
  // If BLOB_SAS_URL is a container-level SAS (has ?), append a generated blob name
  String sas = String(BLOB_SAS_URL);
  String uploadUrl = sas;
  int q = sas.indexOf('?');
  if (q > 0) {
    String base = sas.substring(0, q);    // https://account.blob.core.windows.net/container  (hopefully)
    String query = sas.substring(q);     // ?sv=...
    // ensure base contains a container path (has a slash after host)
    int scheme = base.indexOf("://");
    int afterScheme = scheme >= 0 ? scheme + 3 : 0;
    int firstSlash = base.indexOf('/', afterScheme);
    if (firstSlash == -1) {
      Serial.println("BLOB_SAS_URL appears to be account-level (no container). Provide container or full blob URL.");
      // fallthrough: try using original SAS (likely to fail)
    } else {
      // build a unique blob name
      time_t t = time(nullptr);
      struct tm *ti = gmtime(&t); // use UTC; use localtime(&t) if you prefer local zone
      char fn[96];
      // format: <device>-<seq>-YYYYMMDD-HHMMSS.jpg  (seq zero-padded to 5 digits)
      snprintf(fn, sizeof(fn), "%s-%05ld-%04d%02d%02d-%02d%02d%02d.jpg",
               mqtt_client_id,
               photoCounter,
               ti->tm_year + 1900,
               ti->tm_mon + 1,
               ti->tm_mday,
               ti->tm_hour,
               ti->tm_min,
               ti->tm_sec);
      // increment and persist the photo counter for next photo
      photoCounter++;
      prefs.putLong("photoNum", photoCounter);
      // save filename for telemetry and mark capture time
      lastImageFilename = String(fn);
      lastCaptureMs = millis();
      // reset telemetry timer so telemetry cadence starts after this capture
      lastTelemetryMs = millis();
      if (!base.endsWith("/")) base += "/";
      uploadUrl = base + String(fn) + query;
      Serial.println("Constructed uploadUrl: " + uploadUrl);
    }
  }

  bool uploaded = false;
  if (uploadUrl.length() && uploadUrl[0]) {
    // signal start of upload to other tasks/publishes
    isUploading = true;

    uploaded = uploadImageToBlob(uploadUrl.c_str(), fb->buf, fb->len);

    isUploading = false;
    if (uploaded) Serial.println("✅ Image uploaded to Blob via SAS URL");
    else Serial.println("⚠️ Blob upload failed; will send metadata only");
    // let MQTT/TLS stack settle after blocking HTTPS upload
    unsigned long settleStart = millis();
    while (millis() - settleStart < 3000) { client.loop(); delay(50); }
  } else {
    Serial.println("No BLOB_SAS_URL configured; skipping upload");
  }

  // Build telemetry JSON (include blob URL when uploaded)
  DynamicJsonDocument doc(1024);
  doc["deviceId"] = mqtt_client_id;
  doc["timestamp"] = millis();
  doc["eventType"] = "fruit_detected";
  doc["imageWidth"] = fb->width;
  doc["imageHeight"] = fb->height;
  doc["imageSize"] = fb->len;
  if (uploaded) doc["blobUrl"] = uploadUrl;

  String message;
  serializeJson(doc, message);
  // include system props so IoT Hub stores the JSON directly
  String topic = String("devices/") + device_id + "/messages/events" + String(IOTHUB_SYS_PROPS);

  // enforce daily quota
  if (!allowSendAndIncrement()) {
    Serial.println("❌ Capture suppressed: daily message quota exceeded.");
    esp_camera_fb_return(fb);
    return false;
  }

  // DEFER telemetry: schedule publish 8s after upload rather than trying immediately here
  pendingTopic = topic;
  pendingMessage = message;
  pendingPublishAt = millis() + 8000; // schedule deferred telemetry 8s after upload
  Serial.println("Telemetry deferred for 8s and will be sent from main loop.");
  esp_camera_fb_return(fb);
  return true;
}

// =============================
// Send telemetry
// =============================
void send_telemetry_data() {
  // skip telemetry while uploading to avoid concurrent TLS/socket usage
  if (isUploading) {
    Serial.println("Telemetry skipped: upload in progress.");
    return;
  }

  DynamicJsonDocument doc(512);
  doc["deviceId"] = mqtt_client_id;
  doc["timestamp"] = millis();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["wifiStrength"] = WiFi.RSSI();
  doc["status"] = "active";
  // include last captured filename when available
  if (lastImageFilename.length()) doc["imageFileName"] = lastImageFilename;
  
  String msg;
  serializeJson(doc, msg);
  // enforce daily quota
  if (!allowSendAndIncrement()) {
    Serial.println("❌ Telemetry suppressed: daily message quota exceeded.");
    return;
  }
  // make sure IoT Hub stores body as JSON by adding system properties
  String topic = String("devices/") + device_id + "/messages/events" + String(IOTHUB_SYS_PROPS);
  client.publish(topic.c_str(), msg.c_str());
  Serial.println("📡 Telemetry sent: " + msg);
}

// =============================
// daily quota
const int MAX_MESSAGES_PER_DAY = 8000;
static int msgCountToday = 0;
static long lastDayUtc = -1;
// (photoCounter and prefs were moved to top; do not redefine them here)

// return true and increment counter if under quota; false if limit reached
bool allowSendAndIncrement() {
  time_t now = time(nullptr);
  long day = now / 86400; // days since epoch (UTC)
  if (lastDayUtc != day) {
    // new day -> reset
    msgCountToday = 0;
    lastDayUtc = day;
  }
  if (msgCountToday >= MAX_MESSAGES_PER_DAY) {
    Serial.printf("Daily quota reached (%d). Blocking send.\n", MAX_MESSAGES_PER_DAY);
    return false;
  }
  msgCountToday++;
  prefs.putInt("count", msgCountToday);
  prefs.putLong("day", lastDayUtc);
  Serial.printf("Messages today: %d/%d\n", msgCountToday, MAX_MESSAGES_PER_DAY);
  return true;
}

// =============================
// Setup
// =============================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== FRUTA ESP32 Device Booting ===");

  setup_camera();
  setup_wifi();

  // --- sync time (required for TLS cert validation) ---
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Waiting for NTP time");
  time_t now = time(nullptr);
  int retry = 0;
  while (now < 1600000000 && ++retry <= 20) {
    Serial.print(".");
    delay(500);
    now = time(nullptr);
  }
  Serial.println();
  if (now < 1600000000) {
    Serial.println("Warning: time not set. TLS may fail. Check NTP or use net.setInsecure() for testing.");
  } else {
    Serial.printf("Time is %s", ctime(&now));
  }

  // --- TLS certs / keys ---
  // assign PEM strings (device_cert_pem/device_priv_key_pem are plain PEM, not base64)
  g_device_cert_pem = String(device_cert_pem);
  g_device_key_pem  = String(device_priv_key_pem);
  if (azure_root_ca_base64) g_azure_root_ca_pem = decodeBase64ToString(azure_root_ca_base64);

  // debug: print lengths / preview to confirm decoding
  Serial.printf("DBG: device cert length=%u\n", (unsigned)g_device_cert_pem.length());
  Serial.printf("DBG: device key  length=%u\n", (unsigned)g_device_key_pem.length());
  Serial.printf("DBG: ca (base64) length=%u\n", (unsigned)g_azure_root_ca_pem.length());
  if (g_device_cert_pem.length()) {
    Serial.println("DBG: device cert preview:");
    Serial.println(g_device_cert_pem.substring(0, min((size_t)200, g_device_cert_pem.length())));
    String fp = computeCertSHA1Fingerprint(g_device_cert_pem);
    if (fp.length()) Serial.println(String("DBG: device cert SHA1 fingerprint: ") + fp);
    else Serial.println("DBG: failed to compute cert fingerprint");
  }
  if (g_device_key_pem.length()) {
    Serial.println("DBG: device key preview:");
    Serial.println(g_device_key_pem.substring(0, min((size_t)200, g_device_key_pem.length())));
  }
  if (g_azure_root_ca_pem.length()) {
    Serial.println("DBG: decoded CA preview:");
    Serial.println(g_azure_root_ca_pem.substring(0, min((size_t)200, g_azure_root_ca_pem.length())));
  }

  // Prefer direct PEM in azure_root_ca if provided, otherwise use decoded base64
  if (azure_root_ca && azure_root_ca[0]) {
    net.setCACert(azure_root_ca);
  } else if (g_azure_root_ca_pem.length()) {
    net.setCACert(g_azure_root_ca_pem.c_str());
  } else {
    Serial.println("No azure_root_ca provided. Proceeding without setting CA (TLS may fail).");
  }
  
  if (g_device_cert_pem.length()) {
    net.setCertificate(g_device_cert_pem.c_str());
  } else {
    Serial.println("Warning: device cert not decoded. device_cert PEM empty.");
  }

  if (g_device_key_pem.length()) {
    net.setPrivateKey(g_device_key_pem.c_str());
  } else {
    Serial.println("Warning: device key not decoded. device_key PEM empty.");
  }

  // Quick TLS connectivity test (diagnostic)
  Serial.print("Testing raw TLS connection to ");
  Serial.print(mqtt_server);
  Serial.print(":");
  Serial.println(mqtt_port);
  bool ok = net.connect(mqtt_server, mqtt_port);
  if (!ok) {
    Serial.println("Raw TLS connect FAILED (net.connect returned false).");
    Serial.printf("net.connected() = %d\n", net.connected() ? 1 : 0);
    // Uncomment to bypass cert verification for debugging ONLY:
    // net.setInsecure();
    // if (net.connect(mqtt_server, mqtt_port)) Serial.println("Raw TLS connect succeeded with setInsecure()");
  } else {
    Serial.println("Raw TLS connect succeeded. Closing test socket.");
    net.stop();
  }

  // try with certificate verification disabled to check if CA/client cert is the issue
  if (!ok) {
    Serial.println("Trying with setInsecure() to bypass cert verification (testing only)...");
    net.setInsecure(); // WARNING: disables cert verification — for debug only
    if (net.connect(mqtt_server, mqtt_port)) {
      Serial.println("Raw TLS connect succeeded with setInsecure() --> CA/Client cert problem");
      net.stop();
      ok = true;
    } else {
      Serial.println("Raw TLS connect FAILED even with setInsecure() --> network/firewall/port blocked");
    }
    // restore certs for normal operation (if you plan to use secure mode)
    if (g_azure_root_ca_pem.length()) net.setCACert(g_azure_root_ca_pem.c_str());
    if (g_device_cert_pem.length()) net.setCertificate(g_device_cert_pem.c_str());
    if (g_device_key_pem.length()) net.setPrivateKey(g_device_key_pem.c_str());
  }

  if (!ok) {
    Serial.println("TLS diagnostics indicate either network/port is blocked or certs are invalid.");
  } else {
    Serial.println("TLS diagnostics: at least one connection method succeeded or was tested.");
  }

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  Serial.println("MQTT client configured");

  // Check cert and key validity with mbedTLS (diagnostic)
  checkCertAndKey(g_device_cert_pem, g_device_key_pem);

  // restore persisted daily counters
  prefs.begin("fruta.q", false);
  lastDayUtc = prefs.getLong("day", -1);
  msgCountToday = prefs.getInt("count", 0);
  // restore persistent photo counter
  photoCounter = prefs.getLong("photoNum", 0);
  // normalize if time not set yet
  now = time(nullptr);
  if (now >= 86400 && lastDayUtc == -1) {
    lastDayUtc = now / 86400;
    prefs.putLong("day", lastDayUtc);
    prefs.putInt("count", msgCountToday);
  }
  Serial.printf("Quota state: day=%ld count=%d\n", lastDayUtc, msgCountToday);
}

// =============================
// background NTP sync state
// =============================
static bool timeSynced = false;
static unsigned long lastNtpAttemptMs = 0;
static const unsigned long ntpRetryIntervalMs = 10000; // try every 10s
static int ntpRetries = 0;
static const int ntpMaxRetries = 30;

// non-blocking background NTP check (call from loop)
void checkTimeBackground() {
  if (timeSynced) return;
  time_t now = time(nullptr);
  if (now >= 1600000000) {
    timeSynced = true;
    Serial.println("Background NTP: time already set.");
    return;
  }
  unsigned long m = millis();
  if (m - lastNtpAttemptMs < ntpRetryIntervalMs) return;
  lastNtpAttemptMs = m;
  ntpRetries++;
  Serial.printf("Background NTP attempt %d\n", ntpRetries);
  // re-trigger NTP servers (no long blocking) and poll briefly
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  // short poll (max ~1s) to avoid long blocking in loop
  int poll = 0;
  now = time(nullptr);
  while (now < 1600000000 && poll++ < 10) {
    delay(100);
    now = time(nullptr);
  }
  if (now >= 1600000000) {
    timeSynced = true;
    Serial.printf("Background NTP succeeded: %s", ctime(&now));
  } else {
    Serial.println("Background NTP attempt failed");
    if (ntpRetries >= ntpMaxRetries) {
      Serial.println("Background NTP: max retries reached, proceeding without time");
      timeSynced = true; // give up to avoid infinite block; remove if you want strict requirement
    }
  }
}

// =============================
// Loop
// =============================
void loop() {
  // keep trying to obtain time in background until synced/give-up
  checkTimeBackground();

  // do not attempt MQTT connect until time is synced (prevents TLS failures)
  if (!client.connected()) {
    if (timeSynced) {
      reconnect();
    } else {
      // still allow client.loop() to run network housekeeping
      client.loop();
      delay(10);
      return;
    }
  }

  client.loop();

  // handle deferred publish scheduled by capture_and_send_image()
  if (pendingPublishAt != 0 && millis() >= pendingPublishAt) {
    Serial.println("Attempting deferred telemetry publish...");

    // give the MQTT client some time to settle and process incoming packets
    unsigned long settleStart = millis();
    while (millis() - settleStart < 2000) { client.loop(); delay(50); }

    if (!client.connected()) {
      Serial.println("Client not connected for deferred publish — forcing reconnect and scheduling retry");
      client.disconnect();
      net.stop();
      reconnect();
      pendingPublishAt = millis() + 3000; // back off longer
      // keep pendingTopic/message for retry
      return; // exit loop() iteration; retry will be attempted on next loop() call
    }

    // attempt publish once, with clearer recovery if it fails
    bool ok = client.publish(pendingTopic.c_str(), pendingMessage.c_str());
    Serial.printf("Deferred publish returned=%d client.state=%d\n", ok ? 1 : 0, client.state());
    if (ok) {
      Serial.println("Deferred telemetry sent: " + pendingMessage);
      pendingTopic = "";
      pendingMessage = "";
      pendingPublishAt = 0;
    } else {
      Serial.println("Deferred publish FAILED — forcing reconnect and retry in 3s");
      // force a clean teardown to clear any stale TLS/socket state
      client.disconnect();
      net.stop();
      reconnect();
      pendingPublishAt = millis() + 3000;
    }
  }

  // telemetry every 6s, but only after at least one picture taken
  const unsigned long TELEMETRY_INTERVAL_MS = 6000UL;
  if (lastImageFilename.length() && (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS)) {
    if (client.connected()) send_telemetry_data();
    lastTelemetryMs = millis();
  }

  // take a picture every 15 seconds (15000 ms)
  static unsigned long lastAutoCaptureMs = 0;
  const unsigned long CAPTURE_INTERVAL_MS = 15000UL; // 15 seconds
  if (millis() - lastAutoCaptureMs >= CAPTURE_INTERVAL_MS) {
    // update timestamp before blocking capture to avoid drift
    lastAutoCaptureMs = millis();
    // require time synced so TLS uploads and MQTT work reliably
    if (timeSynced) {
      Serial.println("Auto-capture: taking picture...");
      capture_and_send_image();
    } else {
      Serial.println("Auto-capture skipped: time not synced yet.");
    }
  }

  delay(10);
}

// Add these helper diagnostics (place after decodeBase64ToString and computeCertSHA1Fingerprint functions)
void printMbedTlsError(int ret) {
  char errbuf[200];
  mbedtls_strerror(ret, errbuf, sizeof(errbuf));
  Serial.printf("mbedtls error ret=%d : %s\n", ret, errbuf);
}

void checkCertAndKey(const String &cert, const String &key) {
  Serial.println("Checking device cert/key with mbedTLS...");
  mbedtls_x509_crt crt; mbedtls_x509_crt_init(&crt);
  int ret = mbedtls_x509_crt_parse(&crt, (const unsigned char*)cert.c_str(), cert.length() + 1);
  if (ret != 0) {
    Serial.printf("Cert parse FAILED ret=%d\n", ret);
    printMbedTlsError(ret);
  } else {
    Serial.println("Cert parse OK");
  }
  mbedtls_x509_crt_free(&crt);

  mbedtls_pk_context pk; mbedtls_pk_init(&pk);
  // mbedtls_pk_parse_key signature on this platform requires RNG callback and RNG context params.
  ret = mbedtls_pk_parse_key(&pk,
                             (const unsigned char*)key.c_str(),
                             key.length() + 1,
                             NULL, 0,
                             NULL, NULL);
  if (ret != 0) {
    Serial.printf("Key parse FAILED ret=%d\n", ret);
    printMbedTlsError(ret);
  } else {
    Serial.println("Key parse OK");
  }
  mbedtls_pk_free(&pk);
}

// Forward declarations (definitions remain later in the file)
// allow functions that appear earlier to use these vars
// externs removed — prefs and photoCounter are defined above
