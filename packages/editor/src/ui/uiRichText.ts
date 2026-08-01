import type { UiTextFontStyle } from './uiTextLayout';

export type UiRichTextColor = [number, number, number, number];

export interface UiRichTextGlyph {
  character: string;
  fontSize: number;
  fontStyle: UiTextFontStyle;
  color: UiRichTextColor | null;
}

interface RichTextOptions {
  enabled: boolean;
  fontSize: number;
  fontScale: number;
  fontStyle: UiTextFontStyle;
}

type RichTagName = 'b' | 'i' | 'size' | 'color';

interface TextToken {
  kind: 'text';
  raw: string;
}

interface TagToken {
  kind: 'start' | 'end';
  name: RichTagName;
  raw: string;
  value?: number | UiRichTextColor;
  matched: boolean;
}

type RichToken = TextToken | TagToken;

const NAMED_COLORS: Readonly<Record<string, UiRichTextColor>> = {
  aqua: [0, 1, 1, 1], black: [0, 0, 0, 1], blue: [0, 0, 1, 1],
  brown: [165 / 255, 42 / 255, 42 / 255, 1], cyan: [0, 1, 1, 1],
  darkblue: [0, 0, 160 / 255, 1], fuchsia: [1, 0, 1, 1],
  green: [0, 128 / 255, 0, 1], grey: [128 / 255, 128 / 255, 128 / 255, 1],
  lightblue: [173 / 255, 216 / 255, 230 / 255, 1], lime: [0, 1, 0, 1],
  magenta: [1, 0, 1, 1], maroon: [128 / 255, 0, 0, 1],
  navy: [0, 0, 128 / 255, 1], olive: [128 / 255, 128 / 255, 0, 1],
  orange: [1, 165 / 255, 0, 1], purple: [128 / 255, 0, 128 / 255, 1],
  red: [1, 0, 0, 1], silver: [192 / 255, 192 / 255, 192 / 255, 1],
  teal: [0, 128 / 255, 128 / 255, 1], white: [1, 1, 1, 1],
  yellow: [1, 1, 0, 1],
};

function parseColor(value: string): UiRichTextColor | null {
  const normalized = value.toLowerCase();
  const named = NAMED_COLORS[normalized];
  if (named) return [...named];
  const match = /^#([0-9a-f]{6}|[0-9a-f]{8})$/iu.exec(normalized);
  if (!match) return null;
  const digits = match[1];
  return [
    Number.parseInt(digits.slice(0, 2), 16) / 255,
    Number.parseInt(digits.slice(2, 4), 16) / 255,
    Number.parseInt(digits.slice(4, 6), 16) / 255,
    digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
  ];
}

function unquote(value: string): string | null {
  if (value.length >= 2 && (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  )) return value.slice(1, -1);
  if (value.startsWith('"') || value.startsWith("'")
    || value.endsWith('"') || value.endsWith("'")) return null;
  return value;
}

function parseTag(raw: string): TagToken | null {
  const inner = raw.slice(1, -1).trim();
  const close = /^\/(b|i|size|color)$/iu.exec(inner);
  if (close) {
    return {
      kind: 'end',
      name: close[1].toLowerCase() as RichTagName,
      raw,
      matched: false,
    };
  }
  const simple = /^(b|i)$/iu.exec(inner);
  if (simple) {
    return {
      kind: 'start',
      name: simple[1].toLowerCase() as RichTagName,
      raw,
      matched: false,
    };
  }
  const valued = /^(size|color)=(\S+)$/iu.exec(inner);
  if (!valued) return null;
  const value = unquote(valued[2]);
  if (value == null) return null;
  if (valued[1].toLowerCase() === 'size') {
    if (!/^\d{1,3}$/u.test(value)) return null;
    const size = Number.parseInt(value, 10);
    if (size < 1 || size > 300) return null;
    return { kind: 'start', name: 'size', raw, value: size, matched: false };
  }
  const color = parseColor(value);
  return color
    ? { kind: 'start', name: 'color', raw, value: color, matched: false }
    : null;
}

function tokenize(value: string): RichToken[] {
  const tokens: RichToken[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf('<', cursor);
    if (open < 0) {
      tokens.push({ kind: 'text', raw: value.slice(cursor) });
      break;
    }
    if (open > cursor) tokens.push({ kind: 'text', raw: value.slice(cursor, open) });
    const close = value.indexOf('>', open + 1);
    if (close < 0) {
      tokens.push({ kind: 'text', raw: value.slice(open) });
      break;
    }
    const raw = value.slice(open, close + 1);
    tokens.push(parseTag(raw) ?? { kind: 'text', raw });
    cursor = close + 1;
  }
  if (value.length === 0) tokens.push({ kind: 'text', raw: '' });
  return tokens;
}

function markMatchedTags(tokens: RichToken[]): void {
  const stack: number[] = [];
  tokens.forEach((token, index) => {
    if (token.kind === 'start') {
      stack.push(index);
      return;
    }
    if (token.kind !== 'end') return;
    const startIndex = stack.at(-1);
    if (startIndex == null) return;
    const start = tokens[startIndex];
    if (start.kind !== 'start' || start.name !== token.name) {
      stack.length = 0;
      return;
    }
    start.matched = true;
    token.matched = true;
    stack.pop();
  });
}

function combineFontStyle(
  base: UiTextFontStyle,
  boldDepth: number,
  italicDepth: number,
): UiTextFontStyle {
  const bold = base === 'Bold' || base === 'BoldAndItalic' || boldDepth > 0;
  const italic = base === 'Italic' || base === 'BoldAndItalic' || italicDepth > 0;
  if (bold && italic) return 'BoldAndItalic';
  if (bold) return 'Bold';
  if (italic) return 'Italic';
  return 'Normal';
}

export function parseUiRichText(value: string, options: RichTextOptions): UiRichTextGlyph[] {
  const tokens = tokenize(value);
  if (options.enabled) markMatchedTags(tokens);
  let boldDepth = 0;
  let italicDepth = 0;
  let fontSize = options.fontSize;
  let color: UiRichTextColor | null = null;
  const stateStack: Array<{
    name: RichTagName;
    boldDepth: number;
    italicDepth: number;
    fontSize: number;
    color: UiRichTextColor | null;
  }> = [];
  const glyphs: UiRichTextGlyph[] = [];
  const append = (text: string) => {
    const fontStyle = combineFontStyle(options.fontStyle, boldDepth, italicDepth);
    for (const character of Array.from(text)) {
      glyphs.push({ character, fontSize, fontStyle, color: color ? [...color] : null });
    }
  };
  for (const token of tokens) {
    if (token.kind === 'text' || !options.enabled || !token.matched) {
      append(token.raw);
      continue;
    }
    if (token.kind === 'start') {
      stateStack.push({
        name: token.name,
        boldDepth,
        italicDepth,
        fontSize,
        color: color ? [...color] : null,
      });
      if (token.name === 'b') boldDepth += 1;
      else if (token.name === 'i') italicDepth += 1;
      else if (token.name === 'size') fontSize = (token.value as number) * options.fontScale;
      else color = [...token.value as UiRichTextColor];
      continue;
    }
    const previous = stateStack.pop();
    if (!previous || previous.name !== token.name) {
      append(token.raw);
      continue;
    }
    ({ boldDepth, italicDepth, fontSize, color } = previous);
  }
  return glyphs;
}
