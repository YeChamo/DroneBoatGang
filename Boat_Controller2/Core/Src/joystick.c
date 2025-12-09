/* joystick.c - Analog joystick controller for thrust and rudder control */
#include "joystick.h"
#include "lora.h"
#include "bluetooth.h"
#include <stdio.h>
#include <stdlib.h>

/* Controller state tracking */
static int16_t last_thrust = -1;              /* -1 = not initialized */
static uint8_t last_rudder = 50;              /* Center = 50 */
static uint32_t last_thrust_send_ms = 0;
static uint32_t last_rudder_send_ms = 0;
static uint32_t last_joystick_activity = 0;  /* Track when joystick was last moved */

#define JOYSTICK_TIMEOUT_MS  2000  /* Controller inactive after 2 seconds of no movement */

/**
  * @brief Read ADC value from specified channel
  * @param channel: ADC channel to read (e.g., ADC_CHANNEL_6)
  * @retval ADC value (0-4095 for 12-bit ADC)
  */
uint16_t joystick_read_adc(uint32_t channel) {
  ADC_ChannelConfTypeDef sConfig = {0};

  /* Configure the selected channel */
  sConfig.Channel = channel;
  sConfig.Rank = 1;

  hadc.Instance->CHSELR = 0;
  if(HAL_ADC_ConfigChannel(&hadc, &sConfig) != HAL_OK) {
    return ADC_CENTER_VALUE; /* Return center value on error */
  }

  /* Perform ADC conversion */
  HAL_ADC_Start(&hadc);

  if(HAL_ADC_PollForConversion(&hadc, 100) == HAL_OK) {
    uint16_t adc_value = HAL_ADC_GetValue(&hadc);
    HAL_ADC_Stop(&hadc);
    return adc_value;
  }

  HAL_ADC_Stop(&hadc);
  return ADC_CENTER_VALUE; /* Return center value on timeout */
}

/**
  * @brief Process thrust joystick (Left Y-axis)
  * Maps joystick position to thrust percentage in 10% increments
  * @retval Thrust value (0, 10, 20, 30, 40, 50, 60, 70, 80, 90, or 100)
  */
static uint8_t process_thrust(void) {
  uint16_t adc_value = joystick_read_adc(ADC_CHANNEL_THRUST);

  /* Apply deadband around center - no thrust when stick is centered or pulled back */
  if(adc_value >= (ADC_CENTER_VALUE - THRUST_DEADBAND)) {
    return 0;
  }

  /* Calculate thrust from center to max forward position
   * ADC range: 0 (max forward) to ~2048 (center) to 4095 (max back)
   * We only use 0 to center-deadband for thrust */
  int16_t range_from_center = (ADC_CENTER_VALUE - THRUST_DEADBAND) - adc_value;
  int16_t total_range = 4095 - (ADC_CENTER_VALUE + THRUST_DEADBAND);

  /* Map to 0-100 percentage */
  uint8_t thrust_raw = (uint8_t)(((uint32_t)range_from_center * 100) / total_range);

  /* Clamp to valid range */
  if(thrust_raw > 100) thrust_raw = 100;

  /* Round to nearest 10% sector for smoother control */
  uint8_t thrust_sector = ((thrust_raw + 5) / 10) * 10;
  if(thrust_sector > 100) thrust_sector = 100;

  return thrust_sector;
}

/**
  * @brief Process rudder joystick (Right X-axis)
  * Maps joystick position to rudder angle percentage
  * @retval Rudder value (0=full left, 50=center, 100=full right)
  */
static uint8_t process_rudder(void) {
  uint16_t adc_value = joystick_read_adc(ADC_CHANNEL_RUDDER);

  /* Apply deadband around center position */
  if(abs((int16_t)adc_value - ADC_CENTER_VALUE) < RUDDER_DEADBAND) {
    return 50; /* Center position */
  }

  /* Map full ADC range (0-4095) to rudder range (0-100)
   * 0 = full left, 50 = center, 100 = full right */
  uint8_t rudder = (uint8_t)(((uint32_t)adc_value * 100) / 4095);

  /* Clamp to valid range */
  if(rudder > 100) rudder = 100;
  if(rudder < 0) rudder = 0;

  return rudder;
}

/**
  * @brief Send combined thrust and rudder command over LoRa
  * @param rudder: Rudder value (0-100)
  * @param thrust: Thrust value (0-100)
  */
static void send_together(uint8_t rudder, uint8_t thrust) {
  char payload[32];
  snprintf(payload, sizeof(payload), "CTRL,%u,%u", (unsigned)thrust, (unsigned)rudder);
  lora_send_payload(payload);
}

/**
  * @brief Initialize joystick module
  */
void joystick_init(void) {
  last_thrust = -1;
  last_rudder = 50;  /* Center */
  last_thrust_send_ms = 0;
  last_rudder_send_ms = 0;
}

/**
  * @brief Check if joystick is actively being used
  * @retval 1 if controller active (moved within timeout), 0 if inactive
  */
uint8_t joystick_is_active(void) {
  uint32_t now = HAL_GetTick();
  return (now - last_joystick_activity) < JOYSTICK_TIMEOUT_MS;
}

/**
  * @brief Joystick periodic task - reads and transmits controller state
  * Call from main loop
  */
void joystick_task(void) {
  uint32_t now = HAL_GetTick();

  /* Send controller updates every 200ms */
  if(now - last_thrust_send_ms >= THRUST_UPDATE_MS) {
    uint8_t current_thrust = process_thrust();
    uint8_t current_rudder = process_rudder();

    /* Update activity timestamp if joystick is moved from center */
    if(current_thrust != 0) {
      last_joystick_activity = now;
    }

    if(current_rudder != 50) {
      last_joystick_activity = now;
    }

    /* Send combined control command */
    send_together(current_rudder, current_thrust);
    
    last_thrust = current_thrust;
    last_rudder = current_rudder;
    last_thrust_send_ms = now;
  }
}