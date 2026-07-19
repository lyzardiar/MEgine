#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILD_CACHE_REPORT_PREFIX,
  buildPcPackage,
  hostBuildPlatform,
  type BuildCacheStats,
} from './pcPackage.js';

const cliPackage = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version?: string };
const ENGINE_VERSION = cliPackage.version ?? '0.0.0';
const [cmd, ...rest] = process.argv.slice(2);
const ENGINE_TYPES = `interface EngineSceneInfo {
  readonly name: string;
  readonly path: string;
  readonly buildIndex: number | null;
  readonly buildSceneCount: number;
}

interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
  loadScene(scene: string | number): boolean;
  reloadScene(): boolean;
  instantiatePrefab(path: string, parent?: number | string): boolean;
  setAnimatorParameter(entity: number | string, name: string, value: boolean | number): boolean;
  setAnimatorTrigger(entity: number | string, name: string): boolean;
  playAnimatorState(entity: number | string, state: string): boolean;
  setAnimatorLayerWeight(entity: number | string, layer: string, weight: number): boolean;
  playAnimatorLayerState(entity: number | string, layer: string, state: string): boolean;
  playAnimation(entity: number | string, restart?: boolean): boolean;
  pauseAnimation(entity: number | string): boolean;
  stopAnimation(entity: number | string): boolean;
  seekAnimation(entity: number | string, time: number): boolean;
  playTimeline(entity: number | string, restart?: boolean): boolean;
  pauseTimeline(entity: number | string): boolean;
  stopTimeline(entity: number | string): boolean;
  seekTimeline(entity: number | string, time: number): boolean;
  playAudio(entity: number | string): boolean;
  pauseAudio(entity: number | string): boolean;
  stopAudio(entity: number | string): boolean;
  seekAudio(entity: number | string, time: number): boolean;
  scene: EngineSceneInfo | null;
}

interface PhysicsCollisionInfo {
  readonly firstEntity: string;
  readonly secondEntity: string;
  readonly dimension: '2d' | '3d';
}

interface EngineAnimationEventInfo {
  readonly entity: string;
  readonly function: string;
  readonly time: number;
  readonly parameter: boolean | number | number[] | string | null;
  readonly state: string | null;
  readonly weight: number;
}

interface EngineTimelineSignalInfo {
  readonly entity: string;
  readonly track: string;
  readonly signal: string;
  readonly time: number;
  readonly payload: unknown;
}

declare const engine: EngineApi;
declare function onTick(dt: number, frame: number): void;
declare function onSceneLoaded(scene: EngineSceneInfo): void;
declare function onCollisionEnter(event: PhysicsCollisionInfo): void;
declare function onCollisionExit(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter(event: PhysicsCollisionInfo): void;
declare function onTriggerExit(event: PhysicsCollisionInfo): void;
declare function onCollisionEnter2D(event: PhysicsCollisionInfo): void;
declare function onCollisionExit2D(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter2D(event: PhysicsCollisionInfo): void;
declare function onTriggerExit2D(event: PhysicsCollisionInfo): void;
declare function onAnimationEvent(event: EngineAnimationEventInfo): void;
declare function onTimelineSignal(event: EngineTimelineSignalInfo): void;
`;

function help() {
  console.log(`mengine <command>

Commands:
  new <name>                  Create a new game project scaffold
  build <project> [options]   Build a directly runnable PC player
  export-pc <project>         Alias of build for compatibility
  codegen                     Print the engine codegen command

Build options:
  --out <dir>                 Output directory (default: <project>/Builds/<platform>-<arch>-<profile>)
  --runtime <file>            Use an existing mengine-runtime executable
  --debug                     Build/use the debug runtime instead of release
  --skip-runtime-build        Reuse an existing runtime without invoking Cargo
  --skip-verify               Skip packaged player scene validation
  --cancel-file <file>        Cooperatively cancel before atomic publish (editor use)
  --clean                     Replace an existing output directory
`);
}

