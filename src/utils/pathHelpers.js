export function getFileNameFromUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const parts = uri.split('/');
  const name = parts.pop();
  return name || null;
}
