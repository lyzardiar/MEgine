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
export const BUILD_CACHE_REPORT_PREFIX = 'MENGINE_BUILD_CACHE ';
const MAX_TIMELINE_PARTICLE_TIME = 300;
const MAX_SURFACE_SHADER_PARAMETERS = 16;
const SURFACE_SHADER_PARAMETERS_MARKER = '/* MENGINE_PARAMETERS';
const ENTITY_REFERENCE_TOKEN = '$mengine_entity_ref';
const ENTITY_REFERENCE_FIELDS_KEY = '__mengine_entity_reference_fields';
const COMPONENT_ENTITY_REFERENCE_FIELDS = [
  ['Button', 'on_click'],
  ['Toggle', 'on_value_changed'],
  ['Slider', 'on_value_changed'],
  ['Scrollbar', 'on_value_changed'],
  ['InputField', 'on_value_changed'],
  ['InputField', 'on_submit'],
  ['Dropdown', 'on_value_changed'],
  ['ListView', 'on_value_changed'],
  ['ScrollView', 'on_value_changed'],
  ['TabView', 'on_value_changed'],
] as const;

export type BuildAssetMode = 'all' | 'referenced';

export interface GameProjectManifest {
  name: string;
  version: number | string;
  mainScene: string;
  buildScenes: string[];
  startupScript?: string;
  assetMode: BuildAssetMode;
  alwaysInclude: string[];
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
  /** Cooperative cancellation checked between validation, copy, compile, hash, and publish steps. */
  isCancelled?: () => boolean;
  /** Runs against the complete staging directory before it can replace a published build. */
  verifyStagedBuild?: (stageDir: string, manifest: PcBuildManifest) => void;
  /** Operational diagnostics kept outside the reproducible published manifest. */
  onBuildCacheStats?: (stats: BuildCacheStats) => void;
}

function assertBuildNotCancelled(isCancelled: (() => boolean) | undefined, stage: string): void {
  if (isCancelled?.()) throw new Error(`build cancelled during ${stage}`);
}

export interface BuildFileEntry {
  path: string;
  size: number;
  sha256: string;
  category: BuildContentCategory;
  includedBy: BuildInclusionReason[];
}

export type BuildContentCategory =
  | 'runtime'
  | 'scene'
  | 'script'
  | 'material'
  | 'shader'
  | 'texture'
  | 'model'
  | 'animation'
  | 'timeline'
  | 'audio'
  | 'prefab'
  | 'spine'
  | 'settings'
  | 'metadata'
  | 'other';

export interface BuildInclusionReason {
  kind: string;
  from: string;
}

export interface BuildContentCategorySummary {
  category: BuildContentCategory;
  files: number;
  bytes: number;
}

export interface BuildContentSummary {
  totalBytes: number;
  categories: BuildContentCategorySummary[];
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
  contentSummary: BuildContentSummary;
  files: BuildFileEntry[];
}

export interface BuildAssetValidation {
  assetMode: BuildAssetMode;
  rootScenes: number;
  references: number;
  validatedFiles: number;
  omittedAssetFiles: number;
  omittedAssetBytes: number;
  strippedEditorEntities: number;
}

export interface BuildCacheStats {
  enabled: boolean;
  hits: number;
  misses: number;
  reusedBytes: number;
  storedBytes: number;
  recoveredEntries: number;
  failures: number;
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

function isEditorAssetMetadata(path: string): boolean {
  return path.toLowerCase().endsWith('.meta');
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
  const assetModeValue = parsed.assetMode ?? parsed.asset_mode ?? 'all';
  if (assetModeValue !== 'all' && assetModeValue !== 'referenced') {
    throw new Error('project.json assetMode must be all or referenced');
  }
  const rawAlwaysInclude = parsed.alwaysInclude ?? parsed.always_include ?? [];
  if (!Array.isArray(rawAlwaysInclude)) {
    throw new Error('project.json alwaysInclude must be an array');
  }
  if (rawAlwaysInclude.length > 256) {
    throw new Error('project.json alwaysInclude supports at most 256 paths');
  }
  const alwaysInclude: string[] = [];
  const seenAlwaysInclude = new Set<string>();
  const roots = contentRoots(root);
  for (const value of rawAlwaysInclude) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error('project.json alwaysInclude entries must be non-empty paths');
    }
    const segments = value.trim().replaceAll('\\', '/').split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error(`invalid alwaysInclude path: ${value}`);
    }
    const path = segments.join('/');
    if (isEditorAssetMetadata(path)) {
      throw new Error(`alwaysInclude cannot package editor asset metadata: ${path}`);
    }
    const absolute = resolveProjectPath(root, path, 'alwaysInclude');
    if (!roots.some((contentRoot) => isPathInside(contentRoot, absolute))) {
      throw new Error(`alwaysInclude must be stored under Assets or Scripts: ${path}`);
    }
    if (!existsSync(absolute)) throw new Error(`alwaysInclude path not found: ${path}`);
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    if (seenAlwaysInclude.has(key)) throw new Error(`duplicate alwaysInclude path: ${path}`);
    seenAlwaysInclude.add(key);
    alwaysInclude.push(path);
  }
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
  return {
    name,
    version,
    mainScene,
    buildScenes,
    ...(startupScript ? { startupScript } : {}),
    assetMode: assetModeValue,
    alwaysInclude,
  };
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

