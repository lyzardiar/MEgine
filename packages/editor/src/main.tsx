import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesktopProjectGate } from './DesktopProjectGate';
import { panelFromLocation } from './panels/detachedPanelWindow';
import { editorWindowTypeFromLocation } from './editorWindow/nativeEditorWindow';
import { RegisteredEditorWindowHost } from './editorWindow';
import './editorWindow';
import './styles.css';

const detachedPanel = panelFromLocation();
const detachedEditorWindow = editorWindowTypeFromLocation();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopProjectGate detached={detachedPanel != null || detachedEditorWindow != null}>
      {detachedEditorWindow
        ? <RegisteredEditorWindowHost typeId={detachedEditorWindow} />
        : <App detachedPanel={detachedPanel} />}
    </DesktopProjectGate>
  </StrictMode>,
);
