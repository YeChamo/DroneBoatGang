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

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>
#include <string.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */
/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */
#define LBUF         128
#define GPS_LINE_MAX 128
#define LED_TEST_MODE 0
#define VERBOSE 1
/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */
/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
static uint8_t  lora_rx_byte;
static char     lora_line[LBUF];
static volatile size_t  lora_len   = 0;
static volatile uint8_t lora_ready = 0;

static uint8_t  gps_rx_byte;
static volatile char    gps_line[GPS_LINE_MAX];
static volatile size_t  gps_lp     = 0;
static volatile uint8_t gps_ready  = 0;

static volatile uint8_t  gps_fix_valid = 0;
static volatile int32_t  gps_lat_e7    = 0;
static volatile int32_t  gps_lon_e7    = 0;
static volatile uint32_t gps_last_ms   = 0;
static volatile uint32_t gps_last_rx_ms= 0;
static volatile uint32_t gps_byte_count= 0;

static volatile uint8_t  op_mode = 1;
static volatile uint32_t led3_pulse_until = 0;

static uint32_t last_tx = 0;
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);

/* USER CODE BEGIN PFP */
static void StartLoRaRxIT(void);
static void StartGPSRxIT(void);
static int  gps_validate_checksum(const char* s);
static int  gps_parse_ddmm_to_e7(const char* ddmm, const char* hemi, int32_t* out_e7);
static void gps_parse_rmc(char* buf);
static void gps_task(uint32_t now_ms);

static void dbg(const char *s);
static void vdbg(const char *s);
static void lora_send_line(const char* s);
static int  lora_wait_line(uint32_t timeout_ms);
static int  lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms);
static void lora_send_gps_e7(int32_t lat_e7, int32_t lon_e7);

static void     lora_set_baud(uint32_t baud);
static int      lora_probe_at(uint32_t timeout_ms);
static uint32_t lora_autobaud(void);

static int  lora_line_means_ok(const char* s);
static int  lora_line_means_err(const char* s);

static void leds_all_off(void);
static void leds_boot_chase(void);
static void leds_apply_cmd(uint8_t cmd);

static void     gps_set_baud(uint32_t baud);
static uint32_t gps_autobaud(uint32_t ms_total);
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
static void dbg(const char *s)
{
  HAL_UART_Transmit(&huart2, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
}
static void vdbg(const char *s)
{
#if VERBOSE
  HAL_UART_Transmit(&huart2, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
#endif
}

static void StartLoRaRxIT(void) { HAL_UART_Receive_IT(&huart1, &lora_rx_byte, 1); }
static void StartGPSRxIT(void)  { HAL_UART_Receive_IT(&hlpuart1, &gps_rx_byte, 1); }

static void leds_all_off(void)
{
  HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_RESET);
  HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_RESET);
}

static void leds_boot_chase(void)
{
  leds_all_off();
  HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_SET); HAL_Delay(150); leds_all_off();
  HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_SET); HAL_Delay(150); leds_all_off();
  HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET); HAL_Delay(150); leds_all_off();
  HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_SET); HAL_Delay(150); leds_all_off();
}

static void leds_apply_cmd(uint8_t cmd)
{
  if(cmd == 0){ leds_all_off(); vdbg("LED SET:0\r\n"); return; }
  leds_all_off();
  switch(cmd){
    case 1: HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_SET); break;
    case 2: HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_SET); break;
    case 3: HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET); break;
    case 4: HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_SET); break;
    default: break;
  }
  char s[16]; int n=snprintf(s,sizeof(s),"LED SET:%u\r\n",cmd); if(n>0) vdbg(s);
}