interface BuildDependencyScan {
  validation: BuildAssetValidation;
  files: string[];
  inclusionReasons: Map<string, BuildInclusionReason[]>;
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

function surfaceShaderParameterNames(sourceText: string, source: string): Set<string> {
  const marker = sourceText.indexOf(SURFACE_SHADER_PARAMETERS_MARKER);
  if (marker < 0) return new Set();
  const jsonStart = marker + SURFACE_SHADER_PARAMETERS_MARKER.length;
  const relativeEnd = sourceText.slice(jsonStart).indexOf('*/');
  if (relativeEnd < 0) {
    throw new Error(`invalid material surface shader ${source}: parameter block is not terminated`);
  }
  const blockEnd = jsonStart + relativeEnd;
  if (sourceText.slice(blockEnd + 2).includes(SURFACE_SHADER_PARAMETERS_MARKER)) {
    throw new Error(`invalid material surface shader ${source}: only one parameter block is allowed`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText.slice(jsonStart, blockEnd).trim());
  } catch (reason) {
    throw new Error(`invalid material surface shader ${source}: parameter JSON ${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const root = jsonObject(parsed);
  if (!root || Object.keys(root).some((key) => key !== 'parameters')
    || !Array.isArray(root.parameters)) {
    throw new Error(`invalid material surface shader ${source}: parameter block must contain only a parameters array`);
  }
  if (root.parameters.length > MAX_SURFACE_SHADER_PARAMETERS) {
    throw new Error(`invalid material surface shader ${source}: more than ${MAX_SURFACE_SHADER_PARAMETERS} parameters`);
  }
  const names = new Set<string>();
  for (const [index, value] of root.parameters.entries()) {
    const parameter = jsonObject(value);
    if (!parameter || Object.keys(parameter).some(
      (key) => !['name', 'label', 'type', 'default', 'min', 'max'].includes(key),
    )) {
      throw new Error(`invalid material surface shader ${source}: parameter ${index + 1} contains unsupported fields`);
    }
    const name = strictStringValue(parameter, 'name', `Surface Shader ${source} parameter`);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name) || names.has(name)) {
      throw new Error(`invalid material surface shader ${source}: invalid or duplicate parameter '${name}'`);
    }
    names.add(name);
    if (parameter.label != null
      && (typeof parameter.label !== 'string' || parameter.label.trim().length > 64)) {
      throw new Error(`invalid material surface shader ${source}: parameter '${name}' has an invalid label`);
    }
    const type = parameter.type;
    const components = type === 'float' ? 1
      : type === 'vector2' ? 2
        : type === 'vector3' ? 3
          : type === 'vector4' || type === 'color' ? 4
            : 0;
    if (components === 0) {
      throw new Error(`invalid material surface shader ${source}: parameter '${name}' has unsupported type '${String(type)}'`);
    }
    const rawDefault = components === 1 ? [parameter.default] : parameter.default;
    if (!Array.isArray(rawDefault) || rawDefault.length !== components
      || rawDefault.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
      throw new Error(`invalid material surface shader ${source}: parameter '${name}' has an invalid default`);
    }
    const minimum = parameter.min == null && type === 'color' ? 0 : parameter.min;
    const maximum = parameter.max == null && type === 'color' ? 1 : parameter.max;
    if ((minimum != null && (typeof minimum !== 'number' || !Number.isFinite(minimum)))
      || (maximum != null && (typeof maximum !== 'number' || !Number.isFinite(maximum)))
      || (typeof minimum === 'number' && typeof maximum === 'number' && minimum > maximum)) {
      throw new Error(`invalid material surface shader ${source}: parameter '${name}' has an invalid range`);
    }
  }
  return names;
}

function hasEditorOnlyComponent(componentsValue: unknown): boolean {
  const components = jsonObject(componentsValue);
  return Boolean(components && Object.keys(components)
    .some((name) => name.toLowerCase() === 'editoronly'));
}

function decimalEntityReference(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const entity = BigInt(value.trim());
  if (entity > 0xffff_ffff_ffff_ffffn) return null;
  return entity.toString();
}

function entityReferenceKey(value: unknown): string | null {
  const entity = decimalEntityReference(value);
  if (entity != null) return entity;
  return null;
}

function componentEntityReferenceTargets(
  componentsValue: unknown,
  visit: (target: unknown, label: string) => void,
): void {
  const components = jsonObject(componentsValue);
  if (!components) return;
  for (const [componentName, fieldName] of COMPONENT_ENTITY_REFERENCE_FIELDS) {
    const component = jsonObject(components[componentName]);
    const field = component?.[fieldName];
    const calls = Array.isArray(field) ? field : field == null ? [] : [field];
    for (let index = 0; index < calls.length; index += 1) {
      const call = jsonObject(calls[index]);
      if (!call || !Object.hasOwn(call, 'target') || call.target == null) continue;
      const suffix = calls.length > 1 ? `[${index}]` : '';
      visit(call.target, `${componentName}.${fieldName}${suffix}.target`);
    }
  }
  for (const [componentName, value] of Object.entries(components)) {
    const component = jsonObject(value);
    if (!component || !Object.hasOwn(component, ENTITY_REFERENCE_FIELDS_KEY)) continue;
    const fields = component[ENTITY_REFERENCE_FIELDS_KEY];
    if (!Array.isArray(fields) || fields.length > 256) {
      throw new Error(
        `${componentName}.${ENTITY_REFERENCE_FIELDS_KEY} must be an array of at most 256 fields`,
      );
    }
    for (const field of fields) {
      if (typeof field !== 'string' || !field || field === ENTITY_REFERENCE_FIELDS_KEY) {
        throw new Error(`${componentName}.${ENTITY_REFERENCE_FIELDS_KEY} contains an invalid field`);
      }
      if (!Object.hasOwn(component, field) || component[field] == null) continue;
      visit(component[field], `${componentName}.${field}`);
    }
  }
}

type EntityReferenceScope =
  | { kind: 'scene'; entityIds: ReadonlySet<string> }
  | { kind: 'prefab'; nodeIds: ReadonlySet<string> };

function validateSerializedEntityReference(
  target: unknown,
  scope: EntityReferenceScope,
  source: string,
  label: string,
): void {
  const wrapper = jsonObject(target);
  if (wrapper && Object.hasOwn(wrapper, ENTITY_REFERENCE_TOKEN)) {
    const token = jsonObject(wrapper[ENTITY_REFERENCE_TOKEN]);
    if (!token) {
      throw new Error(`invalid ${scope.kind} ${source}: ${label} contains an invalid serialized entity reference`);
    }
    if (token.kind === 'missing') {
      const entity = decimalEntityReference(token.entity);
      if (entity == null) {
        throw new Error(`invalid ${scope.kind} ${source}: ${label} contains an invalid missing entity reference`);
      }
      throw new Error(`invalid ${scope.kind} ${source}: ${label} contains missing entity reference '${entity}'`);
    }
    if (token.kind === 'prefab_node') {
      const node = typeof token.node === 'string' ? token.node.trim() : '';
      if (!node) {
        throw new Error(`invalid ${scope.kind} ${source}: ${label} contains an invalid prefab node reference`);
      }
      if (scope.kind === 'scene') {
        throw new Error(`invalid scene ${source}: ${label} contains unresolved prefab node reference '${node}'`);
      }
      if (!scope.nodeIds.has(node)) {
        throw new Error(`invalid prefab ${source}: ${label} references missing prefab node '${node}'`);
      }
      return;
    }
    throw new Error(`invalid ${scope.kind} ${source}: ${label} contains an unsupported serialized entity reference`);
  }

  const entity = decimalEntityReference(target);
  if (entity == null) {
    throw new Error(`invalid ${scope.kind} ${source}: ${label} must be a serialized entity reference`);
  }
  if (scope.kind === 'prefab') {
    throw new Error(`invalid prefab ${source}: ${label} contains legacy scene entity reference '${entity}'`);
  }
  if (!scope.entityIds.has(entity)) {
    throw new Error(`invalid scene ${source}: ${label} references missing entity '${entity}'`);
  }
}

function validateSceneEntityReferences(scene: JsonObject, source: string): void {
  const world = jsonObject(scene.world);
  if (world?.entities != null && !Array.isArray(world.entities)) {
    throw new Error(`invalid scene ${source}: world.entities must be an array`);
  }
  const playerScene = filterEditorOnlySceneEntities(world?.entities);
  const entityIds = new Set<string>();
  for (const entity of playerScene.entities) {
    const id = decimalEntityReference(entity.entity);
    if (entity.entity == null) continue;
    if (id == null) {
      throw new Error(`invalid scene ${source}: player entity id must be a safe unsigned decimal`);
    }
    if (entityIds.has(id)) {
      throw new Error(`invalid scene ${source}: duplicate player entity id '${id}'`);
    }
    entityIds.add(id);
  }
  for (const entity of playerScene.entities) {
    try {
      componentEntityReferenceTargets(entity.components, (target, label) => {
        validateSerializedEntityReference(target, { kind: 'scene', entityIds }, source, label);
      });
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith('invalid scene ')) {
        throw new Error(`invalid scene ${source}: ${error.message}`);
      }
      throw error;
    }
  }
}

function validatePrefabEntityReferences(prefab: JsonObject, source: string): void {
  const root = Object.hasOwn(prefab, 'root') ? jsonObject(prefab.root) : prefab;
  if (!root) throw new Error(`invalid prefab ${source}: root must be an object`);
  const nodes: JsonObject[] = [];
  const nodeIds = new Set<string>();
  const collect = (node: JsonObject) => {
    if (hasEditorOnlyComponent(node.components)) return;
    nodes.push(node);
    if (node.id != null) {
      if (typeof node.id !== 'string' || !node.id.trim()) {
        throw new Error(`invalid prefab ${source}: node id must be a non-empty string`);
      }
      const id = node.id.trim();
      if (nodeIds.has(id)) throw new Error(`invalid prefab ${source}: duplicate node id '${id}'`);
      nodeIds.add(id);
    }
    if (Array.isArray(node.children)) {
      for (const childValue of node.children) {
        const child = jsonObject(childValue);
        if (!child) throw new Error(`invalid prefab ${source}: child node must be an object`);
        collect(child);
      }
    }
  };
  collect(root);
  for (const node of nodes) {
    try {
      componentEntityReferenceTargets(node.components, (target, label) => {
        validateSerializedEntityReference(target, { kind: 'prefab', nodeIds }, source, label);
      });
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith('invalid prefab ')) {
        throw new Error(`invalid prefab ${source}: ${error.message}`);
      }
      throw error;
    }
  }
}

function filterEditorOnlySceneEntities(entitiesValue: unknown): {
  entities: JsonObject[];
  removedIds: Set<string>;
  stripped: number;
} {
  const entities = (Array.isArray(entitiesValue) ? entitiesValue : [])
    .map(jsonObject)
    .filter((entity): entity is JsonObject => entity != null);
  const removedIds = new Set<string>();
  const removedWithoutId = new Set<JsonObject>();
  for (const entity of entities) {
    if (!hasEditorOnlyComponent(entity.components)) continue;
    const id = entityReferenceKey(entity.entity);
    if (id) removedIds.add(id);
    else removedWithoutId.add(entity);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of entities) {
      const id = entityReferenceKey(entity.entity);
      if (!id || removedIds.has(id)) continue;
      const parent = entityReferenceKey(entity.parent);
      if (parent && removedIds.has(parent)) {
        removedIds.add(id);
        changed = true;
      }
    }
  }
  const playerEntities = entities.filter((entity) => {
    if (removedWithoutId.has(entity)) return false;
    const id = entityReferenceKey(entity.entity);
    return !id || !removedIds.has(id);
  });
  return {
    entities: playerEntities,
    removedIds,
    stripped: entities.length - playerEntities.length,
  };
}

/**
 * Validates runtime asset references reachable from configured roots. Dynamic paths loaded by
 * script require alwaysInclude when the project uses referenced asset packaging.
 */
function scanBuildAssetDependencies(
  projectDir: string,
  project: GameProjectManifest = readGameProject(projectDir),
  isCancelled?: () => boolean,
): BuildDependencyScan {
  const root = resolve(projectDir);
  const roots = contentRoots(root);
  const queue: PendingAsset[] = [];
  const visited = new Map<string, string>();
  const processed = new Set<string>();
  const inclusionReasons = new Map<string, BuildInclusionReason[]>();
  const materialInstanceParents = new Map<string, string>();
  const entityReferenceAudits = new Set<string>();
  const surfaceShaderSchemas = new Map<string, Set<string>>();
  const customMaterialParameterBindings: Array<{
    material: string;
    shader: string;
    parameters: string[];
  }> = [];
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
    if (/\.(?:mmat|mat|minst)$/i.test(path) || path.includes('/') || path.includes('\\')) {
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
    enqueue(stringValue(component('TimelineDirector'), 'asset'), from, 'Timeline asset');
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
    if (hasEditorOnlyComponent(node.components)) return;
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
      validateSceneEntityReferences(scene, source);
      entityReferenceAudits.add(process.platform === 'win32' ? absolute.toLowerCase() : absolute);
      const world = jsonObject(scene.world);
      const playerScene = filterEditorOnlySceneEntities(world?.entities);
      for (const entity of playerScene.entities) {
        componentReferences(entity.components, source);
      }
    } else if (extension === '.prefab') {
      const prefab = readJsonAsset(absolute, root, 'prefab');
      validatePrefabEntityReferences(prefab, source);
      entityReferenceAudits.add(process.platform === 'win32' ? absolute.toLowerCase() : absolute);
      prefabNodeReferences(prefab.root ?? prefab, source);
    } else if (extension === '.minst') {
      const instance = readJsonAsset(absolute, root, 'material instance');
      if (instance.version !== 1) {
        throw new Error(`invalid material instance ${source}: unsupported version ${String(instance.version)}`);
      }
      if (instance.name != null && typeof instance.name !== 'string') {
        throw new Error(`invalid material instance ${source}: name must be a string`);
      }
      const parent = strictStringValue(instance, 'parent', `material instance ${source}`)
        .replaceAll('\\', '/');
      if (!parent.startsWith('Assets/')
        || !/\.(?:mmat|mat|minst)$/i.test(parent)
        || parent.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error(`invalid material instance ${source}: parent must reference a safe Assets .mmat, .mat, or .minst file`);
      }
      const overrides = instance.overrides == null ? {} : jsonObject(instance.overrides);
      if (!overrides) {
        throw new Error(`invalid material instance ${source}: overrides must be an object`);
      }
      const allowed = new Set([
        'base_color', 'metallic', 'roughness', 'ior', 'clearcoat', 'clearcoat_roughness',
        'emissive', 'emissive_strength',
      ]);
      const unknown = Object.keys(overrides).find((field) => !allowed.has(field));
      if (unknown) {
        throw new Error(`invalid material instance ${source}: unsupported override ${unknown}`);
      }
      const finiteRange = (field: string, minimum: number, maximum: number) => {
        const value = overrides[field];
        if (value != null && (typeof value !== 'number' || !Number.isFinite(value)
          || value < minimum || value > maximum)) {
          throw new Error(`invalid material instance ${source}: ${field} must be from ${minimum} to ${maximum}`);
        }
      };
      const finiteVector = (field: string, length: number, minimum: number, maximum: number) => {
        const value = overrides[field];
        if (value != null && (!Array.isArray(value) || value.length !== length
          || value.some((part) => typeof part !== 'number' || !Number.isFinite(part)
            || part < minimum || part > maximum))) {
          throw new Error(`invalid material instance ${source}: ${field} must contain ${length} finite values from ${minimum} to ${maximum}`);
        }
      };
      finiteVector('base_color', 4, 0, 1);
      finiteRange('metallic', 0, 1);
      finiteRange('roughness', 0.04, 1);
      finiteRange('ior', 1, 2.5);
      finiteRange('clearcoat', 0, 1);
      finiteRange('clearcoat_roughness', 0.04, 1);
      finiteVector('emissive', 3, 0, Number.MAX_VALUE);
      finiteRange('emissive_strength', 0, Number.MAX_VALUE);
      materialInstanceParents.set(source.toLowerCase(), parent.toLowerCase());
      enqueue(parent, source, 'material instance parent');
    } else if (extension === '.mmat' || extension === '.mat') {
      const material = readJsonAsset(absolute, root, 'material');
      if (material.version != null
        && (!Number.isInteger(material.version) || Number(material.version) < 1 || Number(material.version) > 8)) {
        throw new Error(`invalid material ${source}: unsupported version ${String(material.version)}`);
      }
      if (material.shader != null
        && material.shader !== 'pbr'
        && material.shader !== 'unlit'
        && material.shader !== 'custom') {
        throw new Error(`invalid material ${source}: shader must be pbr, unlit, or custom`);
      }
      const customShader = strictStringValue(material, 'custom_shader', `material ${source}`);
      const customParameters = material.custom_parameters == null
        ? {}
        : jsonObject(material.custom_parameters);
      if (!customParameters) {
        throw new Error(`invalid material ${source}: custom_parameters must be an object`);
      }
      const customParameterNames = Object.keys(customParameters);
      if (customParameterNames.length > MAX_SURFACE_SHADER_PARAMETERS) {
        throw new Error(`invalid material ${source}: more than ${MAX_SURFACE_SHADER_PARAMETERS} custom parameters`);
      }
      for (const name of customParameterNames) {
        const value = customParameters[name];
        if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)
          || !Array.isArray(value)
          || value.length !== 4
          || value.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
          throw new Error(`invalid material ${source}: invalid custom parameter '${name}'`);
        }
      }
      if (material.shader !== 'custom' && customParameterNames.length > 0) {
        throw new Error(`invalid material ${source}: only custom materials can contain custom_parameters`);
      }
      if (material.shader === 'custom') {
        if (!customShader) {
          throw new Error(`invalid material ${source}: custom shader requires custom_shader`);
        }
        if (!customShader.toLowerCase().endsWith('.mshader')) {
          throw new Error(`invalid material ${source}: custom_shader must reference a .mshader asset`);
        }
        enqueue(customShader, source, 'material surface shader');
        customMaterialParameterBindings.push({
          material: source,
          shader: customShader.replaceAll('\\', '/').toLowerCase(),
          parameters: customParameterNames,
        });
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
      if (material.ior != null
        && (typeof material.ior !== 'number'
          || !Number.isFinite(material.ior)
          || material.ior < 1
          || material.ior > 2.5)) {
        throw new Error(`invalid material ${source}: ior must be a finite number from 1 to 2.5`);
      }
      for (const field of ['wrap_u', 'wrap_v']) {
        const value = material[field];
        if (value != null && value !== 'repeat' && value !== 'clamp' && value !== 'mirror') {
          throw new Error(`invalid material ${source}: ${field} must be repeat, clamp, or mirror`);
        }
      }
      if (material.filter != null && material.filter !== 'nearest' && material.filter !== 'linear') {
        throw new Error(`invalid material ${source}: filter must be nearest or linear`);
      }
      if (material.mipmap_filter != null
        && material.mipmap_filter !== 'nearest'
        && material.mipmap_filter !== 'linear') {
        throw new Error(`invalid material ${source}: mipmap_filter must be nearest or linear`);
      }
      if (material.anisotropy != null
        && (!Number.isInteger(material.anisotropy)
          || Number(material.anisotropy) < 1
          || Number(material.anisotropy) > 16)) {
        throw new Error(`invalid material ${source}: anisotropy must be an integer from 1 to 16`);
      }
      if (Number(material.anisotropy ?? 1) > 1
        && (material.filter === 'nearest' || material.mipmap_filter === 'nearest')) {
        throw new Error(
          `invalid material ${source}: anisotropy above 1 requires linear texture and mipmap filters`,
        );
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
      if (!/\bfn\s+mengine_surface_hook\s*\(/.test(sourceText)
        && !/\bfn\s+mengine_lit_surface_hook\s*\(/.test(sourceText)) {
        throw new Error(`invalid material surface shader ${source}: missing fn mengine_lit_surface_hook or fn mengine_surface_hook`);
      }
      const forbidden = ['@group', '@binding', '@vertex', '@fragment', '@compute']
        .find((token) => sourceText.includes(token));
      if (forbidden) {
        throw new Error(`invalid material surface shader ${source}: ${forbidden} is reserved by the engine`);
      }
      surfaceShaderSchemas.set(source.toLowerCase(), surfaceShaderParameterNames(sourceText, source));
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
      const blendTreeParameters: Array<{ state: string; parameter: string }> = [];
      for (const stateValue of controller.states) {
        const state = jsonObject(stateValue);
        if (!state) throw new Error(`invalid animator controller ${source}: state must be an object`);
        const name = strictStringValue(state, 'name', `animator controller ${source}`);
        const clip = strictStringValue(state, 'clip', `animator controller ${source}`);
        const blendTreeValue = state.blend_tree;
        const blendTree = blendTreeValue == null ? null : jsonObject(blendTreeValue);
        if (blendTreeValue != null && !blendTree) {
          throw new Error(`invalid animator controller ${source}: state ${name || '(empty)'} Blend Tree must be an object`);
        }
        if (!name || Boolean(clip) === Boolean(blendTree)) {
          throw new Error(`invalid animator controller ${source}: every state needs a name and exactly one clip or Blend Tree`);
        }
        if (stateNames.has(name)) {
          throw new Error(`invalid animator controller ${source}: duplicate state ${name}`);
        }
        stateNames.add(name);
        if (blendTree) {
          const parameter = strictStringValue(blendTree, 'parameter', `animator controller ${source}`);
          if (!Array.isArray(blendTree.children)
            || blendTree.children.length < 2
            || blendTree.children.length > 32) {
            throw new Error(`invalid animator controller ${source}: state ${name} Blend Tree needs 2 to 32 children`);
          }
          let previousThreshold = Number.NEGATIVE_INFINITY;
          for (const childValue of blendTree.children) {
            const child = jsonObject(childValue);
            const threshold = child?.threshold;
            const childClip = child ? strictStringValue(child, 'clip', `animator controller ${source}`) : '';
            if (!child || typeof threshold !== 'number' || !Number.isFinite(threshold)
              || threshold <= previousThreshold || !childClip) {
              throw new Error(`invalid animator controller ${source}: state ${name} Blend Tree children need increasing finite thresholds and clips`);
            }
            previousThreshold = threshold;
            enqueue(childClip, source, `animator Blend Tree ${name} clip`);
          }
          blendTreeParameters.push({ state: name, parameter });
        } else {
          enqueue(clip, source, 'animation clip');
        }
      }
      const defaultState = strictStringValue(
        controller,
        'default_state',
        `animator controller ${source}`,
      );
      if (defaultState && !stateNames.has(defaultState)) {
        throw new Error(`invalid animator controller ${source}: default state ${defaultState} does not exist`);
      }
      if (controller.parameters != null && !Array.isArray(controller.parameters)) {
        throw new Error(`invalid animator controller ${source}: parameters must be an array`);
      }
      const parameterKinds = new Map<string, string>();
      for (const parameterValue of Array.isArray(controller.parameters) ? controller.parameters : []) {
        const parameter = jsonObject(parameterValue);
        if (!parameter) throw new Error(`invalid animator controller ${source}: parameter must be an object`);
        const parameterName = strictStringValue(parameter, 'name', `animator controller ${source}`);
        const kind = strictStringValue(parameter, 'kind', `animator controller ${source}`) || 'bool';
        if (!parameterName || parameterKinds.has(parameterName)
          || !['bool', 'float', 'int', 'trigger'].includes(kind)) {
          throw new Error(`invalid animator controller ${source}: invalid or duplicate parameter ${parameterName || '(empty)'}`);
        }
        parameterKinds.set(parameterName, kind);
      }
      for (const blendTree of blendTreeParameters) {
        const kind = parameterKinds.get(blendTree.parameter);
        if (kind !== 'float' && kind !== 'int') {
          throw new Error(`invalid animator controller ${source}: state ${blendTree.state} Blend Tree parameter ${blendTree.parameter || '(empty)'} must be Float or Int`);
        }
      }
      const validateTransitionConditions = (transition: JsonObject, owner: string) => {
        if (transition.conditions != null && !Array.isArray(transition.conditions)) {
          throw new Error(`invalid animator controller ${source}: ${owner} conditions must be an array`);
        }
        for (const conditionValue of Array.isArray(transition.conditions) ? transition.conditions : []) {
          const condition = jsonObject(conditionValue);
          if (!condition) throw new Error(`invalid animator controller ${source}: ${owner} condition must be an object`);
          const parameter = strictStringValue(condition, 'parameter', `animator controller ${source}`);
          const mode = strictStringValue(condition, 'mode', `animator controller ${source}`) || 'if';
          const kind = parameterKinds.get(parameter);
          const compatible = kind === 'bool'
            ? mode === 'if' || mode === 'if_not'
            : kind === 'trigger'
              ? mode === 'trigger'
              : kind === 'float' || kind === 'int'
                ? ['greater', 'less', 'equals', 'not_equal'].includes(mode)
                : false;
          if (!compatible) {
            throw new Error(`invalid animator controller ${source}: ${owner} condition ${mode} is incompatible with parameter ${parameter || '(empty)'}`);
          }
        }
      };
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
        validateTransitionConditions(transition, `transition ${from} -> ${to}`);
      }
      if (controller.layers != null && !Array.isArray(controller.layers)) {
        throw new Error(`invalid animator controller ${source}: layers must be an array`);
      }
      const layerNames = new Set<string>();
      for (const layerValue of Array.isArray(controller.layers) ? controller.layers : []) {
        const layer = jsonObject(layerValue);
        if (!layer) throw new Error(`invalid animator controller ${source}: layer must be an object`);
        const name = strictStringValue(layer, 'name', `animator controller ${source}`);
        if (!name || layerNames.has(name)) {
          throw new Error(`invalid animator controller ${source}: invalid or duplicate layer ${name || '(empty)'}`);
        }
        layerNames.add(name);
        if (layer.blend_mode != null && layer.blend_mode !== 'override' && layer.blend_mode !== 'additive') {
          throw new Error(`invalid animator controller ${source}: layer ${name} has unsupported blend_mode`);
        }
        if (layer.weight != null
          && (typeof layer.weight !== 'number'
            || !Number.isFinite(layer.weight)
            || layer.weight < 0
            || layer.weight > 1)) {
          throw new Error(`invalid animator controller ${source}: layer ${name} weight must be from 0 to 1`);
        }
        const timingMode = strictStringValue(layer, 'timing_mode', `animator controller ${source}`) || 'synced';
        if (timingMode !== 'synced' && timingMode !== 'independent') {
          throw new Error(`invalid animator controller ${source}: layer ${name} has unsupported timing_mode`);
        }
        if (layer.mask_paths != null
          && (!Array.isArray(layer.mask_paths)
            || layer.mask_paths.some((path) => typeof path !== 'string'))) {
          throw new Error(`invalid animator controller ${source}: layer ${name} mask_paths must be strings`);
        }
        if (Array.isArray(layer.mask_paths)
          && layer.mask_paths.some((path) => String(path).replaceAll('\\', '/').split('/').includes('..'))) {
          throw new Error(`invalid animator controller ${source}: layer ${name} has an unsafe Avatar Mask path`);
        }
        const avatarMask = strictStringValue(layer, 'avatar_mask', `animator controller ${source}`);
        if (avatarMask) {
          if (!avatarMask.toLowerCase().endsWith('.mavatar')) {
            throw new Error(`invalid animator controller ${source}: layer ${name} avatar_mask must reference a .mavatar asset`);
          }
          enqueue(avatarMask, source, `animator layer ${name} Avatar Mask`);
        }
        if (timingMode === 'independent') {
          if (!Array.isArray(layer.states) || layer.states.length === 0) {
            throw new Error(`invalid animator controller ${source}: independent layer ${name} states must be a non-empty array`);
          }
          const independentStateNames = new Set<string>();
          for (const stateValue of layer.states) {
            const state = jsonObject(stateValue);
            if (!state) throw new Error(`invalid animator controller ${source}: independent layer ${name} state must be an object`);
            const stateName = strictStringValue(state, 'name', `animator controller ${source}`);
            const clip = strictStringValue(state, 'clip', `animator controller ${source}`);
            if (!stateName || !clip || state.blend_tree != null || independentStateNames.has(stateName)) {
              throw new Error(`invalid animator controller ${source}: independent layer ${name} has invalid state ${stateName || '(empty)'}`);
            }
            independentStateNames.add(stateName);
            enqueue(clip, source, `independent animator layer ${name} clip`);
          }
          const independentDefault = strictStringValue(layer, 'default_state', `animator controller ${source}`);
          if (!independentStateNames.has(independentDefault)) {
            throw new Error(`invalid animator controller ${source}: independent layer ${name} default state ${independentDefault || '(empty)'} does not exist`);
          }
          if (layer.transitions != null && !Array.isArray(layer.transitions)) {
            throw new Error(`invalid animator controller ${source}: independent layer ${name} transitions must be an array`);
          }
          for (const transitionValue of Array.isArray(layer.transitions) ? layer.transitions : []) {
            const transition = jsonObject(transitionValue);
            if (!transition) throw new Error(`invalid animator controller ${source}: independent layer ${name} transition must be an object`);
            const from = strictStringValue(transition, 'from', `animator controller ${source}`);
            const to = strictStringValue(transition, 'to', `animator controller ${source}`);
            if ((from !== '*' && !independentStateNames.has(from)) || !independentStateNames.has(to) || from === to) {
              throw new Error(`invalid animator controller ${source}: independent layer ${name} transition ${from} -> ${to} is invalid`);
            }
            validateTransitionConditions(transition, `independent layer ${name} transition ${from} -> ${to}`);
          }
          continue;
        }
        if (layer.motions != null && !Array.isArray(layer.motions)) {
          throw new Error(`invalid animator controller ${source}: layer ${name} motions must be an array`);
        }
        const motionStates = new Set<string>();
        for (const motionValue of Array.isArray(layer.motions) ? layer.motions : []) {
          const motion = jsonObject(motionValue);
          if (!motion) throw new Error(`invalid animator controller ${source}: layer motion must be an object`);
          const state = strictStringValue(motion, 'state', `animator controller ${source}`);
          const clip = strictStringValue(motion, 'clip', `animator controller ${source}`);
          if (!stateNames.has(state) || !clip || motionStates.has(state)) {
            throw new Error(`invalid animator controller ${source}: layer ${name} has invalid state motion ${state || '(empty)'}`);
          }
          motionStates.add(state);
          enqueue(clip, source, `animator layer ${name} clip`);
        }
      }
    } else if (extension === '.mavatar') {
      const mask = readJsonAsset(absolute, root, 'Avatar Mask');
      if (mask.version != null && (!Number.isInteger(mask.version) || Number(mask.version) < 1)) {
        throw new Error(`invalid Avatar Mask ${source}: version must be a positive integer`);
      }
      if (!Array.isArray(mask.paths) || mask.paths.some((path) => typeof path !== 'string')) {
        throw new Error(`invalid Avatar Mask ${source}: paths must be an array of strings`);
      }
      if (mask.paths.some((path) => String(path).replaceAll('\\', '/').split('/').includes('..'))) {
        throw new Error(`invalid Avatar Mask ${source}: paths cannot contain '..'`);
      }
    } else if (extension === '.manim') {
      const clip = readJsonAsset(absolute, root, 'animation clip');
      if (clip.tracks != null && !Array.isArray(clip.tracks)) {
        throw new Error(`invalid animation clip ${source}: tracks must be an array`);
      }
      if (clip.events != null && !Array.isArray(clip.events)) {
        throw new Error(`invalid animation clip ${source}: events must be an array`);
      }
    } else if (extension === '.mtimeline') {
      const timeline = readJsonAsset(absolute, root, 'Timeline asset');
      if (timeline.version !== 1) {
        throw new Error(`invalid Timeline asset ${source}: version must be 1`);
      }
      if (typeof timeline.duration !== 'number' || !Number.isFinite(timeline.duration) || timeline.duration <= 0) {
        throw new Error(`invalid Timeline asset ${source}: duration must be positive`);
      }
      const timelineDuration = timeline.duration;
      if (timeline.frame_rate != null
        && (typeof timeline.frame_rate !== 'number'
          || !Number.isFinite(timeline.frame_rate)
          || timeline.frame_rate <= 0
          || timeline.frame_rate > 240)) {
        throw new Error(`invalid Timeline asset ${source}: frame_rate must be between 0 and 240`);
      }
      if (!Array.isArray(timeline.tracks)) {
        throw new Error(`invalid Timeline asset ${source}: tracks must be an array`);
      }
      const trackIds = new Set<string>();
      const activationTargets = new Set<string>();
      const audioTargets = new Set<string>();
      const animationTargets = new Set<string>();
      const particleTargets = new Set<string>();
      let cameraTrackSeen = false;
      for (const trackValue of timeline.tracks) {
        const track = jsonObject(trackValue);
        if (!track || (track.type !== 'signal' && track.type !== 'activation' && track.type !== 'audio' && track.type !== 'animation' && track.type !== 'particle' && track.type !== 'camera')) {
          throw new Error(`invalid Timeline asset ${source}: unsupported track type`);
        }
        const id = strictStringValue(track, 'id', `Timeline asset ${source}`);
        const name = strictStringValue(track, 'name', `Timeline asset ${source}`);
        if (!id || !name || trackIds.has(id)) {
          throw new Error(`invalid Timeline asset ${source}: track ids and names must be non-empty and ids unique`);
        }
        trackIds.add(id);
        if (track.muted != null && typeof track.muted !== 'boolean') {
          throw new Error(`invalid Timeline asset ${source}: track muted must be boolean`);
        }
        if (track.locked != null && typeof track.locked !== 'boolean') {
          throw new Error(`invalid Timeline asset ${source}: track locked must be boolean`);
        }
        if (track.type === 'signal') {
          if (track.markers != null && !Array.isArray(track.markers)) {
            throw new Error(`invalid Timeline asset ${source}: signal markers must be an array`);
          }
          for (const markerValue of Array.isArray(track.markers) ? track.markers : []) {
            const marker = jsonObject(markerValue);
            if (!marker) {
              throw new Error(`invalid Timeline asset ${source}: signal marker must be an object`);
            }
            const markerName = strictStringValue(marker, 'name', `Timeline asset ${source}`);
            const time = marker.time;
            if (!markerName || typeof time !== 'number' || !Number.isFinite(time) || time < 0 || time > timelineDuration) {
              throw new Error(`invalid Timeline asset ${source}: signal marker is invalid or outside duration`);
            }
          }
          continue;
        }
        if (track.type === 'camera') {
          if (cameraTrackSeen) {
            throw new Error(`invalid Timeline asset ${source}: only one camera track is allowed`);
          }
          cameraTrackSeen = true;
          if (track.clips != null && !Array.isArray(track.clips)) {
            throw new Error(`invalid Timeline asset ${source}: camera clips must be an array`);
          }
          const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
            const clip = jsonObject(clipValue);
            if (!clip) throw new Error(`invalid Timeline asset ${source}: camera clip must be an object`);
            const target = strictStringValue(clip, 'target', `Timeline camera track ${name}`).replaceAll('\\', '/');
            if (typeof clip.start !== 'number' || !Number.isFinite(clip.start)
              || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
              || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > timelineDuration
              || !target || target.startsWith('/')
              || target.split('/').some((segment) => !segment || segment === '.' || segment === '..')
              || clip.blend_in != null && (typeof clip.blend_in !== 'number' || !Number.isFinite(clip.blend_in) || clip.blend_in < 0 || clip.blend_in > clip.duration)
              || clip.blend_curve != null && (typeof clip.blend_curve !== 'string'
                || !['linear', 'ease_in_out'].includes(clip.blend_curve.trim().toLowerCase()))) {
              throw new Error(`invalid Timeline asset ${source}: camera clip is invalid or outside duration`);
            }
            return clip as { start: number; duration: number };
          }).sort((left, right) => left.start - right.start);
          for (let index = 1; index < clips.length; index += 1) {
            if (clips[index - 1].start + clips[index - 1].duration > clips[index].start) {
              throw new Error(`invalid Timeline asset ${source}: camera clips overlap`);
            }
          }
          continue;
        }
        if (track.type === 'activation') {
        const target = strictStringValue(track, 'target', `Timeline asset ${source}`).replaceAll('\\', '/');
        if (!target || target.startsWith('/')
          || target.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
          throw new Error(`invalid Timeline asset ${source}: activation target must be a descendant path without '.' or '..'`);
        }
        if (activationTargets.has(target)) {
          throw new Error(`invalid Timeline asset ${source}: activation target ${target} is controlled more than once`);
        }
        activationTargets.add(target);
        if (track.clips != null && !Array.isArray(track.clips)) {
          throw new Error(`invalid Timeline asset ${source}: activation clips must be an array`);
        }
        const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
          const clip = jsonObject(clipValue);
          if (!clip || typeof clip.start !== 'number' || !Number.isFinite(clip.start)
            || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
            || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > timelineDuration
            || typeof clip.active !== 'boolean') {
            throw new Error(`invalid Timeline asset ${source}: activation clip is invalid or outside duration`);
          }
          return clip as { start: number; duration: number };
        }).sort((left, right) => left.start - right.start);
        for (let index = 1; index < clips.length; index += 1) {
          if (clips[index - 1].start + clips[index - 1].duration > clips[index].start) {
            throw new Error(`invalid Timeline asset ${source}: activation clips overlap`);
          }
        }
          continue;
        }
        if (track.type === 'audio') {
        const target = strictStringValue(track, 'target', `Timeline asset ${source}`).replaceAll('\\', '/');
        if (!target || target.startsWith('/')
          || target.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
          throw new Error(`invalid Timeline asset ${source}: audio target must be a descendant path without '.' or '..'`);
        }
        if (audioTargets.has(target)) {
          throw new Error(`invalid Timeline asset ${source}: audio target ${target} is controlled more than once`);
        }
        audioTargets.add(target);
        if (track.clips != null && !Array.isArray(track.clips)) {
          throw new Error(`invalid Timeline asset ${source}: audio clips must be an array`);
        }
        const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
          const clip = jsonObject(clipValue);
          if (!clip) throw new Error(`invalid Timeline asset ${source}: audio clip must be an object`);
          const clipPath = strictStringValue(clip, 'clip', `Timeline audio track ${name}`).replaceAll('\\', '/');
          if (typeof clip.start !== 'number' || !Number.isFinite(clip.start)
            || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
            || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > timelineDuration
            || !clipPath.toLowerCase().startsWith('assets/')
            || clipPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
            || !/\.(?:wav|ogg|mp3|flac)$/i.test(clipPath)
            || clip.clip_in != null && (typeof clip.clip_in !== 'number' || !Number.isFinite(clip.clip_in) || clip.clip_in < 0)
            || clip.volume != null && (typeof clip.volume !== 'number' || !Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 4)
            || clip.pitch != null && (typeof clip.pitch !== 'number' || !Number.isFinite(clip.pitch) || clip.pitch < 0.05 || clip.pitch > 4)
            || clip.looped != null && typeof clip.looped !== 'boolean') {
            throw new Error(`invalid Timeline asset ${source}: audio clip is invalid or outside duration`);
          }
          enqueue(clipPath, source, `Timeline audio track ${name} clip`);
          return clip as { start: number; duration: number };
        }).sort((left, right) => left.start - right.start);
        for (let index = 1; index < clips.length; index += 1) {
          if (clips[index - 1].start + clips[index - 1].duration > clips[index].start) {
            throw new Error(`invalid Timeline asset ${source}: audio clips overlap`);
          }
        }
          continue;
        }
        if (track.type === 'particle') {
        const target = strictStringValue(track, 'target', `Timeline asset ${source}`).replaceAll('\\', '/');
        if (!target || target.startsWith('/')
          || target.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
          throw new Error(`invalid Timeline asset ${source}: particle target must be a descendant path without '.' or '..'`);
        }
        if (particleTargets.has(target)) {
          throw new Error(`invalid Timeline asset ${source}: particle target ${target} is controlled more than once`);
        }
        particleTargets.add(target);
        if (track.clips != null && !Array.isArray(track.clips)) {
          throw new Error(`invalid Timeline asset ${source}: particle clips must be an array`);
        }
        const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
          const clip = jsonObject(clipValue);
          if (!clip || typeof clip.start !== 'number' || !Number.isFinite(clip.start)
            || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
            || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > timelineDuration
            || clip.clip_in != null && (typeof clip.clip_in !== 'number' || !Number.isFinite(clip.clip_in) || clip.clip_in < 0)
            || (typeof clip.clip_in === 'number' ? clip.clip_in : 0) + clip.duration > MAX_TIMELINE_PARTICLE_TIME) {
            throw new Error(`invalid Timeline asset ${source}: particle clip is invalid or outside duration`);
          }
          return clip as { start: number; duration: number };
        }).sort((left, right) => left.start - right.start);
        for (let index = 1; index < clips.length; index += 1) {
          if (clips[index - 1].start + clips[index - 1].duration > clips[index].start) {
            throw new Error(`invalid Timeline asset ${source}: particle clips overlap`);
          }
        }
          continue;
        }
        const target = strictStringValue(track, 'target', `Timeline asset ${source}`).replaceAll('\\', '/');
        if (!target || target.startsWith('/')
          || target.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
          throw new Error(`invalid Timeline asset ${source}: animation target must be a descendant path without '.' or '..'`);
        }
        if (animationTargets.has(target)) {
          throw new Error(`invalid Timeline asset ${source}: animation target ${target} is controlled more than once`);
        }
        animationTargets.add(target);
        if (track.clips != null && !Array.isArray(track.clips)) {
          throw new Error(`invalid Timeline asset ${source}: animation clips must be an array`);
        }
        const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
          const clip = jsonObject(clipValue);
          if (!clip) throw new Error(`invalid Timeline asset ${source}: animation clip must be an object`);
          const clipPath = strictStringValue(clip, 'clip', `Timeline animation track ${name}`).replaceAll('\\', '/');
          if (typeof clip.start !== 'number' || !Number.isFinite(clip.start)
            || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
            || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > timelineDuration
            || !clipPath.toLowerCase().startsWith('assets/')
            || clipPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
            || !/\.manim$/i.test(clipPath)
            || clip.clip_in != null && (typeof clip.clip_in !== 'number' || !Number.isFinite(clip.clip_in) || clip.clip_in < 0)
            || clip.speed != null && (typeof clip.speed !== 'number' || !Number.isFinite(clip.speed) || clip.speed < -4 || clip.speed > 4)) {
            throw new Error(`invalid Timeline asset ${source}: animation clip is invalid or outside duration`);
          }
          enqueue(clipPath, source, `Timeline animation track ${name} clip`);
          return clip as { start: number; duration: number };
        }).sort((left, right) => left.start - right.start);
        for (let index = 1; index < clips.length; index += 1) {
          if (clips[index - 1].start + clips[index - 1].duration > clips[index].start) {
            throw new Error(`invalid Timeline asset ${source}: animation clips overlap`);
          }
        }
      }
      if (timeline.groups != null && !Array.isArray(timeline.groups)) {
        throw new Error(`invalid Timeline asset ${source}: groups must be an array`);
      }
      const groupIds = new Set<string>();
      const groupedTrackIds = new Set<string>();
      for (const groupValue of Array.isArray(timeline.groups) ? timeline.groups : []) {
        const group = jsonObject(groupValue);
        if (!group) throw new Error(`invalid Timeline asset ${source}: group must be an object`);
        const id = strictStringValue(group, 'id', `Timeline asset ${source}`);
        const name = strictStringValue(group, 'name', `Timeline asset ${source}`);
        if (!id || !name || groupIds.has(id)) {
          throw new Error(`invalid Timeline asset ${source}: group ids and names must be non-empty and ids unique`);
        }
        groupIds.add(id);
        if (group.muted != null && typeof group.muted !== 'boolean'
          || group.locked != null && typeof group.locked !== 'boolean'
          || group.collapsed != null && typeof group.collapsed !== 'boolean') {
          throw new Error(`invalid Timeline asset ${source}: group flags must be boolean`);
        }
        if (group.track_ids != null && !Array.isArray(group.track_ids)) {
          throw new Error(`invalid Timeline asset ${source}: group track_ids must be an array`);
        }
        for (const trackId of Array.isArray(group.track_ids) ? group.track_ids : []) {
          if (typeof trackId !== 'string' || !trackIds.has(trackId)) {
            throw new Error(`invalid Timeline asset ${source}: group references a missing track`);
          }
          if (groupedTrackIds.has(trackId)) {
            throw new Error(`invalid Timeline asset ${source}: track ${trackId} belongs to more than one group`);
          }
          groupedTrackIds.add(trackId);
        }
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

  const enqueueAlwaysInclude = (path: string) => {
    const absolute = resolveProjectPath(root, path, 'alwaysInclude');
    const walk = (candidate: string) => {
      assertBuildNotCancelled(isCancelled, 'asset dependency scan');
      const stats = lstatSync(candidate);
      if (stats.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in alwaysInclude: ${portablePath(relative(root, candidate))}`);
      }
      if (stats.isDirectory()) {
        for (const entry of readdirSync(candidate, { withFileTypes: true })
          .sort((left, right) => compareFileNames(left.name, right.name))) {
          walk(join(candidate, entry.name));
        }
        return;
      }
      if (stats.isFile() && !/\.tsx?$/i.test(candidate) && !isEditorAssetMetadata(candidate)) {
        enqueue(
          portablePath(relative(root, candidate)),
          'project.json alwaysInclude',
          'always included asset',
        );
      }
    };
    walk(absolute);
  };

  for (const scene of project.buildScenes) enqueue(scene, 'project.json', 'build scene');
  if (project.startupScript && !/\.tsx?$/i.test(project.startupScript)) {
    enqueue(project.startupScript, 'project.json', 'startup script');
  }
  for (const path of project.alwaysInclude) enqueueAlwaysInclude(path);
  while (queue.length > 0) {
    assertBuildNotCancelled(isCancelled, 'asset dependency scan');
    const pending = queue.shift()!;
    const absolute = resolveProjectPath(root, pending.path, pending.kind);
    if (!roots.some((contentRoot) => isPathInside(contentRoot, absolute))) {
      throw new Error(`${pending.kind} must be stored under Assets or Scripts: ${pending.path} (referenced by ${pending.from})`);
    }
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    const processKey = pending.spriteSlice ? `${key}#${pending.spriteSlice.toLowerCase()}` : key;
    const source = portablePath(relative(root, absolute));
    const sourceKey = process.platform === 'win32' ? source.toLowerCase() : source;
    const reasons = inclusionReasons.get(sourceKey) ?? [];
    if (!reasons.some((reason) => reason.kind === pending.kind && reason.from === pending.from)) {
      reasons.push({ kind: pending.kind, from: pending.from });
      reasons.sort((left, right) => (
        compareFileNames(left.kind, right.kind) || compareFileNames(left.from, right.from)
      ));
      inclusionReasons.set(sourceKey, reasons);
    }
    if (processed.has(processKey)) continue;
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`missing ${pending.kind}: ${pending.path} (referenced by ${pending.from})`);
    }
    processed.add(processKey);
    visited.set(key, absolute);
    if (/\.(?:png|jpe?g|webp|bmp|gif|tga)$/i.test(absolute)) {
      const sidecar = `${absolute}.sprite.json`;
      if (existsSync(sidecar) && statSync(sidecar).isFile()) {
        const sidecarPath = portablePath(relative(root, sidecar));
        const sidecarKey = process.platform === 'win32' ? sidecar.toLowerCase() : sidecar;
        const alreadyQueued = queue.some((candidate) => (
          candidate.path.replaceAll('\\', '/').toLowerCase() === sidecarPath.toLowerCase()
        ));
        if (!visited.has(sidecarKey) && !alreadyQueued) {
          enqueue(
            sidecarPath,
            portablePath(relative(root, absolute)),
            'sprite import metadata',
          );
        }
      }
    }
    inspectJsonDependency(absolute, pending);
  }
  if (project.assetMode === 'all') {
    for (const contentRoot of roots) {
      for (const candidate of collectPackageCandidateFiles(contentRoot, [], isCancelled)) {
        if (!/\.(?:mscene|prefab)$/i.test(candidate.path)) continue;
        const key = process.platform === 'win32' ? candidate.path.toLowerCase() : candidate.path;
        if (entityReferenceAudits.has(key)) continue;
        const source = portablePath(relative(root, candidate.path));
        if (/\.mscene$/i.test(candidate.path)) {
          validateSceneEntityReferences(readJsonAsset(candidate.path, root, 'scene'), source);
        } else {
          validatePrefabEntityReferences(readJsonAsset(candidate.path, root, 'prefab'), source);
        }
        entityReferenceAudits.add(key);
      }
    }
  }
  for (const binding of customMaterialParameterBindings) {
    const schema = surfaceShaderSchemas.get(binding.shader);
    if (!schema) {
      throw new Error(`invalid material ${binding.material}: Surface Shader schema was not validated`);
    }
    const unknown = binding.parameters.find((name) => !schema.has(name));
    if (unknown) {
      throw new Error(
        `invalid material ${binding.material}: parameter '${unknown}' is not declared by ${binding.shader}`,
      );
    }
  }
  for (const start of materialInstanceParents.keys()) {
    const seen = new Map<string, number>();
    const chain: string[] = [];
    let current: string | undefined = start;
    while (current && materialInstanceParents.has(current)) {
      const cycleIndex = seen.get(current);
      if (cycleIndex != null) {
        const cycle = [...chain.slice(cycleIndex), current];
        throw new Error(`invalid material instance inheritance cycle: ${cycle.join(' -> ')}`);
      }
      if (chain.length >= 32) {
        throw new Error(`invalid material instance ${start}: inheritance exceeds 32 levels`);
      }
      seen.set(current, chain.length);
      chain.push(current);
      current = materialInstanceParents.get(current);
    }
  }
  return {
    validation: {
      assetMode: project.assetMode,
      rootScenes: project.buildScenes.length,
      references,
      validatedFiles: visited.size,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0,
    },
    files: [...visited.values()].sort(compareFileNames),
    inclusionReasons,
  };
}

