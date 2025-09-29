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

const LeafletMap = ({ latitude = 36.0687, longitude = -94.1748, interactive = true }) => {
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
              zoomControl: ${interactive},
              attributionControl: false,
              dragging: ${interactive},
              touchZoom: ${interactive},
              scrollWheelZoom: ${interactive},
              doubleClickZoom: ${interactive},
              boxZoom: ${interactive}
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
      scrollEnabled={interactive}
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
  const [activeTab, setActiveTab] = useState('bluetooth');
  const [isConnected, setIsConnected] = useState(false);
  const [showControlScreen, setShowControlScreen] = useState(false);
  const [sliderValue, setSliderValue] = useState(3);

  useEffect(() => {
    if (showControlScreen) {
      Orientation.lockToLandscape();
    } else {
      Orientation.lockToPortrait();
    }
  }, [showControlScreen]);

  const renderBluetoothScreen = () => (
    <View style={styles.screenContent}>
      <Text style={styles.screenTitle}>BLUETOOTH</Text>
      <View style={styles.centerArea}>
        <Pressable
          onPress={() => setIsConnected(!isConnected)}
          style={styles.connectButton}
        >
          <Text style={styles.connectButtonText}>Connect Device</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderMapScreen = () => (
    <View style={styles.screenContent}>
      <Text style={styles.screenTitle}>CONTROL</Text>
      <View style={styles.mapContainer}>
        <View style={styles.squareMapWrapper}>
          <LeafletMap latitude={36.0687} longitude={-94.1748} interactive={false} />
        </View>

        <View style={styles.controlsRow}>
          <Pressable style={styles.recallButton}>
            <Text style={styles.recallButtonText}>Recall</Text>
          </Pressable>

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>Boats: {sliderValue}</Text>
            <View style={styles.sliderWrapper}>
              <Pressable
                style={styles.sliderButton}
                onPress={() => setSliderValue(Math.max(1, sliderValue - 1))}
              >
                <Text style={styles.sliderButtonText}>-</Text>
              </Pressable>

              <View style={styles.speedIndicator}>
                {[1, 2, 3, 4, 5].map((val) => (
                  <View
                    key={val}
                    style={[
                      styles.speedDot,
                      val <= sliderValue && styles.speedDotActive
                    ]}
                  />
                ))}
              </View>

              <Pressable
                style={styles.sliderButton}
                onPress={() => setSliderValue(Math.min(5, sliderValue + 1))}
              >
                <Text style={styles.sliderButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.joystickContainer}>
          <View style={styles.joystickWrapper}>
            <View style={styles.joystickOuter}>
              <View style={styles.joystickInner} />
            </View>
          </View>
          <View style={styles.joystickWrapper}>
            <View style={styles.joystickOuter}>
              <View style={styles.joystickInner} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderLocationScreen = () => (
    <View style={styles.screenContent}>
      <Text style={styles.screenTitle}>MAP</Text>
      <View style={styles.fullMapContainer}>
        <LeafletMap latitude={36.0687} longitude={-94.1748} interactive={true} />
      </View>
    </View>
  );

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
        <>
          {/* Main Content Area */}
          <View style={styles.mainContent}>
            {activeTab === 'bluetooth' && renderBluetoothScreen()}
            {activeTab === 'map' && renderMapScreen()}
            {activeTab === 'location' && renderLocationScreen()}
          </View>

          {/* Bottom Navigation */}
          <View style={styles.bottomNav}>
            <Pressable
              style={styles.navButton}
              onPress={() => setActiveTab('bluetooth')}
            >
              <View style={styles.iconContainer}>
                <Text style={[styles.navIcon, activeTab === 'bluetooth' && styles.activeNavIcon]}>
                  ᛒ
                </Text>
              </View>
              {activeTab === 'bluetooth' && <View style={styles.activeIndicator} />}
            </Pressable>

            <Pressable
              style={styles.navButton}
              onPress={() => setActiveTab('map')}
            >
              <View style={styles.iconContainer}>
                <View style={[styles.circleIcon, activeTab === 'map' && styles.activeCircleIcon]} />
              </View>
              {activeTab === 'map' && <View style={styles.activeIndicator} />}
            </Pressable>

            <Pressable
              style={styles.navButton}
              onPress={() => setActiveTab('location')}
            >
              <View style={styles.iconContainer}>
                <View style={styles.mapPinIcon}>
                  <View style={[
                    styles.mapPinCircle,
                    activeTab === 'location' && { borderColor: '#000' }
                  ]} />
                  <View style={[
                    styles.mapPinPoint,
                    activeTab === 'location' && { borderTopColor: '#000' }
                  ]} />
                </View>
              </View>
              {activeTab === 'location' && <View style={styles.activeIndicator} />}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mainContent: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    backgroundColor: 'white',
    paddingTop: 20,
  },
  screenTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#333',
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 25,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 5,
  },
  squareMapWrapper: {
    width: width - 30,
    height: width - 30,
    maxWidth: 400,
    maxHeight: 400,
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '90%',
    marginTop: 15,
    paddingHorizontal: 10,
  },
  recallButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  recallButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sliderContainer: {
    flex: 1,
    marginLeft: 15,
  },
  sliderLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
    textAlign: 'center',
  },
  sliderWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButton: {
    width: 30,
    height: 30,
    backgroundColor: '#007AFF',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  speedIndicator: {
    flexDirection: 'row',
    marginHorizontal: 10,
    gap: 6,
  },
  speedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D3D3D3',
  },
  speedDotActive: {
    backgroundColor: '#007AFF',
  },
  sliderEndLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  joystickContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 40,
    marginTop: 'auto',
    marginBottom: 20,
  },
  joystickWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  joystickInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#666',
  },
  locationText: {
    fontSize: 18,
    color: '#666',
  },
  fullMapContainer: {
    flex: 1,
    width: '100%',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 10,
    paddingBottom: 20,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navIcon: {
    fontSize: 28,
    color: '#999',
  },
  activeNavIcon: {
    color: '#000',
  },
  circleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#999',
  },
  activeCircleIcon: {
    borderColor: '#000',
  },
  mapPinIcon: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  mapPinCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#999',
  },
  mapPinPoint: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#999',
    marginTop: -2,
  },
  activeMapPinIcon: {
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -12,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'red',
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
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    backgroundColor: '#006400',
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
});

export default App;