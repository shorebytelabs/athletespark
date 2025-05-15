import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MyProjectsScreen from '../screens/MyProjects/MyProjectsScreen';
import AthleteProfilesScreen from '../screens/AthleteProfiles/AthleteProfilesScreen';
import { View, TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import HomeScreen from '../screens/Home/HomeScreen';
import { NavigationContainer } from '@react-navigation/native';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function CustomTabBarButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: '#000',
        borderRadius: 30,
        padding: 10,
        marginBottom: 20
      }}
    >
      <Text style={{ color: '#fff', fontSize: 24 }}>＋</Text>
    </TouchableOpacity>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="MyProjects" component={MyProjectsScreen} />
      <Tab.Screen
        name="Create"
        component={HomeScreen}
        options={{
          tabBarButton: (props) => <CustomTabBarButton {...props} />
        }}
      />
      <Tab.Screen name="AthleteProfiles" component={AthleteProfilesScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
