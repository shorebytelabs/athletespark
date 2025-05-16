// import React, { useEffect, useState } from 'react';
// import { View, Text, FlatList, Button, Alert, StyleSheet, TouchableOpacity } from 'react-native';
// import { getAllProjects, deleteProject } from '../../utils/storage';

// export default function MyProjectsScreen({navigation}) {
//   const [projects, setProjects] = useState([]);

//   const loadProjects = async () => {
//     const loaded = await getAllProjects();
//     setProjects(loaded);
//   };

//   const handleDelete = async (id) => {
//     Alert.alert('Delete Project', 'Are you sure?', [
//       { text: 'Cancel' },
//       {
//         text: 'Delete',
//         style: 'destructive',
//         onPress: async () => {
//           await deleteProject(id);
//           await loadProjects();
//         },
//       },
//     ]);
//   };

//   useEffect(() => {
//     const unsubscribe = navigation.addListener('focus', loadProjects);
//     return unsubscribe;
//   }, []);

//   return (
//     <View style={styles.container}>
//       <Text style={styles.title}>My Projects</Text>
//       {projects.length === 0 ? (
//         <Text>No projects yet.</Text>
//       ) : (
//         <FlatList
//           data={projects}
//           keyExtractor={(item) => item.id}
//           renderItem={({ item }) => (
//             <View style={styles.projectItem}>
//               <Text style={styles.projectName}>{item.name}</Text>
//               <TouchableOpacity onPress={() => handleDelete(item.id)}>
//                 <Text style={styles.deleteText}>Delete</Text>
//               </TouchableOpacity>
//             </View>
//           )}
//         />
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { padding: 16, flex: 1, backgroundColor: 'white' },
//   title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
//   projectItem: {
//     padding: 12,
//     backgroundColor: '#f3f3f3',
//     marginBottom: 10,
//     borderRadius: 8,
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//   },
//   projectName: { fontSize: 16 },
//   deleteText: { color: 'red', fontWeight: 'bold' },
// });
import React, { useState, useEffect } from 'react';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { getAllProjects, updateProject, saveProject } from '../../utils/storage'; // already used
import { SafeAreaView, View, Text, FlatList, Button, Alert, StyleSheet, TouchableOpacity } from 'react-native';

export default function MyProjectsScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const { showActionSheetWithOptions } = useActionSheet();

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
          await deleteProject(project.id);
          await loadProjects();
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

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadProjects);
    return unsubscribe;
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>My Projects</Text>
      {projects.length === 0 ? (
        <Text>No projects yet.</Text>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SafeAreaView style={styles.projectItem}>
              <Text style={styles.projectName}>{item.name}</Text>
              <TouchableOpacity onPress={() => handleProjectOptions(item)}>
                <Text style={styles.menuDots}>⋮</Text>
              </TouchableOpacity>
            </SafeAreaView>
          )}
        />
      )}
    </SafeAreaView>
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
  menuDots: { fontSize: 20, fontWeight: 'bold' },
});
