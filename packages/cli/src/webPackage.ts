import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const WEB_MANIFEST_FILE = 'mengine-web-manifest.json';

export interface WebPackageFileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface WebPackageManifest {
  version: 1;
  target: 'web-wasm';
  engineVersion: string;
  scriptBackend: 'web-native-js';
  graphicsPrimary: 'webgpu';
  graphicsFallback: 'webgl2';
  project: {
    name: string;
    mainScene: string;
    startupScript: string | null;
    buildScenes: string[];
  };
  files: WebPackageFileEntry[];
  contentHash: string;
}

export interface BuildWebPackageOptions {
  projectDir: string;
  outputDir: string;
  shellDir: string;
  engineVersion: string;
  clean?: boolean;
}

const SKIPPED_DIRS = new Set(['node_modules', '.git', '.mengine', 'Builds', 'dist']);

function toPosix(relPath: string): string {
  return relPath.split('\\').join('/');
}

function sha256File(filePath: string): { bytes: number; sha256: string } {
  const buf = readFileSync(filePath);
  return {
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function copyTree(sourceDir: string, destDir: string, skipDirs: Set<string>): void {
  if (!existsSync(sourceDir)) return;
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const src = join(sourceDir, entry.name);
    const dst = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst, skipDirs);
    } else if (entry.isFile()) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }
}

function collectFiles(rootDir: string, currentDir = rootDir, out: WebPackageFileEntry[] = []): WebPackageFileEntry[] {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const full = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(rootDir, full, out);
    } else if (entry.isFile()) {
      const rel = toPosix(relative(rootDir, full));
      if (rel === WEB_MANIFEST_FILE) continue;
      const { bytes, sha256 } = sha256File(full);
      out.push({ path: rel, bytes, sha256 });
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/**
 * Packages an MEngine project for the browser Web Player shell (`platforms/web`):
 * - Uses browser-native JS (`web-native-js`) instead of bundling V8/QuickJS.
 * - Targets WebGPU with WebGL2 fallback and async fetch() VFS.
 * - Writes `mengine-web-manifest.json` with SHA-256 digests for CDN cache busting & integrity checks.
 */
export function buildWebPackage(options: BuildWebPackageOptions): WebPackageManifest {
  const projectDir = resolve(options.projectDir);
  const outputDir = resolve(options.outputDir);
  const shellDir = resolve(options.shellDir);

  const projectJsonPath = join(projectDir, 'project.json');
  if (!existsSync(projectJsonPath)) {
    throw new Error(`project.json not found in ${projectDir}`);
  }
  if (!existsSync(join(shellDir, 'index.html'))) {
    throw new Error(`Web player shell index.html not found in ${shellDir}`);
  }

  const projectMeta = JSON.parse(readFileSync(projectJsonPath, 'utf8')) as {
    name?: string;
    mainScene?: string;
    startupScript?: string;
    buildScenes?: string[];
  };

  if (options.clean && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  // 1. Copy Web Player shell (index.html, src/*, vite/ts configs)
  copyTree(shellDir, outputDir, SKIPPED_DIRS);

  // 2. Copy project metadata and runtime Assets/ProjectSettings
  copyFileSync(projectJsonPath, join(outputDir, 'project.json'));
  const settingsDir = join(projectDir, 'ProjectSettings');
  if (existsSync(settingsDir) && statSync(settingsDir).isDirectory()) {
    copyTree(settingsDir, join(outputDir, 'ProjectSettings'), SKIPPED_DIRS);
  }
  const assetsDir = join(projectDir, 'Assets');
  if (existsSync(assetsDir) && statSync(assetsDir).isDirectory()) {
    copyTree(assetsDir, join(outputDir, 'Assets'), SKIPPED_DIRS);
  }

  // 3. Hash all staged web payload files deterministically
  const files = collectFiles(outputDir);
  const contentHash = createHash('sha256')
    .update(files.map((item) => `${item.path}:${item.sha256}`).join('\n'))
    .digest('hex');

  const manifest: WebPackageManifest = {
    version: 1,
    target: 'web-wasm',
    engineVersion: options.engineVersion,
    scriptBackend: 'web-native-js',
    graphicsPrimary: 'webgpu',
    graphicsFallback: 'webgl2',
    project: {
      name: projectMeta.name || 'MEngineProject',
      mainScene: projectMeta.mainScene || 'Assets/Scenes/Main.mscene',
      startupScript: projectMeta.startupScript ?? null,
      buildScenes: Array.isArray(projectMeta.buildScenes) ? projectMeta.buildScenes : [],
    },
    files,
    contentHash,
  };

  writeFileSync(
    join(outputDir, WEB_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}
