import { invoke } from '@tauri-apps/api/core';
import { scanAssetReferences, type AssetReference, type AssetReferenceSource } from './assetReferences.ts';
import {
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  resetProjectAssetWatchBaseline,
  resolveProjectAssetPath,
  type ProjectFileAsset,
} from './projectAssets.ts';
import { isDesktopEditor } from './transport/editorTransport.ts';

const JSON_KINDS = new Set<ProjectFileAsset['kind']>([
  'animation',
  'animator-controller',
  'avatar-mask',
  'timeline',
  'material',
  'prefab',
  'sprite-atlas',
  'scene',
  'sprite-import',
  'spine-json',
  'model',
]);

const TEXT_KINDS = new Set<ProjectFileAsset['kind']>([
  ...JSON_KINDS,
  'shader',
  'script',
  'spine-atlas',
]);

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_UPDATE_FILES = 256;
const MAX_UPDATE_BYTES = 32 * 1024 * 1024;

export type AssetRenameUpdate = {
  sourcePath: string;
  expectedRevision: string;
  contents: string;
};

export type AssetRenamePlan = {
  sourcePath: string;
  destinationPath: string;
  sourceRevision: string;
  sourceGuid: string;
  automaticUpdates: AssetRenameUpdate[];
  manualReferences: AssetReference[];
  scannedFiles: number;
  skippedFiles: number;
  updateBytes: number;
};

export type AssetRenameResult = {
  sourcePath: string;
  destinationPath: string;
  updatedPaths: string[];
};

export type AssetDuplicatePlan = {
  sourcePath: string;
  destinationPath: string;
  sourceRevision: string;
  sourceGuid: string;
  contents: string | null;
  manualReferences: AssetReference[];
  copiedBytes: number;
};

export type AssetDuplicateResult = {
  sourcePath: string;
  destinationPath: string;
  guid: string;
};

type RenameSource = AssetReferenceSource & { revision: string };

function portable(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function samePath(left: string, right: string): boolean {
  return portable(left).toLocaleLowerCase() === portable(right).toLocaleLowerCase();
}

function splitReference(value: string): { path: string; fragment: string } {
  const marker = value.indexOf('#');
  return marker < 0
    ? { path: value, fragment: '' }
    : { path: value.slice(0, marker), fragment: value.slice(marker) };
}

function rewriteDirectReference(value: string, sourcePath: string, destinationPath: string): string {
  const { path, fragment } = splitReference(portable(value));
  return samePath(path, sourcePath) ? `${destinationPath}${fragment}` : value;
}

function relativeAssetPath(fromAsset: string, toAsset: string): string {
  const from = normalizeProjectAssetPath(fromAsset).split('/');
  const to = normalizeProjectAssetPath(toAsset).split('/');
  from.pop();
  let shared = 0;
  while (
    shared < from.length
    && shared < to.length
    && from[shared].toLocaleLowerCase() === to[shared].toLocaleLowerCase()
  ) shared += 1;
  return [...Array(from.length - shared).fill('..'), ...to.slice(shared)].join('/') || './';
}

function encodeRelativeUri(value: string): string {
  return value.split('/').map((segment) => (
    segment === '..' || segment === '.' ? segment : encodeURIComponent(segment)
  )).join('/');
}

function decodeRelativeUri(value: string): string | null {
  if (/^(?:data:|https?:|file:)/i.test(value.trim())) return null;
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return null;
  }
}

type JsonStringToken = {
  start: number;
  end: number;
  value: string;
  isKey: boolean;
};

function jsonStringTokens(text: string): JsonStringToken[] {
  const tokens: JsonStringToken[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '"') continue;
    let end = start + 1;
    while (end < text.length) {
      if (text[end] === '\\') {
        end += 2;
        continue;
      }
      if (text[end] === '"') break;
      end += 1;
    }
    if (end >= text.length) break;
    const raw = text.slice(start, end + 1);
    let value: string;
    try {
      value = JSON.parse(raw) as string;
    } catch {
      start = end;
      continue;
    }
    let next = end + 1;
    while (/\s/.test(text[next] ?? '')) next += 1;
    tokens.push({ start, end: end + 1, value, isKey: text[next] === ':' });
    start = end;
  }
  return tokens;
}

