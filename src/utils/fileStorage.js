import RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';
import { getFileNameFromUri } from './pathHelpers';

const VIDEO_DIR = `${RNFS.DocumentDirectoryPath}/videos`;

export const ensureVideoDirExists = async () => {
  const exists = await RNFS.exists(VIDEO_DIR);
  if (!exists) {
    await RNFS.mkdir(VIDEO_DIR);
  }
};

// Optional: remove symbols and spaces
const sanitizeName = (name) => name?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

export const generateProjectFileName = (originalUri, project) => {
  const fileName = getFileNameFromUri(originalUri) ?? 'clip.mov';
  const extension = fileName.split('.').pop().split('?')[0];
  const baseName = fileName.split('.').slice(0, -1).join('.');

  const projectName = sanitizeName(project?.name);
  const projectId = sanitizeName(project?.id);

  // If the filename already ends with _<projectName>_<projectId>, remove that part
  const pattern = new RegExp(`_${projectName}_${projectId}$`);
  const cleanBaseName = baseName.replace(pattern, '');

  return `${cleanBaseName}_${projectName}_${projectId}.${extension}`;
};

export const saveToPersistentStorage = async (originalPath, project) => {
  await ensureVideoDirExists();

  const normalizedSrc = originalPath.replace('file://', '');
  const exists = await RNFS.exists(normalizedSrc);

  if (!exists) {
    console.warn('Original file does not exist, skipping:', normalizedSrc);
    return originalPath; // fallback or null if you want to skip
  }

  const newFileName = generateProjectFileName(normalizedSrc, project);
  const destPath = `${VIDEO_DIR}/${newFileName}`;

  console.log('Copying from:', originalPath);
  console.log('Copying to:', destPath);

  try {
    await RNFS.copyFile(normalizedSrc, destPath);
    return `file://${destPath}`;
  } catch (err) {
    if (err.message.includes('already exists')) {
      return `file://${destPath}`;
    }
    console.error('Error copying file to persistent storage:', err);
    return originalPath;
  }
};

export const deleteClipFromStorage = async (fileName) => {
  const path = `${VIDEO_DIR}/${fileName}`;
  const exists = await RNFS.exists(path);
  if (exists) {
    await RNFS.unlink(path);
  }
};
