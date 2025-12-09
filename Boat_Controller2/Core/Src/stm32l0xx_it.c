/* stm32l0xx_it.c - Interrupt Service Routines
 * 
 * This file contains:
 * - Cortex-M0+ core exception handlers
 * - Peripheral interrupt handlers for UART communication
 */

#include "main.h"
#include "stm32l0xx_it.h"

/* External UART handles */
extern UART_HandleTypeDef huart4;  /* LoRa */
extern UART_HandleTypeDef huart2;  /* GPS */
extern UART_HandleTypeDef huart1;  /* Bluetooth */

/******************************************************************************/
/*           Cortex-M0+ Processor Exception Handlers                          */
/******************************************************************************/

/**
  * @brief Non Maskable Interrupt Handler
  */
void NMI_Handler(void) {
  while(1) {
  }
}

/**
  * @brief Hard Fault Interrupt Handler
  */
void HardFault_Handler(void) {
  while(1) {
    /* Stay here for debugging */
  }
}

/**
  * @brief System Service Call via SWI instruction Handler
  */
void SVC_Handler(void) {
}

/**
  * @brief Pendable Request for System Service Handler
  */
void PendSV_Handler(void) {
}

/**
  * @brief System Tick Timer Handler
  */
void SysTick_Handler(void) {
  HAL_IncTick();
}

/******************************************************************************/
/*           STM32L0xx Peripheral Interrupt Handlers                          */
/******************************************************************************/

/**
  * @brief USART4/USART5 Interrupt Handler
  * Handles LoRa module UART interrupts
  */
void USART4_5_IRQHandler(void) {
  HAL_UART_IRQHandler(&huart4);
}

/**
  * @brief USART2 Interrupt Handler
  * Handles GPS module UART interrupts
  */
void USART2_IRQHandler(void) {
  HAL_UART_IRQHandler(&huart2);
}

/**
  * @brief USART1 Interrupt Handler
  * Handles Bluetooth module UART interrupts
  */
void USART1_IRQHandler(void) {
  HAL_UART_IRQHandler(&huart1);
}