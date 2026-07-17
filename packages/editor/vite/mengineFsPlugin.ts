import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

  const IMG_EXT = /\.(png|jpe?g|webp|gif)$/i;

  function ensureDirs() {
    fs.mkdirSync(scenesDir, { recursive: true });
    fs.mkdirSync(userScriptsDir, { recursive: true });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  }

  type TextureAsset = { id: string; name: string; folder: string; relPath: string };
  type ProjectFileAsset = TextureAsset & {
    kind: 'animation' | 'animator-controller' | 'audio' | 'material' | 'prefab' | 'spine-json' | 'spine-binary' | 'spine-atlas';
  };

  function listTextures(): { sprites: TextureAsset[]; folders: string[] } {
    ensureDirs();
    const sprites: TextureAsset[] = [];
    const folderSet = new Set<string>(['Assets', 'Assets/Scenes', 'Assets/Scripts', 'Assets/Prefabs', 'Assets/Materials', 'Assets/Sprites']);

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
          sprites.push({
            id: relPath,
            name: f,
            folder,
            relPath,
          });
        }
      }
    };

    walk(assetsRoot, 'Assets');
    sprites.sort((a, b) => a.relPath.localeCompare(b.relPath));
    const folders = [...folderSet].sort((a, b) => a.localeCompare(b));
    return { sprites, folders };
  }

  function listProjectAssets(): ProjectFileAsset[] {
    const assets: ProjectFileAsset[] = [];
    const walk = (dir: string, folder: string) => {
      if (!fs.existsSync(dir)) return;
      for (const file of fs.readdirSync(dir)) {
        if (file.startsWith('.') || file.endsWith('.meta')) continue;
        const abs = path.join(dir, file);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
          walk(abs, `${folder}/${file}`);
          continue;
        }
        const lower = file.toLowerCase();
        const kind: ProjectFileAsset['kind'] | null = lower.endsWith('.manim')
          ? 'animation'
          : lower.endsWith('.mcontroller')
            ? 'animator-controller'
            : /\.(wav|ogg|mp3|flac)$/.test(lower)
              ? 'audio'
            : lower.endsWith('.mmat') || lower.endsWith('.mat')
              ? 'material'
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
        assets.push({ id: relPath, name: file, folder, relPath, kind });
      }
    };
    walk(assetsRoot, 'Assets');
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
    return {
      manifest,
      settings: {
        mainScene: scenes[0] ?? null,
        scenes,
        availableScenes: listBuildScenes(),
      },
    };
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

      const assetMatch = pathname.match(new RegExp(`^${API}/asset/(.+)$`));
      if (assetMatch && method === 'GET') {
        const abs = resolveAssetReadPath(assetMatch[1]);
        if (!abs) return sendJson(res, 404, { error: 'not found' });
        const buf = fs.readFileSync(abs);
        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypeFor(abs));
        res.setHeader('Cache-Control', 'no-cache');
        res.end(buf);
        return;
      }
      if (assetMatch && method === 'PUT') {
        const abs = resolveAssetWritePath(assetMatch[1]);
        if (!abs) return sendJson(res, 400, { error: 'invalid asset path' });
        const body = await readBodyBytes(req, 64 * 1024 * 1024);
        writeFileAtomic(abs, body);
        return sendJson(res, 200, { ok: true, bytes: body.length });
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
          gameAspect?: string;
          gameOrientation?: string;
        };
        const patch: EditorStateFile = {};
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
        if (from !== to && fs.existsSync(dst)) return sendJson(res, 409, { error: 'exists' });
        let payload = fs.readFileSync(src, 'utf8');
        try {
          const data = JSON.parse(payload);
          data.name = to;
          payload = JSON.stringify(data, null, 2);
        } catch {
          /* keep raw */
        }
        fs.writeFileSync(dst, payload, 'utf8');
        if (from !== to) fs.unlinkSync(src);
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
          if (fs.existsSync(file)) fs.unlinkSync(file);
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
