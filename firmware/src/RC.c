/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : LoRa GPS Receiver with Bluetooth Control
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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
#define BT_STATE_PIN GPIO_PIN_8
#define BT_STATE_PORT GPIOA
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2;
UART_HandleTypeDef huart6;

/* USER CODE BEGIN PV */
// LoRa variables
static uint8_t  lora_rx_byte;
static char     lora_line[LBUF];
static volatile size_t  lora_len   = 0;
static volatile uint8_t lora_ready = 0;

// Bluetooth variables
static uint8_t  bt_rx_byte;
static char     bt_line[BT_BUF];
static volatile size_t  bt_len   = 0;
static volatile uint8_t bt_ready = 0;
static uint8_t bt_was_connected = 0;
static uint32_t bt_last_conn_check = 0;

static GPSData_t remote_gps = {0};
static volatile uint8_t button_pressed = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_USART2_UART_Init(void);
static void MX_USART6_UART_Init(void);
/* USER CODE BEGIN PFP */
// LoRa functions
static void StartLoRaRxIT(void);
static void dbg(const char *s);
static void lora_send_line(const char* s);
static int  lora_wait_line(uint32_t timeout_ms);
static int  lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms);
static void lora_send_command(const char* cmd_str);
static void lora_parse_incoming(char* buf);
static void     lora_set_baud(uint32_t baud);
static int      lora_probe_at(uint32_t timeout_ms);
static uint32_t lora_autobaud(void);
static int      lora_line_means_ok(const char* s);
static int      lora_line_means_err(const char* s);

// Bluetooth functions
static void StartBTRxIT(void);
static uint8_t bt_is_connected(void);
static void bt_send(const char* s);
static void bt_parse_command(char* buf);
static void bt_send_gps(float lat, float lon);
static void bt_check_connection_state(void);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void dbg(const char *s)
{
  HAL_UART_Transmit(&huart2, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
}

static void StartLoRaRxIT(void) { HAL_UART_Receive_IT(&huart1, &lora_rx_byte, 1); }
static void StartBTRxIT(void)   { HAL_UART_Receive_IT(&huart6, &bt_rx_byte, 1); }

/* ---------- Bluetooth helpers ---------- */
static uint8_t bt_is_connected(void){
  // JDY-31 STATE pin is HIGH when connected, LOW when disconnected
  return HAL_GPIO_ReadPin(BT_STATE_PORT, BT_STATE_PIN) == GPIO_PIN_SET;
}

static void bt_send(const char* s){
  if(!bt_is_connected()){
    dbg("BT: Not connected, message not sent\r\n");
    return;
  }
  HAL_UART_Transmit(&huart6, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart6, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

static void bt_send_gps(float lat, float lon){
  if(!bt_is_connected()){
    dbg("BT: Not connected, GPS not sent\r\n");
    return;
  }

  char msg[128];
  int n = snprintf(msg, sizeof(msg), "GPS,%.6f,%.6f", lat, lon);
  if(n > 0){
    HAL_UART_Transmit(&huart6, (uint8_t*)msg, (size_t)n, HAL_MAX_DELAY);
    HAL_UART_Transmit(&huart6, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
    dbg("BT >> GPS sent\r\n");
  }
}

static void bt_check_connection_state(void){
  uint8_t bt_connected = bt_is_connected();

  // Detect connection state changes
  if(bt_connected != bt_was_connected){
    if(bt_connected){
      dbg("BT: Device connected\r\n");
      // Give the connection a moment to stabilize
      HAL_Delay(100);
      bt_send("SYSTEM,CONNECTED");

      // Send current GPS status if available
      if(remote_gps.valid){
        bt_send_gps(remote_gps.latitude, remote_gps.longitude);
      }
    } else {
      dbg("BT: Device disconnected\r\n");
    }
    bt_was_connected = bt_connected;
  }
}

static void bt_parse_command(char* buf){
  // Expected commands from app:
  // "FORWARD", "BACKWARD", "LEFT", "RIGHT", "STOP", etc.

  dbg("BT << "); dbg(buf); dbg("\r\n");

  // Remove any trailing whitespace/newlines
  for(char* p = buf; *p; p++){
    if(*p == '\r' || *p == '\n') *p = 0;
  }

  // Check for specific commands
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
    // Send current GPS status to app
    if(remote_gps.valid){
      uint32_t age = HAL_GetTick() - remote_gps.last_update_ms;
      if(age < 10000){  // Only send if less than 10 seconds old
        bt_send_gps(remote_gps.latitude, remote_gps.longitude);
      } else {
        bt_send("STATUS,GPS_STALE");
      }
    } else {
      bt_send("STATUS,NO_GPS");
    }
  }
  else {
    // Unknown command - just forward it
    dbg("BT: Unknown command, forwarding to LoRa\r\n");
    lora_send_command(buf);
    bt_send("ACK,UNKNOWN");
  }
}

/* ---------- LoRa helpers ---------- */
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
  return s && (
      strstr(s, "OK")       || strstr(s, "+OK")     ||
      strstr(s, "OK+SEND")  || strstr(s, "OK+SENT") ||
      strstr(s, "SENT")     || strstr(s, "SENDED")  ||
      strstr(s, "SEND OK")
  );
}

static int lora_line_means_err(const char* s){
  return s && (strstr(s, "ERROR") || strstr(s, "ERR"));
}

static int lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms){
  lora_len = 0; lora_ready = 0;
  dbg("LORA << "); dbg(cmd); dbg("\r\n");
  lora_send_line(cmd);

  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms){
    if(lora_wait_line(50)){
      if (lora_line_means_ok(lora_line)) {
        dbg("LORA >> "); dbg(lora_line); dbg("\r\n");
        return 1;
      }
      if (lora_line_means_err(lora_line)){
        dbg("LORA >> "); dbg(lora_line); dbg("\r\n");
        return -1;
      }
      dbg("LORA >> "); dbg(lora_line); dbg("\r\n");
      lora_len = 0;
    }
  }
  dbg("LORA >> (timeout)\r\n");
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
    if     (r > 0) dbg("LORA SEND: OK\r\n");
    else if(r < 0) dbg("LORA SEND: ERROR\r\n");
    else           dbg("LORA SEND: TIMEOUT\r\n");
  }
}

