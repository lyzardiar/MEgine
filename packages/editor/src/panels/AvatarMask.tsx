import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import {
  createAvatarMask,
  parseAvatarMask,
  parseAvatarMaskDraft,
  serializeAvatarMask,
  validateAvatarMask,
  type AvatarMaskAsset,
} from '../avatarMask';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import type {
  EditorUndoCheckpoint,
  EditorUndoService,
  EditorUndoToken,
} from '../editorUndoService';
import {
  openAnimatorAsset,
  PROJECT_ASSETS_CHANGED_EVENT,
} from '../assetEditorEvents';

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
  openAnimatorAsset(path);
  return path;
}

function fingerprint(mask: AvatarMaskAsset | null): string {
  return mask ? JSON.stringify(mask) : '';
}

type AvatarMaskDraft = {
  mask: AvatarMaskAsset;
  savedFingerprint: string;
};

type AvatarMaskEditTransaction = {
  mask: AvatarMaskAsset;
  checkpoint: EditorUndoCheckpoint;
  token: EditorUndoToken | null;
  label: string;
};

function avatarMaskDraftDirty(draft: AvatarMaskDraft): boolean {
  return fingerprint(draft.mask) !== draft.savedFingerprint;
}

function isAvatarMaskEditControl(target: EventTarget): target is HTMLInputElement | HTMLTextAreaElement {
  return target instanceof HTMLTextAreaElement
    || (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(target.type));
}

function avatarMaskControlLabel(target: HTMLInputElement | HTMLTextAreaElement): string {
  const explicit = target.getAttribute('aria-label')?.trim();
  if (explicit) return `Edit ${explicit}`;
  return 'Rename Avatar Mask';
}