function newProject(name: string) {
  if (!name.trim() || name === '.' || name === '..' || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) {
    throw new Error(`invalid project name: ${name}`);
  }
  const root = join(process.cwd(), name);
  if (existsSync(root)) throw new Error(`project already exists: ${root}`);
  mkdirSync(join(root, 'Assets', 'Scenes'), { recursive: true });
  mkdirSync(join(root, 'Assets', 'Scripts'), { recursive: true });
  mkdirSync(join(root, 'Assets', 'Models'), { recursive: true });
  mkdirSync(join(root, 'ProjectSettings'), { recursive: true });
  writeFileSync(
    join(root, 'project.json'),
    `${JSON.stringify({
      name,
      version: 1,
      language: 'typescript',
      mainScene: 'Assets/Scenes/Main.mscene',
      buildScenes: ['Assets/Scenes/Main.mscene'],
      startupScript: 'Assets/Scripts/Main.ts',
      assetMode: 'all',
      alwaysInclude: [],
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'Assets', 'Scripts', 'Main.ts'),
    "let elapsed = 0;\nlet loadedSceneName = '';\n\nfunction onSceneLoaded(scene: EngineSceneInfo) {\n  loadedSceneName = scene.name;\n}\n\nfunction onTick(dt: number, _frame: number) {\n  elapsed += dt;\n}\n",
  );
  writeFileSync(join(root, 'Assets', 'Scripts', 'mengine.d.ts'), ENGINE_TYPES);
  writeFileSync(
    join(root, 'ProjectSettings', 'editor.json'),
    `${JSON.stringify({ gameAspect: '16:9', gameOrientation: 'landscape' }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'ProjectSettings', 'sorting-layers.json'),
    `${JSON.stringify({
      version: 1,
      layers: [{ id: 'default', name: 'Default' }],
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, 'Assets', 'Scenes', 'Main.mscene'),
    `${JSON.stringify({
      version: 1,
      name: 'Main',
      world: {
        entities: [],
        frame: 0,
        sim_frame: 0,
        clear_color: [0.1, 0.1, 0.14, 1],
      },
    }, null, 2)}\n`,
  );
  console.log(`Created project: ${root}`);
}

interface BuildArguments {
  projectDir: string;
  outputDir?: string;
  runtimePath?: string;
  profile: 'debug' | 'release';
  skipRuntimeBuild: boolean;
  skipVerify: boolean;
  cancelFile?: string;
  clean: boolean;
}

function takeOption(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function parseBuildArguments(values: string[]): BuildArguments {
  const args = [...values];
  let outputDir: string | undefined;
  let runtimePath: string | undefined;
  let profile: BuildArguments['profile'] = 'release';
  let skipRuntimeBuild = false;
  let skipVerify = false;
  let cancelFile: string | undefined;
  let clean = false;
  for (let index = 0; index < args.length;) {
    const value = args[index];
    if (value === '--out') {
      outputDir = takeOption(args, index, '--out');
    } else if (value === '--runtime') {
      runtimePath = takeOption(args, index, '--runtime');
    } else if (value === '--debug') {
      profile = 'debug';
      args.splice(index, 1);
    } else if (value === '--skip-runtime-build') {
      skipRuntimeBuild = true;
      args.splice(index, 1);
    } else if (value === '--skip-verify') {
      skipVerify = true;
      args.splice(index, 1);
    } else if (value === '--cancel-file') {
      cancelFile = takeOption(args, index, '--cancel-file');
    } else if (value === '--clean') {
      clean = true;
      args.splice(index, 1);
    } else if (value.startsWith('--')) {
      throw new Error(`unknown build option: ${value}`);
    } else {
      index += 1;
    }
  }
  if (args.length > 1) throw new Error(`unexpected build arguments: ${args.slice(1).join(' ')}`);
  return {
    projectDir: resolve(args[0] ?? '.'),
    outputDir: outputDir ? resolve(outputDir) : undefined,
    runtimePath: runtimePath ? resolve(runtimePath) : undefined,
    profile,
    skipRuntimeBuild,
    skipVerify,
    cancelFile: cancelFile ? resolve(cancelFile) : undefined,
    clean,
  };
}

function findEngineRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    const cargo = join(current, 'Cargo.toml');
    if (existsSync(cargo)) {
      const text = readFileSync(cargo, 'utf8');
      if (text.includes('crates/mengine-runtime')) return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function runtimeFileName(): string {
  return process.platform === 'win32' ? 'mengine-runtime.exe' : 'mengine-runtime';
}

function resolveRuntime(args: BuildArguments): string {
  if (args.runtimePath) return args.runtimePath;
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const engineRoot = findEngineRoot(process.cwd()) ?? findEngineRoot(cliDir);
  if (!engineRoot) {
    throw new Error('cannot locate the MEngine source root; pass --runtime <file>');
  }
  const path = join(engineRoot, 'target', args.profile, runtimeFileName());
  if (!args.skipRuntimeBuild) {
    console.log(`Building ${args.profile} player runtime…`);
    const cargoArgs = ['build', '-p', 'mengine-runtime'];
    if (args.profile === 'release') cargoArgs.push('--release');
    const result = spawnSync('cargo', cargoArgs, { cwd: engineRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Cargo player build failed with exit code ${result.status}`);
  }
  if (!existsSync(path)) throw new Error(`player runtime not found: ${path}`);
  return path;
}

