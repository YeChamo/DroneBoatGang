import React, { useState, useRef, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get('window');

const LeafletMap = ({ latitude = 36.0687, longitude = -94.1748 }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
            crossorigin=""/>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; width: 100%; }
        #map { height: 100vh; width: 100vw; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
              integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
              crossorigin=""></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          try {
            const map = L.map('map', {
              zoomControl: false,
              attributionControl: false
            }).setView([${latitude}, ${longitude}], 16);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 50,
              attribution: ''
            }).addTo(map);

            L.marker([${latitude}, ${longitude}])
              .addTo(map)
              .bindPopup('Boat Location')
              .openPopup();

            console.log('Map loaded successfully');
          } catch (error) {
            console.error('Map loading error:', error);
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      scalesPageToFit={true}
      mixedContentMode="compatibility"
      allowsInlineMediaPlayback={true}
      style={{ width: '100%', height: '100%' }}
      onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('WebView error: ', nativeEvent);
      }}
      onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('WebView HTTP error: ', nativeEvent);
      }}
    />
  );
};

const App = () => {
  const [isToggled, setIsToggled] = useState(false);
  const [showControlScreen, setShowControlScreen] = useState(false);

  const handleToggle = () => setIsToggled(prev => !prev);

  useEffect(() => {
    if (showControlScreen) {
      Orientation.lockToLandscape();
    } else {
      Orientation.lockToPortrait();
    }
  }, [showControlScreen]);

  return (
    <SafeAreaView style={styles.container}>
      {showControlScreen ? (
        // Control Screen
        <View style={styles.controlOverlay}>
          <Text style={styles.title}>Boat Control</Text>
          <Pressable
            style={[styles.button, { marginTop: 30 }]}
            onPress={() => setShowControlScreen(false)}
          >
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        // Main Screen
        <>
          <Text style={styles.title}>Drone Boat App</Text>
          <View style={styles.centerContent}>
            <View style={styles.radarWrapper}>
              <LeafletMap latitude={36.0687} longitude={-94.1748} />
              <View style={styles.radarFrame}>
              </View>
            </View>

            <Text style={styles.bluetooth}>Bluetooth</Text>
            <Pressable
              onPress={handleToggle}
              style={[styles.button, { backgroundColor: isToggled ? 'blue' : 'grey' }]}
            >
              <Text style={styles.buttonText}>{isToggled ? 'ON' : 'OFF'}</Text>
            </Pressable>

            {isToggled && (
              <Pressable
                onPress={() => setShowControlScreen(true)}
                style={[styles.button, { marginTop: 20, backgroundColor: '#006400' }]}
              >
                <Text style={styles.buttonText}>Go to Control Screen</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
    </SafeAreaView>

  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6f2e6',
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 25,
    color: '#004d00',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarWrapper: {
    width: 250,
    height: 250,
    borderRadius: 125,
    overflow: 'hidden',
    marginBottom: 40,
  },
  radarFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: '#006400',
    backgroundColor: 'rgba(0,100,0,0.1)',
  },
  bluetooth: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controlOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#d9f2d9',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  controlButtons: {
    marginTop: 30,
    width: '100%',
    alignItems: 'center',
  },


});

export default App;