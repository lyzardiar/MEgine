export type UiTextHorizontalOverflow = 'Wrap' | 'Overflow';
export type UiTextVerticalOverflow = 'Truncate' | 'Overflow';

export interface UiTextLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
  bestFit: boolean;
  minSize: number;
  maxSize: number;
  fontScale: number;
  lineSpacing: number;
  horizontalOverflow: UiTextHorizontalOverflow;
  verticalOverflow: UiTextVerticalOverflow;
  alignment: 'Left' | 'Center' | 'Right';
  verticalAlign: 'Top' | 'Middle' | 'Bottom';
}

export interface UiTextLayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface UiTextLayout {
  lines: UiTextLayoutLine[];
  fontSize: number;
  glyphScale: number;
  advance: number;
  lineHeight: number;
  lineAdvance: number;
  blockHeight: number;
  truncated: boolean;
}

export const MAX_UI_TEXT_CHARACTERS = 16_384;
export const MAX_UI_TEXT_LINES = 4_096;

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function textWidth(characterCount: number, advance: number, glyphScale: number): number {
  return characterCount > 0 ? characterCount * advance - glyphScale : 0;
}

function wrapParagraph(value: string, maxColumns: number): string[] {
  const source = Array.from(value.replaceAll('\t', '    '));
  if (source.length === 0) return [''];
  if (maxColumns < 1) return [];
  const lines: string[] = [];
  let cursor = 0;
  while (source.length - cursor > maxColumns) {
    let split = -1;
    for (let index = cursor + maxColumns - 1; index >= cursor; index -= 1) {
      if (/\s/u.test(source[index] ?? '')) {
        split = index;
        break;
      }
    }
    if (split <= cursor) {
      lines.push(source.slice(cursor, cursor + maxColumns).join(''));
      cursor += maxColumns;
      while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1;
      continue;
    }
    lines.push(source.slice(cursor, split).join('').trimEnd());
    cursor = split + 1;
    while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1;
  }
  lines.push(source.slice(cursor).join(''));
  return lines;
}

function layoutUiTextAtFontSize(
  value: string,
  options: UiTextLayoutOptions,
  requestedFontSize: number,
  verticalOverflow = options.verticalOverflow,
): UiTextLayout {
  const width = Math.max(0, Number.isFinite(options.width) ? options.width : 0);
  const height = Math.max(0, Number.isFinite(options.height) ? options.height : 0);
  const fontSize = Number.isFinite(requestedFontSize)
    ? Math.min(512, Math.max(1, requestedFontSize))
    : 16;
  const glyphScale = Math.max(1, Math.max(fontSize, 7) / 7);
  const advance = 6 * glyphScale;
  const lineHeight = 8 * glyphScale;
  const lineSpacing = Math.min(10, Math.max(0.1, finitePositive(options.lineSpacing, 1)));
  const lineAdvance = lineHeight * lineSpacing;
  const normalizedCodePoints = Array.from(
    String(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
  );
  const inputTruncated = normalizedCodePoints.length > MAX_UI_TEXT_CHARACTERS;
  const paragraphs = normalizedCodePoints
    .slice(0, MAX_UI_TEXT_CHARACTERS)
    .join('')
    .split('\n');
  const maxColumns = Math.max(0, Math.floor((width + glyphScale) / advance));
  const allAuthoredLines = paragraphs.flatMap((paragraph) => (
    options.horizontalOverflow === 'Overflow'
      ? [paragraph.replaceAll('\t', '    ')]
      : wrapParagraph(paragraph, maxColumns)
  ));
  const linesTruncated = allAuthoredLines.length > MAX_UI_TEXT_LINES;
  const authoredLines = allAuthoredLines.slice(0, MAX_UI_TEXT_LINES);
  const maxVisibleLines = verticalOverflow === 'Overflow'
    ? authoredLines.length
    : height + 1e-4 < lineHeight
      ? 0
      : Math.max(0, Math.floor((height - lineHeight + 1e-4) / lineAdvance) + 1);
  const visibleLines = authoredLines.slice(0, maxVisibleLines);
  const blockHeight = visibleLines.length > 0
    ? lineHeight + (visibleLines.length - 1) * lineAdvance
    : 0;
  const startY = options.verticalAlign === 'Top'
    ? 0
    : options.verticalAlign === 'Bottom'
      ? height - blockHeight
      : (height - blockHeight) * 0.5;
  const lines = visibleLines.map((text, index) => {
    const characterCount = Array.from(text).length;
    const measuredWidth = textWidth(characterCount, advance, glyphScale);
    const x = options.alignment === 'Left'
      ? 0
      : options.alignment === 'Right'
        ? width - measuredWidth
        : (width - measuredWidth) * 0.5;
    return {
      text,
      x,
      y: startY + index * lineAdvance,
      width: measuredWidth,
    };
  });
  return {
    lines,
    fontSize,
    glyphScale,
    advance,
    lineHeight,
    lineAdvance,
    blockHeight,
    truncated: inputTruncated
      || linesTruncated
      || visibleLines.length < authoredLines.length
      || (normalizedCodePoints.length > 0 && authoredLines.length === 0),
  };
}

function textFits(layout: UiTextLayout, width: number, height: number, value: string): boolean {
  if (value.length === 0) return true;
  return !layout.truncated
    && layout.blockHeight <= height + 1e-4
    && layout.lines.every((line) => line.width <= width + 1e-4);
}

function resolveBestFitFontSize(value: string, options: UiTextLayoutOptions): number {
  const width = Math.max(0, Number.isFinite(options.width) ? options.width : 0);
  const height = Math.max(0, Number.isFinite(options.height) ? options.height : 0);
  const rawMin = Number.isFinite(options.minSize)
    ? Math.min(300, Math.max(1, options.minSize))
    : 10;
  const rawMax = Number.isFinite(options.maxSize)
    ? Math.min(300, Math.max(1, options.maxSize))
    : 40;
  const fontScale = finitePositive(options.fontScale, 1);
  const lower = Math.max(1, Math.ceil(Math.min(rawMin, rawMax)));
  const upper = Math.max(lower, Math.floor(Math.max(rawMin, rawMax)));
  let low = lower;
  let high = upper;
  let best = lower;
  while (low <= high) {
    const candidate = Math.floor((low + high) * 0.5);
    const layout = layoutUiTextAtFontSize(
      value,
      options,
      candidate * fontScale,
      'Overflow',
    );
    if (textFits(layout, width, height, value)) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }
  return best * fontScale;
}

export function layoutUiText(value: string, options: UiTextLayoutOptions): UiTextLayout {
  const fontSize = options.bestFit
    ? resolveBestFitFontSize(value, options)
    : options.fontSize;
  return layoutUiTextAtFontSize(value, options, fontSize);
}