function buildProject(values: string[]) {
  const args = parseBuildArguments(values);
  const isCancelled = () => Boolean(args.cancelFile && existsSync(args.cancelFile));
  const assertNotCancelled = (stage: string) => {
    if (isCancelled()) throw new Error(`build cancelled during ${stage}`);
  };
  const platform = hostBuildPlatform();
  const outputDir = args.outputDir
    ?? join(args.projectDir, 'Builds', `${platform}-${process.arch}-${args.profile}`);
  let verificationSummary = '';
  assertNotCancelled('runtime preparation');
  const runtimePath = resolveRuntime(args);
  assertNotCancelled('runtime preparation');
  let buildCacheStats: BuildCacheStats | null = null;
  const manifest = buildPcPackage({
    projectDir: args.projectDir,
    outputDir,
    runtimePath,
    engineVersion: ENGINE_VERSION,
    clean: args.clean,
    profile: args.profile,
    platform,
    isCancelled,
    onBuildCacheStats: (stats) => { buildCacheStats = stats; },
    verifyStagedBuild: args.skipVerify ? undefined : (stageDir, stagedManifest) => {
      assertNotCancelled('staged player validation');
      const player = join(stageDir, stagedManifest.executable);
      const verification = spawnSync(player, ['--validate-package'], {
        cwd: stageDir,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (verification.error) throw verification.error;
      if (verification.status !== 0) {
        const detail = (verification.stderr || verification.stdout || '').trim();
        throw new Error(`packaged player validation failed${detail ? `: ${detail}` : ''}`);
      }
      assertNotCancelled('staged player validation');
      verificationSummary = verification.stdout.trim();
    },
  });
  if (verificationSummary) console.log(verificationSummary);
  if (buildCacheStats) {
    console.log(`${BUILD_CACHE_REPORT_PREFIX}${JSON.stringify(buildCacheStats)}`);
  }
  console.log(`Built ${manifest.project.name} → ${outputDir}`);
  console.log(`Player: ${join(outputDir, manifest.executable)}`);
  console.log(`Files: ${manifest.files.length} (SHA-256 manifest written)`);
  console.log(`Content: ${manifest.contentHash}`);
  console.log(
    `Content groups: ${manifest.contentSummary.categories
      .map((group) => `${group.category}=${group.files} files/${group.bytes} bytes`)
      .join(', ')}`,
  );
  console.log(
    `Assets (${manifest.assetValidation.assetMode}): ${manifest.assetValidation.validatedFiles} validated files, ${manifest.assetValidation.references} references`,
  );
  console.log(
    `Audited authoring assets: ${manifest.assetValidation.auditedScenes} scenes, ${manifest.assetValidation.auditedPrefabs} prefabs, ${manifest.assetValidation.auditedMaterials} materials, ${manifest.assetValidation.auditedMaterialInstances} material instances, ${manifest.assetValidation.auditedSurfaceShaders} surface shaders`,
  );
  console.log(`EditorOnly: ${manifest.assetValidation.strippedEditorEntities} entities stripped`);
  console.log(
    `Unused assets: ${manifest.assetValidation.omittedAssetFiles} files, ${manifest.assetValidation.omittedAssetBytes} bytes omitted`,
  );
}

try {
  switch (cmd) {
    case 'new':
      if (!rest[0]) throw new Error('new requires a project name');
      if (rest.length !== 1) throw new Error(`unexpected new arguments: ${rest.slice(1).join(' ')}`);
      newProject(rest[0]);
      break;
    case 'build':
    case 'export-pc':
      buildProject(rest);
      break;
    case 'codegen':
      console.log('Run from the MEngine source root: pnpm codegen');
      break;
    case '--help':
    case '-h':
    case undefined:
      help();
      break;
    default:
      throw new Error(`unknown command: ${cmd}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
