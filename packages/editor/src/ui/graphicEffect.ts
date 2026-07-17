export type UiGraphicEffect = {
  color: [number, number, number, number];
  distance: [number, number];
  useGraphicAlpha: boolean;
};

function cssColor(color: [number, number, number, number]): string {
  const byte = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  const alpha = Math.max(0, Math.min(1, color[3]));
  return `rgba(${byte(color[0])},${byte(color[1])},${byte(color[2])},${alpha})`;
}

function dropShadow(offset: [number, number], color: [number, number, number, number]): string {
  return `drop-shadow(${offset[0]}px ${offset[1]}px 0 ${cssColor(color)})`;
}

/** Build a Chromium Canvas2D filter matching runtime Shadow/Outline geometry. */
export function graphicEffectFilter(
  shadow?: UiGraphicEffect,
  outline?: UiGraphicEffect,
): string {
  const filters: string[] = [];
  if (shadow && shadow.color[3] > 0) {
    filters.push(dropShadow(shadow.distance, shadow.color));
  }
  if (outline && outline.color[3] > 0) {
    const dx = Math.abs(outline.distance[0]);
    const dy = Math.abs(outline.distance[1]);
    filters.push(dropShadow([dx, dy], outline.color));
    filters.push(dropShadow([dx, -dy], outline.color));
    filters.push(dropShadow([-dx, dy], outline.color));
    filters.push(dropShadow([-dx, -dy], outline.color));
  }
  return filters.length ? filters.join(' ') : 'none';
}