static void lora_parse_incoming(char* buf){
  if(strncmp(buf, "+RCV=", 5) != 0) return;

  char* data_start = NULL;
  int comma_count = 0;

  for(char* p = buf + 5; *p; p++){
    if(*p == ','){
      comma_count++;
      if(comma_count == 2){
        data_start = p + 1;
        break;
      }
    }
  }

  if(!data_start) return;

  // Check if it's GPS data
  if(strncmp(data_start, "GPS,", 4) == 0){
    float lat, lon;
    if(sscanf(data_start, "GPS,%f,%f", &lat, &lon) == 2){
      remote_gps.latitude = lat;
      remote_gps.longitude = lon;
      remote_gps.valid = 1;
      remote_gps.last_update_ms = HAL_GetTick();

      char line[128];
      int n = snprintf(line, sizeof(line),
                      "RECEIVED GPS: lat=%.6f lon=%.6f\r\n", lat, lon);
      if(n > 0) dbg(line);

      // Forward GPS data to Bluetooth app (only if connected)
      bt_send_gps(lat, lon);
    }
  }
  // Check if it's a command acknowledgment
  else if(strncmp(data_start, "ACK,", 4) == 0){
    dbg("RECEIVED ACK: ");
    dbg(data_start + 4);
    dbg("\r\n");

    // Forward ACK to Bluetooth app
    char ack_msg[64];
    snprintf(ack_msg, sizeof(ack_msg), "%s", data_start);
    bt_send(ack_msg);
  }
}

static void lora_set_baud(uint32_t baud){
  HAL_UART_DeInit(&huart1);
  huart1.Init.BaudRate = baud;
  if (HAL_UART_Init(&huart1) != HAL_OK) { Error_Handler(); }
  StartLoRaRxIT();
}

static int lora_probe_at(uint32_t timeout_ms){
  lora_len = 0; lora_ready = 0;
  HAL_Delay(30);
  HAL_UART_Transmit(&huart1, (uint8_t*)"AT\r\n", 4, HAL_MAX_DELAY);
  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms){
    if(lora_ready){
      if (lora_line_means_ok(lora_line)) { lora_ready=0; return 1; }
      lora_ready = 0;
    }
  }
  return 0;
}

