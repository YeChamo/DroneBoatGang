/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : LoRa GPS Receiver with Bluetooth Control Button
  ******************************************************************************
  * @attention
  *
  * Bluetooth connection handled entirely by the phone/app.
  * STM32 just sends/receives data over UART6 (JDY-31 Bluetooth module).
  * Control is now entirely software driven via ENABLE/DISABLE commands.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include <stdio.h>
#include <string.h>

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
typedef struct {
  uint8_t valid;
  float latitude;
  float longitude;
  uint32_t last_update_ms;
} GPSData_t;
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define LBUF 128
#define BT_BUF 128
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;
UART_HandleTypeDef huart6;

/* USER CODE BEGIN PV */
UART_HandleTypeDef huart1; // LoRa
UART_HandleTypeDef huart2; // Debug
UART_HandleTypeDef huart6; // Bluetooth

static uint8_t  lora_rx_byte;
static char     lora_line[LBUF];
static volatile size_t  lora_len   = 0;
static volatile uint8_t lora_ready = 0;

static uint8_t  bt_rx_byte;
static char     bt_line[BT_BUF];
static volatile size_t  bt_len   = 0;
static volatile uint8_t bt_ready = 0;

static GPSData_t remote_gps = {0};

/* Software-controlled flag for enabling/disabling control */
static uint8_t control_enabled = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_USART6_UART_Init(void);
/* USER CODE BEGIN PFP */
static void dbg(const char *s);
static void StartLoRaRxIT(void);
static void StartBTRxIT(void);

static void lora_send_line(const char* s);
static int  lora_wait_line(uint32_t timeout_ms);
static int  lora_line_means_ok(const char* s);
static int  lora_line_means_err(const char* s);
static int  lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms);
static void lora_send_command(const char* cmd_str);
static void lora_parse_incoming(char* buf);
static uint32_t lora_autobaud(void);
static void lora_set_baud(uint32_t baud);

