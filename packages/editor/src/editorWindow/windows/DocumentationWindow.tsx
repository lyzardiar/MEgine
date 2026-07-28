import { EditorWindow } from '../EditorWindow.ts';
import { registerEditorWindowType, registerMenuItem } from '../registry.ts';
import './DocumentationWindow.css';

function DocumentationBody() {
  return (
    <article className="mengine-documentation" aria-label="MEngine Documentation">
      <h1>MEngine Documentation</h1>
      <p>Core editor workflows and the self-discovering AI Agent entry points.</p>

      <section aria-labelledby="documentation-authoring">
        <h2 id="documentation-authoring">Authoring essentials</h2>
        <dl>
          <dt>Scenes</dt>
          <dd>Use File to create, open, save, or save all scenes and edited resources.</dd>
          <dt>Objects and components</dt>
          <dd>
            Create objects from GameObject, then add catalog components from Component or
            the Inspector.
          </dd>
          <dt>Builds</dt>
          <dd>
            Open Build Settings with Ctrl+Shift+B, configure scenes, build, and verify the
            published Player before launching it.
          </dd>
        </dl>
      </section>

      <section aria-labelledby="documentation-agent">
        <h2 id="documentation-agent">AI Agent workflow</h2>
        <ol>
          <li>
            Read <code>mengine://project/state</code> and <code>mengine://editor/state</code>.
          </li>
          <li>
            Inspect <code>mengine://scene/snapshot</code>,{' '}
            <code>mengine://schema/components</code>, and <code>mengine://commands</code>.
          </li>
          <li>
            Use domain commands for edits and exact window UI queries for visual or
            otherwise unmodeled state.
          </li>
          <li>Verify the returned scene revision, event cursor, state, or screenshot.</li>
        </ol>
        <p>
          Window and panel inspection is background-safe; Agent-created native windows stay
          hidden and unfocused.
        </p>
      </section>

      <section aria-labelledby="documentation-source">
        <h2 id="documentation-source">Complete source documentation</h2>
        <div className="documentation-paths">
          <div><code>README.md</code></div>
          <div><code>docs/architecture.md</code></div>
          <div><code>docs/runtime-scripting.md</code></div>
          <div><code>docs/behaviour-guidelines.md</code></div>
          <div><code>docs/mengine-editor-ai-agent-technical-design.md</code></div>
        </div>
      </section>
    </article>
  );
}

export class DocumentationWindow extends EditorWindow {
  title = 'MEngine Documentation';
  minWidth = 560;
  minHeight = 520;

  static openFromMenu(activateWindow = true) {
    DocumentationWindow.show({ width: 660, height: 680, activateWindow });
  }

  onGUI() {
    return <DocumentationBody />;
  }
}

registerEditorWindowType('EditorWindow.DocumentationWindow', () => {
  const window = new DocumentationWindow();
  return {
    typeId: 'EditorWindow.DocumentationWindow',
    title: window.title,
    width: 660,
    height: 680,
    render: () => window.onGUI(),
  };
});

registerMenuItem('Help/MEngine Documentation', (context) => {
  DocumentationWindow.openFromMenu(context.source !== 'agent');
});
