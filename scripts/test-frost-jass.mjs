// Author: MiYu. Verify bounded typed JASS execution and original map unit initialization independently of visuals.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),game=path.join(root,'samples/frostbound-realms/game'),context=vm.createContext({});
for(const file of ['warcraft-jass','warcraft-unit-initialization'])vm.runInContext(fs.readFileSync(path.join(game,file+'.js'),'utf8'),context);
const J=context.FrostWarcraftJass,U=context.FrostWarcraftUnitInitialization;
const execute=(body,options={})=>J.create(J.parse(body),options).run('main');
const scalar=`globals
 integer array values
endglobals
function sum takes integer count returns integer
 local integer i = 0
 local integer result = 0
 loop
  exitwhen i >= count
  set values[i] = i * i
  if i == 2 then
   set result = result + values[i]
  elseif i != 3 and i >= 1 then
   set result = result + 1
  else
   set result = result - 1
  endif
  set i = i + 1
 endloop
 return result
endfunction
function main takes nothing returns integer
 return sum(5)
endfunction`;
assert.equal(execute(scalar).value,4);
const expr=(expression,type='integer')=>execute(`function main takes nothing returns ${type}\nreturn ${expression}\nendfunction`).value;
assert.equal(expr('2147483647 + 1'),-2147483648);assert.equal(expr('65536 * 65536'),0);assert.equal(expr('-7 / 2'),-3);assert.equal(expr('1 + 2 * 3'),7);assert.equal(expr("'hfoo'"),0x68666f6f);
assert.equal(expr('16777216.0 + 1.0','real'),16777216);assert.equal(expr('1 / 2.0','real'),.5);assert.equal(expr('not false and (true or Missing())','boolean'),true);assert.equal(expr('false and Missing()','boolean'),false);
assert.equal(expr('16777217 == 16777216.0','boolean'),true);assert.equal(expr('16777217 > 16777216.0','boolean'),false);
assert.equal(expr('"http://map" + "\\n\\\""','string'),'http://map\n"');
for(const source of ['function main takes nothing returns nothing\ncall constructor()\nendfunction','function main takes nothing returns nothing\nset missing=1\nendfunction','function main takes nothing returns integer\nreturn true\nendfunction'])assert.throws(()=>execute(source));
assert.throws(()=>execute('function main takes nothing returns nothing\nloop\nendloop\nendfunction',{instructionLimit:20}),/instruction limit/);
assert.throws(()=>execute('function main takes nothing returns nothing\ncall main()\nendfunction',{callLimit:4}),/call depth/);
assert.throws(()=>execute(scalar.replace('set values[i]','set values[8192]')),/array index/);
assert.throws(()=>J.parse('function main takes nothing returns nothing\ncall x({})\nendfunction'),/token/);
assert.throws(()=>expr('1 / 0'),/division by zero/);
assert.throws(()=>expr('true == 1','boolean'),/equality operands/);assert.throws(()=>expr('null == 0','boolean'),/type mismatch/);
assert.throws(()=>execute('function main takes nothing returns nothing\nlocal unknown u\nendfunction'),/Unsupported JASS type/);
assert.throws(()=>J.parse(' '.repeat(8*1024*1024+1)),/source/);
assert.throws(()=>J.parse('x '.repeat(250001)),/token limit/);
assert.throws(()=>expr('('.repeat(130)+'1'+')'.repeat(130)),/nesting limit/);
assert.throws(()=>expr(Array(300).fill('1').join('+')),/evaluation nesting/);
assert.throws(()=>execute('function main takes nothing returns string\nlocal string s="ab"\nloop\nset s=s+s\nendloop\nendfunction'),/string limit/);
assert.throws(()=>execute('function main takes nothing returns nothing\ncall n(true)\nendfunction',{natives:{n:{parameters:['integer'],returns:'nothing',call(){assert.fail('native must not receive a mistyped argument');}}}}),/type mismatch/);
const a=J.create(J.parse('globals\ninteger n=0\nendglobals\nfunction main takes nothing returns integer\nset n=n+1\nreturn n\nendfunction'));
assert.equal(a.run('main').value,1);assert.equal(a.run('main').value,2);
const map=path.join(root,'samples/frostbound-realms/Assets/Maps/amazonia'),source=fs.readFileSync(path.join(map,'Source/war3map.j'),'utf8'),initialized=U.run(source);
const decode="import sys,json;sys.path.insert(0,sys.argv[1]);from warcraft_units import parse_units;print(json.dumps(parse_units(open(sys.argv[2],'rb').read())))";
const placements=JSON.parse(execFileSync('python',['-c',decode,path.join(root,'scripts'),path.join(map,'Source/war3mapUnits.doo')],{encoding:'utf8'})).units;
const remaining=new Set(placements.map((u,i)=>u.id==='sloc'?-1:i).filter(i=>i>=0)),matched=new Map();
for(const unit of initialized.units){
  const candidates=[...remaining].filter(i=>{const p=placements[i];return p.id===unit.typeId&&p.player===unit.player&&p.location.slice(0,2).every((v,j)=>Math.abs(v-unit.sourcePosition[j])<.052)&&Math.abs((p.angle*180/Math.PI-unit.facing+540)%360-180)<.0007;});
  assert.equal(candidates.length,1,JSON.stringify(unit));const index=candidates[0],placement=placements[index];remaining.delete(index);matched.set(unit.id,{index,placement});
  if(unit.resourceAmount!==null)assert.equal(unit.resourceAmount,placement.goldAmount);
}
assert.equal(initialized.units.length,96);assert.equal(remaining.size,0);assert.equal(initialized.triggers.length,26);
for(const trigger of initialized.triggers){
  assert.equal(trigger.events.length,2);assert.equal(trigger.events[0].unit,trigger.events[1].unit);assert.deepEqual(Array.from(trigger.events,e=>e.event),['DEATH','CHANGE_OWNER']);assert.equal(trigger.actions.length,1);
  const {index,placement}=matched.get(trigger.events[0].unit),expected=placement.droppedItemTable>=0?'ItemTable'+String(placement.droppedItemTable).padStart(6,'0'):'Unit'+String(index).padStart(6,'0');
  assert.equal(trigger.actions[0],expected+'_DropItems');assert.ok(placement.droppedItemTable>=0||placement.droppedItemSets.length>0);
}
assert.ok(initialized.units.some(u=>u.states.MANA===0));assert.ok(initialized.units.some(u=>u.acquireRange===200));
initialized.units[0].resourceAmount=1;assert.equal(U.run(source).units[0].resourceAmount,12500);
const unsupported=U.initialize(source.replace('call CreateNeutralPassiveBuildings(  )','call CreateNeutralPassiveBuildings(  )\ncall UnsupportedNative()'));
assert.equal(unsupported.status,'unsupported');assert.equal(unsupported.units.length,0);assert.match(unsupported.error,/UnsupportedNative/);
console.log(JSON.stringify({passed:true,units:96,triggers:26,instructions:initialized.instructions,entry:'CreateAllUnits',fullMapScript:false}));
