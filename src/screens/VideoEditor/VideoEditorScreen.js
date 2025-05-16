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
  const [clips, setClips] = useState(
    project.clips.map((clip) => ({ ...clip, category: null }))
  );
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

  const assignCategory = (category) => {
    if (category === 'Other / Create New') {
      setNewCategoryName('');
      setModalVisible(true);
      return;
    }
    const updatedClips = [...clips];
    updatedClips[currentIndex].category = category;
    setClips(updatedClips);
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
          onPress: () => {
            const updated = customCategories.filter((cat) => cat !== categoryToDelete);
            saveCustomCategories(updated);
            setClips((prevClips) =>
              prevClips.map((clip) =>
                clip.category === categoryToDelete ? { ...clip, category: null } : clip
              )
            );
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
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryButtonSelected: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#333',
  },
  categoryButtonTextSelected: {
    color: '#fff',
  },
  deleteIconContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#999',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  deleteIcon: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 16,
  },
  navButtonsFloating: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  trackingContainer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
});
