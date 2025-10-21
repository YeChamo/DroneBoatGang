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
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;

const { width, height } = Dimensions.get('window');

/** Parse GPS data - supports both E7 format and decimal */
const parseGpsData = (sentence: string) => {
  if (!sentence.startsWith('GPS,')) return null;
  const parts = sentence.split(',');
  if (parts.length !== 3) return null;

  // Try E7 format first
  let lat = parseFloat(parts[1]);
  let lon = parseFloat(parts[2]);
  
  // If values are very large, assume E7 format
  if (Math.abs(lat) > 1000 || Math.abs(lon) > 1000) {
    lat = lat / 1e7;
    lon = lon / 1e7;
  }

  if (isNaN(lat) || isNaN(lon)) return null;

  return {
    latitude: lat,
    longitude: lon,
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
  const [lastGPSUpdate, setLastGPSUpdate] = useState<number>(0);
  const [gpsAge, setGpsAge] = useState<number>(0);

  // Subscriptions
  const readSubRef = useRef<{ remove?: () => void } | null>(null);
  const dcSubRef = useRef<{ remove?: () => void } | null>(null);

  // Buffer for incoming data (line oriented)
  const dataBuffer = useRef('');
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

  // Auto-connect to JDY-31 on app start
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

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

  // Update GPS age counter every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastGPSUpdate > 0) {
        setGpsAge(Date.now() - lastGPSUpdate);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastGPSUpdate]);

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

  // Auto-connect to JDY-31 on app start
  useEffect(() => {
    if (!autoConnectAttempted && !showSplashScreen) {
      setAutoConnectAttempted(true);
      autoConnectToJDY31();
    }
  }, [autoConnectAttempted, showSplashScreen]);

  try {
    // Try to open the app directly
    const canOpen = await Linking.canOpenURL(`android-app://${packageName}`);
    if (canOpen) {
      await Linking.openURL(`android-app://${packageName}`);
    } else {
      // App not installed, open Play Store
      Alert.alert(
        'Serial Bluetooth Terminal Not Installed',
        'Would you like to install it from the Play Store?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Install',
            onPress: async () => {
              try {
                await Linking.openURL(playStoreUrl);
              } catch {
                await Linking.openURL(playStoreWebUrl);
              }
            },
          },
        ]
      );

      if (jdy31) {
        setStatusMessage('Auto-connecting to JDY-31...');
        await connectToDevice(jdy31);
      } else {
        setStatusMessage('JDY-31 not paired. Please scan and connect.');
      }
    } catch (e) {
      console.log('Auto-connect failed:', e);
    }
  };

  // --- Scan / Connect / Stream ---
  const startScan = async () => {
    if (Platform.OS !== 'android') {
      setStatusMessage('Bluetooth Classic is Android-only.');
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

      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        const ok = await RNBluetoothClassic.requestBluetoothEnabled();
        if (!ok) {
          setStatusMessage('Bluetooth is off');
          return;
        }
      }

      const paired = await ensurePaired(device);
      if (!paired) {
        setStatusMessage('Pairing failed. Try system settings with PIN 1234.');
        Alert.alert(
          'Pairing required',
          'Open Settings → Bluetooth, pair using PIN 1234, then reconnect.'
        );
        return;
      }

      // Connect FIRST (with proper options), then attach listeners
      const ok = await device.connect({
        DELIMITER: '\n',           // NOTE: uppercase key recognized by the library
        DEVICE_CHARSET: 'utf-8',   // optional, defaults vary
      });

      if (!ok) throw new Error('Connect failed');

      // Clear existing subs if any
      readSubRef.current?.remove?.();
      dcSubRef.current?.remove?.();

      // Subscribe to incoming delimited data
      readSubRef.current = device.onDataReceived((event: any) => {
        try {
          // event.data is the delimited string (w/o newline)
          const chunk = String(event?.data ?? '');
          dataBuffer.current += chunk + '\n'; // re-append to reuse line parsing

Your options are:

1. Use Serial Bluetooth Terminal ONLY for testing/debugging
   - Connect in Serial Terminal to test commands
   - Close Serial Terminal
   - Then connect in your boat app

      // Listen for disconnects
      dcSubRef.current = device.onDeviceDisconnected?.(() => {
        setStatusMessage('⚠ Disconnected');
        setConnectedDevice(null);
        writeReady.current = false;
        readSubRef.current?.remove?.();
        dcSubRef.current?.remove?.();
      });

      setConnectedDevice(device);
      writeReady.current = true;
      setStatusMessage(`✓ Connected to ${device.name || device.address}`);
      setReceivedData('');
      dataBuffer.current = '';

      // Request initial status after connect
      setTimeout(() => writeLine('STATUS\n'), 500);
      
    } catch (error: any) {
      setStatusMessage(`Connection Error: ${error?.message || String(error)}`);
      Alert.alert('Connection Error', error?.message || String(error));
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice) return;
    
    try {
      readSubRef.current?.remove?.();
      dcSubRef.current?.remove?.();
      
      await connectedDevice.disconnect();
      
      setConnectedDevice(null);
      setReceivedData('');
      dataBuffer.current = '';
      writeReady.current = false;
      setStatusMessage('Device disconnected');
      setLastGPSUpdate(0);
      setGpsAge(0);
    } catch (e) {
      console.log('Disconnect error:', e);
    }
  };

  /** Process received lines from bridge */
  const processReceivedLine = (line: string) => {
    // Add to log (ignore heartbeats)
    if (!line.includes('HEARTBEAT')) {
      setReceivedData((prev) => `${prev}\n> ${line}`.slice(-2000));
    }

    // Parse GPS data
    const gps = parseGpsData(line);
    if (gps) {
      setMarkerPosition(gps);
      setLastGPSUpdate(Date.now());
      setStatusMessage(`✓ GPS Updated: ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`);
      return;
    }

    // Handle acknowledgments
    if (line.startsWith('ACK,')) {
      const ackType = line.substring(4);
      setReceivedData((prev) => `${prev}\n✓ ACK: ${ackType}`.slice(-2000));
      return;
    }

    // Handle PONG
    if (line === 'PONG') {
      setReceivedData((prev) => `${prev}\n✓ PONG received`.slice(-2000));
      return;
    }

    // Handle STATUS responses
    if (line.startsWith('STATUS,')) {
      setStatusMessage(`Status: ${line.substring(7)}`);
      return;
    }

    // System messages
    if (line.startsWith('SYSTEM,')) {
      setStatusMessage(line.substring(7));
      return;
    }
  };

  /** Write a full text line to the boat */
  const writeLine = async (text: string) => {
    if (!connectedDevice || !writeReady.current) {
      console.log('Not ready to write');
      return;
    }
    try {
      await connectedDevice.write(text);
    } catch (e) {
      console.log('Write error:', e);
    }
  };

// Add helpful instructions to your app
const BluetoothInstructions = () => (
  <View style={styles.instructionsBox}>
    <Text style={styles.instructionsTitle}>Setup Instructions:</Text>
    <Text style={styles.instructionsText}>
      1. Open Android Settings → Bluetooth{'\n'}
      2. Find "JDY-31" in available devices{'\n'}
      3. Tap to pair (PIN: 1234){'\n'}
      4. Return to this app and tap "Auto-Connect"
    </Text>
    <Pressable style={styles.instructionsButton} onPress={openBluetoothSettings}>
      <Text style={styles.instructionsButtonText}>Open Bluetooth Settings</Text>
    </Pressable>
  </View>
);


// ============================================================
// Method 4: Recommended - Make your existing connection more reliable
// ============================================================

// Your current app code already has everything you need!
// Just improve the user experience:

const ImprovedBluetoothScreen = () => {
  return (
    <View style={styles.screenContainer}>
      <Text style={styles.screenTitle}>BLUETOOTH CONNECTION</Text>
      
      {/* Connection Status */}
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>

      {!connectedDevice ? (
        <>
          {/* Step-by-step instructions */}
          <View style={styles.setupInstructions}>
            <Text style={styles.setupTitle}>First Time Setup:</Text>
            <View style={styles.setupStep}>
              <Text style={styles.setupStepNumber}>1</Text>
              <Text style={styles.setupStepText}>
                Go to Android Settings and pair with JDY-31 (PIN: 1234)
              </Text>
            </View>
            <View style={styles.setupStep}>
              <Text style={styles.setupStepNumber}>2</Text>
              <Text style={styles.setupStepText}>
                Return here and tap "Auto-Connect to JDY-31"
              </Text>
            </View>
            <Pressable style={styles.settingsLinkButton} onPress={openBluetoothSettings}>
              <Text style={styles.settingsLinkText}>→ Open Bluetooth Settings</Text>
            </Pressable>
          </View>

          {/* Connection Buttons */}
          <View style={{ width: '100%', gap: 10, marginTop: 20 }}>
            <Pressable
              style={[styles.actionButton, styles.primaryButton]}
              onPress={autoConnectToJDY31}
            >
              <Text style={styles.actionButtonText}>Auto-Connect to JDY-31</Text>
            </Pressable>
            
            <Pressable
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={startScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.actionButtonText}>Scan All Devices</Text>
              )}
            </Pressable>
          </View>

          {/* Device List */}
          <FlatList
            data={scannedDevices}
            keyExtractor={(item) => item.address}
            renderItem={({ item }) => (
              <Pressable style={styles.deviceItem} onPress={() => connectToDevice(item)}>
                <View style={styles.deviceItemHeader}>
                  <Text style={styles.deviceText}>{item.name || 'Unknown Device'}</Text>
                  {item.name?.includes('JDY') && (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedText}>Recommended</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.deviceTextSmall}>{item.address}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyListText}>
                {isScanning ? 'Scanning...' : 'No devices found. Try scanning or auto-connect.'}
              </Text>
            }
            style={styles.deviceList}
          />
        </>
      ) : (
        <View style={styles.connectedView}>
          <View style={styles.connectedBanner}>
            <Text style={styles.connectedIcon}>✓</Text>
            <View>
              <Text style={styles.connectedTitle}>Connected</Text>
              <Text style={styles.connectedDevice}>{connectedDevice.name}</Text>
              <Text style={styles.connectedAddress}>{connectedDevice.address}</Text>
            </View>
          </View>

          <Pressable style={[styles.actionButton, styles.disconnectButton]} onPress={disconnectDevice}>
            <Text style={styles.actionButtonText}>Disconnect</Text>
          </Pressable>

          <Text style={styles.tipText}>
            💡 Tip: You can now switch to the Control tab to operate your boat
          </Text>
        </View>
      )}
    </View>
  );
};

