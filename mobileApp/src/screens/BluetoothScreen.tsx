import React from 'react';
import {
  Text,
  Pressable,
  View,
} from 'react-native';
import type { BluetoothDevice } from 'react-native-bluetooth-classic';

// Import our reusable styles
import { styles } from '../styles';

// --- BLUETOOTH SCREEN ---
interface BluetoothScreenProps {
  connected: BluetoothDevice | null;
  quickConnect: () => void;
  simOn: boolean;
  setSimOn: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export const BluetoothScreen = ({ connected, quickConnect, simOn, setSimOn }: BluetoothScreenProps) => (
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