export function validateBuildAssetDependencies(
  projectDir: string,
  project: GameProjectManifest = readGameProject(projectDir),
): BuildAssetValidation {
  return scanBuildAssetDependencies(projectDir, project).validation;
}

function safeExecutableName(name: string): string {
  let cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned || 'MEngineGame';
}

type PlayerCopyStats = { strippedEditorEntities: number };

type CachedArtifactMetadata = {
  strippedEditorEntities: number;
};

type CachedArtifactEntry = {
  schemaVersion: 1;
  omitted: boolean;
  size: number;
  sha256: string;
  metadata: CachedArtifactMetadata;
};

const BUILD_CACHE_ROOT = ['.mengine', 'Library', 'BuildCache', 'v1'] as const;

function cacheKey(domain: string, sourceHash: string): string {
  return createHash('sha256')
    .update('mengine-build-artifact-v1\0')
    .update(domain)
    .update('\0')
    .update(sourceHash)
    .digest('hex');
}

function cachePathIsSafe(projectDir: string, path: string): boolean {
  let current = projectDir;
  for (const segment of BUILD_CACHE_ROOT) {
    current = join(current, segment);
    if (!existsSync(current)) continue;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  }
  return resolve(path) === resolve(projectDir, ...BUILD_CACHE_ROOT);
}

