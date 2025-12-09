/* stm32l0xx_hal_msp.c - Hardware Abstraction Layer MSP (MCU Support Package)
 * 
 * This file provides low-level hardware initialization for peripherals:
 * - Clock configuration
 * - GPIO pin mapping
 * - Interrupt priority setup
 */

#include "main.h"

/**
  * @brief Initialize the Global MSP
  * Called by HAL_Init() to configure system-level resources
  */
void HAL_MspInit(void) {
  __HAL_RCC_SYSCFG_CLK_ENABLE();
  __HAL_RCC_PWR_CLK_ENABLE();
}

/**
  * @brief ADC MSP Initialization
  * Configures GPIO pins and clocks for ADC peripheral
  * @param hadc: ADC handle pointer
  * 
  * Pin mapping:
  * - PA6: ADC_IN6 (joystick channel)
  * - PA7: ADC_IN7 (joystick channel)
  * - PB0: ADC_IN8 (joystick channel)
  * - PB1: ADC_IN9 (joystick channel)
  */
void HAL_ADC_MspInit(ADC_HandleTypeDef* hadc) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  
  if(hadc->Instance == ADC1) {
    /* Enable peripheral clock */
    __HAL_RCC_ADC1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();

    /* Configure ADC GPIO pins as analog inputs */
    GPIO_InitStruct.Pin = GPIO_PIN_6 | GPIO_PIN_7;
    GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = GPIO_PIN_0 | GPIO_PIN_1;
    GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
  }
}

/**
  * @brief ADC MSP De-Initialization
  * Releases hardware resources used by ADC
  * @param hadc: ADC handle pointer
  */
void HAL_ADC_MspDeInit(ADC_HandleTypeDef* hadc) {
  if(hadc->Instance == ADC1) {
    /* Disable peripheral clock */
    __HAL_RCC_ADC1_CLK_DISABLE();

    /* Deconfigure GPIO pins */
    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_6 | GPIO_PIN_7);
    HAL_GPIO_DeInit(GPIOB, GPIO_PIN_0 | GPIO_PIN_1);
  }
}

/**
  * @brief UART MSP Initialization
  * Configures GPIO pins, clocks, and interrupts for UART peripherals
  * @param huart: UART handle pointer
  */
void HAL_UART_MspInit(UART_HandleTypeDef* huart) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  
  if(huart->Instance == USART1) {
    /* USART1 - Bluetooth Module
     * PA9:  TX
     * PA10: RX */
    __HAL_RCC_USART1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    GPIO_InitStruct.Pin = GPIO_PIN_9 | GPIO_PIN_10;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF4_USART1;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* Enable USART1 interrupt */
    HAL_NVIC_SetPriority(USART1_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART1_IRQn);
  }
  else if(huart->Instance == USART2) {
    /* USART2 - GPS Module
     * PA2: TX
     * PA3: RX */
    __HAL_RCC_USART2_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    GPIO_InitStruct.Pin = GPIO_PIN_2 | GPIO_PIN_3;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF4_USART2;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* Enable USART2 interrupt */
    HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART2_IRQn);
  }
  else if(huart->Instance == USART4) {
    /* USART4 - LoRa Module
     * PA0: TX
     * PA1: RX */
    __HAL_RCC_USART4_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    GPIO_InitStruct.Pin = GPIO_PIN_0 | GPIO_PIN_1;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF6_USART4;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* Enable USART4 interrupt */
    HAL_NVIC_SetPriority(USART4_5_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART4_5_IRQn);
  }
}

/**
  * @brief UART MSP De-Initialization
  * Releases hardware resources used by UART peripherals
  * @param huart: UART handle pointer
  */
void HAL_UART_MspDeInit(UART_HandleTypeDef* huart) {
  if(huart->Instance == USART1) {
    __HAL_RCC_USART1_CLK_DISABLE();
    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_9 | GPIO_PIN_10);
    HAL_NVIC_DisableIRQ(USART1_IRQn);
  }
  else if(huart->Instance == USART2) {
    __HAL_RCC_USART2_CLK_DISABLE();
    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_2 | GPIO_PIN_3);
    HAL_NVIC_DisableIRQ(USART2_IRQn);
  }
  else if(huart->Instance == USART4) {
    __HAL_RCC_USART4_CLK_DISABLE();
    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_0 | GPIO_PIN_1);
    HAL_NVIC_DisableIRQ(USART4_5_IRQn);
  }
}
