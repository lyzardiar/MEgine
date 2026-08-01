export type UiTextHorizontalOverflow = 'Wrap' | 'Overflow';
export type UiTextVerticalOverflow = 'Truncate' | 'Overflow';

export interface UiTextLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
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
  glyphScale: number;
  advance: number;
  lineHeight: number;
  lineAdvance: number;
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

export function layoutUiText(value: string, options: UiTextLayoutOptions): UiTextLayout {
  const width = Math.max(0, Number.isFinite(options.width) ? options.width : 0);
  const height = Math.max(0, Number.isFinite(options.height) ? options.height : 0);
  const fontSize = Math.min(512, finitePositive(options.fontSize, 16));
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
  const maxVisibleLines = options.verticalOverflow === 'Overflow'
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
    glyphScale,
    advance,
    lineHeight,
    lineAdvance,
    truncated: inputTruncated
      || linesTruncated
      || visibleLines.length < authoredLines.length
      || (normalizedCodePoints.length > 0 && authoredLines.length === 0),
  };
}
