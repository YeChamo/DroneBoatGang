/*
 * RC Drone Boat – STM32 Firmware
 *
 * - Reads GPS NMEA sentences from UART3
 * - Parses $GPRMC/$GNRMC and validates NMEA checksum
 * - Sends GPS coordinates over LoRa (UART4) as "GPS,<lat>,<lon>"
 * - Receives control packets "CTRL,<thr>,<rud>" over LoRa
 * - Drives throttle (TIM3 CH1) and rudder servo (TIM1 CH1) via 50 Hz PWM
 *
 * Main loop is interrupt-driven:
 *  - UART RX callbacks assemble lines for GPS and LoRa
 *  - On complete line, handlers parse and update PWM or transmit GPS
 */

#include "main.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>


// UART3: GPS
// UART4: LoRa module

UART_HandleTypeDef huart3;
UART_HandleTypeDef huart4;



// PWM timers
// TIM1: rudder
// TIM3: throttle
TIM_HandleTypeDef htim1;
TIM_HandleTypeDef htim3;

uint8_t gps_rx;
char gps_line[128];
uint8_t gps_pos = 0;

uint8_t lora_rx;
char lora_line[128];
uint8_t lora_pos = 0;

void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART3_UART_Init(void);
static void MX_UART4_Init(void);
static void MX_TIM1_Init(void);
static void MX_TIM3_Init(void);

static inline uint32_t pct_to_us(uint8_t pct)
{
    if (pct > 100) pct = 100;
    return 1000 + (pct * 10);
}

static void LoRa_Send(const char *s)
{
    HAL_UART_Transmit(&huart4, (uint8_t*)s, strlen(s), 20);
    HAL_UART_Transmit(&huart4, (uint8_t*)"\r\n", 2, 20);
}

static void LoRa_AT(const char *cmd)
{
    LoRa_Send(cmd);
}

static void LoRa_SendGPS(float lat, float lon)
{
    char payload[64];
    snprintf(payload, sizeof(payload), "GPS,%.6f,%.6f", lat, lon);

    char cmd[96];
    snprintf(cmd, sizeof(cmd), "AT+SEND=2,%u,%s",
             (unsigned)strlen(payload),
             payload);

    LoRa_Send(cmd);
}


/**
 * @brief Verify NMEA checksum.
 * @param s  NMEA sentence string, e.g. "$GPRMC,...*CS"
 * @return 1 if checksum is valid, 0 otherwise.
 */
static int gps_checksum_ok(const char *s)
{
    if (!s || s[0] != '$') return 0;

    char *star = strrchr(s, '*');
    if (!star) return 0;

    uint8_t x = 0;
    for (const char *p = s + 1; p < star; p++) x ^= *p;

    unsigned char h = (unsigned char)star[1];
    unsigned char l = (unsigned char)star[2];

    uint8_t hi = isalpha(h) ? 10 + (toupper(h) - 'A') : (h - '0');
    uint8_t lo = isalpha(l) ? 10 + (toupper(l) - 'A') : (l - '0');

    return x == ((hi << 4) | lo);
}

/**
 * @brief Convert NMEA DDMM.MMMM format to signed degrees (float).
 * @param ddmm  Latitude/longitude component in DDMM.MMMM
 * @param hemi  'N','S','E','W' for hemisphere
 * @param out   Output float degrees (e.g. 36.123456)
 * @return 1 on success.
 */
static int gps_ddmm_to_e7(const char *ddmm, const char *hemi, float *out)
{
    double v = atof(ddmm);
    int deg = v / 100;
    double minutes = v - deg * 100;
    double f = deg + minutes / 60.0;

    if (*hemi == 'S' || *hemi == 'W')
        f = -f;
    *out = (float)f;
    return 1;
}

static void GPS_Parse(char *line)
{
    if (strncmp(line, "$GPRMC", 6) != 0 &&
        strncmp(line, "$GNRMC", 6) != 0)
        return;

    if (!gps_checksum_ok(line))
        return;

    char *tok[16] = {0};
    int n = 0;
    char *p = strtok(line, ",");

    while (p && n < 16)
    {
        tok[n++] = p;
        p = strtok(NULL, ",");
    }
    if (n < 7) return;

    if (*tok[2] != 'A') return;

    float lat, lon;
    gps_ddmm_to_e7(tok[3], tok[4], &lat);
    gps_ddmm_to_e7(tok[5], tok[6], &lon);

    LoRa_SendGPS(lat, lon);
}

static void LoRa_Handle(char *line)
{
    char *payload = line;

    if (strncmp(line, "+RCV=", 5) == 0)
    {
        int commas = 0;
        char *p = line;
        while (*p && commas < 2)
        {
            if (*p == ',') commas++;
            p++;
        }
        if (commas == 2) payload = p;
    }

    if (strncmp(payload, "CTRL,", 5) == 0)
    {
        char *p = payload + 5;
        uint8_t thr = atoi(p);

        char *comma = strchr(p, ',');
        if (!comma) return;

        uint8_t rud = atoi(comma + 1);

        __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, pct_to_us(thr));
        __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, pct_to_us(rud));
    }
}

