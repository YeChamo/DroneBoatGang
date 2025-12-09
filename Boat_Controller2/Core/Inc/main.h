/* main.h - Main header with global definitions and peripheral handles */
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

#include "stm32l0xx_hal.h"

/**
  * @brief Error handler function
  * Called when a peripheral or system error occurs
  */
void Error_Handler(void);

/* Bluetooth state pin configuration */
#define BT_STATE_PORT GPIOA
#define BT_STATE_PIN  GPIO_PIN_8
#define BT_IGNORE_STATE 1  /* Set to 1 to ignore connection state checking */

/* Global UART peripheral handles */
extern UART_HandleTypeDef huart1;  /* Bluetooth module (9600 baud) */
extern UART_HandleTypeDef huart2;  /* GPS module (9600 baud) */
extern UART_HandleTypeDef huart4;  /* LoRa module (115200 baud) */

/* Global ADC peripheral handle */
extern ADC_HandleTypeDef hadc;     /* ADC for joystick analog inputs */

#ifdef __cplusplus
}
#endif
#endif /* __MAIN_H */
