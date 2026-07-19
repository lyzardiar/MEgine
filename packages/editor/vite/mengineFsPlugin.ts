import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Connect, Plugin, ViteDevServer } from 'vite';

const API = '/__mengine';
const SCENE_EXT = '.mscene';

type SceneMeta = { name: string; updatedAt: number };
type ScriptAsset = {
  id: string;
  name: string;
  folder: string;
  absPath: string;
};

/** Editor prefs in project/.editor/state.json (survives reopen without scene save). */
type EditorStateFile = {
  activeScene?: string | null;
  gameResolution?: { width: number; height: number } | null;
  gameAspect?: string;
  gameOrientation?: string;
};

function safeSceneName(raw: string): string | null {
  const name = decodeURIComponent(raw).replace(/\.mscene$/i, '').trim();
  if (!name || name.includes('..') || /[\\/:*?"<>|]/.test(name)) return null;
  return name;
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readBodyBytes(req: Connect.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    req.on('data', (chunk) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += value.length;
      if (length > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(value);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: Connect.ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function sendText(res: Connect.ServerResponse, status: number, text: string, type = 'application/json') {
  res.statusCode = status;
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.end(text);
}

function isUnder(root: string, abs: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function openInIde(absPath: string): Promise<{ ok: boolean; via?: string; error?: string }> {
  const target = `${absPath}:1`;
  const cmds = ['cursor', 'code'];

  const tryCmd = (cmd: string) =>
    new Promise<boolean>((resolve) => {
      const child = spawn(cmd, ['-g', target], {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      child.on('error', () => done(false));
      child.on('spawn', () => {
        child.unref();
        done(true);
      });
      // Windows shell often won't emit spawn clearly — treat no immediate error as ok
      setTimeout(() => done(true), 120);
    });

  return (async () => {
    for (const cmd of cmds) {
      if (await tryCmd(cmd)) return { ok: true, via: cmd };
    }
    return { ok: false, error: 'cursor/code CLI not found' };
  })();
}

export type MengineFsOptions = {
  projectRoot: string;
  /** packages/editor — behaviours live under src/behaviours */
  editorRoot: string;
};

/** Dev-only disk bridge: scenes + open script in IDE */
export function mengineFsPlugin(opts: MengineFsOptions | string): Plugin {
  const projectRoot = typeof opts === 'string' ? opts : opts.projectRoot;
  const editorRoot =
    typeof opts === 'string' ? path.resolve(projectRoot, '..') : opts.editorRoot;

  const scenesDir = path.join(projectRoot, 'Assets', 'Scenes');
  const userScriptsDir = path.join(projectRoot, 'Assets', 'Scripts');
  const assetsRoot = path.join(projectRoot, 'Assets');
  const behavioursDir = path.join(editorRoot, 'src', 'behaviours');
  const statePath = path.join(projectRoot, '.editor', 'state.json');
  const manifestPath = path.join(projectRoot, 'project.json');
  const sortingLayersRequestedPath = path.join(projectRoot, 'ProjectSettings', 'sorting-layers.json');

  const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;

  function ensureDirs() {
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(userScriptsDir, { recursive: true });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  }

  type TextureAsset = {
    id: string;
    name: string;
    folder: string;
    relPath: string;
    textureId?: string;
    sliceName?: string;
    rect?: [number, number, number, number];
    pivot?: [number, number];
    pixelsPerUnit?: number;
  };
  type ProjectFileAsset = TextureAsset & {
    kind: 'animation' | 'animator-controller' | 'avatar-mask' | 'timeline' | 'audio' | 'material' | 'shader' | 'model' | 'prefab' | 'sprite-atlas' | 'texture' | 'spine-json' | 'spine-binary' | 'spine-atlas' | 'scene' | 'script' | 'sprite-import';
    revision: string;
    size: number;
    guid: string | null;
    metaStatus: 'ready' | 'auxiliary' | 'invalid' | 'duplicate';
    metaError: string | null;
  };

  function assetFileRevision(stat: fs.Stats): string {
    return `${Math.round(stat.mtimeMs * 1_000).toString(16)}-${stat.size.toString(16)}`;
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function createAssetMetadata(metadataPath: string, contents: string): void {
    const temporary = path.join(
      path.dirname(metadataPath),
      `.${path.basename(metadataPath)}.${randomUUID()}.tmp`,
    );
    try {
      const descriptor = fs.openSync(temporary, 'wx');
      try {
        fs.writeFileSync(descriptor, contents, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.linkSync(temporary, metadataPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  function assetMetadata(asset: string, kind: ProjectFileAsset['kind']): {
    guid: string | null;
    metaStatus: ProjectFileAsset['metaStatus'];
    metaError: string | null;
  } {
    if (kind === 'sprite-import') {
      return { guid: null, metaStatus: 'auxiliary', metaError: null };
    }
    const metadataPath = `${asset}.meta`;
    if (!fs.existsSync(metadataPath)) {
      const guid = randomUUID().toLowerCase();
      const contents = `${JSON.stringify({ schemaVersion: 1, guid, importer: kind }, null, 2)}\n`;
      try {
        createAssetMetadata(metadataPath, contents);
        return { guid, metaStatus: 'ready', metaError: null };
      } catch (error) {
        if (!fs.existsSync(metadataPath)) {
          return {
            guid: null,
            metaStatus: 'invalid',
            metaError: `cannot create ${path.basename(metadataPath)}: ${String(error)}`,
          };
        }
      }
    }
    try {
      const metadata = fs.lstatSync(metadataPath);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error('metadata must be a regular non-symlink file');
      }
      if (metadata.size > 1024 * 1024) throw new Error('metadata exceeds 1 MiB');
      const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('metadata root must be an object');
      }
      const mengine = parsed.mengine && typeof parsed.mengine === 'object' && !Array.isArray(parsed.mengine)
        ? parsed.mengine as Record<string, unknown>
        : null;
      const rawGuid = parsed.guid ?? parsed.uuid ?? mengine?.guid;
      if (
        typeof rawGuid !== 'string'
        || !UUID_PATTERN.test(rawGuid)
        || rawGuid === '00000000-0000-0000-0000-000000000000'
      ) {
        throw new Error('metadata does not contain a valid guid or uuid');
      }
      if (
        parsed.schemaVersion != null
        && (!Number.isSafeInteger(parsed.schemaVersion) || Number(parsed.schemaVersion) !== 1)
      ) {
        throw new Error(`unsupported metadata schema version ${String(parsed.schemaVersion)}`);
      }
      return { guid: rawGuid.toLowerCase(), metaStatus: 'ready', metaError: null };
    } catch (error) {
      return {
        guid: null,
        metaStatus: 'invalid',
        metaError: `${path.basename(metadataPath)}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  function listTextures(): { sprites: TextureAsset[]; folders: string[] } {
    ensureDirs();
    const sprites: TextureAsset[] = [];
    const folderSet = new Set<string>(['Assets', 'Assets/Scenes', 'Assets/Scripts', 'Assets/Prefabs', 'Assets/Materials', 'Assets/Shaders', 'Assets/Models', 'Assets/Sprites']);

    const walk = (dir: string, folder: string) => {
      if (!fs.existsSync(dir)) return;
      folderSet.add(folder);
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('.') || f.endsWith('.meta')) continue;
        const abs = path.join(dir, f);
        let st: fs.Stats;
        try {
          st = fs.statSync(abs);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          walk(abs, `${folder}/${f}`);
        } else if (st.isFile() && IMG_EXT.test(f)) {
          const rel = path.relative(assetsRoot, abs).replace(/\\/g, '/');
          const relPath = `Assets/${rel}`;
          const baseAsset: TextureAsset = {
            id: relPath,
            name: f,
            folder,
            relPath,
            textureId: relPath,
            pivot: [0.5, 0.5],
            pixelsPerUnit: 100,
          };
          sprites.push(baseAsset);
          const importPath = `${abs}.sprite.json`;
          if (!fs.existsSync(importPath)) continue;
          try {
            const settings = JSON.parse(fs.readFileSync(importPath, 'utf8')) as {
              version?: unknown;
              mode?: unknown;
              pixels_per_unit?: unknown;
              slices?: unknown;
            };
            if (Number(settings.version ?? 1) !== 1 || settings.mode !== 'multiple' || !Array.isArray(settings.slices)) continue;
            const pixelsPerUnit = Number(settings.pixels_per_unit ?? 100);
            baseAsset.pixelsPerUnit = Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0
              ? Math.max(0.01, Math.min(100_000, pixelsPerUnit))
              : 100;
            const seen = new Set<string>();
            for (const candidate of settings.slices.slice(0, 4096)) {
              if (!candidate || typeof candidate !== 'object') continue;
              const slice = candidate as { name?: unknown; rect?: unknown; pivot?: unknown };
              const sliceName = String(slice.name ?? '').trim();
              const nameKey = sliceName.toLocaleLowerCase();
              if (!sliceName || sliceName.includes('#') || seen.has(nameKey)) continue;
              if (!Array.isArray(slice.rect) || slice.rect.length < 4) continue;
              const rect = slice.rect.slice(0, 4).map(Number) as [number, number, number, number];
              if (rect.some((value) => !Number.isInteger(value)) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0) continue;
              const rawPivot = Array.isArray(slice.pivot) ? slice.pivot : [0.5, 0.5];
              const pivot: [number, number] = [0, 1].map((axis) => {
                const value = Number(rawPivot[axis]);
                return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
              }) as [number, number];
              seen.add(nameKey);
              sprites.push({
                id: `${relPath}#${sliceName}`,
                name: `${sliceName} (${f})`,
                folder,
                relPath,
                textureId: relPath,
                sliceName,
                rect,
                pivot,
                pixelsPerUnit: Number.isFinite(pixelsPerUnit) && pixelsPerUnit > 0 ? pixelsPerUnit : 100,
              });
            }
          } catch {
            // Invalid import metadata remains visible through the base texture and Sprite Editor.
          }
        }
      }
    };

    walk(assetsRoot, 'Assets');
    sprites.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const folders = [...folderSet].sort((a, b) => a.localeCompare(b));
    return { sprites, folders };
  }

  function resolveSortingLayersPath(createParent: boolean): string | null {
    const root = fs.realpathSync(projectRoot);
    const requestedDirectory = path.dirname(sortingLayersRequestedPath);
    if (!fs.existsSync(requestedDirectory)) {
      if (!createParent) return null;
      fs.mkdirSync(requestedDirectory);
    }
    const directoryMetadata = fs.lstatSync(requestedDirectory);
    if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
      throw new Error('ProjectSettings must be a regular directory inside the project');
    }
    const directory = fs.realpathSync(requestedDirectory);
    if (!isUnder(root, directory)) throw new Error('ProjectSettings escapes the project root');
    const target = path.join(directory, 'sorting-layers.json');
    if (fs.existsSync(target)) {
      const targetMetadata = fs.lstatSync(target);
      if (targetMetadata.isSymbolicLink() || !targetMetadata.isFile()) {
        throw new Error('sorting-layers.json must be a regular file');
      }
    }
    return target;
  }

  function listProjectAssets(): ProjectFileAsset[] {
    const assets: ProjectFileAsset[] = [];
    const walk = (dir: string, folder: string) => {
      if (!fs.existsSync(dir)) return;
      for (const file of fs.readdirSync(dir)) {
        if (file.startsWith('.') || file.endsWith('.meta')) continue;
        const abs = path.join(dir, file);
        const stat = fs.lstatSync(abs);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          walk(abs, `${folder}/${file}`);
          continue;
        }
        const lower = file.toLowerCase();
        const kind: ProjectFileAsset['kind'] | null = lower.endsWith('.sprite.json')
          ? 'sprite-import'
          : lower.endsWith('.mscene')
            ? 'scene'
          : /\.(m?js|ts)$/.test(lower)
            ? 'script'
          : lower.endsWith('.matlas')
            ? 'sprite-atlas'
          : lower.endsWith('.manim')
          ? 'animation'
          : lower.endsWith('.mcontroller')
            ? 'animator-controller'
          : lower.endsWith('.mavatar')
            ? 'avatar-mask'
          : lower.endsWith('.mtimeline')
            ? 'timeline'
            : /\.(wav|ogg|mp3|flac)$/.test(lower)
              ? 'audio'
            : lower.endsWith('.mmat') || lower.endsWith('.mat') || lower.endsWith('.minst')
              ? 'material'
            : lower.endsWith('.mshader')
              ? 'shader'
              : lower.endsWith('.gltf') || lower.endsWith('.glb')
                ? 'model'
              : /\.(png|jpe?g|webp|gif|bmp|tga|tiff?|hdr|exr)$/.test(lower)
                ? 'texture'
              : lower.endsWith('.prefab')
                ? 'prefab'
                : lower.endsWith('.atlas')
                  ? 'spine-atlas'
                  : lower.endsWith('.skel')
                    ? 'spine-binary'
                    : lower.endsWith('.json')
                      ? 'spine-json'
                      : null;
        if (!kind) continue;
        const relPath = `Assets/${path.relative(assetsRoot, abs).replace(/\\/g, '/')}`;
        const metadata = assetMetadata(abs, kind);
        assets.push({
          id: relPath,
          name: file,
          folder,
          relPath,
          kind,
          revision: assetFileRevision(stat),
          size: stat.size,
          ...metadata,
        });
      }
    };
    walk(assetsRoot, 'Assets');
    const owners = new Map<string, ProjectFileAsset[]>();
    for (const asset of assets) {
      if (asset.metaStatus !== 'ready' || !asset.guid) continue;
      const group = owners.get(asset.guid) ?? [];
      group.push(asset);
      owners.set(asset.guid, group);
    }
    for (const [guid, group] of owners) {
      if (group.length < 2) continue;
      const files = group.map((asset) => asset.relPath).sort().join(', ');
      for (const asset of group) {
        asset.metaStatus = 'duplicate';
        asset.metaError = `asset GUID ${guid} is shared by multiple files: ${files}`;
      }
    }
    return assets.sort((a, b) => a.relPath.localeCompare(b.relPath));
  }

  function normalizedAssetPath(relRaw: string): string | null {
    const rel = decodeURIComponent(relRaw).replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = rel.split('/').filter(Boolean);
    if (segments[0]?.toLowerCase() !== 'assets') return null;
    if (segments.length < 2 || segments.some((segment) => segment === '.' || segment === '..')) {
      return null;
    }
    const abs = path.resolve(projectRoot, ...segments);
    return isUnder(assetsRoot, abs) ? abs : null;
  }

  function resolveAssetReadPath(relRaw: string): string | null {
    const abs = normalizedAssetPath(relRaw);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const real = fs.realpathSync(abs);
    return isUnder(fs.realpathSync(assetsRoot), real) ? real : null;
  }

  function resolveAssetWritePath(relRaw: string): string | null {
    const abs = normalizedAssetPath(relRaw);
    if (!abs) return null;
    let existing = path.dirname(abs);
    while (!fs.existsSync(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) return null;
      existing = parent;
    }
    const realAssets = fs.realpathSync(assetsRoot);
    const realExisting = fs.realpathSync(existing);
    if (!isUnder(realAssets, realExisting)) return null;
    if (fs.existsSync(abs)) {
      const metadata = fs.lstatSync(abs);
      if (!metadata.isFile() || metadata.isSymbolicLink()) return null;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const realParent = fs.realpathSync(path.dirname(abs));
    return isUnder(realAssets, realParent) ? abs : null;
  }

  function writeFileAtomic(file: string, contents: Buffer): void {
    const temporary = path.join(
      path.dirname(file),
      `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      const descriptor = fs.openSync(temporary, 'wx');
      try {
        fs.writeFileSync(descriptor, contents);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, file);
    } catch (error) {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      throw error;
    }
  }

  function contentTypeFor(file: string): string {
    const lower = file.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.atlas') || lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.skel')) return 'application/octet-stream';
    return 'application/octet-stream';
  }

  function scenePath(name: string) {
    return path.join(scenesDir, `${name}${SCENE_EXT}`);
  }

  function listDiskScenes(): SceneMeta[] {
    ensureDirs();
    if (!fs.existsSync(scenesDir)) return [];
    return fs
      .readdirSync(scenesDir)
      .filter((f) => f.toLowerCase().endsWith(SCENE_EXT))
      .map((f) => {
        const name = f.slice(0, -SCENE_EXT.length);
        const st = fs.statSync(path.join(scenesDir, f));
        return { name, updatedAt: st.mtimeMs };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function listBuildScenes(): string[] {
    const scenes: string[] = [];
    const walk = (directory: string) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(SCENE_EXT)) {
          scenes.push(path.relative(projectRoot, absolute).replace(/\\/g, '/'));
        }
      }
    };
    walk(scenesDir);
    return scenes.sort((left, right) => left.localeCompare(right));
  }

  function sameExistingFile(left: string, right: string): boolean {
    if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
    const leftReal = fs.realpathSync(left);
    const rightReal = fs.realpathSync(right);
    return process.platform === 'win32'
      ? leftReal.toLocaleLowerCase() === rightReal.toLocaleLowerCase()
      : leftReal === rightReal;
  }

  function renameFileCaseAware(source: string, target: string): void {
    if (source === target) return;
    if (!fs.existsSync(target)) {
      fs.renameSync(source, target);
      return;
    }
    if (!sameExistingFile(source, target)) throw new Error(`rename target already exists: ${target}`);
    const temporary = path.join(
      path.dirname(source),
      `.asset-rename.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
    );
    fs.renameSync(source, temporary);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      fs.renameSync(temporary, source);
      throw error;
    }
  }

  type AssetRenameUpdate = {
    sourcePath: string;
    expectedRevision: string;
    contents: string;
  };

  type AssetRenameRequest = {
    sourcePath: string;
    destinationPath: string;
    expectedSourceRevision: string;
    expectedGuid: string;
    updates: AssetRenameUpdate[];
  };

  type AssetDuplicateRequest = {
    sourcePath: string;
    destinationPath: string;
    expectedSourceRevision: string;
    expectedGuid: string;
    contents: string | null;
  };

  type AssetTrashRequest = {
    sourcePath: string;
    expectedSourceRevision: string;
    expectedGuid: string;
    expectedTreeRevision: string;
    expectedManifestRevision: string;
  };

  type AssetTrashRecord = {
    schemaVersion: 1;
    trashId: string;
    originalPath: string;
    guid: string;
    trashedAtMs: number;
    size: number;
    hasSpriteImport: boolean;
    assetRevision: string;
    metadataRevision: string;
    spriteImportRevision: string | null;
  };

  type AssetTrashEntry = Omit<
    AssetTrashRecord,
    'schemaVersion' | 'assetRevision' | 'metadataRevision' | 'spriteImportRevision'
  > & { recordRevision: string };

  type AssetRestoreRequest = {
    trashId: string;
    expectedRecordRevision: string;
  };

  function validAssetSegment(segment: string): boolean {
    if (
      !segment
      || segment.startsWith('.')
      || /[. ]$/.test(segment)
      || [...segment].length > 240
      || /[\x00-\x1f<>:"/\\|?*]/.test(segment)
    ) return false;
    const stem = segment.split('.')[0].toLocaleUpperCase();
    return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
  }

  function normalizedRenameAssetPath(value: unknown): { absolute: string; relative: string } {
    if (typeof value !== 'string') throw new Error('asset path must be a string');
    const relative = decodeURIComponent(value).trim().replace(/\\/g, '/').replace(/^\/+/, '');
    const segments = relative.split('/');
    if (
      segments.length < 2
      || segments[0] !== 'Assets'
      || segments.slice(1).some((segment) => !validAssetSegment(segment))
      || relative.toLocaleLowerCase().endsWith('.meta')
      || relative.toLocaleLowerCase().endsWith('.sprite.json')
      || !path.extname(relative)
    ) throw new Error(`invalid asset path: ${relative}`);
    const absolute = path.resolve(projectRoot, ...segments);
    if (!isUnder(assetsRoot, absolute)) throw new Error(`asset path escapes Assets: ${relative}`);
    return { absolute, relative };
  }

  function requireRegularAssetPath(asset: { absolute: string; relative: string }): fs.Stats {
    const relative = path.relative(assetsRoot, asset.absolute);
    const segments = relative.split(path.sep).filter(Boolean);
    let current = assetsRoot;
    const rootStat = fs.lstatSync(current);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('Assets must be a regular non-symlink directory');
    }
    let finalStat = rootStat;
    segments.forEach((segment, index) => {
      current = path.join(current, segment);
      const stat = fs.lstatSync(current);
      const isLast = index + 1 === segments.length;
      if (
        stat.isSymbolicLink()
        || (isLast && !stat.isFile())
        || (!isLast && !stat.isDirectory())
      ) throw new Error(`asset path contains a non-regular or symbolic component: ${asset.relative}`);
      finalStat = stat;
    });
    if (!isUnder(fs.realpathSync(assetsRoot), fs.realpathSync(asset.absolute))) {
      throw new Error(`asset path escapes the real Assets root: ${asset.relative}`);
    }
    return finalStat;
  }

  function rewriteAssetReference(value: string, source: string, destination: string): string {
    const marker = value.indexOf('#');
    const end = marker < 0 ? value.length : marker;
    return value.slice(0, end).replace(/\\/g, '/').toLocaleLowerCase() === source.toLocaleLowerCase()
      ? `${destination}${value.slice(end)}`
      : value;
  }

  function rewriteManifestReferences(
    value: unknown,
    source: string,
    destination: string,
  ): { value: unknown; changed: boolean } {
    if (typeof value === 'string') {
      const next = rewriteAssetReference(value, source, destination);
      return { value: next, changed: next !== value };
    }
    if (Array.isArray(value)) {
      let changed = false;
      const output = value.map((entry) => {
        const rewritten = rewriteManifestReferences(entry, source, destination);
        changed ||= rewritten.changed;
        return rewritten.value;
      });
      return { value: output, changed };
    }
    if (value && typeof value === 'object') {
      let changed = false;
      const output: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        const rewritten = rewriteManifestReferences(entry, source, destination);
        changed ||= rewritten.changed;
        output[key] = rewritten.value;
      }
      return { value: output, changed };
    }
    return { value, changed: false };
  }

  type PreparedRenameUpdate = {
    label: string;
    originalPath: string;
    targetPath: string;
    expectedRevision: string;
    contents: Buffer;
    stagedPath: string | null;
    backupPath: string | null;
    committed: boolean;
  };

  function stageRenameUpdate(update: PreparedRenameUpdate): void {
    const temporary = path.join(
      path.dirname(update.targetPath),
      `.${path.basename(update.targetPath)}.rename.${randomUUID()}.tmp`,
    );
    try {
      const descriptor = fs.openSync(temporary, 'wx');
      try {
        fs.writeFileSync(descriptor, update.contents);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      update.stagedPath = temporary;
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
      throw error;
    }
  }

  function commitRenameUpdate(update: PreparedRenameUpdate): void {
    if (!update.stagedPath) throw new Error(`update was not staged: ${update.label}`);
    const backup = path.join(
      path.dirname(update.targetPath),
      `.${path.basename(update.targetPath)}.rollback.${randomUUID()}.tmp`,
    );
    fs.renameSync(update.targetPath, backup);
    update.backupPath = backup;
    try {
      fs.renameSync(update.stagedPath, update.targetPath);
      update.stagedPath = null;
      update.committed = true;
    } catch (error) {
      fs.renameSync(backup, update.targetPath);
      update.backupPath = null;
      throw error;
    }
  }

  function rollbackRenameUpdate(update: PreparedRenameUpdate): void {
    if (!update.committed || !update.backupPath) return;
    if (fs.existsSync(update.targetPath)) fs.unlinkSync(update.targetPath);
    fs.renameSync(update.backupPath, update.targetPath);
    update.backupPath = null;
    update.committed = false;
  }

  function cleanupRenameUpdates(updates: PreparedRenameUpdate[]): void {
    for (const update of updates) {
      try {
        if (update.stagedPath && fs.existsSync(update.stagedPath)) fs.unlinkSync(update.stagedPath);
      } catch { /* cleanup failure must not reverse a committed transaction */ }
      try {
        if (update.backupPath && fs.existsSync(update.backupPath)) fs.unlinkSync(update.backupPath);
      } catch { /* the rollback copy is safer to retain than a false failure report */ }
    }
  }

  function renameProjectAsset(request: AssetRenameRequest) {
    const source = normalizedRenameAssetPath(request.sourcePath);
    const destination = normalizedRenameAssetPath(request.destinationPath);
    if (source.relative === destination.relative) throw new Error('source and destination are identical');
    if (path.extname(source.relative).toLocaleLowerCase() !== path.extname(destination.relative).toLocaleLowerCase()) {
      throw new Error('asset rename must preserve the file extension');
    }
    if (path.extname(source.relative).toLocaleLowerCase() === SCENE_EXT) {
      throw new Error('scenes must use the scene-aware rename command');
    }
    if (!fs.existsSync(source.absolute)) throw new Error(`asset not found: ${source.relative}`);
    const sourceStat = requireRegularAssetPath(source);
    if (assetFileRevision(sourceStat) !== request.expectedSourceRevision) {
      throw new Error(`asset changed on disk since preview: ${source.relative}`);
    }
    const sourceKind = listProjectAssets().find(
      (asset) => asset.relPath.toLocaleLowerCase() === source.relative.toLocaleLowerCase(),
    );
    if (!sourceKind || sourceKind.metaStatus !== 'ready' || sourceKind.guid !== request.expectedGuid.toLocaleLowerCase()) {
      throw new Error(`asset identity changed on disk since preview: ${source.relative}`);
    }
    if (fs.existsSync(destination.absolute) && !sameExistingFile(source.absolute, destination.absolute)) {
      throw new Error(`destination asset already exists: ${destination.relative}`);
    }
    const sourceMetadata = `${source.absolute}.meta`;
    const destinationMetadata = `${destination.absolute}.meta`;
    if (fs.existsSync(destinationMetadata) && !sameExistingFile(sourceMetadata, destinationMetadata)) {
      throw new Error(`destination metadata already exists: ${destination.relative}.meta`);
    }
    const sourceSpriteImport = `${source.absolute}.sprite.json`;
    const destinationSpriteImport = `${destination.absolute}.sprite.json`;
    const movesSpriteImport = fs.existsSync(sourceSpriteImport);
    if (movesSpriteImport) {
      const stat = fs.lstatSync(sourceSpriteImport);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('sprite import sidecar must be a regular file');
      if (fs.existsSync(destinationSpriteImport) && !sameExistingFile(sourceSpriteImport, destinationSpriteImport)) {
        throw new Error(`destination sprite import sidecar already exists: ${destination.relative}.sprite.json`);
      }
    }
    if (!Array.isArray(request.updates) || request.updates.length > 256) {
      throw new Error('asset rename may update at most 256 files');
    }
    const updateBytes = request.updates.reduce((total, update) => total + Buffer.byteLength(update.contents ?? ''), 0);
    if (updateBytes > 32 * 1024 * 1024) throw new Error('asset rename updates exceed 32 MiB');
    const seen = new Set<string>();
    const updates: PreparedRenameUpdate[] = request.updates.map((update) => {
      const candidate = normalizedRenameAssetPath(update.sourcePath);
      const key = candidate.relative.toLocaleLowerCase();
      if (seen.has(key)) throw new Error(`duplicate asset update: ${candidate.relative}`);
      seen.add(key);
      if (
        key === `${source.relative}.sprite.json`.toLocaleLowerCase()
        || key === destination.relative.toLocaleLowerCase()
      ) throw new Error(`asset update targets a transaction-owned path: ${candidate.relative}`);
      const stat = requireRegularAssetPath(candidate);
      if (assetFileRevision(stat) !== update.expectedRevision) {
        throw new Error(`referencing asset changed on disk since preview: ${candidate.relative}`);
      }
      return {
        label: candidate.relative,
        originalPath: candidate.absolute,
        targetPath: key === source.relative.toLocaleLowerCase() ? destination.absolute : candidate.absolute,
        expectedRevision: update.expectedRevision,
        contents: Buffer.from(update.contents, 'utf8'),
        stagedPath: null,
        backupPath: null,
        committed: false,
      };
    });

    const manifestOriginal = fs.readFileSync(manifestPath);
    const manifestRevision = assetFileRevision(fs.lstatSync(manifestPath));
    const rewrittenManifest = rewriteManifestReferences(
      JSON.parse(manifestOriginal.toString('utf8')),
      source.relative,
      destination.relative,
    );
    if (rewrittenManifest.changed) {
      updates.push({
        label: 'project.json',
        originalPath: manifestPath,
        targetPath: manifestPath,
        expectedRevision: manifestRevision,
        contents: Buffer.from(`${JSON.stringify(rewrittenManifest.value, null, 2)}\n`, 'utf8'),
        stagedPath: null,
        backupPath: null,
        committed: false,
      });
    }

    const createdDirectories: string[] = [];
    let directory = path.dirname(destination.absolute);
    const missing: string[] = [];
    while (!fs.existsSync(directory)) {
      missing.push(directory);
      directory = path.dirname(directory);
    }
    const existing = fs.realpathSync(directory);
    if (!isUnder(fs.realpathSync(assetsRoot), existing)) throw new Error('destination escapes Assets');
    try {
      for (const candidate of missing.reverse()) {
        fs.mkdirSync(candidate);
        createdDirectories.push(candidate);
        if (!isUnder(fs.realpathSync(assetsRoot), fs.realpathSync(candidate))) {
          throw new Error('destination directory escapes Assets');
        }
      }
    } catch (error) {
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* keep any directory that is no longer empty */ }
      }
      throw error;
    }

    let assetMoved = false;
    let metadataMoved = false;
    let spriteImportMoved = false;
    try {
      for (const update of updates) stageRenameUpdate(update);
      if (assetFileRevision(requireRegularAssetPath(source)) !== request.expectedSourceRevision) {
        throw new Error(`asset changed while rename was being prepared: ${source.relative}`);
      }
      const currentSource = listProjectAssets().find(
        (asset) => asset.relPath.toLocaleLowerCase() === source.relative.toLocaleLowerCase(),
      );
      if (
        !currentSource
        || currentSource.metaStatus !== 'ready'
        || currentSource.guid !== request.expectedGuid.toLocaleLowerCase()
      ) throw new Error(`asset identity changed while rename was being prepared: ${source.relative}`);
      if (movesSpriteImport) {
        const stat = fs.lstatSync(sourceSpriteImport);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error(`sprite import sidecar changed while rename was being prepared: ${source.relative}`);
        }
      }
      for (const update of updates) {
        const actual = update.label === 'project.json'
          ? assetFileRevision(fs.lstatSync(update.originalPath))
          : assetFileRevision(requireRegularAssetPath(normalizedRenameAssetPath(update.label)));
        if (actual !== update.expectedRevision) throw new Error(`${update.label} changed while rename was being prepared`);
      }
      renameFileCaseAware(source.absolute, destination.absolute);
      assetMoved = true;
      renameFileCaseAware(sourceMetadata, destinationMetadata);
      metadataMoved = true;
      if (movesSpriteImport) {
        renameFileCaseAware(sourceSpriteImport, destinationSpriteImport);
        spriteImportMoved = true;
      }
      for (const update of updates) commitRenameUpdate(update);
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const update of [...updates].reverse()) {
        try { rollbackRenameUpdate(update); } catch (rollback) { rollbackErrors.push(`${update.label}: ${String(rollback)}`); }
      }
      if (spriteImportMoved) {
        try { renameFileCaseAware(destinationSpriteImport, sourceSpriteImport); } catch (rollback) { rollbackErrors.push(`sprite import: ${String(rollback)}`); }
      }
      if (metadataMoved) {
        try { renameFileCaseAware(destinationMetadata, sourceMetadata); } catch (rollback) { rollbackErrors.push(`metadata: ${String(rollback)}`); }
      }
      if (assetMoved) {
        try { renameFileCaseAware(destination.absolute, source.absolute); } catch (rollback) { rollbackErrors.push(`asset: ${String(rollback)}`); }
      }
      cleanupRenameUpdates(updates);
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* keep non-empty directories after a failed rollback */ }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`${String(error)}; rollback also failed: ${rollbackErrors.join(', ')}`);
      }
      throw error;
    }
    cleanupRenameUpdates(updates);
    const updatedPaths = updates
      .map((update) => update.label.toLocaleLowerCase() === source.relative.toLocaleLowerCase()
        ? destination.relative
        : update.label)
      .sort();
    return {
      sourcePath: source.relative,
      destinationPath: destination.relative,
      updatedPaths,
    };
  }

  function duplicateMetadata(sourceMetadata: string): { guid: string; contents: Buffer } {
    const value = JSON.parse(fs.readFileSync(sourceMetadata, 'utf8')) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('asset metadata root must be an object');
    }
    const guid = randomUUID().toLowerCase();
    let replaced = false;
    for (const key of ['guid', 'uuid']) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        value[key] = guid;
        replaced = true;
      }
    }
    if (value.mengine && typeof value.mengine === 'object' && !Array.isArray(value.mengine)) {
      const mengine = value.mengine as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(mengine, 'guid')) {
        mengine.guid = guid;
        replaced = true;
      }
    }
    if (!replaced) value.guid = guid;
    return { guid, contents: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8') };
  }

  function stageDuplicateFile(source: string | null, target: string, contents: Buffer | null): string {
    const temporary = path.join(
      path.dirname(target),
      `.${path.basename(target)}.duplicate.${randomUUID()}.tmp`,
    );
    try {
      if (contents) {
        const descriptor = fs.openSync(temporary, 'wx');
        try {
          fs.writeFileSync(descriptor, contents);
          fs.fsyncSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
      } else if (source) {
        fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
        const descriptor = fs.openSync(temporary, 'r');
        try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      } else {
        throw new Error('duplicate stage has no source or contents');
      }
      return temporary;
    } catch (error) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
      throw error;
    }
  }

  function duplicateProjectAsset(request: AssetDuplicateRequest) {
    const source = normalizedRenameAssetPath(request.sourcePath);
    const destination = normalizedRenameAssetPath(request.destinationPath);
    if (source.relative.toLocaleLowerCase() === destination.relative.toLocaleLowerCase()) {
      throw new Error('duplicate destination must differ from the source');
    }
    if (path.extname(source.relative).toLocaleLowerCase() !== path.extname(destination.relative).toLocaleLowerCase()) {
      throw new Error('asset duplication must preserve the file extension');
    }
    if (path.extname(source.relative).toLocaleLowerCase() === SCENE_EXT) {
      throw new Error('scenes must use Save As instead of generic duplication');
    }
    const sourceStat = requireRegularAssetPath(source);
    if (sourceStat.size > 512 * 1024 * 1024) throw new Error('source asset exceeds the 512 MiB duplication limit');
    if (assetFileRevision(sourceStat) !== request.expectedSourceRevision) {
      throw new Error(`asset changed on disk since duplicate preview: ${source.relative}`);
    }
    if (request.contents != null && Buffer.byteLength(request.contents) > 32 * 1024 * 1024) {
      throw new Error('duplicate rewritten contents exceed 32 MiB');
    }
    const sourceInfo = listProjectAssets().find(
      (asset) => asset.relPath.toLocaleLowerCase() === source.relative.toLocaleLowerCase(),
    );
    if (!sourceInfo || sourceInfo.metaStatus !== 'ready' || sourceInfo.guid !== request.expectedGuid.toLocaleLowerCase()) {
      throw new Error(`asset identity changed on disk since duplicate preview: ${source.relative}`);
    }
    const sourceMetadata = `${source.absolute}.meta`;
    const destinationMetadata = `${destination.absolute}.meta`;
    const sourceSpriteImport = `${source.absolute}.sprite.json`;
    const destinationSpriteImport = `${destination.absolute}.sprite.json`;
    const copiesSpriteImport = fs.existsSync(sourceSpriteImport);
    const sourceMetadataRevision = assetFileRevision(fs.lstatSync(sourceMetadata));
    const spriteImportRevision = copiesSpriteImport
      ? assetFileRevision(fs.lstatSync(sourceSpriteImport))
      : null;
    if (copiesSpriteImport) {
      const stat = fs.lstatSync(sourceSpriteImport);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('sprite import sidecar must be a regular file');
    }
    for (const target of [destination.absolute, destinationMetadata, destinationSpriteImport]) {
      if (fs.existsSync(target)) throw new Error(`duplicate target already exists: ${target}`);
    }
    const metadata = duplicateMetadata(sourceMetadata);
    const createdDirectories: string[] = [];
    let directory = path.dirname(destination.absolute);
    const missing: string[] = [];
    while (!fs.existsSync(directory)) {
      missing.push(directory);
      directory = path.dirname(directory);
    }
    if (!isUnder(fs.realpathSync(assetsRoot), fs.realpathSync(directory))) {
      throw new Error('duplicate destination escapes Assets');
    }
    try {
      for (const candidate of missing.reverse()) {
        fs.mkdirSync(candidate);
        createdDirectories.push(candidate);
      }
    } catch (error) {
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* best effort */ }
      }
      throw error;
    }
    const targets = [destination.absolute, destinationMetadata];
    const staged: string[] = [];
    const installed: string[] = [];
    try {
      staged.push(stageDuplicateFile(
        request.contents == null ? source.absolute : null,
        destination.absolute,
        request.contents == null ? null : Buffer.from(request.contents, 'utf8'),
      ));
      staged.push(stageDuplicateFile(null, destinationMetadata, metadata.contents));
      if (copiesSpriteImport) {
        targets.push(destinationSpriteImport);
        staged.push(stageDuplicateFile(sourceSpriteImport, destinationSpriteImport, null));
      }
      if (assetFileRevision(requireRegularAssetPath(source)) !== request.expectedSourceRevision) {
        throw new Error(`asset changed while duplicate was being prepared: ${source.relative}`);
      }
      const currentSource = listProjectAssets().find(
        (asset) => asset.relPath.toLocaleLowerCase() === source.relative.toLocaleLowerCase(),
      );
      if (!currentSource || currentSource.metaStatus !== 'ready' || currentSource.guid !== request.expectedGuid.toLocaleLowerCase()) {
        throw new Error(`asset identity changed while duplicate was being prepared: ${source.relative}`);
      }
      if (assetFileRevision(fs.lstatSync(sourceMetadata)) !== sourceMetadataRevision) {
        throw new Error(`asset metadata changed while duplicate was being prepared: ${source.relative}`);
      }
      if (
        copiesSpriteImport
        && assetFileRevision(fs.lstatSync(sourceSpriteImport)) !== spriteImportRevision
      ) throw new Error(`sprite import sidecar changed while duplicate was being prepared: ${source.relative}`);
      for (let index = 0; index < staged.length; index += 1) {
        fs.linkSync(staged[index], targets[index]);
        installed.push(targets[index]);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const target of [...installed].reverse()) {
        try { fs.unlinkSync(target); } catch (rollback) { rollbackErrors.push(`${target}: ${String(rollback)}`); }
      }
      for (const temporary of staged) {
        try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* best effort */ }
      }
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* best effort */ }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`${String(error)}; rollback also failed: ${rollbackErrors.join(', ')}`);
      }
      throw error;
    }
    for (const temporary of staged) {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* committed copy remains valid */ }
    }
    return {
      sourcePath: source.relative,
      destinationPath: destination.relative,
      guid: metadata.guid,
    };
  }

  const assetTrashRoot = path.join(projectRoot, '.mengine', 'Trash');

  function projectAssetTreeRevision(): string {
    const entries: string[] = [];
    const collect = (directory: string) => {
      for (const name of fs.readdirSync(directory)) {
        const absolute = path.join(directory, name);
        const relative = path.relative(assetsRoot, absolute).replace(/\\/g, '/');
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) entries.push(`L:${relative}`);
        else if (stat.isDirectory()) {
          entries.push(`D:${relative}`);
          collect(absolute);
        } else if (stat.isFile()) entries.push(`F:${relative}:${assetFileRevision(stat)}`);
        else entries.push(`O:${relative}`);
      }
    };
    const rootStat = fs.lstatSync(assetsRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('Assets must be a regular directory');
    }
    collect(assetsRoot);
    entries.sort();
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const entry of entries) {
      for (const byte of Buffer.from(`${entry}\n`, 'utf8')) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * prime);
      }
    }
    return hash.toString(16).padStart(16, '0');
  }

  const referenceTextExtensions = new Set([
    '.json', '.mscene', '.prefab', '.manim', '.mcontroller', '.mavatar',
    '.mtimeline', '.mmat', '.mat', '.minst', '.mshader', '.matlas', '.gltf',
    '.atlas', '.ts', '.tsx', '.js', '.jsx',
  ]);

  function isReferenceTextAsset(absolute: string): boolean {
    return referenceTextExtensions.has(path.extname(absolute).toLowerCase());
  }

  function containsDirectAssetReference(text: string, target: string): boolean {
    const normalized = text.replace(/\\/g, '/').toLocaleLowerCase();
    const expected = target.replace(/\\/g, '/').toLocaleLowerCase();
    const isPathCharacter = (value: string | undefined) => value != null && /[\p{L}\p{N}_./-]/u.test(value);
    let offset = 0;
    while (offset < normalized.length) {
      const start = normalized.indexOf(expected, offset);
      if (start < 0) return false;
      const end = start + expected.length;
      if (!isPathCharacter(normalized[start - 1]) && !isPathCharacter(normalized[end])) return true;
      offset = Math.max(end, start + 1);
    }
    return false;
  }

  function findSurvivingDirectAssetReferences(target: string): string[] {
    const references: string[] = [];
    const walk = (directory: string) => {
      for (const name of fs.readdirSync(directory)) {
        const absolute = path.join(directory, name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          walk(absolute);
          continue;
        }
        const relative = path.relative(projectRoot, absolute).replace(/\\/g, '/');
        if (
          !stat.isFile()
          || relative.toLowerCase() === target.toLowerCase()
          || relative.toLowerCase() === `${target.toLowerCase()}.sprite.json`
          || !isReferenceTextAsset(absolute)
        ) continue;
        if (stat.size > 8 * 1024 * 1024) {
          throw new Error(`cannot verify oversized reference source: ${relative}`);
        }
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(absolute));
        } catch {
          throw new Error(`cannot verify non-UTF-8 reference source: ${relative}`);
        }
        if (containsDirectAssetReference(text, target)) references.push(relative);
      }
    };
    walk(assetsRoot);
    return references.sort();
  }

  function collectManifestAssetReferences(
    value: unknown,
    target: string,
    pointer = '',
    output: Array<{ location: string; reference: string }> = [],
  ): Array<{ location: string; reference: string }> {
    if (typeof value === 'string') {
      const source = value.split('#', 1)[0].replace(/\\/g, '/');
      if (source.toLowerCase() === target.toLowerCase()) {
        output.push({ location: pointer || '/', reference: value });
      }
      return output;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        collectManifestAssetReferences(child, target, `${pointer}/${index}`, output);
      });
      return output;
    }
    if (!value || typeof value !== 'object') return output;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const escaped = key.replace(/~/g, '~0').replace(/\//g, '~1');
      collectManifestAssetReferences(child, target, `${pointer}/${escaped}`, output);
    }
    return output;
  }

  function readStableManifest(): { revision: string; value: unknown } {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = assetFileRevision(fs.lstatSync(manifestPath));
      const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
      const after = assetFileRevision(fs.lstatSync(manifestPath));
      if (before === after) return { revision: before, value };
    }
    throw new Error('project.json changed repeatedly while it was read');
  }

  function projectAssetDeleteSnapshot(sourcePath: string) {
    const source = normalizedRenameAssetPath(sourcePath);
    const manifest = readStableManifest();
    return {
      treeRevision: projectAssetTreeRevision(),
      manifestRevision: manifest.revision,
      manifestReferences: collectManifestAssetReferences(manifest.value, source.relative),
    };
  }

  function ensureAssetTrashRoot(): void {
    let current = projectRoot;
    for (const segment of ['.mengine', 'Trash']) {
      current = path.join(current, segment);
      if (!fs.existsSync(current)) fs.mkdirSync(current);
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`project Trash path must be a regular directory: ${current}`);
      }
      if (!isUnder(projectRoot, fs.realpathSync(current))) {
        throw new Error('project Trash path escapes the project');
      }
    }
  }

  function trashPayloadPaths(directory: string) {
    return {
      asset: path.join(directory, 'asset'),
      metadata: path.join(directory, 'asset.meta'),
      spriteImport: path.join(directory, 'asset.sprite.json'),
      record: path.join(directory, 'record.json'),
    };
  }

  function assetTrashEntry(record: AssetTrashRecord, recordRevision: string): AssetTrashEntry {
    return {
      trashId: record.trashId,
      originalPath: record.originalPath,
      guid: record.guid,
      trashedAtMs: record.trashedAtMs,
      size: record.size,
      hasSpriteImport: record.hasSpriteImport,
      recordRevision,
    };
  }

  function readAssetTrashRecord(trashId: string): {
    record: AssetTrashRecord;
    revision: string;
    directory: string;
  } {
    if (!UUID_PATTERN.test(trashId)) throw new Error('invalid Trash entry id');
    const directory = path.join(assetTrashRoot, trashId.toLowerCase());
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('Trash entry must be a regular directory');
    }
    const payload = trashPayloadPaths(directory);
    const recordStat = fs.lstatSync(payload.record);
    if (!recordStat.isFile() || recordStat.isSymbolicLink() || recordStat.size > 1024 * 1024) {
      throw new Error('Trash record must be a small regular file');
    }
    const record = JSON.parse(fs.readFileSync(payload.record, 'utf8')) as AssetTrashRecord;
    if (
      !record
      || record.schemaVersion !== 1
      || record.trashId.toLowerCase() !== trashId.toLowerCase()
      || !UUID_PATTERN.test(record.guid)
    ) throw new Error('Trash record identity or schema is invalid');
    normalizedRenameAssetPath(record.originalPath);
    return { record, revision: assetFileRevision(recordStat), directory };
  }

  function metadataGuid(metadataPath: string): string | null {
    try {
      const value = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Record<string, unknown>;
      const mengine = value?.mengine && typeof value.mengine === 'object' && !Array.isArray(value.mengine)
        ? value.mengine as Record<string, unknown>
        : null;
      const guid = value?.guid ?? value?.uuid ?? mengine?.guid;
      return typeof guid === 'string' && UUID_PATTERN.test(guid) ? guid.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function validateAssetTrashPayload(directory: string, record: AssetTrashRecord): void {
    const payload = trashPayloadPaths(directory);
    for (const [label, file, revision] of [
      ['asset', payload.asset, record.assetRevision],
      ['metadata', payload.metadata, record.metadataRevision],
    ] as const) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || assetFileRevision(stat) !== revision) {
        throw new Error(`Trash ${label} payload was modified or is missing`);
      }
    }
    if (metadataGuid(payload.metadata) !== record.guid.toLowerCase()) {
      throw new Error('Trash metadata GUID does not match its record');
    }
    if (record.hasSpriteImport) {
      const stat = fs.lstatSync(payload.spriteImport);
      if (
        !stat.isFile()
        || stat.isSymbolicLink()
        || assetFileRevision(stat) !== record.spriteImportRevision
      ) throw new Error('Trash Sprite Import payload was modified or is missing');
    } else if (fs.existsSync(payload.spriteImport)) {
      throw new Error('Trash entry contains an unexpected Sprite Import payload');
    }
  }

  function listProjectAssetTrash(): { entries: AssetTrashEntry[]; invalidEntries: number } {
    if (!fs.existsSync(assetTrashRoot)) return { entries: [], invalidEntries: 0 };
    const rootStat = fs.lstatSync(assetTrashRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('project Trash root must be a regular directory');
    }
    const entries: AssetTrashEntry[] = [];
    let invalidEntries = 0;
    for (const name of fs.readdirSync(assetTrashRoot)) {
      if (!UUID_PATTERN.test(name)) {
        invalidEntries += 1;
        continue;
      }
      try {
        const { record, revision, directory } = readAssetTrashRecord(name);
        validateAssetTrashPayload(directory, record);
        entries.push(assetTrashEntry(record, revision));
      } catch {
        // Corrupt entries remain on disk for manual recovery but are never
        // offered as safe one-click restores.
        invalidEntries += 1;
      }
    }
    return {
      entries: entries.sort((left, right) => (
        right.trashedAtMs - left.trashedAtMs
        || left.originalPath.localeCompare(right.originalPath)
      )),
      invalidEntries,
    };
  }

  function trashProjectAsset(request: AssetTrashRequest) {
    const source = normalizedRenameAssetPath(request.sourcePath);
    if (path.extname(source.relative).toLocaleLowerCase() === SCENE_EXT) {
      throw new Error('scenes use the dedicated scene lifecycle');
    }
    const snapshot = projectAssetDeleteSnapshot(source.relative);
    if (snapshot.treeRevision !== request.expectedTreeRevision) {
      throw new Error('project assets changed since the delete reference scan; preview again');
    }
    if (snapshot.manifestRevision !== request.expectedManifestRevision) {
      throw new Error('project.json changed since the delete reference scan; preview again');
    }
    if (snapshot.manifestReferences.length > 0) {
      throw new Error('project.json still references this asset');
    }
    const survivingReferences = findSurvivingDirectAssetReferences(source.relative);
    if (survivingReferences.length > 0) {
      throw new Error(`surviving project assets still reference this asset: ${survivingReferences.join(', ')}`);
    }
    const sourceStat = requireRegularAssetPath(source);
    const sourceRevision = assetFileRevision(sourceStat);
    if (sourceRevision !== request.expectedSourceRevision) {
      throw new Error(`asset changed on disk since delete preview: ${source.relative}`);
    }
    const sourceInfo = listProjectAssets().find(
      (asset) => asset.relPath.toLowerCase() === source.relative.toLowerCase(),
    );
    if (
      !sourceInfo
      || sourceInfo.metaStatus !== 'ready'
      || sourceInfo.guid !== request.expectedGuid.toLowerCase()
    ) throw new Error(`asset identity changed on disk since delete preview: ${source.relative}`);
    const sourceMetadata = `${source.absolute}.meta`;
    const sourceSpriteImport = `${source.absolute}.sprite.json`;
    const metadataStat = fs.lstatSync(sourceMetadata);
    if (!metadataStat.isFile() || metadataStat.isSymbolicLink()) {
      throw new Error('asset metadata must be a regular file');
    }
    const metadataRevision = assetFileRevision(metadataStat);
    const hasSpriteImport = fs.existsSync(sourceSpriteImport);
    const spriteImportRevision = hasSpriteImport
      ? assetFileRevision(fs.lstatSync(sourceSpriteImport))
      : null;
    if (hasSpriteImport) {
      const stat = fs.lstatSync(sourceSpriteImport);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('sprite import sidecar must be a regular file');
      }
    }
    ensureAssetTrashRoot();
    const trashId = randomUUID().toLowerCase();
    const directory = path.join(assetTrashRoot, trashId);
    fs.mkdirSync(directory);
    const payload = trashPayloadPaths(directory);
    const record: AssetTrashRecord = {
      schemaVersion: 1,
      trashId,
      originalPath: source.relative,
      guid: request.expectedGuid.toLowerCase(),
      trashedAtMs: Date.now(),
      size: sourceStat.size,
      hasSpriteImport,
      assetRevision: sourceRevision,
      metadataRevision,
      spriteImportRevision,
    };
    try {
      const descriptor = fs.openSync(payload.record, 'wx');
      try {
        fs.writeFileSync(descriptor, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      const preparedSnapshot = projectAssetDeleteSnapshot(source.relative);
      if (preparedSnapshot.treeRevision !== request.expectedTreeRevision) {
        throw new Error('project assets changed while delete was being prepared; preview again');
      }
      if (preparedSnapshot.manifestRevision !== request.expectedManifestRevision) {
        throw new Error('project.json changed while delete was being prepared; preview again');
      }
      if (assetFileRevision(fs.lstatSync(source.absolute)) !== sourceRevision) {
        throw new Error('asset changed while delete was being prepared');
      }
      if (assetFileRevision(fs.lstatSync(sourceMetadata)) !== metadataRevision) {
        throw new Error('asset metadata changed while delete was being prepared');
      }
      if (
        hasSpriteImport
        && assetFileRevision(fs.lstatSync(sourceSpriteImport)) !== spriteImportRevision
      ) throw new Error('sprite import sidecar changed while delete was being prepared');
    } catch (error) {
      try { if (fs.existsSync(payload.record)) fs.unlinkSync(payload.record); } catch { /* best effort */ }
      try { fs.rmdirSync(directory); } catch { /* best effort */ }
      throw error;
    }
    const moved: Array<[string, string]> = [];
    try {
      fs.renameSync(source.absolute, payload.asset);
      moved.push([payload.asset, source.absolute]);
      fs.renameSync(sourceMetadata, payload.metadata);
      moved.push([payload.metadata, sourceMetadata]);
      if (hasSpriteImport) {
        fs.renameSync(sourceSpriteImport, payload.spriteImport);
        moved.push([payload.spriteImport, sourceSpriteImport]);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const [from, to] of [...moved].reverse()) {
        try { fs.renameSync(from, to); } catch (rollback) { rollbackErrors.push(String(rollback)); }
      }
      if (rollbackErrors.length === 0) {
        try { fs.unlinkSync(payload.record); } catch { /* best effort */ }
        try { fs.rmdirSync(directory); } catch { /* best effort */ }
        throw error;
      }
      throw new Error(`${String(error)}; rollback also failed: ${rollbackErrors.join(', ')}`);
    }
    let parent = path.dirname(source.absolute);
    while (parent !== assetsRoot && isUnder(assetsRoot, parent)) {
      try { fs.rmdirSync(parent); } catch { break; }
      parent = path.dirname(parent);
    }
    return {
      entry: assetTrashEntry(record, assetFileRevision(fs.lstatSync(payload.record))),
    };
  }

  function restoreProjectAsset(request: AssetRestoreRequest) {
    const { record, revision, directory } = readAssetTrashRecord(request.trashId);
    if (revision !== request.expectedRecordRevision) {
      throw new Error('Trash record changed since it was listed; refresh Trash');
    }
    validateAssetTrashPayload(directory, record);
    if (listProjectAssets().some((asset) => asset.guid === record.guid.toLowerCase())) {
      throw new Error(`cannot restore because GUID ${record.guid} is already used by another asset`);
    }
    const destination = normalizedRenameAssetPath(record.originalPath);
    const destinationMetadata = `${destination.absolute}.meta`;
    const destinationSpriteImport = `${destination.absolute}.sprite.json`;
    for (const target of [destination.absolute, destinationMetadata, destinationSpriteImport]) {
      if (fs.existsSync(target)) throw new Error(`restore target already exists: ${target}`);
    }
    const createdDirectories: string[] = [];
    let parent = path.dirname(destination.absolute);
    const missing: string[] = [];
    while (!fs.existsSync(parent)) {
      missing.push(parent);
      parent = path.dirname(parent);
    }
    if (!isUnder(assetsRoot, fs.realpathSync(parent))) throw new Error('restore target escapes Assets');
    try {
      for (const candidate of missing.reverse()) {
        fs.mkdirSync(candidate);
        createdDirectories.push(candidate);
      }
    } catch (error) {
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* best effort */ }
      }
      throw error;
    }
    const payload = trashPayloadPaths(directory);
    const moved: Array<[string, string]> = [];
    try {
      fs.renameSync(payload.asset, destination.absolute);
      moved.push([destination.absolute, payload.asset]);
      fs.renameSync(payload.metadata, destinationMetadata);
      moved.push([destinationMetadata, payload.metadata]);
      if (record.hasSpriteImport) {
        fs.renameSync(payload.spriteImport, destinationSpriteImport);
        moved.push([destinationSpriteImport, payload.spriteImport]);
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const [from, to] of [...moved].reverse()) {
        try { fs.renameSync(from, to); } catch (rollback) { rollbackErrors.push(String(rollback)); }
      }
      for (const candidate of [...createdDirectories].reverse()) {
        try { fs.rmdirSync(candidate); } catch { /* best effort */ }
      }
      if (rollbackErrors.length > 0) {
        throw new Error(`${String(error)}; rollback also failed: ${rollbackErrors.join(', ')}`);
      }
      throw error;
    }
    try { fs.unlinkSync(payload.record); } catch { /* restored asset remains authoritative */ }
    try { fs.rmdirSync(directory); } catch { /* orphan record is not listed without payload */ }
    return { trashId: record.trashId, restoredPath: destination.relative, guid: record.guid };
  }

  function normalizeBuildScene(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const segments = value.trim().replace(/\\/g, '/').split('/').filter(Boolean);
    if (
      segments.length < 3
      || segments[0] !== 'Assets'
      || segments[1] !== 'Scenes'
      || segments.some((segment) => segment === '.' || segment === '..')
      || !segments.at(-1)?.toLowerCase().endsWith(SCENE_EXT)
    ) {
      return null;
    }
    return segments.join('/');
  }

  function normalizeAlwaysInclude(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const segments = value.trim().replace(/\\/g, '/').split('/');
    if (
      segments.length === 0
      || (segments[0] !== 'Assets' && segments[0] !== 'Scripts')
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      return null;
    }
    const relative = segments.join('/');
    if (relative.toLocaleLowerCase().endsWith('.meta')) return null;
    const absolute = path.resolve(projectRoot, ...segments);
    const fromRoot = path.relative(projectRoot, absolute);
    if (fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || !fs.existsSync(absolute)) {
      return null;
    }
    return relative;
  }

  function readBuildSettings() {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const mainScene = normalizeBuildScene(manifest.mainScene ?? manifest.main_scene);
    const rawScenes = manifest.buildScenes ?? manifest.build_scenes;
    const source = Array.isArray(rawScenes) ? rawScenes : [];
    const scenes: string[] = [];
    const seen = new Set<string>();
    for (const value of source) {
      const scene = normalizeBuildScene(value);
      if (scene && !seen.has(scene.toLowerCase())) {
        seen.add(scene.toLowerCase());
        scenes.push(scene);
      }
    }
    if (scenes.length === 0 && mainScene) scenes.push(mainScene);
    const rawAssetMode = manifest.assetMode ?? manifest.asset_mode;
    if (rawAssetMode != null && rawAssetMode !== 'all' && rawAssetMode !== 'referenced') {
      throw new Error(`assetMode must be all or referenced: ${String(rawAssetMode)}`);
    }
    const assetMode = rawAssetMode === 'referenced' ? 'referenced' : 'all';
    const alwaysInclude: string[] = [];
    const seenAlwaysInclude = new Set<string>();
    const rawAlwaysInclude = manifest.alwaysInclude ?? manifest.always_include;
    if (rawAlwaysInclude != null && !Array.isArray(rawAlwaysInclude)) {
      throw new Error('alwaysInclude must be an array');
    }
    for (const value of Array.isArray(rawAlwaysInclude) ? rawAlwaysInclude : []) {
      const included = normalizeAlwaysInclude(value);
      if (!included || seenAlwaysInclude.has(included.toLowerCase())) {
        throw new Error(`invalid or duplicate alwaysInclude path: ${String(value)}`);
      }
      seenAlwaysInclude.add(included.toLowerCase());
      alwaysInclude.push(included);
    }
    return {
      manifest,
      settings: {
        mainScene: scenes[0] ?? null,
        scenes,
        availableScenes: listBuildScenes(),
        assetMode,
        alwaysInclude,
      },
    };
  }

  function normalizeSortingLayers(value: unknown) {
    const source = value && typeof value === 'object'
      ? value as { version?: unknown; layers?: unknown }
      : null;
    if (source?.version !== 1) {
      throw new Error(`unsupported sorting layer version ${String(source?.version)}`);
    }
    const raw = source.layers;
    if (!Array.isArray(raw) || raw.length > 64) {
      throw new Error('sorting layers must contain at most 64 entries');
    }
    const ids = new Set<string>();
    const names = new Set<string>();
    const layers: Array<{ id: string; name: string }> = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') throw new Error('invalid sorting layer entry');
      const source = entry as { id?: unknown; name?: unknown };
      const id = typeof source.id === 'string' ? source.id.trim() : '';
      let name = typeof source.name === 'string' ? source.name.trim() : '';
      const idKey = id.toLowerCase();
      if (idKey === 'default') name = 'Default';
      const nameKey = name.toLocaleLowerCase();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`invalid sorting layer id '${id}'`);
      if (!name || [...name].length > 64) throw new Error(`invalid sorting layer name '${name}'`);
      if (ids.has(idKey)) throw new Error(`duplicate sorting layer id '${id}'`);
      if (names.has(nameKey)) throw new Error(`duplicate sorting layer name '${name}'`);
      ids.add(idKey);
      names.add(nameKey);
      layers.push({ id, name });
    }
    if (!ids.has('default')) layers.unshift({ id: 'default', name: 'Default' });
    return { version: 1 as const, layers };
  }

  function readSortingLayers() {
    const sortingLayersPath = resolveSortingLayersPath(false);
    if (!sortingLayersPath || !fs.existsSync(sortingLayersPath)) {
      return { version: 1 as const, layers: [{ id: 'default', name: 'Default' }] };
    }
    return normalizeSortingLayers(JSON.parse(fs.readFileSync(sortingLayersPath, 'utf8')));
  }

  function collectTs(dir: string, folder: string, idPrefix: string, out: ScriptAsset[]) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts') || f.endsWith('.d.ts')) continue;
      if (f === 'index.ts') continue;
      const abs = path.join(dir, f);
      if (!fs.statSync(abs).isFile()) continue;
      out.push({
        id: `${idPrefix}/${f}`,
        name: f,
        folder,
        absPath: abs,
      });
    }
  }

  function listScripts(): ScriptAsset[] {
    ensureDirs();
    const out: ScriptAsset[] = [];
    collectTs(userScriptsDir, 'Assets/Scripts', 'project', out);
    collectTs(behavioursDir, 'Assets/Scripts', 'behaviours', out);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function resolveOpenPath(input: string): string | null {
    const abs = path.resolve(input);
    if (!isUnder(projectRoot, abs) && !isUnder(editorRoot, abs)) return null;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return abs;
  }

  function readEditorState(): EditorStateFile {
    try {
      if (!fs.existsSync(statePath)) return {};
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8')) as EditorStateFile;
      return data && typeof data === 'object' ? data : {};
    } catch {
      return {};
    }
  }

  function writeEditorState(partial: EditorStateFile) {
    ensureDirs();
    const next = { ...readEditorState(), ...partial };
    fs.writeFileSync(statePath, JSON.stringify(next, null, 2), 'utf8');
  }

  function readActive(): string | null {
    return readEditorState().activeScene ?? null;
  }

  function writeActive(name: string | null) {
    writeEditorState({ activeScene: name });
  }

  async function handle(req: Connect.IncomingMessage, res: Connect.ServerResponse, next: Connect.NextFunction) {
    const url = req.url ?? '';
    if (!url.startsWith(API)) return next();

    const method = (req.method ?? 'GET').toUpperCase();
    const pathname = url.split('?')[0];

    try {
      ensureDirs();

      // GET /__mengine/scripts
      if (pathname === `${API}/scripts` && method === 'GET') {
        return sendJson(res, 200, { scripts: listScripts() });
      }

      // GET /__mengine/sprites → textures under Assets + folder tree
      if (pathname === `${API}/sprites` && method === 'GET') {
        return sendJson(res, 200, listTextures());
      }

      // GET /__mengine/assets → Spine authoring assets visible in Project.
      if (pathname === `${API}/assets` && method === 'GET') {
        return sendJson(res, 200, { assets: listProjectAssets() });
      }

      if (pathname === `${API}/assets/rename` && method === 'POST') {
        const body = await readBodyBytes(req, 40 * 1024 * 1024);
        const request = JSON.parse(body.toString('utf8') || '{}') as AssetRenameRequest;
        return sendJson(res, 200, renameProjectAsset(request));
      }

      if (pathname === `${API}/assets/duplicate` && method === 'POST') {
        const body = await readBodyBytes(req, 34 * 1024 * 1024);
        const request = JSON.parse(body.toString('utf8') || '{}') as AssetDuplicateRequest;
        return sendJson(res, 200, duplicateProjectAsset(request));
      }

      if (pathname === `${API}/assets/delete-snapshot` && method === 'POST') {
        const body = await readBodyBytes(req, 1024 * 1024);
        const request = JSON.parse(body.toString('utf8') || '{}') as { sourcePath?: unknown };
        if (typeof request.sourcePath !== 'string') throw new Error('sourcePath is required');
        return sendJson(res, 200, projectAssetDeleteSnapshot(request.sourcePath));
      }

      if (pathname === `${API}/assets/trash` && method === 'POST') {
        const body = await readBodyBytes(req, 1024 * 1024);
        const request = JSON.parse(body.toString('utf8') || '{}') as AssetTrashRequest;
        return sendJson(res, 200, trashProjectAsset(request));
      }

      if (pathname === `${API}/assets/trash` && method === 'GET') {
        return sendJson(res, 200, listProjectAssetTrash());
      }

      if (pathname === `${API}/assets/restore` && method === 'POST') {
        const body = await readBodyBytes(req, 1024 * 1024);
        const request = JSON.parse(body.toString('utf8') || '{}') as AssetRestoreRequest;
        return sendJson(res, 200, restoreProjectAsset(request));
      }

      // GET /__mengine/asset/Assets/...  → serve project texture
      if (pathname === `${API}/build-settings` && method === 'GET') {
        return sendJson(res, 200, readBuildSettings().settings);
      }

      if (pathname === `${API}/build-settings` && method === 'PUT') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as { scenes?: unknown[] };
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
          return sendJson(res, 400, { error: 'at least one build scene is required' });
        }
        const available = new Map(listBuildScenes().map((scene) => [scene.toLowerCase(), scene]));
        const scenes: string[] = [];
        const seen = new Set<string>();
        for (const value of parsed.scenes) {
          const scene = normalizeBuildScene(value);
          const canonical = scene ? available.get(scene.toLowerCase()) : null;
          if (!canonical || seen.has(canonical.toLowerCase())) {
            return sendJson(res, 400, {
              error: `invalid or duplicate build scene: ${String(value)}`,
            });
          }
          seen.add(canonical.toLowerCase());
          scenes.push(canonical);
        }
        const { manifest } = readBuildSettings();
        manifest.mainScene = scenes[0];
        manifest.buildScenes = scenes;
        delete manifest.main_scene;
        delete manifest.build_scenes;
        writeFileAtomic(
          manifestPath,
          Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
        );
        return sendJson(res, 200, readBuildSettings().settings);
      }

      if (pathname === `${API}/build-asset-settings` && method === 'PUT') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as {
          assetMode?: unknown;
          alwaysInclude?: unknown;
        };
        if (parsed.assetMode !== 'all' && parsed.assetMode !== 'referenced') {
          return sendJson(res, 400, { error: 'assetMode must be all or referenced' });
        }
        if (!Array.isArray(parsed.alwaysInclude) || parsed.alwaysInclude.length > 256) {
          return sendJson(res, 400, { error: 'alwaysInclude must contain at most 256 paths' });
        }
        const alwaysInclude: string[] = [];
        const seen = new Set<string>();
        for (const value of parsed.alwaysInclude) {
          const included = normalizeAlwaysInclude(value);
          if (!included || seen.has(included.toLowerCase())) {
            return sendJson(res, 400, {
              error: `invalid or duplicate alwaysInclude path: ${String(value)}`,
            });
          }
          seen.add(included.toLowerCase());
          alwaysInclude.push(included);
        }
        const { manifest } = readBuildSettings();
        manifest.assetMode = parsed.assetMode;
        manifest.alwaysInclude = alwaysInclude;
        delete manifest.asset_mode;
        delete manifest.always_include;
        writeFileAtomic(
          manifestPath,
          Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
        );
        return sendJson(res, 200, readBuildSettings().settings);
      }

      if (pathname === `${API}/sorting-layers` && method === 'GET') {
        return sendJson(res, 200, readSortingLayers());
      }

      if (pathname === `${API}/sorting-layers` && method === 'PUT') {
        const settings = normalizeSortingLayers(JSON.parse(await readBody(req) || '{}'));
        const sortingLayersPath = resolveSortingLayersPath(true);
        if (!sortingLayersPath) throw new Error('sorting layer path is unavailable');
        writeFileAtomic(
          sortingLayersPath,
          Buffer.from(`${JSON.stringify(settings, null, 2)}\n`, 'utf8'),
        );
        return sendJson(res, 200, settings);
      }

      const assetMatch = pathname.match(new RegExp(`^${API}/asset/(.+)$`));
      if (assetMatch && method === 'GET') {
        const abs = resolveAssetReadPath(assetMatch[1]);
        if (!abs) return sendJson(res, 404, { error: 'not found' });
        let buf: Buffer | null = null;
        let revision = '';
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const before = assetFileRevision(fs.statSync(abs));
          const candidate = fs.readFileSync(abs);
          const after = assetFileRevision(fs.statSync(abs));
          if (before === after) {
            buf = candidate;
            revision = after;
            break;
          }
        }
        if (!buf) return sendJson(res, 409, { error: 'asset changed repeatedly while it was being read; retry' });
        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypeFor(abs));
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-MEngine-Asset-Revision', revision);
        res.end(buf);
        return;
      }
      if (assetMatch && method === 'PUT') {
        const abs = resolveAssetWritePath(assetMatch[1]);
        if (!abs) return sendJson(res, 400, { error: 'invalid asset path' });
        const expectedHeader = req.headers['x-mengine-expected-revision'];
        const expectedValue = Array.isArray(expectedHeader) ? expectedHeader[0] : expectedHeader;
        const expectedRevision = expectedValue === '__missing__' ? null : (expectedValue ?? null);
        const body = await readBodyBytes(req, 64 * 1024 * 1024);
        const actualRevision = fs.existsSync(abs) ? assetFileRevision(fs.lstatSync(abs)) : null;
        if (actualRevision !== expectedRevision) {
          return sendJson(res, 409, {
            error: `asset changed on disk since it was loaded: ${assetMatch[1]}; reload it before saving`,
          });
        }
        writeFileAtomic(abs, body);
        const relPath = `Assets/${path.relative(assetsRoot, abs).replace(/\\/g, '/')}`;
        const asset = listProjectAssets().find((candidate) => candidate.relPath === relPath) ?? null;
        return sendJson(res, 200, {
          ok: true,
          bytes: body.length,
          revision: assetFileRevision(fs.statSync(abs)),
          asset,
        });
      }

      // POST /__mengine/open  { path | id }
      if (pathname === `${API}/open` && method === 'POST') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as { path?: string; id?: string };
        let abs: string | null = null;
        if (parsed.id) {
          const hit = listScripts().find((s) => s.id === parsed.id);
          abs = hit?.absPath ?? null;
        } else if (parsed.path) {
          abs = resolveOpenPath(parsed.path);
        }
        if (!abs) return sendJson(res, 404, { error: 'file not found' });
        const result = await openInIde(abs);
        // Always return vscode URI so browser can fallback
        const uriPath = abs.replace(/\\/g, '/');
        const vscodeUri = `vscode://file/${uriPath}`;
        return sendJson(res, 200, {
          ok: result.ok,
          via: result.via,
          error: result.error,
          absPath: abs,
          vscodeUri,
        });
      }

      // GET /__mengine/scenes  → { active, gameAspect?, gameOrientation?, scenes: [...] }
      if (pathname === `${API}/scenes` && method === 'GET') {
        const scenes = listDiskScenes().map((m) => {
          let json = '';
          try {
            json = fs.readFileSync(scenePath(m.name), 'utf8');
          } catch {
            /* empty */
          }
          return { ...m, json };
        });
        const st = readEditorState();
        return sendJson(res, 200, {
          active: st.activeScene ?? null,
          gameResolution: Object.prototype.hasOwnProperty.call(st, 'gameResolution')
            ? st.gameResolution
            : undefined,
          gameAspect: st.gameAspect ?? null,
          gameOrientation: st.gameOrientation ?? null,
          scenes,
        });
      }

      // PUT /__mengine/active  { name }
      if (pathname === `${API}/active` && method === 'PUT') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as { name?: string | null };
        const name = parsed.name == null || parsed.name === '' ? null : safeSceneName(parsed.name);
        if (parsed.name != null && parsed.name !== '' && name == null) {
          return sendJson(res, 400, { error: 'invalid name' });
        }
        writeActive(name);
        return sendJson(res, 200, { ok: true, name });
      }

      // PUT /__mengine/prefs  { gameAspect?, gameOrientation? } — merge into state.json
      if (pathname === `${API}/prefs` && method === 'PUT') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as {
          gameResolution?: { width: number; height: number } | null;
          gameAspect?: string;
          gameOrientation?: string;
        };
        const patch: EditorStateFile = {};
        if (parsed.gameResolution === null) {
          patch.gameResolution = null;
        } else if (
          parsed.gameResolution
          && Number.isFinite(parsed.gameResolution.width)
          && Number.isFinite(parsed.gameResolution.height)
        ) {
          patch.gameResolution = {
            width: Math.max(1, Math.min(16_384, Math.trunc(parsed.gameResolution.width))),
            height: Math.max(1, Math.min(16_384, Math.trunc(parsed.gameResolution.height))),
          };
        }
        if (typeof parsed.gameAspect === 'string') patch.gameAspect = parsed.gameAspect;
        if (typeof parsed.gameOrientation === 'string') {
          patch.gameOrientation = parsed.gameOrientation;
        }
        writeEditorState(patch);
        return sendJson(res, 200, { ok: true, ...readEditorState() });
      }

      // POST /__mengine/scenes/rename  { from, to }
      if (pathname === `${API}/scenes/rename` && method === 'POST') {
        const body = await readBody(req);
        const parsed = JSON.parse(body || '{}') as { from?: string; to?: string };
        const from = safeSceneName(parsed.from ?? '');
        const to = safeSceneName(parsed.to ?? '');
        if (!from || !to) return sendJson(res, 400, { error: 'invalid name' });
        const src = scenePath(from);
        const dst = scenePath(to);
        if (!fs.existsSync(src)) return sendJson(res, 404, { error: 'not found' });
        if (from !== to && fs.existsSync(dst) && !sameExistingFile(src, dst)) {
          return sendJson(res, 409, { error: 'exists' });
        }
        const sourceMetadata = assetMetadata(src, 'scene');
        if (sourceMetadata.metaStatus !== 'ready') {
          return sendJson(res, 409, { error: sourceMetadata.metaError ?? 'invalid scene metadata' });
        }
        const srcMeta = `${src}.meta`;
        const dstMeta = `${dst}.meta`;
        if (from !== to && fs.existsSync(dstMeta) && !sameExistingFile(srcMeta, dstMeta)) {
          return sendJson(res, 409, { error: 'scene metadata already exists' });
        }
        let payload = fs.readFileSync(src, 'utf8');
        try {
          const data = JSON.parse(payload);
          data.name = to;
          payload = JSON.stringify(data, null, 2);
        } catch {
          /* keep raw */
        }
        if (from !== to) {
          renameFileCaseAware(src, dst);
          try {
            renameFileCaseAware(srcMeta, dstMeta);
          } catch (error) {
            renameFileCaseAware(dst, src);
            throw error;
          }
        }
        try {
          fs.writeFileSync(dst, payload, 'utf8');
        } catch (error) {
          if (from !== to) {
            renameFileCaseAware(dstMeta, srcMeta);
            renameFileCaseAware(dst, src);
          }
          throw error;
        }
        if (readActive() === from) writeActive(to);
        return sendJson(res, 200, { ok: true, name: to });
      }

      // /__mengine/scenes/:name
      const m = pathname.match(new RegExp(`^${API}/scenes/([^/]+)$`));
      if (m) {
        const name = safeSceneName(m[1]);
        if (!name) return sendJson(res, 400, { error: 'invalid name' });
        const file = scenePath(name);

        if (method === 'GET') {
          if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'not found' });
          return sendText(res, 200, fs.readFileSync(file, 'utf8'));
        }

        if (method === 'PUT') {
          const body = await readBody(req);
          fs.writeFileSync(file, body, 'utf8');
          writeActive(name);
          const st = fs.statSync(file);
          return sendJson(res, 200, { ok: true, name, updatedAt: st.mtimeMs });
        }

        if (method === 'DELETE') {
          const metadata = `${file}.meta`;
          if (fs.existsSync(metadata)) {
            const stat = fs.lstatSync(metadata);
            if (stat.isSymbolicLink() || !stat.isFile()) {
              return sendJson(res, 409, { error: 'scene metadata must be a regular file' });
            }
          }
          if (fs.existsSync(file)) fs.unlinkSync(file);
          if (fs.existsSync(metadata)) fs.unlinkSync(metadata);
          if (readActive() === name) writeActive(null);
          return sendJson(res, 200, { ok: true });
        }
      }

      return sendJson(res, 404, { error: 'unknown route' });
    } catch (err) {
      console.error('[mengine-fs]', err);
      return sendJson(res, 500, { error: String(err) });
    }
  }

  return {
    name: 'mengine-fs',
    configureServer(server: ViteDevServer) {
      ensureDirs();
      server.middlewares.use(handle);
      const rel = path.relative(process.cwd(), scenesDir);
      server.config.logger.info(`[mengine-fs] scenes → ${rel || scenesDir}`);
      server.config.logger.info(`[mengine-fs] scripts → behaviours + project/Assets/Scripts`);
    },
  };
}
