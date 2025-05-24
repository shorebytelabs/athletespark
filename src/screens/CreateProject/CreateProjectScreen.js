import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { saveProject } from '../../utils/storage';

const MAX_CLIPS = 5;
const MAX_DURATION = 20; // seconds

export default function CreateProjectScreen({ navigation }) {
  const [clips, setClips] = useState([]);
  const [picking, setPicking] = useState(true); // start picking immediately

  useEffect(() => {
    // Open video picker immediately on mount
    if (picking) {
      launchImageLibrary(
        {
          mediaType: 'video',
          selectionLimit: MAX_CLIPS,
          videoQuality: 'high',
        },
        async (response) => {
          setPicking(false);

          if (response.didCancel) {
            // User cancelled, go back or something
            navigation.goBack();
            return;
          }
          if (response.errorCode) {
            Alert.alert('Error', response.errorMessage);
            navigation.goBack();
            return;
          }
          if (!response.assets || response.assets.length === 0) {
            Alert.alert('No videos selected.');
            navigation.goBack();
            return;
          }

          const validClips = response.assets.filter(
            (clip) => clip.duration <= MAX_DURATION
          );

          if (validClips.length < response.assets.length) {
            Alert.alert('Some clips were longer than 20 seconds and were not added.');
          }

          if (validClips.length === 0) {
            Alert.alert('No valid clips selected.');
            navigation.goBack();
            return;
          }

          setClips(validClips);

          // Create project
          const projectName = `Project_${new Date().toISOString()}`;
          const newProject = {
            id: Date.now().toString(),
            name: projectName,
            clips: validClips,
            createdAt: new Date().toISOString(),
          };

          try {
            await saveProject(newProject);
            Alert.alert(
              'Project Created!',
              `Name: ${projectName}`,
              [
                {
                  text: 'OK',
                  onPress: () => {
                    navigation.replace('VideoEditor', {
                      projectId: newProject.id,
                      projectName,
                      project: newProject,
                    });
                  },
                },
              ],
              { cancelable: false }
            );
          } catch (err) {
            Alert.alert('Error', 'Failed to save project.');
            console.error(err);
          }
        }
      );
    }
  }, [picking, navigation]);

  if (picking) {
    // Show nothing or spinner while picking
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  // Optional: You can render clips summary if you want after picking
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selected Clips</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