function rewriteJsonText(
  text: string,
  transform: (value: string, key: string | null) => string,
): string {
  JSON.parse(text);
  const tokens = jsonStringTokens(text);
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let lastKey: JsonStringToken | null = null;
  for (const token of tokens) {
    if (token.isKey) {
      lastKey = token;
      continue;
    }
    const between = lastKey ? text.slice(lastKey.end, token.start) : '';
    const key = lastKey && /^\s*:\s*$/.test(between) ? lastKey.value : null;
    const replacement = transform(token.value, key);
    if (replacement !== token.value) {
      edits.push({ start: token.start, end: token.end, replacement: JSON.stringify(replacement) });
    }
    lastKey = null;
  }
  let output = text;
  for (const edit of edits.reverse()) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return output;
}

function rewriteJsonSource(
  source: RenameSource,
  sourcePath: string,
  destinationPath: string,
): string {
  const sourceAfterRename = samePath(source.relPath, sourcePath)
    ? destinationPath
    : source.relPath;
  return rewriteJsonText(source.text, (value, key) => {
    const direct = rewriteDirectReference(value, sourcePath, destinationPath);
    if (direct !== value) return direct;
    if (source.kind !== 'model' || key !== 'uri' || /^assets[\\/]/i.test(value)) return value;
    const decoded = decodeRelativeUri(value);
    if (!decoded) return value;
    let resolved: string;
    try {
      resolved = resolveProjectAssetPath(source.relPath, decoded);
    } catch {
      return value;
    }
    const targetAfterRename = samePath(resolved, sourcePath) ? destinationPath : resolved;
    if (sourceAfterRename === source.relPath && targetAfterRename === resolved) return value;
    return encodeRelativeUri(relativeAssetPath(sourceAfterRename, targetAfterRename));
  });
}

function rewriteSpineAtlasSource(
  source: RenameSource,
  sourcePath: string,
  destinationPath: string,
): string {
  const sourceAfterRename = samePath(source.relPath, sourcePath)
    ? destinationPath
    : source.relPath;
  let expectsPage = true;
  const chunks = source.text.split(/(\r?\n)/);
  for (let index = 0; index < chunks.length; index += 2) {
    const rawLine = chunks[index];
    const page = rawLine.trim();
    if (!page) {
      expectsPage = true;
      continue;
    }
    if (!expectsPage) continue;
    expectsPage = false;
    const direct = rewriteDirectReference(page, sourcePath, destinationPath);
    if (direct !== page) {
      chunks[index] = rawLine.replace(page, direct);
      continue;
    }
    if (/^assets[\\/]/i.test(page)) continue;
    let resolved: string;
    try {
      resolved = resolveProjectAssetPath(source.relPath, page);
    } catch {
      continue;
    }
    const targetAfterRename = samePath(resolved, sourcePath) ? destinationPath : resolved;
    if (sourceAfterRename === source.relPath && targetAfterRename === resolved) continue;
    chunks[index] = rawLine.replace(page, relativeAssetPath(sourceAfterRename, targetAfterRename));
  }
  return chunks.join('');
}

