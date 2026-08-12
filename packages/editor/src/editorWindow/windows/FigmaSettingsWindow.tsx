// Author: MiYu

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
import { runFigmaAgentOperation } from '../../transport/editorTransport.ts';
import { EditorWindow } from '../EditorWindow.ts';
import { registerEditorWindowType, registerMenuItem } from '../registry.ts';
import './FigmaSettingsWindow.css';

type MappingRow = { componentId: string; kind: FigmaComponentKind };

type FigmaDiagnostic = {
  code: string;
  severity: 'info' | 'warning' | 'error';
  nodeId?: string;
  message: string;
};

type FigmaPreview = {
  signature: string;
  fileName: string;
  rootName: string;
  nodeCount: number;
  plannedNodeCount: number;
  assetCount: number;
  diagnostics: FigmaDiagnostic[];
  readyToImport: boolean;
};

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

function agentData<T>(value: unknown): T {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
    throw new Error('MEngine Figma Agent returned an invalid response.');
  }
  return (value as { data: T }).data;
}

export function validFigmaFrameUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['figma.com', 'www.figma.com'].includes(url.hostname.toLocaleLowerCase())
      && /^\/(?:design|file|proto)\//u.test(url.pathname)
      && Boolean(url.searchParams.get('node-id'));
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function FigmaSettingsBody() {
  const [saved, setSaved] = useState(readFigmaBridgePreferences);
  const [draft, setDraft] = useState(saved);
  const [rows, setRows] = useState(() => rowsFrom(saved));
  const [status, setStatus] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [preview, setPreview] = useState<FigmaPreview | null>(null);
  const [operation, setOperation] = useState<'preview' | 'import' | null>(null);
  const [operationError, setOperationError] = useState('');

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
  const trimmedUrl = figmaUrl.trim();
  const urlValid = validFigmaFrameUrl(trimmedUrl);
  const requestSignature = JSON.stringify({
    url: trimmedUrl,
    maxNodes: nextPreferences.maxNodes,
    componentMappings: nextPreferences.componentMappings,
  });
  const canPreview = urlValid && !mappingError && assetFolderValid && operation === null;
  const canImport = canPreview
    && preview?.signature === requestSignature
    && preview.readyToImport;

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

  const runPreview = async () => {
    setOperation('preview');
    setOperationError('');
    setStatus('Reading the selected Figma frame...');
    try {
      const response = await runFigmaAgentOperation('figma-preview', trimmedUrl, {
        maxNodes: nextPreferences.maxNodes,
        componentMappings: nextPreferences.componentMappings,
      });
      const data = agentData<{
        figma: { fileName: string; rootName: string; nodeCount: number };
        plan: {
          nodes: unknown[];
          assets: unknown[];
          diagnostics: FigmaDiagnostic[];
          readyToImport: boolean;
        };
      }>(response);
      const nextPreview = {
        signature: requestSignature,
        fileName: data.figma.fileName,
        rootName: data.figma.rootName,
        nodeCount: data.figma.nodeCount,
        plannedNodeCount: data.plan.nodes.length,
        assetCount: data.plan.assets.length,
        diagnostics: data.plan.diagnostics,
        readyToImport: data.plan.readyToImport,
      };
      setPreview(nextPreview);
      setStatus(nextPreview.readyToImport
        ? 'Preview ready. Review diagnostics, then import.'
        : 'Preview found blocking diagnostics.');
    } catch (error) {
      setPreview(null);
      setOperationError(errorMessage(error));
      setStatus('Preview failed.');
    } finally {
      setOperation(null);
    }
  };

  const runImport = async () => {
    setOperation('import');
    setOperationError('');
    setStatus('Importing the Figma frame and raster assets...');
    try {
      const response = await runFigmaAgentOperation('figma-import', trimmedUrl, {
        assetFolder: nextPreferences.assetFolder,
        imageScale: nextPreferences.imageScale,
        maxNodes: nextPreferences.maxNodes,
        componentMappings: nextPreferences.componentMappings,
        usePreviewCache: true,
      });
      const data = agentData<{
        figma: { rootName: string; nodeCount: number };
        assetPaths: Record<string, string>;
      }>(response);
      setPreview(null);
      setStatus(
        `Imported ${data.figma.rootName}: ${data.figma.nodeCount} nodes, ${Object.keys(data.assetPaths).length} PNG assets.`,
      );
    } catch (error) {
      setOperationError(errorMessage(error));
      setStatus('Import failed. The scene was not partially created.');
    } finally {
      setOperation(null);
    }
  };

  return (
    <article className="figma-settings" aria-label="Figma Import">
      <header>
        <div>
          <h1>Figma Import</h1>
          <p>Preview one selected Figma frame, review diagnostics, then add it to the current scene.</p>
        </div>
        <span className="figma-settings-badge">One-way import</span>
      </header>

      <section className="figma-import-run" aria-labelledby="figma-run-heading">
        <div className="figma-settings-section-heading">
          <div>
            <h2 id="figma-run-heading">Selected frame</h2>
            <p>In Figma, select a Frame and copy its link. The URL must contain node-id.</p>
          </div>
        </div>
        <label className="figma-import-url">
          Figma frame URL
          <input
            aria-label="Figma frame URL"
            type="url"
            placeholder="https://www.figma.com/design/...?...node-id=12-34"
            value={figmaUrl}
            onChange={(event) => setFigmaUrl(event.target.value)}
            aria-invalid={Boolean(trimmedUrl) && !urlValid}
          />
        </label>
        {trimmedUrl && !urlValid && (
          <p className="figma-settings-error" role="alert">Paste a Figma design, file, or prototype URL with node-id.</p>
        )}
        <div className="figma-import-actions">
          <button
            type="button"
            data-agent-interaction="blocked"
            data-agent-alternative="preview_figma_ui"
            disabled={!canPreview}
            onClick={() => void runPreview()}
          >
            {operation === 'preview' ? 'Previewing...' : 'Preview'}
          </button>
          <button
            type="button"
            className="primary"
            data-agent-interaction="blocked"
            data-agent-alternative="import_figma_ui"
            disabled={!canImport}
            onClick={() => void runImport()}
          >
            {operation === 'import' ? 'Importing...' : 'Import into current scene'}
          </button>
        </div>
        {operationError && <p className="figma-settings-error" role="alert">{operationError}</p>}
        {preview && (
          <div className="figma-import-preview" aria-label="Figma import preview">
            <div>
              <strong>{preview.rootName}</strong>
              <span>{preview.fileName}</span>
            </div>
            <dl>
              <div><dt>Source nodes</dt><dd>{preview.nodeCount}</dd></div>
              <div><dt>UI objects</dt><dd>{preview.plannedNodeCount}</dd></div>
              <div><dt>PNG exports</dt><dd>{preview.assetCount}</dd></div>
              <div><dt>Status</dt><dd>{preview.readyToImport ? 'Ready' : 'Blocked'}</dd></div>
            </dl>
            {preview.signature !== requestSignature && (
              <p className="figma-settings-error">URL or settings changed. Preview again before importing.</p>
            )}
            {preview.diagnostics.length > 0 && (
              <ul className="figma-import-diagnostics">
                {preview.diagnostics.slice(0, 50).map((diagnostic, index) => (
                  <li data-severity={diagnostic.severity} key={`${diagnostic.code}:${diagnostic.nodeId ?? index}`}>
                    <strong>{diagnostic.code}</strong>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {preview.diagnostics.length > 50 && (
              <p>Showing the first 50 of {preview.diagnostics.length} diagnostics.</p>
            )}
          </div>
        )}
      </section>

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
            <h2 id="figma-import-heading">Import settings</h2>
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
          <li>Import uses the exact normalized source snapshot shown by Preview.</li>
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
  title = 'Figma Import';
  minWidth = 640;
  minHeight = 600;

  static openFromMenu(activateWindow = true) {
    FigmaSettingsWindow.show({ width: 780, height: 820, activateWindow });
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
    height: 820,
    requiresProject: false,
    render: () => window.onGUI(),
  };
});

registerMenuItem('Window/Figma Import', (context) => {
  FigmaSettingsWindow.openFromMenu(context.source !== 'agent');
}, {
  priority: 30,
  separatorBefore: true,
  agentInvokable: false,
  agentAlternative: 'open_editor_window',
});