function atomicCacheWrite(path: string, data: string | Buffer): void {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, data);
    if (existsSync(path)) rmSync(path, { force: true });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

class BuildArtifactCache {
  readonly stats: BuildCacheStats = {
    enabled: false,
    hits: 0,
    misses: 0,
    reusedBytes: 0,
    storedBytes: 0,
    recoveredEntries: 0,
    failures: 0,
  };

  private constructor(private readonly root: string | null) {
    this.stats.enabled = root != null;
  }

  static open(projectDir: string): BuildArtifactCache {
    const root = resolve(projectDir, ...BUILD_CACHE_ROOT);
    try {
      if (!cachePathIsSafe(projectDir, root)) return new BuildArtifactCache(null);
      mkdirSync(join(root, 'entries'), { recursive: true });
      mkdirSync(join(root, 'objects'), { recursive: true });
      if (!cachePathIsSafe(projectDir, root)) return new BuildArtifactCache(null);
      for (const directory of [join(root, 'entries'), join(root, 'objects')]) {
        const stat = lstatSync(directory);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return new BuildArtifactCache(null);
      }
      return new BuildArtifactCache(root);
    } catch {
      return new BuildArtifactCache(null);
    }
  }

  private entryPath(key: string): string {
    return join(this.root!, 'entries', `${key}.json`);
  }

