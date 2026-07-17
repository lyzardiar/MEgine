export type ComponentClipboard = {
  type: string;
  value: Record<string, unknown>;
};

export function copyComponentValue(
  type: string,
  value: Record<string, unknown>,
): ComponentClipboard {
  return { type, value: structuredClone(value) };
}

export function pasteComponentValue(
  clipboard: ComponentClipboard | null,
  type: string,
): Record<string, unknown> | null {
  if (!clipboard || clipboard.type !== type) return null;
  return structuredClone(clipboard.value);
}
