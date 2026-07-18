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
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
  profile?: 'debug' | 'release';
  platform?: string;
  architecture?: string;
  /** Runs against the complete staging directory before it can replace a published build. */
  verifyStagedBuild?: (stageDir: string, manifest: PcBuildManifest) => void;
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
  profile: 'debug' | 'release';
  executable: string;
  contentHash: string;
  project: GameProjectManifest;
  assetValidation: BuildAssetValidation;
  files: BuildFileEntry[];
}

export interface BuildAssetValidation {
  rootScenes: number;
  references: number;
  validatedFiles: number;
}

export interface DirectoryPublishOperations {
  exists(path: string): boolean;
  rename(from: string, to: string): void;
  remove(path: string): void;
}

const directoryPublishOperations: DirectoryPublishOperations = {
  exists: existsSync,
  rename: renameSync,
  remove: (path) => rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
};

function compareFileNames(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function validateProjectSettings(projectDir: string): void {
  const path = join(projectDir, 'ProjectSettings', 'sorting-layers.json');
  if (!existsSync(path)) return;
  if (!statSync(path).isFile()) {
    throw new Error(`sorting layer settings must be a file: ${path}`);
  }
  const settings = readJsonAsset(path, projectDir, 'sorting layer settings');
  if (settings.version !== 1) {
    throw new Error(`invalid sorting layer settings ProjectSettings/sorting-layers.json: unsupported version ${String(settings.version)}`);
  }
  if (!Array.isArray(settings.layers) || settings.layers.length > 64) {
    throw new Error('invalid sorting layer settings ProjectSettings/sorting-layers.json: layers must contain at most 64 entries');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of settings.layers) {
    const layer = jsonObject(entry);
    const id = typeof layer?.id === 'string' ? layer.id.trim() : '';
    let name = typeof layer?.name === 'string' ? layer.name.trim() : '';
    const idKey = id.toLowerCase();
    if (idKey === 'default') name = 'Default';
    const nameKey = name.toLocaleLowerCase();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new Error(`invalid sorting layer id '${id}' in ProjectSettings/sorting-layers.json`);
    }
    if (!name || [...name].length > 64) {
      throw new Error(`invalid sorting layer name '${name}' in ProjectSettings/sorting-layers.json`);
    }
    if (ids.has(idKey)) {
      throw new Error(`duplicate sorting layer id '${id}' in ProjectSettings/sorting-layers.json`);
    }
    if (names.has(nameKey)) {
      throw new Error(`duplicate sorting layer name '${name}' in ProjectSettings/sorting-layers.json`);
    }
    ids.add(idKey);
    names.add(nameKey);
  }
}

type JsonObject = Record<string, unknown>;

interface PendingAsset {
  path: string;
  from: string;
  kind: string;
  spriteSlice?: string;
}

function jsonObject(value: unknown): JsonObject | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function readJsonAsset(path: string, projectDir: string, kind: string): JsonObject {
  const label = portablePath(relative(projectDir, path));
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason);
    throw new Error(`invalid ${kind} JSON ${label}: ${detail}`);
  }
  const object = jsonObject(parsed);
  if (!object) throw new Error(`invalid ${kind} ${label}: root must be an object`);
  return object;
}

function stringValue(object: JsonObject | null, field: string): string {
  const value = object?.[field];
  return typeof value === 'string' ? value.trim() : '';
}

function strictStringValue(object: JsonObject, field: string, source: string): string {
  const value = object[field];
  if (value == null) return '';
  if (typeof value !== 'string') throw new Error(`invalid ${source}: ${field} must be a string`);
  return value.trim();
}

/**
 * Validates runtime asset references reachable from the configured build scenes. Dynamic assets
 * loaded by script are still copied because packaging retains the complete Assets tree.
 */
