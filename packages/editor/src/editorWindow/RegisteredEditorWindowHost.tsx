import type { ReactNode } from 'react';
import { createRegisteredEditorWindow } from './registry';
import { EditorWindowErrorBoundary } from './EditorWindowErrorBoundary';

function RegisteredEditorWindowBody(props: { render: () => ReactNode }) {
  return props.render();
}

export function RegisteredEditorWindowHost(props: { typeId: string }) {
  const definition = createRegisteredEditorWindow(props.typeId);
  if (!definition) {
    return (
      <main className="registered-window-error">
        <h1>Editor window is not registered</h1>
        <code>{props.typeId}</code>
        <p>Register a stable window factory at module load so it can be reconstructed in a detached WebView.</p>
      </main>
    );
  }
  return (
    <main className="registered-window-standalone">
      <EditorWindowErrorBoundary title={definition.title} resetKey={props.typeId}>
        <RegisteredEditorWindowBody render={definition.render} />
      </EditorWindowErrorBoundary>
    </main>
  );
}
