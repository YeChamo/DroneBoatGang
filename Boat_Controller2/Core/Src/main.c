
/* main.c - STM32L072CZTx Remote Control Bridge
 * 
 * System Architecture:
 * - Bluetooth (UART1): Communication with mobile app
 * - GPS (UART2): NMEA sentence parsing for position data
 * - LoRa (UART4): Long-range communication with remote boat
 * - ADC: Analog joystick input for manual control
 * 
 * This device acts as a bridge between:
 * 1. Mobile app control (via Bluetooth)
 * 2. Physical joystick control (via ADC)
 * 3. Remote boat (via LoRa radio)
 */

#include "main.h"
#include "bluetooth.h"
#include "lora.h"
#include "gps.h"
#include "joystick.h"

/* Global peripheral handles */
UART_HandleTypeDef huart1;  /* Bluetooth (USART1) */
UART_HandleTypeDef huart2;  /* GPS (USART2) */
UART_HandleTypeDef huart4;  /* LoRa (USART4) */
ADC_HandleTypeDef hadc;     /* ADC for joystick inputs */

/* Function prototypes */
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_ADC_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_USART4_UART_Init(void);

int main(void) {
  /* Initialize HAL library and system */
  HAL_Init();
  SystemClock_Config();
  
  /* Initialize peripherals */
  MX_GPIO_Init();
  MX_ADC_Init();          /* Joystick analog inputs */
  MX_USART1_UART_Init();  /* Bluetooth */
  MX_USART2_UART_Init();  /* GPS */
  MX_USART4_UART_Init();  /* LoRa */

  /* Start UART interrupt reception */
  StartLoRaRxIT();
  StartBTRxIT();
  StartGPSRxIT();

  /* Initialize modules */
  bt_init();
  lora_init();
  joystick_init();

  /* Main loop - poll all communication interfaces */
  while(1) {
    bt_check_state();    /* Monitor Bluetooth connection state */
    bt_process_line();   /* Process received Bluetooth commands */
    gps_task();          /* Parse GPS data and handle button */
    joystick_task();     /* Read and transmit joystick positions */

    HAL_Delay(2);        /* Small delay to prevent busy loop */
  }
}

/**
  * @brief UART RX Complete Callback
  * Routes UART interrupts to appropriate handler
  * @param huart: pointer to UART handle
  */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef* huart) {
  if(huart == &huart4) {
    lora_rx_callback();
  }
  else if(huart == &huart1) {
    bt_rx_callback();
  }
  else if(huart == &huart2) {
    gps_rx_callback();
  }
}

/**
  * @brief System Clock Configuration
  * Configures system to run from HSI (internal oscillator)
  */
void SystemClock_Config(void) {
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};
  RCC_PeriphCLKInitTypeDef PeriphClkInit = {0};

  /* Configure voltage regulator */
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /* Initialize HSI oscillator */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  
  if(HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
    Error_Handler();
  }

  /* Configure CPU, AHB and APB bus clocks */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK |
                                RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if(HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK) {
    Error_Handler();
  }
  
  /* Configure peripheral clocks */
  PeriphClkInit.PeriphClockSelection = RCC_PERIPHCLK_USART1 | RCC_PERIPHCLK_USART2;
  PeriphClkInit.Usart1ClockSelection = RCC_USART1CLKSOURCE_PCLK2;
  PeriphClkInit.Usart2ClockSelection = RCC_USART2CLKSOURCE_PCLK1;
  
  if(HAL_RCCEx_PeriphCLKConfig(&PeriphClkInit) != HAL_OK) {
    Error_Handler();
  }
}

/**
  * @brief ADC Initialization
  * Configures ADC for 12-bit resolution to read joystick analog inputs
  */
