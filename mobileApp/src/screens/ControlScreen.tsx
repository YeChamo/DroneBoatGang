import React, { useState } from 'react';
import {
  SafeAreaView,
  Text,
  Pressable,
  View,
  Modal,
  Switch,
} from 'react-native';

// Import our reusable components and styles
import { LeafletMap } from '../components/LeafletMap';
import Joystick from '../components/Joystick';
import { styles } from '../styles';

// --- CONTROL SCREEN ---
interface ControlScreenProps {
  handleMapReady: (ref: any) => void;
  isAutonomous: boolean;
  setAutonomous: (value: boolean) => void;
  onReturnBoats: () => void;
  isReturningHome: boolean; // <-- Add new prop
}

const ControlScreen = ({
  handleMapReady,
  isAutonomous,
  setAutonomous,
  onReturnBoats,
  isReturningHome, // <-- Destructure prop
}: ControlScreenProps) => {
  const [showBoatSelector, setShowBoatSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ... (renderBoatSelectorModal is unchanged)
  const renderBoatSelectorModal = () => (
    <Modal
      animationType="fade"
      transparent
      visible={showBoatSelector}
      onRequestClose={() => setShowBoatSelector(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Pressable
            style={styles.closeButton}
            onPress={() => setShowBoatSelector(false)}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalPillButton}>
              <Text style={styles.modalPillButtonText}>Select All</Text>
            </Pressable>
            <Pressable style={styles.modalPillButton}>
              <Text style={styles.modalPillButtonText}>Deselect All</Text>
            </Pressable>
          </View>
          <Pressable style={styles.boatItemButton}>
            <Text style={styles.boatItemText}>Boat 1</Text>
          </Pressable>
          <Pressable style={styles.boatItemButton}>
            <Text style={styles.boatItemText}>Boat 2</Text>
          </Pressable>
          <Pressable style={styles.boatItemButton}>
            <Text style={styles.boatItemText}>Boat 3</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  // ... (renderSettingsModal is unchanged)
  const renderSettingsModal = () => (
    <Modal
      animationType="slide"
      visible={showSettings}
      onRequestClose={() => setShowSettings(false)}>
      <SafeAreaView style={styles.settingsContainer}>
        <Text style={styles.settingsTitle}>SETTINGS</Text>
        <View style={styles.settingsContent}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Semi-Autonomous Mode</Text>
            <Switch
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={isAutonomous ? '#f5dd4b' : '#f4f3f4'}
              ios_backgroundColor="#3e3e3e"
              onValueChange={setAutonomous}
              value={isAutonomous}
            />
          </View>
          <Text style={styles.settingsDescription}>
            Enables geofencing to prevent running aground and activates
            "Return to Home" feature.
          </Text>

          <Pressable style={styles.settingsButton}>
            <Text style={styles.settingsButtonText}>Max Boat Speed</Text>
          </Pressable>
          <Pressable style={styles.settingsButton}>
            <Text style={styles.settingsButtonText}>
              Anything Else We May Want to Include
            </Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.settingsCloseButton}
          onPress={() => setShowSettings(false)}>
          <Text style={styles.settingsCloseButtonText}>Close</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
  
  return (
    <View style={styles.screenContainer}>
      {renderBoatSelectorModal()}
      {renderSettingsModal()}

      <View style={styles.controlHeader}>
        <Pressable onPress={() => setShowSettings(true)}>
          <Text style={styles.headerIcon}>⚙</Text>
        </Pressable>
        <Pressable
          style={styles.returnButton}
          onPress={onReturnBoats}>
          <Text style={styles.returnButtonText}>
            {/* UPDATED: Change text based on mode */}
            {isReturningHome ? 'Cancel Return' : 'Return to Home'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.controlBody}>
        {/* Pass isReturningHome to disable joystick */}
        <Joystick axis="vertical" isReturningHome={isReturningHome} />
        
        <View style={styles.controlCenterColumn}>
          <View style={styles.controlMapContainer}>
            <LeafletMap interactive={false} onMapReady={handleMapReady} />
          </View>
          <Pressable
            style={styles.selectBoatsButton}
            onPress={() => setShowBoatSelector(true)}>
            <Text style={styles.selectBoatsButtonText}>Select Boats</Text>
          </Pressable>
        </View>
        
        {/* Pass isReturningHome to disable joystick */}
        <Joystick axis="horizontal" isReturningHome={isReturningHome} />
      </View>
    </View>
  );
};

export default ControlScreen;