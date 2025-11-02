// import 'react-native-reanimated'; // Make sure this is deleted
import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  Text,
  Pressable,
  View,
  Alert,
  Platform,
} from 'react-native';
import Orientation from 'react-native-orientation-locker';
import 'react-native-gesture-handler';
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';

// --- Import from new structure ---
import { BluetoothScreen } from './src/screens/BluetoothScreen';
import ControlScreen from './src/screens/ControlScreen';
import { MapScreen } from './src/screens/MapScreen';
import { ensureBtPermissions } from './src/permissions';
import { styles } from './src/styles';

// --- Import Singletons ---
import BT from './src/BluetoothManager';
import CommandLoop from './src/CommandLoop';

// --- Type for GPS coordinates ---
type GpsCoord = {
  latitude: number;
  longitude: number;
};

// --- GEOFENCE DEFINITION ---
const GEOFENCE_BOX = {
  north: 36.0700,
  south: 36.0695,
  west: -94.1755,
  east: -94.1745,
};
const GEOFENCE_BUFFER = 0.00005; // Approx 5.5 meters

// --- Navigation Helpers ---
const deg2rad = (deg: number) => deg * (Math.PI / 180);
const rad2deg = (rad: number) => rad * (180 / Math.PI);

function getDistance(coord1: GpsCoord, coord2: GpsCoord) {
  const R = 6371e3; // metres
  const φ1 = deg2rad(coord1.latitude);
  const φ2 = deg2rad(coord2.latitude);
  const Δφ = deg2rad(coord2.latitude - coord1.latitude);
  const Δλ = deg2rad(coord2.longitude - coord1.longitude);

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

function getBearing(coord1: GpsCoord, coord2: GpsCoord) {
  const φ1 = deg2rad(coord1.latitude);
  const λ1 = deg2rad(coord1.longitude);
  const φ2 = deg2rad(coord2.latitude);
  const λ2 = deg2rad(coord2.longitude);

  const y = Math.sin(λ2-λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) -
          Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
  const θ = Math.atan2(y, x);
  const brng = rad2deg(θ);
  return (brng + 360) % 360; // normalize to 0-360
}

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

const App = () => {
  // --- CORE APP STATE ---
  const [showSplashScreen, setShowSplashScreen] = useState(true);
  const [activeTab, setActiveTab] =
    useState<'bluetooth' | 'control' | 'map'>('bluetooth');

  // --- MAP STATE ---
  const [markerPosition, setMarkerPosition] = useState({
    latitude: 36.0687,
    longitude: -94.1748,
    heading: 0, // 0 = North, 90 = East
  });
  const boatPositionRef = useRef(markerPosition);
  const mapRef = useRef<any>(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  // --- BLUETOOTH STATE (Shared) ---
  const [connected, setConnected] = useState<BluetoothDevice | null>(null);

  // --- AUTONOMY STATE ---
  const [isAutonomous, setAutonomous] = useState(false);
  const [isReturningHome, setReturningHome] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<GpsCoord[]>([]);
  const navigationInterval = useRef<NodeJS.Timeout | null>(null); // For return-to-home loop

  // --- BLUETOOTH LOGIC ---
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
        Alert.alert(
          'No paired device',
          'Pair JDY-31/HC-05 in Android Bluetooth settings first.',
        );
        return;
      }
      
      const dev = await BT.connectTo(target.address); 
      
      setConnected(dev); // Set our local state
      Alert.alert('Connected', `${dev.name ?? 'Device'} @ ${dev.address}`);
    } catch (e: any) {
      Alert.alert('Connect error', String(e?.message ?? e));
    }
  };

  // --- AUTONOMY LOGIC ---
  const isNearLand = (lat: number, lng: number): boolean => {
    return (
      lat > GEOFENCE_BOX.south - GEOFENCE_BUFFER &&
      lat < GEOFENCE_BOX.north + GEOFENCE_BUFFER &&
      lng > GEOFENCE_BOX.west - GEOFENCE_BUFFER &&
      lng < GEOFENCE_BOX.east + GEOFENCE_BUFFER
    );
  };

  const stopReturnToHome = () => {
    console.log('AUTONOMY: Stopping return.');
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
    CommandLoop.setSteering(0);
    CommandLoop.setThrottle(0);
    setReturningHome(false);
    setBreadcrumbs([]); // Clear the original path
    
    // --- UPDATED: Clear the green return path from map ---
    if (mapRef.current && mapInitialized) {
      mapRef.current.injectJavaScript(`window.drawReturnPath([]); true;`);
    }
  };

  const startReturnToHome = () => {
    if (isReturningHome) {
      stopReturnToHome();
      return;
    }

    if (!isAutonomous || breadcrumbs.length < 2) {
      console.log('AUTONOMY: No path to return.');
      return;
    }

    console.log('AUTONOMY: Starting return to home...');
    setReturningHome(true);

    const returnPath = [...breadcrumbs].reverse();
    // We don't pop() the home point, we leave it as the last item to aim for
    let targetWaypoint = returnPath[0]; // Aim for the first point in the reversed array

    // --- UPDATED: Clear orange path, draw green path ---
    if (mapRef.current && mapInitialized) {
      mapRef.current.injectJavaScript(`window.updatePath([]); true;`);
      mapRef.current.injectJavaScript(
        `window.drawReturnPath(${JSON.stringify(returnPath)}); true;`
      );
    }
    
    navigationInterval.current = setInterval(() => {
      const currentPosition = boatPositionRef.current;
      const currentCoord = { 
        latitude: currentPosition.latitude, 
        longitude: currentPosition.longitude 
      };

      if (isNearLand(currentCoord.latitude, currentCoord.longitude)) {
        console.log('AUTONOMY: Geofence hit during return. Stopping.');
        Alert.alert('Return Halted', 'Boat stopped to avoid collision.');
        stopReturnToHome();
        return;
      }

      const distanceToTarget = getDistance(currentCoord, targetWaypoint);
      
      // --- UPDATED: Waypoint Reached Logic ---
      if (distanceToTarget < 3) { // 3-meter radius
        console.log('AUTONOMY: Reached waypoint.');
        returnPath.shift(); // Remove the point we just reached from the *front*

        // --- Check if Home ---
        if (returnPath.length === 0) {
          console.log('AUTONOMY: Return to home complete!');
          Alert.alert('Return Complete', 'Boat has returned to start.');
          stopReturnToHome();
          return;
        }

        // --- Update target and re-draw green path ---
        targetWaypoint = returnPath[0];
        if (mapRef.current && mapInitialized) {
          mapRef.current.injectJavaScript(
            `window.drawReturnPath(${JSON.stringify(returnPath)}); true;`
          );
        }
      }

      // --- Navigation Logic (Unchanged) ---
      const requiredBearing = getBearing(currentCoord, targetWaypoint);
      const currentHeading = currentPosition.heading;
      let steeringError = requiredBearing - currentHeading;
      if (steeringError > 180) steeringError -= 360;
      if (steeringError < -180) steeringError += 360;
      const steeringCommand = clamp(steeringError / 60, -1, 1);
      
      CommandLoop.setSteering(steeringCommand);
      CommandLoop.setThrottle(0.75); // Constant 75% speed
      
    }, 250); // Run 4 times a second
  };

  // --- TELEMETRY LOGIC ---
  const handleTelemetryLine = (line: string) => {
    if (!line) return;
    const m = line.trim().match(/^GPS:([-0-9.]+),([-0-9.]+),([-0-9.]+)$/);
    if (!m) return;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    const hdg = parseFloat(m[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // Update the real-time ref
    boatPositionRef.current = { latitude: lat, longitude: lng, heading: hdg };

    // Breadcrumb logic
    if (isAutonomous && !isReturningHome) {
      setBreadcrumbs((prevCrumbs) => {
        const lastCrumb =
          prevCrumbs.length > 0 ? prevCrumbs[prevCrumbs.length - 1] : null;
        const newCrumb = { latitude: lat, longitude: lng };
        
        const distThreshold = 3; // 3 meters
        if (
          !lastCrumb ||
          getDistance(lastCrumb, newCrumb) > distThreshold
        ) {
          const newPath = [...prevCrumbs, newCrumb];
          if (mapRef.current && mapInitialized) {
            mapRef.current.injectJavaScript(
              `window.updatePath(${JSON.stringify(newPath)}); true;`,
            );
          }
          return newPath;
        }
        return prevCrumbs;
      });
    }

    // Update React state (for UI) and map
    setMarkerPosition({ latitude: lat, longitude: lng, heading: hdg || 0 });
    if (mapRef.current && mapInitialized) {
      mapRef.current.injectJavaScript(
        `window.updateBoat(${lat}, ${lng}, ${hdg || 0}); true;`,
      );
    }
  };

  // --- MAP READY HANDLER ---
  const handleMapReady = (ref: any) => {
    mapRef.current = ref.current;
    setTimeout(() => {
      setMapInitialized(true);
      if (ref.current) {
        ref.current.injectJavaScript(
          `window.updateBoat(${markerPosition.latitude}, ${markerPosition.longitude}, ${markerPosition.heading}); true;`,
        );
        ref.current.injectJavaScript(
          `window.updatePath(${JSON.stringify(breadcrumbs)}); true;`,
        );
        const leafletBounds = [
          [GEOFENCE_BOX.south, GEOFENCE_BOX.west],
          [GEOFENCE_BOX.north, GEOFENCE_BOX.east]
        ];
        ref.current.injectJavaScript(
          `window.drawGeofence(${JSON.stringify(leafletBounds)}); true;`
        );
      }
    }, 500);
  };

  // --- GPS SIMULATOR (UPDATED with PREDICTIVE GEOFENCE) ---
  const [simOn, setSimOn] = useState(false);
  useEffect(() => {
    if (!simOn) return;

    let { latitude: lat, longitude: lng, heading: compassHdg } = boatPositionRef.current;
    let mathHdg = (450 - compassHdg) % 360; // 0=East, 90=North
    
    const dt = 0.25; // seconds
    const MAX_SPEED_MPS = 2.0;
    const MAX_TURN_DPS = 90;

    const id = setInterval(() => {
      const throttle = CommandLoop.q(CommandLoop.latest.throttle);
      const steering = CommandLoop.q(CommandLoop.latest.steering);

      const speed_mps = MAX_SPEED_MPS * throttle;
      const turn_rate_dps = MAX_TURN_DPS * steering;

      const newMathHdg = (mathHdg - turn_rate_dps * dt + 360) % 360;
      
      const r = (newMathHdg * Math.PI) / 180;
      const dx = Math.cos(r) * speed_mps * dt;
      const dy = Math.sin(r) * speed_mps * dt;

      const m2degLat = 1 / 111320;
      const m2degLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
      
      const newLat = lat + dy * m2degLat;
      const newLng = lng + dx * m2degLng;

      if (isAutonomous && !isReturningHome && isNearLand(newLat, newLng)) {
        console.log('AUTONOMY: Predictive geofence stop!');
        CommandLoop.setThrottle(0);
        CommandLoop.setSteering(0);
        
        const currentCompassHdg = (450 - mathHdg) % 360;
        handleTelemetryLine(
          `GPS:${lat.toFixed(6)},${lng.toFixed(6)},${currentCompassHdg.toFixed(1)}`
        );

      } else {
        lat = newLat;
        lng = newLng;
        mathHdg = newMathHdg;
        
        const newCompassHdg = (450 - mathHdg) % 360;
        handleTelemetryLine(
          `GPS:${lat.toFixed(6)},${lng.toFixed(6)},${newCompassHdg.toFixed(1)}`
        );
      }
    }, dt * 1000);

    return () => clearInterval(id);
   }, [simOn, isAutonomous, isReturningHome]);

  // --- LIFECYCLE ---
  useEffect(() => {
    const t = setTimeout(() => setShowSplashScreen(false), 1000);
    CommandLoop.start();
    return () => {
      clearTimeout(t);
      CommandLoop.stop();
      if (navigationInterval.current) {
        clearInterval(navigationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'control') Orientation.lockToLandscape();
    else Orientation.lockToPortrait();
    return () => {
      Orientation.lockToPortrait();
    };
  }, [activeTab]);

  // --- BLUETOOTH DATA LISTENER ---
  useEffect(() => {
    if (!connected) return;
    setSimOn(false); 
    const sub = connected.onData((data) => {
      handleTelemetryLine(data.data);
    });
    return () => {
      sub.remove();
    };
  }, [connected]);

  // --- RENDER ---
  const renderSplashScreen = () => (
    <View style={styles.splashContainer}>
      <Text style={styles.splashText}>RC Drone Boat ⚓</Text>
    </View>
  );

  if (showSplashScreen) return renderSplashScreen();

  return (
    <SafeAreaView style={styles.appContainer}>
      <View style={styles.mainContent}>
        {activeTab === 'bluetooth' && (
          <BluetoothScreen
            connected={connected}
            quickConnect={quickConnect}
            simOn={simOn}
            setSimOn={setSimOn}
          />
        )}
        {activeTab === 'control' && (
          <ControlScreen
            handleMapReady={handleMapReady}
            isAutonomous={isAutonomous}
            setAutonomous={setAutonomous}
            onReturnBoats={startReturnToHome}
            isReturningHome={isReturningHome}
          />
        )}
        {activeTab === 'map' && (
          <MapScreen
            handleMapReady={handleMapReady}
          />
        )}
      </View>

      {/* Bottom Nav stays in App.tsx */}
      <View style={styles.bottomNav}>
        <Pressable
          style={styles.navButton}
          onPress={() => setActiveTab('bluetooth')}>
          <Text
            style={[
              styles.navIcon,
              activeTab === 'bluetooth' && styles.activeNavIcon,
            ]}>
            ᛒ
          </Text>
          {activeTab === 'bluetooth' && <View style={styles.activeIndicator} />}
        </Pressable>
        <Pressable
          style={styles.navButton}
          onPress={() => setActiveTab('control')}>
          <View
            style={[
              styles.circleIcon,
              activeTab === 'control' && styles.activeCircleIcon,
            ]}
          />
          {activeTab === 'control' && <View style={styles.activeIndicator} />}
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => setActiveTab('map')}>
          <View
            style={[
              styles.mapPinIcon,
              activeTab === 'map' && styles.activeMapPinIcon,
            ]}>
            <View style={styles.mapPinCircle} />
            <View style={styles.mapPinPoint} />
          </View>
          {activeTab === 'map' && <View style={styles.activeIndicator} />}
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

export default App;