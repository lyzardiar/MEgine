import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachBridgeTransport } from './agent/transport';
import { DesktopProjectGate } from './DesktopProjectGate';
import { panelFromLocation } from './panels/detachedPanelWindow';
import { editorWindowTypeFromLocation } from './editorWindow/nativeEditorWindow';
import { RegisteredEditorWindowHost } from './editorWindow';
import './editorWindow';
import './styles.css';

const detachedPanel = panelFromLocation();
const detachedEditorWindow = editorWindowTypeFromLocation();

function AgentBridgeTransportHost(props: { enabled: boolean }) {
  useEffect(() => {
    if (!props.enabled) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void attachBridgeTransport()
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => console.error('AgentBridge transport failed to attach', error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [props.enabled]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AgentBridgeTransportHost enabled={detachedPanel == null && detachedEditorWindow == null} />
    <DesktopProjectGate detached={detachedPanel != null || detachedEditorWindow != null}>
      {detachedEditorWindow
        ? <RegisteredEditorWindowHost typeId={detachedEditorWindow} />
        : <App detachedPanel={detachedPanel} />}
    </DesktopProjectGate>
  </StrictMode>,
);
