// Method 1: Open Serial Bluetooth Terminal app directly
import { Linking, Alert } from 'react-native';

// Function to open Serial Bluetooth Terminal app
const openSerialTerminalApp = async () => {
  const packageName = 'de.kai_morich.serial_bluetooth_terminal';
  const playStoreUrl = `market://details?id=${packageName}`;
  const playStoreWebUrl = `https://play.google.com/store/apps/details?id=${packageName}`;

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
    }
  } catch (error) {
    console.log('Error opening Serial Terminal:', error);
    Alert.alert('Error', 'Could not open Serial Bluetooth Terminal app');
  }
};

// Add this button to your Bluetooth screen
<Pressable style={styles.actionButton} onPress={openSerialTerminalApp}>
  <Text style={styles.actionButtonText}>Open Serial Terminal App</Text>
</Pressable>


// ============================================================
// Method 2: Share Bluetooth connection between apps
// ============================================================

/* 
IMPORTANT: You CANNOT share an active Bluetooth connection between apps.
Only ONE app can connect to a Bluetooth device at a time.

Your options are:

1. Use Serial Bluetooth Terminal ONLY for testing/debugging
   - Connect in Serial Terminal to test commands
   - Close Serial Terminal
   - Then connect in your boat app

2. Use Serial Terminal as your primary interface
   - Connect to JDY-31 in Serial Terminal
   - Use it to send all commands manually
   - Your app just shows the map/controls UI
   - (Not practical for real use)

3. Build Bluetooth into your app (what you already have)
   - Best option for end users
   - Use Serial Terminal only during development

4. Use Android Bluetooth Settings
   - Pair device in Android Settings with PIN 1234
   - Then connect in your app
*/


// ============================================================
// Method 3: Simple approach - Just use Android Bluetooth Settings
// ============================================================

const openBluetoothSettings = async () => {
  try {
    await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
  } catch (error) {
    Alert.alert(
      'Open Bluetooth Settings',
      'Go to Settings → Bluetooth and pair with your JDY-31 device using PIN 1234'
    );
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