// Additional styles needed
const additionalStyles = StyleSheet.create({
  setupInstructions: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginTop: 10,
    width: '100%',
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    color: '#000',
  },
  setupStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  setupStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    color: 'white',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '700',
    marginRight: 12,
  },
  setupStepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  settingsLinkButton: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  settingsLinkText: {
    color: '#1976d2',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  deviceItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommendedBadge: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recommendedText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  connectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 20,
  },
  connectedIcon: {
    fontSize: 40,
    color: '#4caf50',
    marginRight: 15,
  },
  connectedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 4,
  },
  connectedDevice: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  connectedAddress: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  tipText: {
    marginTop: 20,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});


// ============================================================
// SUMMARY: What you should do
// ============================================================

/*
Your app already has working Bluetooth! Here's the best approach:

1. PAIRING (One-time setup):
   - User pairs JDY-31 in Android Settings with PIN 1234
   - OR use your app's "Scan" feature and it auto-pairs

2. CONNECTING (Every time):
   - Your app auto-connects on startup (you already have this!)
   - Or user taps "Auto-Connect to JDY-31" button

3. TESTING/DEBUGGING:
   - Use Serial Bluetooth Terminal app to test commands
   - BUT close it before using your app (can't share connection)

4. NORMAL USE:
   - Users only use YOUR app
   - Bluetooth connection is seamless
   - They never need Serial Terminal

The connection part of Serial Bluetooth Terminal is exactly what you already built!
The only difference is Serial Terminal shows raw TX/RX - which you now have in your Terminal tab.
*/
