/* bluetooth.h - Bluetooth communication interface */
#ifndef __BLUETOOTH_H
#define __BLUETOOTH_H

#include "main.h"

/**
  * @brief Start Bluetooth UART receive interrupt
  */
void StartBTRxIT(void);

/**
  * @brief Send a line of text over Bluetooth
  * @param s: Null-terminated string to send
  */
void bt_send_line(const char* s);

/**
  * @brief Send GPS coordinates over Bluetooth
  * @param lat: Latitude in decimal degrees
  * @param lon: Longitude in decimal degrees
  */
void bt_send_gps(float lat, float lon);

/**
  * @brief Check Bluetooth connection state and send notifications
  */
void bt_check_state(void);

/**
  * @brief Process received Bluetooth command line
  */
void bt_process_line(void);

/**
  * @brief UART receive callback for Bluetooth
  */
void bt_rx_callback(void);

/**
  * @brief Initialize Bluetooth module
  */
void bt_init(void);

#endif /* __BLUETOOTH_H */
