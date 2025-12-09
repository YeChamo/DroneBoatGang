/* bluetooth.c - Bluetooth communication handler for remote control bridge */
#include "bluetooth.h"
#include "lora.h"
#include "gps.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#define BT_BUF 128

/* Bluetooth receive state */
static uint8_t  bt_rx_byte;
static char     bt_line[BT_BUF];
static volatile size_t  bt_len = 0;
static volatile uint8_t bt_ready = 0;

/* Connection state tracking */
static uint8_t  bt_was_connected = 0;
static uint32_t bt_last_conn_check = 0;

/**
  * @brief Check if Bluetooth is currently connected
  * @retval 1 if connected, 0 otherwise
  */
static uint8_t bt_connected(void) {
#if BT_IGNORE_STATE
  return 1;
#else
  return HAL_GPIO_ReadPin(BT_STATE_PORT, BT_STATE_PIN) == GPIO_PIN_SET;
#endif
}

/**
  * @brief Send a line of text over Bluetooth
  * @param s: String to send (null-terminated)
  */
void bt_send_line(const char* s) {
#if !BT_IGNORE_STATE
  if(!bt_connected()) return;
#endif
  HAL_UART_Transmit(&huart1, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart1, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

/**
  * @brief Send GPS coordinates over Bluetooth
  * @param lat: Latitude in decimal degrees
  * @param lon: Longitude in decimal degrees
  */
void bt_send_gps(float lat, float lon) {
#if !BT_IGNORE_STATE
  if(!bt_connected()) return;
#endif
  char msg[128];
  int n = snprintf(msg, sizeof(msg), "GPS,%.6f,%.6f", lat, lon);
  if(n > 0) {
    HAL_UART_Transmit(&huart1, (uint8_t*)msg, (size_t)n, HAL_MAX_DELAY);
    HAL_UART_Transmit(&huart1, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
  }
}

/**
  * @brief Check Bluetooth connection state and send updates
  * Sends connection notification and current GPS position on connect
  */
void bt_check_state(void) {
  uint32_t now = HAL_GetTick();
  
  /* Check connection state every 500ms */
  if(now - bt_last_conn_check < 500) return;
  bt_last_conn_check = now;

  uint8_t c = bt_connected();
  
  /* Send notification on connection state change */
  if(c != bt_was_connected) {
    if(c) {
      HAL_Delay(100);
      bt_send_line("SYSTEM,CONNECTED");
      
      /* Send current GPS position if available and recent */
      if(received_gps.valid && (HAL_GetTick() - received_gps.last_update_ms) < 10000) {
        bt_send_gps(received_gps.latitude, received_gps.longitude);
      }
    }
    bt_was_connected = c;
  }
}

/**
  * @brief Handle a complete line received from Bluetooth
  * Parses commands and forwards to LoRa or responds directly
  * @param s: Command string to process
  */
static void handle_bt_line(char* s) {
  /* Strip line endings */
  for(char* p = s; *p; p++) { 
    if(*p == '\r' || *p == '\n') *p = 0; 
  }
  if(!*s) return;

  /* Handle diagnostic commands */
  if(strcmp(s, "PING") == 0) { 
    bt_send_line("PONG"); 
    return; 
  }

  if(strcmp(s, "STATUS") == 0) {
    if(received_gps.valid) {
      uint32_t age = HAL_GetTick() - received_gps.last_update_ms;
      if(age < 10000) {
        bt_send_gps(received_gps.latitude, received_gps.longitude);
      } else {
        bt_send_line("STATUS,GPS_STALE");
      }
    } else {
      bt_send_line("STATUS,NO_GPS");
    }
    return;
  }

  /* Forward control commands to LoRa */
  if(strncmp(s, "THRUST,", 7) == 0) {
    lora_send_payload(s);
    return;
  }

  if(strncmp(s, "RUDDER,", 7) == 0) {
    lora_send_payload(s);
    return;
  }

  if(strncmp(s, "GPS,", 4) == 0) {
    lora_send_payload(s);
    return;
  }

  if(strncmp(s, "CMD,", 4) == 0) {
    lora_send_payload(s);
    return;
  }

  /* Wrap unknown commands and forward */
  char payload[96];
  int n = snprintf(payload, sizeof(payload), "CMD,%s", s);
  if(n > 0) {
    lora_send_payload(payload);
  }
}

/**
  * @brief Process complete line from Bluetooth receive buffer
  */
void bt_process_line(void) {
  if(bt_ready) {
    char buf[BT_BUF];
    strncpy(buf, bt_line, BT_BUF - 1);
    buf[BT_BUF - 1] = 0;
    handle_bt_line(buf);
    bt_len = 0;
    bt_ready = 0;
  }
}

/**
  * @brief Start Bluetooth UART receive interrupt
  */
void StartBTRxIT(void) {
  HAL_UART_Receive_IT(&huart1, &bt_rx_byte, 1);
}

/**
  * @brief UART receive callback for Bluetooth
  * Accumulates characters until line ending is received
  */
void bt_rx_callback(void) {
  char c = (char)bt_rx_byte;
  
  if(c == '\n' || c == '\r') {
    if(bt_len > 0) {
      bt_line[bt_len] = 0;
      bt_ready = 1;
    }
  }
  else if(!bt_ready && bt_len < BT_BUF - 1) {
    bt_line[bt_len++] = c;
  }
  else if(bt_len >= BT_BUF - 1) {
    /* Buffer overflow - reset */
    bt_len = 0;
  }
  
  StartBTRxIT();
}

/**
  * @brief Initialize Bluetooth module
  */
void bt_init(void) {
  bt_was_connected = bt_connected();
}


