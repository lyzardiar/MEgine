export type UiInputKeyAction = 'native' | 'submit' | 'cancel' | 'navigate';

export function normalizeUiInputText(
  value: string,
  multiline: boolean,
  characterLimit: number,
): string {
  const normalizedLines = String(value).replace(/\r\n?/g, '\n');
  const normalized = multiline ? normalizedLines : normalizedLines.replaceAll('\n', '');
  const limit = Number.isFinite(characterLimit)
    ? Math.max(0, Math.trunc(characterLimit))
    : 0;
  if (limit === 0) return normalized;
  return Array.from(normalized).slice(0, limit).join('');
}

export function resolveUiInputEdit(
  value: string,
  multiline: boolean,
  characterLimit: number,
  composing: boolean,
): { text: string; commit: boolean } {
  return {
    text: normalizeUiInputText(value, multiline, composing ? 0 : characterLimit),
    commit: !composing,
  };
}

export function uiInputKeyAction(
  key: string,
  multiline: boolean,
  composing: boolean,
): UiInputKeyAction {
  if (composing) return 'native';
  if (key === 'Tab') return 'navigate';
  if (key === 'Escape') return 'cancel';
  if (key === 'Enter' && !multiline) return 'submit';
  return 'native';
}