function resolveScriptModule(
  sourcePath: string,
  specifier: string,
  scriptPaths: ReadonlyMap<string, string>,
): string | null {
  if (!specifier.startsWith('.')) return null;
  let base: string;
  try {
    base = resolveProjectAssetPath(sourcePath, specifier);
  } catch {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  for (const candidate of candidates) {
    const match = scriptPaths.get(candidate.toLocaleLowerCase());
    if (match) return match;
  }
  return null;
}

function scanScriptModuleReferences(
  source: RenameSource,
  renamedSourcePath: string,
  destinationPath: string,
  scriptPaths: ReadonlyMap<string, string>,
): AssetReference[] {
  const output: AssetReference[] = [];
  const sourceDirectory = normalizeProjectAssetPath(source.relPath).split('/').slice(0, -1).join('/');
  const destinationDirectory = destinationPath.split('/').slice(0, -1).join('/');
  const sourceMoves = samePath(source.relPath, renamedSourcePath)
    && !samePath(sourceDirectory, destinationDirectory);
  const pattern = /\b(?:import\s*(?:[^'"\r\n]*?\sfrom\s*)?|export\s+[^'"\r\n]*?\sfrom\s*|require\s*\(|import\s*\()\s*(['"])([^'"\r\n]+)\1/g;
  source.text.split(/\r?\n/).forEach((line, lineIndex) => {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
      const specifier = match[2];
      const resolved = resolveScriptModule(source.relPath, specifier, scriptPaths);
      if (!resolved || (!samePath(resolved, renamedSourcePath) && !sourceMoves)) continue;
      output.push({
        sourcePath: source.relPath,
        location: `${lineIndex + 1}:${match.index + match[0].indexOf(specifier) + 1}`,
        reference: specifier,
        kind: 'text',
        snippet: line.trim().slice(0, 240),
      });
    }
  });
  return output;
}

export function buildAssetRenamePlan(
  sourcePathRaw: string,
  destinationPathRaw: string,
  sourceAsset: Pick<ProjectFileAsset, 'relPath' | 'revision' | 'guid' | 'metaStatus'>,
  sources: readonly RenameSource[],
  skippedFiles = 0,
): AssetRenamePlan {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  const destinationPath = normalizeProjectAssetPath(destinationPathRaw);
  if (sourcePath.includes('#') || destinationPath.includes('#')) {
    throw new Error('subresources cannot be renamed independently');
  }
  if (!samePath(sourceAsset.relPath, sourcePath)) throw new Error('source asset is stale');
  if (sourceAsset.metaStatus !== 'ready' || !sourceAsset.guid) {
    throw new Error('asset metadata must be healthy before rename');
  }
  const sourceExtension = sourcePath.slice(sourcePath.lastIndexOf('.')).toLocaleLowerCase();
  const destinationExtension = destinationPath.slice(destinationPath.lastIndexOf('.')).toLocaleLowerCase();
  if (!sourceExtension || sourceExtension !== destinationExtension) {
    throw new Error('asset rename must preserve the file extension');
  }
  const automaticUpdates: AssetRenameUpdate[] = [];
  const manualReferences: AssetReference[] = [];
  const scriptPaths = new Map(
    sources
      .filter((source) => source.kind === 'script')
      .map((source) => [source.relPath.toLocaleLowerCase(), source.relPath]),
  );
  for (const source of sources) {
    if (source.kind === 'script') {
      manualReferences.push(...scanScriptModuleReferences(
        source,
        sourcePath,
        destinationPath,
        scriptPaths,
      ));
      manualReferences.push(...scanAssetReferences(sourcePath, [source]));
      continue;
    }
    if (source.kind === 'spine-atlas') {
      const contents = rewriteSpineAtlasSource(source, sourcePath, destinationPath);
      if (contents !== source.text) {
        automaticUpdates.push({ sourcePath: source.relPath, expectedRevision: source.revision, contents });
      }
      continue;
    }
    if (JSON_KINDS.has(source.kind)) {
      try {
        const contents = rewriteJsonSource(source, sourcePath, destinationPath);
        if (contents !== source.text) {
          automaticUpdates.push({ sourcePath: source.relPath, expectedRevision: source.revision, contents });
        }
        continue;
      } catch {
        // Invalid JSON cannot be rewritten safely. It remains a manual result.
      }
    }
    manualReferences.push(...scanAssetReferences(sourcePath, [source]));
  }
  const updateBytes = automaticUpdates.reduce(
    (total, update) => total + new TextEncoder().encode(update.contents).byteLength,
    0,
  );
  if (automaticUpdates.length > MAX_UPDATE_FILES) {
    throw new Error(`rename affects more than ${MAX_UPDATE_FILES} files`);
  }
  if (updateBytes > MAX_UPDATE_BYTES) {
    throw new Error('rename updates exceed the 32 MiB transaction limit');
  }
  manualReferences.sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.location.localeCompare(right.location, undefined, { numeric: true })
  ));
  for (let index = manualReferences.length - 1; index > 0; index -= 1) {
    const current = manualReferences[index];
    const previous = manualReferences[index - 1];
    if (
      current.sourcePath === previous.sourcePath
      && current.location === previous.location
      && current.reference === previous.reference
    ) manualReferences.splice(index, 1);
  }
  return {
    sourcePath,
    destinationPath,
    sourceRevision: sourceAsset.revision,
    sourceGuid: sourceAsset.guid,
    automaticUpdates,
    manualReferences,
    scannedFiles: sources.length,
    skippedFiles,
    updateBytes,
  };
}

export async function prepareProjectAssetRename(
  sourcePathRaw: string,
  destinationPathRaw: string,
): Promise<AssetRenamePlan> {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  const destinationPath = normalizeProjectAssetPath(destinationPathRaw);
  const files = await refreshProjectFiles();
  const sourceAsset = files.find((asset) => samePath(asset.relPath, sourcePath));
  if (!sourceAsset) throw new Error(`asset not found: ${sourcePath}`);
  if (sourceAsset.kind === 'scene') throw new Error('scenes use the scene-aware rename command');
  if (sourceAsset.kind === 'sprite-import') throw new Error('sprite import metadata moves with its texture');
  if (files.some((asset) => !samePath(asset.relPath, sourcePath) && samePath(asset.relPath, destinationPath))) {
    throw new Error(`destination asset already exists: ${destinationPath}`);
  }
  const candidates = files.filter((asset) => (
    TEXT_KINDS.has(asset.kind)
    && asset.size <= MAX_SOURCE_BYTES
    && (asset.kind !== 'model' || asset.relPath.toLocaleLowerCase().endsWith('.gltf'))
  ));
  const sources: RenameSource[] = [];
  let skippedFiles = files.length - candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const loaded = await Promise.all(candidates.slice(offset, offset + 8).map(async (asset) => {
      try {
        return {
          relPath: asset.relPath,
          kind: asset.kind,
          revision: asset.revision,
          text: await readProjectAssetText(asset.relPath),
        };
      } catch {
        return null;
      }
    }));
    for (const source of loaded) {
      if (source) sources.push(source);
      else skippedFiles += 1;
    }
  }
  return buildAssetRenamePlan(sourcePath, destinationPath, sourceAsset, sources, skippedFiles);
}

