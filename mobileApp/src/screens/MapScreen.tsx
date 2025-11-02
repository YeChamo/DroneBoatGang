import React from 'react';
import { View } from 'react-native';

// Import our reusable components and styles
import { LeafletMap } from '../components/LeafletMap';
import { styles } from '../styles';

// --- MAP SCREEN ---
interface MapScreenProps {
  handleMapReady: (ref: any) => void;
}

export const MapScreen = ({ handleMapReady }: MapScreenProps) => {
  return (
    <View style={styles.screenContainer}>
      <LeafletMap interactive={true} onMapReady={handleMapReady} />
    </View>
  );
};