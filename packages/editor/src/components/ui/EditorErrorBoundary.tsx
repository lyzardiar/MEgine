import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

type Props = {
  scope?: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
  componentStack: string;
  copied: boolean;
};

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    componentStack: '',
    copied: false,
  };

  static getDerivedStateFromError(reason: unknown): Partial<State> {
    return {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      copied: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[MEngine:${this.props.scope ?? 'Editor'}] Uncaught render error`, error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  private formatDiagnostics(): string {
    const { error, componentStack } = this.state;
    const lines = [
      `Scope: ${this.props.scope ?? 'Editor'}`,
      `Error: ${error?.name ?? 'Error'}: ${error?.message ?? 'Unknown error'}`,
    ];
    if (error?.stack) {
      lines.push('', 'Stack:', error.stack);
    }
    if (componentStack.trim()) {
      lines.push('', 'Component Stack:', componentStack.trim());
    }
    return lines.join('\n');
  }

  render() {
    if (!this.state.error) return this.props.children;
    const diagnostics = this.formatDiagnostics();
    return (
      <main className="me-fatal-screen" role="alert" aria-live="assertive">
        <section className="me-fatal-card">
          <header className="me-fatal-header">
            <span className="me-fatal-badge">RENDER ERROR</span>
            <h1>编辑器界面渲染异常 / Editor Render Error</h1>
            <p>
              主工作台在加载或渲染时捕获到未处理异常，已阻止黑屏卸载。请复制下方诊断信息反馈，或尝试重新加载。
            </p>
          </header>
          <pre className="me-fatal-trace">{diagnostics}</pre>
          <div className="me-fatal-actions">
            <button
              type="button"
              className="me-btn-primary"
              onClick={() => window.location.reload()}
            >
              重新加载 / Reload
            </button>
            <button
              type="button"
              className="me-btn-secondary"
              onClick={() => this.setState({ error: null, componentStack: '', copied: false })}
            >
              尝试恢复 / Retry
            </button>
            <button
              type="button"
              className="me-btn-secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(diagnostics).then(
                  () => this.setState({ copied: true }),
                  () => undefined,
                );
              }}
            >
              {this.state.copied ? '已复制诊断信息 / Copied' : '复制诊断信息 / Copy'}
            </button>
          </div>
        </section>
      </main>
    );
  }
}