static int gps_validate_checksum(const char* s)
{
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

static int gps_parse_ddmm_to_e7(const char* ddmm, const char* hemi, int32_t* out_e7)
{
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

static void gps_parse_rmc(char* buf)
{
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
  if(!status || (*status!='A' && *status!='a')) { gps_fix_valid = 0; vdbg("GPS NOFIX\r\n"); return; }

  int32_t lat_e7=0, lon_e7=0;
  if(!gps_parse_ddmm_to_e7(lat, hemiNS, &lat_e7)) return;
  if(!gps_parse_ddmm_to_e7(lon, hemiEW, &lon_e7)) return;

  gps_fix_valid = 1;
  gps_lat_e7 = lat_e7;
  gps_lon_e7 = lon_e7;
  gps_last_ms = HAL_GetTick();

  if(VERBOSE){
    char line[64];
    int n = snprintf(line, sizeof(line), "GPS COORD,%ld,%ld\r\n", (long)gps_lat_e7, (long)gps_lon_e7);
    if(n>0) vdbg("GPS FIX\r\n");
    if(n>0) vdbg(line);
  }

  if (op_mode == 0)
  {
    char line2[40];
    int n2 = snprintf(line2, sizeof(line2), "%ld,%ld\r\n", (long)gps_lat_e7, (long)gps_lon_e7);
    if(n2>0) dbg(line2);
  }
}

static void gps_task(uint32_t now_ms){
  (void)now_ms;
  if(gps_ready)
  {
    char buf[GPS_LINE_MAX];
    size_t i=0;
    while(i<GPS_LINE_MAX-1)
    {
      char c = ((volatile char*)gps_line)[i];
      buf[i]=c; if(!c) break; i++;
    }
    buf[GPS_LINE_MAX-1]=0;
    gps_last_rx_ms = HAL_GetTick();

    if(strncmp(buf, "$GPRMC", 6)==0 || strncmp(buf, "$GNRMC", 6)==0)
    {
      if(VERBOSE){ vdbg("GPS << RMC "); vdbg(buf); vdbg("\r\n"); }
      gps_parse_rmc(buf);
    }
    gps_ready = 0;
  }
}

static void lora_send_line(const char* s)
{
  HAL_UART_Transmit(&huart1, (uint8_t*)s, strlen(s), HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart1, (uint8_t*)"\r\n", 2, HAL_MAX_DELAY);
}

static int lora_wait_line(uint32_t timeout_ms)
{
  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms){
    if(lora_ready){
      lora_ready = 0;
      return 1;
    }
    HAL_Delay(1);
  }
  return 0;
}

static int lora_line_means_ok(const char* s)
{
  return s && (
      strstr(s, "OK")       || strstr(s, "+OK")     ||
      strstr(s, "OK+SEND")  || strstr(s, "OK+SENT") ||
      strstr(s, "SENT")     || strstr(s, "SENDED")  ||
      strstr(s, "SEND OK")
  );
}
static int lora_line_means_err(const char* s)
{
  return s && (strstr(s, "ERROR") || strstr(s, "ERR"));
}

static int lora_cmd_expect_ok(const char* cmd, uint32_t timeout_ms){
  lora_len = 0; lora_ready = 0;
  if(VERBOSE){ vdbg("LORA << "); vdbg(cmd); vdbg("\r\n"); }
  lora_send_line(cmd);
  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms)
  {
    if(lora_wait_line(50))
    {
      if(VERBOSE){ vdbg("LORA >> "); vdbg(lora_line); vdbg("\r\n"); }
      if (lora_line_means_ok(lora_line)) { return 1; }
      if (lora_line_means_err(lora_line)) { return -1; }
      lora_len = 0;
    }
  }
  if(VERBOSE){ vdbg("LORA >> (timeout)\r\n"); }
  return 0;
}

static void lora_send_gps_e7(int32_t lat_e7, int32_t lon_e7)
{
  char payload[64];
  int pn = snprintf(payload, sizeof(payload), "GPS,%ld,%ld", (long)lat_e7, (long)lon_e7);
  if(pn <= 0) return;
  char cmd[96];
  int cn = snprintf(cmd, sizeof(cmd), "AT+SEND=0,%d,%s", pn, payload);
  if(cn > 0)
  {
    if(VERBOSE){ vdbg("LORA TX: "); vdbg(payload); vdbg("\r\n"); }
    int r = lora_cmd_expect_ok(cmd, 5000);
    if(VERBOSE){
      if     (r > 0)  vdbg("LORA SEND: OK\r\n");
      else if(r < 0)  vdbg("LORA SEND: ERROR\r\n");
      else            vdbg("LORA SEND: TIMEOUT\r\n");
    }
  }
}