  private objectPath(hash: string): string {
    return join(this.root!, 'objects', hash.slice(0, 2), hash);
  }

  private safeDirectory(path: string, create: boolean): boolean {
    if (!this.root || !isPathInside(this.root, path)) return false;
    if (!existsSync(this.root)) return false;
    const rootStat = lstatSync(this.root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return false;
    const relativePath = relative(this.root, path);
    const segments = relativePath ? relativePath.split(sep).filter(Boolean) : [];
    let current = this.root;
    for (const segment of segments) {
      current = join(current, segment);
      if (!existsSync(current)) {
        if (!create) return false;
        mkdirSync(current);
      }
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    }
    return true;
  }

  private recover(path: string, objectPath?: string): void {
    this.stats.recoveredEntries += 1;
    try { rmSync(path, { force: true }); } catch { this.stats.failures += 1; }
    if (objectPath) {
      try { rmSync(objectPath, { force: true }); } catch { this.stats.failures += 1; }
    }
  }

  restore(
    key: string,
    destination: string,
    allowOmitted: boolean,
    isCancelled?: () => boolean,
  ): CachedArtifactMetadata | null {
    if (!this.root) return null;
    assertBuildNotCancelled(isCancelled, 'build cache lookup');
    const entryPath = this.entryPath(key);
    if (!this.safeDirectory(dirname(entryPath), false)) {
      this.stats.failures += 1;
      this.stats.misses += 1;
      return null;
    }
    if (!existsSync(entryPath)) {
      this.stats.misses += 1;
      return null;
    }
    try {
      const entryStat = lstatSync(entryPath);
      if (entryStat.isSymbolicLink() || !entryStat.isFile()) {
        this.recover(entryPath);
        this.stats.misses += 1;
        return null;
      }
      let entry: Partial<CachedArtifactEntry>;
      try {
        entry = JSON.parse(readFileSync(entryPath, 'utf8')) as Partial<CachedArtifactEntry>;
      } catch (error) {
        if (error instanceof SyntaxError) {
          this.recover(entryPath);
          this.stats.misses += 1;
          return null;
        }
        throw error;
      }
      const validMetadata = entry.metadata != null
        && Number.isSafeInteger(entry.metadata.strippedEditorEntities)
        && entry.metadata.strippedEditorEntities >= 0;
      const validHash = typeof entry.sha256 === 'string'
        && /^[0-9a-f]{64}$/.test(entry.sha256);
      const validSize = Number.isSafeInteger(entry.size) && Number(entry.size) >= 0;
      if (entry.schemaVersion !== 1 || typeof entry.omitted !== 'boolean'
        || !validMetadata || !validSize || (!entry.omitted && !validHash)
        || (entry.omitted && !allowOmitted)) {
        this.recover(entryPath);
        this.stats.misses += 1;
        return null;
      }
      if (entry.omitted) {
        this.stats.hits += 1;
        return entry.metadata as CachedArtifactMetadata;
      }
      const objectPath = this.objectPath(entry.sha256!);
      if (!this.safeDirectory(dirname(objectPath), false)) {
        this.recover(entryPath);
        this.stats.misses += 1;
        return null;
      }
      if (!existsSync(objectPath)) {
        this.recover(entryPath);
        this.stats.misses += 1;
        return null;
      }
      const objectStat = lstatSync(objectPath);
      if (objectStat.isSymbolicLink() || !objectStat.isFile()
        || objectStat.size !== entry.size || sha256(objectPath) !== entry.sha256) {
        this.recover(entryPath, objectPath);
        this.stats.misses += 1;
        return null;
      }
      assertBuildNotCancelled(isCancelled, 'build cache restore');
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(objectPath, destination);
      this.stats.hits += 1;
      this.stats.reusedBytes += entry.size!;
      return entry.metadata as CachedArtifactMetadata;
    } catch {
      assertBuildNotCancelled(isCancelled, 'build cache restore');
      this.stats.failures += 1;
      this.stats.misses += 1;
      this.recover(entryPath);
      try { rmSync(destination, { force: true }); } catch { this.stats.failures += 1; }
      return null;
    }
  }

  store(
    key: string,
    artifact: string | null,
    metadata: CachedArtifactMetadata,
    isCancelled?: () => boolean,
  ): void {
    if (!this.root) return;
    assertBuildNotCancelled(isCancelled, 'build cache store');
    const entryPath = this.entryPath(key);
    if (!this.safeDirectory(dirname(entryPath), false)) {
      this.stats.failures += 1;
      return;
    }
    try {
      let entry: CachedArtifactEntry;
      if (artifact == null) {
        entry = {
          schemaVersion: 1,
          omitted: true,
          size: 0,
          sha256: '',
          metadata,
        };
      } else {
        const size = statSync(artifact).size;
        const hash = sha256(artifact);
        const objectPath = this.objectPath(hash);
        if (!this.safeDirectory(dirname(entryPath), false)
          || !this.safeDirectory(dirname(objectPath), true)) {
          throw new Error('unsafe build cache directory');
        }
        let validObject = false;
        if (existsSync(objectPath)) {
          const objectStat = lstatSync(objectPath);
          validObject = !objectStat.isSymbolicLink() && objectStat.isFile()
            && objectStat.size === size && sha256(objectPath) === hash;
          if (!validObject) this.recover(entryPath, objectPath);
        }
        if (!validObject) {
          const temporary = join(
            dirname(objectPath),
            `.${hash}.${process.pid}-${randomUUID()}.tmp`,
          );
          try {
            copyFileSync(artifact, temporary);
            if (sha256(temporary) !== hash) throw new Error('cache artifact copy changed content');
            if (existsSync(objectPath)) rmSync(objectPath, { force: true });
            renameSync(temporary, objectPath);
            this.stats.storedBytes += size;
          } finally {
            rmSync(temporary, { force: true });
          }
        }
        entry = { schemaVersion: 1, omitted: false, size, sha256: hash, metadata };
      }
      atomicCacheWrite(entryPath, `${JSON.stringify(entry)}\n`);
    } catch {
      this.stats.failures += 1;
    }
  }
}

function copyTree(
  source: string,
  destination: string,
  cache: BuildArtifactCache,
  isCancelled?: () => boolean,
): PlayerCopyStats {
  assertBuildNotCancelled(isCancelled, 'content copy');
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    throw new Error(`symbolic links are not allowed in player content: ${source}`);
  }
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    const stats: PlayerCopyStats = { strippedEditorEntities: 0 };
    const entries = readdirSync(source, { withFileTypes: true })
      .sort((left, right) => compareFileNames(left.name, right.name));
    for (const entry of entries) {
      const child = copyTree(
        join(source, entry.name),
        join(destination, entry.name),
        cache,
        isCancelled,
      );
      stats.strippedEditorEntities += child.strippedEditorEntities;
    }
    return stats;
  }
  if (sourceStat.isFile()) {
    if (/\.tsx?$/i.test(source) || isEditorAssetMetadata(source)) {
      return { strippedEditorEntities: 0 };
    }
    mkdirSync(dirname(destination), { recursive: true });
    if (/\.mscene$/i.test(source)) {
      return copyPlayerArtifactWithCache(
        source,
        destination,
        'player-scene-strip-v1',
        copySceneForPlayer,
        cache,
        isCancelled,
      );
    }
    if (/\.prefab$/i.test(source)) {
      return copyPlayerArtifactWithCache(
        source,
        destination,
        'player-prefab-strip-v1',
        copyPrefabForPlayer,
        cache,
        isCancelled,
      );
    }
    copyFileSync(source, destination);
  }
  return { strippedEditorEntities: 0 };
}

