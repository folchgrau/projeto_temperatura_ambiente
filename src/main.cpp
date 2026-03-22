//bibliotecas necessárias

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "time.h"
#include <IRremote.hpp>

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
const int PINO_ONEWIRE = 4;
const int IR_SEND_PIN = 18; // Pino de saída para o LED IR no ESP32
const int saida_ar= 15; 

bool saida=false;
bool liga = false;
bool automatico = false;
float setpoint=26;
float var_min=1;
float var_max=1;
int i=0;
bool estado_ar = false;

const uint16_t ADDR_AR = 0x88; //Endereço do AC
const uint16_t CMD_LIGA      = 0x75; // Comando de Power
const uint16_t CMD_SET_22    = 0x875; // Comando de Temperatura set em 22
const uint16_t CMD_DESLIGA   = 0xC005; // comando desliga AC

// configuração dos sensores de temperatura
OneWire oneWire(PINO_ONEWIRE);
DallasTemperature sensors(&oneWire);

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long tempoAnterior = 0;
unsigned long tempoAnterior1 = 0;
float t1 = 0;
float media = 0;

// Função para formatar a hora em String legível
String getHoraFormatada() {
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)){
    return String("Erro ao obter hora");
  }
  char timeStringBuff[20]; 
  // Formato: Dia/Mês/Ano Hora:Minuto:Segundo
  strftime(timeStringBuff, sizeof(timeStringBuff), "%d/%m/%Y %H:%M:%S", &timeinfo);
  return String(timeStringBuff);
}

void enviarComandoIR(uint16_t comando) {
    IrSender.sendLG(ADDR_AR, comando, 0);     // Endereço , Comando , 0 repetições
}

void setup() {
    Serial.begin(115200);
    sensors.begin();
    pinMode(saida_ar, OUTPUT);
    IrSender.begin(IR_SEND_PIN);
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
    struct tm timeinfo;
    while (!getLocalTime(&timeinfo)) {
        delay(500);
    }
}

void loop() {
    if (Firebase.ready() && (millis() - tempoAnterior > 2500 || tempoAnterior == 0)) {
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
            json.get(jsonData, "liga");
            if (jsonData.success) liga = jsonData.boolValue;
            json.get(jsonData, "automatico");
            if (jsonData.success) automatico = jsonData.boolValue;
        }
        sensors.requestTemperatures();   
        t1 = sensors.getTempCByIndex(0);
        if (t1 == DEVICE_DISCONNECTED_C) {}
        else{
            if (automatico==true){
                if(t1 >=(setpoint+var_max)){
                    if(estado_ar==false){
                        digitalWrite(saida_ar,HIGH);
                        enviarComandoIR(0x75);
                        delay(500);
                        enviarComandoIR(0x875);
                        estado_ar=true;
                    }
                }
                else{
                    if(t1<=(setpoint-var_min)){
                        if(estado_ar==true){
                            digitalWrite(saida_ar,LOW);
                            enviarComandoIR(0xC005);
                            estado_ar=false;
                        }
                    }
                }
            }
            else{
                if(liga==true){
                    if(estado_ar==false){
                        digitalWrite(saida_ar,HIGH);
                        enviarComandoIR(0x75);
                        delay(500);
                        enviarComandoIR(0x875);
                        estado_ar=true;
                    }
                }
                else{
                        if(estado_ar==true){
                            digitalWrite(saida_ar,LOW);
                            enviarComandoIR(0xC005);
                            estado_ar=false;
                        }
                }   
            }
            media+=t1;
            i+=1;
        }
        if(i==12){
            media=media/12.0;
            saida=digitalRead(saida_ar);
            if (t1 != DEVICE_DISCONNECTED_C) {
                FirebaseJson json;
                json.add("temp_media", media);
                json.add("hora_leitura", getHoraFormatada()); // Ex: "02/03/2026 14:30:00"
                json.add("saida",saida);
                json.set("timestamp/.sv", "timestamp");      // Mantém o Unix para a Web
                Firebase.RTDB.pushJSON(&fbdo, "/dados", &json);
            }
            media=0;
            i=0;
        }

    }

}