static void lora_set_baud(uint32_t baud)
{
  HAL_UART_DeInit(&huart1);
  huart1.Init.BaudRate = baud;
  if (HAL_UART_Init(&huart1) != HAL_OK) { Error_Handler(); }
  StartLoRaRxIT();
}

static int lora_probe_at(uint32_t timeout_ms)
{
  lora_len = 0; lora_ready = 0;
  HAL_Delay(30);
  HAL_UART_Transmit(&huart1, (uint8_t*)"AT\r\n", 4, HAL_MAX_DELAY);
  uint32_t t0 = HAL_GetTick();
  while((HAL_GetTick() - t0) < timeout_ms)
  {
    if(lora_ready)
    {
      if (lora_line_means_ok(lora_line)) { lora_ready=0; return 1; }
      lora_ready = 0;
    }
  }
  return 0;
}

static uint32_t lora_autobaud(void)
{
  const uint32_t bauds[] = {115200, 57600, 38400, 19200, 9600};
  for (unsigned i=0;i<sizeof(bauds)/sizeof(bauds[0]);++i)
  {
    lora_set_baud(bauds[i]);
    if (lora_probe_at(500))
    {
      char line[48];
      int n = snprintf(line, sizeof(line), "LORA: baud=%lu\r\n", (unsigned long)bauds[i]);
      if(n>0) vdbg(line);
      return bauds[i];
    }
  }
  vdbg("LORA: no AT response\r\n");
  return 0;
}

static void gps_set_baud(uint32_t baud)
{
  HAL_UART_DeInit(&hlpuart1);
  hlpuart1.Init.BaudRate = baud;
  if (HAL_UART_Init(&hlpuart1) != HAL_OK) { Error_Handler(); }
  StartGPSRxIT();
}