static void bt_send(const char* s);
static void bt_send_gps(float lat, float lon);
static void bt_parse_command(char* buf);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void dbg(const char *s)
{
  HAL_UART_Transmit(&huart2, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
}

static void StartLoRaRxIT(void) { HAL_UART_Receive_IT(&huart1, &lora_rx_byte, 1); }
static void StartBTRxIT(void)   { HAL_UART_Receive_IT(&huart6, &bt_rx_byte, 1); }

/* ---------------- Bluetooth UART ---------------- */
static void bt_send(const char* s){
  HAL_UART_Transmit(&huart6, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart6, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

static void bt_send_gps(float lat, float lon){
  char msg[64];
  snprintf(msg, sizeof(msg), "GPS,%.6f,%.6f", lat, lon);
  bt_send(msg);
}

static void bt_parse_command(char* buf){
  dbg("BT << "); dbg(buf); dbg("\r\n");

  // Strip newline
  for(char* p = buf; *p; p++){
    if(*p == '\r' || *p == '\n') *p = 0;
  }

  // Special commands to toggle control
  if(strcmp(buf, "ENABLE") == 0){
    control_enabled = 1;
    bt_send("SYSTEM,CONTROL_ENABLED");
    return;
  }
  else if(strcmp(buf, "DISABLE") == 0){
    control_enabled = 0;
    bt_send("SYSTEM,CONTROL_DISABLED");
    return;
  }

  // Ignore commands unless control enabled
  if(!control_enabled) {
    dbg("Control disabled, ignoring command\r\n");
    bt_send("SYSTEM,CONTROL_DISABLED");
    return;
  }

  if(strcmp(buf, "FORWARD") == 0){
    lora_send_command("FORWARD");
    bt_send("ACK,FORWARD");
  }
  else if(strcmp(buf, "BACKWARD") == 0){
    lora_send_command("BACKWARD");
    bt_send("ACK,BACKWARD");
  }
  else if(strcmp(buf, "LEFT") == 0){
    lora_send_command("LEFT");
    bt_send("ACK,LEFT");
  }
  else if(strcmp(buf, "RIGHT") == 0){
    lora_send_command("RIGHT");
    bt_send("ACK,RIGHT");
  }
  else if(strcmp(buf, "STOP") == 0){
    lora_send_command("STOP");
    bt_send("ACK,STOP");
  }
  else if(strcmp(buf, "PING") == 0){
    bt_send("PONG");
  }
  else if(strcmp(buf, "STATUS") == 0){
    if(remote_gps.valid){
      bt_send_gps(remote_gps.latitude, remote_gps.longitude);
    } else {
      bt_send("STATUS,NO_GPS");
    }
  }
  else {
    dbg("Unknown command, forwarding\r\n");
    lora_send_command(buf);
    bt_send("ACK,UNKNOWN");
  }
}

/* ---------------- LoRa ---------------- */
static void lora_send_line(const char* s){
  HAL_UART_Transmit(&huart1, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart1, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

static int lora_wait_line(uint32_t timeout_ms){
  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms){
    if(lora_ready){
      lora_ready = 0;
      return 1;
    }
  }
  return 0;
}

static int lora_line_means_ok(const char* s){
  return s && (strstr(s, "OK") || strstr(s, "+OK") || strstr(s, "SEND OK"));
}

static int lora_line_means_err(const char* s){
  return s && strstr(s, "ERROR");
}

static int lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms){
  lora_len = 0; lora_ready = 0;
  dbg("LORA << "); dbg(cmd); dbg("\r\n");
  lora_send_line(cmd);

  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms){
    if(lora_wait_line(50)){
      if (lora_line_means_ok(lora_line)) return 1;
      if (lora_line_means_err(lora_line)) return -1;
      lora_len = 0;
    }
  }
  return 0;
}

static void lora_send_command(const char* cmd_str){
  char payload[64];
  int pn = snprintf(payload, sizeof(payload), "CMD,%s", cmd_str);
  if(pn <= 0) return;

  char cmd[96];
  int cn = snprintf(cmd, sizeof(cmd), "AT+SEND=1,%d,%s", pn, payload);
  if(cn > 0){
    dbg("LORA TX CMD: "); dbg(cmd_str); dbg("\r\n");
    int r = lora_cmd_expect_ok(cmd, 3000);
    if(r > 0) dbg("SEND OK\r\n");
    else if(r < 0) dbg("SEND ERR\r\n");
    else dbg("SEND TIMEOUT\r\n");
  }
}

static void lora_parse_incoming(char* buf){
  if(strncmp(buf, "+RCV=", 5) != 0) return;

  char* data_start = strchr(buf + 5, ',');
  if(!data_start) return;
  data_start = strchr(data_start + 1, ',');
  if(!data_start) return;
  data_start++;

  if(strncmp(data_start, "GPS,", 4) == 0){
    float lat, lon;
    if(sscanf(data_start, "GPS,%f,%f", &lat, &lon) == 2){
      remote_gps.latitude = lat;
      remote_gps.longitude = lon;
      remote_gps.valid = 1;
      remote_gps.last_update_ms = HAL_GetTick();

      char msg[96];
      snprintf(msg, sizeof(msg), "GPS: %.6f, %.6f\r\n", lat, lon);
      dbg(msg);
      bt_send_gps(lat, lon);
    }
  }
}

static void lora_set_baud(uint32_t baud){
  HAL_UART_DeInit(&huart1);
  huart1.Init.BaudRate = baud;
  if (HAL_UART_Init(&huart1) != HAL_OK) Error_Handler();
  StartLoRaRxIT();
}

static uint32_t lora_autobaud(void){
  const uint32_t bauds[] = {115200, 57600, 38400, 19200, 9600};
  for (unsigned i=0;i<sizeof(bauds)/sizeof(bauds[0]);++i){
    lora_set_baud(bauds[i]);
    lora_send_line("AT");
    if(lora_wait_line(200)){
      if(lora_line_means_ok(lora_line)){
        dbg("LORA baud found\r\n");
        return bauds[i];
      }
    }
  }
  dbg("LORA not found\r\n");
  return 0;
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{
  HAL_Init();
  SystemClock_Config();
  MX_USART1_UART_Init();
  MX_USART2_UART_Init();
  MX_USART6_UART_Init();
  MX_GPIO_Init();

  StartLoRaRxIT();
  StartBTRxIT();

  dbg("\r\n=== LoRa GPS Receiver + Bluetooth Control ===\r\n");

  uint32_t found_baud = lora_autobaud();
  if(found_baud){
    lora_cmd_expect_ok("ATE0", 500);
    lora_cmd_expect_ok("AT+ADDRESS=0", 500);
    lora_cmd_expect_ok("AT+NETWORKID=18", 500);
    lora_cmd_expect_ok("AT+BAND=915000000", 500);
    dbg("LoRa configured\r\n");
  }

  uint32_t t_btmsg = HAL_GetTick();
  uint32_t t_status = HAL_GetTick();

  while (1)
  {
    if(lora_ready){
      lora_ready = 0;
      lora_line[lora_len] = 0;
      dbg("LORA >> "); dbg(lora_line); dbg("\r\n");
      lora_parse_incoming(lora_line);
      lora_len = 0;
    }

    if(bt_ready){
      bt_ready = 0;
      bt_line[bt_len] = 0;
      bt_parse_command(bt_line);
      bt_len = 0;
    }

    if(HAL_GetTick() - t_status >= 5000){
      if(remote_gps.valid){
        char msg[64];
        snprintf(msg, sizeof(msg), "GPS lat=%.6f lon=%.6f\r\n",
                 remote_gps.latitude, remote_gps.longitude);
        dbg(msg);
      } else {
        dbg("No GPS data\r\n");
      }

      if(control_enabled)
        dbg("Control ENABLED\r\n");
      else
        dbg("Control DISABLED\r\n");

      t_status = HAL_GetTick();
    }

    if(HAL_GetTick() - t_btmsg >= 1000){
      bt_send("STM32 here — what's up?");
      t_btmsg = HAL_GetTick();
    }

    HAL_Delay(10);
  }
}
/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief USART1 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART1_UART_Init(void)
{

  /* USER CODE BEGIN USART1_Init 0 */

  /* USER CODE END USART1_Init 0 */

  /* USER CODE BEGIN USART1_Init 1 */

  /* USER CODE END USART1_Init 1 */
  huart1.Instance = USART1;
  huart1.Init.BaudRate = 115200;
  huart1.Init.WordLength = UART_WORDLENGTH_8B;
  huart1.Init.StopBits = UART_STOPBITS_1;
  huart1.Init.Parity = UART_PARITY_NONE;
  huart1.Init.Mode = UART_MODE_TX_RX;
  huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart1.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart1) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART1_Init 2 */

  /* USER CODE END USART1_Init 2 */

}

/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 115200;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}

/**
  * @brief USART6 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART6_UART_Init(void)
{

  /* USER CODE BEGIN USART6_Init 0 */

  /* USER CODE END USART6_Init 0 */

  /* USER CODE BEGIN USART6_Init 1 */

  /* USER CODE END USART6_Init 1 */
  huart6.Instance = USART6;
  huart6.Init.BaudRate = 9600;
  huart6.Init.WordLength = UART_WORDLENGTH_8B;
  huart6.Init.StopBits = UART_STOPBITS_1;
  huart6.Init.Parity = UART_PARITY_NONE;
  huart6.Init.Mode = UART_MODE_TX_RX;
  huart6.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart6.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart6) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART6_Init 2 */

  /* USER CODE END USART6_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  /* USER CODE BEGIN MX_GPIO_Init_1 */

  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  /* USER CODE BEGIN MX_GPIO_Init_2 */

  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  // LoRa interrupt
  if(huart == &huart1) {
    char c = (char)lora_rx_byte;
    if(!lora_ready && lora_len < LBUF-1) {
      lora_line[lora_len++] = c;
    }
    if(c == '\n' || c == '\r') {
      lora_line[lora_len] = 0;
      lora_ready = 1;
    }
    StartLoRaRxIT();
  }
  // Bluetooth interrupt
  else if(huart == &huart6) {
    char c = (char)bt_rx_byte;
    if(!bt_ready && bt_len < BT_BUF-1) {
      bt_line[bt_len++] = c;
    }
    if(c == '\n' || c == '\r') {
      bt_line[bt_len] = 0;
      bt_ready = 1;
    }
    StartBTRxIT();
  }
}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */

