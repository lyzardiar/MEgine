import { useEffect, useMemo, useState } from 'react';
import {
  FIGMA_COMPONENT_KINDS,
  type FigmaComponentKind,
} from '../../ui/figmaImport.ts';
import {
  FIGMA_SETTINGS_CHANGED_EVENT,
  readFigmaBridgePreferences,
  resetFigmaBridgePreferences,
  updateFigmaBridgePreferences,
  type FigmaBridgePreferences,
} from '../../figmaSettings.ts';
import { EditorWindow } from '../EditorWindow.ts';
import { registerEditorWindowType, registerMenuItem } from '../registry.ts';
import './FigmaSettingsWindow.css';

type MappingRow = { componentId: string; kind: FigmaComponentKind };

function rowsFrom(preferences: FigmaBridgePreferences): MappingRow[] {
  return Object.entries(preferences.componentMappings)
    .map(([componentId, kind]) => ({ componentId, kind }));
}

function preferencesFrom(
  base: FigmaBridgePreferences,
  rows: MappingRow[],
): FigmaBridgePreferences {
  return {
    ...base,
    componentMappings: Object.fromEntries(
      rows.map((row) => [row.componentId.trim(), row.kind]),
    ),
  };
}

async function copyTokenCommand(): Promise<void> {
  await navigator.clipboard.writeText("$env:FIGMA_ACCESS_TOKEN = '<token>'");
}

function FigmaSettingsBody() {
  const [saved, setSaved] = useState(readFigmaBridgePreferences);
  const [draft, setDraft] = useState(saved);
  const [rows, setRows] = useState(() => rowsFrom(saved));
  const [status, setStatus] = useState('');

  useEffect(() => {
    const onChanged = () => {
      const next = readFigmaBridgePreferences();
      setSaved(next);
      setDraft(next);
      setRows(rowsFrom(next));
    };
    window.addEventListener(FIGMA_SETTINGS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(FIGMA_SETTINGS_CHANGED_EVENT, onChanged);
  }, []);

  const mappingError = useMemo(() => {
    const ids = rows.map((row) => row.componentId.trim());
    if (ids.some((id) => !/^[A-Za-z0-9:;._-]{1,128}$/u.test(id))) {
      return 'Each component id must be a Figma node id such as 123:456.';
    }
    if (new Set(ids).size !== ids.length) return 'Component ids must be unique.';
    return '';
  }, [rows]);
  const assetFolderValid = /^Assets(?:\/[A-Za-z0-9 _.-]+)*$/u.test(draft.assetFolder)
    && !draft.assetFolder.includes('..');
  const nextPreferences = useMemo(
    () => preferencesFrom(draft, rows),
    [draft, rows],
  );
  const dirty = JSON.stringify(nextPreferences) !== JSON.stringify(saved);
  const canSave = dirty && !mappingError && assetFolderValid;

  const save = () => {
    const next = updateFigmaBridgePreferences(nextPreferences);
    setSaved(next);
    setDraft(next);
    setRows(rowsFrom(next));
    setStatus('Saved. New Figma previews and imports now use these defaults.');
  };

  const reset = () => {
    const next = resetFigmaBridgePreferences();
    setSaved(next);
    setDraft(next);
    setRows(rowsFrom(next));
    setStatus('Defaults restored.');
  };

  return (
    <article className="figma-settings" aria-label="Figma Settings">
      <header>
        <div>
          <h1>Figma Settings</h1>
          <p>Defaults shared by CLI, MCP, HTTP, and the editor import plan.</p>
        </div>
        <span className="figma-settings-badge">One-way import</span>
      </header>

      <section aria-labelledby="figma-auth-heading">
        <div className="figma-settings-section-heading">
          <div>
            <h2 id="figma-auth-heading">Authentication</h2>
            <p>The access token stays in the Agent process and is never saved in editor preferences.</p>
          </div>
          <button
            type="button"
            data-agent-interaction="blocked"
            data-agent-alternative="Set FIGMA_ACCESS_TOKEN in the Agent process environment"
            onClick={() => void copyTokenCommand().then(
              () => setStatus('PowerShell token command copied.'),
              () => setStatus('Clipboard access was rejected.'),
            )}
          >
            Copy PowerShell setup
          </button>
        </div>
        <code className="figma-settings-command">FIGMA_ACCESS_TOKEN · file_content:read</code>
      </section>

      <section aria-labelledby="figma-import-heading">
        <div className="figma-settings-section-heading">
          <div>
            <h2 id="figma-import-heading">Import defaults</h2>
            <p>Explicit values supplied by a command still take precedence.</p>
          </div>
        </div>
        <div className="figma-settings-grid">
          <label>
            Asset folder
            <input
              aria-label="Figma asset folder"
              value={draft.assetFolder}
              onChange={(event) => setDraft({ ...draft, assetFolder: event.target.value })}
              aria-invalid={!assetFolderValid}
            />
            <span>Project-relative PNG destination under Assets.</span>
          </label>
          <label>
            Node limit
            <input
              aria-label="Figma node limit"
              type="number"
              min={1}
              max={1000}
              step={1}
              value={draft.maxNodes}
              onChange={(event) => setDraft({
                ...draft,
                maxNodes: Math.min(1000, Math.max(1, Math.trunc(Number(event.target.value) || 1))),
              })}
            />
            <span>Keeps imports responsive and reviewable.</span>
          </label>
          <label>
            PNG export scale
            <select
              aria-label="Figma PNG export scale"
              value={draft.imageScale}
              onChange={(event) => setDraft({
                ...draft,
                imageScale: Number(event.target.value) as 1 | 2 | 3 | 4,
              })}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
              <option value={4}>4×</option>
            </select>
            <span>Used only for rasterized vectors, images, and effects.</span>
          </label>
        </div>
        {!assetFolderValid && <p className="figma-settings-error" role="alert">Use an Assets/... path without traversal.</p>}
      </section>

      <section aria-labelledby="figma-mapping-heading">
        <div className="figma-settings-section-heading">
          <div>
            <h2 id="figma-mapping-heading">Component mappings</h2>
            <p>Map stable Figma component ids to game controls. Layer names are never guessed.</p>
          </div>
          <button
            type="button"
            onClick={() => setRows([...rows, { componentId: '', kind: 'button' }])}
          >
            Add mapping
          </button>
        </div>
        <div className="figma-settings-mappings" role="list" aria-label="Figma component mappings">
          {rows.length === 0 && (
            <p className="figma-settings-empty">No mappings yet. Instances import as editable visual hierarchy.</p>
          )}
          {rows.map((row, index) => (
            <div className="figma-settings-mapping" role="listitem" key={index}>
              <input
                aria-label={`Figma component id ${index + 1}`}
                placeholder="123:456"
                value={row.componentId}
                onChange={(event) => setRows(rows.map((entry, rowIndex) => (
                  rowIndex === index ? { ...entry, componentId: event.target.value } : entry
                )))}
              />
              <select
                aria-label={`MEngine control type ${index + 1}`}
                value={row.kind}
                onChange={(event) => setRows(rows.map((entry, rowIndex) => (
                  rowIndex === index
                    ? { ...entry, kind: event.target.value as FigmaComponentKind }
                    : entry
                )))}
              >
                {FIGMA_COMPONENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <button
                type="button"
                className="figma-settings-remove"
                aria-label={`Remove component mapping ${index + 1}`}
                onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {mappingError && <p className="figma-settings-error" role="alert">{mappingError}</p>}
      </section>

      <section className="figma-settings-safety" aria-labelledby="figma-safety-heading">
        <h2 id="figma-safety-heading">Import contract</h2>
        <ul>
          <li>Preview revision is revalidated before the scene changes.</li>
          <li>All created UI objects share one Scene Undo transaction.</li>
          <li>Unknown components remain visual and produce a diagnostic.</li>
        </ul>
      </section>

      <footer>
        <span role="status" aria-live="polite">{status || (dirty ? 'Unsaved changes' : 'Settings are up to date')}</span>
        <div>
          <button type="button" className="secondary" onClick={reset}>Restore defaults</button>
          <button type="button" className="primary" disabled={!canSave} onClick={save}>Save settings</button>
        </div>
      </footer>
    </article>
  );
}

export class FigmaSettingsWindow extends EditorWindow {
  title = 'Figma Settings';
  minWidth = 640;
  minHeight = 600;

  static openFromMenu(activateWindow = true) {
    FigmaSettingsWindow.show({ width: 780, height: 760, activateWindow });
  }

  onGUI() {
    return <FigmaSettingsBody />;
  }
}

registerEditorWindowType('EditorWindow.FigmaSettingsWindow', () => {
  const window = new FigmaSettingsWindow();
  return {
    typeId: 'EditorWindow.FigmaSettingsWindow',
    title: window.title,
    width: 780,
    height: 760,
    requiresProject: false,
    render: () => window.onGUI(),
  };
});

registerMenuItem('Window/Figma Settings', (context) => {
  FigmaSettingsWindow.openFromMenu(context.source !== 'agent');
}, {
  priority: 30,
  separatorBefore: true,
  agentInvokable: false,
  agentAlternative: 'open_editor_window',
});
