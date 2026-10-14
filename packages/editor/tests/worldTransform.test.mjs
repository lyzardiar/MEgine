// Author: MiYu. Verify hierarchy values, cycle handling and stable traversal order.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWorldTransforms,
  createOwnedWorldTransformReader,
  parentWorldTransform,
  resolvedTransform,
  worldDeltaToLocal,
  worldAxisScaleDeltaToLocal,
  worldPointToLocal,
  worldTransformToLocal,
} from '../src/worldTransform.ts';

const transform = (position, rotation = [0, 0, 0, 1], scale = [1, 1, 1]) => ({
  position,
  rotation,
  scale,
});

test('sparse transforms retain parent TRS, active state and duplicate records across shallow and deep queries', () => {
  const entities = Array.from({ length: 24 }, (_, i) => ({ entity: i, parent: i ? i - 1 : null, active: i !== 7, components: { Transform: transform([1, 2, 3]) } }));
  entities.push({ entity: 0, components: { Transform: transform([5, 0, 0]) } });
  for (const id of [0, 2, 3, 4, 5, 23]) {
    const sparse = buildWorldTransforms(entities, [id]), full = buildWorldTransforms(entities);
    assert.equal(sparse.size, id + 1);
    for (const [key, value] of sparse) assert.deepEqual(value, full.get(key));
    assert.deepEqual(sparse.get(id).transform.position, [5 + id, 2 * id, 3 * id]);
  }
  entities[2].parent = 999;
  for (const id of [2, 3, 23]) assert.deepEqual(buildWorldTransforms(entities, [id]).get(id), buildWorldTransforms(entities).get(id));
  assert.deepEqual([...buildWorldTransforms(entities, [])], []);
});

test('editor hierarchy resolves the same nested TRS contract as runtime', () => {
  const quarterTurn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  const entities = [
    { entity: 1, components: { Transform: transform([10, 0, 0], quarterTurn, [2, 3, 1]) } },
    { entity: 2, parent: 1, components: { Transform: transform([1, 0, 0], undefined, [0.5, 0.5, 0.5]) } },
  ];
  const nodes = buildWorldTransforms(entities);
  const child = resolvedTransform(nodes, 2);
  assert.ok(Math.abs(child.position[0] - 10) < 1e-6);
  assert.ok(Math.abs(child.position[1] - 2) < 1e-6);
  assert.deepEqual(child.scale, [1, 1.5, 0.5]);
  const parent = parentWorldTransform(entities, nodes, 2);
  const local = worldPointToLocal(parent, child.position);
  assert.ok(Math.abs(local[0] - 1) < 1e-6);
  assert.ok(Math.abs(local[1]) < 1e-6);
});

test('world deltas convert through parent rotation and non-uniform scale', () => {
  const parent = transform([5, 6, 7], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 4, 1]);
  const local = worldDeltaToLocal(parent, [0, 2, 0]);
  assert.ok(Math.abs(local[0] - 1) < 1e-6);
  assert.ok(Math.abs(local[1]) < 1e-6);
  assert.equal(worldAxisScaleDeltaToLocal(parent, 0, 2), 1);
  assert.equal(worldAxisScaleDeltaToLocal(parent, 1, 2), 0.5);
});

test('world Transform converts back to a reparented local Transform', () => {
  const parent = transform([10, 0, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [2, 3, 1]);
  const world = transform([10, 2, 0], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [1, 1.5, 0.5]);
  const local = worldTransformToLocal(parent, world);
  assert.ok(Math.abs(local.position[0] - 1) < 1e-6);
  assert.ok(Math.abs(local.position[1]) < 1e-6);
  assert.deepEqual(local.scale, [0.5, 0.5, 0.5]);
  assert.ok(Math.abs(local.rotation[3] - 1) < 1e-6);
});

test('inactive and cyclic hierarchy branches resolve inactive', () => {
  const entities = [
    { entity: 1, parent: 2, components: { Transform: transform([0, 0, 0]) } },
    { entity: 2, parent: 1, components: { Transform: transform([0, 0, 0]) } },
    { entity: 3, active: false, components: { Transform: transform([0, 0, 0]) } },
    { entity: 4, parent: 3, components: { Transform: transform([0, 0, 0]) } },
  ];
  const nodes = buildWorldTransforms(entities);
  assert.equal(nodes.get(1).active, false);
  assert.equal(nodes.get(2).active, false);
  assert.equal(nodes.get(4).active, false);
});

test('cycle and missing-parent results finish every reserved node in first-visit order', () => {
  const entities = [
    { entity: 3, parent: 1, components: { Transform: transform([3, 0, 0]) } },
    { entity: 1, parent: 2, components: { Transform: transform([1, 0, 0]) } },
    { entity: 2, parent: 1, components: { Transform: transform([2, 0, 0]) } },
    { entity: 4, parent: 4, components: { Transform: transform([4, 0, 0]) } },
    { entity: 5, parent: 999, components: { Transform: transform([5, 0, 0]) } },
    { entity: 6, parent: 1, components: {} },
  ];
  const summarize = nodes => [...nodes].map(([id, node]) => [id, node.active, node.hasTransform, node.transform.position[0]]);
  const expected = [[3, false, true, 6], [1, false, true, 3], [2, false, true, 2], [4, false, true, 4], [5, false, true, 5], [6, false, false, 3]];
  assert.deepEqual(summarize(buildWorldTransforms(entities)), expected);
  const read = createOwnedWorldTransformReader();
  for (let pass = 0; pass < 3; pass++) assert.deepEqual(summarize(read(entities)), expected);
});

test('requested world transforms resolve only their ancestors and preserve hierarchy validity', () => {
  const entities = [
    { entity: 1, active: false, components: { Transform: transform([10, 0, 0]) } },
    { entity: 2, parent: 1, components: { Transform: transform([2, 3, 4]) } },
    { entity: 3, parent: 999, components: { Transform: transform([4, 5, 6]) } },
    { entity: 4, parent: 5, components: { Transform: transform([1, 0, 0]) } },
    { entity: 5, parent: 4, components: { Transform: transform([2, 0, 0]) } },
  ];
  const full = buildWorldTransforms(entities), sparse = buildWorldTransforms(entities, [2, 3, 5]);
  for (const id of [1, 2, 3]) assert.deepEqual(sparse.get(id), full.get(id));
  for (const id of [4, 5]) assert.equal(sparse.get(id).active, false);
  assert.equal(buildWorldTransforms(entities, []).size, 0);
  const unused = { entity: 6, components: { get Transform() { throw new Error('unrelated transform resolved'); } } };
  assert.deepEqual(buildWorldTransforms([...entities, unused], [2]).get(2), full.get(2));
});

const fixed = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) fixed(child); Object.freeze(value); }
  return value;
};
const node = (entity, parent = null, x = entity, active = true) => fixed({ entity, parent, active, components: { Transform: transform([x, 2, -1], [0, 0, Math.SQRT1_2, Math.SQRT1_2], [-2, 3, 1]) } });
const compare = (read, worlds) => worlds.map(entities => {
  const actual = read(entities);
  assert.deepEqual([...actual], [...buildWorldTransforms(entities)], 'full resolved values and Map insertion order');
  return actual;
});

