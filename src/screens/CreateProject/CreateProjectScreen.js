import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { saveProject } from '../../utils/storage';
import { colors } from '../../theme/theme';

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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent1} />
      </View>
    );
  }

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
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: colors.background,
  },
  container: { 
    flex: 1,
    padding: 16, 
    backgroundColor: colors.background,
  },
  title: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginBottom: 10,
    color: colors.textPrimary,
  },
  clip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.surface,
    marginVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clipText: { 
    fontSize: 14, 
    maxWidth: '90%',
    color: colors.textPrimary,
  },
});
