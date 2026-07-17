import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mengineFsPlugin } from './vite/mengineFsPlugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDir, 'project');

export default defineConfig({
  plugins: [react(), mengineFsPlugin({ projectRoot, editorRoot: rootDir })],
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
        manualChunks(id) {
          return id.includes('@esotericsoftware/spine-') ? 'spine-runtime' : undefined;
        },
      },
    },
  },
  clearScreen: false,
});
