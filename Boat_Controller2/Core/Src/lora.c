/* lora.c - LoRa radio communication handler using AT commands */
#include "lora.h"
#include "bluetooth.h"
#include "gps.h"
#include <string.h>
#include <stdio.h>

#define LBUF 128

/* LoRa receive state */
static uint8_t lora_rx;
static char lora_line[128];
static uint8_t lora_pos = 0;

/**
  * @brief Send AT command to LoRa module
  * @param s: Command string to send
  */
static void lora_tx_line(const char* s) {
  HAL_UART_Transmit(&huart4, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart4, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

/**
  * @brief Check if LoRa response indicates success
  * @param s: Response string to check
  * @retval 1 if response indicates OK, 0 otherwise
  */
static int lora_line_ok(const char* s) {
  return s && (strstr(s, "OK") || strstr(s, "+OK") || strstr(s, "OK+SEND") ||
               strstr(s, "OK+SENT") || strstr(s, "SEND OK") || strstr(s, "SENT"));
}

/**
  * @brief Check if LoRa response indicates error
  * @param s: Response string to check
  * @retval 1 if response indicates error, 0 otherwise
  */
static int lora_line_err(const char* s) {
  return s && (strstr(s, "ERROR") || strstr(s, "ERR"));
}

/**
  * @brief Send AT command and wait for OK response
  * @param cmd: AT command string
  * @param to_ms: Timeout in milliseconds
  * @retval 1 if OK received, -1 if error, 0 if timeout
  */
static int lora_cmd_expect_ok(const char* cmd, uint32_t to_ms) {
    lora_tx_line(cmd);

    uint32_t t0 = HAL_GetTick();

    while(HAL_GetTick() - t0 < to_ms) {
        lora_line[sizeof(lora_line)] = 0;

        if(lora_line_ok(lora_line)) {
            return 1;
        }

        if(lora_line_err(lora_line)) {
            return -1;
        }
    }

    return 0; /* Timeout */
}

/**
  * @brief Send payload over LoRa network
  * @param payload: String payload to transmit
  */
void lora_send_payload(const char* payload) {
  char cmd[128];
  int n = snprintf(cmd, sizeof(cmd), "AT+SEND=1,%u,%s", (unsigned)strlen(payload), payload);
  if(n > 0) {
    lora_tx_line(cmd);
  }
}

/**
  * @brief Parse received LoRa message and handle accordingly
  * @param s: Received line from LoRa module
  */
static void parse_lora_line(char* s) {
  /* Look for +RCV= prefix (received message) */
  if(strncmp(s, "+RCV=", 5) != 0) return;
  
  /* Extract data field after second comma in +RCV=address,length,data */
  char* data = NULL; 
  int commas = 0;
  for(char* p = s + 5; *p; p++) {
    if(*p == ',') { 
      commas++; 
      if(commas == 2) { 
        data = p + 1; 
        break; 
      } 
    }
  }
  
  if(!data) return;

  /* Forward all received data to Bluetooth for monitoring */
  bt_send_line(data);
  
  /* Parse and update GPS data if received */
  if(strncmp(data, "GPS,", 4) == 0) {
    float lat, lon;
    if(sscanf(data, "GPS,%f,%f", &lat, &lon) == 2) {
      received_gps.latitude = lat;
      received_gps.longitude = lon;
      received_gps.valid = 1;
      received_gps.last_update_ms = HAL_GetTick();
      bt_send_gps(lat, lon);  /* Send to app for map display */
    }
    return;
  }

  /* Other message types (THRUST, RUDDER, ACK, CMD, etc.) are only forwarded
   * to Bluetooth for monitoring - they stay within the LoRa network */
}

/**
  * @brief Initialize LoRa module with network parameters
  * Sets address, network ID, frequency band, and RF parameters
  */
void lora_init(void) {
  HAL_Delay(200);
  lora_cmd_expect_ok("AT+ADDRESS=2", 500);
  HAL_Delay(200);
  lora_cmd_expect_ok("AT+NETWORKID=18", 500);
  HAL_Delay(200);
  lora_cmd_expect_ok("AT+BAND=915000000", 500);
  HAL_Delay(200);
  lora_cmd_expect_ok("AT+PARAMETER=9,7,1,12", 500);
  HAL_Delay(200);
}

/**
  * @brief Start LoRa UART receive interrupt
  */
void StartLoRaRxIT(void) {
  HAL_UART_Receive_IT(&huart4, &lora_rx, 1);
}

/**
  * @brief UART receive callback for LoRa module
  * Accumulates response lines and parses complete messages
  */
void lora_rx_callback(void) {
  char c = (char)lora_rx;

  if(c == '\n' || c == '\r') {
    if(lora_pos > 0) {
      lora_line[lora_pos] = 0;
      parse_lora_line(lora_line);
      lora_pos = 0;
    }
  }
  else {
    if(lora_pos < sizeof(lora_line) - 1) {
      lora_line[lora_pos++] = c;
    }
    else {
      /* Buffer overflow - reset */
      lora_pos = 0;
    }
  }
  
  StartLoRaRxIT();
}