static uint32_t gps_autobaud(uint32_t ms_total)
{
  const uint32_t bauds[] = {9600, 4800, 38400, 57600, 115200};
  uint32_t start = HAL_GetTick();
  for (unsigned i=0;i<sizeof(bauds)/sizeof(bauds[0]);++i)
  {
    gps_set_baud(bauds[i]);
    gps_byte_count = 0;
    uint32_t t0 = HAL_GetTick();
    while ((HAL_GetTick() - t0) < 700)
    {
      if (gps_ready || gps_byte_count >= 10) {
        char line[48];
        int n = snprintf(line, sizeof(line), "GPS: baud=%lu\r\n", (unsigned long)bauds[i]);
        if(n>0) vdbg(line);
        return bauds[i];
      }
    }
    if ((HAL_GetTick() - start) > ms_total) break;
  }
  vdbg("GPS: no data\r\n");
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

  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_LPUART1_UART_Init();
  MX_USART1_UART_Init();
  StartLoRaRxIT();
  StartGPSRxIT();
#if VERBOSE
  vdbg("FW v1.0 " __DATE__ " " __TIME__ "\r\n");
#endif
  lora_autobaud();
  gps_autobaud(3000);
  if (LED_TEST_MODE) {
    HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_SET);
    while (1) { HAL_Delay(1000); }
  }
  leds_boot_chase();
  leds_apply_cmd(0);

  uint32_t last_blink = 0;
  uint32_t led_hb = 0;

  while (1)
  {
    uint32_t now = HAL_GetTick();

    gps_task(now);

    if (gps_fix_valid && (now - last_tx) > 5000)
    {
      last_tx = now;
      lora_send_gps_e7(gps_lat_e7, gps_lon_e7);
    }

    if (op_mode == 0)
    {
      if (gps_fix_valid) { HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_SET); }
      else               { HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_RESET); }

      if ((now - gps_last_rx_ms) > 1000)
      {
        if ((now - last_blink) > 500) { last_blink = now; HAL_GPIO_TogglePin(LED2_GPIO_Port, LED2_Pin); }
      }
      else
      {
        HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_RESET);
      }

      if ((now - led_hb) > 250) { led_hb = now; HAL_GPIO_TogglePin(LED4_GPIO_Port, LED4_Pin); }
    }
    else
    {
      HAL_GPIO_WritePin(LED1_GPIO_Port, LED1_Pin, GPIO_PIN_RESET);
      HAL_GPIO_WritePin(LED2_GPIO_Port, LED2_Pin, GPIO_PIN_RESET);
      HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_RESET);
    }

    if (led3_pulse_until)
    {
      if (now >= led3_pulse_until) { led3_pulse_until = 0; HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_RESET); }
    }

    if(lora_ready)
    {
      lora_ready = 0;
      char buf[LBUF]; size_t n=0;
      while(n<LBUF-1){ char c=lora_line[n]; buf[n]=c; if(!c) break; n++; }
      buf[LBUF-1]=0;

      if(VERBOSE){ vdbg("LORA RX: "); vdbg(buf); vdbg("\r\n"); }

      if(!strncmp(buf,"MODE=0",6)) { op_mode = 0; if(VERBOSE) vdbg("MODE:0\r\n"); }
      else if(!strncmp(buf,"MODE=1",6)) { op_mode = 1; if(VERBOSE) vdbg("MODE:1\r\n"); leds_all_off(); led3_pulse_until = 0; HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_RESET); HAL_GPIO_WritePin(LED4_GPIO_Port, LED4_Pin, GPIO_PIN_RESET); }
      else
      {
        int cmd=-1;
        for(char* p=buf; *p; ++p){ if(isdigit((unsigned char)*p)){ cmd = (*p - '0'); break; } }
        if(op_mode==1)
        {
          if(cmd>=0 && cmd<=4){ leds_apply_cmd((uint8_t)cmd); }
          else { vdbg("LED CMD:IGNORED\r\n"); }
        }
        else
        {
          if(cmd==0){ leds_all_off(); vdbg("LED SET:0\r\n"); }
        }
      }
    }
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

  HAL_PWREx_ControlVoltageScaling(PWR_REGULATOR_VOLTAGE_SCALE1);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSIDiv = RCC_HSI_DIV1;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) { Error_Handler(); }

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK) { Error_Handler(); }
}

/* USER CODE BEGIN 4 */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if(huart == &huart1)
  {
    char c = (char)lora_rx_byte;
    if(!lora_ready)
    {
      if(c=='\n' || c=='\r')
      {
        if(lora_len>0){ lora_line[lora_len]=0; lora_ready=1; lora_len=0; }
      }
      else if(lora_len < LBUF-1)
      {
        lora_line[lora_len++] = c;
      }
      else
      {
        lora_len = 0;
      }
    }
    StartLoRaRxIT();
  }
  else if(huart == &hlpuart1)
  {
    char c = (char)gps_rx_byte;
    gps_byte_count++;
    if(!gps_ready)
    {
      if(gps_lp == 0){
        if(c == '$'){ ((volatile char*)gps_line)[gps_lp++] = c; }
      } else {
        if(c=='\n' || c=='\r')
        {
          ((volatile char*)gps_line)[gps_lp]=0; gps_ready=1; gps_lp=0;
          if (op_mode == 0) { led3_pulse_until = HAL_GetTick() + 120; HAL_GPIO_WritePin(LED3_GPIO_Port, LED3_Pin, GPIO_PIN_SET); }
        }
        else if(gps_lp < GPS_LINE_MAX-1)
        {
          ((volatile char*)gps_line)[gps_lp++] = c;
        }
        else
        {
          gps_lp = 0;
        }
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
void assert_failed(uint8_t *file, uint32_t line)
{
}
#endif /* USE_FULL_ASSERT */
