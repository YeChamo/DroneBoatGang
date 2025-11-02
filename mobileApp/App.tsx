import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Modal,
  Dimensions,
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
  const webViewRef = useRef<any>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  useEffect(() => {
    if (mapInitialized && onMapReady && webViewRef.current) {
      onMapReady(webViewRef);
    }
  }, [mapInitialized, onMapReady]);

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
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        boatMarker.setLatLng([lat, lng]);
        const el = boatMarker.getElement();
        if (el) {
          const marker = el.querySelector('.boat-marker');
          if (marker) marker.style.transform = 'rotate(' + (heading || 0) + 'deg)';
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
      javaScriptEnabled
      domStorageEnabled
      style={{ flex: 1 }}
      onMessage={(event) => {
        if (event.nativeEvent.data === 'mapReady') setMapInitialized(true);
      }}
    />
  );
});

/** STATIC joystick visuals only (no gestures) */
const Joystick = ({ axis = 'both' }: { axis?: 'both' | 'vertical' | 'horizontal' }) => {
  const isVertical = axis === 'vertical';
  const outerStyle = isVertical
    ? { width: 80, height: 150, borderRadius: 40 }
    : { width: 150, height: 80, borderRadius: 40 };

  const innerStyle = isVertical
    ? { width: 40, height: 100, borderRadius: 20 }
    : { width: 100, height: 40, borderRadius: 20 };

  return (
    <View style={styles.joystickArea}>
      <View style={[styles.joystickOuterStatic, outerStyle]}>
        <View style={[styles.joystickInnerStatic, innerStyle]} />
      </View>
      <Text style={styles.joystickHintText}>
        {isVertical ? 'Forward / Reverse' : 'Steer Left / Right'}
      </Text>
    </View>
  );
};

