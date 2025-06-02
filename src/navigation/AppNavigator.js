import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

import MyProjectsScreen from '../screens/MyProjects/MyProjectsScreen';
import AthleteProfilesScreen from '../screens/AthleteProfiles/AthleteProfilesScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import CreateProjectScreen from '../screens/CreateProject/CreateProjectScreen';
import VideoEditorScreen from '../screens/VideoEditor/VideoEditorScreen';
import SmartZoomScreen from '../screens/VideoEditor/SmartZoomScreen';

import { colors, navigationDarkTheme } from '../theme/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function PlaceholderScreen() {
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}

function CreateTabButton(props) {
  const navigation = useNavigation();
  return (
    <CustomTabBarButton
      {...props}
      onPress={() => {
        navigation.navigate('CreateProject', { skipIntro: true });
      }}
    />
  );
}

function CustomTabBarButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.customButton}
    >
      <Text style={styles.customButtonText}>+</Text>
    </TouchableOpacity>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.accent1,
          height: 60,
        },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: '#888',
        tabBarLabelStyle: {
          fontSize: 12,
        },
      }}
    >
      <Tab.Screen name="MyProjects" component={MyProjectsScreen} />
      <Tab.Screen
        name="Create"
        component={PlaceholderScreen}
        options={{
          tabBarButton: (props) => <CreateTabButton {...props} />,
        }}
      />
      <Tab.Screen name="AthleteProfiles" component={AthleteProfilesScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer theme={navigationDarkTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
        }}
      >
        <Stack.Screen
          name="Main"
          component={Tabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="CreateProject" component={CreateProjectScreen} />
        <Stack.Screen name="MyProjects" component={MyProjectsScreen} />
        <Stack.Screen
          name="VideoEditor"
          component={VideoEditorScreen}
          options={{
            title: 'Edit Project',
          }}
        />
        <Stack.Screen
          name="SmartZoom"
          component={SmartZoomScreen}
          options={{ title: 'Smart Zoom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  customButton: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: [{ translateX: -30 }],
    backgroundColor: colors.accent1,
    borderRadius: 35,
    width: 60,
    height: 60,
    borderWidth: 3,
    borderColor: colors.accent1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  customButtonText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 30,
  },
});
