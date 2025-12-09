/* stm32l0xx_it.h - Interrupt handler function prototypes */
#ifndef __STM32L0xx_IT_H
#define __STM32L0xx_IT_H

#ifdef __cplusplus
extern "C" {
#endif

/* Cortex-M0+ Core Exception Handlers */
void NMI_Handler(void);
void HardFault_Handler(void);
void SVC_Handler(void);
void PendSV_Handler(void);
void SysTick_Handler(void);

/* STM32L0xx Peripheral Interrupt Handlers */
void USART4_5_IRQHandler(void);  /* LoRa module (USART4) */
void USART2_IRQHandler(void);    /* GPS module */
void USART1_IRQHandler(void);    /* Bluetooth module */

#ifdef __cplusplus
}
#endif

#endif /* __STM32L0xx_IT_H */