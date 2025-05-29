import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYFRAMES_KEY = 'video_keyframes';

export const saveKeyframes = async (keyframes) => {
  try {
    await AsyncStorage.setItem(KEYFRAMES_KEY, JSON.stringify(keyframes));
  } catch (e) {
    console.error('Error saving keyframes:', e);
  }
};

export const loadKeyframes = async () => {
  try {
    const json = await AsyncStorage.getItem(KEYFRAMES_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Error loading keyframes:', e);
    return [];
  }
};

export const clearKeyframes = async () => {
  try {
    await AsyncStorage.removeItem(KEYFRAMES_KEY);
  } catch (e) {
    console.error('Error clearing keyframes:', e);
  }
};
