/* joystick.h - Analog joystick controller interface */
#ifndef __JOYSTICK_H
#define __JOYSTICK_H

#include "main.h"
#include <stdint.h>

/* ADC channel assignments for joystick axes */
#define ADC_CHANNEL_THRUST  ADC_CHANNEL_9   /* PA7 - Left Joystick Y (thrust) */
#define ADC_CHANNEL_RUDDER  ADC_CHANNEL_6   /* PB0 - Right Joystick X (steering) */

/* ADC parameters for 12-bit resolution */
#define ADC_CENTER_VALUE    2048            /* Center position value */
#define ADC_MAX_VALUE       4095            /* Maximum ADC reading */
#define THRUST_DEADBAND     100             /* Deadband around center for thrust */
#define RUDDER_DEADBAND     100             /* Deadband around center for rudder */

/* Control value ranges */
#define THRUST_MIN          0               /* Minimum thrust percentage */
#define THRUST_MAX          100             /* Maximum thrust percentage */
#define RUDDER_MIN          0               /* Minimum rudder value (full left) */
#define RUDDER_MAX          100             /* Maximum rudder value (full right) */

/* Update timing */
#define RUDDER_UPDATE_MS    200             /* Send rudder update every 200ms */
#define THRUST_UPDATE_MS    200             /* Send thrust update every 200ms */

/**
  * @brief Initialize joystick module
  */
void joystick_init(void);

/**
  * @brief Joystick periodic task - read and transmit controller state
  */
void joystick_task(void);

/**
  * @brief Read ADC value from specified channel
  * @param channel: ADC channel to read
  * @retval ADC value (0-4095)
  */
uint16_t joystick_read_adc(uint32_t channel);

/**
  * @brief Check if joystick controller is actively being used
  * @retval 1 if controller active, 0 if inactive/timed out
  */
uint8_t joystick_is_active(void);

/**
  * @brief Read boat selector switch state
  * @retval Boat number (0-7)
  */
uint8_t joystick_read_boat_selector(void);

#endif /* __JOYSTICK_H */

