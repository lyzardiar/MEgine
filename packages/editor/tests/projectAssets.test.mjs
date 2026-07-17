import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProjectAssetPath,
  resolveProjectAssetPath,
} from '../src/projectAssets.ts';

test('project asset paths normalize separators and Assets casing', () => {
  assert.equal(normalizeProjectAssetPath('assets\\Animations\\walk.manim'), 'Assets/Animations/walk.manim');
  assert.equal(
    resolveProjectAssetPath('Assets/Characters/Hero/hero.manim', '../Shared/idle.manim'),
    'Assets/Characters/Shared/idle.manim',
  );
});

test('project asset paths reject traversal and non-Assets roots', () => {
  assert.throws(() => normalizeProjectAssetPath('../walk.manim'));
  assert.throws(() => normalizeProjectAssetPath('Content/walk.manim'));
  assert.throws(() => resolveProjectAssetPath('Assets/walk.manim', '../../outside.manim'));
});
