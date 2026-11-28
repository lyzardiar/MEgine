import { Fragment, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { attachBridgeTransport } from './agent/transport';
import { DesktopProjectGate } from './DesktopProjectGate';
import { panelFromLocation } from './panels/detachedPanelWindow';
import { editorWindowTypeFromLocation } from './editorWindow/nativeEditorWindow';
import { createRegisteredEditorWindow, RegisteredEditorWindowHost } from './editorWindow';
import { EditorDialogHost } from './EditorDialogHost';
import { initializeAssetEditorEvents } from './assetEditorEvents';
import { initializeBuildEditorEvents } from './buildEditorEvents';
import { initializeEditorInstance } from './editorInstance';
import { initializeTimelineProfiler } from './timelineProfiler';
import { initializeTheme } from './theme';
import { initializeLocale, t } from './i18n';
import { EditorErrorBoundary } from './components/ui/EditorErrorBoundary';
import { ToastHost } from './components/ui/ToastHost';
import { getEditorInstanceId } from './transport/editorTransport';
import './editorWindow';
import './styles.css';
import './styles/tokens.css';
import './styles/panels-polish.css';
import './styles/subpanels-polish.css';

const App = lazy(async () => ({ default: (await import('./App')).App }));

async function bootstrap(): Promise<void> {
  initializeTheme();
  initializeLocale();
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
  initializeTimelineProfiler();

  const detachedPanel = panelFromLocation();
  const detachedEditorWindow = editorWindowTypeFromLocation();
  const detachedEditorDefinition = detachedEditorWindow
    ? createRegisteredEditorWindow(detachedEditorWindow)
    : null;

  if (detachedPanel == null && detachedEditorWindow == null) {
    void attachBridgeTransport()
      .catch((error) => console.error('AgentBridge transport failed to attach', error));
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Fragment>
        <EditorErrorBoundary scope="ProjectGate">
          <DesktopProjectGate
            detached={detachedPanel != null || detachedEditorWindow != null}
            projectRequired={detachedEditorWindow == null
              || detachedEditorDefinition?.requiresProject !== false}
          >
            {detachedEditorWindow
              ? <RegisteredEditorWindowHost typeId={detachedEditorWindow} />
              : <EditorErrorBoundary scope="MainEditor">
                  <Suspense fallback={<div className="editor-app-loading" role="status">{t('common.loadingEditor')}</div>}>
                    <App detachedPanel={detachedPanel} />
                  </Suspense>
                </EditorErrorBoundary>}
          </DesktopProjectGate>
        </EditorErrorBoundary>
        <EditorDialogHost />
        <ToastHost />
      </Fragment>
    </StrictMode>,
  );
}

void bootstrap();
