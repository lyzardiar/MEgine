// Author: MiYu. Native map enumeration order must not reorder single- or multi-selection components.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../node_modules/typescript/lib/typescript.js';
const source=readFileSync(new URL('../src/panels/Inspector.tsx',import.meta.url),'utf8');
const start=source.indexOf('type UiInspectorGroup'),end=source.indexOf('const MIXED_SELECT_VALUE',start);
const compare=vm.runInNewContext(ts.transpileModule(`(()=>{${source.slice(start,end)}return compareInspectorComponents;})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
test('components have the same order across permutations and equal UI groups',()=>{
  const names=['MeshRenderer','Camera3D','Canvas','Image','RawImage','LayoutGroup','InputField','Button','ZBehaviour','ABehaviour'];
  for(const grouped of [false,true]){
    const expected=[...names].sort((a,b)=>compare(a,b,grouped));
    for(let offset=0;offset<names.length;offset++)assert.deepEqual([...names.slice(offset),...names.slice(0,offset)].reverse().sort((a,b)=>compare(a,b,grouped)),expected);
  }
});
