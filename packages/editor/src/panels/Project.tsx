import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Bone,
  Box,
  FileCode2,
  FileJson2,
  Film,
  Folder,
  Image as ImageIcon,
  Layers3,
  Map as MapIcon,
  Music,
  Package,
  Palette,
  Upload,
  Workflow,
} from 'lucide-react';
import { listScenes, sceneFileName, type SceneMeta } from '../sceneLibrary';
import {
  listScripts,
  openScriptInIde,
  refreshScripts,
  type ScriptAsset,
} from '../scriptLibrary';
import {
  listAssetFolders,
  listSprites,
  refreshSprites,
  spriteAssetUrl,
  type SpriteAsset,
} from '../spriteLibrary';
import { pingProjectAsset, subscribePing } from '../pingBus';
import {
  listProjectFiles,
  refreshProjectFiles,
  toggleProjectAudioPreview,
  type ProjectFileAsset,
} from '../projectAssets';
import {
  formatAssetImportSummary,
  importProjectAssetFiles,
  importProjectAssetsFromPicker,
  setActiveAssetImportFolder,
} from '../assetImport';
import {
  findProjectAssetReferences,
  type AssetReferenceReport,
} from '../assetReferences';
import {
  applyProjectAssetDuplicate,
  applyProjectAssetRename,
  prepareProjectAssetDuplicate,
  prepareProjectAssetRename,
  type AssetDuplicatePlan,
  type AssetRenamePlan,
} from '../assetRename';
import { PROJECT_ASSETS_CHANGED_EVENT } from '../assetEditorEvents';

const STATIC_FOLDERS = [
  'Assets',
  'Assets/Scenes',
  'Assets/Animations',
  'Assets/Timelines',
  'Assets/Audio',
  'Assets/Prefabs',
  'Assets/Scripts',
  'Assets/Materials',
  'Assets/Shaders',
  'Assets/Models',
  'Assets/Sprites',
];

type AssetItem = {
  assetKey: string;
  assetPath?: string;
  folder: string;
  name: string;
  kind: 'animation' | 'animator-controller' | 'avatar-mask' | 'timeline' | 'audio' | 'model' | 'prefab' | 'script' | 'material' | 'shader' | 'scene' | 'sprite' | 'sprite-atlas' | 'texture' | 'spine';
  spawn: string | null;
  icon: ReactNode;
  sceneName?: string;
  script?: ScriptAsset;
  spriteId?: string;
  thumbUrl?: string | null;
  metaStatus?: ProjectFileAsset['metaStatus'];
  metaError?: string | null;
};

function projectAssetKey(
  asset: ProjectFileAsset | undefined,
  fallback: string,
  subresource = '',
): string {
  return asset?.metaStatus === 'ready' && asset.guid
    ? `guid:${asset.guid}${subresource}`
    : fallback;
}

