import { StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const colors = {
  primary: '#007AFF',
  background: '#FFFFFF',
  surface: '#F2F2F7',
  text: '#000000',
  textSecondary: '#6E6E73',
  error: '#FF3B30',
  success: '#34C759',
  white: '#FFFFFF',
  black: '#000000',
  grey: '#E0E0E0',
  darkGrey: '#333333',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',
};

export const styles = StyleSheet.create({
  // --- App.tsx Styles ---
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  splashText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.white,
  },
  appContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 80,
    borderTopWidth: 1,
    borderTopColor: colors.grey,
    backgroundColor: colors.surface,
  },
  navButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 10,
  },
  navIcon: {
    fontSize: 28,
    color: colors.textSecondary,
  },
  activeNavIcon: {
    color: colors.primary,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 8,
    height: 4,
    width: 24,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  circleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  activeCircleIcon: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  mapPinIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mapPinCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    position: 'absolute',
    top: 4,
  },
  mapPinPoint: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.textSecondary,
    transform: [{ rotate: '180deg' }],
  },
  activeMapPinIcon: {
    mapPinCircle: {
      borderColor: colors.primary,
    },
    mapPinPoint: {
      borderBottomColor: colors.primary,
    },
  },

  // --- Screen Shared Styles ---
  screenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: colors.text,
  },
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // --- BluetoothScreen.tsx Styles ---
  connectButton: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
  },
  connectButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },

  // --- ControlScreen.tsx Styles ---
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey,
  },
  headerIcon: {
    fontSize: 28,
    color: colors.text,
  },
  returnButton: {
    backgroundColor: colors.grey,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  returnButtonText: {
    color: colors.darkGrey,
    fontSize: 16,
    fontWeight: '600',
  },
  controlBody: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  controlCenterColumn: {
    flex: 1,
    height: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  controlMapContainer: {
    flex: 1,
    width: '100%',
    borderWidth: 2,
    borderColor: colors.grey,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 10,
  },
  selectBoatsButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  selectBoatsButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // --- Joystick.tsx Styles ---
  joystickArea: {
    width: 150, // Give a fixed width
    height: 180, // Give a fixed height
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Static (vertical/horizontal)
  joystickOuterStatic: {
    backgroundColor: colors.grey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickInnerStatic: {
    backgroundColor: colors.darkGrey,
  },
  // Animated (both)
  joystickOuter: {
    backgroundColor: colors.grey,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joystickKnob: {
    backgroundColor: colors.darkGrey,
  },
  joystickHintText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // --- Modal Styles (Boat Selector) ---
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: colors.textSecondary,
    fontWeight: 'bold',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 20,
  },
  modalPillButton: {
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  modalPillButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  boatItemButton: {
    width: '100%',
    backgroundColor: colors.surface,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  boatItemText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },

  // --- Settings Modal Styles ---
  settingsContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  settingsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey,
  },
  settingsContent: {
    flex: 1,
    padding: 20,
  },
  settingsButton: {
    backgroundColor: colors.white,
    padding: 18,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.grey,
  },
  settingsButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  settingsCloseButton: {
    backgroundColor: colors.primary,
    padding: 20,
    alignItems: 'center',
  },
  settingsCloseButtonText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 18,
    borderRadius: 10,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: colors.grey,
  },
  settingsLabel: {
    fontSize: 16,
    color: colors.text,
  },
  settingsDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
});
