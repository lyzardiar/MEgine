// Author: MiYu. Edit native particle JSON with project and revision guards.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { alertEditor } from './editorDialog';
import { projectAssetSessionGeneration, readProjectAssetBytesWithRevision, writeProjectAssetText } from './projectAssets';
import './unityPackageImport.css';

let editorOpen = false;

export async function openParticleDefinitionEditor(path: string, log: (message: string) => void): Promise<void> {
  if (editorOpen) return;
  editorOpen = true;
  const generation = projectAssetSessionGeneration();
  try {
    const asset = await readProjectAssetBytesWithRevision(path);
    if (generation !== projectAssetSessionGeneration()) throw new Error('The project changed. Open the particle definition again.');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const close = () => { root.unmount(); container.remove(); editorOpen = false; };
    root.render(<ParticleDefinitionEditor path={path} initialText={new TextDecoder().decode(asset.contents)} revision={asset.revision} generation={generation} close={close} log={log} />);
  } catch (error) {
    editorOpen = false;
    await alertEditor(String(error), { title: 'Particle Definition' });
  }
}

function ParticleDefinitionEditor({ path, initialText, revision, generation, close, log }: {
  path: string; initialText: string; revision: string; generation: number; close: () => void; log: (message: string) => void;
}) {
  const [text, setText] = useState(initialText), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  async function save() {
    setError(''); setSaving(true);
    try {
      if (generation !== projectAssetSessionGeneration()) throw new Error('The project changed. Open the particle definition again.');
      const value = JSON.parse(text);
      if (!value || Array.isArray(value) || value.version !== 1 || !value.renderer || !value.material) throw new Error('Expected a version 1 particle definition with renderer and material objects.');
      await writeProjectAssetText(path, `${JSON.stringify(value, null, 2)}\n`, revision);
      log(`Saved particle definition ${path}`);
      close();
    } catch (failure) { setError(String(failure)); setSaving(false); }
  }
  return <div className="editor-dialog-backdrop unity-package-backdrop" onKeyDown={(event) => {
    if (event.key === 'Escape' && !saving) { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)');
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0]?.focus(); }
    }
  }}><section className="editor-dialog unity-package-dialog particle-definition-dialog" role="dialog" aria-modal="true" aria-labelledby="particle-definition-title">
    <h2 id="particle-definition-title">Particle Definition</h2><p className="unity-package-path">{path}</p>
    <p>Edit native particle parameters as JSON. Save updates the asset; replay the effect to inspect its new emission settings.</p>
    <textarea ref={input} aria-label="Particle definition JSON" spellCheck={false} disabled={saving} value={text} onChange={(event) => setText(event.target.value)} />
    {error && <p role="alert" className="unity-package-error">{error}</p>}
    <div className="editor-dialog-actions"><button type="button" disabled={saving} onClick={close}>Cancel</button><button type="button" disabled={saving} onClick={() => void save()}>Save</button></div>
  </section></div>;
}