function copyPlayerArtifactWithCache(
  source: string,
  destination: string,
  domain: string,
  transform: (source: string, destination: string) => PlayerCopyStats | null,
  cache: BuildArtifactCache,
  isCancelled?: () => boolean,
): PlayerCopyStats {
  assertBuildNotCancelled(isCancelled, 'build cache key');
  const key = cacheKey(domain, sha256(source));
  const restored = cache.restore(key, destination, true, isCancelled);
  if (restored) return restored;
  const transformed = transform(source, destination);
  const stats = transformed ?? { strippedEditorEntities: 0 };
  if (!transformed) copyFileSync(source, destination);
  cache.store(key, existsSync(destination) ? destination : null, stats, isCancelled);
  return stats;
}

function stripEditorMetadata(componentsValue: unknown): boolean {
  const components = jsonObject(componentsValue);
  if (!components) return false;
  let changed = false;
  for (const key of Object.keys(components)) {
    if (!key.startsWith('__')) continue;
    delete components[key];
    changed = true;
  }
  return changed;
}

/** Player scenes retain authored components but never ship editor-only entities or `__*` metadata. */
function copySceneForPlayer(source: string, destination: string): PlayerCopyStats | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    return null;
  }
  const scene = jsonObject(parsed);
  const world = jsonObject(scene?.world);
  if (!scene || !world || !Array.isArray(world.entities)) return null;
  const filtered = filterEditorOnlySceneEntities(world.entities);
  let changed = filtered.stripped > 0;
  world.entities = filtered.entities;
  const selected = entityReferenceKey(world.selected);
  if (selected && filtered.removedIds.has(selected)) {
    world.selected = null;
    changed = true;
  }
  for (const entity of filtered.entities) changed = stripEditorMetadata(entity.components) || changed;
  if (!changed) return null;
  writeFileSync(destination, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return { strippedEditorEntities: filtered.stripped };
}

