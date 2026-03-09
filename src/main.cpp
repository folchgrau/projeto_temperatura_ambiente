//bibliotecas necessárias

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "time.h"

#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// configuração da rede e API do Firebase
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define API_KEY ""
#define DATABASE_URL ""
#define USER_EMAIL ""
#define USER_PASSWORD ""

// Servidor NTP para pegar a hora certa
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -10800; // Ajuste para o Brasil (GMT-3 = -3 * 3600)
const int   daylightOffset_sec = 0;

//variáveis auxiliares

const int PINO_ONEWIRE = 4;
bool saida=false;
float setpoint=26;
float var_min=1;
float var_max=1;
const int saida_ar= 15; 

// configuração dos sensores de temperatura
OneWire oneWire(PINO_ONEWIRE);
DallasTemperature sensors(&oneWire);
DeviceAddress endereco1 = { 0x28, 0x98, 0x93, 0x49, 0xF6, 0x02, 0x3C, 0x54 };
DeviceAddress endereco2 = { 0x28, 0x4C, 0x15, 0x79, 0xA2, 0x00, 0x03, 0xD8 };

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long tempoAnterior = 0;

// Função para formatar a hora em String legível
String getHoraFormatada() {
  struct tm timeinfo;
  char timeStringBuff[20]; 
  // Formato: Dia/Mês/Ano Hora:Minuto:Segundo
  strftime(timeStringBuff, sizeof(timeStringBuff), "%d/%m/%Y %H:%M:%S", &timeinfo);
  return String(timeStringBuff);
}

void setup() {
    Serial.begin(115200);
    sensors.begin();
    pinMode(saida_ar, OUTPUT);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }

    // Inicializa o tempo via NTP
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

    config.api_key = API_KEY;
    config.database_url = DATABASE_URL;
    auth.user.email = USER_EMAIL;
    auth.user.password = USER_PASSWORD;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
}

void loop() {
    if (Firebase.ready() && (millis() - tempoAnterior > 30000 || tempoAnterior == 0)) {
        tempoAnterior = millis();
        if (Firebase.RTDB.getJSON(&fbdo, "/setup")) {
            FirebaseJson &json = fbdo.jsonObject();
            FirebaseJsonData jsonData;
            json.get(jsonData, "setpoint");
            if (jsonData.success) setpoint = jsonData.floatValue;
            json.get(jsonData, "var_min");
            if (jsonData.success) var_min = jsonData.floatValue;
            json.get(jsonData, "var_max");
            if (jsonData.success) var_max = jsonData.floatValue;
    }
        sensors.requestTemperatures();   
        float t1 = sensors.getTempC(endereco1);
        float t2 = sensors.getTempC(endereco2);
        float media = (t1+t2)/2;
        if((media >= (setpoint-var_min))&&(media <= (setpoint+var_max))){
            digitalWrite(saida_ar,HIGH);
            saida=true;
        }
        else{
            digitalWrite(saida_ar,LOW);
            saida=false;
        }
        if (t1 != DEVICE_DISCONNECTED_C && t2 != DEVICE_DISCONNECTED_C) {
            FirebaseJson json;
            json.add("temp_media", media);
            json.add("hora_leitura", getHoraFormatada()); // Ex: "02/03/2026 14:30:00"
            json.add("saida",saida);
            json.set("timestamp/.sv", "timestamp");      // Mantém o Unix para a Web
            Firebase.RTDB.pushJSON(&fbdo, "/dados", &json);
        }
    }
}