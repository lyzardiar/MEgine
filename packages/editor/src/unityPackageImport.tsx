// Author: MiYu
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { isDesktopEditor, type ProjectSnapshot } from './transport/editorTransport';
import { projectAssetSessionGeneration, refreshProjectFiles } from './projectAssets';
import { refreshSprites } from './spriteLibrary';
import { pingProjectAsset } from './pingBus';
import { alertEditor } from './editorDialog';
import { canImportUnityPackage, type UnityPackageAnalysis, type UnityPackageImportResult } from './unityPackageImportModel';
import './unityPackageImport.css';

let importWindowOpen = false;

export async function openUnityPackageImport(log: (message: string) => void, refresh: () => void): Promise<void> {
  if (!isDesktopEditor()) {
    await alertEditor('Unity package import requires the desktop editor. Open a project in MEngine Desktop, then choose Assets / Import Unity Package.', { title: 'Unity Package Import' });
    return;
  }
  if (importWindowOpen) return;
  importWindowOpen = true;
  try {
    const project = await invoke<ProjectSnapshot>('get_project_snapshot');
    const generation = projectAssetSessionGeneration();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const close = () => { root.unmount(); container.remove(); importWindowOpen = false; };
    root.render(<UnityPackageImportDialog project={project} generation={generation} close={close} log={log} refresh={refresh} />);
  } catch (error) {
    importWindowOpen = false;
    await alertEditor(String(error), { title: 'Unity Package Import' });
  }
}

