import {
  parseUiRichText,
  type UiRichTextColor,
  type UiRichTextGlyph,
} from './uiRichText';

export type UiTextHorizontalOverflow = 'Wrap' | 'Overflow';
export type UiTextVerticalOverflow = 'Truncate' | 'Overflow';
export type UiTextFontStyle = 'Normal' | 'Bold' | 'Italic' | 'BoldAndItalic';

export interface UiTextLayoutOptions {
  width: number;
  height: number;
  fontSize: number;
  fontStyle: UiTextFontStyle;
  alignByGeometry: boolean;
  supportRichText: boolean;
  bestFit: boolean;
  minSize: number;
  maxSize: number;
  fontScale: number;
  lineSpacing: number;
  horizontalOverflow: UiTextHorizontalOverflow;
  verticalOverflow: UiTextVerticalOverflow;
  alignment: 'Left' | 'Center' | 'Right';
  verticalAlign: 'Top' | 'Middle' | 'Bottom';
  measureGlyph?: (glyph: UiRichTextGlyph) => UiTextGlyphMeasurement | null;
}

export interface UiTextGlyphMeasurement {
  advance: number;
  metricWidth: number;
  lineHeight: number;
  geometry: [number, number] | null;
}

export interface UiTextLayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  runs: UiTextLayoutRun[];
}

