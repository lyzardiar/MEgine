export const EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES = 500_000;

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

export interface EditorJavaScriptChunkSize {
  fileName: string;
  bytes: number;
}

export function editorChunkBudgetViolations(
  chunks: readonly EditorJavaScriptChunkSize[],
  budgetBytes = EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES,
): EditorJavaScriptChunkSize[] {
  const budget = Number.isFinite(budgetBytes) ? Math.max(0, Math.floor(budgetBytes)) : 0;
  return chunks
    .filter((chunk) => Number.isFinite(chunk.bytes) && chunk.bytes > budget)
    .map((chunk) => ({ fileName: chunk.fileName, bytes: chunk.bytes }))
    .sort((left, right) => right.bytes - left.bytes || left.fileName.localeCompare(right.fileName));
}
