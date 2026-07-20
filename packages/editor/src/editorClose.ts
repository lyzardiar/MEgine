export type EditorCloseState = {
  approved: boolean;
  inProgress: boolean;
};

export type NativeCloseDecision = 'allow' | 'prevent' | 'coordinate';

export function createEditorCloseState(): EditorCloseState {
  return { approved: false, inProgress: false };
}

export function beginNativeEditorClose(state: EditorCloseState): NativeCloseDecision {
  if (state.approved) return 'allow';
  if (state.inProgress) return 'prevent';
  state.inProgress = true;
  return 'coordinate';
}

export function beginRequestedEditorClose(state: EditorCloseState): boolean {
  if (state.approved || state.inProgress) return false;
  state.inProgress = true;
  return true;
}

export function cancelEditorClose(state: EditorCloseState): void {
  state.approved = false;
  state.inProgress = false;
}

export function approveEditorClose(state: EditorCloseState): void {
  state.approved = true;
  state.inProgress = false;
}

export function editorCloseWarning(
  dirtyPanels: readonly string[],
  applicationExit: boolean,
): string | null {
  const panels = [...new Set(dirtyPanels.map((panel) => panel.trim()).filter(Boolean))].sort();
  if (panels.length === 0) return null;
  const scope = applicationExit ? '关闭编辑器' : '关闭此窗口';
  return `以下窗口有未保存的场景或资源修改：\n\n${panels.map((panel) => `• ${panel}`).join('\n')}\n\n${scope}将丢失这些修改，是否继续？`;
}
