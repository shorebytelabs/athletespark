import React, { useState, useEffect } from 'react';
import { useActionSheet } from '@expo/react-native-action-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  FlatList,
  Alert,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllProjects, updateProject, saveProject } from '../../utils/projectStorage';
import { colors } from '../../theme/theme';

export default function MyProjectsScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const { showActionSheetWithOptions } = useActionSheet();

  const accentColors = [colors.accent1, colors.accent2, colors.highlight];

  const loadProjects = async () => {
    const loaded = await getAllProjects();
    setProjects(loaded);
  };

  const handleProjectOptions = (project) => {
    const options = ['Rename', 'Duplicate', 'Export', 'Delete', 'Cancel'];
    const destructiveButtonIndex = 3;
    const cancelButtonIndex = 4;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      async (buttonIndex) => {
        if (buttonIndex === 0) {
          promptRename(project);
        } else if (buttonIndex === 1) {
          await duplicateProject(project);
        } else if (buttonIndex === 2) {
          Alert.alert('Export', 'Export functionality coming soon.');
        } else if (buttonIndex === 3) {
          Alert.alert(
            'Delete Project',
            'Are you sure you want to delete this project?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await deleteProject(project.id);
                },
              },
            ]
          );
        }
      }
    );
  };

  const promptRename = (project) => {
    Alert.prompt(
      'Rename Project',
      'Enter new name:',
      async (newName) => {
        if (!newName) return;
        const updated = { ...project, name: newName };
        await updateProject(updated);
        await loadProjects();
      },
      'plain-text',
      project.name
    );
  };

  const duplicateProject = async (project) => {
    const newProject = {
      ...project,
      id: Date.now().toString(),
      name: `${project.name}_copy`,
      createdAt: new Date().toISOString(),
    };
    await saveProject(newProject);
    await loadProjects();
  };

  const deleteProject = async (projectId) => {
    try {
      const raw = await AsyncStorage.getItem('projects');
      const allProjects = raw ? JSON.parse(raw) : [];
      const updatedProjects = allProjects.filter((p) => p.id !== projectId);
      await AsyncStorage.setItem('projects', JSON.stringify(updatedProjects));
      setProjects(updatedProjects);
    } catch (err) {
      console.error('Error deleting project:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProjects);
    return unsubscribe;
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>My Projects</Text>
      {projects.length === 0 ? (
        <Text style={styles.emptyMessage}>No projects yet.</Text>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <SafeAreaView style={styles.projectItem}>
              <View style={[styles.colorBar, { backgroundColor: accentColors[index % accentColors.length] }]} />
              <View style={styles.projectContent}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('VideoEditor', { project: item })
                  }
                >
                  <Text style={styles.projectName}>{item.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleProjectOptions(item)}>
                  <Text style={styles.menuDots}>⋮</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
    color: colors.textPrimary,
  },
  emptyMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingTop: 12,
    textAlign: 'center',
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 6,
    overflow: 'hidden',
  },
  colorBar: {
    width: 6,
    height: '100%',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  projectContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectName: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  menuDots: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
});