export function validateBuildAssetDependencies(
  projectDir: string,
  project: GameProjectManifest = readGameProject(projectDir),
): BuildAssetValidation {
  const root = resolve(projectDir);
  const roots = contentRoots(root);
  const queue: PendingAsset[] = [];
  const visited = new Set<string>();
  const processed = new Set<string>();
  let references = 0;

  const enqueue = (
    rawPath: string,
    from: string,
    kind: string,
    builtins: string[] = [],
    spriteSlice?: string,
  ) => {
    const path = rawPath.trim().replaceAll('\\', '/');
    if (!path || builtins.some((builtin) => builtin.toLowerCase() === path.toLowerCase())) return;
    const marker = path.indexOf('#');
    if (marker >= 0) {
      const texture = path.slice(0, marker).trim();
      const slice = path.slice(marker + 1).trim();
      if (!texture || !slice) throw new Error(`invalid ${kind} subresource reference: ${path}`);
      enqueue(texture, from, kind, builtins);
      enqueue(`${texture}.sprite.json`, from, 'sprite import metadata', [], slice);
      return;
    }
    references += 1;
    queue.push({ path, from, kind, ...(spriteSlice ? { spriteSlice } : {}) });
  };

  const enqueueMaterial = (rawPath: string, from: string) => {
    const path = rawPath.trim();
    if (!path || ['default', 'gold', 'chrome', 'metal', 'unlit']
      .some((builtin) => builtin === path.toLowerCase())) return;
    if (/\.(?:mmat|mat)$/i.test(path) || path.includes('/') || path.includes('\\')) {
      enqueue(path, from, 'material');
    }
  };

  const componentReferences = (componentsValue: unknown, from: string) => {
    const components = jsonObject(componentsValue);
    if (!components) return;
    const component = (name: string) => jsonObject(components[name]);
    const meshRenderer = component('MeshRenderer');
    const mesh = stringValue(meshRenderer, 'mesh');
    if (mesh && mesh.toLowerCase() !== 'cube'
      && (/\.(?:gltf|glb)$/i.test(mesh) || mesh.includes('/') || mesh.includes('\\'))) {
      enqueue(mesh, from, '3D model');
    }
    enqueueMaterial(stringValue(meshRenderer, 'material'), from);
    enqueue(
      stringValue(component('EnvironmentLight'), 'texture'),
      from,
      'environment texture',
    );
    enqueue(stringValue(component('SpriteRenderer'), 'sprite'), from, 'texture', ['white']);
    const frames = component('AnimatedSprite2D')?.frames;
    if (Array.isArray(frames)) {
      for (const frame of frames) if (typeof frame === 'string') enqueue(frame, from, 'texture', ['white']);
    }
    const tileSprites = component('Tilemap')?.sprites;
    if (Array.isArray(tileSprites)) {
      for (const sprite of tileSprites) {
        if (typeof sprite === 'string') enqueue(sprite, from, 'tilemap texture', ['white']);
      }
    }
    enqueue(stringValue(component('AnimationPlayer'), 'clip'), from, 'animation clip');
    enqueue(stringValue(component('Animator'), 'controller'), from, 'animator controller');
    enqueue(stringValue(component('AudioSource'), 'clip'), from, 'audio clip');
    for (const name of ['ParticleEmitter2D', 'ParticleEmitter3D']) {
      enqueue(stringValue(component(name), 'texture'), from, 'particle texture', ['white']);
    }
    enqueue(stringValue(component('SpineSkeleton'), 'skeleton'), from, 'Spine skeleton');
    enqueue(stringValue(component('SpineSkeleton'), 'atlas'), from, 'Spine atlas');
    enqueue(stringValue(component('Image'), 'sprite'), from, 'UI texture', ['white']);
    enqueue(stringValue(component('RawImage'), 'texture'), from, 'UI texture', ['white']);
  };

  const prefabNodeReferences = (nodeValue: unknown, from: string) => {
    const node = jsonObject(nodeValue);
    if (!node) return;
    componentReferences(node.components, from);
    if (Array.isArray(node.children)) {
      for (const child of node.children) prefabNodeReferences(child, from);
    }
  };

  const inspectJsonDependency = (absolute: string, pending: PendingAsset) => {
    const extension = extname(pending.path).toLowerCase();
    const source = portablePath(relative(root, absolute));
    if (extension === '.mscene') {
      const scene = readJsonAsset(absolute, root, 'scene');
      const world = jsonObject(scene.world);
      if (world?.entities != null && !Array.isArray(world.entities)) {
        throw new Error(`invalid scene ${source}: world.entities must be an array`);
      }
      for (const entity of Array.isArray(world?.entities) ? world.entities : []) {
        componentReferences(jsonObject(entity)?.components, source);
      }
    } else if (extension === '.prefab') {
      const prefab = readJsonAsset(absolute, root, 'prefab');
      prefabNodeReferences(prefab.root ?? prefab, source);
    } else if (extension === '.mmat' || extension === '.mat') {
      const material = readJsonAsset(absolute, root, 'material');
      if (material.shader != null
        && material.shader !== 'pbr'
        && material.shader !== 'unlit'
        && material.shader !== 'custom') {
        throw new Error(`invalid material ${source}: shader must be pbr, unlit, or custom`);
      }
      const customShader = strictStringValue(material, 'custom_shader', `material ${source}`);
      if (material.shader === 'custom') {
        if (!customShader) {
          throw new Error(`invalid material ${source}: custom shader requires custom_shader`);
        }
        if (!customShader.toLowerCase().endsWith('.mshader')) {
          throw new Error(`invalid material ${source}: custom_shader must reference a .mshader asset`);
        }
        enqueue(customShader, source, 'material surface shader');
      }
      if (material.surface != null
        && material.surface !== 'opaque'
        && material.surface !== 'transparent'
        && material.surface !== 'cutout') {
        throw new Error(`invalid material ${source}: surface must be opaque, transparent, or cutout`);
      }
      if (material.blend_mode != null
        && material.blend_mode !== 'alpha'
        && material.blend_mode !== 'premultiplied'
        && material.blend_mode !== 'additive'
        && material.blend_mode !== 'multiply') {
        throw new Error(`invalid material ${source}: unsupported blend_mode ${String(material.blend_mode)}`);
      }
      if (material.render_queue != null
        && (!Number.isInteger(material.render_queue)
          || Number(material.render_queue) < -1
          || Number(material.render_queue) > 5000)) {
        throw new Error(`invalid material ${source}: render_queue must be an integer from -1 to 5000`);
      }
      for (const field of [
        'base_color_texture',
        'normal_texture',
        'metallic_roughness_texture',
        'occlusion_texture',
        'emissive_texture',
      ]) {
        enqueue(
          strictStringValue(material, field, `material ${source}`),
          source,
          `material ${field}`,
        );
      }
    } else if (extension === '.mshader') {
      const sourceText = readFileSync(absolute, 'utf8');
      if (Buffer.byteLength(sourceText, 'utf8') > 256 * 1024) {
        throw new Error(`invalid material surface shader ${source}: file exceeds 256 KiB`);
      }
      if (!/\bfn\s+mengine_surface_hook\s*\(/.test(sourceText)) {
        throw new Error(`invalid material surface shader ${source}: missing fn mengine_surface_hook`);
      }
      const forbidden = ['@group', '@binding', '@vertex', '@fragment', '@compute']
        .find((token) => sourceText.includes(token));
      if (forbidden) {
        throw new Error(`invalid material surface shader ${source}: ${forbidden} is reserved by the engine`);
      }
    } else if (pending.path.toLowerCase().endsWith('.sprite.json')) {
      const metadata = readJsonAsset(absolute, root, 'sprite import metadata');
      if (metadata.version != null && metadata.version !== 1) {
        throw new Error(`invalid sprite import metadata ${source}: unsupported version ${String(metadata.version)}`);
      }
      if (pending.spriteSlice) {
        if (metadata.mode !== 'multiple' || !Array.isArray(metadata.slices)) {
          throw new Error(`invalid sprite import metadata ${source}: slice '${pending.spriteSlice}' requires multiple mode`);
        }
        const matching = metadata.slices.some((value) => {
          const slice = jsonObject(value);
          return stringValue(slice, 'name').toLowerCase() === pending.spriteSlice!.toLowerCase();
        });
        if (!matching) {
          throw new Error(`missing sprite slice '${pending.spriteSlice}' in ${source}`);
        }
      }
    } else if (extension === '.mcontroller') {
      const controller = readJsonAsset(absolute, root, 'animator controller');
      if (!Array.isArray(controller.states) || controller.states.length === 0) {
        throw new Error(`invalid animator controller ${source}: states must be a non-empty array`);
      }
      const stateNames = new Set<string>();
      for (const stateValue of controller.states) {
        const state = jsonObject(stateValue);
        if (!state) throw new Error(`invalid animator controller ${source}: state must be an object`);
        const name = strictStringValue(state, 'name', `animator controller ${source}`);
        const clip = strictStringValue(state, 'clip', `animator controller ${source}`);
        if (!name || !clip) {
          throw new Error(`invalid animator controller ${source}: every state needs a name and clip`);
        }
        if (stateNames.has(name)) {
          throw new Error(`invalid animator controller ${source}: duplicate state ${name}`);
        }
        stateNames.add(name);
        enqueue(clip, source, 'animation clip');
      }
      const defaultState = strictStringValue(
        controller,
        'default_state',
        `animator controller ${source}`,
      );
      if (defaultState && !stateNames.has(defaultState)) {
        throw new Error(`invalid animator controller ${source}: default state ${defaultState} does not exist`);
      }
      if (controller.transitions != null && !Array.isArray(controller.transitions)) {
        throw new Error(`invalid animator controller ${source}: transitions must be an array`);
      }
      for (const transitionValue of Array.isArray(controller.transitions)
        ? controller.transitions
        : []) {
        const transition = jsonObject(transitionValue);
        if (!transition) {
          throw new Error(`invalid animator controller ${source}: transition must be an object`);
        }
        const from = strictStringValue(transition, 'from', `animator controller ${source}`);
        const to = strictStringValue(transition, 'to', `animator controller ${source}`);
        if ((from !== '*' && !stateNames.has(from)) || !stateNames.has(to)) {
          throw new Error(`invalid animator controller ${source}: transition ${from} -> ${to} references a missing state`);
        }
      }
    } else if (extension === '.manim') {
      const clip = readJsonAsset(absolute, root, 'animation clip');
      if (clip.tracks != null && !Array.isArray(clip.tracks)) {
        throw new Error(`invalid animation clip ${source}: tracks must be an array`);
      }
      if (clip.events != null && !Array.isArray(clip.events)) {
        throw new Error(`invalid animation clip ${source}: events must be an array`);
      }
    } else if (extension === '.gltf') {
      const model = readJsonAsset(absolute, root, 'glTF model');
      const enqueueUri = (value: unknown, kind: string) => {
        const uri = stringValue(jsonObject(value), 'uri');
        if (!uri || uri.startsWith('data:')) return;
        if (/^[a-z]+:/i.test(uri)) {
          throw new Error(`invalid glTF model ${source}: remote ${kind} URI is not supported: ${uri}`);
        }
        let decoded = uri;
        try {
          decoded = decodeURIComponent(uri);
        } catch {
          throw new Error(`invalid glTF model ${source}: malformed ${kind} URI: ${uri}`);
        }
        enqueue(
          portablePath(join(dirname(pending.path), decoded)),
          source,
          `glTF ${kind}`,
        );
      };
      if (model.buffers != null && !Array.isArray(model.buffers)) {
        throw new Error(`invalid glTF model ${source}: buffers must be an array`);
      }
      if (model.images != null && !Array.isArray(model.images)) {
        throw new Error(`invalid glTF model ${source}: images must be an array`);
      }
      for (const buffer of Array.isArray(model.buffers) ? model.buffers : []) {
        enqueueUri(buffer, 'buffer');
      }
      for (const image of Array.isArray(model.images) ? model.images : []) {
        enqueueUri(image, 'image');
      }
    } else if (extension === '.atlas') {
      const text = readFileSync(absolute, 'utf8');
      let expectsPage = true;
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) {
          expectsPage = true;
        } else if (expectsPage) {
          enqueue(
            portablePath(join(dirname(pending.path), line)),
            source,
            'Spine atlas page',
          );
          expectsPage = false;
        }
      }
    } else if (pending.kind === 'Spine skeleton' && extension === '.json') {
      readJsonAsset(absolute, root, 'Spine skeleton');
    }
  };

  for (const scene of project.buildScenes) enqueue(scene, 'project.json', 'build scene');
  while (queue.length > 0) {
    const pending = queue.shift()!;
    const absolute = resolveProjectPath(root, pending.path, pending.kind);
    if (!roots.some((contentRoot) => isPathInside(contentRoot, absolute))) {
      throw new Error(`${pending.kind} must be stored under Assets or Scripts: ${pending.path} (referenced by ${pending.from})`);
    }
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    const processKey = pending.spriteSlice ? `${key}#${pending.spriteSlice.toLowerCase()}` : key;
    if (processed.has(processKey)) continue;
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`missing ${pending.kind}: ${pending.path} (referenced by ${pending.from})`);
    }
    processed.add(processKey);
    visited.add(key);
    inspectJsonDependency(absolute, pending);
  }
  return {
    rootScenes: project.buildScenes.length,
    references,
    validatedFiles: visited.size,
  };
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
      .sort((left, right) => compareFileNames(left.name, right.name));
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
    .sort((left, right) => compareFileNames(left.name, right.name))) {
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
  const outputFile = join(
    stageDir,
    ...portable.replace(/\.tsx?$/i, '.js').split('/'),
  );
  mkdirSync(dirname(outputFile), { recursive: true });
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.None,
    moduleResolution: ts.ModuleResolutionKind.Classic,
    rootDir: sourceRoot,
    outFile: outputFile,
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
    .sort((left, right) => compareFileNames(left.name, right.name))) {
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

function u64LittleEndian(value: bigint): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

/** Deterministic aggregate fingerprint for the complete packaged payload. */
export function buildContentHash(files: readonly BuildFileEntry[]): string {
  const digest = createHash('sha256');
  for (const file of [...files].sort((left, right) => (
    Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8'))
  ))) {
    const path = Buffer.from(file.path, 'utf8');
    digest.update(u64LittleEndian(BigInt(path.byteLength)));
    digest.update(path);
    digest.update(u64LittleEndian(BigInt(file.size)));
    digest.update(Buffer.from(file.sha256, 'hex'));
  }
  return digest.digest('hex');
}

/** Atomically replaces a completed build while restoring the previous build on publish failure. */
export function publishStagedBuild(
  stageDir: string,
  outputDir: string,
  operations: DirectoryPublishOperations = directoryPublishOperations,
): void {
  mkdirSync(dirname(outputDir), { recursive: true });
  if (!operations.exists(outputDir)) {
    operations.rename(stageDir, outputDir);
    return;
  }

  const backupDir = join(
    dirname(outputDir),
    `.${basename(outputDir)}.mengine-backup-${randomUUID()}`,
  );
  operations.rename(outputDir, backupDir);
  try {
    operations.rename(stageDir, outputDir);
  } catch (publishError) {
    try {
      operations.rename(backupDir, outputDir);
    } catch (restoreError) {
      const publishDetail = publishError instanceof Error ? publishError.message : String(publishError);
      const restoreDetail = restoreError instanceof Error ? restoreError.message : String(restoreError);
      throw new Error(
        `player publish failed (${publishDetail}); the previous build remains at ${backupDir}, but automatic restore failed (${restoreDetail})`,
      );
    }
    throw publishError;
  }

  try {
    operations.remove(backupDir);
  } catch {
    // The new build is already published atomically. A locked hidden backup is safe to remove later.
  }
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
  validateProjectSettings(projectDir);
  const assetValidation = validateBuildAssetDependencies(projectDir, project);

  const stageDir = join(
    dirname(outputDir),
    `.${basename(outputDir)}.mengine-stage-${process.pid}-${randomUUID()}`,
  );
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  try {
    for (const root of roots) {
      copyTree(root, join(stageDir, basename(root)));
    }
    const projectSettings = join(projectDir, 'ProjectSettings');
    if (existsSync(projectSettings)) {
      if (!statSync(projectSettings).isDirectory()) {
        throw new Error(`ProjectSettings must be a directory: ${projectSettings}`);
      }
      copyTree(projectSettings, join(stageDir, 'ProjectSettings'));
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

    const files = collectFiles(stageDir);
    const manifest: PcBuildManifest = {
      schemaVersion: 1,
      engineVersion: options.engineVersion,
      platform,
      architecture: options.architecture ?? process.arch,
      profile: options.profile ?? 'release',
      executable,
      contentHash: buildContentHash(files),
      project: packagedProject,
      assetValidation,
      files,
    };
    writeFileSync(
      join(stageDir, BUILD_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    options.verifyStagedBuild?.(stageDir, manifest);
    publishStagedBuild(stageDir, outputDir);
    return manifest;
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }
}
