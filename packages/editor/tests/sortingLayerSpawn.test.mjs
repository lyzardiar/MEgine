import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('all direct 2D renderer creation paths initialize the project sorting layer', () => {
  const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8');
  for (const [method, nextMethod] of [
    ['spawnSpriteQuad() {', 'spawnAnimatedSprite2D() {'],
    ['spawnAnimatedSprite2D() {', 'spawnLine2D() {'],
    ['spawnLine2D() {', 'spawnParticleEmitter2D() {'],
  ]) {
    const start = source.indexOf(method);
    const end = source.indexOf(nextMethod, start + method.length);
    assert.notEqual(start, -1, `${method} must exist`);
    assert.notEqual(end, -1, `${nextMethod} must delimit ${method}`);
    assert.match(source.slice(start, end), /sorting_layer:\s*'default'/, `${method} must initialize sorting_layer`);
  }
});
