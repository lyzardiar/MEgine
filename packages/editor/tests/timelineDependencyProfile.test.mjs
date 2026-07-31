import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineDependencyProfile } from '../src/timelineDependencyProfile.ts';

function timeline(name, tracks = []) {
  return { version: 1, name, frame_rate: 60, duration: 4, groups: [], tracks };
}

function control(id, child) {
  return {
    type: 'control', id, name: id, target: '.', solo: false, muted: false, locked: false,
    clips: [{
      start: 0, duration: 1, timeline: child, clip_in: 0, speed: 1,
      extrapolation: 'none', binding_overrides: {},
    }],
  };
}

test('Timeline dependency profile counts unique assets and preserves every edge', () => {
  const leaf = timeline('Leaf', [{
    type: 'signal', id: 'signals', name: 'Signals', solo: false, muted: false, locked: false,
    markers: [{ name: 'One', time: 0.5 }, { name: 'Two', time: 1 }],
  }]);
  const child = timeline('Child', [control('leaf-a', 'Assets/Leaf.mtimeline'), control('leaf-b', 'Assets/Leaf.mtimeline')]);
  const root = timeline('Root', [control('child', 'Assets/Child.mtimeline')]);
  const profile = timelineDependencyProfile(root, 'Assets/Root.mtimeline', new Map([
    ['assets/child.mtimeline', child],
    ['assets/leaf.mtimeline', leaf],
  ]));
  assert.deepEqual(profile.nodes.map((node) => node.path), [
    'Assets/Root.mtimeline', 'Assets/Child.mtimeline', 'Assets/Leaf.mtimeline',
  ]);
  assert.equal(profile.edges.length, 3);
  assert.equal(profile.totalTracks, 4);
  assert.equal(profile.totalItems, 5);
  assert.equal(profile.maximumDepth, 2);
  assert.equal(profile.truncated, false);
});

test('Timeline dependency profile reports missing, cyclic, and depth-limited edges', () => {
  const root = timeline('Root', [
    control('child', 'Assets/Child.mtimeline'),
    control('missing', 'Assets/Missing.mtimeline'),
  ]);
  const child = timeline('Child', [control('back', 'Assets/Root.mtimeline')]);
  const assets = new Map([
    ['assets/root.mtimeline', root],
    ['assets/child.mtimeline', child],
  ]);
  const cyclic = timelineDependencyProfile(root, 'Assets/Root.mtimeline', assets);
  assert.equal(cyclic.missingAssets, 1);
  assert.equal(cyclic.cycles, 1);
  assert.equal(cyclic.depthLimited, 0);
  assert.deepEqual(cyclic.edges.map((edge) => edge.status), ['loaded', 'missing', 'cycle']);

  const limited = timelineDependencyProfile(root, 'Assets/Root.mtimeline', assets, 256, 0);
  assert.equal(limited.depthLimited, 1);
  assert.equal(limited.nodes.length, 1);
});

test('Timeline dependency profile enforces bounded asset and edge output', () => {
  const children = new Map();
  const tracks = [];
  for (let index = 0; index < 20; index += 1) {
    const path = `Assets/Child-${index}.mtimeline`;
    tracks.push(control(`child-${index}`, path));
    children.set(path.toLowerCase(), timeline(`Child-${index}`));
  }
  const profile = timelineDependencyProfile(timeline('Root', tracks), 'Assets/Root.mtimeline', children, 4);
  assert.equal(profile.nodes.length, 4);
  assert.equal(profile.edges.length, 20);
  assert.equal(profile.truncated, true);
});

test('Timeline dependency profile uses shortest dependency depth regardless of track order', () => {
  const leaf = timeline('Leaf');
  const deep = timeline('Deep', [control('deep-leaf', 'Assets/Leaf.mtimeline')]);
  const root = timeline('Root', [
    control('deep-first', 'Assets/Deep.mtimeline'),
    control('leaf-direct-second', 'Assets/Leaf.mtimeline'),
  ]);
  const profile = timelineDependencyProfile(root, 'Assets/Root.mtimeline', new Map([
    ['assets/deep.mtimeline', deep],
    ['assets/leaf.mtimeline', leaf],
  ]));
  assert.equal(profile.nodes.find((node) => node.name === 'Leaf').depth, 1);
  assert.equal(profile.maximumDepth, 1);
});

test('Timeline dependency profile stops collecting edges at its bounded limit', () => {
  const tracks = Array.from({ length: 20 }, (_, index) => (
    control(`missing-${index}`, `Assets/Missing-${index}.mtimeline`)
  ));
  const profile = timelineDependencyProfile(
    timeline('Root', tracks),
    'Assets/Root.mtimeline',
    new Map(),
    1,
  );
  assert.equal(profile.edges.length, 8);
  assert.equal(profile.missingAssets, 8);
  assert.equal(profile.truncated, true);
});
