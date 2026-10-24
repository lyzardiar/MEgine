// Author: MiYu. Native UI topology skips fixed records while live edits and malformed hierarchies retain their semantics.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createOwnedSceneUiEntityReader, createSceneUiEntityReader, sceneUiEntities } = await server.ssrLoadModule('/src/ui/uiLayout.ts');
test.after(() => server.close());

test('owned topology does not dereference unchanged records across effect-only revisions', () => {
  let fixedReads = 0, changedReads = 0;
  const fixed = Array.from({ length: 3000 }, (_, index) => Object.freeze({ entity: index + 1, parent: index === 1 ? 1 : null, get components() { fixedReads++; return index === 0 ? { Canvas: {} } : {}; } }));
  const oldEffect = Object.freeze({ entity: 4000, components: { MeshRenderer: {}, Transform: { position: [0, 0, 0] } } });
  const read = createOwnedSceneUiEntityReader(), entities = [...fixed, oldEffect], first = read(entities), before = fixedReads;
  for (let frame = 0; frame < 30; frame++) {
    const next = [...fixed, Object.freeze({ entity: 4000, get components() { changedReads++; return { MeshRenderer: {}, Transform: { position: [frame, 0, 0] } }; } })];
    assert.deepEqual(read(next), first);
  }
  assert.equal(fixedReads, before, 'fixed records need no repeated ID, parent or root-component reads');
  assert.equal(changedReads, 30 * 3, 'only one replaced non-root record checks the three root components');
  assert.deepEqual(read(entities), first); assert.equal(fixedReads, before);
});

test('owned topology follows revisions, old restores, malformed links, duplicates, roots and order', () => {
  const read = createOwnedSceneUiEntityReader(), own = e => Object.freeze({ ...e, components: Object.freeze({ ...e.components }) });
  let entities = [{ entity: 1, components: {} }, { entity: 2, parent: 1, components: { Canvas: {} } }, { entity: 3, parent: 2, components: { Text: { text: 'old' } } }, { entity: 4, parent: 1, components: { MeshRenderer: {} } }].map(own);
  const old = entities, oldRows = read(old);
  const check = next => { entities = next; const rows = read(entities); assert.deepEqual(rows, sceneUiEntities(entities)); rows.forEach(e => assert.ok(entities.includes(e))); return rows; };
  check(entities.map(e => e.entity === 3 ? own({ ...e, components: { Text: { text: 'new' } } }) : e));
  assert.equal(oldRows.find(e => e.entity === 3).components.Text.text, 'old');
  check(entities.map(e => e.entity === 1 ? own({ ...e, active: false }) : e));
  check(entities.map(e => e.entity === 3 ? own({ ...e, parent: 99 }) : e));
  check(entities.map(e => e.entity === 4 ? own({ ...e, components: { Camera3D: {} } }) : e));
  check([...entities].reverse());
  check([...entities, own({ entity: 4, parent: 3, components: { Canvas: {} } })]);
  check(entities.map(e => e.entity === 1 ? own({ ...e, parent: 2 }) : e));
  check(entities.filter(e => e.entity !== 2));
  check(old); check([]); check([own({ entity: 9, components: { Camera2D: {} } })]);
  let seed = 3721;
  for (let round = 0; round < 100; round++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const id = seed % 12;
    let next = entities.map(e => e.entity === id ? own({ ...e, parent: seed % 5 === 0 ? 99 : seed % 9, components: seed % 3 ? {} : { Canvas: {} } }) : e);
    if (seed % 4 === 0) next.push(own({ entity: id, parent: seed % 9, components: seed % 2 ? { Camera3D: {} } : {} }));
    if (seed % 7 === 0) next.reverse();
    if (seed % 6 === 0) next = next.slice(1);
    check(next);
  }
  assert.deepEqual(read(old), oldRows);
});

test('live topology still observes in-place changes and production opts in only for owned presentation', () => {
  const read = createSceneUiEntityReader(), entities = [{ entity: 1, components: {} }, { entity: 2, components: {} }];
  assert.deepEqual(read(entities), []);
  entities[0].components.Canvas = {}; entities[1].parent = 1; assert.deepEqual(read(entities), entities);
  delete entities[0].components.Canvas; entities[1].components.Camera2D = {}; assert.deepEqual(read(entities), entities);
  entities[1].parent = 99; assert.deepEqual(read(entities), [entities[1]]);
  const source = readFileSync(new URL('../src/nativeViewportPresentation.ts', import.meta.url), 'utf8');
  assert.match(source, /const readSceneUiEntities = createOwnedSceneUiEntityReader<E>\(\)/);
  assert.match(source, /Live editable worlds never enter this cache/);
});
