import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

export const PLAYER_CONFIG_FILE = 'mengine-player.json';
export const BUILD_MANIFEST_FILE = 'mengine-build.json';

export interface GameProjectManifest {
  name: string;
  version: number | string;
  mainScene: string;
  buildScenes: string[];
  startupScript?: string;
}

export interface PcPackageOptions {
  projectDir: string;
  outputDir: string;
  runtimePath: string;
  engineVersion: string;
  clean?: boolean;
  platform?: string;
  architecture?: string;
}

export interface BuildFileEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface PcBuildManifest {
  schemaVersion: 1;
  engineVersion: string;
  platform: string;
  architecture: string;
  executable: string;
  project: GameProjectManifest;
  files: BuildFileEntry[];
}

function portablePath(path: string): string {
  return path.split(sep).join('/');
}

function isPathInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function resolveProjectPath(projectDir: string, path: string, label: string): string {
  if (!path.trim() || isAbsolute(path)) {
    throw new Error(`${label} must be a project-relative path: ${path}`);
  }
  const result = resolve(projectDir, path);
  if (!isPathInside(projectDir, result)) {
    throw new Error(`${label} escapes the project directory: ${path}`);
  }
  return result;
}

export function readGameProject(projectDir: string): GameProjectManifest {
  const root = resolve(projectDir);
  const manifestPath = join(root, 'project.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`project.json not found: ${manifestPath}`);
  }
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const rawBuildScenes = parsed.buildScenes ?? parsed.build_scenes;
  if (rawBuildScenes != null && !Array.isArray(rawBuildScenes)) {
    throw new Error('project.json buildScenes must be an array');
  }
  const buildScenes: string[] = [];
  const seenScenes = new Set<string>();
  for (const value of (rawBuildScenes as unknown[] | undefined) ?? []) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('project.json buildScenes entries must be non-empty paths');
    }
    const scene = value.replaceAll('\\', '/');
    const key = scene.toLowerCase();
    if (seenScenes.has(key)) throw new Error(`duplicate build scene: ${scene}`);
    seenScenes.add(key);
    buildScenes.push(scene);
  }
  const mainSceneValue = parsed.mainScene ?? parsed.main_scene ?? buildScenes[0];
  const mainScene = typeof mainSceneValue === 'string' ? mainSceneValue.replaceAll('\\', '/') : '';
  if (buildScenes.length === 0 && mainScene) buildScenes.push(mainScene);
  if (buildScenes[0] !== mainScene) {
    throw new Error('project.json mainScene must match the first buildScenes entry');
  }
  const scripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];
  const startupScriptValue = parsed.startupScript ?? parsed.startup_script ?? scripts[0];
  if (startupScriptValue != null && typeof startupScriptValue !== 'string') {
    throw new Error('project.json startupScript must be a project-relative path');
  }
  let startupScript = typeof startupScriptValue === 'string'
    ? startupScriptValue.replaceAll('\\', '/')
    : undefined;
  if (!startupScript) {
    startupScript = [
      'Assets/Scripts/Main.ts',
      'Assets/Scripts/main.ts',
      'Assets/Scripts/Main.js',
      'Assets/Scripts/main.js',
    ].find((candidate) => existsSync(join(root, ...candidate.split('/'))));
  }
  const version = typeof parsed.version === 'number' || typeof parsed.version === 'string'
    ? parsed.version
    : 1;
  if (!name) throw new Error('project.json requires a non-empty name');
  if (!mainScene) throw new Error('project.json requires mainScene');
  for (const scene of buildScenes) {
    const scenePath = resolveProjectPath(root, scene, 'build scene');
    if (!existsSync(scenePath) || !statSync(scenePath).isFile()) {
      throw new Error(`build scene not found: ${scene}`);
    }
  }
  if (startupScript) {
    const scriptPath = resolveProjectPath(root, startupScript, 'startupScript');
    if (!existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
      throw new Error(`startup script not found: ${startupScript}`);
    }
  }
  return { name, version, mainScene, buildScenes, ...(startupScript ? { startupScript } : {}) };
}

