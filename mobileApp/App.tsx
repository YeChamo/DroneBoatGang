import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Modal,
  Dimensions,
  PanResponder,
  Platform,
  PermissionsAndroid,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Orientation from 'react-native-orientation-locker';
import 'react-native-gesture-handler';

// --- Bluetooth Classic Imports ---
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

const { width, height } = Dimensions.get('window');

/** Parse custom E7 format lines: "GPS,<lat_e7>,<lon_e7>" */
const parseGpsData = (sentence: string) => {
  if (!sentence.startsWith('GPS,')) return null;
  const parts = sentence.split(',');
  if (parts.length !== 3) return null;

  const latE7 = parseInt(parts[1], 10);
  const lonE7 = parseInt(parts[2], 10);
  if (isNaN(latE7) || isNaN(lonE7)) return null;

  return {
    latitude: latE7 / 1e7,
    longitude: lonE7 / 1e7,
    heading: 0,
  };
};

// --- Leaflet Map Component ---
const LeafletMap = React.memo(
  ({ onMapReady, interactive = true }: { onMapReady: (ref: React.RefObject<WebView>) => void; interactive?: boolean }) => {
    const webViewRef = useRef<WebView>(null);
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
          width: 0; height: 0;
          border-left: 12px solid transparent;
          border-right: 12px solid transparent;
          border-bottom: 40px solid #4285F4;
          transform-origin: 50% 75%;
          transition: transform 0.2s linear;
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
            if (isNaN(lat) || isNaN(lng)) return;
            const p = L.latLng(lat, lng);
            boatMarker.setLatLng(p);
            const el = boatMarker.getElement();
            if (el) {
              const marker = el.querySelector('.boat-marker');
              if (marker) marker.style.transform = 'rotate(' + heading + 'deg)';
            }
            map.panTo(p, { animate: true, duration: 0.5 });
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
  }
);

