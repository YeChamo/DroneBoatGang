/* lora.h - LoRa radio communication interface */
#ifndef __LORA_H
#define __LORA_H

#include "main.h"

/**
  * @brief Start LoRa UART receive interrupt
  */
void StartLoRaRxIT(void);

/**
  * @brief Initialize LoRa module with network parameters
  * Configures address, network ID, frequency band, and RF parameters
  */
void lora_init(void);

/**
  * @brief Send payload over LoRa network
  * @param payload: Null-terminated string to transmit
  */
void lora_send_payload(const char* payload);

/**
  * @brief Process received LoRa message line
  */
void lora_process_line(void);

/**
  * @brief UART receive callback for LoRa module
  */
void lora_rx_callback(void);

#endif /* __LORA_H */


