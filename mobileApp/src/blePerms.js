// src/blePerms.js
import {PermissionsAndroid, Platform} from 'react-native';

export async function ensureBtPermissions(forScan = false) {
  const sdk = Number(Platform.Version); // Android API level as number
  const isAndroid = Platform.OS === 'android';
  if (!isAndroid) return { ok: true, details: { reason: 'not-android' } };

  try {
    const RNBluetoothClassic = require('react-native-bluetooth-classic').default;
    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    if (!enabled) {
      return { ok: false, details: { reason: 'bluetooth-off' } };
    }
  } catch (e) {
  }

  if (sdk >= 31) {
    const permsToAsk = ['android.permission.BLUETOOTH_CONNECT'];
    if (forScan) {
      permsToAsk.push('android.permission.BLUETOOTH_SCAN');
    }

    const results = await PermissionsAndroid.requestMultiple(permsToAsk);
    const connectGranted = results['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;
    const scanGranted = !forScan || results['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED;

    return { ok: connectGranted && scanGranted, details: { results, sdk } };
  }

  if (forScan) {
    const resFine = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const fineGranted = resFine === PermissionsAndroid.RESULTS.GRANTED;
    let coarseGranted = true;
    if (PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION) {
      const resCoarse = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
      coarseGranted = resCoarse === PermissionsAndroid.RESULTS.GRANTED;
    }
    return { ok: fineGranted && coarseGranted, details: { resFine, sdk } };
  }

  return { ok: true, details: { sdk } };
}
