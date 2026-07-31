import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mengineFsPlugin } from './vite/mengineFsPlugin';
import {
  EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES,
  editorChunkBudgetViolations,
  editorChunkName,
} from './vite/chunkStrategy';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDir, 'project');

function editorChunkBudgetPlugin(): Plugin {
  return {
    name: 'mengine-editor-chunk-budget',
    generateBundle(_options, bundle) {
      const violations = editorChunkBudgetViolations(Object.values(bundle)
        .filter((entry) => entry.type === 'chunk')
        .map((entry) => ({ fileName: entry.fileName, bytes: entry.code.length })));
      if (!violations.length) return;
      const details = violations
        .map((chunk) => `${chunk.fileName}: ${(chunk.bytes / 1_000).toFixed(2)} kB`)
        .join(', ');
      throw new Error(
        `Editor JavaScript chunk budget exceeded (${EDITOR_JAVASCRIPT_CHUNK_BUDGET_BYTES / 1_000} kB): ${details}`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    mengineFsPlugin({ projectRoot, editorRoot: rootDir }),
    editorChunkBudgetPlugin(),
  ],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: editorChunkName,
      },
    },
  },
  clearScreen: false,
});