export async function applyProjectAssetRename(plan: AssetRenamePlan): Promise<AssetRenameResult> {
  const payload = {
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    expectedSourceRevision: plan.sourceRevision,
    expectedGuid: plan.sourceGuid,
    updates: plan.automaticUpdates,
  };
  let result: AssetRenameResult;
  if (isDesktopEditor()) {
    result = await invoke<AssetRenameResult>('rename_project_asset', { request: payload });
  } else {
    const response = await fetch('/__mengine/assets/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `${response.status} ${response.statusText}`);
    }
    result = await response.json() as AssetRenameResult;
  }
  await resetProjectAssetWatchBaseline();
  return result;
}

export function buildAssetDuplicatePlan(
  sourcePathRaw: string,
  destinationPathRaw: string,
  sourceAsset: Pick<ProjectFileAsset, 'relPath' | 'revision' | 'guid' | 'metaStatus' | 'size' | 'kind'>,
  sources: readonly RenameSource[],
): AssetDuplicatePlan {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  const destinationPath = normalizeProjectAssetPath(destinationPathRaw);
  if (sourceAsset.metaStatus !== 'ready' || !sourceAsset.guid) {
    throw new Error('asset metadata must be healthy before duplication');
  }
  if (!samePath(sourceAsset.relPath, sourcePath)) throw new Error('source asset is stale');
  if (samePath(sourcePath, destinationPath)) throw new Error('duplicate destination must be different');
  const sourceDot = sourcePath.lastIndexOf('.');
  const destinationDot = destinationPath.lastIndexOf('.');
  if (
    sourceDot < 0
    || destinationDot < 0
    || sourcePath.slice(sourceDot).toLocaleLowerCase()
      !== destinationPath.slice(destinationDot).toLocaleLowerCase()
  ) throw new Error('asset duplication must preserve the file extension');

  const source = sources.find((candidate) => samePath(candidate.relPath, sourcePath));
  let contents: string | null = null;
  const manualReferences: AssetReference[] = [];
  if (source?.kind === 'spine-atlas') {
    const rewritten = rewriteSpineAtlasSource(source, sourcePath, destinationPath);
    if (rewritten !== source.text) contents = rewritten;
  } else if (
    source
    && JSON_KINDS.has(source.kind)
    && (source.kind !== 'model' || sourcePath.toLocaleLowerCase().endsWith('.gltf'))
  ) {
    try {
      const rewritten = rewriteJsonSource(source, sourcePath, destinationPath);
      if (rewritten !== source.text) contents = rewritten;
    } catch {
      throw new Error(`cannot safely duplicate invalid JSON asset: ${sourcePath}`);
    }
  } else if (source?.kind === 'script') {
    const scriptPaths = new Map(
      sources
        .filter((candidate) => candidate.kind === 'script')
        .map((candidate) => [candidate.relPath.toLocaleLowerCase(), candidate.relPath]),
    );
    manualReferences.push(...scanScriptModuleReferences(
      source,
      sourcePath,
      destinationPath,
      scriptPaths,
    ).filter((reference) => samePath(reference.sourcePath, sourcePath)));
  }
  return {
    sourcePath,
    destinationPath,
    sourceRevision: sourceAsset.revision,
    sourceGuid: sourceAsset.guid,
    contents,
    manualReferences,
    copiedBytes: contents == null
      ? sourceAsset.size
      : new TextEncoder().encode(contents).byteLength,
  };
}