export interface UiTextLayoutRun {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontStyle: UiTextFontStyle;
  color: UiRichTextColor | null;
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

interface MeasuredGlyph extends UiRichTextGlyph {
  glyphScale: number;
  advance: number;
  metricWidth: number;
  lineHeight: number;
  geometry: [number, number] | null;
}

function measureGlyph(
  glyph: UiRichTextGlyph,
  customMeasure?: UiTextLayoutOptions['measureGlyph'],
): MeasuredGlyph {
  const fontSize = Number.isFinite(glyph.fontSize)
    ? Math.min(512, Math.max(1, glyph.fontSize))
    : 16;
  const glyphScale = Math.max(1, Math.max(fontSize, 7) / 7);
  const fallback: MeasuredGlyph = {
    ...glyph,
    fontSize,
    glyphScale,
    advance: 6 * glyphScale,
    metricWidth: 5 * glyphScale + styleOverhang(glyph.fontStyle, glyphScale),
    lineHeight: 8 * glyphScale,
    geometry: glyphGeometryBounds(glyph.character, glyphScale, glyph.fontStyle),
  };
  const measured = customMeasure?.({ ...glyph, fontSize });
  if (!measured
    || !Number.isFinite(measured.advance) || measured.advance < 0
    || !Number.isFinite(measured.metricWidth) || measured.metricWidth < 0
    || !Number.isFinite(measured.lineHeight) || measured.lineHeight <= 0
    || (measured.geometry != null
      && (!Number.isFinite(measured.geometry[0])
        || !Number.isFinite(measured.geometry[1])
        || measured.geometry[1] < measured.geometry[0]))) {
    return fallback;
  }
  return {
    ...fallback,
    advance: Math.min(2_048, measured.advance),
    metricWidth: Math.min(2_048, measured.metricWidth),
    lineHeight: Math.min(2_048, measured.lineHeight),
    geometry: measured.geometry
      ? measured.geometry.map((value) => Math.max(-2_048, Math.min(2_048, value))) as [number, number]
      : null,
  };
}

function measuredLineWidth(glyphs: readonly MeasuredGlyph[]): number {
  if (glyphs.length === 0) return 0;
  let width = 0;
  glyphs.forEach((glyph, index) => {
    width += index === glyphs.length - 1 ? glyph.metricWidth : glyph.advance;
  });
  return width;
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

function textGeometryBounds(glyphs: readonly MeasuredGlyph[]): [number, number] | null {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let cursor = 0;
  glyphs.forEach((glyph) => {
    const bounds = glyph.geometry;
    if (bounds) {
      minimum = Math.min(minimum, cursor + bounds[0]);
      maximum = Math.max(maximum, cursor + bounds[1]);
    }
    cursor += glyph.advance;
  });
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
}

function expandTabs(glyphs: readonly MeasuredGlyph[]): MeasuredGlyph[] {
  return glyphs.flatMap((glyph) => (
    glyph.character === '\t'
      ? Array.from({ length: 4 }, () => ({ ...glyph, character: ' ' }))
      : [glyph]
  ));
}

function wrapParagraph(
  source: readonly MeasuredGlyph[],
  width: number,
): { lines: MeasuredGlyph[][]; dropped: boolean } {
  if (source.length === 0) return { lines: [[]], dropped: false };
  const lines: MeasuredGlyph[][] = [];
  let cursor = 0;
  while (cursor < source.length) {
    let end = cursor;
    let lineWidth = 0;
    let lastWhitespace = -1;
    while (end < source.length) {
      const glyph = source[end];
      const candidateWidth = end === cursor
        ? glyph.metricWidth
        : lineWidth - source[end - 1].metricWidth
          + source[end - 1].advance + glyph.metricWidth;
      if (candidateWidth > width + 1e-4) break;
      lineWidth = candidateWidth;
      if (/\s/u.test(glyph.character)) lastWhitespace = end;
      end += 1;
    }
    if (end === source.length) {
      lines.push(source.slice(cursor));
      return { lines, dropped: false };
    }
    if (end === cursor) return { lines, dropped: true };
    if (lastWhitespace > cursor) {
      let lineEnd = lastWhitespace;
      while (lineEnd > cursor && /\s/u.test(source[lineEnd - 1].character)) lineEnd -= 1;
      lines.push(source.slice(cursor, lineEnd));
      cursor = lastWhitespace + 1;
      while (cursor < source.length && /\s/u.test(source[cursor].character)) cursor += 1;
    } else {
      lines.push(source.slice(cursor, end));
      cursor = end;
      while (cursor < source.length && /\s/u.test(source[cursor].character)) cursor += 1;
    }
    if (lines.length > MAX_UI_TEXT_LINES) {
      return { lines, dropped: cursor < source.length };
    }
  }
  return { lines, dropped: false };
}

function colorsEqual(a: UiRichTextColor | null, b: UiRichTextColor | null): boolean {
  return a === b || (a != null && b != null && a.every((value, index) => value === b[index]));
}

function buildRuns(
  glyphs: readonly MeasuredGlyph[],
  lineHeight: number,
): UiTextLayoutRun[] {
  const runs: UiTextLayoutRun[] = [];
  let cursor = 0;
  for (const glyph of glyphs) {
    const y = lineHeight - glyph.lineHeight;
    const previous = runs.at(-1);
    if (previous
      && previous.fontSize === glyph.fontSize
      && previous.fontStyle === glyph.fontStyle
      && previous.y === y
      && colorsEqual(previous.color, glyph.color)) {
      previous.text += glyph.character;
    } else {
      runs.push({
        text: glyph.character,
        x: cursor,
        y,
        fontSize: glyph.fontSize,
        fontStyle: glyph.fontStyle,
        color: glyph.color ? [...glyph.color] : null,
      });
    }
    cursor += glyph.advance;
  }
  return runs;
}

function lineBlockHeight(
  lines: readonly { height: number }[],
  lineSpacing: number,
): number {
  if (lines.length === 0) return 0;
  return lines.slice(0, -1).reduce(
    (height, line) => height + line.height * lineSpacing,
    0,
  ) + lines.at(-1)!.height;
}

function lineOffsets(lines: readonly { height: number }[], lineSpacing: number): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.height * lineSpacing;
  }
  return offsets;
}

function splitParagraphs(glyphs: readonly MeasuredGlyph[]): MeasuredGlyph[][] {
  const paragraphs: MeasuredGlyph[][] = [[]];
  for (const glyph of glyphs) {
    if (glyph.character === '\n') paragraphs.push([]);
    else paragraphs.at(-1)!.push(glyph);
  }
  return paragraphs;
}

function visibleLinesForHeight<T extends { height: number }>(
  lines: readonly T[],
  height: number,
  lineSpacing: number,
): T[] {
  const visible: T[] = [];
  for (const line of lines) {
    if (lineBlockHeight([...visible, line], lineSpacing) > height + 1e-4) break;
    visible.push(line);
  }
  return visible;
}