test('owned frame reuse invalidates descendants on ancestor Transform, activity and parent membership changes', () => {
  const read = createOwnedWorldTransformReader(), parent = node(1), child = node(2, 1), leaf = node(3, 2), unrelated = node(4);
  const worlds = [[parent, child, leaf, unrelated], [parent, child, leaf, unrelated], [node(1, null, 15), child, leaf, unrelated], [node(1, null, 15, false), child, leaf, unrelated], [child, leaf, unrelated], [parent, child, leaf, unrelated]];
  const results = compare(read, worlds);
  for (const id of [1, 2, 3, 4]) assert.equal(results[0].get(id), results[1].get(id));
  for (const id of [1, 2, 3]) assert.notEqual(results[1].get(id), results[2].get(id));
  assert.equal(results[2].get(4), results[0].get(4));
  assert.equal(results[3].get(3).active, false); assert.equal(results[4].get(3).active, false); assert.equal(results[5].get(3).active, true);
  compare(read, [worlds[0], worlds[2], worlds[0]]);
});

test('owned frames preserve reorder, duplicate last-wins records, transformless chains and fresh session records', () => {
  const read = createOwnedWorldTransformReader(), a = node(1), b = fixed({ entity: 2, parent: 1, components: {} }), c = node(3, 2), d = node(1, null, 20);
  const worlds = [[a, b, c], [c, b, a], [a, b, c, d], [d, a, c, b], [c, b], [a, b, c]];
  compare(read, worlds);
  const before = read(worlds[0]), fresh = JSON.parse(JSON.stringify(worlds[0])).map(fixed), after = read(fresh);
  assert.deepEqual([...after], [...before]); assert.notEqual(after.get(3), before.get(3));
  compare(read, [worlds[0], fresh, worlds[0]]);
});

test('owned frame cache preserves cycle resolution in both traversal orders and cycle repair', () => {
  const read = createOwnedWorldTransformReader(), a = node(1, 2), b = node(2, 1), child = node(3, 1), root = node(2), self = node(4, 4);
  const worlds = [[a, b, child, self], [b, a, self, child], [a, root, child], [child, b, a], [root, a, child], [a, b, child, self]];
  compare(read, [...worlds, ...worlds.toReversed()]);
});

test('owned frame resolver matches uncached values and order across deterministic forest revisions', () => {
  const read = createOwnedWorldTransformReader(); let seed = 4271;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let entities = Array.from({ length: 60 }, (_, i) => node(i + 1, i ? random(i + 1) || null : null));
  const earlier = [];
  for (let frame = 0; frame < 120; frame++) {
    earlier.push(entities); entities = entities.slice(); const index = random(entities.length), old = entities[index];
    entities[index] = random(4) ? node(old.entity, random(64) || null, random(20), !!random(2)) : fixed({ entity: old.entity, parent: random(64) || null, components: {} });
    if (frame % 3 === 0) entities.reverse();
    compare(read, [entities]);
    if (frame % 7 === 0) compare(read, [earlier[random(earlier.length)], entities]);
  }
});

test('mutable authored worlds remain uncached across direct edits', () => {
  const entities = [{ entity: 1, components: { Transform: transform([1, 0, 0]) } }];
  const first = buildWorldTransforms(entities); entities[0].components.Transform.position[0] = 9;
  assert.equal(first.get(1).transform.position[0], 1); assert.equal(buildWorldTransforms(entities).get(1).transform.position[0], 9);
});