export async function prepareProjectAssetDuplicate(
  sourcePathRaw: string,
  destinationPathRaw: string,
): Promise<AssetDuplicatePlan> {
  const sourcePath = normalizeProjectAssetPath(sourcePathRaw);
  const destinationPath = normalizeProjectAssetPath(destinationPathRaw);
  const files = await refreshProjectFiles();
  const sourceAsset = files.find((asset) => samePath(asset.relPath, sourcePath));
  if (!sourceAsset) throw new Error(`asset not found: ${sourcePath}`);
  if (sourceAsset.kind === 'scene') throw new Error('scenes use Save As instead of generic duplication');
  if (sourceAsset.kind === 'sprite-import') throw new Error('sprite import metadata duplicates with its texture');
  if (files.some((asset) => samePath(asset.relPath, destinationPath))) {
    throw new Error(`destination asset already exists: ${destinationPath}`);
  }
  const candidates = files.filter((asset) => (
    asset.kind === 'script'
    || samePath(asset.relPath, sourcePath)
  )).filter((asset) => (
    TEXT_KINDS.has(asset.kind)
    && asset.size <= MAX_SOURCE_BYTES
    && (asset.kind !== 'model' || asset.relPath.toLocaleLowerCase().endsWith('.gltf'))
  ));
  const sources: RenameSource[] = [];
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const loaded = await Promise.all(candidates.slice(offset, offset + 8).map(async (asset) => ({
      relPath: asset.relPath,
      kind: asset.kind,
      revision: asset.revision,
      text: await readProjectAssetText(asset.relPath),
    })));
    sources.push(...loaded);
  }
  if (TEXT_KINDS.has(sourceAsset.kind) && sourceAsset.size > MAX_SOURCE_BYTES) {
    throw new Error('text asset exceeds the 8 MiB safe duplication preview limit');
  }
  return buildAssetDuplicatePlan(sourcePath, destinationPath, sourceAsset, sources);
}

export async function applyProjectAssetDuplicate(
  plan: AssetDuplicatePlan,
): Promise<AssetDuplicateResult> {
  const payload = {
    sourcePath: plan.sourcePath,
    destinationPath: plan.destinationPath,
    expectedSourceRevision: plan.sourceRevision,
    expectedGuid: plan.sourceGuid,
    contents: plan.contents,
  };
  let result: AssetDuplicateResult;
  if (isDesktopEditor()) {
    result = await invoke<AssetDuplicateResult>('duplicate_project_asset', { request: payload });
  } else {
    const response = await fetch('/__mengine/assets/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `${response.status} ${response.statusText}`);
    }
    result = await response.json() as AssetDuplicateResult;
  }
  await resetProjectAssetWatchBaseline();
  return result;
}
