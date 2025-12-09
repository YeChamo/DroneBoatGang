/* gps.c - GPS receiver handler with NMEA parsing */
#include "gps.h"
#include "bluetooth.h"
#include "lora.h"
#include "main.h"
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#define GPS_LINE_MAX 128

/* Global GPS data available to other modules */
GPSData_t received_gps = {0};

/* GPS receive state */
static uint8_t gps_rx_byte;
static volatile char gps_line[GPS_LINE_MAX];
static volatile size_t gps_lp = 0;
static volatile uint8_t gps_ready = 0;

/* Button debouncing state */
static uint8_t last_button_state = 0;

/**
  * @brief Validate NMEA sentence checksum
  * @param s: NMEA sentence string (e.g., "$GPRMC,...*4F")
  * @retval 1 if checksum valid, 0 otherwise
  */
static int gps_validate_checksum(const char* s) {
    if(!s || s[0] != '$') return 0;
    
    const char* star = strrchr(s, '*');
    if(!star || star - s < 2) return 0;
    
    /* Calculate XOR checksum of characters between $ and * */
    uint8_t x = 0;
    for(const char* p = s + 1; p < star; ++p) {
        x ^= (uint8_t)(*p);
    }
    
    /* Parse hex checksum after * */
    uint8_t h = (uint8_t)((star[1] >= 'A' && star[1] <= 'F') ? 10 + star[1] - 'A' :
                           (star[1] >= 'a' && star[1] <= 'f') ? 10 + star[1] - 'a' : 
                           star[1] - '0');
    uint8_t l = (uint8_t)((star[2] >= 'A' && star[2] <= 'F') ? 10 + star[2] - 'A' :
                           (star[2] >= 'a' && star[2] <= 'f') ? 10 + star[2] - 'a' : 
                           star[2] - '0');
    
    return x == ((h << 4) | l);
}

/**
  * @brief Convert NMEA DDMM.MMMM format to decimal degrees
  * @param ddmm: Coordinate string in DDMM.MMMM format
  * @param hemi: Hemisphere character (N/S/E/W)
  * @param out: Pointer to output float value
  * @retval 1 if successful, 0 on error
  */
static int gps_parse_ddmm_to_float(const char* ddmm, const char* hemi, float* out) {
    if(!ddmm || !*ddmm || !out) return 0;
    
    double v = atof(ddmm);
    int deg = (int)(v / 100.0);
    double minutes = v - (deg * 100.0);
    double val = deg + minutes / 60.0;
    
    /* Apply negative sign for South or West */
    if(hemi && (*hemi == 'S' || *hemi == 'W')) {
        val = -val;
    }
    
    *out = (float)val;
    return 1;
}

/**
  * @brief Parse GPRMC/GNRMC NMEA sentence and update GPS data
  * @param buf: NMEA sentence buffer
  */
static void gps_parse_rmc(char* buf) {
    if(!gps_validate_checksum(buf)) return;
    
    /* Strip line endings */
    for(char* q = buf; *q; ++q) {
        if(*q == '\r' || *q == '\n') *q = 0;
    }
    
    /* Tokenize comma-separated values */
    char* toks[16] = {0}; 
    int nt = 0;
    for(char* t = strtok(buf, ","); t && nt < 16; t = strtok(NULL, ",")) {
        toks[nt++] = t;
    }
    
    if(nt < 7) return;
    
    /* Verify sentence type */
    if(strncmp(toks[0], "$GPRMC", 6) != 0 && strncmp(toks[0], "$GNRMC", 6) != 0) {
        return;
    }

    /* Parse RMC fields: status, lat, N/S, lon, E/W */
    const char* status = toks[2];
    const char* lat = toks[3]; 
    const char* ns = toks[4];
    const char* lon = toks[5]; 
    const char* ew = toks[6];
    
    /* Check if fix is valid (A = active, V = void) */
    if(!status || (*status != 'A' && *status != 'a')) { 
        received_gps.valid = 0; 
        return; 
    }

    /* Convert coordinates to decimal degrees */
    float latitude = 0, longitude = 0;
    if(!gps_parse_ddmm_to_float(lat, ns, &latitude)) return;
    if(!gps_parse_ddmm_to_float(lon, ew, &longitude)) return;

    /* Update global GPS data */
    received_gps.latitude = latitude;
    received_gps.longitude = longitude;
    received_gps.valid = 1;
    received_gps.last_update_ms = HAL_GetTick();
}

/**
  * @brief Check if GPS button is pressed (with debouncing)
  * @retval 1 on button press (rising edge), 0 otherwise
  */
uint8_t gps_button_pressed(void) {
    uint8_t current_state = HAL_GPIO_ReadPin(GPS_BUTTON_PORT, GPS_BUTTON_PIN);

    /* Detect rising edge (button press) */
    if(current_state == GPIO_PIN_SET && last_button_state == GPIO_PIN_RESET) {
        last_button_state = current_state;
        HAL_Delay(20); /* Simple debounce delay */
        return 1;
    }

    last_button_state = current_state;
    return 0;
}

/**
  * @brief GPS periodic task - parse received sentences and handle button
  * Call from main loop
  */
void gps_task(void) {
    if(!gps_ready) return;
    
    /* Copy line to local buffer and process */
    char buf[GPS_LINE_MAX];
    strncpy(buf, (char*)gps_line, GPS_LINE_MAX - 1);
    buf[GPS_LINE_MAX - 1] = 0;
    gps_ready = 0;

    /* Parse RMC sentences (position and time) */
    if(strncmp(buf, "$GPRMC", 6) == 0 || strncmp(buf, "$GNRMC", 6) == 0) {
        gps_parse_rmc(buf);
    }

    /* Send GPS over LoRa when button is pressed */
    if(gps_button_pressed() && received_gps.valid) {
        char payload[64];
        int n = snprintf(payload, sizeof(payload), "GPS,%.6f,%.6f",
                         received_gps.latitude, received_gps.longitude);
        if(n > 0) {
            lora_send_payload(payload);
        }
    }
}

/**
  * @brief Start GPS UART receive interrupt
  */
void StartGPSRxIT(void) {
    HAL_UART_Receive_IT(&huart2, &gps_rx_byte, 1);
}

/**
  * @brief UART receive callback for GPS
  * Accumulates NMEA sentence from $ to line ending
  */
void gps_rx_callback(void) {
    char c = (char)gps_rx_byte;
    
    if(!gps_ready) {
        if(gps_lp == 0 && c == '$') {
            /* Start of NMEA sentence */
            gps_line[gps_lp++] = c;
        }
        else if(c == '\n' || c == '\r') {
            /* End of sentence */
            gps_line[gps_lp] = 0;
            gps_ready = 1;
            gps_lp = 0;
        }
        else if(gps_lp < GPS_LINE_MAX - 1) {
            /* Accumulate sentence characters */
            gps_line[gps_lp++] = c;
        }
        else {
            /* Buffer overflow - reset */
            gps_lp = 0;
        }
    }
    
    StartGPSRxIT();
}
