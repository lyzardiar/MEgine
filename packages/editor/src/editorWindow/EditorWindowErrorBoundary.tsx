import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';

type Props = {
  title: string;
  resetKey: unknown;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class EditorWindowErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(reason: unknown): State {
    return {
      error: reason instanceof Error ? reason : new Error(String(reason)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[EditorWindow] ${this.props.title} failed to render`, error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section
        className="editor-window-error"
        role="alert"
        aria-label={`${this.props.title} render error`}
      >
        <h2>Window failed to render</h2>
        <p>{this.props.title}</p>
        <pre>{this.state.error.message}</pre>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </section>
    );
  }
}
