import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SORTING_LAYER_ID,
  MAX_SORTING_LAYERS,
  createSortingLayerId,
  type SortingLayer,
} from '../sortingLayerModel';
import {
  SORTING_LAYERS_CHANGED_EVENT,
  getSortingLayers,
  loadSortingLayers,
  persistSortingLayers,
} from '../sortingLayers';

function fingerprint(layers: SortingLayer[]): string {
  return JSON.stringify(layers);
}

function validationError(layers: SortingLayer[]): string | null {
  if (!layers.length) return 'At least the Default sorting layer is required.';
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const layer of layers) {
    const name = layer.name.trim();
    const id = layer.id.toLowerCase();
    if (!name) return 'Sorting layer names cannot be empty.';
    if ([...name].length > 64) return `'${name}' exceeds 64 characters.`;
    if (ids.has(id)) return `Duplicate stable id '${layer.id}'.`;
    const nameKey = name.toLocaleLowerCase();
    if (names.has(nameKey)) return `Duplicate sorting layer name '${name}'.`;
    ids.add(id);
    names.add(nameKey);
  }
  return ids.has(DEFAULT_SORTING_LAYER_ID) ? null : 'The Default sorting layer is required.';
}

function nextLayerName(layers: SortingLayer[]): string {
  const names = new Set(layers.map((layer) => layer.name.trim().toLocaleLowerCase()));
  for (let index = 1; index <= MAX_SORTING_LAYERS; index++) {
    const name = `Layer ${index}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
  return 'New Layer';
}

export function ProjectSettings(props: {
  onDirtyChange?: (dirty: boolean) => void;
  onLog?: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const initial = getSortingLayers().layers;
  const [layers, setLayers] = useState<SortingLayer[]>(initial);
  const [saved, setSaved] = useState(fingerprint(initial));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = fingerprint(layers) !== saved;
  const dirtyRef = useRef(dirty);
  const error = useMemo(() => validationError(layers), [layers]);

  useEffect(() => {
    dirtyRef.current = dirty;
    props.onDirtyChange?.(dirty);
  }, [dirty, props.onDirtyChange]);

  useEffect(() => () => props.onDirtyChange?.(false), [props.onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (cancelled || dirtyRef.current) return;
      const next = getSortingLayers().layers;
      setLayers(next);
      setSaved(fingerprint(next));
    };
    const onChanged = () => apply();
    window.addEventListener(SORTING_LAYERS_CHANGED_EVENT, onChanged);
    void loadSortingLayers()
      .then(() => apply())
      .catch((reason: unknown) => {
        if (!cancelled) setMessage(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
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

  const save = async () => {
    if (error || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await persistSortingLayers(layers);
      setLayers(next.layers);
      setSaved(fingerprint(next.layers));
      setMessage('Sorting layers saved. Scene and Game views now use the new order.');
      props.onLog?.(`Saved ${next.layers.length} project sorting layer(s).`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessage(detail);
      props.onLog?.(`Sorting layer save failed: ${detail}`, 'error');
    } finally {
      setSaving(false);
    }
  };

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
            <h3>Tags and Layers / Sorting Layers</h3>
            <p>Lower rows render later. Scene components serialize stable IDs, so renaming is safe.</p>
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
            Add Layer
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
          disabled={!dirty || saving}
          onClick={() => {
            const next = getSortingLayers().layers;
            setLayers(next);
            setSaved(fingerprint(next));
            setMessage(null);
          }}
        >
          Revert
        </button>
        <button type="button" disabled={!dirty || !!error || saving} onClick={() => void save()}>
          Apply
        </button>
      </footer>
    </div>
  );
}
