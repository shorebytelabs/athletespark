import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';

import { updateProject } from '../../utils/storage'; // import updateProject for saving changes
import AsyncStorage from '@react-native-async-storage/async-storage';

const defaultCategories = [
  'Goal',
  'Assist',
  'Defense',
  'Skill',
  'Save',
  'Key Pass',
  'Other / Create New',
];

const CUSTOM_CATEGORIES_KEY = 'CUSTOM_CATEGORIES';

export default function VideoEditorScreen({ route, navigation }) {
  const { project } = route.params;

  // Initialize clips with existing categories preserved
  const [clips, setClips] = useState(project.clips);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const [customCategories, setCustomCategories] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    loadCustomCategories();
  }, []);

  const loadCustomCategories = async () => {
    try {
      const saved = await AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (saved) {
        setCustomCategories(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load custom categories', e);
    }
  };

  const saveCustomCategories = async (categories) => {
    try {
      await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
      setCustomCategories(categories);
    } catch (e) {
      console.error('Failed to save custom categories', e);
    }
  };

  const allCategories = [...defaultCategories.slice(0, -1), ...customCategories, 'Other / Create New'];

  const currentClip = clips[currentIndex];

  const assignCategory = async (category) => {
    if (category === 'Other / Create New') {
      setNewCategoryName('');
      setModalVisible(true);
      return;
    }
    const updatedClips = [...clips];
    updatedClips[currentIndex].category = category;
    setClips(updatedClips);

    // Persist the updated project with updated clips
    const updatedProject = { ...project, clips: updatedClips };
    try {
      await updateProject(updatedProject);
    } catch (e) {
      console.error('Failed to update project with new category', e);
    }
  };

  const addCustomCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Invalid category', 'Category name cannot be empty');
      return;
    }
    if (customCategories.includes(trimmed) || defaultCategories.includes(trimmed)) {
      Alert.alert('Duplicate category', 'This category already exists');
      return;
    }
    const updated = [...customCategories, trimmed];
    saveCustomCategories(updated);
    setModalVisible(false);
    assignCategory(trimmed);
  };

  const deleteCustomCategory = (categoryToDelete) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete the category "${categoryToDelete}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = customCategories.filter((cat) => cat !== categoryToDelete);
            await saveCustomCategories(updated);

            const updatedClips = clips.map((clip) =>
              clip.category === categoryToDelete ? { ...clip, category: null } : clip
            );
            setClips(updatedClips);

            // Persist updated clips after category deletion
            const updatedProject = { ...project, clips: updatedClips };
            try {
              await updateProject(updatedProject);
            } catch (e) {
              console.error('Failed to update project after deleting category', e);
            }
          },
        },
      ]
    );
  };

  const goNext = () => {
    if (currentIndex < clips.length - 1) setCurrentIndex(currentIndex + 1);
    else Alert.alert('End of clips', 'You have reviewed all clips.');
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>
            {project.name} - Clip {currentIndex + 1} / {clips.length}
          </Text>

          {/* Video Player Placeholder */}
          <View style={styles.videoContainer}>
            <Text>(Video playback would be here for URI: {currentClip.uri})</Text>
          </View>

          {/* Categories */}
          <Text style={styles.subtitle}>Select Category:</Text>
          <View style={styles.categoryList}>
            {allCategories.map((cat) => {
              const isCustom = customCategories.includes(cat);
              const isSelected = currentClip.category === cat;
              return (
                <View key={cat} style={styles.categoryWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.categoryButton,
                      isSelected && styles.categoryButtonSelected,
                    ]}
                    onPress={() => assignCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        isSelected && styles.categoryButtonTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                  {isCustom && (
                    <TouchableOpacity
                      onPress={() => deleteCustomCategory(cat)}
                      style={styles.deleteIconContainer}
                    >
                      <Text style={styles.deleteIcon}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>

          {/* Tracking toggle */}
          <View style={styles.trackingContainer}>
            <Text>Athlete Tracking:</Text>
            <Button
              title={trackingEnabled ? 'Disable' : 'Enable'}
              onPress={() => setTrackingEnabled(!trackingEnabled)}
            />
          </View>

          {/* Add padding so last content is visible above floating buttons */}
          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Floating Navigation Buttons */}
        <View style={styles.navButtonsFloating}>
          <Button title="Previous" onPress={goPrev} disabled={currentIndex === 0} />
          <Button title="Next" onPress={goNext} />
        </View>

        {/* Modal for creating new category */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>
                Create New Category
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Category name"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                <Button title="Cancel" onPress={() => setModalVisible(false)} />
                <Button title="Add" onPress={addCustomCategory} />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, position: 'relative' },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80, // Prevent overlap with nav buttons
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  videoContainer: {
    height: 200,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  subtitle: { fontSize: 14, marginBottom: 4 },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  categoryWrapper: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#999',
    backgroundColor: '#eee',
  },
  categoryButtonSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  categoryButtonText: { fontSize: 14, color: '#333' },
  categoryButtonTextSelected: { color: '#fff', fontWeight: 'bold' },
  deleteIconContainer: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#999',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIcon: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    lineHeight: 14,
  },
  trackingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  navButtonsFloating: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 24,
  },
  input: {
    borderColor: '#999',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
});
