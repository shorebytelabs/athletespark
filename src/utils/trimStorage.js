import AsyncStorage from '@react-native-async-storage/async-storage';

const getTrimStorageKey = (projectId, clipId) => `trim_${projectId}_${clipId}`;

// Save trim info for a clip in a project
export async function saveTrimInfo(projectId, clipId, trimData) {
  try {
    const key = getTrimStorageKey(projectId, clipId);
    await AsyncStorage.setItem(key, JSON.stringify(trimData));
  } catch (e) {
    console.error('Error saving trim info:', e);
  }
}

// Load trim info for a clip in a project
export async function loadTrimInfo(projectId, clipId) {
  try {
    const key = getTrimStorageKey(projectId, clipId);
    const json = await AsyncStorage.getItem(key);
    return json != null ? JSON.parse(json) : null;
  } catch (e) {
    console.error('Error loading trim info:', e);
    return null;
  }
}

// Remove trim info for a clip in a project
export async function removeTrimInfo(projectId, clipId) {
  try {
    const key = getTrimStorageKey(projectId, clipId);
    await AsyncStorage.removeItem(key);
  } catch (e) {
    console.error('Error removing trim info:', e);
  }
}