function normalizeAndBound(value: string): { value: string; truncated: boolean } {
  const codePoints = Array.from(
    String(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
  );
  return {
    value: codePoints.slice(0, MAX_UI_TEXT_CHARACTERS).join(''),
    truncated: codePoints.length > MAX_UI_TEXT_CHARACTERS,
  };
}

function parsedGlyphsAtFontSize(
  value: string,
  options: UiTextLayoutOptions,
  fontSize: number,
): { glyphs: MeasuredGlyph[]; truncated: boolean } {
  const normalized = normalizeAndBound(value);
  return {
    glyphs: parseUiRichText(normalized.value, {
      enabled: options.supportRichText,
      fontSize,
      fontScale: finitePositive(options.fontScale, 1),
      fontStyle: options.fontStyle,
    }).map((glyph) => measureGlyph(glyph, options.measureGlyph)),
    truncated: normalized.truncated,
  };
}

function authoredLines(
  glyphs: readonly MeasuredGlyph[],
  width: number,
  horizontalOverflow: UiTextHorizontalOverflow,
): { lines: MeasuredGlyph[][]; dropped: boolean } {
  const lines: MeasuredGlyph[][] = [];
  let dropped = false;
  for (const paragraph of splitParagraphs(glyphs)) {
    const expanded = expandTabs(paragraph);
    const result = horizontalOverflow === 'Overflow'
      ? { lines: [expanded], dropped: false }
      : wrapParagraph(expanded, width);
    lines.push(...result.lines);
    dropped ||= result.dropped;
    if (lines.length > MAX_UI_TEXT_LINES) break;
  }
  return { lines, dropped };
}

function baseTextMetrics(fontSize: number, options: UiTextLayoutOptions) {
  const glyphScale = Math.max(1, Math.max(fontSize, 7) / 7);
  const sample = measureGlyph({
    character: 'M',
    fontSize,
    fontStyle: options.fontStyle,
    color: null,
  }, options.measureGlyph);
  return {
    glyphScale,
    advance: sample.advance,
    lineHeight: sample.lineHeight,
  };
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
  const base = baseTextMetrics(fontSize, options);
  const lineSpacing = Math.min(10, Math.max(0.1, finitePositive(options.lineSpacing, 1)));
  const parsed = parsedGlyphsAtFontSize(value, options, fontSize);
  const authored = authoredLines(parsed.glyphs, width, options.horizontalOverflow);
  const linesTruncated = authored.lines.length > MAX_UI_TEXT_LINES;
  const boundedLines = authored.lines.slice(0, MAX_UI_TEXT_LINES).map((glyphs) => ({
    glyphs,
    height: glyphs.reduce(
      (maximum, glyph) => Math.max(maximum, glyph.lineHeight),
      base.lineHeight,
    ),
  }));
  const visibleLines = verticalOverflow === 'Overflow'
    ? boundedLines
    : visibleLinesForHeight(boundedLines, height, lineSpacing);
  const blockHeight = lineBlockHeight(visibleLines, lineSpacing);
  const startY = options.verticalAlign === 'Top'
    ? 0
    : options.verticalAlign === 'Bottom'
      ? height - blockHeight
      : (height - blockHeight) * 0.5;
  const offsets = lineOffsets(visibleLines, lineSpacing);
  const lines = visibleLines.map((line, index) => {
    const measuredWidth = measuredLineWidth(line.glyphs);
    const geometry = options.alignByGeometry ? textGeometryBounds(line.glyphs) : null;
    const leftExtent = geometry?.[0] ?? 0;
    const rightExtent = geometry?.[1] ?? measuredWidth;
    const x = options.alignment === 'Left'
      ? (leftExtent === 0 ? 0 : -leftExtent)
      : options.alignment === 'Right'
        ? width - rightExtent
        : (width - leftExtent - rightExtent) * 0.5;
    return {
      text: line.glyphs.map((glyph) => glyph.character).join(''),
      x,
      y: startY + offsets[index],
      width: measuredWidth,
      height: line.height,
      runs: buildRuns(line.glyphs, line.height),
    };
  });
  return {
    lines,
    fontSize,
    glyphScale: base.glyphScale,
    advance: base.advance,
    lineHeight: base.lineHeight,
    lineAdvance: base.lineHeight * lineSpacing,
    blockHeight,
    truncated: parsed.truncated
      || authored.dropped
      || linesTruncated
      || visibleLines.length < boundedLines.length
      || (parsed.glyphs.length > 0 && boundedLines.length === 0),
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