function stripPrefabNodeForPlayer(nodeValue: unknown, rootNode: boolean): {
  node: JsonObject | null;
  stripped: number;
  changed: boolean;
} {
  const node = jsonObject(nodeValue);
  if (!node) return { node: null, stripped: 0, changed: false };
  if (hasEditorOnlyComponent(node.components)) {
    return { node: null, stripped: countPrefabNodes(node), changed: true };
  }
  let changed = stripEditorMetadata(node.components);
  let stripped = 0;
  if (Array.isArray(node.children)) {
    const children: JsonObject[] = [];
    for (const childValue of node.children) {
      const child = stripPrefabNodeForPlayer(childValue, false);
      stripped += child.stripped;
      changed = changed || child.changed;
      if (child.node) children.push(child.node);
    }
    if (children.length !== node.children.length) changed = true;
    node.children = children;
  }
  return { node, stripped, changed: changed || (!rootNode && stripped > 0) };
}

function countPrefabNodes(nodeValue: unknown): number {
  const node = jsonObject(nodeValue);
  if (!node) return 0;
  return 1 + (Array.isArray(node.children)
    ? node.children.reduce((total, child) => total + countPrefabNodes(child), 0)
    : 0);
}

/** EditorOnly prefab roots are authoring assets and are omitted from Player content. */
function copyPrefabForPlayer(source: string, destination: string): PlayerCopyStats | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    return null;
  }
  const asset = jsonObject(parsed);
  if (!asset) return null;
  const wrapped = Object.hasOwn(asset, 'root');
  const result = stripPrefabNodeForPlayer(wrapped ? asset.root : asset, true);
  if (!result.changed) return null;
  if (!result.node) return { strippedEditorEntities: result.stripped };
  if (wrapped) asset.root = result.node;
  else parsed = result.node;
  writeFileSync(destination, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return { strippedEditorEntities: result.stripped };
}

