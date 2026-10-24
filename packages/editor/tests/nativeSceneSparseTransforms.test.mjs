// Author: MiYu. Compare sparse token-owned Scene transforms with complete immutable frame hierarchies.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import ts from '../node_modules/typescript/lib/typescript.js';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
const { createNativeViewportPresentationReader } = await server.ssrLoadModule('/src/nativeViewportPresentation.ts');
const { buildWorldTransforms, createOwnedWorldTransformReader, resolvedTransform } = await server.ssrLoadModule('/src/worldTransform.ts');
test.after(() => server.close());
const transform = (x = 0) => ({ position: [x, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
const mesh = { MeshRenderer: { mesh: 'actual.glb#pose=0' } };
const node = (entity, components = {}, extra = {}) => ({ entity, components: { Transform: transform(entity), ...components }, ...extra });
const world = entities => ({ entities, sourceEntities: entities, clearColor: [0, 0, 0, 1], simulationTime: 0 });

test('owned sparse resolver omits unrelated leaves, preserves parent invalidation and keeps full calls complete', () => {
  let omittedReads = 0;
  const parent = node(1), child = node(2, {}, { parent: 1 }), omitted = { entity: 3, components: { get Transform() { omittedReads++; return transform(3); } } };
  const read = createOwnedWorldTransformReader(), entities = [parent, child, omitted], sparse = read(entities, [2]);
  assert.equal(omittedReads, 0); assert.deepEqual([...sparse.keys()], [2, 1]);
  const complete = read(entities); assert.equal(omittedReads, 1); assert.equal(complete.size, 3); assert.notEqual(complete, sparse);
  assert.equal(complete.get(2), sparse.get(2)); assert.deepEqual([...complete], [...buildWorldTransforms(entities)]);
  const newer = [node(1, { Transform: transform(30) }), child, omitted];
  const moved = read(newer, [2]); assert.equal(moved.get(2).transform.position[0], 32); assert.equal(sparse.get(2).transform.position[0], 3);
  assert.equal(read(entities, []).size, 0);
});

test('a deep selected mesh chain uses author traversal without growing the sparse recursion stack', () => {
  const entities = Array.from({ length: 5000 }, (_, i) => node(i + 1, mesh, { parent: i || null }));
  const expected = buildWorldTransforms(entities), read = createOwnedWorldTransformReader();
  assert.deepEqual([...read(entities, [5000])], [...expected]);
  const p = createNativeViewportPresentationReader()(world(entities)), frame = p.sceneBrowserFrame(new Set([5000]), 5000);
  assert.deepEqual(frame.transforms.get(5000), expected.get(5000)); assert.deepEqual(frame.entries.map(e => e.e.entity), [5000]);
});

test('Scene browser roots include selected and primary handles, helper parents and mixed Light2D without resolving ordinary meshes', () => {
  let omittedReads = 0;
  const entities = [node(1, { ...mesh, Transform: { ...transform(10), rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], scale: [-2, 3, 1] } }), node(2, { SpriteRenderer: {} }, { parent: 1 }), { entity: 3, components: { ...mesh, get Transform() { omittedReads++; return transform(3); } } }, node(4, { ...mesh, Light2D: {} }), node(5, mesh, { active: false }), node(6, mesh), node(7, { ...mesh, Camera3D: {} }), node(8, { ...mesh, SpineSkeleton: {} }), node(9, { ...mesh, ParticleEmitter3D: {} }), node(10, { ...mesh, TrailRenderer2D: {} }), node(11, { Line2D: {} }), { entity: 12, parent: 1, components: { RectTransform: {} } }, node(13, {}, { active: false }), node(14, mesh, { parent: 13 })];
  const presentation = createNativeViewportPresentationReader()(world(entities)), selected = new Set([5, 14]), frame = presentation.sceneBrowserFrame(selected, 6);
  assert.equal(omittedReads, 0); assert.equal(frame.transforms.has(3), false);
  assert.deepEqual(frame.entries.map(e => [e.e.entity, e.hierarchyOrder]), [[2, 1], [7, 6], [8, 7], [9, 8], [10, 9], [11, 10]]);
  for (const id of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) assert.ok(frame.transforms.has(id), 'required browser root or ancestor ' + id);
  assert.equal(frame.transforms.get(5).active, false); assert.equal(frame.transforms.get(14).active, false);
  assert.equal(presentation.sceneBrowserFrame(new Set([14, 5]), 6), frame);
  assert.deepEqual(presentation.sceneOverlayEntries().map(e => e.e.entity), [7, 8]); assert.equal(omittedReads, 0, 'overlay collection does not request all mesh transforms');
  const full = presentation.worldTransforms(); assert.equal(omittedReads, 1);
  for (const [id, value] of frame.transforms) assert.deepEqual(value, full.get(id));
  assert.deepEqual([...full], [...buildWorldTransforms(entities)]);
  selected.add(3); const changed = presentation.sceneBrowserFrame(selected, 6); assert.notEqual(changed, frame); assert.ok(changed.entries.some(e => e.e.entity === 3));
  assert.equal(frame.transforms.has(3), false, 'older selection frames retain their own complete partial map');
});

test('new owned revisions preserve ancestor edits, reparenting, removals, author order and old frame poses', () => {
  const parent = node(1, mesh), child = node(2, { BoxCollider3D: {} }, { parent: 1 }), plain = node(3, mesh), read = createNativeViewportPresentationReader();
  const earlier = world([parent, child, plain]), first = read(earlier).sceneBrowserFrame(new Set([2]), 2);
  const revisions = [world([node(1, { ...mesh, Transform: transform(20) }), child, plain]), world([child, plain]), world([plain, node(1, mesh, { active: false }), child]), world([plain, node(2, { ParticleEmitter2D: {} }, { parent: 3 }), parent]), earlier];
  for (const revision of revisions) {
    const p = read(revision), actual = p.sceneBrowserFrame(new Set([2]), 2), full = buildWorldTransforms(revision.entities);
    for (const [id, value] of actual.transforms) assert.deepEqual(value, full.get(id));
    for (const entry of actual.entries) { assert.equal(entry.e, revision.entities[entry.hierarchyOrder]); assert.deepEqual(entry.t, resolvedTransform(full, entry.e.entity)); }
    assert.deepEqual(p.sceneOverlayEntries(), p.worldEntries().filter(({ e }) => e.components.SpineSkeleton || e.components.Camera2D || e.components.Camera3D || !e.components.MeshRenderer && (e.components.PointLight || e.components.SpotLight || e.components.Light2D || e.components.DirectionalLight)));
  }
  assert.equal(first.transforms.get(2).transform.position[0], 3); assert.equal(read(earlier).sceneBrowserFrame(new Set([2]), 2).transforms.get(2).transform.position[0], 3);
});

test('cyclic owned roots use the full author traversal result, including cache repair and duplicate records', () => {
  const read = createOwnedWorldTransformReader(), a = node(1, mesh, { parent: 2 }), b = node(2, {}, { parent: 1 }), c = node(3, {}, { parent: 1 });
  const worlds = [[a, b, c], [c, b, a], [a, node(2), c], [node(1, mesh), c, node(1, { Transform: transform(30) })], [a, b, c]];
  for (const entities of [...worlds, ...worlds.toReversed()]) {
    const actual = read(entities, [2, 3]), expected = buildWorldTransforms(entities);
    for (const [id, value] of actual) assert.deepEqual(value, expected.get(id));
    assert.deepEqual([...read(entities)], [...expected], 'later full reads cannot inherit an earlier partial result');
    const p = createNativeViewportPresentationReader()(world(entities)), frame = p.sceneBrowserFrame(new Set(), 3);
    for (const [id, value] of frame.transforms) assert.deepEqual(value, expected.get(id));
  }
});

test('production token frames share sparse entries and transforms while fallback clears no full-map consumer', () => {
  const source = readFileSync(new URL('../src/panels/Viewport.tsx', import.meta.url), 'utf8'), ast = ts.createSourceFile('Viewport.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX), expressions = {};
  function visit(node) { if (ts.isVariableDeclaration(node) && ['nativeSceneBrowser', 'transformSource', 'worldTransforms', 'worldEntries'].includes(node.name.getText(ast))) expressions[node.name.getText(ast)] = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.equal(Object.keys(expressions).length, 4);
  const assignment = source.split('\n').find(line => line.trimStart().startsWith('sceneTransformsRef.current = editScene')); assert.ok(assignment);
  const run = new Function('env', ts.transpileModule('const {nativeGamePending,nativeGameReady,nativeSceneFrame,displayedPresentation,selSet,p,editScene,sceneTransformsRef,buildWorldTransforms,resolvedTransform,isActive}=env;' + ['nativeSceneBrowser', 'transformSource', 'worldTransforms'].map(name => 'const ' + name + '=' + expressions[name] + ';').join('') + assignment + 'const worldEntries=' + expressions.worldEntries + ';return {nativeSceneBrowser,worldTransforms,worldEntries};', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  const entities = [node(1), node(2, mesh), node(3, mesh)], p = createNativeViewportPresentationReader()(world(entities)); let fullCalls = 0;
  const env = { nativeGamePending: false, nativeGameReady: false, nativeSceneFrame: { meshPickToken: 'exact frame' }, displayedPresentation: { ...p, worldTransforms() { fullCalls++; return p.worldTransforms(); } }, selSet: new Set(), p: { selected: 2, entities }, editScene: true, sceneTransformsRef: { current: null }, buildWorldTransforms, resolvedTransform, isActive: p.active };
  const token = run(env); assert.equal(fullCalls, 0); assert.equal(token.worldTransforms.has(3), false); assert.equal(token.worldTransforms.has(2), true); assert.equal(token.worldEntries, token.nativeSceneBrowser.entries); assert.equal(env.sceneTransformsRef.current, null);
  env.nativeSceneFrame = null; const fallback = run(env); assert.equal(fullCalls, 1); assert.equal(fallback.worldTransforms.size, 3); assert.equal(fallback.worldEntries, p.worldEntries()); assert.equal(env.sceneTransformsRef.current.transforms, fallback.worldTransforms);
  env.nativeGameReady = true; env.editScene = false; const game = run(env); assert.equal(game.worldTransforms.size, 0); assert.deepEqual(game.worldEntries, []);
});

test('sparse frame revisions and older snapshots match complete hierarchy values across deterministic topology changes', () => {
  let seed = 731; const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let entities = Array.from({ length: 75 }, (_, i) => node(i + 1, i % 3 ? mesh : {}, { parent: i ? random(i + 1) || null : null }));
  const read = createNativeViewportPresentationReader(), older = [];
  const verify = frame => {
    const selected = new Set([random(80), random(80)]), p = read(frame), sparse = p.sceneBrowserFrame(selected, random(80)), full = buildWorldTransforms(frame.entities);
    for (const [id, value] of sparse.transforms) assert.deepEqual(value, full.get(id));
    for (const entry of sparse.entries) { assert.equal(entry.e, frame.entities[entry.hierarchyOrder]); assert.deepEqual(entry.t, resolvedTransform(full, entry.e.entity)); }
    assert.deepEqual([...p.worldTransforms()], [...full], 'requesting a full map after a partial frame resolves every node');
  };
  for (let revision = 0; revision < 100; revision++) {
    older.push(world(entities)); entities = entities.slice(); const index = random(entities.length), old = entities[index];
    entities[index] = node(old.entity, random(3) ? mesh : { ParticleEmitter2D: {} }, { parent: random(80) || null, active: !!random(3) });
    if (revision % 5 === 0) entities.reverse();
    if (revision % 9 === 0) entities[index] = { ...entities[index], components: { RectTransform: {} } };
    const current = world(entities); verify(current);
    if (revision % 7 === 0) { verify(older[random(older.length)]); verify(current); }
  }
});
