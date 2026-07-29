import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GAME_LAYER,
  DEFAULT_SORTING_LAYER_ID,
  DEFAULT_TAG,
  MAX_GAME_LAYERS,
  MAX_SORTING_LAYERS,
  MAX_TAGS,
  createSortingLayerId,
  nextGameLayerIndex,
  validateTagsAndLayers,
  validateSortingLayers,
  type GameObjectLayer,
  type SortingLayer,
} from '../sortingLayerModel';
import { registerSaveAllParticipant } from '../saveAll';
import {
  SORTING_LAYERS_CHANGED_EVENT,
  getSortingLayers,
  loadSortingLayersSnapshot,
  persistProjectSettingsGuarded,
} from '../sortingLayers';

function fingerprint(
  layers: SortingLayer[],
  tags: string[],
  gameLayers: GameObjectLayer[],
): string {
  return JSON.stringify({ layers, tags, gameLayers });
}

function nextLayerName(layers: SortingLayer[]): string {
  const names = new Set(layers.map((layer) => layer.name.trim().toLocaleLowerCase()));
  for (let index = 1; index <= MAX_SORTING_LAYERS; index++) {
    const name = `Layer ${index}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
  return 'New Layer';
}

function nextTagName(tags: string[]): string {
  const names = new Set(tags.map((tag) => tag.trim().toLocaleLowerCase()));
  for (let index = 1; index <= MAX_TAGS; index++) {
    const name = `Tag ${index}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
  return 'New Tag';
}

function nextGameLayerName(layers: GameObjectLayer[], index: number): string {
  const names = new Set(layers.map((layer) => layer.name.trim().toLocaleLowerCase()));
  const preferred = `Layer ${index}`;
  if (!names.has(preferred.toLocaleLowerCase())) return preferred;
  for (let suffix = 1; suffix <= MAX_GAME_LAYERS; suffix++) {
    const name = `Layer ${index}-${suffix}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
  return `Layer ${index}`;
}

export function ProjectSettings(props: {
  onDirtyChange?: (dirty: boolean) => void;
  onLog?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const initial = getSortingLayers();
  const [layers, setLayers] = useState<SortingLayer[]>(initial.layers);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [gameLayers, setGameLayers] = useState<GameObjectLayer[]>(initial.gameLayers);
  const [saved, setSaved] = useState(
    fingerprint(initial.layers, initial.tags, initial.gameLayers),
  );
  const [revision, setRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = fingerprint(layers, tags, gameLayers) !== saved;
  const dirtyRef = useRef(dirty);
  const reloadGeneration = useRef(0);
  const suppressSettingsChange = useRef(false);
  const error = useMemo(
    () => validateSortingLayers(layers) ?? validateTagsAndLayers(tags, gameLayers),
    [gameLayers, layers, tags],
  );

  useEffect(() => {
    dirtyRef.current = dirty;
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);

  useEffect(() => () => props.onDirtyChange?.(false), [props.onDirtyChange]);

  const reloadFromDisk = async (discardDraft: boolean): Promise<boolean> => {
    const generation = reloadGeneration.current + 1;
    reloadGeneration.current = generation;
    setLoading(true);
    try {
      const snapshot = await loadSortingLayersSnapshot();
      if (reloadGeneration.current !== generation) return false;
      if (!discardDraft && dirtyRef.current) {
        setMessage(
          'Project Settings changed outside this editor. Reload to discard this draft before saving.',
        );
        return false;
      }
      setLayers(snapshot.settings.layers);
      setTags(snapshot.settings.tags);
      setGameLayers(snapshot.settings.gameLayers);
      setSaved(fingerprint(
        snapshot.settings.layers,
        snapshot.settings.tags,
        snapshot.settings.gameLayers,
      ));
      setRevision(snapshot.revision);
      setMessage(null);
      return true;
    } catch (reason) {
      if (reloadGeneration.current === generation) {
        setMessage(reason instanceof Error ? reason.message : String(reason));
      }
      return false;
    } finally {
      if (reloadGeneration.current === generation) setLoading(false);
    }
  };

  useEffect(() => {
    const onChanged = () => {
      if (suppressSettingsChange.current) return;
      if (dirtyRef.current) {
        setMessage(
          'Project Settings changed outside this editor. Reload to discard this draft before saving.',
        );
        return;
      }
      void reloadFromDisk(false);
    };
    window.addEventListener(SORTING_LAYERS_CHANGED_EVENT, onChanged);
    void reloadFromDisk(false);
    return () => {
      reloadGeneration.current += 1;
      window.removeEventListener(SORTING_LAYERS_CHANGED_EVENT, onChanged);
    };
  }, []);

  const update = (index: number, patch: Partial<SortingLayer>) => {
    setMessage(null);
    setLayers((previous) => previous.map((layer, row) => row === index ? { ...layer, ...patch } : layer));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= layers.length) return;
    const next = [...layers];
    [next[index], next[target]] = [next[target], next[index]];
    setLayers(next);
    setMessage(null);
  };

  const save = async (): Promise<boolean> => {
    if (error || saving) return false;
    if (!revision) {
      setMessage('Project Settings revision is not loaded. Reload before saving.');
      return false;
    }
    setSaving(true);
    setMessage(null);
    suppressSettingsChange.current = true;
    try {
      const snapshot = await persistProjectSettingsGuarded(
        {
          version: 1,
          layers,
          tags,
          gameLayers,
        },
        revision,
        'project-settings',
      );
      const next = snapshot.settings;
      setLayers(next.layers);
      setTags(next.tags);
      setGameLayers(next.gameLayers);
      setSaved(fingerprint(next.layers, next.tags, next.gameLayers));
      setRevision(snapshot.revision);
      setMessage('Tags, GameObject layers, and Sorting Layers saved.');
      props.onLog?.(
        `Saved ${next.tags.length} tag(s), ${next.gameLayers.length} GameObject layer(s), and ${next.layers.length} sorting layer(s).`,
      );
      return true;
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessage(detail);
      props.onLog?.(`Project Settings save failed: ${detail}`, 'error');
      return false;
    } finally {
      suppressSettingsChange.current = false;
      setSaving(false);
    }
  };

  useEffect(() => registerSaveAllParticipant('Project Settings', () => (
    dirty && !saving
      ? async () => {
        if (!await save()) throw new Error(error ?? 'Project Settings save failed');
      }
      : null
  )), [dirty, error, gameLayers, layers, revision, saving, tags]);

  return (
    <div className="project-settings-panel">
      <header>
        <div>
          <strong>Project Settings</strong>
          <span>Shared by editor views and packaged players.</span>
        </div>
        <span className={`project-settings-state${dirty ? ' dirty' : ''}`}>
          {loading ? 'LOADING' : saving ? 'SAVING' : dirty ? 'MODIFIED' : 'SAVED'}
        </span>
      </header>
      <section>
        <div className="project-settings-title">
          <div>
            <h3>Tags</h3>
            <p>Tags classify GameObjects for editor tools, scripts, and agents.</p>
          </div>
          <button
            type="button"
            disabled={tags.length >= MAX_TAGS || saving}
            onClick={() => {
              setTags((previous) => [...previous, nextTagName(previous)]);
              setMessage(null);
            }}
          >
            Add Tag
          </button>
        </div>
        <div className="sorting-layer-table" role="table" aria-label="Tags">
          <div className="sorting-layer-heading" role="row">
            <span>Order</span><span>Name</span><span>Usage</span><span>Actions</span>
          </div>
          {tags.map((tag, index) => {
            const isDefault = tag.toLocaleLowerCase() === DEFAULT_TAG.toLocaleLowerCase();
            return (
              <div className="sorting-layer-row" role="row" key={index}>
                <span>{index}</span>
                <input
                  aria-label={`Tag ${index} name`}
                  value={tag}
                  disabled={isDefault || saving}
                  maxLength={64}
                  onChange={(event) => {
                    setTags((previous) => previous.map((value, row) => (
                      row === index ? event.target.value : value
                    )));
                    setMessage(null);
                  }}
                />
                <code>{isDefault ? 'Built-in' : 'User'}</code>
                <span className="sorting-layer-actions">
                  <button
                    type="button"
                    title={isDefault ? 'The Untagged tag cannot be removed' : 'Remove tag'}
                    disabled={isDefault || saving}
                    onClick={() => {
                      setTags((previous) => previous.filter((_, row) => row !== index));
                      setMessage(`Removed '${tag}'. Existing scene references remain visible until reassigned.`);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="project-settings-title">
          <div>
            <h3>GameObject Layers</h3>
            <p>Stable indices 0-31 are serialized with every GameObject and exposed to scripts and agents.</p>
          </div>
          <button
            type="button"
            disabled={gameLayers.length >= MAX_GAME_LAYERS || saving}
            onClick={() => {
              const index = nextGameLayerIndex(gameLayers);
              if (index == null) return;
              setGameLayers((previous) => [
                ...previous,
                { index, name: nextGameLayerName(previous, index) },
              ].sort((a, b) => a.index - b.index));
              setMessage(null);
            }}
          >
            Add Layer
          </button>
        </div>
        <div className="sorting-layer-table" role="table" aria-label="GameObject Layers">
          <div className="sorting-layer-heading" role="row">
            <span>Index</span><span>Name</span><span>Mask</span><span>Actions</span>
          </div>
          {gameLayers.map((layer, index) => {
            const isDefault = layer.index === DEFAULT_GAME_LAYER;
            return (
              <div className="sorting-layer-row" role="row" key={layer.index}>
                <span>{layer.index}</span>
                <input
                  aria-label={`GameObject layer ${layer.index} name`}
                  value={layer.name}
                  disabled={isDefault || saving}
                  maxLength={64}
                  onChange={(event) => {
                    setGameLayers((previous) => previous.map((value, row) => (
                      row === index ? { ...value, name: event.target.value } : value
                    )));
                    setMessage(null);
                  }}
                />
                <code>{`1 << ${layer.index}`}</code>
                <span className="sorting-layer-actions">
                  <button
                    type="button"
                    title={isDefault ? 'The Default layer cannot be removed' : 'Remove layer'}
                    disabled={isDefault || saving}
                    onClick={() => {
                      setGameLayers((previous) => previous.filter((_, row) => row !== index));
                      setMessage(`Removed '${layer.name}'. Existing scene references remain visible until reassigned.`);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <div className="project-settings-title">
          <div>
            <h3>Sorting Layers</h3>
            <p>Lower rows render later. Components serialize stable IDs, so renaming is safe.</p>
          </div>
          <button
            type="button"
            disabled={layers.length >= MAX_SORTING_LAYERS || saving}
            onClick={() => {
              setLayers((previous) => [
                ...previous,
                { id: createSortingLayerId(previous), name: nextLayerName(previous) },
              ]);
              setMessage(null);
            }}
          >
            Add Sorting Layer
          </button>
        </div>
        <div className="sorting-layer-table" role="table" aria-label="Sorting Layers">
          <div className="sorting-layer-heading" role="row">
            <span>Order</span><span>Name</span><span>Stable ID</span><span>Actions</span>
          </div>
          {layers.map((layer, index) => {
            const isDefault = layer.id.toLowerCase() === DEFAULT_SORTING_LAYER_ID;
            return (
              <div className="sorting-layer-row" role="row" key={layer.id}>
                <span>{index}</span>
                <input
                  aria-label={`Sorting layer ${index} name`}
                  value={layer.name}
                  disabled={isDefault || saving}
                  maxLength={64}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
                <code title={layer.id}>{layer.id}</code>
                <span className="sorting-layer-actions">
                  <button type="button" title="Move up" disabled={index === 0 || saving} onClick={() => move(index, -1)}>Up</button>
                  <button type="button" title="Move down" disabled={index === layers.length - 1 || saving} onClick={() => move(index, 1)}>Down</button>
                  <button
                    type="button"
                    title={isDefault ? 'The Default layer cannot be removed' : 'Remove layer'}
                    disabled={isDefault || saving}
                    onClick={() => {
                      setLayers((previous) => previous.filter((_, row) => row !== index));
                      setMessage(`Removed '${layer.name}'. Existing references will use Default until reassigned.`);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        {error && <div className="project-settings-message error">{error}</div>}
        {message && <div className="project-settings-message">{message}</div>}
      </section>
      <footer>
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void reloadFromDisk(true)}
        >
          Reload
        </button>
        <button
          type="button"
          disabled={!dirty || !!error || !revision || saving}
          onClick={() => void save()}
        >
          Apply
        </button>
      </footer>
    </div>
  );
}
