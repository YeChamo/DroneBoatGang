import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Modal,
  Dimensions,
  PanResponder,
  Alert,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import 'react-native-gesture-handler';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';

const { width, height } = Dimensions.get('window');

const ensureBtPermissions = async () => {
  if (Platform.OS !== 'android') return true;
  const api = Platform.Version as number;
  if (api >= 31) {
    const scan = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
    );
    const conn = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    );
    return (
      scan === PermissionsAndroid.RESULTS.GRANTED &&
      conn === PermissionsAndroid.RESULTS.GRANTED
    );
  } else {
    const loc = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return loc === PermissionsAndroid.RESULTS.GRANTED;
  }
};

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
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
        boatMarker.setLatLng([lat, lng]);
        const el = boatMarker.getElement();
        if (el) {
          const marker = el.querySelector('.boat-marker');
          if (marker) marker.style.transform = 'rotate(' + heading + 'deg)';
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
          x = 0;
          y = Math.max(-maxDistance, Math.min(maxDistance, y));
        } else if (axis === 'horizontal') {
          y = 0;
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

const App = () => {
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [activeTab, setActiveTab] = useState('bluetooth');
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [markerPosition, setMarkerPosition] = useState({
    latitude: 36.0687,
    longitude: -94.1748,
    heading: 0,
  });
  const [leftJoystick, setLeftJoystick] = useState({ x: 0, y: 0 });
  const [rightJoystick, setRightJoystick] = useState({ x: 0, y: 0 });
  const mapRef = useRef(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [connected, setConnected] = useState<BluetoothDevice | null>(null);
  const lastCmd = useRef<string>('');

  const sendCmd = async (cmd: string) => {
    if (!connected) return;
    if (cmd === lastCmd.current) return;
    lastCmd.current = cmd;
    try {
      await connected.write(cmd + '\n');
    } catch {}
  };

  const pickCmdFromJoysticks = (lx: number, ly: number, rx: number, ry: number) => {
    if (ly < -0.5) return '1';
    if (ly > 0.5) return '2';
    if (rx < -0.5) return '3';
    if (rx > 0.5) return '4';
    return '';
  };

  const quickConnect = async () => {
    try {
      const ok = await ensureBtPermissions();
      if (!ok) {
        Alert.alert('Permissions', 'Bluetooth permissions denied.');
        return;
      }
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        const turnedOn = await RNBluetoothClassic.requestBluetoothEnabled();
        if (!turnedOn) {
          Alert.alert('Bluetooth', 'Please enable Bluetooth');
          return;
        }
      }
      const bonded = await RNBluetoothClassic.getBondedDevices();
      let target =
        bonded.find((d) => /JDY|HC-0[56]/i.test(d.name ?? '')) || bonded[0];
      if (!target) {
        Alert.alert('No paired device', 'Pair JDY-31 in Android Bluetooth settings first.');
        return;
      }
      const dev = await RNBluetoothClassic.connectToDevice(target.address, { delimiter: '\n' });
      setConnected(dev);
      Alert.alert('Connected', `${dev.name ?? 'Device'} @ ${dev.address}`);
    } catch (e: any) {
      Alert.alert('Connect error', String(e?.message ?? e));
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setShowSplashScreen(false), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === 'control') Orientation.lockToLandscape();
    else Orientation.lockToPortrait();
    return () => {
      Orientation.lockToPortrait();
    };
  }, [activeTab]);

  useEffect(() => {
    const interval = setInterval(() => {
      if ((leftJoystick.y !== 0 || rightJoystick.x !== 0) && mapRef.current && mapInitialized) {
        setMarkerPosition((prev) => {
          const moveSpeed = 0.00005;
          const rotationSpeed = 5;
          const newHeading = (prev.heading + rightJoystick.x * rotationSpeed + 360) % 360;
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
          return { latitude: newLat, longitude: newLng, heading: newHeading };
        });
      }
    }, 50);
    return () => clearInterval(interval);
  }, [leftJoystick, rightJoystick, mapInitialized]);

  useEffect(() => {
    const cmd = pickCmdFromJoysticks(
      leftJoystick.x,
      leftJoystick.y,
      rightJoystick.x,
      rightJoystick.y
    );
    if (cmd) sendCmd(cmd);
    else lastCmd.current = '';
  }, [leftJoystick, rightJoystick, connected]);

  const handleMapReady = (ref) => {
    mapRef.current = ref.current;
    setTimeout(() => {
      setMapInitialized(true);
      if (ref.current) {
        ref.current.injectJavaScript(
          `window.updateBoat(${markerPosition.latitude}, ${markerPosition.longitude}, ${markerPosition.heading}); true;`
        );
      }
    }, 500);
  };

  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashText}>RC Drone Boat ⚓</Text>
    </View>
  );

  const renderBluetoothScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>BLUETOOTH</Text>
      <View style={styles.centeredContent}>
        <Pressable style={styles.connectButton} onPress={quickConnect}>
          <Text style={styles.connectButtonText}>
            {connected ? 'Connected' : 'Connect Device'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderControlScreen = () => (
    <View style={styles.screenContainer}>
      <View style={styles.controlHeader}>
        <Pressable onPress={() => setShowSettings(true)}>
          <Text style={styles.headerIcon}>⚙</Text>
        </Pressable>
        <Pressable style={styles.returnButton}>
          <Text style={styles.returnButtonText}>Return Boats</Text>
        </Pressable>
      </View>
      <View style={styles.controlBody}>
        <Joystick onMove={(x, y) => setLeftJoystick({ x, y })} size={120} axis="vertical" />
        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap interactive={false} onMapReady={handleMapReady} />
          </View>
          <Pressable style={styles.selectBoatsButton} onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>
        <Joystick onMove={(x, y) => setRightJoystick({ x, y })} size={120} axis="horizontal" />
      </View>
    </View>
  );

  const renderMapScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>MAP</Text>
      <View style={styles.fullMapContainer}>
        <LeafletMap interactive={true} onMapReady={handleMapReady} />
      </View>
    </View>
  );

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

  if (showSplashScreen) return renderSplashScreen();

  return (
    <SafeAreaView style={styles.appContainer}>
      {renderBoatSelectorModal()}
      {renderSettingsModal()}
      <View style={styles.mainContent}>
        {activeTab === 'bluetooth' && renderBluetoothScreen()}
        {activeTab === 'control' && renderControlScreen()}
        {activeTab === 'map' && renderMapScreen()}
      </View>
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

const styles = StyleSheet.create({
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
  fullMapContainer: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
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