static void MX_ADC_Init(void) {
  hadc.Instance = ADC1;
  hadc.Init.OversamplingMode = DISABLE;
  hadc.Init.ClockPrescaler = ADC_CLOCK_SYNC_PCLK_DIV1;
  hadc.Init.Resolution = ADC_RESOLUTION_12B;
  hadc.Init.SamplingTime = ADC_SAMPLETIME_79CYCLES_5;
  hadc.Init.ScanConvMode = ADC_SCAN_DIRECTION_FORWARD;
  hadc.Init.DataAlign = ADC_DATAALIGN_RIGHT;
  hadc.Init.ContinuousConvMode = DISABLE;
  hadc.Init.DiscontinuousConvMode = DISABLE;
  hadc.Init.ExternalTrigConvEdge = ADC_EXTERNALTRIGCONVEDGE_NONE;
  hadc.Init.ExternalTrigConv = ADC_SOFTWARE_START;
  hadc.Init.DMAContinuousRequests = DISABLE;
  hadc.Init.EOCSelection = ADC_EOC_SINGLE_CONV;
  hadc.Init.Overrun = ADC_OVR_DATA_PRESERVED;
  hadc.Init.LowPowerAutoWait = DISABLE;
  hadc.Init.LowPowerFrequencyMode = DISABLE;
  hadc.Init.LowPowerAutoPowerOff = DISABLE;
  
  HAL_ADC_Init(&hadc);
}

/**
  * @brief USART1 Initialization (Bluetooth)
  * 9600 baud, 8N1 configuration
  */
static void MX_USART1_UART_Init(void) {
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 9600;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  huart1.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart1.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  
  if(HAL_UART_Init(&huart1) != HAL_OK) {
    Error_Handler();
  }
}

/**
  * @brief USART2 Initialization (GPS)
  * 9600 baud, 8N1 configuration (standard for GPS modules)
  */
static void MX_USART2_UART_Init(void) {
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 9600;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  huart2.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart2.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  
  if(HAL_UART_Init(&huart2) != HAL_OK) {
    Error_Handler();
  }
}

/**
  * @brief USART4 Initialization (LoRa)
  * 115200 baud, 8N1 configuration (AT command interface)
  */
static void MX_USART4_UART_Init(void) {
  huart4.Instance = USART4;
  huart4.Init.BaudRate = 115200;
  huart4.Init.WordLength = UART_WORDLENGTH_8B;
  huart4.Init.StopBits = UART_STOPBITS_1;
  huart4.Init.Parity = UART_PARITY_NONE;
  huart4.Init.Mode = UART_MODE_TX_RX;
  huart4.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart4.Init.OverSampling = UART_OVERSAMPLING_16;
  huart4.Init.OneBitSampling = UART_ONE_BIT_SAMPLE_DISABLE;
  huart4.AdvancedInit.AdvFeatureInit = UART_ADVFEATURE_NO_INIT;
  
  if(HAL_UART_Init(&huart4) != HAL_OK) {
    Error_Handler();
  }
}

/**
  * @brief GPIO Initialization
  * Configures GPIO pins for:
  * - PB4: GPS button input (no pull)
  * - PB6, PB7, PB8: Boat selector inputs (pull-down)
  * - PB9: Status LED output
  */
static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  /* Enable GPIO clocks */
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOB_CLK_ENABLE();

  /* Configure GPS button input (PB4) */
  GPIO_InitStruct.Pin = GPIO_PIN_4;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /* Configure boat selector inputs (PB6, PB7, PB8) */
  GPIO_InitStruct.Pin = GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_PULLDOWN;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

  /* Configure status LED output (PB9) */
  GPIO_InitStruct.Pin = GPIO_PIN_9;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}

/**
  * @brief Error Handler
  * Called when a peripheral initialization or runtime error occurs
  */
void Error_Handler(void) {
  __disable_irq();
  while(1) {
    /* Stay here for debugging */
  }
}

#ifdef USE_FULL_ASSERT
/**
  * @brief Reports the name of the source file and line number
  *        where the assert_param error occurred
  * @param file: pointer to source file name
  * @param line: assert_param error line number
  */
void assert_failed(uint8_t *file, uint32_t line) {
  /* User can add custom implementation to report the error */
}
#endif