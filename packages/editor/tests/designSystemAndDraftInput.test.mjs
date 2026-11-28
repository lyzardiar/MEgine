import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('DraftNumberInput evaluates safe math expressions and formats clean drafts', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { evaluateNumericExpression, formatNumericDraft } = await server.ssrLoadModule(
      '/src/components/ui/DraftNumberInput.tsx',
    );
    assert.equal(evaluateNumericExpression('42'), 42);
    assert.equal(evaluateNumericExpression('-12.5'), -12.5);
    assert.equal(evaluateNumericExpression('1920/2'), 960);
    assert.equal(evaluateNumericExpression('360 * 0.5 + 15'), 195);
    assert.equal(evaluateNumericExpression('(100 - 20) / 4'), 20);
    assert.equal(evaluateNumericExpression('10 / 0'), null);
    assert.equal(evaluateNumericExpression('alert(1)'), null);
    assert.equal(evaluateNumericExpression(''), null);
    assert.equal(formatNumericDraft(-0.00001), '0');
    assert.equal(formatNumericDraft(3.14159, 3), '3.142');
  } finally {
    await server.close();
  }
});

test('i18n defaults to zh-CN, interpolates params, and toggles cleanly with theme', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { getLocale, setLocale, t } = await server.ssrLoadModule('/src/i18n/index.ts');
    const { getTheme, setTheme, toggleTheme } = await server.ssrLoadModule('/src/theme/index.ts');

    assert.equal(getLocale(), 'zh-CN');
    assert.equal(t('hub.recentCount', { count: 3, limit: 12 }), '共 3/12 个最近工程');
    setLocale('en-US');
    assert.equal(t('hub.recentCount', { count: 3, limit: 12 }), '3/12 recent projects');
    setLocale('zh-CN');

    assert.equal(getTheme(), 'dark');
    assert.equal(toggleTheme(), 'light');
    assert.equal(getTheme(), 'light');
    setTheme('dark');
  } finally {
    await server.close();
  }
});

test('ColorPickerPopover converts RGB/HSV/Hex cleanly and rejects invalid hex', async () => {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { rgbToHsv, hsvToRgb, rgbToHex, hexToRgbNormalized } = await server.ssrLoadModule(
      '/src/components/ui/ColorPickerPopover.tsx',
    );
    assert.equal(rgbToHex(1, 0, 0.5), '#ff0080');
    assert.deepEqual(hexToRgbNormalized('#3b82f6'), [0.2314, 0.5098, 0.9647]);
    assert.deepEqual(hexToRgbNormalized('#fff'), [1, 1, 1]);
    assert.equal(hexToRgbNormalized('not-a-color'), null);

    const [h, s, v] = rgbToHsv(0.2, 0.6, 0.8);
    const [r2, g2, b2] = hsvToRgb(h, s, v);
    assert.ok(Math.abs(r2 - 0.2) < 0.01 && Math.abs(g2 - 0.6) < 0.01 && Math.abs(b2 - 0.8) < 0.01);
  } finally {
    await server.close();
  }
});