function safeExecutableName(name: string): string {
  let cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || 'MEngineGame';
}

function copyTree(source: string, destination: string): void {
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`symbolic links are not allowed in player content: ${source}`);
  }
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    const entries = readdirSync(source, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      copyTree(join(source, entry.name), join(destination, entry.name));
    }
    return;
  }
  if (sourceStat.isFile()) {
    if (/\.tsx?$/i.test(source)) return;
    mkdirSync(dirname(destination), { recursive: true });
    if (/\.mscene$/i.test(source) && copySceneWithoutEditorMetadata(source, destination)) return;
    copyFileSync(source, destination);
  }
}

/** Player scenes retain authored components but never ship editor-only `__*` metadata. */
function copySceneWithoutEditorMetadata(source: string, destination: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    return false;
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const world = (parsed as { world?: unknown }).world;
  if (world == null || typeof world !== 'object' || Array.isArray(world)) return false;
  const entities = (world as { entities?: unknown }).entities;
  if (!Array.isArray(entities)) return false;
  let changed = false;
  for (const entity of entities) {
    if (entity == null || typeof entity !== 'object' || Array.isArray(entity)) continue;
    const components = (entity as { components?: unknown }).components;
    if (components == null || typeof components !== 'object' || Array.isArray(components)) continue;
    for (const key of Object.keys(components)) {
      if (!key.startsWith('__')) continue;
      delete (components as Record<string, unknown>)[key];
      changed = true;
    }
  }
  if (!changed) return false;
  writeFileSync(destination, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return true;
}

function collectTypeScriptFiles(directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScriptFiles(path, output);
    else if (entry.isFile() && /\.tsx?$/i.test(entry.name)) output.push(path);
  }
  return output;
}

function formatTypeScriptDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  }).trim();
}

function compileProjectTypeScript(
  projectDir: string,
  stageDir: string,
  startupScript: string | undefined,
): string | undefined {
  if (!startupScript || !/\.tsx?$/i.test(startupScript)) return startupScript;
  const portable = startupScript.replaceAll('\\', '/');
  const segments = portable.split('/');
  const scriptsIndex = segments.map((segment) => segment.toLowerCase()).lastIndexOf('scripts');
  const sourceRootRelative = scriptsIndex >= 0
    ? segments.slice(0, scriptsIndex + 1).join('/')
    : segments.slice(0, -1).join('/');
  const sourceRoot = resolveProjectPath(projectDir, sourceRootRelative, 'script root');
  const rootNames = collectTypeScriptFiles(sourceRoot);
  if (!rootNames.some((path) => resolve(path) === resolve(projectDir, startupScript))) {
    throw new Error(`TypeScript startup script is outside its script root: ${startupScript}`);
  }
  const outputRoot = join(stageDir, ...sourceRootRelative.split('/'));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.None,
    moduleResolution: ts.ModuleResolutionKind.Classic,
    rootDir: sourceRoot,
    outDir: outputRoot,
    strict: true,
    skipLibCheck: true,
    noEmitOnError: true,
    sourceMap: false,
    declaration: false,
    removeComments: true,
  };
  const program = ts.createProgram(rootNames, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(`TypeScript compilation failed:\n${formatTypeScriptDiagnostics(errors)}`);
  }
  const emitted = program.emit();
  if (emitted.emitSkipped) {
    throw new Error(`TypeScript emit failed:\n${formatTypeScriptDiagnostics(emitted.diagnostics)}`);
  }
  return portable.replace(/\.tsx?$/i, '.js');
}

function contentRoots(projectDir: string): string[] {
  const names = ['Assets', 'assets', 'Scripts', 'scripts'];
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const path = join(projectDir, name);
    const key = process.platform === 'win32' ? path.toLowerCase() : path;
    if (seen.has(key) || !existsSync(path) || !statSync(path).isDirectory()) continue;
    seen.add(key);
    roots.push(path);
  }
  return roots;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function collectFiles(root: string, current = root, output: BuildFileEntry[] = []): BuildFileEntry[] {
  for (const entry of readdirSync(current, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, absolute, output);
    } else if (entry.isFile() && entry.name !== BUILD_MANIFEST_FILE) {
      output.push({
        path: portablePath(relative(root, absolute)),
        size: statSync(absolute).size,
        sha256: sha256(absolute),
      });
    }
  }
  return output;
}

