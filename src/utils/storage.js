import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECTS_KEY = 'athlete_spark_projects';

export const getAllProjects = async () => {
  const raw = await AsyncStorage.getItem('projects');
  return raw ? JSON.parse(raw) : [];
};

export const saveProject = async (newProject) => {
  const raw = await AsyncStorage.getItem('projects');
  const existing = raw ? JSON.parse(raw) : [];
  const updated = [...existing, newProject];
  await AsyncStorage.setItem('projects', JSON.stringify(updated));
};

export const updateProject = async (updatedProject) => {
  const raw = await AsyncStorage.getItem('projects');
  const existing = raw ? JSON.parse(raw) : [];
  const updated = existing.map((p) =>
    p.id === updatedProject.id ? updatedProject : p
  );
  await AsyncStorage.setItem('projects', JSON.stringify(updated));
};

export async function deleteProject(id) {
  const existingProjects = await getAllProjects();
  const updated = existingProjects.filter((p) => p.id !== id);
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
}
