/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2025 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "usart.h"
#include "gpio.h"
#include <string.h>
/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
#define LBUF 128

static uint8_t lora_rx_byte, ble_rx_byte;
static char    lora_line[LBUF], ble_line[LBUF];
static volatile size_t lora_len = 0, ble_len = 0;
static volatile uint8_t lora_ready = 0, ble_ready = 0;

#define GPS_LINE_MAX 128
static uint8_t gps_rx_byte;
static volatile char   gps_line[GPS_LINE_MAX];
static volatile size_t gps_lp = 0;
static volatile uint8_t gps_ready = 0;

static volatile uint8_t  gps_fix_valid = 0;
static volatile int32_t  gps_lat_e7 = 0;
static volatile int32_t  gps_lon_e7 = 0;
static volatile uint32_t gps_last_ms = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void StartLoRaRxIT(void);
static void StartBLERxIT(void);
static void dbg(const char *s);
/* USER CODE BEGIN PFP */
static void StartGPSRxIT(void);
static int  gps_validate_checksum(const char* s);
static int  gps_parse_ddmm_to_e7(const char* ddmm, const char* hemi, int32_t* out_e7);
static void gps_parse_rmc(char* buf);
static void gps_task(uint32_t now_ms);
static void handle_ble_command(const char* line);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
/* Prints a string on the debug UART */
static void dbg(const char *s)
{
  HAL_UART_Transmit(&huart2, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
}

/* Arms LoRa UART RX interrupt */
static void StartLoRaRxIT(void) { HAL_UART_Receive_IT(&huart1, &lora_rx_byte, 1); }

/* Arms BLE UART RX interrupt */
static void StartBLERxIT(void)  { HAL_UART_Receive_IT(&huart4, &ble_rx_byte, 1); }

/* Arms GPS UART RX interrupt */
static void StartGPSRxIT(void)  { HAL_UART_Receive_IT(&hlpuart1, &gps_rx_byte, 1); }

/* Validates an NMEA sentence checksum */
static int gps_validate_checksum(const char* s){
  if(!s || s[0]!='$') return 0;
  const char* star = strrchr(s, '*');
  if(!star || star - s < 2) return 0;
  uint8_t x = 0;
  for(const char* p=s+1; p<star; ++p) x ^= (uint8_t)(*p);
  if(!isxdigit((unsigned char)star[1]) || !isxdigit((unsigned char)star[2])) return 0;
  uint8_t h = (uint8_t)((star[1]>='A'&&star[1]<='F') ? 10+star[1]-'A' : (star[1]>='a'&&star[1]<='f') ? 10+star[1]-'a' : star[1]-'0');
  uint8_t l = (uint8_t)((star[2]>='A'&&star[2]<='F') ? 10+star[2]-'A' : (star[2]>='a'&&star[2]<='f') ? 10+star[2]-'a' : star[2]-'0');
  uint8_t want = (uint8_t)((h<<4)|l);
  return x == want;
}

/* Converts ddmm.mmmm (+ hemisphere) to degrees * 1e-7 */
static int gps_parse_ddmm_to_e7(const char* ddmm, const char* hemi, int32_t* out_e7){
  if(!ddmm || !*ddmm || !out_e7) return 0;
  double v = atof(ddmm);
  int deg = (int)(v / 100.0);
  double minutes = v - (deg * 100.0);
  double degs = deg + minutes / 60.0;
  if(hemi && (*hemi=='S' || *hemi=='W')) degs = -degs;
  long long e7 = (long long)(degs * 1e7);
  if(e7 >  2147483647LL) e7 =  2147483647LL;
  if(e7 < -2147483648LL) e7 = -2147483648LL;
  *out_e7 = (int32_t)e7;
  return 1;
}

/* Parses a $GPRMC/$GNRMC sentence for fix and lat/lon */
static void gps_parse_rmc(char* buf){
  if(!gps_validate_checksum(buf)) return;
  for(char* q=buf; *q; ++q) if(*q=='\r'||*q=='\n') *q=0;
  const char* toks[16]={0}; int nt=0;
  for(char* t = strtok(buf, ","); t && nt<16; t=strtok(NULL, ",")) toks[nt++]=t;
  if(nt < 7) return;
  if(strncmp(toks[0], "$GPRMC", 6)!=0 && strncmp(toks[0], "$GNRMC", 6)!=0) return;
  const char* status = toks[2];
  const char* lat    = toks[3];
  const char* hemiNS = toks[4];
  const char* lon    = toks[5];
  const char* hemiEW = toks[6];
  if(!status || (*status!='A' && *status!='a')) { gps_fix_valid = 0; return; }
  int32_t lat_e7=0, lon_e7=0;
  if(!gps_parse_ddmm_to_e7(lat, hemiNS, &lat_e7)) return;
  if(!gps_parse_ddmm_to_e7(lon, hemiEW, &lon_e7)) return;
  gps_fix_valid = 1;
  gps_lat_e7 = lat_e7;
  gps_lon_e7 = lon_e7;
  gps_last_ms = HAL_GetTick();
}

/* Consumes a completed GPS line and updates parsed state */
static void gps_task(uint32_t now_ms){
  (void)now_ms;
  if(gps_ready){
    char buf[GPS_LINE_MAX];
    size_t i=0;
    while(i<GPS_LINE_MAX-1){
      char c = ((volatile char*)gps_line)[i];
      buf[i]=c; if(!c) break; i++;
    }
    buf[GPS_LINE_MAX-1]=0;
    if(strncmp(buf, "$GPRMC", 6)==0 || strncmp(buf, "$GNRMC", 6)==0){
      gps_parse_rmc(buf);
    }
    gps_ready = 0;
  }
}

/* Handles simple BLE commands (VER? / GPS?) */
static void handle_ble_command(const char* line){
  size_t n = strlen(line);
  while(n && (line[n-1]=='\r' || line[n-1]=='\n')) n--;
  if(n==4 && strncmp(line,"VER?",4)==0){
    const char* b = "VER: fw=0.2.0; build=dev\r\n";
    HAL_UART_Transmit(&huart4, (uint8_t*)b, strlen(b), HAL_MAX_DELAY);
    return;
  }
  if(n==4 && strncmp(line,"GPS?",4)==0){
    char b[96];
    if(gps_fix_valid){
      float lat = gps_lat_e7 / 1e7f;
      float lon = gps_lon_e7 / 1e7f;
      int m = snprintf(b, sizeof(b), "GPS: fix lat=%.6f lon=%.6f age=%lums\r\n",
                       lat, lon, (unsigned long)(HAL_GetTick()-gps_last_ms));
      if(m>0) HAL_UART_Transmit(&huart4, (uint8_t*)b, (uint16_t)m, HAL_MAX_DELAY);
    }else{
      const char* nf = "GPS: no fix\r\n";
      HAL_UART_Transmit(&huart4, (uint8_t*)nf, strlen(nf), HAL_MAX_DELAY);
    }
    return;
  }
  const char* u = "CMD? Try VER? or GPS?\r\n";
  HAL_UART_Transmit(&huart4, (uint8_t*)u, strlen(u), HAL_MAX_DELAY);
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
  MX_USART2_UART_Init();  //debug
  MX_USART1_UART_Init();  //Lora
  MX_USART4_UART_Init();  //BLE
  MX_LPUART1_UART_Init(); //GPS
  /* USER CODE BEGIN 2 */
  const char *msg = "hello from STM32L0!\r\n";
  HAL_UART_Transmit(&huart2, (uint8_t*)msg, strlen(msg), HAL_MAX_DELAY);

  StartLoRaRxIT();
  StartBLERxIT();
  StartGPSRxIT();

  dbg("LoRa=USART1, Debug=USART2, BLE=USART4\r\n");
  /* USER CODE END 2 */

  /* Infinite loop */
  /* USER CODE BEGIN WHILE */
  uint32_t t_1hz = HAL_GetTick();
  uint32_t t_gps = HAL_GetTick();

  while (1)
  {
    uint32_t now = HAL_GetTick();

    if(now - t_gps >= 10){
      gps_task(now);
      t_gps = now;
    }

    if(now - t_1hz >= 1000){
      dbg("tick\r\n");
      if(gps_fix_valid){
        char line[96];
        float lat = gps_lat_e7 / 1e7f;
        float lon = gps_lon_e7 / 1e7f;
        int n = snprintf(line, sizeof(line), "GPS: fix lat=%.6f lon=%.6f\r\n", lat, lon);
        if(n>0) HAL_UART_Transmit(&huart2, (uint8_t*)line, (uint16_t)n, HAL_MAX_DELAY);
      } else {
        dbg("GPS: no fix\r\n");
      }
      t_1hz = now;
    }

    if(lora_ready) {
      dbg("LORA RX: "); dbg(lora_line); dbg("\r\n");
      HAL_UART_Transmit(&huart4, (uint8_t*)lora_line, strlen(lora_line), HAL_MAX_DELAY);
      HAL_UART_Transmit(&huart4, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
      lora_len = 0; lora_ready = 0;
    }

    if(ble_ready) {
      dbg("BLE  RX: "); dbg(ble_line); dbg("\r\n");
      handle_ble_command(ble_line);
      HAL_UART_Transmit(&huart1, (uint8_t*)ble_line, strlen(ble_line), HAL_MAX_DELAY);
      HAL_UART_Transmit(&huart1, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
      ble_len = 0; ble_ready = 0;
    }

    HAL_Delay(1);
  }
  /* USER CODE END WHILE */

  /* USER CODE BEGIN 3 */
}
/* USER CODE END 3 */

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};
  RCC_PeriphCLKInitTypeDef PeriphClkInit = {0};

  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_MSI;
  RCC_OscInitStruct.MSIState = RCC_MSI_ON;
  RCC_OscInitStruct.MSICalibrationValue = 0;
  RCC_OscInitStruct.MSIClockRange = RCC_MSIRANGE_5;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_MSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
  PeriphClkInit.PeriphClockSelection = RCC_PERIPHCLK_USART1|RCC_PERIPHCLK_USART2
                              |RCC_PERIPHCLK_LPUART1;
  PeriphClkInit.Usart1ClockSelection = RCC_USART1CLKSOURCE_PCLK2;
  PeriphClkInit.Usart2ClockSelection = RCC_USART2CLKSOURCE_PCLK1;
  PeriphClkInit.Lpuart1ClockSelection = RCC_LPUART1CLKSOURCE_PCLK1;
  if (HAL_RCCEx_PeriphCLKConfig(&PeriphClkInit) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */
/* Handles UART RX complete interrupts for LoRa, BLE, and GPS */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if(huart == &huart1) {
    char c = (char)lora_rx_byte;
    if(!lora_ready && lora_len < LBUF-1) lora_line[lora_len++] = c;
    if(c == '\n' || c == '\r') { lora_line[lora_len] = 0; lora_ready = 1; }
    StartLoRaRxIT();
  }
  else if(huart == &huart4) {
    char c = (char)ble_rx_byte;
    if(!ble_ready && ble_len < LBUF-1) ble_line[ble_len++] = c;
    if(c == '\n' || c == '\r') { ble_line[ble_len] = 0; ble_ready = 1; }
    StartBLERxIT();
  }
  else if(huart == &hlpuart1) {
    char c = (char)gps_rx_byte;
    if(!gps_ready){
      if(c=='\n' || c=='\r'){
        if(gps_lp>0){ ((volatile char*)gps_line)[gps_lp]=0; gps_ready=1; }
        gps_lp = 0;
      }else if(gps_lp < GPS_LINE_MAX-1){
        ((volatile char*)gps_line)[gps_lp++] = c;
      }else{
        gps_lp = 0;
      }
    }
    StartGPSRxIT();
  }
}
/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  __disable_irq();
  while (1)
  {
  }
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
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */
