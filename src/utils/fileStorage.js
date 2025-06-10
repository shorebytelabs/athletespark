import RNFS from 'react-native-fs';
import { getFileNameFromUri } from './pathHelpers';

export const VIDEO_DIR = `${RNFS.DocumentDirectoryPath}/videos`;

export const ensureVideoDirExists = async () => {
  const exists = await RNFS.exists(VIDEO_DIR);
  if (!exists) {
    await RNFS.mkdir(VIDEO_DIR);
  }
};

const sanitizeName = (name) => name?.replace(/[^a-zA-Z0-9]/g, '') ?? '';

export const generateProjectFileName = (originalUri, project) => {
  const fileName = getFileNameFromUri(originalUri) ?? 'clip.mp4';
  const extension = fileName.split('.').pop().split('?')[0];
  const baseName = fileName.split('.').slice(0, -1).join('.');

  const projectName = sanitizeName(project?.name);
  const projectId = sanitizeName(project?.id);

  const cleanBaseName = baseName.replace(/rn_image_picker_lib_temp_/i, '');
  return `clip_${cleanBaseName}_${projectName}_${projectId}.${extension}`;
};

const waitForStableSize = async (path, maxAttempts = 5, delayMs = 300) => {
  let previousSize = -1;
  for (let i = 0; i < maxAttempts; i++) {
    const stat = await RNFS.stat(path).catch(() => null);
    const currentSize = stat?.size ?? -1;
    if (currentSize > 0 && currentSize === previousSize) return true;
    previousSize = currentSize;
    await new Promise(res => setTimeout(res, delayMs));
  }
  // console.warn('[Storage] File size never stabilized:', path);
  return false;
};

export const saveToPersistentStorage = async (originalPath, project) => {
  await ensureVideoDirExists();

  if (originalPath.startsWith(`file://${VIDEO_DIR}`)) {
    // console.log('[Storage] Already persisted, skipping copy:', originalPath);
    return originalPath;
  }

  const normalizedSrc = originalPath.replace('file://', '');
  const srcExists = await RNFS.exists(normalizedSrc);
  console.log('[Storage] Checking original file:', normalizedSrc, 'Exists:', srcExists);

  if (!srcExists) {
    // console.warn('[Storage] Source does not exist, skipping copy.');
    return originalPath;
  }

  const stable = await waitForStableSize(normalizedSrc);
  if (!stable) {
    // console.warn('[Storage] File is not stable, skipping copy.');
    return originalPath;
  }

  const srcStat = await RNFS.stat(normalizedSrc).catch(() => null);
  if (!srcStat || srcStat.size === 0) {
    // console.warn('[Storage] Source is empty, skipping.');
    return originalPath;
  }

  const newFileName = generateProjectFileName(normalizedSrc, project);
  const destPath = `${VIDEO_DIR}/${newFileName}`;

  const destExists = await RNFS.exists(destPath);
  if (destExists) {
    const destStat = await RNFS.stat(destPath).catch(() => null);
    if (destStat?.size > 0) {
      // console.log('[Storage] Destination already valid, skipping copy.');
      return `file://${destPath}`;
    }
  }

  try {
    // console.log('[Storage] Copying to:', destPath);
    await RNFS.copyFile(normalizedSrc, destPath);

    const destStat = await RNFS.stat(destPath).catch(() => null);
    const destSize = destStat?.size ?? 0;
    // console.log('[Storage] Copied file size:', destSize);

    if (destSize === 0) {
      // console.warn('[Storage] Copied file is empty — potential write conflict.');
      return originalPath;
    }

    return `file://${destPath}`;
  } catch (err) {
    console.error('[Storage] Copy failed:', err);
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