export function Project(props: {
  activeScene: string | null;
  sceneTick: number;
  onInstantiatePrefab: (path: string) => void;
  onInstantiateModel: (path: string) => void;
  onInstantiateSprite: (path: string) => void;
  onOpenScene: (name: string) => void;
  onOpenMaterial: (path: string) => void;
  onOpenShader: (path: string) => void;
  onOpenAnimator: (path: string) => void;
  onOpenAnimation: (path: string) => void;
  onOpenTimeline: (path: string) => void;
  onOpenSprite: (path: string) => void;
  onOpenSpriteAtlas: (path: string) => void;
  onRenameScene: (oldName: string, newName: string) => boolean | Promise<boolean>;
  onDeleteScene: (name: string) => boolean | Promise<boolean>;
  onPrepareAssetTransaction: () => boolean | Promise<boolean>;
  onAssetRenamed: (sourcePath: string, destinationPath: string) => void;
  onLog?: (msg: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [folder, setFolder] = useState('Assets/Scenes');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [ctx, setCtx] = useState<{ x: number; y: number; asset: AssetItem } | null>(null);
  const [libTick, setLibTick] = useState(0);
  const [pingKey, setPingKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [referenceReport, setReferenceReport] = useState<{
    assetName: string;
    loading: boolean;
    report: AssetReferenceReport | null;
    error: string | null;
  } | null>(null);
  const [assetRename, setAssetRename] = useState<{
    asset: AssetItem;
    destinationPath: string;
    loading: boolean;
    applying: boolean;
    plan: AssetRenamePlan | null;
    manualConfirmed: boolean;
    error: string | null;
  } | null>(null);
  const [assetDuplicate, setAssetDuplicate] = useState<{
    asset: AssetItem;
    destinationPath: string;
    loading: boolean;
    applying: boolean;
    plan: AssetDuplicatePlan | null;
    manualConfirmed: boolean;
    error: string | null;
  } | null>(null);
  const lastClick = useRef<{ key: string; t: number }>({ key: '', t: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const referenceRequest = useRef(0);
  const renameRequest = useRef(0);
  const duplicateRequest = useRef(0);

  useEffect(() => {
    void Promise.all([refreshScripts(), refreshSprites(), refreshProjectFiles()])
      .then(() => setLibTick((t) => t + 1));
  }, [props.sceneTick]);

  useEffect(() => {
    setActiveAssetImportFolder(folder);
  }, [folder]);

  useEffect(() => {
    return subscribePing((e) => {
      if (e.kind !== 'asset') return;
      const sprites = listSprites();
      const files = listProjectFiles();
      const projectAsset = files.find((asset) => asset.id === e.assetId);
      const hit = sprites.find((s) => s.id === (e.spriteId ?? e.assetId));
      const hitTexturePath = hit ? (hit.textureId ?? hit.relPath).split('#', 1)[0] : null;
      const hitMetadata = hitTexturePath
        ? files.find((asset) => asset.relPath.toLocaleLowerCase() === hitTexturePath.toLocaleLowerCase())
        : undefined;
      if (hit) setFolder(hit.folder);
      else if (projectAsset) setFolder(projectAsset.folder);
      else if (e.folder) setFolder(e.folder);
      const key = hit
        ? projectAssetKey(
          hitMetadata,
          `sprite:${hit.id}`,
          hit.id.includes('#') ? `#${hit.id.slice(hit.id.indexOf('#') + 1)}` : '#base',
        )
        : projectAsset
          ? (projectAsset.kind === 'scene'
            ? projectAssetKey(projectAsset, `scene:${projectAsset.name.toLocaleLowerCase()}`)
            : projectAsset.kind === 'script'
              ? projectAssetKey(projectAsset, `path:${projectAsset.relPath.toLocaleLowerCase()}`)
              : projectAsset.metaStatus === 'ready' && projectAsset.guid
                ? `guid:${projectAsset.guid}`
                : `path:${projectAsset.relPath.toLocaleLowerCase()}`)
          : `path:${e.assetId.toLocaleLowerCase()}`;
      setSelected(key);
      setPingKey(key);
      window.setTimeout(() => setPingKey((cur) => (cur === key ? null : cur)), 900);
      requestAnimationFrame(() => {
        cardRefs.current.get(key)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }, []);

  const scenes: SceneMeta[] = useMemo(() => listScenes(), [props.sceneTick, props.activeScene]);
  const scripts = useMemo(() => listScripts(), [libTick, props.sceneTick]);
  const sprites = useMemo(() => listSprites(), [libTick, props.sceneTick]);
  const diskFolders = useMemo(() => listAssetFolders(), [libTick, props.sceneTick]);
  const projectFiles = useMemo(() => listProjectFiles(), [libTick, props.sceneTick]);
  const projectFilesByPath = useMemo(() => new Map(
    projectFiles.map((asset) => [asset.relPath.toLocaleLowerCase(), asset]),
  ), [projectFiles]);

  const folders = useMemo(() => {
    const set = new Set([
      ...STATIC_FOLDERS,
      ...diskFolders,
      ...projectFiles.map((asset) => asset.folder),
    ]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [diskFolders, projectFiles]);

  const sceneAssets: AssetItem[] = scenes.map((s) => {
    const name = sceneFileName(s.name);
    const metadata = projectFilesByPath.get(`assets/scenes/${name}`.toLocaleLowerCase());
    return {
      assetKey: projectAssetKey(metadata, `scene:${name.toLocaleLowerCase()}`),
      assetPath: `Assets/Scenes/${name}`,
      folder: 'Assets/Scenes',
      name,
      kind: 'scene',
      spawn: null,
      icon: <MapIcon size={24} strokeWidth={1.4} aria-hidden="true" />,
      sceneName: s.name,
      metaStatus: metadata?.metaStatus,
      metaError: metadata?.metaError,
    };
  });

  const scriptAssets: AssetItem[] = scripts.map((s) => {
    const metadata = s.id.startsWith('project/')
      ? projectFilesByPath.get(`${s.folder}/${s.name}`.toLocaleLowerCase())
      : undefined;
    const fallback = metadata
      ? `path:${metadata.relPath.toLocaleLowerCase()}`
      : `script:${s.id}`;
    return {
      assetKey: projectAssetKey(metadata, fallback),
      assetPath: s.id.startsWith('project/') ? `${s.folder}/${s.name}` : undefined,
      folder: s.folder,
      name: s.name,
      kind: 'script',
      spawn: null,
      icon: <FileCode2 size={24} strokeWidth={1.4} aria-hidden="true" />,
      script: s,
      metaStatus: metadata?.metaStatus,
      metaError: metadata?.metaError,
    };
  });

  const spriteAssets: AssetItem[] = sprites.map((s: SpriteAsset) => {
    const texturePath = (s.textureId ?? s.relPath).split('#', 1)[0];
    const metadata = projectFilesByPath.get(texturePath.toLocaleLowerCase());
    const marker = s.id.indexOf('#');
    const subresource = marker >= 0 ? `#${s.id.slice(marker + 1)}` : '#base';
    return {
      assetKey: projectAssetKey(metadata, `sprite:${s.id}`, subresource),
      assetPath: s.id,
      folder: s.folder,
      name: s.name,
      kind: 'sprite' as const,
      spawn: null,
      icon: <ImageIcon size={24} strokeWidth={1.4} aria-hidden="true" />,
      spriteId: s.id,
      thumbUrl: spriteAssetUrl(s.id),
      metaStatus: metadata?.metaStatus,
      metaError: metadata?.metaError,
    };
  });

  const spriteTexturePaths = new Set(
    sprites.map((sprite) => (sprite.textureId ?? sprite.relPath).toLowerCase()),
  );
  const authoringAssets: AssetItem[] = projectFiles
    .filter((asset) => !['scene', 'script', 'sprite-import'].includes(asset.kind))
    // Sprite textures already have richer cards. Keep every other recognized
    // texture visible even when the browser cannot decode it as a Sprite.
    .filter((asset) => asset.kind !== 'texture' || !spriteTexturePaths.has(asset.relPath.toLowerCase()))
    .map((asset: ProjectFileAsset) => {
    const kind: AssetItem['kind'] = asset.kind === 'animation'
      ? 'animation'
      : asset.kind === 'animator-controller'
        ? 'animator-controller'
      : asset.kind === 'avatar-mask'
        ? 'avatar-mask'
      : asset.kind === 'timeline'
        ? 'timeline'
      : asset.kind === 'sprite-atlas'
        ? 'sprite-atlas'
      : asset.kind === 'texture'
        ? 'texture'
      : asset.kind === 'audio'
        ? 'audio'
      : asset.kind === 'material'
        ? 'material'
        : asset.kind === 'shader'
          ? 'shader'
        : asset.kind === 'model'
          ? 'model'
        : asset.kind === 'prefab'
          ? 'prefab'
          : 'spine';
    return {
      assetKey: projectAssetKey(asset, `path:${asset.relPath.toLocaleLowerCase()}`),
      assetPath: asset.relPath,
      folder: asset.folder,
      name: asset.name,
      kind,
      spawn: null,
      icon: kind === 'texture'
        ? <ImageIcon size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'shader'
        ? <FileCode2 size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'animator-controller'
        ? <Workflow size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'avatar-mask'
        ? <Bone size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'timeline'
        ? <Film size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'sprite-atlas'
        ? <Layers3 size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'audio'
        ? <Music size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'animation'
        ? <Film size={24} strokeWidth={1.4} aria-hidden="true" />
        : kind === 'material'
          ? <Palette size={24} strokeWidth={1.4} aria-hidden="true" />
          : kind === 'model'
            ? <Box size={24} strokeWidth={1.4} aria-hidden="true" />
            : kind === 'prefab'
            ? <Package size={24} strokeWidth={1.4} aria-hidden="true" />
            : asset.kind === 'spine-atlas'
              ? <FileJson2 size={24} strokeWidth={1.4} aria-hidden="true" />
              : <Bone size={24} strokeWidth={1.4} aria-hidden="true" />,
      spriteId: asset.id,
      metaStatus: asset.metaStatus,
      metaError: asset.metaError,
    };
  });

  const allAssets: AssetItem[] = [
    ...sceneAssets,
    ...scriptAssets,
    ...spriteAssets,
    ...authoringAssets,
  ];
  const visible =
    folder === 'Assets'
      ? allAssets
      : allAssets.filter((a) => a.folder === folder);

  const beginRename = (sceneName: string) => {
    setEditing(sceneName);
    setEditValue(sceneName);
    setCtx(null);
  };

  const commitRename = () => {
    if (editing == null) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === editing) {
      setEditing(null);
      return;
    }
    const old = editing;
    setEditing(null);
    void Promise.resolve(props.onRenameScene(old, editValue)).then((ok) => {
      if (ok) {
        const base = trimmed.replace(/\.mscene$/i, '');
        const oldAsset = sceneAssets.find((asset) => asset.sceneName === old);
        setSelected(oldAsset?.metaStatus === 'ready'
          ? oldAsset.assetKey
          : `scene:${sceneFileName(base).toLocaleLowerCase()}`);
      }
    });
  };

  const requestDeleteScene = (name: string) => {
    setCtx(null);
    if (name === props.activeScene) {
      props.onLog?.('The active scene cannot be deleted. Open another scene first.', 'warn');
      return;
    }
    if (!window.confirm(`Delete ${sceneFileName(name)} permanently? This cannot be undone.`)) {
      return;
    }
    void Promise.resolve(props.onDeleteScene(name)).then((ok) => {
      if (ok) {
        const key = sceneAssets.find((asset) => asset.sceneName === name)?.assetKey
          ?? `scene:${sceneFileName(name).toLocaleLowerCase()}`;
        setSelected((current) => (current === key ? null : current));
      }
    });
  };

  const openScript = (a: AssetItem) => {
    if (!a.script) return;
    void openScriptInIde(a.script).then((ok) => {
      if (ok) props.onLog?.(`已在 IDE 打开 ${a.script!.name}`);
      else props.onLog?.(`无法打开 ${a.name}（请确认 cursor/code CLI 可用）`, 'warn');
    });
  };

  const onCardClick = (a: AssetItem, ev: MouseEvent) => {
    if (editing) return;
    setSelected(a.assetKey);

    if (a.kind === 'scene' && a.sceneName) {
      const now = Date.now();
      const key = a.name;
      const slow =
        lastClick.current.key === key &&
        now - lastClick.current.t > 250 &&
        now - lastClick.current.t < 700;
      lastClick.current = { key, t: now };
      if (slow) beginRename(a.sceneName);
      void ev;
    }
  };

  const onCardDoubleClick = (a: AssetItem) => {
    if (a.kind === 'scene' && a.sceneName) {
      props.onOpenScene(a.sceneName);
      return;
    }
    if (a.kind === 'script') {
      openScript(a);
      return;
    }
    if (a.kind === 'sprite' && a.spriteId) {
      props.onOpenSprite(a.spriteId);
      return;
    }
    if (a.kind === 'sprite-atlas' && a.spriteId) {
      props.onOpenSpriteAtlas(a.spriteId);
      return;
    }
    if (a.kind === 'material' && a.spriteId) {
      props.onOpenMaterial(a.spriteId);
      return;
    }
    if (a.kind === 'shader' && a.spriteId) {
      props.onOpenShader(a.spriteId);
      return;
    }
    if ((a.kind === 'animator-controller' || a.kind === 'avatar-mask') && a.spriteId) {
      props.onOpenAnimator(a.spriteId);
      return;
    }
    if (a.kind === 'animation' && a.spriteId) {
      props.onOpenAnimation(a.spriteId);
      return;
    }
    if (a.kind === 'timeline' && a.spriteId) {
      props.onOpenTimeline(a.spriteId);
      return;
    }
    if (a.kind === 'audio' && a.spriteId) {
      void toggleProjectAudioPreview(a.spriteId)
        .then((state) => props.onLog?.(`${state === 'playing' ? 'Previewing' : 'Stopped'} ${a.name}`))
        .catch((error) => props.onLog?.(`Audio preview failed: ${String(error)}`, 'error'));
      return;
    }
    if (a.kind === 'prefab' && a.spriteId) {
      props.onInstantiatePrefab(a.spriteId);
      return;
    }
    if (a.kind === 'model' && a.spriteId) {
      props.onInstantiateModel(a.spriteId);
      return;
    }
  };

  const onContext = (e: MouseEvent, a: AssetItem) => {
    e.preventDefault();
    if (!a.assetPath) return;
    setSelected(a.assetKey);
    setCtx({ x: e.clientX, y: e.clientY, asset: a });
  };

  const requestReferences = (asset: AssetItem) => {
    if (!asset.assetPath) return;
    const request = ++referenceRequest.current;
    setCtx(null);
    setReferenceReport({ assetName: asset.name, loading: true, report: null, error: null });
    void findProjectAssetReferences(asset.assetPath)
      .then((report) => {
        if (referenceRequest.current !== request) return;
        setReferenceReport({ assetName: asset.name, loading: false, report, error: null });
        props.onLog?.(
          `Found ${report.references.length} reference${report.references.length === 1 ? '' : 's'} to ${report.targetPath}`,
        );
      })
      .catch((error) => {
        if (referenceRequest.current !== request) return;
        const message = error instanceof Error ? error.message : String(error);
        setReferenceReport({ assetName: asset.name, loading: false, report: null, error: message });
        props.onLog?.(`Find References failed: ${message}`, 'error');
      });
  };

  const closeReferenceReport = () => {
    referenceRequest.current += 1;
    setReferenceReport(null);
  };

  const canRenameAsset = (asset: AssetItem): boolean => Boolean(
    asset.assetPath
    && !asset.assetPath.includes('#')
    && asset.kind !== 'scene'
    && asset.metaStatus === 'ready',
  );

  const requestAssetRename = (asset: AssetItem) => {
    if (!canRenameAsset(asset) || !asset.assetPath) return;
    renameRequest.current += 1;
    setCtx(null);
    setAssetRename({
      asset,
      destinationPath: asset.assetPath,
      loading: false,
      applying: false,
      plan: null,
      manualConfirmed: false,
      error: null,
    });
  };

  const closeAssetRename = () => {
    renameRequest.current += 1;
    setAssetRename(null);
  };

  const previewAssetRename = async () => {
    if (!assetRename?.asset.assetPath || assetRename.loading || assetRename.applying) return;
    const request = ++renameRequest.current;
    setAssetRename((current) => current && ({
      ...current,
      loading: true,
      plan: null,
      manualConfirmed: false,
      error: null,
    }));
    try {
      if (!await props.onPrepareAssetTransaction()) {
        if (renameRequest.current === request) {
          setAssetRename((current) => current && ({ ...current, loading: false }));
        }
        return;
      }
      const plan = await prepareProjectAssetRename(
        assetRename.asset.assetPath,
        assetRename.destinationPath,
      );
      if (renameRequest.current !== request) return;
      setAssetRename((current) => current && ({ ...current, loading: false, plan }));
    } catch (error) {
      if (renameRequest.current !== request) return;
      setAssetRename((current) => current && ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const commitAssetRename = async () => {
    const state = assetRename;
    if (!state?.plan || state.loading || state.applying) return;
    if (state.plan.manualReferences.length > 0 && !state.manualConfirmed) return;
    const request = ++renameRequest.current;
    setAssetRename((current) => current && ({ ...current, applying: true, error: null }));
    try {
      if (!await props.onPrepareAssetTransaction()) {
        if (renameRequest.current === request) {
          setAssetRename((current) => current && ({ ...current, applying: false }));
        }
        return;
      }
      const result = await applyProjectAssetRename(state.plan);
      if (renameRequest.current !== request) return;
      props.onAssetRenamed(result.sourcePath, result.destinationPath);
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, { detail: result }));
      setSelected(state.asset.assetKey);
      setLibTick((tick) => tick + 1);
      props.onLog?.(
        `Renamed ${result.sourcePath} to ${result.destinationPath}; updated ${result.updatedPaths.length} dependent file${result.updatedPaths.length === 1 ? '' : 's'}.`,
      );
      closeAssetRename();
    } catch (error) {
      if (renameRequest.current !== request) return;
      const message = error instanceof Error ? error.message : String(error);
      setAssetRename((current) => current && ({ ...current, applying: false, error: message }));
      props.onLog?.(`Asset rename failed: ${message}`, 'error');
    }
  };

  const defaultDuplicatePath = (assetPath: string): string => {
    const marker = assetPath.lastIndexOf('/');
    const folderPath = marker >= 0 ? assetPath.slice(0, marker + 1) : '';
    const file = marker >= 0 ? assetPath.slice(marker + 1) : assetPath;
    const dot = file.lastIndexOf('.');
    const stem = dot > 0 ? file.slice(0, dot) : file;
    const extension = dot > 0 ? file.slice(dot) : '';
    const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLocaleLowerCase()));
    for (let suffix = 1; suffix < 10_000; suffix += 1) {
      const label = suffix === 1 ? ' Copy' : ` Copy ${suffix}`;
      const candidate = `${folderPath}${stem}${label}${extension}`;
      if (!used.has(candidate.toLocaleLowerCase())) return candidate;
    }
    return `${folderPath}${stem} Copy ${crypto.randomUUID().slice(0, 8)}${extension}`;
  };

  const requestAssetDuplicate = (asset: AssetItem) => {
    if (!canRenameAsset(asset) || !asset.assetPath) return;
    duplicateRequest.current += 1;
    setCtx(null);
    setAssetDuplicate({
      asset,
      destinationPath: defaultDuplicatePath(asset.assetPath),
      loading: false,
      applying: false,
      plan: null,
      manualConfirmed: false,
      error: null,
    });
  };

  const closeAssetDuplicate = () => {
    duplicateRequest.current += 1;
    setAssetDuplicate(null);
  };

  const previewAssetDuplicate = async () => {
    if (!assetDuplicate?.asset.assetPath || assetDuplicate.loading || assetDuplicate.applying) return;
    const request = ++duplicateRequest.current;
    setAssetDuplicate((current) => current && ({
      ...current,
      loading: true,
      plan: null,
      manualConfirmed: false,
      error: null,
    }));
    try {
      if (!await props.onPrepareAssetTransaction()) {
        if (duplicateRequest.current === request) {
          setAssetDuplicate((current) => current && ({ ...current, loading: false }));
        }
        return;
      }
      const plan = await prepareProjectAssetDuplicate(
        assetDuplicate.asset.assetPath,
        assetDuplicate.destinationPath,
      );
      if (duplicateRequest.current !== request) return;
      setAssetDuplicate((current) => current && ({ ...current, loading: false, plan }));
    } catch (error) {
      if (duplicateRequest.current !== request) return;
      setAssetDuplicate((current) => current && ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const commitAssetDuplicate = async () => {
    const state = assetDuplicate;
    if (!state?.plan || state.loading || state.applying) return;
    if (state.plan.manualReferences.length > 0 && !state.manualConfirmed) return;
    const request = ++duplicateRequest.current;
    setAssetDuplicate((current) => current && ({ ...current, applying: true, error: null }));
    try {
      if (!await props.onPrepareAssetTransaction()) {
        if (duplicateRequest.current === request) {
          setAssetDuplicate((current) => current && ({ ...current, applying: false }));
        }
        return;
      }
      const result = await applyProjectAssetDuplicate(state.plan);
      if (duplicateRequest.current !== request) return;
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, { detail: result }));
      setLibTick((tick) => tick + 1);
      props.onLog?.(`Duplicated ${result.sourcePath} to ${result.destinationPath} with new GUID ${result.guid}.`);
      closeAssetDuplicate();
      pingProjectAsset(result.destinationPath);
    } catch (error) {
      if (duplicateRequest.current !== request) return;
      const message = error instanceof Error ? error.message : String(error);
      setAssetDuplicate((current) => current && ({ ...current, applying: false, error: message }));
      props.onLog?.(`Asset duplicate failed: ${message}`, 'error');
    }
  };

  const completeImport = async (files?: Iterable<File>) => {
    if (importing) return;
    setImporting(true);
    try {
      const result = files
        ? await importProjectAssetFiles(files, folder)
        : await importProjectAssetsFromPicker(folder);
      const summary = formatAssetImportSummary(result, folder);
      if (summary) {
        props.onLog?.(summary, result.rejected.length > 0 ? 'warn' : 'info');
      }
      if (result.imported.length > 0) setLibTick((tick) => tick + 1);
    } catch (error) {
      props.onLog?.(
        `Asset import failed: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setImporting(false);
      setDraggingFiles(false);
    }
  };

  const onFileDrop = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.files.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    void completeImport(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="project-layout" ref={rootRef} tabIndex={0}>
      <div className="project-tree">
        {folders.map((f) => (
          <div
            key={f}
            className={`row${folder === f ? ' active' : ''}`}
            onClick={() => setFolder(f)}
          >
            <Folder size={13} strokeWidth={1.6} aria-hidden="true" />
            <span>{f.replace('Assets/', '') || 'Assets'}</span>
          </div>
        ))}
      </div>
      <div className="project-content">
        <div className="project-toolbar">
          <button
            type="button"
            className="project-import-button"
            disabled={importing}
            onClick={() => void completeImport()}
          >
            <Upload size={13} aria-hidden="true" />
            {importing ? 'Importing...' : 'Import'}
          </button>
          <span className="project-folder-path" title={folder}>{folder}</span>
        </div>
        <div
          className={`project-grid${draggingFiles ? ' file-drop-active' : ''}`}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes('Files')) setDraggingFiles(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDraggingFiles(false);
            }
          }}
          onDrop={onFileDrop}
        >
          {visible.length === 0 && folder === 'Assets/Scenes' && (
            <div className="project-empty">
              No scenes yet. Create one from File &gt; New Scene.
            </div>
          )}
          {visible.length === 0 && folder === 'Assets/Scripts' && (
            <div className="project-empty">
              No scripts yet. Create a Behaviour under Assets/Scripts.
            </div>
          )}
          {visible.length === 0 && folder !== 'Assets/Scenes' && folder !== 'Assets/Scripts' && (
            <div className="project-empty">
              Drop supported files here or use Import. Existing files are kept; name collisions receive a numeric suffix.
            </div>
          )}
          {visible.map((a) => {
          const isActiveScene = a.kind === 'scene' && a.sceneName === props.activeScene;
          const isEditing = a.kind === 'scene' && a.sceneName != null && editing === a.sceneName;
          return (
            <div
              key={a.assetKey}
              ref={(el) => {
                if (el) cardRefs.current.set(a.assetKey, el);
                else cardRefs.current.delete(a.assetKey);
              }}
              className={[
                'asset-card',
                selected === a.assetKey ? 'selected' : '',
                isActiveScene ? 'active-scene' : '',
                pingKey === a.assetKey ? 'ping' : '',
                a.metaStatus === 'invalid' || a.metaStatus === 'duplicate' ? 'metadata-problem' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="button"
              tabIndex={0}
              aria-label={`${a.name} (${a.kind})`}
              draggable={
                a.kind === 'sprite'
                || a.kind === 'spine'
                || a.kind === 'animation'
                || a.kind === 'animator-controller'
                || a.kind === 'avatar-mask'
                || a.kind === 'timeline'
                || a.kind === 'sprite-atlas'
                || a.kind === 'texture'
                || a.kind === 'audio'
                || a.kind === 'material'
                || a.kind === 'shader'
                || a.kind === 'model'
                || a.kind === 'prefab'
              }
              onDragStart={(e) => {
                if (
                  a.kind !== 'sprite'
                  && a.kind !== 'spine'
                  && a.kind !== 'animation'
                  && a.kind !== 'animator-controller'
                  && a.kind !== 'avatar-mask'
                  && a.kind !== 'timeline'
                  && a.kind !== 'sprite-atlas'
                  && a.kind !== 'texture'
                  && a.kind !== 'audio'
                  && a.kind !== 'material'
                  && a.kind !== 'shader'
                  && a.kind !== 'model'
                  && a.kind !== 'prefab'
                ) return;
                const id = a.spriteId ?? a.name;
                if (a.kind === 'sprite') e.dataTransfer.setData('text/mengine-sprite', id);
                if (a.kind === 'prefab') e.dataTransfer.setData('text/mengine-prefab', id);
                e.dataTransfer.setData('text/mengine-asset', id);
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={(e) => onCardClick(a, e)}
              onDoubleClick={() => onCardDoubleClick(a)}
              onKeyDown={(event) => {
                if (event.key === 'F2') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (a.kind === 'scene' && a.sceneName) beginRename(a.sceneName);
                  else requestAssetRename(a);
                  return;
                }
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (a.kind === 'scene' && a.sceneName) requestDeleteScene(a.sceneName);
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  onCardDoubleClick(a);
                }
              }}
              onContextMenu={(e) => onContext(e, a)}
              title={
                a.kind === 'scene'
                  ? '双击打开 · F2 / 慢双击重命名 · Delete 删除'
                  : a.kind === 'script'
                    ? '双击在 IDE 中打开'
                    : a.kind === 'sprite'
                      ? `拖到 Scene/Hierarchy 创建 SpriteRenderer · 双击编辑 · ${a.spriteId}`
                      : a.kind === 'spine'
                        ? `拖到 Spine Skeleton 资源字段 · ${a.spriteId}`
                        : a.kind === 'animation'
                          ? `Animation Clip · ${a.spriteId}`
                          : a.kind === 'sprite-atlas'
                            ? `Sprite Atlas - double-click to edit - ${a.spriteId}`
                          : a.kind === 'texture'
                            ? `Environment Texture - drag to Environment Light - ${a.spriteId}`
                          : a.kind === 'animator-controller'
                            ? `Animator Controller · ${a.spriteId}`
                          : a.kind === 'avatar-mask'
                            ? `Avatar Mask - double-click to edit - ${a.spriteId}`
                          : a.kind === 'timeline'
                            ? `Timeline Sequencer - double-click to edit - ${a.spriteId}`
                          : a.kind === 'material'
                            ? `Material Asset · ${a.spriteId}`
                            : a.kind === 'model'
                              ? `3D Model · double-click to instantiate · ${a.spriteId}`
                              : a.kind === 'prefab'
                              ? `Prefab Asset · ${a.spriteId}`
                              : a.spawn
                                ? '双击实例化'
                                : a.name
              }
            >
              <div className="asset-thumb">
                {a.thumbUrl ? (
                  <img src={a.thumbUrl} alt="" draggable={false} />
                ) : (
                  a.icon
                )}
              </div>
              {isEditing ? (
                <input
                  className="asset-rename"
                  autoFocus
                  value={editValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <div className="asset-name">{a.name}</div>
              )}
              {isActiveScene && !isEditing && <div className="asset-badge">打开中</div>}
              {(a.metaStatus === 'invalid' || a.metaStatus === 'duplicate') && (
                <div className="asset-meta-badge" title={a.metaError ?? 'Asset metadata needs repair'}>
                  META
                </div>
              )}
            </div>
          );
          })}
          {draggingFiles && (
            <div className="project-drop-overlay" aria-hidden="true">
              Drop to import into {folder}
            </div>
          )}
        </div>
      </div>

      {ctx &&
        createPortal(
          <div
            className="hier-ctx"
            style={{ left: ctx.x, top: ctx.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {ctx.asset.kind === 'sprite' && ctx.asset.spriteId && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onInstantiateSprite(ctx.asset.spriteId!);
                    setCtx(null);
                  }}
                >
                  Create Sprite in Scene
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onOpenSprite(ctx.asset.spriteId!);
                    setCtx(null);
                  }}
                >
                  Open Sprite Editor
                </button>
              </>
            )}
            {ctx.asset.kind === 'scene' && ctx.asset.sceneName && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onOpenScene(ctx.asset.sceneName!);
                    setCtx(null);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    beginRename(ctx.asset.sceneName!);
                  }}
                >
                  Rename <span className="hint">F2</span>
                </button>
                <button
                  type="button"
                  disabled={ctx.asset.sceneName === props.activeScene}
                  title={ctx.asset.sceneName === props.activeScene
                    ? 'Open another scene before deleting the active scene'
                    : 'Delete scene permanently'}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestDeleteScene(ctx.asset.sceneName!);
                  }}
                >
                  Delete <span className="hint">Del</span>
                </button>
              </>
            )}
            {canRenameAsset(ctx.asset) && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestAssetRename(ctx.asset);
                  }}
                >
                  Rename / Move <span className="hint">F2</span>
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    requestAssetDuplicate(ctx.asset);
                  }}
                >
                  Duplicate
                </button>
              </>
            )}
            {ctx.asset.assetPath && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  requestReferences(ctx.asset);
                }}
              >
                Find References
              </button>
            )}
            <div className="sep" />
            <button type="button" onPointerDown={() => setCtx(null)}>
              Cancel
            </button>
          </div>,
          document.body,
        )}
      {referenceReport && createPortal(
        <div
          className="asset-reference-backdrop"
          role="presentation"
          onPointerDown={closeReferenceReport}
        >
          <section
            className="asset-reference-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-reference-title"
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeReferenceReport();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong id="asset-reference-title">References to {referenceReport.assetName}</strong>
                <span>{referenceReport.report?.targetPath ?? 'Scanning project assets...'}</span>
              </div>
              <button
                type="button"
                aria-label="Close asset references"
                autoFocus
                onClick={closeReferenceReport}
              >
                ×
              </button>
            </header>
            <div className="asset-reference-summary">
              {referenceReport.loading && 'Scanning text assets in batches...'}
              {referenceReport.error && `Failed: ${referenceReport.error}`}
              {referenceReport.report && (
                <>
                  {referenceReport.report.references.length}{referenceReport.report.truncated ? '+' : ''} references · {' '}
                  {referenceReport.report.scannedFiles} files scanned · {' '}
                  {referenceReport.report.skippedFiles} binary, oversized, or unreadable files skipped
                  {referenceReport.report.truncated && ' · result limit reached'}
                </>
              )}
            </div>
            <div className="asset-reference-list">
              {referenceReport.report?.references.map((reference, index) => (
                <button
                  type="button"
                  className="asset-reference-row"
                  key={`${reference.sourcePath}:${reference.location}:${index}`}
                  title={`Select ${reference.sourcePath} in Project`}
                  onClick={() => {
                    pingProjectAsset(reference.sourcePath);
                    closeReferenceReport();
                  }}
                >
                  <div>
                    <strong>{reference.sourcePath}</strong>
                    <span>{reference.location} · {reference.kind}</span>
                  </div>
                  <code title={reference.snippet}>{reference.snippet}</code>
                </button>
              ))}
              {referenceReport.report && referenceReport.report.references.length === 0 && (
                <div className="asset-reference-empty">
                  No serialized or text references found. Dynamic script paths and external binary formats may still reference this asset.
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body,
      )}
      {assetRename && createPortal(
        <div
          className="asset-reference-backdrop"
          role="presentation"
          onPointerDown={() => {
            if (!assetRename.applying) closeAssetRename();
          }}
        >
          <section
            className="asset-reference-dialog asset-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-rename-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !assetRename.applying) closeAssetRename();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong id="asset-rename-title">Rename / Move Asset</strong>
                <span>{assetRename.asset.assetPath}</span>
              </div>
              <button
                type="button"
                aria-label="Close asset rename"
                disabled={assetRename.applying}
                onClick={closeAssetRename}
              >×</button>
            </header>
            <div className="asset-rename-form">
              <label htmlFor="asset-rename-destination">Destination path</label>
              <input
                id="asset-rename-destination"
                autoFocus
                spellCheck={false}
                value={assetRename.destinationPath}
                disabled={assetRename.loading || assetRename.applying}
                onChange={(event) => setAssetRename((current) => current && ({
                  ...current,
                  destinationPath: event.target.value,
                  plan: null,
                  manualConfirmed: false,
                  error: null,
                }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !assetRename.plan) {
                    event.preventDefault();
                    void previewAssetRename();
                  }
                }}
              />
              <span>Use a project-relative file path under Assets. The extension must stay unchanged.</span>
            </div>
            {assetRename.loading && (
              <div className="asset-reference-summary">Saving open documents and building a revision-locked migration preview...</div>
            )}
            {assetRename.error && (
              <div className="asset-reference-summary asset-rename-error">{assetRename.error}</div>
            )}
            {assetRename.plan && (
              <div className="asset-rename-plan">
                <div className="asset-reference-summary">
                  {assetRename.plan.automaticUpdates.length} files update automatically · {' '}
                  {assetRename.plan.manualReferences.length} manual references · {' '}
                  {assetRename.plan.scannedFiles} scanned · {assetRename.plan.skippedFiles} skipped · {' '}
                  {(assetRename.plan.updateBytes / 1024).toFixed(1)} KiB staged
                </div>
                <div className="asset-rename-section">
                  <strong>Automatic transaction</strong>
                  <span>The asset, stable metadata, Sprite Import sidecar, project manifest and these serialized references commit together.</span>
                  <div className="asset-rename-files">
                    {assetRename.plan.automaticUpdates.length === 0 && <em>No serialized files need content changes.</em>}
                    {assetRename.plan.automaticUpdates.map((update) => (
                      <code key={update.sourcePath}>{update.sourcePath}</code>
                    ))}
                  </div>
                </div>
                {assetRename.plan.manualReferences.length > 0 && (
                  <div className="asset-rename-section asset-rename-manual">
                    <strong>Manual review required</strong>
                    <span>Scripts, shaders, or invalid JSON are never replaced blindly. Open each result and update it manually after the rename.</span>
                    <div className="asset-reference-list">
                      {assetRename.plan.manualReferences.map((reference, index) => (
                        <button
                          type="button"
                          className="asset-reference-row"
                          key={`${reference.sourcePath}:${reference.location}:${index}`}
                          onClick={() => pingProjectAsset(reference.sourcePath)}
                        >
                          <div>
                            <strong>{reference.sourcePath}</strong>
                            <span>{reference.location}</span>
                          </div>
                          <code title={reference.snippet}>{reference.snippet}</code>
                        </button>
                      ))}
                    </div>
                    <label className="asset-rename-confirm">
                      <input
                        type="checkbox"
                        checked={assetRename.manualConfirmed}
                        onChange={(event) => setAssetRename((current) => current && ({
                          ...current,
                          manualConfirmed: event.target.checked,
                        }))}
                      />
                      I reviewed these references and will repair them manually.
                    </label>
                  </div>
                )}
              </div>
            )}
            <footer className="asset-rename-actions">
              <button type="button" disabled={assetRename.applying} onClick={closeAssetRename}>Cancel</button>
              {!assetRename.plan ? (
                <button
                  type="button"
                  className="primary"
                  disabled={assetRename.loading || assetRename.applying}
                  onClick={() => void previewAssetRename()}
                >
                  {assetRename.loading ? 'Preparing...' : 'Save All & Preview'}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary danger"
                  disabled={
                    assetRename.applying
                    || (assetRename.plan.manualReferences.length > 0 && !assetRename.manualConfirmed)
                  }
                  onClick={() => void commitAssetRename()}
                >
                  {assetRename.applying ? 'Committing...' : 'Commit Rename'}
                </button>
              )}
            </footer>
          </section>
        </div>,
        document.body,
      )}
      {assetDuplicate && createPortal(
        <div
          className="asset-reference-backdrop"
          role="presentation"
          onPointerDown={() => {
            if (!assetDuplicate.applying) closeAssetDuplicate();
          }}
        >
          <section
            className="asset-reference-dialog asset-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-duplicate-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !assetDuplicate.applying) closeAssetDuplicate();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong id="asset-duplicate-title">Duplicate Asset</strong>
                <span>{assetDuplicate.asset.assetPath}</span>
              </div>
              <button
                type="button"
                aria-label="Close asset duplicate"
                disabled={assetDuplicate.applying}
                onClick={closeAssetDuplicate}
              >×</button>
            </header>
            <div className="asset-rename-form">
              <label htmlFor="asset-duplicate-destination">Duplicate path</label>
              <input
                id="asset-duplicate-destination"
                autoFocus
                spellCheck={false}
                value={assetDuplicate.destinationPath}
                disabled={assetDuplicate.loading || assetDuplicate.applying}
                onChange={(event) => setAssetDuplicate((current) => current && ({
                  ...current,
                  destinationPath: event.target.value,
                  plan: null,
                  manualConfirmed: false,
                  error: null,
                }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !assetDuplicate.plan) {
                    event.preventDefault();
                    void previewAssetDuplicate();
                  }
                }}
              />
              <span>The duplicate keeps importer settings but receives a new stable GUID. The extension cannot change.</span>
            </div>
            {assetDuplicate.loading && (
              <div className="asset-reference-summary">Saving open documents and preparing a revision-locked copy...</div>
            )}
            {assetDuplicate.error && (
              <div className="asset-reference-summary asset-rename-error">{assetDuplicate.error}</div>
            )}
            {assetDuplicate.plan && (
              <div className="asset-rename-plan">
                <div className="asset-reference-summary">
                  {(assetDuplicate.plan.copiedBytes / 1024).toFixed(1)} KiB asset · new GUID · {' '}
                  {assetDuplicate.plan.manualReferences.length} manual checks
                </div>
                <div className="asset-rename-section">
                  <strong>Copy transaction</strong>
                  <span>
                    Source bytes, importer metadata and Sprite Import settings are staged before no-overwrite installation.
                    Existing inbound references remain on the original asset.
                  </span>
                  <div className="asset-rename-files">
                    <code>{assetDuplicate.plan.destinationPath}</code>
                    <code>{assetDuplicate.plan.destinationPath}.meta (new GUID)</code>
                  </div>
                </div>
                {assetDuplicate.plan.manualReferences.length > 0 && (
                  <div className="asset-rename-section asset-rename-manual">
                    <strong>Relative script imports need review</strong>
                    <span>Cross-directory script copies are not rewritten without a TypeScript language service.</span>
                    <div className="asset-reference-list">
                      {assetDuplicate.plan.manualReferences.map((reference, index) => (
                        <button
                          type="button"
                          className="asset-reference-row"
                          key={`${reference.sourcePath}:${reference.location}:${index}`}
                          onClick={() => pingProjectAsset(reference.sourcePath)}
                        >
                          <div>
                            <strong>{reference.sourcePath}</strong>
                            <span>{reference.location}</span>
                          </div>
                          <code>{reference.snippet}</code>
                        </button>
                      ))}
                    </div>
                    <label className="asset-rename-confirm">
                      <input
                        type="checkbox"
                        checked={assetDuplicate.manualConfirmed}
                        onChange={(event) => setAssetDuplicate((current) => current && ({
                          ...current,
                          manualConfirmed: event.target.checked,
                        }))}
                      />
                      I reviewed these imports and will repair the duplicate manually.
                    </label>
                  </div>
                )}
              </div>
            )}
            <footer className="asset-rename-actions">
              <button type="button" disabled={assetDuplicate.applying} onClick={closeAssetDuplicate}>Cancel</button>
              {!assetDuplicate.plan ? (
                <button
                  type="button"
                  className="primary"
                  disabled={assetDuplicate.loading || assetDuplicate.applying}
                  onClick={() => void previewAssetDuplicate()}
                >
                  {assetDuplicate.loading ? 'Preparing...' : 'Save All & Preview'}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={
                    assetDuplicate.applying
                    || (assetDuplicate.plan.manualReferences.length > 0 && !assetDuplicate.manualConfirmed)
                  }
                  onClick={() => void commitAssetDuplicate()}
                >
                  {assetDuplicate.applying ? 'Duplicating...' : 'Commit Duplicate'}
                </button>
              )}
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
