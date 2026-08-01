type JsonRecord = Record<string, unknown>;

/** Upgrade the legacy L,T,R,B tuple to Unity's L,B,R,T RectMask2D order. */
export function migrateLegacyRectMaskPadding(components: JsonRecord): void {
  const mask = components.RectMask2D;
  if (mask == null || typeof mask !== 'object' || Array.isArray(mask)) return;
  const padding = (mask as JsonRecord).padding;
  if (!Array.isArray(padding) || padding.length < 4) return;
  [padding[1], padding[3]] = [padding[3], padding[1]];
}
