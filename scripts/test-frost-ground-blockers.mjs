// Author: MiYu. Compare complete decoration output across mutable stationary blockers and fog changes.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { clientWorldFixture } from './frost-client-world-fixture.mjs';
const baseline = process.argv[2] ?? '1955996be78889656aeb26f8bcfd3e4bc4a57a31', root = new URL('../samples/frostbound-realms/', import.meta.url);
const scene = JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene', root))).world;
const old = execFileSync('git', ['show', `${baseline}:samples/frostbound-realms/Assets/Scripts/Main.js`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }), current = fs.readFileSync(new URL('Assets/Scripts/Main.js', root), 'utf8');
const hook = "  return {tick,install(value){state=value;editMap=value.map;mode='playing';paused=true;selected=[];},mutate(fn){fn(state);},mode(next){mode=next;}};";
const clients = [old, current].map(source => {
  assert.equal(source.split('  return {tick};').length, 2);
  const world = clientWorldFixture(scene, true), engine = Object.assign(world.engine, { assets: { sampleNodes: () => [] }, input: { keys: [], pressedKeys: ['RenderProbe'], buttons: [], pressedButtons: [], releasedButtons: [], pointer: [640, 360], viewport: [1280, 720] }, network: { poll: () => [], close() {}, send() {} }, storage: { load() {}, save() {} }, playAudio() {} });
  const context = vm.createContext({ engine }); vm.runInContext(source.replace('  return {tick};', hook), context); context.onTick(0); world.commit();
  let reads = 0; const visible = context.Frost.isVisible; context.Frost.isVisible = (...args) => { reads++; return visible(...args); };
  return { world, context, resetReads: () => { reads = 0; }, reads: () => reads };
});
let comparisons = 0; const callCounts = [];
function tick(label) {
  for (const client of clients) { client.resetReads(); client.context.onTick(0); client.world.commit(); }
  assert.deepEqual(clients[1].world.snapshot, clients[0].world.snapshot, label); comparisons++;
  callCounts.push({ label, before: clients[0].reads(), after: clients[1].reads() });
}
for (const mapName of ['defaultMap', 'highlandMap', 'siegeMap']) {
  for (const { context } of clients) {
    const state = context.Frost.create('skirmish', { map: context.Frost[mapName](), ai: [false, false] }); state.map.doodads = [];
    const patch = context.FrostTerrain.details(state.map, 192).find(Boolean); assert.ok(patch);
    const worker = state.units.find(unit => unit.kind === 'worker'), hall = state.units.find(unit => unit.kind === 'hall'); assert.ok(worker && hall);
    state.units = Array.from({ length: 128 }, (_, index) => ({ ...structuredClone(worker), id: 1000 + index, x: patch.x, z: patch.z }));
    state.units.push({ ...structuredClone(hall), id: 2000, team: 1, x: patch.x + 4.001, z: patch.z });
    state.visible = [Array(1024).fill(true), Array(1024).fill(true)]; state.explored = [Array(1024).fill(true), Array(1024).fill(true)];
    context.FrostClient.install(state); context.probePatch = patch;
  }
  tick(mapName + ' mobile units');
  const calls = callCounts.at(-1); assert.ok(calls.after < calls.before / 2, JSON.stringify(calls));
  for (const [label, mutate] of [
    ['stationary inside', (state, patch) => { state.units.at(-1).x = patch.x; }],
    ['exact radius', (state, patch) => { state.units.at(-1).x = patch.x + 4; }],
    ['outside radius', (state, patch) => { state.units.at(-1).x = patch.x + 4.001; }],
    ['enemy hidden', (state, patch) => { state.units.at(-1).x = patch.x; state.visible[0].fill(false); }],
    ['enemy revealed', state => { state.visible[0].fill(true); }],
    ['stationary removed', state => { state.units.pop(); }],
    ['stationary recreated', (state, patch) => { state.units.push({ ...state.units[0], id: 2000, kind: 'hall', team: 0, x: patch.x, z: patch.z }); }],
    ['dead stationary', state => { state.units.at(-1).hp = 0; }],
  ]) {
    for (const { context } of clients) context.FrostClient.mutate(state => mutate(state, context.probePatch));
    tick(mapName + ' ' + label);
  }
  for (const mode of ['editor', 'title', 'playing']) { for (const { context } of clients) context.FrostClient.mode(mode); tick(mapName + ' ' + mode); }
}
console.log(JSON.stringify({ author: 'MiYu', passed: true, baseline, completeWorldsCompared: comparisons, entities: scene.entities.length, callCounts, scope: 'Full native-normalized client worlds over three maps: 128 mobile units, stationary blockers moving across the exact radius, enemy fog hide/reveal, removal/recreation, dead blockers and editor/menu/game transitions. Visibility call counts include all client phases. Excludes native rendering, assets and IPC.' }));