static uint32_t lora_autobaud(void){
  const uint32_t bauds[] = {115200, 57600, 38400, 19200, 9600};
  for (unsigned i=0;i<sizeof(bauds)/sizeof(bauds[0]);++i){
    lora_set_baud(bauds[i]);
    if (lora_probe_at(500)) {
      char line[64];
      int n = snprintf(line, sizeof(line), "LORA: baud=%lu\r\n", (unsigned long)bauds[i]);
      if(n>0) dbg(line);
      return bauds[i];
    }
  }
  dbg("LORA: no AT response (check wiring/module type)\r\n");
  return 0;
}
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_USART1_UART_Init();
  MX_USART2_UART_Init();
  MX_USART6_UART_Init();
  /* USER CODE BEGIN 2 */
  StartLoRaRxIT();
  StartBTRxIT();

  dbg("\r\n=== LoRa Receiver with Bluetooth ===\r\n");

  // Check initial Bluetooth connection state
  bt_was_connected = bt_is_connected();
  if(bt_was_connected){
    dbg("BT: Device already connected\r\n");
  } else {
    dbg("BT: Waiting for device connection\r\n");
  }

  HAL_Delay(300);
  uint32_t found_baud = lora_autobaud();

  if(found_baud){
    lora_cmd_expect_ok("ATE0", 800);
    lora_cmd_expect_ok("AT+ADDRESS=0", 800);
    lora_cmd_expect_ok("AT+NETWORKID=18", 800);
    lora_cmd_expect_ok("AT+BAND=915000000", 1200);
    lora_cmd_expect_ok("AT+PARAMETER=12,7,1,4", 1200);
    dbg("LoRa configured. Listening for GPS data...\r\n");
  }

  dbg("Bluetooth ready on USART6\r\n");

  // Only send ready message if already connected
  if(bt_is_connected()){
    bt_send("SYSTEM,READY");
  }

  uint32_t t_status = HAL_GetTick();
  bt_last_conn_check = HAL_GetTick();
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    uint32_t now = HAL_GetTick();

    // Check Bluetooth connection state every 500ms
    if(now - bt_last_conn_check >= 500){
      bt_check_connection_state();
      bt_last_conn_check = now;
    }

    // Process incoming LoRa messages (GPS data from partner)
    if(lora_ready){
      char buf[LBUF];
      strncpy(buf, lora_line, LBUF-1);
      buf[LBUF-1] = 0;

      dbg("LORA >> "); dbg(buf); dbg("\r\n");
      lora_parse_incoming(buf);

      lora_len = 0;
      lora_ready = 0;
    }

    // Process incoming Bluetooth commands (from app)
    if(bt_ready){
      char buf[BT_BUF];
      strncpy(buf, bt_line, BT_BUF-1);
      buf[BT_BUF-1] = 0;

      bt_parse_command(buf);

      bt_len = 0;
      bt_ready = 0;
    }

    // Status printout every 5 seconds
    if(now - t_status >= 5000){
      char status_line[128];
      int n;

      // GPS Status
      if(remote_gps.valid && (now - remote_gps.last_update_ms) < 5000){
        n = snprintf(status_line, sizeof(status_line),
                    "STATUS: GPS valid - lat=%.6f lon=%.6f (age=%lums)\r\n",
                    remote_gps.latitude, remote_gps.longitude,
                    (unsigned long)(now - remote_gps.last_update_ms));
      } else {
        n = snprintf(status_line, sizeof(status_line), "STATUS: No valid GPS data\r\n");
      }
      if(n > 0) dbg(status_line);

      // Bluetooth Status
      if(bt_is_connected()){
        dbg("STATUS: Bluetooth connected\r\n");
      } else {
        dbg("STATUS: Bluetooth disconnected\r\n");
      }

      t_status = now;
    }

    HAL_Delay(10);
  }
  /* USER CODE END 3 */
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
  huart6.Init.BaudRate = 9600;  // JDY-31 default baud rate
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
  GPIO_InitTypeDef GPIO_InitStruct = {0};
/* USER CODE BEGIN MX_GPIO_Init_1 */
/* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOA_CLK_ENABLE();
  __HAL_RCC_GPIOC_CLK_ENABLE();

  /* Configure JDY-31 STATE pin as input */
  GPIO_InitStruct.Pin = BT_STATE_PIN;
  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  HAL_GPIO_Init(BT_STATE_PORT, &GPIO_InitStruct);

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
