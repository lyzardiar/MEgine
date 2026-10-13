// Author: MiYu. Inspector selection resolution preserves multi-edit and locked selections without scanning for single selection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';
const source = readFileSync(new URL('../src/panels/Inspector.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const entitiesById =', source.indexOf('export function Inspector(')), end = source.indexOf('  const toggleInspectorLock =', start);
assert.ok(start > 0 && end > start);
const resolve = vm.runInNewContext(ts.transpileModule(`(props, lockedSelection) => { ${source.slice(start, end)} return { inspectedEntity, inspectedIds, inspectedSelectionCount, selectedEntities: inspectedIds.map(id => entitiesById.get(id)).filter(Boolean) }; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
const entity = id => ({ entity: id, name: `Entity ${id}`, components: {} });
test('single unlocked selection does not enumerate unrelated scene entities', () => {
 const selected = entity(1), entities = { [Symbol.iterator]() { throw Error('unrelated entities enumerated'); } };
 const result = resolve({ entity: selected, entities, selectedIds: [1] }, null);
 assert.equal(result.inspectedEntity, selected); assert.equal(result.inspectedSelectionCount, 1);
});
test('unlocked multiselection resolves live records and primary overrides while locked selection follows its retained IDs', () => {
 const records = [entity(1), entity(2), entity(3)], selected = { ...records[1], name: 'Current primary' };
 const props = { entities: records, entity: selected, selectedIds: [1, 2], selectionCount: 2 };
 const multi = resolve(props, null); assert.equal(multi.inspectedSelectionCount, 2);
 assert.equal(multi.selectedEntities.length, 2); assert.equal(multi.selectedEntities[0], records[0]); assert.equal(multi.selectedEntities[1], selected);
 const locked = resolve({ ...props, selectedIds: [3], entity: records[2], selectionCount: 1 }, { ids: [1, 2], primary: 2 });
 assert.equal(locked.inspectedEntity, records[1]); assert.equal(locked.inspectedSelectionCount, 2);
 const deleted = resolve({ entity: records[2], entities: [records[0], records[2]] }, { ids: [1, 2], primary: 2 });
 assert.equal(deleted.inspectedEntity, records[0]); assert.equal(deleted.inspectedSelectionCount, 1);
});
