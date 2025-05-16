import AsyncStorage from '@react-native-async-storage/async-storage';

const PROJECTS_KEY = 'athlete_spark_projects';

export async function getAllProjects() {
  const json = await AsyncStorage.getItem(PROJECTS_KEY);
  return json != null ? JSON.parse(json) : [];
}

export async function saveProject(newProject) {
  const existingProjects = await getAllProjects();
  // Remove any existing project with the same id to avoid duplicates
  const filtered = existingProjects.filter(p => p.id !== newProject.id);
  const updatedProjects = [newProject, ...filtered];
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(updatedProjects));
}

export async function updateProject(updatedProject) {
  const existingProjects = await getAllProjects();
  const updated = existingProjects.map((p) =>
    p.id === updatedProject.id ? updatedProject : p
  );
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
}

export async function deleteProject(id) {
  const existingProjects = await getAllProjects();
  const updated = existingProjects.filter((p) => p.id !== id);
  await AsyncStorage.setItem(PROJECTS_KEY, JSON.stringify(updated));
}
