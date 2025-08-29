import React, { useState, useRef, useEffect } from 'react';
import { SafeAreaView, StyleSheet, Text, Pressable, View, Animated, Easing, Dimensions } from 'react-native';
import Orientation from 'react-native-orientation-locker';

const App = () => {
  const [isToggled, setIsToggled] = useState(false);
  const [showControlScreen, setShowControlScreen] = useState(false);

  const handleToggle = () => setIsToggled(prev => !prev);

  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [rotation]);

  const rotateInterpolate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Lock/unlock orientation when control screen shows/hides
  useEffect(() => {
    if (showControlScreen) {
      Orientation.lockToLandscape();
    } else {
      Orientation.lockToPortrait();
    }
  }, [showControlScreen]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Main screen content */}
      <Text style={styles.title}>Drone Boat App</Text>
      <View style={styles.centerContent}>
        <View style={styles.radar}>
          <Animated.View
            style={[
              styles.radarLine,
              {
                transform: [
                  { translateX: -1 },
                  { translateY: 62.5 },
                  { rotate: rotateInterpolate },
                  { translateY: -62.5 },
                ],
              },
            ]}
          />
        </View>

        <Text style={styles.bluetooth}>Bluetooth</Text>
        <Pressable
          onPress={handleToggle}
          style={[styles.button, { backgroundColor: isToggled ? 'blue' : 'grey' }]}
        >
          <Text style={styles.buttonText}>{isToggled ? 'ON' : 'OFF'}</Text>
        </Pressable>

        {isToggled && (
          <Pressable
            onPress={() => setShowControlScreen(true)}
            style={[styles.button, { marginTop: 20, backgroundColor: '#006400' }]}
          >
            <Text style={styles.buttonText}>Go to Control Screen</Text>
          </Pressable>
        )}
      </View>

      {/* Control screen overlay */}
      {showControlScreen && (
        <View style={styles.controlOverlay}>
          <Text style={styles.title}>Boat Control</Text>
          <Text style={{ fontSize: 18, marginTop: 20 }}>Joystick + Throttle would go here</Text>
          <Pressable
            style={[styles.button, { marginTop: 40 }]}
            onPress={() => setShowControlScreen(false)}
          >
            <Text style={styles.buttonText}>Back</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6f2e6',
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    textAlign: 'center',
    fontWeight: 'bold',
    marginTop: 25,
    color: '#004d00',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radar: {
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 2,
    borderColor: '#006400',
    backgroundColor: 'rgba(0, 100, 0, 0.1)',
    marginBottom: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  radarLine: {
    width: 2,
    height: 125,
    backgroundColor: '#00FF00',
    position: 'absolute',
    bottom: 125,
    left: '50%',
  },
  bluetooth: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controlOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: height, // swap width/height for landscape
    height: width,
    backgroundColor: '#d9f2d9',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});

export default App;
