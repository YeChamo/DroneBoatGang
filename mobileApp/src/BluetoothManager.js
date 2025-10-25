// src/BluetoothManager.js
import RNBluetoothClassic from 'react-native-bluetooth-classic';

/**
 * Minimal wrapper around react-native-bluetooth-classic for SPP/RFCOMM modules
 * (HC-05/06, JDY, etc.). Pure JS to avoid TS parse errors in Metro.
 */
const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';

class BluetoothManager {
  device = null;       // cached device instance from the library
  isConnecting = false;

  async listPaired() {
    return RNBluetoothClassic.getBondedDevices();
  }

  /**
   * Find first paired SPP-like device by name/address regex and connect.
   */
  async connectAuto(regex = /(JDY|HC|SPP|Serial|BT)/i) {
    const bonded = await this.listPaired();
    if (!bonded || bonded.length === 0) {
      throw new Error('No paired (bonded) devices found');
    }
    const target =
      bonded.find(d => regex.test(d?.name ?? '') || regex.test(d?.address ?? '')) ||
      bonded[0];

    return this.connectTo(target.address);
  }

  /**
   * Connect to a specific MAC address via RFCOMM/SPP.
   */
  async connectTo(address) {
    if (this.isConnecting) return this.device;
    this.isConnecting = true;

    try {
      // Use the device object and call .connect with SPP UUID
      const dev = await RNBluetoothClassic.getDevice(address);

      // If already connected, reuse it
      const already = await dev.isConnected();
      if (!already) {
        const ok = await dev.connect({
          connectorType: 'rfcomm',
          uuid: SPP_UUID,
          insecure: true,   // many hobby modules require insecure RFCOMM
          delimiter: '\n',
        });
        if (!ok) throw new Error('Failed to open RFCOMM session');
      }

      this.device = dev;
      return dev;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect() {
    try {
      if (this.device) {
        await this.device.disconnect();
      } else {
        // Fallback: disconnect any default connection
        await RNBluetoothClassic.disconnect();
      }
    } finally {
      this.device = null;
    }
  }

  async isConnected() {
    if (!this.device) return false;
    try {
      return this.device.isConnected();
    } catch {
      return false;
    }
  }

  async write(line) {
    if (!this.device) throw new Error('No device connected');
    return this.device.write(line);
  }
}

export default new BluetoothManager();
