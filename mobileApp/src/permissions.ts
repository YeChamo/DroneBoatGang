// src/permissions.ts
import {PermissionsAndroid, Platform} from 'react-native';

export async function ensureBtPermissions() {
  if (Platform.OS !== 'android') return true;

  const api = Platform.Version as number;
  if (api >= 31) {
    const scan = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      { title: 'Bluetooth scan', message: 'Allow scanning for Bluetooth devices' }
    );
    const conn = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      { title: 'Bluetooth connect', message: 'Allow connecting to Bluetooth devices' }
    );
    return scan === PermissionsAndroid.RESULTS.GRANTED &&
           conn === PermissionsAndroid.RESULTS.GRANTED;
  } else {
    const loc = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      { title: 'Location required', message: 'Needed to discover Bluetooth devices' }
    );
    return loc === PermissionsAndroid.RESULTS.GRANTED;
  }
}