function UnityPackageImportDialog({ project, generation, close, log, refresh }: {
  project: ProjectSnapshot; generation: number; close: () => void; log: (message: string) => void; refresh: () => void;
}) {
  const [report, setReport] = useState<UnityPackageAnalysis | null>(null);
  const [result, setResult] = useState<UnityPackageImportResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'choosing' | 'analyzing' | 'importing' | 'done'>('idle');
  const [error, setError] = useState('');
  const [converterPath, setConverterPath] = useState<string | null>(null);
  const [sourcePathInput, setSourcePathInput] = useState('');
  const alive = useRef(true);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => { panel.current?.focus(); return () => { alive.current = false; }; }, []);
  const busy = phase === 'choosing' || phase === 'analyzing' || phase === 'importing';
  const target = { projectId: project.projectId, projectRoot: project.projectRoot };
  const isCurrent = () => generation === projectAssetSessionGeneration();

  async function analyzeSource(sourcePath: string) {
    if (!isCurrent()) throw new Error('The project changed. Close this dialog and start the import in the current project.');
    setSourcePathInput(sourcePath); setPhase('analyzing');
    const analysis = await invoke<UnityPackageAnalysis>('analyze_unity_package', { ...target, sourcePath });
    if (!alive.current) return;
    if (!isCurrent()) throw new Error('The project changed during analysis. Start the import again.');
    setReport(analysis);
  }

  async function choose() {
    setError(''); setReport(null); setResult(null); setPhase('choosing');
    try {
      const sourcePath = await open({ title: 'Import Unity Package', multiple: false, directory: false, filters: [{ name: 'Unity package', extensions: ['unitypackage'] }] });
      if (!alive.current) return;
      if (!sourcePath || typeof sourcePath !== 'string') { setPhase('idle'); return; }
      await analyzeSource(sourcePath);
    } catch (failure) { if (alive.current) setError(String(failure)); }
    finally { if (alive.current) setPhase('idle'); }
  }

  async function commit() {
    if (!canImportUnityPackage(report) || !report || busy) return;
    setError(''); setPhase('importing');
    try {
      if (!isCurrent()) throw new Error('The project changed. Start the import again.');
      const imported = await invoke<UnityPackageImportResult>('import_unity_package', { ...target, sourcePath: report.source_path, fingerprint: report.fingerprint, converterPath });
      if (!alive.current) return;
      setResult(imported);
      log(`Imported Unity package into ${imported.destination}; ${imported.prefab_paths.length} prefab(s). Report: ${imported.manifest_path}`);
      if (isCurrent()) {
        await Promise.all([refreshProjectFiles(), refreshSprites()]);
        if (isCurrent()) {
          refresh();
          window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'project' }));
          const focusPath = imported.prefab_paths[0] ?? imported.manifest_path;
          window.requestAnimationFrame(() => { if (isCurrent()) pingProjectAsset(focusPath); });
        }
      }
      if (alive.current) setPhase('done');
    } catch (failure) {
      if (alive.current) { setError(String(failure)); setPhase('idle'); }
    }
  }

  return <div className="editor-dialog-backdrop unity-package-backdrop" onKeyDown={(event) => {
    if (event.key === 'Escape' && phase !== 'importing') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <section ref={panel} tabIndex={-1} className="editor-dialog unity-package-dialog" role="dialog" aria-modal="true" aria-labelledby="unity-package-title">
      <h2 id="unity-package-title">Import Unity Package</h2>
      <p className="unity-package-path">Project: {project.projectRoot}</p>
      <p>Choose a package to inspect assets and compatibility before importing. Generated assets use a separate folder; source assets and metadata are retained in SourceAssets.</p>
      <div><button type="button" disabled={busy} onClick={() => void choose()}>Choose .unitypackage…</button></div>
      <form onSubmit={(event) => { event.preventDefault(); if (busy || !sourcePathInput.trim()) return; setError(''); setReport(null); setResult(null); void analyzeSource(sourcePathInput.trim()).catch((failure) => { if (alive.current) setError(String(failure)); }).finally(() => { if (alive.current) setPhase('idle'); }); }}><label>Package path <input aria-label="Unity package path" value={sourcePathInput} disabled={busy} onChange={(event) => setSourcePathInput(event.target.value)} /></label> <button type="submit" disabled={busy || !sourcePathInput.trim()}>Analyze path</button></form>
      <div role="status" aria-live="polite">{phase === 'analyzing' ? 'Analyzing package and checking supported assets…' : phase === 'importing' ? 'Converting and committing assets… Keep this dialog open until the import completes.' : phase === 'choosing' ? 'Choose a package in the file picker…' : ''}</div>
      {busy && <progress aria-label="Unity package operation in progress" />}
      {error && <p role="alert" className="unity-package-error">{error}</p>}
      {report && <>
        <p className="unity-package-path">{report.source_path}</p>
        <p>{report.asset_count} assets · {report.prefab_count} prefabs · {report.particle_count} particle systems · {report.mesh_count} meshes · {report.texture_count} textures</p>
        {report.mesh_count > 0 && <details><summary>Advanced mesh converter settings</summary><p>FBX meshes use the bundled FBX2glTF converter. An optional executable override applies to this import.</p><button type="button" disabled={busy || !!result} onClick={() => {
          setPhase('choosing');
          void open({ title: 'Choose FBX2glTF executable', multiple: false, directory: false }).then((path) => {
            if (alive.current && typeof path === 'string') setConverterPath(path);
          }).catch((failure) => { if (alive.current) setError(String(failure)); }).finally(() => { if (alive.current) setPhase('idle'); });
        }}>Choose FBX2glTF…</button><p className="unity-package-path">{converterPath ?? 'Automatic converter discovery'}</p></details>}
        <details><summary>Source fingerprint</summary><code className="unity-package-path">{report.fingerprint}</code></details>
        {report.blockers.length > 0 && <div className="unity-package-error"><strong>Import blocked</strong><ul>{report.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        {report.warnings.length > 0 && <details open><summary>Compatibility diagnostics ({report.warnings.length})</summary><ul>{report.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        <div className="unity-package-assets" tabIndex={0}><table><thead><tr><th>Asset</th><th>Type</th></tr></thead><tbody>{report.assets.map((asset) => <tr key={asset.guid}><td>{asset.path}</td><td>{asset.kind}</td></tr>)}</tbody></table></div>
      </>}
      {result && <div role="status"><strong>Import complete</strong><p className="unity-package-path">{result.destination}</p><p>Imported prefabs are available in Project. Drag a prefab into the scene to preview it.</p>{result.prefab_paths.map((path) => <button key={path} type="button" disabled={!isCurrent()} onClick={() => { window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'project' })); pingProjectAsset(path); }}>{path}</button>)}</div>}
      <div className="editor-dialog-actions"><button type="button" disabled={phase === 'importing'} onClick={close}>{result ? 'Close' : 'Cancel'}</button><button type="button" className="primary" disabled={busy || !!result || !canImportUnityPackage(report)} onClick={() => void commit()}>Import</button></div>
    </section>
  </div>;
}
