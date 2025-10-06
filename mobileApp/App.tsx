import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Modal,
  Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';

const { width, height } = Dimensions.get('window');

// --- Leaflet Map Component ---
const LeafletMap = ({ latitude = 36.0687, longitude = -94.1748, interactive = true }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        html, body { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
        #map { height: 100vh; width: 100vw; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          const map = L.map('map', {
            zoomControl: ${interactive},
            attributionControl: false,
            dragging: ${interactive},
            touchZoom: ${interactive},
            scrollWheelZoom: ${interactive},
            doubleClickZoom: ${interactive},
            boxZoom: ${interactive}
          }).setView([${latitude}, ${longitude}], 13);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          L.marker([${latitude}, ${longitude}]).addTo(map);
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
      style={{ flex: 1 }}
      scrollEnabled={interactive}
    />
  );
};

// --- Main App Component ---
const App = () => {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [activeTab, setActiveTab] = useState('bluetooth');
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- Effects ---
  useEffect(() => {
    const timer = setTimeout(() => setShowSplashScreen(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Effect to handle screen orientation
  useEffect(() => {
    if (activeTab === 'control') {
      Orientation.lockToLandscape();
    } else {
      Orientation.lockToPortrait();
    }
    // Cleanup function to reset orientation when the app closes or component unmounts
    return () => {
      Orientation.lockToPortrait();
    };
  }, [activeTab]);


  // --- Screens ---
  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      {/* Added anchor icon to splash screen text */}
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
        {/* Joysticks */}
        <View style={styles.joystickArea}>
          <View style={styles.joystickOuter}>
            <View style={styles.joystickInner} />
          </View>
        </View>

        {/* Center Content */}
        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap interactive={false} />
          </View>
          <Pressable style={styles.selectBoatsButton} onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>
        
        {/* Joysticks */}
        <View style={styles.joystickArea}>
          <View style={styles.joystickOuter}>
            <View style={styles.joystickInner} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderMapScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>MAP</Text>
      <View style={styles.fullMapContainer}>
        <LeafletMap interactive={true} />
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
          {/* Using the runic character `ᛒ` which is the basis for the Bluetooth logo */}
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