const App = () => {
  // Splash + tabs
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [activeTab, setActiveTab] = useState<'bluetooth' | 'control' | 'map'>('bluetooth');

  // Option modals (kept, but not strictly required)
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Map state
  const [markerPosition, setMarkerPosition] = useState({
    latitude: 36.0687,
    longitude: -94.1748,
    heading: 0,
  });
  const mapRef = useRef<any>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Bluetooth (unchanged connect flow)
  const [connected, setConnected] = useState<BluetoothDevice | null>(null);
  const lastCmd = useRef<string>(''); // kept in case you want to send manual commands later

  const sendCmd = async (cmd: string) => {
    if (!connected) return;
    if (cmd === lastCmd.current) return;
    lastCmd.current = cmd;
    try {
      await connected.write(cmd + '\n');
    } catch {
      // ignore write errors for now
    }
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
      const target =
        bonded.find((d) => /JDY|HC-0[56]/i.test(d.name ?? '')) || bonded[0];
      if (!target) {
        Alert.alert('No paired device', 'Pair JDY-31/HC-05 in Android Bluetooth settings first.');
        return;
      }
      const dev = await RNBluetoothClassic.connectToDevice(target.address, { delimiter: '\n' });
      setConnected(dev);
      Alert.alert('Connected', `${dev.name ?? 'Device'} @ ${dev.address}`);
      // If your MCU sends GPS lines, you can subscribe here with dev.onDataReceived(...)
      // and call handleTelemetryLine(event.data)
    } catch (e: any) {
      Alert.alert('Connect error', String(e?.message ?? e));
    }
  };

  /** Unified GPS line parser: "GPS:lat,lng,heading" */
  const handleTelemetryLine = (line: string) => {
    if (!line) return;
    const m = line.trim().match(/^GPS:([-0-9.]+),([-0-9.]+),([-0-9.]+)$/);
    if (!m) return;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    const hdg = parseFloat(m[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setMarkerPosition({ latitude: lat, longitude: lng, heading: hdg || 0 });
    if (mapRef.current && mapInitialized) {
      mapRef.current.injectJavaScript(
        `window.updateBoat(${lat}, ${lng}, ${hdg || 0}); true;`
      );
    }
  };

  /** Map ready: stash ref and paint first boat position */
  const handleMapReady = (ref: any) => {
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

  /** Simple GPS simulator toggle */
  const [simOn, setSimOn] = useState(false);
  useEffect(() => {
    if (!simOn) return;
    let lat = markerPosition.latitude;
    let lng = markerPosition.longitude;
    let hdg = 90;        // start heading east
    const dt = 0.25;     // seconds
    const speed_mps = 1.5;

    const id = setInterval(() => {
      const m2degLat = 1 / 111320;
      const m2degLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
      hdg = (hdg + 2) % 360;
      const r = (hdg * Math.PI) / 180;
      const dx = Math.cos(r) * speed_mps * dt;
      const dy = Math.sin(r) * speed_mps * dt;
      lat += dy * m2degLat;
      lng += dx * m2degLng;

      handleTelemetryLine(`GPS:${lat.toFixed(6)},${lng.toFixed(6)},${hdg.toFixed(1)}`);
    }, dt * 1000);

    return () => clearInterval(id);
  }, [simOn, mapInitialized]); // restart sim on toggle/map init

  /** Splash + orientation */
  useEffect(() => {
    const t = setTimeout(() => setShowSplashScreen(false), 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (activeTab === 'control') Orientation.lockToLandscape();
    else Orientation.lockToPortrait();
    return () => {
      Orientation.lockToPortrait();
    };
  }, [activeTab]);

  // Screens
  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashText}>RC Drone Boat ⚓</Text>
    </View>
  );

  const renderBluetoothScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>BLUETOOTH</Text>
      <View style={[styles.centeredContent, { gap: 12 }]}>
        <Pressable style={styles.connectButton} onPress={quickConnect}>
          <Text style={styles.connectButtonText}>
            {connected ? 'Connected' : 'Connect Device'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.returnButton, { backgroundColor: simOn ? '#6bbd5a' : '#E0E0E0' }]}
          onPress={() => setSimOn((s) => !s)}
        >
          <Text style={styles.returnButtonText}>
            {simOn ? 'Stop Sim GPS' : 'Start Sim GPS'}
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
        <Pressable style={styles.returnButton} onPress={() => setShowBoatSelector(true)}>
          <Text style={styles.returnButtonText}>Return Boats</Text>
        </Pressable>
      </View>

      <View style={styles.controlBody}>
        {/* purely visual vertical oval */}
        <Joystick axis="vertical" />

        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap interactive={false} onMapReady={handleMapReady} />
          </View>
          <Pressable style={styles.selectBoatsButton} onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>

        {/* purely visual horizontal oval */}
        <Joystick axis="horizontal" />
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

  // Optional modals (kept for your UI)
  const renderBoatSelectorModal = () => (
    <Modal
      animationType="fade"
      transparent
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
  appContainer: { flex: 1, backgroundColor: 'white' },
  mainContent: { flex: 1 },
  screenContainer: { flex: 1, backgroundColor: 'white' },
  centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashText: { fontSize: 32, fontWeight: 'bold', color: 'white' },
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
  connectButtonText: { color: 'white', fontSize: 18, fontWeight: '600' },
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerIcon: { fontSize: 30, color: '#333' },
  returnButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  returnButtonText: { fontSize: 14, fontWeight: '600', color: '#000' },
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
  selectBoatsButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  joystickArea: { alignItems: 'center', justifyContent: 'center' },
  joystickOuterStatic: {
    borderWidth: 5,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 6,
  },
  joystickInnerStatic: { backgroundColor: '#E0E0E0' },
  joystickHintText: { marginTop: 6, fontSize: 12, color: '#777' },
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
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 30, color: '#ccc' },
  activeNavIcon: { color: '#000' },
  circleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  activeCircleIcon: { borderColor: '#000' },
  mapPinIcon: { width: 24, height: 30, alignItems: 'center' },
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  closeButton: { position: 'absolute', top: 15, left: 15 },
  closeButtonText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
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
  modalPillButtonText: { color: '#000', fontWeight: '600' },
  boatItemButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  boatItemText: { color: 'white', fontSize: 16, fontWeight: '600' },
  settingsContainer: { flex: 1, backgroundColor: 'white' },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  settingsContent: { flex: 1, paddingHorizontal: 20 },
  settingsButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  settingsButtonText: { color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '500' },
  settingsCloseButton: {
    backgroundColor: '#E0E0E0',
    padding: 15,
    margin: 20,
    borderRadius: 8,
  },
  settingsCloseButtonText: { color: '#000', textAlign: 'center', fontSize: 16, fontWeight: '600' },
});

export default App;
