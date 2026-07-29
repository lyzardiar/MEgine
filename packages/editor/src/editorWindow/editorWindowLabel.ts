/**
 * Build a Tauri-safe native window label without collapsing distinct editor
 * type ids through a fixed-width hash.
 *
 * Base64url is reversible for the complete UTF-8 input and uses only
 * alphanumeric characters, `-`, and `_`, which are valid in Tauri labels.
 */
export function editorWindowLabelFor(typeId: string): string {
  const bytes = new TextEncoder().encode(typeId);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
  return `editor-${encoded}`;
}