export function hostBuildPlatform(): string {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

export function buildPcPackage(options: PcPackageOptions): PcBuildManifest {
  const projectDir = resolve(options.projectDir);
  const outputDir = resolve(options.outputDir);
  const runtimePath = resolve(options.runtimePath);
  const project = readGameProject(projectDir);
  if (!existsSync(runtimePath) || !statSync(runtimePath).isFile()) {
    throw new Error(`player runtime not found: ${runtimePath}`);
  }
  const roots = contentRoots(projectDir);
  for (const scene of project.buildScenes) {
    if (!roots.some((root) => isPathInside(root, resolve(projectDir, scene)))) {
      throw new Error(`buildScenes must be stored under Assets or Scripts: ${scene}`);
    }
  }
  if (project.startupScript
    && !roots.some((root) => isPathInside(root, resolve(projectDir, project.startupScript!)))) {
    throw new Error(`startupScript must be stored under Assets or Scripts: ${project.startupScript}`);
  }
  if (outputDir === projectDir || roots.some((root) => isPathInside(root, outputDir))) {
    throw new Error(`build output cannot overwrite project content: ${outputDir}`);
  }
  if (isPathInside(outputDir, projectDir)) {
    throw new Error(`build output cannot contain the project directory: ${outputDir}`);
  }
  if (existsSync(outputDir) && lstatSync(outputDir).isSymbolicLink()) {
    throw new Error(`build output cannot be a symbolic link: ${outputDir}`);
  }
  if (existsSync(outputDir) && !options.clean) {
    throw new Error(`build output already exists (pass --clean to replace it): ${outputDir}`);
  }

  const stageDir = join(
    dirname(outputDir),
    `.${basename(outputDir)}.mengine-stage-${process.pid}-${Date.now()}`,
  );
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  try {
    for (const root of roots) {
      copyTree(root, join(stageDir, basename(root)));
    }
    const packagedStartupScript = compileProjectTypeScript(
      projectDir,
      stageDir,
      project.startupScript,
    );
    const packagedProject: GameProjectManifest = {
      ...project,
      ...(packagedStartupScript ? { startupScript: packagedStartupScript } : {}),
    };
    const packagedProjectJson = JSON.parse(
      readFileSync(join(projectDir, 'project.json'), 'utf8'),
    ) as Record<string, unknown>;
    if (packagedStartupScript) {
      packagedProjectJson.startupScript = packagedStartupScript;
      delete packagedProjectJson.startup_script;
    }
    writeFileSync(
      join(stageDir, 'project.json'),
      `${JSON.stringify(packagedProjectJson, null, 2)}\n`,
      'utf8',
    );

    const platform = options.platform ?? hostBuildPlatform();
    const executable = `${safeExecutableName(project.name)}${platform === 'windows' ? '.exe' : ''}`;
    copyFileSync(runtimePath, join(stageDir, executable));
    writeFileSync(
      join(stageDir, PLAYER_CONFIG_FILE),
      `${JSON.stringify({
        schemaVersion: 1,
        projectName: project.name,
        projectRoot: '.',
        mainScene: project.mainScene,
        buildScenes: project.buildScenes,
        ...(packagedStartupScript ? { startupScript: packagedStartupScript } : {}),
      }, null, 2)}\n`,
      'utf8',
    );

    const manifest: PcBuildManifest = {
      schemaVersion: 1,
      engineVersion: options.engineVersion,
      platform,
      architecture: options.architecture ?? process.arch,
      executable,
      project: packagedProject,
      files: collectFiles(stageDir),
    };
    writeFileSync(
      join(stageDir, BUILD_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
    mkdirSync(dirname(outputDir), { recursive: true });
    renameSync(stageDir, outputDir);
    return manifest;
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }
}
