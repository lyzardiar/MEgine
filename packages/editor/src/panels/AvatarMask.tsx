import { useEffect, useRef, useState } from 'react';
import {
  createAvatarMask,
  parseAvatarMask,
  parseAvatarMaskDraft,
  serializeAvatarMask,
  validateAvatarMask,
  type AvatarMaskAsset,
} from '../avatarMask';
import { registerMenuItem } from '../editorWindow';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import { PROJECT_ASSETS_CHANGED_EVENT } from './Material';

function uniqueAvatarMaskPath(): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = 'Assets/Animations/New Avatar Mask.mavatar';
  while (used.has(path.toLowerCase())) {
    index += 1;
    path = `Assets/Animations/New Avatar Mask ${index}.mavatar`;
  }
  return path;
}

export async function createProjectAvatarMask(): Promise<string> {
  await refreshProjectFiles();
  const path = uniqueAvatarMaskPath();
  const name = path.split('/').pop()!.replace(/\.mavatar$/i, '');
  await writeProjectAssetText(path, serializeAvatarMask(createAvatarMask(name)));
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  window.dispatchEvent(new CustomEvent('mengine:open-animator', { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'animator' }));
  return path;
}

registerMenuItem(
  'Assets/Create/Avatar Mask',
  async (context) => {
    try {
      context.log(`Created ${await createProjectAvatarMask()}`);
    } catch (reason) {
      context.log(`Avatar Mask 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 211 },
);

function fingerprint(mask: AvatarMaskAsset | null): string {
  return mask ? JSON.stringify(mask) : '';
}

export function AvatarMaskEditor(props: {
  assetPath: string | null;
  onOpenAsset: (path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [mask, setMask] = useState<AvatarMaskAsset | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { mask: AvatarMaskAsset; savedFingerprint: string }>());

  useEffect(() => {
    let cancelled = false;
    const previousPath = loadedPath.current;
    if (previousPath && mask) {
      if (fingerprint(mask) !== savedFingerprint) {
        drafts.current.set(previousPath, { mask: structuredClone(mask), savedFingerprint });
      } else {
        drafts.current.delete(previousPath);
      }
    }
    loadedPath.current = props.assetPath;
    setMask(null);
    setSavedFingerprint('');
    setError(null);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      setMask(structuredClone(draft.mask));
      setSavedFingerprint(draft.savedFingerprint);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseAvatarMaskDraft(text);
        setMask(parsed);
        setSavedFingerprint(fingerprint(parsed));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const dirty = mask != null && fingerprint(mask) !== savedFingerprint;
  const anyDirty = dirty || drafts.current.size > 0;
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);

  const update = (mutate: (draft: AvatarMaskAsset) => void) => {
    setMask((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const writeMask = async (path: string, value: AvatarMaskAsset) => {
    validateAvatarMask(value);
    await writeProjectAssetText(path, serializeAvatarMask(value));
  };

  const save = async (): Promise<boolean> => {
    if (!mask || !props.assetPath) return false;
    setSaving(true);
    setError(null);
    try {
      await writeMask(props.assetPath, mask);
      const normalized = parseAvatarMask(serializeAvatarMask(mask));
      drafts.current.delete(props.assetPath);
      setMask(normalized);
      setSavedFingerprint(fingerprint(normalized));
      await refreshProjectFiles();
      props.onAssetsChanged();
      props.onLog(`Saved ${props.assetPath}`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Avatar Mask 保存失败：${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    if (dirty && !await save()) throw new Error('Current Avatar Mask could not be saved');
    const failures: string[] = [];
    for (const [path, draft] of [...drafts.current]) {
      try {
        await writeMask(path, draft.mask);
        drafts.current.delete(path);
        props.onLog(`Saved ${path}`);
      } catch (reason) {
        failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    }
    await refreshProjectFiles();
    props.onAssetsChanged();
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Avatar Masks', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, dirty, mask, props.assetPath, saving]);

  const createNew = async () => {
    try {
      const path = await createProjectAvatarMask();
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(`Avatar Mask 创建失败：${reason instanceof Error ? reason.message : String(reason)}`, 'error');
    }
  };

  if (!props.assetPath || !mask) {
    return (
      <div className="material-empty">
        <strong>{loading ? 'Loading Avatar Mask…' : 'Avatar Mask'}</strong>
        <span>{error ?? '双击 Project 中的 .mavatar，或创建新的 Avatar Mask。'}</span>
        <button type="button" onClick={() => void createNew()}>Create Avatar Mask</button>
      </div>
    );
  }

  return (
    <div className="animator-editor avatar-mask-editor">
      <div className="material-toolbar">
        <strong title={props.assetPath}>{mask.name || 'Avatar Mask'}{dirty ? ' *' : ''}</strong>
        <span className="spacer" />
        <button type="button" onClick={() => void createNew()}>New</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="field-hint field-error">{error}</div>}
      <div className="animator-scroll">
        <section className="animator-section">
          <h3>Reusable Avatar Mask</h3>
          <label>Name <input value={mask.name} onChange={(event) => update((draft) => { draft.name = event.target.value; })} /></label>
          <div className="field-hint">
            Paths are relative to the Animator root. A path includes its descendants; an empty list or * includes every target, while . includes only the root.
          </div>
        </section>
        <section className="animator-section">
          <div className="animator-heading">
            <h3>Included Target Paths</h3>
            <button type="button" onClick={() => update((draft) => { draft.paths.push('Rig/Spine'); })}>+ Path</button>
          </div>
          {mask.paths.length === 0 && <div className="field-hint">All animation targets are included.</div>}
          {mask.paths.map((path, index) => (
            <div className="animator-row" key={index}>
              <input
                aria-label={`Avatar Mask path ${index + 1}`}
                value={path}
                onChange={(event) => update((draft) => { draft.paths[index] = event.target.value; })}
              />
              <button type="button" title="Delete path" onClick={() => update((draft) => { draft.paths.splice(index, 1); })}>×</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
