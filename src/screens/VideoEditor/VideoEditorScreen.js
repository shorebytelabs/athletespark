import React, { useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { Video } from 'expo-av'; // We can swap out with react-native-video if you prefer non-expo
import { ScrollView } from 'react-native-gesture-handler';

const defaultCategories = [
  'Goal',
  'Assist',
  'Defense',
  'Skill',
  'Save',
  'Key Pass',
  'Other / Create New ',
];

export default function VideoEditorScreen({ route, navigation }) {
  // Receive project & clips via route params
  const { project } = route.params;

  const [clips, setClips] = useState(
    project.clips.map((clip) => ({ ...clip, category: null }))
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const currentClip = clips[currentIndex];

  const assignCategory = (category) => {
    const updatedClips = [...clips];
    updatedClips[currentIndex].category = category;
    setClips(updatedClips);
  };

  const goNext = () => {
    if (currentIndex < clips.length - 1) setCurrentIndex(currentIndex + 1);
    else Alert.alert('End of clips', 'You have reviewed all clips.');
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{project.name} - Clip {currentIndex + 1} / {clips.length}</Text>

      {/* Video Player */}
      <View style={styles.videoContainer}>
        {/* Placeholder for now */}
        <Text style={{ marginBottom: 10 }}>
          (Video playback would be here for URI: {currentClip.uri})
        </Text>
      </View>

      {/* Categories */}
      <Text style={styles.subtitle}>Select Category:</Text>
      <ScrollView horizontal contentContainerStyle={styles.categoryList}>
        {defaultCategories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryButton,
              currentClip.category === cat && styles.categoryButtonSelected,
            ]}
            onPress={() => assignCategory(cat)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                currentClip.category === cat && styles.categoryButtonTextSelected,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.navButtons}>
        <Button title="Previous" onPress={goPrev} disabled={currentIndex === 0} />
        <Button title="Next" onPress={goNext} />
      </View>

      {/* Tracking toggle */}
      <View style={styles.trackingContainer}>
        <Text>Athlete Tracking:</Text>
        <Button
          title={trackingEnabled ? 'Disable' : 'Enable'}
          onPress={() => setTrackingEnabled(!trackingEnabled)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  videoContainer: {
    height: 200,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  subtitle: { fontSize: 16, marginBottom: 8 },
  categoryList: { paddingVertical: 8 },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
    marginRight: 10,
  },
  categoryButtonSelected: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    color: '#333',
  },
  categoryButtonTextSelected: {
    color: '#fff',
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  trackingContainer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