// --- Joystick Component ---
const Joystick = ({
  onMove,
  size = 120,
  axis = 'both',
}: {
  onMove: (x: number, y: number) => void;
  size?: number;
  axis?: 'both' | 'vertical' | 'horizontal';
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const maxDistance = size / 2 - 30;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gestureState) => {
        let x = gestureState.dx;
        let y = gestureState.dy;

        if (axis === 'vertical') {
          x = 0;
          y = Math.max(-maxDistance, Math.min(maxDistance, y));
        } else if (axis === 'horizontal') {
          y = 0;
          x = Math.max(-maxDistance, Math.min(maxDistance, x));
        } else {
          const d = Math.sqrt(x * x + y * y);
          if (d > maxDistance) {
            const a = Math.atan2(y, x);
            x = Math.cos(a) * maxDistance;
            y = Math.sin(a) * maxDistance;
          }
        }

        setPosition({ x, y });
        onMove(x / maxDistance, y / maxDistance);
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
  const [activeTab, setActiveTab] = useState<'bluetooth' | 'control' | 'map'>('bluetooth');
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // --- Bluetooth Classic State ---
  const [scannedDevices, setScannedDevices] = useState<BluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [receivedData, setReceivedData] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('Ready to connect');

  // Classic subscriptions
  const readSubRef = useRef<any>(null);
  const dcSubRef = useRef<any>(null);

  // Buffer for incoming data (line oriented)
  const dataBuffer = useRef('');

  // For Classic, write is per-device; keep a simple flag to show TX/RX readiness in UI
  const writeReady = useRef<boolean>(false);

  // --- Map and Position State ---
  const [markerPosition, setMarkerPosition] = useState({
    latitude: 36.0687,
    longitude: -94.1748,
    heading: 0,
  });
  const mapRef = useRef<WebView | null>(null);

  // Joystick state
  const [leftJoystick, setLeftJoystick] = useState({ x: 0, y: 0 });
  const [rightJoystick, setRightJoystick] = useState({ x: 0, y: 0 });

  // Throttle command writes (send at most every 60 ms)
  const lastSentRef = useRef<number>(0);
  const TX_INTERVAL_MS = 60;

  // Compose control frame from joysticks
  const controlFrame = useMemo(() => {
    const throttle = Math.round(-leftJoystick.y * 100);
    const steer = Math.round(rightJoystick.x * 100);
    return `CTRL,${throttle},${steer}\n`;
  }, [leftJoystick, rightJoystick]);

  // Send control frames when joysticks move (throttled)
  useEffect(() => {
    const now = Date.now();
    if (!connectedDevice || !writeReady.current) return;
    if (now - lastSentRef.current < TX_INTERVAL_MS) return;
    lastSentRef.current = now;
    writeLine(controlFrame).catch(() => {});
  }, [controlFrame, connectedDevice]);

  // Splash
  useEffect(() => {
    const t = setTimeout(() => setShowSplashScreen(false), 1200);
    return () => clearTimeout(t);
  }, []);

  // Orientation
  useEffect(() => {
    if (activeTab === 'control') Orientation.lockToLandscape();
    else Orientation.lockToPortrait();
    return () => Orientation.lockToPortrait();
  }, [activeTab]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      RNBluetoothClassic.cancelDiscovery().catch(() => {});
      if (connectedDevice) {
        RNBluetoothClassic.disconnectFromDevice(connectedDevice.address).catch(() => {});
      }
      readSubRef.current?.remove?.();
      dcSubRef.current?.remove?.();
    };
  }, [connectedDevice]);

  // Update the map when markerPosition changes
  useEffect(() => {
    if (mapRef.current) {
      const { latitude, longitude, heading } = markerPosition;
      mapRef.current.injectJavaScript(`window.updateBoat(${latitude}, ${longitude}, ${heading}); true;`);
    }
  }, [markerPosition]);

  // --- Classic helpers ---
  const ensureBtEnabled = async () => {
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (enabled) return true;
    try {
      const ok = await RNBluetoothClassic.requestBluetoothEnabled();
      return !!ok;
    } catch {
      return false;
    }
  };

  const requestBluetoothPermission = async () => {
    if (Platform.OS !== 'android') return false; // iOS doesn’t expose Classic SPP to apps
    if (Platform.Version >= 31) {
      const res = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return (
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        res[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return res === PermissionsAndroid.RESULTS.GRANTED;
    }
  };

  /** Ensure device is bonded with PIN 1234 before connecting (Android only). */
  const ensurePaired = async (device: BluetoothDevice): Promise<boolean> => {
    try {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      if (bonded?.some((d) => d.address === device.address)) return true;

      // Try to set the PIN before pairing (best-effort)
      try {
        // @ts-ignore - optional in some versions
        await RNBluetoothClassic.setDevicePin?.(device.address, '1234');
      } catch {}

      const paired = await RNBluetoothClassic.pairDevice(device.address);
      return !!paired;
    } catch {
      return false;
    }
  };

  // --- Scan / Connect / Stream ---
  const startScan = async () => {
    if (Platform.OS !== 'android') {
      setStatusMessage('Bluetooth Classic is Android-only. Use BLE for iOS.');
      return;
    }
    const hasPerm = await requestBluetoothPermission();
    if (!hasPerm) {
      setStatusMessage('Bluetooth permission denied');
      return;
    }
    const on = await ensureBtEnabled();
    if (!on) {
      setStatusMessage('Enable Bluetooth to continue');
      return;
    }

    setScannedDevices([]);
    setIsScanning(true);
    setStatusMessage('Scanning for devices...');

    try {
      const list = await RNBluetoothClassic.startDiscovery();
      const unique: Record<string, BluetoothDevice> = {};
      (list || []).forEach((d) => (unique[d.address] = d));
      setScannedDevices(Object.values(unique));
      setStatusMessage('Scan finished');
    } catch (e: any) {
      setStatusMessage(`Scan Error: ${e?.message || String(e)}`);
    } finally {
      setIsScanning(false);
      RNBluetoothClassic.cancelDiscovery().catch(() => {});
    }
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    try {
      await RNBluetoothClassic.cancelDiscovery().catch(() => {});
      setIsScanning(false);
      setStatusMessage(`Connecting to ${device.name || device.address}...`);

      // 1) Make sure adapter is enabled
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        const ok = await RNBluetoothClassic.requestBluetoothEnabled();
        if (!ok) {
          setStatusMessage('Bluetooth is off');
          return;
        }
      }

      // 2) Ensure bonding with PIN 1234
      const paired = await ensurePaired(device);
      if (!paired) {
        setStatusMessage('Pairing failed. Try pairing in system settings using PIN 1234.');
        Alert.alert(
          'Pairing required',
          'Open Android Settings → Bluetooth, pair with the device using PIN 1234, then come back and tap it again.'
        );
        return;
      }

      // 3) Open RFCOMM socket with newline delimiter
      const ok = await RNBluetoothClassic.connectToDevice(device.address, { delimiter: '\n' });
      if (!ok) throw new Error('Connect failed');

      setConnectedDevice(device);
      writeReady.current = true;
      setStatusMessage(`Connected to ${device.name || device.address}`);
      setReceivedData('');
      dataBuffer.current = '';

      // 4) Subscribe to incoming lines (CORRECT signature: callback only)
      readSubRef.current?.remove?.();
      readSubRef.current = RNBluetoothClassic.onDeviceRead((ev: any) => {
        if (!ev || ev.device?.address !== device.address) return;
        const chunk = String(ev.data ?? '');
        dataBuffer.current += chunk;

        // process by newline
        while (true) {
          const idx = dataBuffer.current.indexOf('\n');
          if (idx < 0) break;
          const sentence = dataBuffer.current.substring(0, idx).trim();
          dataBuffer.current = dataBuffer.current.substring(idx + 1);
          if (!sentence) continue;

          setReceivedData((prev) => `${prev}\n> ${sentence}`.slice(-1500));
          const gps = parseGpsData(sentence);
          if (gps) setMarkerPosition(gps);
        }
      });

      // 5) Handle disconnect (CORRECT signature: callback only)
      dcSubRef.current?.remove?.();
      dcSubRef.current = RNBluetoothClassic.onDeviceDisconnected((ev: any) => {
        if (ev?.device?.address === device.address) {
          setStatusMessage('Disconnected.');
          setConnectedDevice(null);
          writeReady.current = false;
          readSubRef.current?.remove?.();
        }
      });
    } catch (error: any) {
      setStatusMessage(`Connection Error: ${error?.message || String(error)}`);
      Alert.alert('Connection Error', error?.message || String(error));
    }
  };

  const disconnectDevice = () => {
    if (!connectedDevice) return;
    readSubRef.current?.remove?.();
    dcSubRef.current?.remove?.();
    RNBluetoothClassic.disconnectFromDevice(connectedDevice.address)
      .catch(() => {})
      .finally(() => {
        setConnectedDevice(null);
        setReceivedData('');
        dataBuffer.current = '';
        writeReady.current = false;
        setStatusMessage('Device disconnected');
      });
  };

  /** Write a full text line to the boat (Classic SPP). */
  const writeLine = async (text: string) => {
    if (!connectedDevice || !writeReady.current) return;
    try {
      await RNBluetoothClassic.writeToDevice(connectedDevice.address, text);
    } catch {
      // Ignore throttled joystick errors; manual sends would show an Alert if you add one here.
    }
  };

  // --- UI Screens ---
  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashText}>RC Drone Boat ⚓</Text>
    </View>
  );

  const renderBluetoothScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>BLUETOOTH</Text>
      <View style={styles.bluetoothContent}>
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        {!connectedDevice ? (
          <>
            <View style={{ width: '100%', gap: 10 }}>
              <Pressable
                style={styles.actionButton}
                onPress={startScan}
                disabled={isScanning}
              >
                {isScanning ? <ActivityIndicator color="white" /> : <Text style={styles.actionButtonText}>Scan (Show All)</Text>}
              </Pressable>
            </View>

            <FlatList
              data={scannedDevices}
              keyExtractor={(item) => item.address}
              renderItem={({ item }) => (
                <Pressable style={styles.deviceItem} onPress={() => connectToDevice(item)}>
                  <Text style={styles.deviceText}>{item.name || 'Unknown Device'}</Text>
                  <Text style={styles.deviceTextSmall}>{item.address}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyListText}>No devices found. Scan to search.</Text>}
              style={styles.deviceList}
            />
          </>
        ) : (
          <View style={styles.connectedView}>
            <Pressable style={[styles.actionButton, styles.disconnectButton]} onPress={disconnectDevice}>
              <Text style={styles.actionButtonText}>Disconnect</Text>
            </Pressable>
            <Text style={styles.dataTitle}>Received Data:</Text>
            <ScrollView style={styles.dataBox}>
              <Text style={styles.dataText}>{receivedData || 'No data yet...'}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );

  const renderControlScreen = () => (
    <View style={styles.screenContainer}>
      <View style={styles.controlHeader}>
        <Pressable onPress={() => setShowSettings(true)}>
          <Text style={styles.headerIcon}>⚙</Text>
        </Pressable>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontWeight: '700' }}>{connectedDevice ? (connectedDevice.name || connectedDevice.address) : 'Not connected'}</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>
            {writeReady.current ? 'TX/RX ready' : 'Waiting for connection'}
          </Text>
        </View>

        <Pressable style={styles.returnButton} onPress={() => writeLine('RETURN\n')}>
          <Text style={styles.returnButtonText}>Return Boat</Text>
        </Pressable>
      </View>

      <View style={styles.controlBody}>
        {/* Throttle (vertical) */}
        <Joystick onMove={(x, y) => setLeftJoystick({ x, y })} size={140} axis="vertical" />

        {/* Map + select */}
        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap interactive={false} onMapReady={(ref) => { mapRef.current = ref.current; }} />
          </View>
          <Pressable style={styles.selectBoatsButton} onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>

        {/* Steering (horizontal) */}
        <Joystick onMove={(x, y) => setRightJoystick({ x, y })} size={140} axis="horizontal" />
      </View>
    </View>
  );

  const renderMapScreen = () => (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>MAP</Text>
      <View style={styles.fullMapContainer}>
        <LeafletMap interactive={true} onMapReady={(ref) => { mapRef.current = ref.current; }} />
      </View>
    </View>
  );

  const renderBoatSelectorModal = () => (
    <Modal animationType="fade" transparent visible={showBoatSelector} onRequestClose={() => setShowBoatSelector(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Pressable style={styles.closeButton} onPress={() => setShowBoatSelector(false)}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalPillButton}><Text style={styles.modalPillButtonText}>Select All</Text></Pressable>
            <Pressable style={styles.modalPillButton}><Text style={styles.modalPillButtonText}>Deselect All</Text></Pressable>
          </View>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 1</Text></Pressable>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 2</Text></Pressable>
          <Pressable style={styles.boatItemButton}><Text style={styles.boatItemText}>Boat 3</Text></Pressable>
        </View>
      </View>
    </Modal>
  );

  const renderSettingsModal = () => (
    <Modal animationType="slide" visible={showSettings} onRequestClose={() => setShowSettings(false)}>
      <SafeAreaView style={styles.settingsContainer}>
        <Text style={styles.settingsTitle}>SETTINGS</Text>
        <View style={styles.settingsContent}>
          <Pressable style={styles.settingsButton} onPress={() => writeLine('SPEED,MAX,60\n')}>
            <Text style={styles.settingsButtonText}>Set Max Boat Speed (demo)</Text>
          </Pressable>
          <Pressable style={styles.settingsButton} onPress={() => writeLine('CALIBRATE\n')}>
            <Text style={styles.settingsButtonText}>Calibrate</Text>
          </Pressable>
        </View>
        <Pressable style={styles.settingsCloseButton} onPress={() => setShowSettings(false)}>
          <Text style={styles.settingsCloseButtonText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );

  if (showSplashScreen) return renderSplashScreen();

  // --- Main Layout ---
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
          <Text style={[styles.navIcon, activeTab === 'bluetooth' && styles.activeNavIcon]}>ᛒ</Text>
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
  splashContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#6bbd5a' },
  appContainer: { flex: 1, backgroundColor: 'white' },
  mainContent: { flex: 1 },
  screenContainer: { flex: 1, backgroundColor: 'white' },
  splashText: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  screenTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 20, color: '#000' },

  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  headerIcon: { fontSize: 30, color: '#333' },
  returnButton: { backgroundColor: '#E0E0E0', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  returnButtonText: { fontSize: 14, fontWeight: '600', color: '#000' },
  controlBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingBottom: 10 },
  controlCenterColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 20 },
  controlMapContainer: { flex: 1, width: '100%', borderRadius: 15, overflow: 'hidden', borderWidth: 1, borderColor: '#ddd', marginBottom: 15 },
  selectBoatsButton: { backgroundColor: '#000', paddingVertical: 15, width: '100%', borderRadius: 12, alignItems: 'center' },
  selectBoatsButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  joystickArea: { alignItems: 'center', justifyContent: 'center' },
  joystickOuter: { width: 140, height: 140, borderRadius: 70, borderWidth: 5, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  joystickInner: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#E0E0E0' },

  fullMapContainer: { flex: 1, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingBottom: 25, paddingTop: 10, backgroundColor: '#fff' },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 30, color: '#ccc' },
  activeNavIcon: { color: '#000' },
  circleIcon: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc' },
  activeCircleIcon: { borderColor: '#000' },
  mapPinIcon: { width: 24, height: 30, alignItems: 'center' },
  activeMapPinIcon: {},
  mapPinCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccc', backgroundColor: 'white' },
  mapPinPoint: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#ccc', marginTop: -2 },
  activeIndicator: { position: 'absolute', bottom: -8, width: 6, height: 6, borderRadius: 3, backgroundColor: 'red' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#F5F5F5', borderRadius: 20, padding: 20, width: '85%', maxWidth: 400, alignItems: 'center' },
  closeButton: { position: 'absolute', top: 15, left: 15 },
  closeButtonText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  modalHeader: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20, marginTop: 20 },
  modalPillButton: { backgroundColor: '#D9D9D9', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, marginHorizontal: 5 },
  modalPillButtonText: { color: '#000', fontWeight: '600' },
  boatItemButton: { backgroundColor: '#000', borderRadius: 12, paddingVertical: 15, width: '100%', alignItems: 'center', marginBottom: 10 },
  boatItemText: { color: 'white', fontSize: 16, fontWeight: '600' },

  settingsContainer: { flex: 1, backgroundColor: 'white' },
  settingsTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginTop: 20, marginBottom: 30 },
  settingsContent: { flex: 1, paddingHorizontal: 20 },
  settingsButton: { backgroundColor: '#000', padding: 15, borderRadius: 8, marginBottom: 15 },
  settingsButtonText: { color: 'white', textAlign: 'center', fontSize: 16, fontWeight: '500' },
  settingsCloseButton: { backgroundColor: '#E0E0E0', padding: 15, margin: 20, borderRadius: 8 },
  settingsCloseButtonText: { color: '#000', textAlign: 'center', fontSize: 16, fontWeight: '600' },

  bluetoothContent: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  statusBox: { backgroundColor: '#f0f0f0', padding: 15, borderRadius: 10, width: '100%', marginBottom: 10, alignItems: 'center' },
  statusText: { fontSize: 16, color: '#333', textAlign: 'center' },

  actionButton: { backgroundColor: '#007AFF', paddingVertical: 16, width: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  secondaryButton: { backgroundColor: '#1A73E8' },
  actionButtonText: { color: 'white', fontSize: 16, fontWeight: '700' },

  deviceList: { width: '100%', flex: 1 },
  deviceItem: { backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ddd' },
  deviceText: { fontSize: 16, fontWeight: '500', color: '#000' },
  deviceTextSmall: { fontSize: 12, color: '#666', marginTop: 4 },
  emptyListText: { textAlign: 'center', marginTop: 12, color: '#888', fontSize: 16 },

  connectedView: { width: '100%', alignItems: 'center', flex: 1 },
  disconnectButton: { backgroundColor: '#c93e3e' },
  dataTitle: { fontSize: 18, fontWeight: '600', marginTop: 10, marginBottom: 10, alignSelf: 'flex-start' },
  dataBox: { width: '100%', flex: 1, backgroundColor: '#2b2b2b', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#444' },
  dataText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14, color: '#00ff41' },
});

export default App;