function collectTypeScriptFiles(
  directory: string,
  output: string[] = [],
  isCancelled?: () => boolean,
): string[] {
  assertBuildNotCancelled(isCancelled, 'script discovery');
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareFileNames(left.name, right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScriptFiles(path, output, isCancelled);
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

function typeScriptProgramCacheKey(
  program: ts.Program,
  projectDir: string,
  startupScript: string,
  options: ts.CompilerOptions,
): string {
  const digest = createHash('sha256');
  const update = (value: string) => {
    digest.update(String(Buffer.byteLength(value, 'utf8'))).update(':').update(value);
  };
  update('mengine-typescript-bundle-v1');
  update(ts.version);
  update(startupScript);
  update(JSON.stringify({ ...options, outFile: '<stage-output>', rootDir: '<script-root>' }));
  const sources = [...program.getSourceFiles()].sort((left, right) => (
    compareFileNames(left.fileName.replaceAll('\\', '/'), right.fileName.replaceAll('\\', '/'))
  ));
  for (const source of sources) {
    const fileName = isPathInside(projectDir, source.fileName)
      ? portablePath(relative(projectDir, source.fileName))
      : source.fileName.replaceAll('\\', '/');
    update(fileName);
    update(source.text);
  }
  return cacheKey('typescript-program-v1', digest.digest('hex'));
}

function compileProjectTypeScript(
  projectDir: string,
  stageDir: string,
  startupScript: string | undefined,
  cache: BuildArtifactCache,
  isCancelled?: () => boolean,
): string | undefined {
  if (!startupScript || !/\.tsx?$/i.test(startupScript)) return startupScript;
  const portable = startupScript.replaceAll('\\', '/');
  const segments = portable.split('/');
  const scriptsIndex = segments.map((segment) => segment.toLowerCase()).lastIndexOf('scripts');
  const sourceRootRelative = scriptsIndex >= 0
    ? segments.slice(0, scriptsIndex + 1).join('/')
    : segments.slice(0, -1).join('/');
  const sourceRoot = resolveProjectPath(projectDir, sourceRootRelative, 'script root');
  const rootNames = collectTypeScriptFiles(sourceRoot, [], isCancelled);
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
  assertBuildNotCancelled(isCancelled, 'TypeScript cache key');
  const key = typeScriptProgramCacheKey(program, projectDir, portable, options);
  const restored = cache.restore(key, outputFile, false, isCancelled);
  if (restored) return portable.replace(/\.tsx?$/i, '.js');
  assertBuildNotCancelled(isCancelled, 'TypeScript compilation');
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(`TypeScript compilation failed:\n${formatTypeScriptDiagnostics(errors)}`);
  }
  const emitted = program.emit();
  assertBuildNotCancelled(isCancelled, 'TypeScript emit');
  if (emitted.emitSkipped) {
    throw new Error(`TypeScript emit failed:\n${formatTypeScriptDiagnostics(emitted.diagnostics)}`);
  }
  cache.store(
    key,
    outputFile,
    { strippedEditorEntities: 0 },
    isCancelled,
  );
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

function collectPackageCandidateFiles(
  directory: string,
  output: Array<{ path: string; size: number }> = [],
  isCancelled?: () => boolean,
): Array<{ path: string; size: number }> {
  assertBuildNotCancelled(isCancelled, 'asset enumeration');
  for (const entry of readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareFileNames(left.name, right.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectPackageCandidateFiles(path, output, isCancelled);
    else if (entry.isFile() && !/\.tsx?$/i.test(entry.name) && !isEditorAssetMetadata(entry.name)) {
      output.push({ path, size: statSync(path).size });
    }
  }
  return output;
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

type RawBuildFileEntry = Pick<BuildFileEntry, 'path' | 'size' | 'sha256'>;

function collectFiles(
  root: string,
  current = root,
  output: RawBuildFileEntry[] = [],
  isCancelled?: () => boolean,
): RawBuildFileEntry[] {
  assertBuildNotCancelled(isCancelled, 'content hashing');
  for (const entry of readdirSync(current, { withFileTypes: true })
    .sort((left, right) => compareFileNames(left.name, right.name))) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      collectFiles(root, absolute, output, isCancelled);
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

function contentCategory(
  path: string,
  executable: string,
  reasons: readonly BuildInclusionReason[],
): BuildContentCategory {
  const lower = path.toLowerCase();
  if (path === executable) return 'runtime';
  if (lower.startsWith('projectsettings/')) return 'settings';
  if (reasons.some((reason) => reason.kind.toLowerCase().includes('spine'))) return 'spine';
  if (lower.endsWith('.mscene')) return 'scene';
  if (/\.(?:js|mjs|cjs|wasm)$/i.test(lower)) return 'script';
  if (/\.(?:mmat|mat|minst)$/i.test(lower)) return 'material';
  if (/\.(?:mshader|wgsl)$/i.test(lower)) return 'shader';
  if (/\.(?:png|jpe?g|webp|gif|bmp|tga|tiff?|hdr|exr)$/i.test(lower)) return 'texture';
  if (/\.(?:gltf|glb)$/i.test(lower)
    || lower.endsWith('.bin')
      && reasons.some((reason) => reason.kind.toLowerCase().startsWith('gltf '))) return 'model';
  if (/\.(?:manim|mcontroller|mavatar)$/i.test(lower)) return 'animation';
  if (lower.endsWith('.mtimeline')) return 'timeline';
  if (/\.(?:wav|ogg|mp3|flac)$/i.test(lower)) return 'audio';
  if (lower.endsWith('.prefab')) return 'prefab';
  if (/\.(?:atlas|skel)$/i.test(lower)) return 'spine';
  if (lower.endsWith('.json')) return 'metadata';
  return 'other';
}

function generatedInclusionReason(
  path: string,
  executable: string,
  project: GameProjectManifest,
): BuildInclusionReason {
  if (path === executable) return { kind: 'player runtime', from: 'MEngine Build SDK' };
  if (path === 'project.json') return { kind: 'project manifest', from: 'project.json' };
  if (path === PLAYER_CONFIG_FILE) return { kind: 'player configuration', from: 'project.json' };
  if (path.startsWith('ProjectSettings/')) return { kind: 'project settings', from: path };
  if (project.startupScript === path) return { kind: 'compiled startup script', from: 'project.json' };
  if (path.startsWith('Assets/') || path.startsWith('Scripts/')) {
    return { kind: 'all assets mode', from: 'project.json' };
  }
  return { kind: 'generated build content', from: 'MEngine CLI' };
}

function describeBuildFiles(
  rawFiles: readonly RawBuildFileEntry[],
  executable: string,
  project: GameProjectManifest,
  dependencyScan: BuildDependencyScan,
): BuildFileEntry[] {
  return rawFiles.map((file) => {
    const key = process.platform === 'win32' ? file.path.toLowerCase() : file.path;
    const includedBy = dependencyScan.inclusionReasons.get(key)
      ?? [generatedInclusionReason(file.path, executable, project)];
    return {
      ...file,
      category: contentCategory(file.path, executable, includedBy),
      includedBy,
    };
  });
}

export function summarizeBuildContent(files: readonly BuildFileEntry[]): BuildContentSummary {
  const grouped = new Map<BuildContentCategory, BuildContentCategorySummary>();
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    const summary = grouped.get(file.category) ?? {
      category: file.category,
      files: 0,
      bytes: 0,
    };
    summary.files += 1;
    summary.bytes += file.size;
    grouped.set(file.category, summary);
  }
  return {
    totalBytes,
    categories: [...grouped.values()].sort((left, right) => (
      right.bytes - left.bytes || compareFileNames(left.category, right.category)
    )),
  };
}

function u64LittleEndian(value: bigint): Buffer {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

/** Deterministic aggregate fingerprint for the complete packaged payload. */
export function buildContentHash(
  files: readonly Pick<BuildFileEntry, 'path' | 'size' | 'sha256'>[],
): string {
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
  const checkCancelled = (stage: string) => assertBuildNotCancelled(options.isCancelled, stage);
  checkCancelled('project validation');
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
  const dependencyScan = scanBuildAssetDependencies(projectDir, project, options.isCancelled);
  const assetValidation = dependencyScan.validation;
  const buildCache = BuildArtifactCache.open(projectDir);
  if (project.assetMode === 'referenced') {
    const included = new Set(dependencyScan.files.map((path) => (
      process.platform === 'win32' ? path.toLowerCase() : path
    )));
    const omitted = roots
      .flatMap((root) => collectPackageCandidateFiles(root, [], options.isCancelled))
      .filter((entry) => !included.has(process.platform === 'win32'
        ? entry.path.toLowerCase()
        : entry.path));
    assetValidation.omittedAssetFiles = omitted.length;
    assetValidation.omittedAssetBytes = omitted.reduce((total, entry) => total + entry.size, 0);
  }

  const stageDir = join(
    dirname(outputDir),
    `.${basename(outputDir)}.mengine-stage-${process.pid}-${randomUUID()}`,
  );
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  try {
    checkCancelled('staging');
    const copyStats: PlayerCopyStats = { strippedEditorEntities: 0 };
    if (project.assetMode === 'all') {
      for (const root of roots) {
        const copied = copyTree(
          root,
          join(stageDir, basename(root)),
          buildCache,
          options.isCancelled,
        );
        copyStats.strippedEditorEntities += copied.strippedEditorEntities;
      }
    } else {
      for (const source of dependencyScan.files) {
        const destination = join(stageDir, relative(projectDir, source));
        const copied = copyTree(source, destination, buildCache, options.isCancelled);
        copyStats.strippedEditorEntities += copied.strippedEditorEntities;
      }
    }
    const projectSettings = join(projectDir, 'ProjectSettings');
    if (existsSync(projectSettings)) {
      if (!statSync(projectSettings).isDirectory()) {
        throw new Error(`ProjectSettings must be a directory: ${projectSettings}`);
      }
      copyTree(
        projectSettings,
        join(stageDir, 'ProjectSettings'),
        buildCache,
        options.isCancelled,
      );
    }
    assetValidation.strippedEditorEntities = copyStats.strippedEditorEntities;
    const packagedStartupScript = compileProjectTypeScript(
      projectDir,
      stageDir,
      project.startupScript,
      buildCache,
      options.isCancelled,
    );
    checkCancelled('player assembly');
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
    packagedProjectJson.assetMode = project.assetMode;
    packagedProjectJson.alwaysInclude = project.alwaysInclude;
    delete packagedProjectJson.asset_mode;
    delete packagedProjectJson.always_include;
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

    const files = describeBuildFiles(
      collectFiles(stageDir, stageDir, [], options.isCancelled),
      executable,
      packagedProject,
      dependencyScan,
    );
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
      contentSummary: summarizeBuildContent(files),
      files,
    };
    writeFileSync(
      join(stageDir, BUILD_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    checkCancelled('staged player validation');
    options.verifyStagedBuild?.(stageDir, manifest);
    checkCancelled('publish');
    publishStagedBuild(stageDir, outputDir);
    try {
      options.onBuildCacheStats?.({ ...buildCache.stats });
    } catch {
      // Diagnostics must never turn a successfully published build into a failure.
    }
    return manifest;
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    throw error;
  }
}
