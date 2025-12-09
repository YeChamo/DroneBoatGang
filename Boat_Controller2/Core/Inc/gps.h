/* gps.h - GPS receiver interface with NMEA parsing */
#ifndef __GPS_H
#define __GPS_H

#include "main.h"
#include <stdint.h>

/**
  * @brief GPS data structure
  * Contains current position and validity status
  */
typedef struct {
  uint8_t valid;              /* 1 if GPS fix is valid, 0 otherwise */
  float latitude;             /* Latitude in decimal degrees */
  float longitude;            /* Longitude in decimal degrees */
  uint32_t last_update_ms;    /* Timestamp of last GPS update */
} GPSData_t;

/* Global GPS data - updated by GPS parser, read by other modules */
extern GPSData_t received_gps;

/* GPIO definitions for GPS button */
#define GPS_BUTTON_PORT GPIOB
#define GPS_BUTTON_PIN  GPIO_PIN_4

/**
  * @brief Start GPS UART receive interrupt
  */
void StartGPSRxIT(void);

/**
  * @brief GPS periodic task - parse NMEA and handle button
  */
void gps_task(void);

/**
  * @brief UART receive callback for GPS
  */
void gps_rx_callback(void);

/**
  * @brief Check if GPS button is pressed
  * @retval 1 on button press (rising edge), 0 otherwise
  */
uint8_t gps_button_pressed(void);

#endif /* __GPS_H */