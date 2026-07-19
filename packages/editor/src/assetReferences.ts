import {
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  resolveProjectAssetPath,
  type ProjectFileAsset,
} from './projectAssets.ts';

export type AssetReference = {
  sourcePath: string;
  location: string;
  reference: string;
  kind: 'exact' | 'subresource' | 'text';
  snippet: string;
};

export type AssetReferenceSource = Pick<ProjectFileAsset, 'relPath' | 'kind'> & {
  text: string;
};

export type AssetReferenceReport = {
  targetPath: string;
  references: AssetReference[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
};

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

const MAX_REFERENCE_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_REFERENCE_RESULTS = 10_000;

function portable(value: string): string {
  return value.trim().replace(/\\/g, '/');
}

function referenceKind(value: string, target: string): 'exact' | 'subresource' | null {
  const normalized = portable(value).toLocaleLowerCase();
  const expected = portable(target).toLocaleLowerCase();
  if (normalized === expected) return 'exact';
  if (!expected.includes('#') && normalized.startsWith(`${expected}#`)) return 'subresource';
  return null;
}

function resolvedReferenceKind(
  value: string,
  target: string,
  sourcePath: string,
): 'exact' | 'subresource' | null {
  const direct = referenceKind(value, target);
  if (direct) return direct;
  if (/^(?:data:|https?:|file:)/i.test(value.trim())) return null;
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  try {
    return referenceKind(resolveProjectAssetPath(sourcePath, decoded), target);
  } catch {
    return null;
  }
}

function pointerSegment(value: string | number): string {
  return String(value).replace(/~/g, '~0').replace(/\//g, '~1');
}

function scanJsonValue(
  value: unknown,
  target: string,
  sourcePath: string,
  pointer: string,
  output: AssetReference[],
): void {
  if (output.length >= MAX_REFERENCE_RESULTS) return;
  if (typeof value === 'string') {
    const kind = referenceKind(value, target);
    if (kind) {
      output.push({
        sourcePath,
        location: pointer || '/',
        reference: value,
        kind,
        snippet: value,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanJsonValue(entry, target, sourcePath, `${pointer}/${index}`, output);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    scanJsonValue(entry, target, sourcePath, `${pointer}/${pointerSegment(key)}`, output);
  }
}

function isPathCharacter(value: string | undefined): boolean {
  return value != null && /[\p{L}\p{N}_./\\-]/u.test(value);
}

function scanText(
  text: string,
  target: string,
  sourcePath: string,
  output: AssetReference[],
): void {
  const expected = portable(target);
  const lowerExpected = expected.toLocaleLowerCase();
  text.split(/\r?\n/).forEach((line, lineIndex) => {
    if (output.length >= MAX_REFERENCE_RESULTS) return;
    const normalizedLine = line.replace(/\\/g, '/');
    const lowerLine = normalizedLine.toLocaleLowerCase();
    let cursor = 0;
    while (cursor < lowerLine.length && output.length < MAX_REFERENCE_RESULTS) {
      const column = lowerLine.indexOf(lowerExpected, cursor);
      if (column < 0) break;
      cursor = column + Math.max(1, lowerExpected.length);
      if (isPathCharacter(normalizedLine[column - 1])) continue;
      const after = normalizedLine[column + expected.length];
      if (isPathCharacter(after)) continue;
      let end = column + expected.length;
      if (!expected.includes('#') && normalizedLine[end] === '#') {
        end += 1;
        while (end < normalizedLine.length && !/[\s'"`,;()[\]{}]/.test(normalizedLine[end])) end += 1;
      }
      const reference = normalizedLine.slice(column, end);
      output.push({
        sourcePath,
        location: `${lineIndex + 1}:${column + 1}`,
        reference,
        kind: 'text',
        snippet: line.trim().slice(0, 240),
      });
    }
  });
}

function scanGltfUris(
  value: unknown,
  target: string,
  sourcePath: string,
  output: AssetReference[],
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const root = value as Record<string, unknown>;
  for (const group of ['buffers', 'images'] as const) {
    const entries = root[group];
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const uri = (entry as Record<string, unknown>).uri;
      if (typeof uri !== 'string') return;
      if (referenceKind(uri, target)) return; // generic JSON traversal already recorded it
      const kind = resolvedReferenceKind(uri, target, sourcePath);
      if (!kind || output.length >= MAX_REFERENCE_RESULTS) return;
      output.push({
        sourcePath,
        location: `/${group}/${index}/uri`,
        reference: uri,
        kind,
        snippet: uri,
      });
    });
  }
}

function scanSpineAtlasPages(
  text: string,
  target: string,
  sourcePath: string,
  output: AssetReference[],
): void {
  let expectsPage = true;
  text.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line) {
      expectsPage = true;
      return;
    }
    if (!expectsPage || output.length >= MAX_REFERENCE_RESULTS) return;
    expectsPage = false;
    const kind = resolvedReferenceKind(line, target, sourcePath);
    if (!kind) return;
    output.push({
      sourcePath,
      location: `${lineIndex + 1}:${rawLine.indexOf(line) + 1}`,
      reference: line,
      kind,
      snippet: line,
    });
  });
}

export function scanAssetReferences(
  targetPath: string,
  sources: readonly AssetReferenceSource[],
): AssetReference[] {
  const target = portable(targetPath);
  const output: AssetReference[] = [];
  for (const source of sources) {
    if (output.length >= MAX_REFERENCE_RESULTS) break;
    if (source.kind === 'spine-atlas') {
      scanSpineAtlasPages(source.text, target, source.relPath, output);
      continue;
    }
    if (JSON_KINDS.has(source.kind)) {
      try {
        const parsed = JSON.parse(source.text);
        scanJsonValue(parsed, target, source.relPath, '', output);
        if (source.kind === 'model') {
          scanGltfUris(parsed, target, source.relPath, output);
        }
        continue;
      } catch {
        // Broken JSON is still searched as text so repair tooling can reveal
        // a dependency instead of hiding the complete source file.
      }
    }
    scanText(source.text, target, source.relPath, output);
  }
  return output.sort((left, right) => (
    left.sourcePath.localeCompare(right.sourcePath)
    || left.location.localeCompare(right.location, undefined, { numeric: true })
    || left.reference.localeCompare(right.reference)
  ));
}

export async function findProjectAssetReferences(targetPath: string): Promise<AssetReferenceReport> {
  const target = normalizeProjectAssetPath(targetPath);
  const files = await refreshProjectFiles();
  const candidates = files.filter((asset) => (
    TEXT_KINDS.has(asset.kind)
    && asset.size <= MAX_REFERENCE_SOURCE_BYTES
    && (asset.kind !== 'model' || asset.relPath.toLocaleLowerCase().endsWith('.gltf'))
  ));
  const sources: AssetReferenceSource[] = [];
  let skippedFiles = files.length - candidates.length;
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = candidates.slice(offset, offset + 8);
    const loaded = await Promise.all(batch.map(async (asset) => {
      try {
        return { relPath: asset.relPath, kind: asset.kind, text: await readProjectAssetText(asset.relPath) };
      } catch {
        return null;
      }
    }));
    for (const source of loaded) {
      if (source) sources.push(source);
      else skippedFiles += 1;
    }
  }
  const references = scanAssetReferences(target, sources);
  return {
    targetPath: target,
    references,
    scannedFiles: sources.length,
    skippedFiles,
    truncated: references.length >= MAX_REFERENCE_RESULTS,
  };
}
