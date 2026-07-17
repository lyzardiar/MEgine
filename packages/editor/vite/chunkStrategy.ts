export function editorChunkName(moduleId: string): string | undefined {
  const id = moduleId.replace(/\\/g, '/');
  if (id.includes('/node_modules/@esotericsoftware/spine-')) return 'spine-runtime';
  if (
    id.includes('/node_modules/react/')
    || id.includes('/node_modules/react-dom/')
    || id.includes('/node_modules/scheduler/')
  ) {
    return 'react-runtime';
  }
  if (id.includes('/node_modules/@tauri-apps/')) return 'tauri-runtime';
  return undefined;
}
