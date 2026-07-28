import { Fragment, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { attachBridgeTransport } from './agent/transport';
import { DesktopProjectGate } from './DesktopProjectGate';
import { panelFromLocation } from './panels/detachedPanelWindow';
import { editorWindowTypeFromLocation } from './editorWindow/nativeEditorWindow';
import { RegisteredEditorWindowHost } from './editorWindow';
import { EditorDialogHost } from './EditorDialogHost';
import { initializeAssetEditorEvents } from './assetEditorEvents';
import { initializeBuildEditorEvents } from './buildEditorEvents';
import { initializeEditorInstance } from './editorInstance';
import { getEditorInstanceId } from './transport/editorTransport';
import './editorWindow';
import './styles.css';

async function bootstrap(): Promise<void> {
  try {
    initializeEditorInstance(await getEditorInstanceId());
  } catch (reason) {
    // Keep one damaged/mismatched WebView usable without falling back to an
    // unscoped channel that could reach another editor process.
    console.error('Failed to read the native editor instance id', reason);
    initializeEditorInstance(`isolated-${crypto.randomUUID()}`);
  }
  initializeAssetEditorEvents();
  initializeBuildEditorEvents();

  const detachedPanel = panelFromLocation();
  const detachedEditorWindow = editorWindowTypeFromLocation();

  if (detachedPanel == null && detachedEditorWindow == null) {
    void attachBridgeTransport()
      .catch((error) => console.error('AgentBridge transport failed to attach', error));
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Fragment>
        <DesktopProjectGate detached={detachedPanel != null || detachedEditorWindow != null}>
          {detachedEditorWindow
            ? <RegisteredEditorWindowHost typeId={detachedEditorWindow} />
            : <App detachedPanel={detachedPanel} />}
        </DesktopProjectGate>
        <EditorDialogHost />
      </Fragment>
    </StrictMode>,
  );
}

void bootstrap();
