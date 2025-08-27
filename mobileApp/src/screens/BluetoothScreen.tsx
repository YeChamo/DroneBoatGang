// src/screens/BluetoothScreen.tsx
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

export default function BluetoothScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BLUETOOTH</Text>
      <Text style={styles.subtitle}>Placeholder screen (Android).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 28, fontWeight: '700', letterSpacing: 1},
  subtitle: {marginTop: 8, opacity: 0.6},
});
