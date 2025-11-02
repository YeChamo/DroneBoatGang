import React, { useRef } from 'react';
import { View, Text, PanResponder, Animated } from 'react-native';
import { styles } from '../styles';
import CommandLoop from '../CommandLoop';

// --- Constants based on styles ---
const STICK_SIZE_BOTH = 150;
const KNOB_SIZE_BOTH = 60;

const STICK_SIZE_V = { width: 80, height: 150 };
const KNOB_SIZE_V = { width: 40, height: 100 };

const STICK_SIZE_H = { width: 150, height: 80 };
const KNOB_SIZE_H = { width: 100, height: 40 };

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

// --- Add new props ---
interface JoystickProps {
  axis?: 'both' | 'vertical' | 'horizontal';
  isReturningHome?: boolean;
}

const Joystick = ({ axis = 'both', isReturningHome = false }: JoystickProps) => {
  const isVertical = axis === 'vertical';
  const isHorizontal = axis === 'horizontal';
  const isBoth = axis === 'both';

  // --- Determine sizes ---
  let outerSizing, knobSizing, hLimit, vLimit;

  if (isVertical) {
    outerSizing = { ...STICK_SIZE_V, borderRadius: 40 };
    knobSizing = { ...KNOB_SIZE_V, borderRadius: 20 };
    hLimit = (STICK_SIZE_V.width - KNOB_SIZE_V.width) / 2;
    vLimit = (STICK_SIZE_V.height - KNOB_SIZE_V.height) / 2;
  } else if (isHorizontal) {
    outerSizing = { ...STICK_SIZE_H, borderRadius: 40 };
    knobSizing = { ...KNOB_SIZE_H, borderRadius: 20 };
    hLimit = (STICK_SIZE_H.width - KNOB_SIZE_H.width) / 2;
    vLimit = (STICK_SIZE_H.height - KNOB_SIZE_H.height) / 2;
  } else {
    outerSizing = { width: STICK_SIZE_BOTH, height: STICK_SIZE_BOTH, borderRadius: STICK_SIZE_BOTH / 2 };
    knobSizing = { width: KNOB_SIZE_BOTH, height: KNOB_SIZE_BOTH, borderRadius: KNOB_SIZE_BOTH / 2 };
    hLimit = (STICK_SIZE_BOTH - KNOB_SIZE_BOTH) / 2;
    vLimit = (STICK_SIZE_BOTH - KNOB_SIZE_BOTH) / 2;
  }

  // --- Animated view using PanResponder ---
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      // --- UPDATED: Disable joystick if returning home ---
      onStartShouldSetPanResponder: () => !isReturningHome,
      onPanResponderMove: (e, gesture) => {
        // --- UPDATED: Stop if returning home ---
        if (isReturningHome) return;

        // Get delta movements
        let x = gesture.dx;
        let y = gesture.dy;

        // Apply axis constraints
        if (isVertical) x = 0;
        if (isHorizontal) y = 0;
        
        // Clamp position
        const clampedX = clamp(x, -hLimit, hLimit);
        const clampedY = clamp(y, -vLimit, vLimit);
        
        // Update the animated value
        pan.setValue({ x: clampedX, y: clampedY });

        // Send commands
        // Normalize values from -1 to 1
        const normalizedX = hLimit === 0 ? 0 : clamp(clampedX / hLimit, -1, 1);
        const normalizedY = vLimit === 0 ? 0 : clamp(-clampedY / vLimit, -1, 1); // Y is inverted

        if (isVertical || isBoth) CommandLoop.setThrottle(normalizedY);
        if (isHorizontal || isBoth) CommandLoop.setSteering(normalizedX);
      },
      onPanResponderRelease: () => {
        // --- UPDATED: Stop if returning home ---
        if (isReturningHome) return;

        // Spring back to center
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          friction: 5,
          useNativeDriver: false, // Must be false for layout animation
        }).start();
        
        // Send stop commands
        if (isVertical || isBoth) CommandLoop.setThrottle(0);
        if (isHorizontal || isBoth) CommandLoop.setSteering(0);
      },
    })
  ).current;

  return (
    <View style={styles.joystickArea}>
      {/* Dim the joystick if disabled */}
      <View style={[styles.joystickOuter, outerSizing, isReturningHome && { opacity: 0.3 }]}>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            pan.getLayout(), // This applies the x/y translation
            styles.joystickKnob,
            knobSizing,
          ]}
        />
      </View>
      <Text style={styles.joystickHintText}>
        {isVertical ? 'Throttle' : isHorizontal ? 'Steering' : 'Manual Control'}
      </Text>
    </View>
  );
};

export default Joystick;