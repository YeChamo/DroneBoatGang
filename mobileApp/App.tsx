// App.tsx
import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import BluetoothScreen from './src/screens/BluetoothScreen';
import MapScreen from './src/screens/MapScreen';

export type RootTabParamList = {
  BLUETOOTH: undefined;
  MAP: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          tabBarLabelStyle: {fontSize: 12},
        }}
      >
        <Tab.Screen name="BLUETOOTH" component={BluetoothScreen} />
        <Tab.Screen name="MAP" component={MapScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