int main(void)
{
    HAL_Init();
    SystemClock_Config();

    MX_GPIO_Init();
    MX_USART3_UART_Init();
    MX_UART4_Init();
    MX_TIM1_Init();
    MX_TIM3_Init();

    HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);
    HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);

    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, pct_to_us(50));
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, pct_to_us(0));

    HAL_UART_Receive_IT(&huart4, &lora_rx, 1);
    HAL_UART_Receive_IT(&huart3, &gps_rx, 1);

    LoRa_AT("AT+ADDRESS=1");
    HAL_Delay(50);
    LoRa_AT("AT+NETWORKID=18");
    HAL_Delay(50);
    LoRa_AT("AT+BAND=915000000");
    HAL_Delay(50);
    LoRa_AT("AT+PARAMETER=9,7,1,12");
    HAL_Delay(50);

    while (1) {}
    // Main loop does nothing; logic runs in UART RX callbacks this function HAL_UART_RxCpltCallback
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart == &huart4)
    {
        char c = (char)lora_rx;

        if (c == '\n' || c == '\r')
        {
            if (lora_pos > 0)
            {
                lora_line[lora_pos] = 0;
                LoRa_Handle(lora_line);
                lora_pos = 0;
            }
        }
        else
        {
            if (lora_pos < sizeof(lora_line) - 1)
                lora_line[lora_pos++] = c;
            else
                lora_pos = 0;
        }

        HAL_UART_Receive_IT(&huart4, &lora_rx, 1);
    }

    if (huart == &huart3)
    {
        char c = (char)gps_rx;

        if (c == '\n' || c == '\r')
        {
            if (gps_pos > 0)
            {
                gps_line[gps_pos] = 0;
                GPS_Parse(gps_line);
                gps_pos = 0;
            }
        }
        else
        {
            if (gps_pos < sizeof(gps_line) - 1)
                gps_line[gps_pos++] = c;
            else
                gps_pos = 0;
        }

        HAL_UART_Receive_IT(&huart3, &gps_rx, 1);
    }
}

static void MX_TIM1_Init(void)
{
    TIM_OC_InitTypeDef cfg = {0};

    htim1.Instance = TIM1;
    htim1.Init.Prescaler = 83;
    htim1.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim1.Init.Period = 20000 - 1;
    htim1.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim1.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    HAL_TIM_PWM_Init(&htim1);

    cfg.OCMode = TIM_OCMODE_PWM1;
    cfg.Pulse = pct_to_us(50);
    cfg.OCPolarity = TIM_OCPOLARITY_HIGH;
    cfg.OCFastMode = TIM_OCFAST_DISABLE;
    HAL_TIM_PWM_ConfigChannel(&htim1, &cfg, TIM_CHANNEL_1);

    HAL_TIM_MspPostInit(&htim1);
}

static void MX_TIM3_Init(void)
{
    TIM_OC_InitTypeDef cfg = {0};

    htim3.Instance = TIM3;
    htim3.Init.Prescaler = 83;
    htim3.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim3.Init.Period = 20000 - 1;
    htim3.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim3.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    HAL_TIM_PWM_Init(&htim3);

    cfg.OCMode = TIM_OCMODE_PWM1;
    cfg.Pulse = pct_to_us(0);
    cfg.OCPolarity = TIM_OCPOLARITY_HIGH;
    cfg.OCFastMode = TIM_OCFAST_DISABLE;
    HAL_TIM_PWM_ConfigChannel(&htim3, &cfg, TIM_CHANNEL_1);

    HAL_TIM_MspPostInit(&htim3);
}

static void MX_UART4_Init(void)
{
    huart4.Instance = UART4;
    huart4.Init.BaudRate = 115200;
    huart4.Init.WordLength = UART_WORDLENGTH_8B;
    huart4.Init.StopBits = UART_STOPBITS_1;
    huart4.Init.Parity = UART_PARITY_NONE;
    huart4.Init.Mode = UART_MODE_TX_RX;
    huart4.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart4.Init.OverSampling = UART_OVERSAMPLING_16;
    HAL_UART_Init(&huart4);
}

static void MX_USART3_UART_Init(void)
{
    huart3.Instance = USART3;
    huart3.Init.BaudRate = 9600;
    huart3.Init.WordLength = UART_WORDLENGTH_8B;
    huart3.Init.StopBits = UART_STOPBITS_1;
    huart3.Init.Parity = UART_PARITY_NONE;
    huart3.Init.Mode = UART_MODE_TX_RX;
    huart3.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart3.Init.OverSampling = UART_OVERSAMPLING_16;
    HAL_UART_Init(&huart3);
}

static void MX_GPIO_Init(void)
{
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
}
void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_Osc = {0};
    RCC_ClkInitTypeDef RCC_Clk = {0};

    RCC_Osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_Osc.HSIState = RCC_HSI_ON;
    RCC_Osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;

    RCC_Osc.PLL.PLLState = RCC_PLL_ON;
    RCC_Osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;
    RCC_Osc.PLL.PLLM = 16;
    RCC_Osc.PLL.PLLN = 336;
    RCC_Osc.PLL.PLLP = RCC_PLLP_DIV4;   // 84 MHz
    RCC_Osc.PLL.PLLQ = 7;

    if (HAL_RCC_OscConfig(&RCC_Osc) != HAL_OK)
        Error_Handler();

    RCC_Clk.ClockType = RCC_CLOCKTYPE_SYSCLK |
                        RCC_CLOCKTYPE_HCLK |
                        RCC_CLOCKTYPE_PCLK1 |
                        RCC_CLOCKTYPE_PCLK2;

    RCC_Clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_Clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
    RCC_Clk.APB1CLKDivider = RCC_HCLK_DIV2;
    RCC_Clk.APB2CLKDivider = RCC_HCLK_DIV1;

    if (HAL_RCC_ClockConfig(&RCC_Clk, FLASH_LATENCY_2) != HAL_OK)
        Error_Handler();
}

void Error_Handler(void)
{
    __disable_irq();
    while (1) {}
}
