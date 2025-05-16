import React, { useState } from 'react';
import { View, Text, Button, FlatList, Image, Alert, StyleSheet } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { saveProject } from '../../utils/storage';

const MAX_CLIPS = 5;
const MAX_DURATION = 20; // seconds

export default function CreateProjectScreen({ navigation }) {
  const [clips, setClips] = useState([]);

  const selectVideos = () => {
    launchImageLibrary(
      {
        mediaType: 'video',
        selectionLimit: MAX_CLIPS,
        videoQuality: 'high',
      },
      (response) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          Alert.alert('Error', response.errorMessage);
          return;
        }

        const validClips = response.assets.filter(
          (clip) => clip.duration <= MAX_DURATION
        );

        if (validClips.length < response.assets.length) {
          Alert.alert('Some clips were longer than 20s and were not added.');
        }

        setClips(validClips);
      }
    );
  };

  const handleCreateProject = async () => {
  if (clips.length === 0) {
    Alert.alert('Please select at least 1 video clip.');
    return;
  }

  const projectName = `Project_${new Date().toISOString()}`;
  const newProject = {
    id: Date.now().toString(),
    name: projectName,
    clips: clips,
    createdAt: new Date().toISOString(),
  };

  try {
    await saveProject(newProject);
    Alert.alert('Project Created!', `Name: ${projectName}`);
    navigation.navigate('MyProjects');
  } catch (err) {
    Alert.alert('Error', 'Failed to save project.');
    console.error(err);
  }
};

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select up to {MAX_CLIPS} video clips</Text>
      <Button title="Pick Videos" onPress={selectVideos} />
      <FlatList
        data={clips}
        keyExtractor={(item) => item.uri}
        renderItem={({ item }) => (
          <View style={styles.clip}>
            <Text numberOfLines={1} style={styles.clipText}>{item.fileName}</Text>
            <Text style={styles.clipText}>{Math.round(item.duration)}s</Text>
          </View>
        )}
      />
      {clips.length > 0 && (
        <Button title="Create Project" onPress={handleCreateProject} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1, backgroundColor: 'white' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  clip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#eee',
    marginVertical: 4,
    borderRadius: 6,
  },
  clipText: { fontSize: 14, maxWidth: '90%' },
});
