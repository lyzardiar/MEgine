import { useEffect, useMemo, useState } from 'react';
import {
  createMcpClientConfiguration,
  formatAgentAdapterCommand,
} from '../../agentAdapterConfig.ts';
import {
  getAgentAdapterInfo,
  type AgentAdapterCommand,
  type AgentAdapterInfo,
} from '../../transport/editorTransport.ts';
import { EditorWindow } from '../EditorWindow.ts';
import { registerEditorWindowType, registerMenuItem } from '../registry.ts';
import './AgentSetupWindow.css';

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy command was rejected');
  } finally {
    textarea.remove();
  }
}

function AdapterCommand({ label, command }: {
  label: string;
  command: AgentAdapterCommand;
}) {
  return (
    <div className="agent-setup-command">
      <dt>{label}</dt>
      <dd><code>{formatAgentAdapterCommand(command)}</code></dd>
    </div>
  );
}

function AgentSetupBody() {
  const [info, setInfo] = useState<AgentAdapterInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getAgentAdapterInfo().then(
      (next) => {
        if (!cancelled) setInfo(next);
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const mcpConfiguration = useMemo(
    () => info ? createMcpClientConfiguration(info) : '',
    [info],
  );

  const handleCopy = async () => {
    try {
      await copyText(mcpConfiguration);
      setCopyStatus('MCP configuration copied.');
    } catch (reason) {
      setCopyStatus(`Copy failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  };

  return (
    <article className="agent-setup" aria-label="AI Agent Setup">
      <header>
        <div>
          <h1>AI Agent Setup</h1>
          <p>Connect an MCP client to this editor without requiring a global Node install.</p>
        </div>
        {info && (
          <span className="agent-setup-source" aria-label={`Adapter source: ${info.source}`}>
            {info.source === 'bundled' ? 'Bundled with editor' : 'Source workspace'}
          </span>
        )}
      </header>

      {!info && !error && <p role="status">Loading packaged Agent adapters…</p>}
      {error && (
        <div className="agent-setup-error" role="alert">
          <strong>Agent adapters are unavailable.</strong>
          <span>{error}</span>
        </div>
      )}

      {info && (
        <>
          <section aria-labelledby="agent-setup-mcp">
            <h2 id="agent-setup-mcp">MCP client configuration</h2>
            <p>
              Add this entry to your MCP client configuration. The installed editor returns
              absolute paths to its private Node runtime and adapter.
            </p>
            <textarea
              aria-label="MCP client configuration JSON"
              className="agent-setup-code"
              readOnly
              spellCheck={false}
              value={mcpConfiguration}
            />
            <div className="agent-setup-actions">
              <button
                type="button"
                data-agent-interaction="blocked"
                data-agent-alternative="Read MCP client configuration JSON from this window"
                onClick={() => void handleCopy()}
              >
                Copy MCP configuration
              </button>
              <span role="status" aria-live="polite">{copyStatus}</span>
            </div>
          </section>

          <section aria-labelledby="agent-setup-adapters">
            <h2 id="agent-setup-adapters">Other adapters</h2>
            <dl>
              <AdapterCommand label="One-shot CLI" command={info.cli} />
              <AdapterCommand label="Local HTTP server" command={info.http} />
            </dl>
          </section>

          {(info.mcpLauncher || info.cliLauncher || info.httpLauncher) && (
            <section aria-labelledby="agent-setup-launchers">
              <h2 id="agent-setup-launchers">Convenience launchers</h2>
              <dl className="agent-setup-launchers">
                {info.mcpLauncher && <><dt>MCP</dt><dd><code>{info.mcpLauncher}</code></dd></>}
                {info.cliLauncher && <><dt>CLI</dt><dd><code>{info.cliLauncher}</code></dd></>}
                {info.httpLauncher && <><dt>HTTP</dt><dd><code>{info.httpLauncher}</code></dd></>}
              </dl>
            </section>
          )}

          {info.source === 'workspace' && (
            <p className="agent-setup-note" role="note">
              Workspace paths are relative to the MEngine repository root. Packaged editor
              builds replace them with verified absolute paths.
            </p>
          )}
        </>
      )}
    </article>
  );
}

export class AgentSetupWindow extends EditorWindow {
  title = 'AI Agent Setup';
  minWidth = 600;
  minHeight = 520;

  static openFromMenu(activateWindow = true) {
    AgentSetupWindow.show({ width: 760, height: 700, activateWindow });
  }

  onGUI() {
    return <AgentSetupBody />;
  }
}

registerEditorWindowType('EditorWindow.AgentSetupWindow', () => {
  const window = new AgentSetupWindow();
  return {
    typeId: 'EditorWindow.AgentSetupWindow',
    title: window.title,
    width: 760,
    height: 700,
    requiresProject: false,
    render: () => window.onGUI(),
  };
});

registerMenuItem('Help/AI Agent Setup', (context) => {
  AgentSetupWindow.openFromMenu(context.source !== 'agent');
}, {
  priority: 100,
  agentInvokable: false,
  agentAlternative: 'open_editor_window',
});