export function AvatarMaskEditor(props: {
  assetPath: string | null;
  onOpenAsset: (path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  undoService: EditorUndoService;
  onGlobalUndo: () => void;
  onGlobalRedo: () => void;
}) {
  const [mask, setMaskState] = useState<AvatarMaskAsset | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, AvatarMaskDraft>());
  const [, setDraftEpoch] = useState(0);
  const maskRef = useRef<AvatarMaskAsset | null>(null);
  const editTransaction = useRef<AvatarMaskEditTransaction | null>(null);
  maskRef.current = mask;

  const replaceMask = (next: AvatarMaskAsset | null) => {
    maskRef.current = next;
    setMaskState(next);
  };

  const captureDocument = (path: string): AvatarMaskAsset => {
    if (loadedPath.current === path && maskRef.current) return structuredClone(maskRef.current);
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Avatar Mask history document '${path}' is no longer available.`);
    return structuredClone(draft.mask);
  };

  const restoreDocument = (path: string, snapshot: AvatarMaskAsset) => {
    const restored = structuredClone(snapshot);
    if (loadedPath.current === path) {
      editTransaction.current = null;
      replaceMask(restored);
      setError(null);
      return;
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Avatar Mask history document '${path}' is no longer available.`);
    drafts.current.set(path, { ...draft, mask: restored });
    setDraftEpoch((value) => value + 1);
  };

  const recordHistory = (snapshot: AvatarMaskAsset, label: string): EditorUndoToken | null => {
    const path = loadedPath.current;
    if (!path) return null;
    return props.undoService.recordSnapshot({
      scope: `avatar-mask:${path}`,
      label,
      state: structuredClone(snapshot),
      capture: () => captureDocument(path),
      restore: (state) => restoreDocument(path, state),
    });
  };

  const beginEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (editTransaction.current || !mask || !isAvatarMaskEditControl(event.target)) return;
    editTransaction.current = {
      mask: structuredClone(mask),
      checkpoint: props.undoService.checkpoint(),
      token: null,
      label: avatarMaskControlLabel(event.target),
    };
  };

  const endEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!isAvatarMaskEditControl(event.target)) return;
    const transaction = editTransaction.current;
    editTransaction.current = null;
    if (
      !transaction?.token
      || !maskRef.current
      || !props.undoService.isUndoTop(transaction.token)
      || fingerprint(maskRef.current) !== fingerprint(transaction.mask)
    ) return;
    props.undoService.restoreCheckpoint(transaction.checkpoint);
  };

  useEffect(() => {
    let cancelled = false;
    const transaction = editTransaction.current;
    if (
      transaction?.token
      && mask
      && props.undoService.isUndoTop(transaction.token)
      && fingerprint(mask) === fingerprint(transaction.mask)
    ) {
      props.undoService.restoreCheckpoint(transaction.checkpoint);
    }
    const previousPath = loadedPath.current;
    if (previousPath && mask) {
      drafts.current.set(previousPath, { mask: structuredClone(mask), savedFingerprint });
    }
    loadedPath.current = props.assetPath;
    editTransaction.current = null;
    replaceMask(null);
    setSavedFingerprint('');
    setError(null);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      replaceMask(structuredClone(draft.mask));
      setSavedFingerprint(draft.savedFingerprint);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseAvatarMaskDraft(text);
        replaceMask(parsed);
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
  const anyDirty = dirty || [...drafts.current.values()].some(avatarMaskDraftDirty);
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);

  const update = (mutate: (draft: AvatarMaskAsset) => void, label = 'Edit Avatar Mask') => {
    const current = maskRef.current;
    if (!current) return;
    const next = structuredClone(current);
    mutate(next);
    if (fingerprint(next) === fingerprint(current)) return;
    const transaction = editTransaction.current;
    if (transaction) {
      if (!transaction.token || !props.undoService.isUndoTop(transaction.token)) {
        transaction.mask = structuredClone(current);
        transaction.checkpoint = props.undoService.checkpoint();
        transaction.token = recordHistory(current, transaction.label || label);
      }
    } else {
      recordHistory(current, label);
    }
    replaceMask(next);
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
      replaceMask(normalized);
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
    const dirtyDrafts = [...drafts.current].filter(([, draft]) => avatarMaskDraftDirty(draft));
    if (dirtyDrafts.length > 0) setSaving(true);
    try {
      for (const [path, draft] of dirtyDrafts) {
        try {
          await writeMask(path, draft.mask);
          const normalized = parseAvatarMask(serializeAvatarMask(draft.mask));
          drafts.current.set(path, {
            mask: normalized,
            savedFingerprint: fingerprint(normalized),
          });
          props.onLog(`Saved ${path}`);
        } catch (reason) {
          failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      if (dirtyDrafts.length > 0) {
        await refreshProjectFiles();
        props.onAssetsChanged();
      }
    } finally {
      setSaving(false);
      if (dirtyDrafts.length > 0) setDraftEpoch((value) => value + 1);
    }
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
    <div
      className="animator-editor avatar-mask-editor"
      onFocusCapture={beginEdit}
      onBlurCapture={endEdit}
      onKeyDownCapture={(event: ReactKeyboardEvent<HTMLDivElement>) => {
        const command = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (command && key === 's') {
          event.preventDefault();
          event.stopPropagation();
          void save();
          return;
        }
        if (!command || isAvatarMaskEditControl(event.target)) return;
        if (key === 'z') {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) props.onGlobalRedo();
          else props.onGlobalUndo();
        } else if (key === 'y') {
          event.preventDefault();
          event.stopPropagation();
          props.onGlobalRedo();
        }
      }}
    >
      <div className="material-toolbar">
        <strong title={props.assetPath}>{mask.name || 'Avatar Mask'}{dirty ? ' *' : ''}</strong>
        <span className="spacer" />
        <button type="button" aria-label="Undo" title={`Undo${props.undoService.undoLabel ? ` ${props.undoService.undoLabel}` : ''} (Ctrl+Z)`} disabled={!props.undoService.canUndo} onClick={props.onGlobalUndo}><Undo2 size={13} /></button>
        <button type="button" aria-label="Redo" title={`Redo${props.undoService.redoLabel ? ` ${props.undoService.redoLabel}` : ''} (Ctrl+Y)`} disabled={!props.undoService.canRedo} onClick={props.onGlobalRedo}><Redo2 size={13} /></button>
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
            <button type="button" onClick={() => update((draft) => { draft.paths.push('Rig/Spine'); }, 'Add Avatar Mask Path')}>+ Path</button>
          </div>
          {mask.paths.length === 0 && <div className="field-hint">All animation targets are included.</div>}
          {mask.paths.map((path, index) => (
            <div className="animator-row" key={index}>
              <input
                aria-label={`Avatar Mask path ${index + 1}`}
                value={path}
                onChange={(event) => update((draft) => { draft.paths[index] = event.target.value; })}
              />
              <button type="button" title="Delete path" onClick={() => update((draft) => { draft.paths.splice(index, 1); }, 'Delete Avatar Mask Path')}>×</button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
