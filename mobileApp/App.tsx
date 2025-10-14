import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Modal,
  Dimensions,
  PanResponder
} from 'react-native';
import { WebView } from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import 'react-native-gesture-handler';


const { width, height } = Dimensions.get('window');

// --- Leaflet Map Component ---
const LeafletMap = React.memo(({ onMapReady, interactive = true }) => {
  const webViewRef = useRef(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    if (mapInitialized && onMapReady && webViewRef.current) {
      onMapReady(webViewRef);
    }
  }, [mapInitialized]);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body { height:100%; margin:0; padding:0; }
    #map { height:100%; width:100%; }
    .boat-marker {
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-bottom: 40px solid #4285F4;
      transform-origin: 50% 75%;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    let map, boatMarker;

    function initMap() {
      map = L.map('map', {
        zoomControl: ${interactive},
        dragging: ${interactive},
        touchZoom: ${interactive},
        scrollWheelZoom: ${interactive},
        doubleClickZoom: ${interactive}
      }).setView([36.0687, -94.1748], 17);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

      const boatIcon = L.divIcon({
        className: '',
        html: '<div class="boat-marker"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 20],
      });

      boatMarker = L.marker([36.0687, -94.1748], { icon: boatIcon }).addTo(map);

      window.updateBoat = (lat, lng, heading) => {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
          console.error('Invalid coordinates:', lat, lng);
          return;
        }
        boatMarker.setLatLng([lat, lng]);
        const el = boatMarker.getElement();
        if (el) {
          const marker = el.querySelector('.boat-marker');
          if (marker) {
            marker.style.transform = 'rotate(' + heading + 'deg)';
          }
        }
        map.setView([lat, lng], map.getZoom(), { animate: false });
      };

      window.ReactNativeWebView.postMessage('mapReady');
    }

    initMap();
  </script>
</body>
</html>
`;

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      style={{ flex: 1 }}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'mapReady') setMapInitialized(true);
      }}
    />
  );
});


// --- Joystick Component ---
const Joystick = ({ onMove, size = 120, axis = 'both' }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const maxDistance = size / 2 - 30;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        let x = gestureState.dx;
        let y = gestureState.dy;

        if (axis === 'vertical') {
          x = 0; //
          y = Math.max(-maxDistance, Math.min(maxDistance, y));
        } else if (axis === 'horizontal') {
          y = 0; //
          x = Math.max(-maxDistance, Math.min(maxDistance, x));
        } else {
          const distance = Math.sqrt(x * x + y * y);
          if (distance > maxDistance) {
            const angle = Math.atan2(y, x);
            x = Math.cos(angle) * maxDistance;
            y = Math.sin(angle) * maxDistance;
          }
        }

        setPosition({ x, y });

        const normalizedX = x / maxDistance;
        const normalizedY = y / maxDistance;

        onMove(normalizedX, normalizedY);
      },
      onPanResponderRelease: () => {
        setPosition({ x: 0, y: 0 });
        onMove(0, 0);
      },
    })
  ).current;

  return (
    <View style={styles.joystickArea}>
      <View style={[styles.joystickOuter, { width: size, height: size, borderRadius: size / 2 }]}>
        <View
          {...panResponder.panHandlers}
          style={[
            styles.joystickInner,
            {
              transform: [{ translateX: position.x }, { translateY: position.y }],
            },
          ]}
        />
      </View>
    </View>
  );
};

// --- Main App Component ---
const App = () => {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [activeTab, setActiveTab] = useState('bluetooth');
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [markerPosition, setMarkerPosition] = useState({
    latitude: 36.0687,
    longitude: -94.1748,
    heading: 0
  });


  const [leftJoystick, setLeftJoystick] = useState({ x: 0, y: 0 });
  const [rightJoystick, setRightJoystick] = useState({ x: 0, y: 0 });


  const mapRef = useRef(null);
  const [mapInitialized, setMapInitialized] = useState(false);


  useEffect(() => {
    const timer = setTimeout(() => setShowSplashScreen(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (activeTab === 'control') {
      Orientation.lockToLandscape();
    } else {
      Orientation.lockToPortrait();
    }
    return () => {
      Orientation.lockToPortrait();
    };
  }, [activeTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      if ((leftJoystick.y !== 0 || rightJoystick.x !== 0) && mapRef.current && mapInitialized) {
        setMarkerPosition(prev => {
          // SPEEDS
          const moveSpeed = 0.00005; // How fast boat moves
          const rotationSpeed = 5;   // How fast boat rotates

          // RIGHT JOYSTICK:
          const newHeading = (prev.heading + rightJoystick.x * rotationSpeed + 360) % 360;

          // LEFT JOYSTICK:
          let newLat = prev.latitude;
          let newLng = prev.longitude;


          if (leftJoystick.y !== 0) {
            const headingRad = (prev.heading * Math.PI) / 180;

            const moveDistance = -leftJoystick.y * moveSpeed;

            newLat = prev.latitude + Math.cos(headingRad) * moveDistance;
            newLng = prev.longitude + Math.sin(headingRad) * moveDistance;
          }

          if (mapRef.current && mapInitialized) {
            mapRef.current.injectJavaScript(
              `window.updateBoat(${newLat}, ${newLng}, ${newHeading}); true;`
            );
          }

          return {
            latitude: newLat,
            longitude: newLng,
            heading: newHeading
          };
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [leftJoystick, rightJoystick, mapInitialized]);

  const handleMapReady = (ref) => {
    mapRef.current = ref.current;
    // Give the map a moment to fully initialize
    setTimeout(() => {
      setMapInitialized(true);
      // Initialize the marker at the correct position
      if (ref.current) {
        ref.current.injectJavaScript(
          `window.updateBoat(${markerPosition.latitude}, ${markerPosition.longitude}, ${markerPosition.heading}); true;`
        );
      }
    }, 500);
  };

  // --- Screens ---
  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashText}>RC Drone Boat ⚓</Text>
    </View>
  );

  const renderBluetoothScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>BLUETOOTH</Text>
      <View style={styles.centeredContent}>
        <Pressable style={styles.connectButton}>
          <Text style={styles.connectButtonText}>Connect Device</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderControlScreen = () => (
    <View style={styles.screenContainer}>
      {/* Header */}
      <View style={styles.controlHeader}>
        <Pressable onPress={() => setShowSettings(true)}>
          <Text style={styles.headerIcon}>⚙</Text>
        </Pressable>
        <Pressable style={styles.returnButton}>
          <Text style={styles.returnButtonText}>Return Boats</Text>
        </Pressable>
      </View>

      {/* Main Control Area */}
      <View style={styles.controlBody}>
        {/* Left Joystick (Up/Down) */}
        <Joystick
          onMove={(x, y) => setLeftJoystick({ x, y })}
          size={120}
          axis="vertical"
        />

        {/* Center Content */}
        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap
              interactive={false}
              onMapReady={handleMapReady}
            />
          </View>
          <Pressable style={styles.selectBoatsButton} onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>

        {/* Right Joystick (Left/Right) */}
        <Joystick
          onMove={(x, y) => setRightJoystick({ x, y })}
          size={120}
          axis="horizontal"
        />
      </View>
    </View>
  );

  const renderMapScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>MAP</Text>
      <View style={styles.fullMapContainer}>
        <LeafletMap
          interactive={true}
          onMapReady={handleMapReady}
        />
      </View>
    </View>
  );

  // --- Modals ---
  const renderBoatSelectorModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={showBoatSelector}
      onRequestClose={() => setShowBoatSelector(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Pressable style={styles.closeButton} onPress={() => setShowBoatSelector(false)}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalPillButton}>
              <Text style={styles.modalPillButtonText}>Select All</Text>
            </Pressable>
            <Pressable style={styles.modalPillButton}>
              <Text style={styles.modalPillButtonText}>Deselect All</Text>
            </Pressable>
          </View>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 1</Text></Pressable>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 2</Text></Pressable>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 3</Text></Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderSettingsModal = () => (
    <Modal
      animationType="slide"
      visible={showSettings}
      onRequestClose={() => setShowSettings(false)}
    >
      <SafeAreaView style={styles.settingsContainer}>
        <Text style={styles.settingsTitle}>SETTINGS</Text>
        <View style={styles.settingsContent}>
            <Pressable style={styles.settingsButton}>
                <Text style={styles.settingsButtonText}>Max Boat Speed</Text>
            </Pressable>
            <Pressable style={styles.settingsButton}>
                <Text style={styles.settingsButtonText}>Anything Else We May Want to Include</Text>
            </Pressable>
        </View>
        <Pressable style={styles.settingsCloseButton} onPress={() => setShowSettings(false)}>
          <Text style={styles.settingsCloseButtonText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );

  if (showSplashScreen) {
    return renderSplashScreen();
  }

  // --- Main Layout ---
  return (
    <SafeAreaView style={styles.appContainer}>
      {/* Modals */}
      {renderBoatSelectorModal()}
      {renderSettingsModal()}

      {/* Main Content */}
      <View style={styles.mainContent}>
        {activeTab === 'bluetooth' && renderBluetoothScreen()}
        {activeTab === 'control' && renderControlScreen()}
        {activeTab === 'map' && renderMapScreen()}
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navButton} onPress={() => setActiveTab('bluetooth')}>
          <Text style={[styles.navIcon, activeTab === 'bluetooth' && styles.activeNavIcon]}>
            ᛒ
          </Text>
          {activeTab === 'bluetooth' && <View style={styles.activeIndicator} />}
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => setActiveTab('control')}>
          <View style={[styles.circleIcon, activeTab === 'control' && styles.activeCircleIcon]} />
          {activeTab === 'control' && <View style={styles.activeIndicator} />}
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => setActiveTab('map')}>
          <View style={[styles.mapPinIcon, activeTab === 'map' && styles.activeMapPinIcon]}>
            <View style={styles.mapPinCircle} />
            <View style={styles.mapPinPoint} />
          </View>
          {activeTab === 'map' && <View style={styles.activeIndicator} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  // Containers
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#6bbd5a',
  },
  appContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  mainContent: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Typography
  splashText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#000',
  },
  // Bluetooth Screen
  connectButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    paddingHorizontal: 70,
    borderRadius: 12,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  // Control Screen (Landscape)
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerIcon: {
    fontSize: 30,
    color: '#333',
  },
  returnButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  returnButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  controlBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    paddingBottom: 10,
  },
  controlCenterColumn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  controlMapContainer: {
    flex: 1,
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 15,
  },
  selectBoatsButton: {
    backgroundColor: '#000',
    paddingVertical: 15,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  selectBoatsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  joystickArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  joystickInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E0E0E0',
  },
  // Map Screen
  fullMapContainer: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  // Bottom Navigation
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingBottom: 25,
    paddingTop: 10,
    backgroundColor: '#fff',
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 30,
    color: '#ccc',
  },
  activeNavIcon: {
    color: '#000',
  },
  circleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  activeCircleIcon: {
    borderColor: '#000',
  },
  mapPinIcon: {
    width: 24,
    height: 30,
    alignItems: 'center',
  },
  activeMapPinIcon: {},
  mapPinCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: 'white',
  },
  mapPinPoint: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ccc',
    marginTop: -2,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'red',
  },
  // Boat Selector Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    padding: 20,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    left: 15,
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  modalPillButton: {
    backgroundColor: '#D9D9D9',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  modalPillButtonText: {
    color: '#000',
    fontWeight: '600',
  },
  boatItemButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  boatItemText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Settings Modal
  settingsContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  settingsContent: {
      flex: 1,
      paddingHorizontal: 20,
  },
  settingsButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  settingsButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  settingsCloseButton: {
    backgroundColor: '#E0E0E0',
    padding: 15,
    margin: 20,
    borderRadius: 8,
  },
  settingsCloseButtonText: {
      color: '#000',
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
  },
});

export default App;