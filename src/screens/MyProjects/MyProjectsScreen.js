import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { getAllProjects, deleteProject } from '../../utils/storage';

export default function MyProjectsScreen({navigation}) {
  const [projects, setProjects] = useState([]);

  const loadProjects = async () => {
    const loaded = await getAllProjects();
    setProjects(loaded);
  };

  const handleDelete = async (id) => {
    Alert.alert('Delete Project', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteProject(id);
          await loadProjects();
        },
      },
    ]);
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProjects);
    return unsubscribe;
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Projects</Text>
      {projects.length === 0 ? (
        <Text>No projects yet.</Text>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.projectItem}>
              <Text style={styles.projectName}>{item.name}</Text>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1, backgroundColor: 'white' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  projectItem: {
    padding: 12,
    backgroundColor: '#f3f3f3',
    marginBottom: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  projectName: { fontSize: 16 },
  deleteText: { color: 'red', fontWeight: 'bold' },
});
