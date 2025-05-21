import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MyProjectsScreen from '../screens/MyProjects/MyProjectsScreen';
import AthleteProfilesScreen from '../screens/AthleteProfiles/AthleteProfilesScreen';
import { View, TouchableOpacity, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import HomeScreen from '../screens/Home/HomeScreen';
import { NavigationContainer } from '@react-navigation/native';
import CreateProjectScreen from '../screens/CreateProject/CreateProjectScreen';
import VideoEditorScreen from '../screens/VideoEditor/VideoEditorScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function CustomTabBarButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        position: 'absolute',
        bottom: 20, // lifts above the tab bar
        left: '50%',
        transform: [{ translateX: -35 }], // half width of button (70/2)
        backgroundColor: '#000',
        borderRadius: 35, // half of 70 for perfect circle
        width: 60,
        height: 60,
        borderWidth: 4,
        borderColor: '#ccc',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 5,  // Android shadow
        shadowColor: '#000', // iOS shadow
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
      }}
    >
      <Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold', lineHeight: 30 }}>
        +
      </Text>
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
        <Stack.Screen name="CreateProject" component={CreateProjectScreen} />
        <Stack.Screen name="MyProjects" component={MyProjectsScreen} />
        <Stack.Screen name="VideoEditor" component={VideoEditorScreen} options={{ title: 'Edit Project' }}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
