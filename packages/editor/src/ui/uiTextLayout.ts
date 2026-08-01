export type UiTextHorizontalOverflow = 'Wrap' | 'Overflow';
export type UiTextVerticalOverflow = 'Truncate' | 'Overflow';
export type UiTextFontStyle = 'Normal' | 'Bold' | 'Italic' | 'BoldAndItalic';

export interface UiTextLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
  fontStyle: UiTextFontStyle;
  alignByGeometry: boolean;
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

function styleOverhang(fontStyle: UiTextFontStyle, glyphScale: number): number {
  const bold = fontStyle === 'Bold' || fontStyle === 'BoldAndItalic';
  const italic = fontStyle === 'Italic' || fontStyle === 'BoldAndItalic';
  return (bold ? 0.5 * glyphScale : 0) + (italic ? 1.5 * glyphScale : 0);
}

function textWidth(
  characterCount: number,
  advance: number,
  glyphScale: number,
  overhang: number,
): number {
  return characterCount > 0 ? characterCount * advance - glyphScale + overhang : 0;
}

const BITMAP_GLYPH_ROWS: Readonly<Record<string, readonly number[]>> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [15, 16, 16, 16, 16, 16, 15], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [15, 16, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [31, 4, 4, 4, 4, 4, 31], J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31], '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 16, 30, 1, 1, 30],
  '6': [14, 16, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 1, 14],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0],
};

const FALLBACK_GLYPH_ROWS = [31, 17, 6, 4, 6, 17, 31] as const;

function glyphGeometryBounds(
  character: string,
  glyphScale: number,
  fontStyle: UiTextFontStyle,
): [number, number] | null {
  const rows = BITMAP_GLYPH_ROWS[character.toUpperCase()] ?? FALLBACK_GLYPH_ROWS;
  const boldWidth = fontStyle === 'Bold' || fontStyle === 'BoldAndItalic'
    ? glyphScale * 0.5
    : 0;
  const italic = fontStyle === 'Italic' || fontStyle === 'BoldAndItalic';
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  rows.forEach((row, rowIndex) => {
    const italicOffset = italic ? (6 - rowIndex) * glyphScale * 0.25 : 0;
    for (let column = 0; column < 5; column += 1) {
      if ((row & (1 << (4 - column))) === 0) continue;
      minimum = Math.min(minimum, column * glyphScale + italicOffset);
      maximum = Math.max(
        maximum,
        (column + 1) * glyphScale + italicOffset + boldWidth,
      );
    }
  });
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
}

function textGeometryBounds(
  value: string,
  advance: number,
  glyphScale: number,
  fontStyle: UiTextFontStyle,
): [number, number] | null {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  Array.from(value).forEach((character, index) => {
    const bounds = glyphGeometryBounds(character, glyphScale, fontStyle);
    if (!bounds) return;
    minimum = Math.min(minimum, index * advance + bounds[0]);
    maximum = Math.max(maximum, index * advance + bounds[1]);
  });
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
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
  const overhang = styleOverhang(options.fontStyle, glyphScale);
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
  const maxColumns = Math.max(
    0,
    Math.floor((width + glyphScale - overhang) / advance),
  );
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
    const measuredWidth = textWidth(characterCount, advance, glyphScale, overhang);
    const geometry = options.alignByGeometry
      ? textGeometryBounds(text, advance, glyphScale, options.fontStyle)
      : null;
    const leftExtent = geometry?.[0] ?? 0;
    const rightExtent = geometry?.[1] ?? measuredWidth;
    const x = options.alignment === 'Left'
      ? (leftExtent === 0 ? 0 : -leftExtent)
      : options.alignment === 'Right'
        ? width - rightExtent
        : (width - leftExtent - rightExtent) * 0.5;
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
