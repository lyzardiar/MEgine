// Author: MiYu. Verify bounded JASS library linking, checked handle inheritance and original starting-resource code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root=fileURLToPath(new URL('../',import.meta.url)),context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'samples/frostbound-realms/game/warcraft-jass.js'),'utf8'),context);
const J=context.FrostWarcraftJass,typed=(type,value)=>({type,value}),fn=(name,type,body,parameters='nothing')=>`function ${name} takes ${parameters} returns ${type}\n${body}\nendfunction`;
const execute=(source,options={})=>J.create(J.link(Array.isArray(source)?source:[source]),options).run('main');
const expression=(text,type,constants,handleTypes={})=>execute(fn('main',type,'return '+text),{constants,handleTypes}).value;

test('libraries share functions and ordered globals across modules; external calls retain globals',()=>{
  const sources=['globals\ninteger calls=0\nconstant integer increment=3\nendglobals\n'+fn('add','integer','set calls=calls+increment\nreturn calls'),
    'globals\ninteger initial=increment+4\nendglobals\n'+fn('main','integer','return initial+add()')];
  const linked=J.link(sources),runtime=J.create(linked);
  assert.equal(Object.getPrototypeOf(linked.functions),null);
  assert.equal(linked.tokenCount,sources.reduce((n,source)=>n+J.parse(source).tokenCount,0));
  assert.equal(runtime.run('main').value,10);assert.equal(runtime.run('main').value,13);
  assert.equal(J.link([]).tokenCount,0);assert.equal(J.link(Array(64).fill('')).globals.length,0);
  assert.equal(execute(['\ufeff'+fn('main','integer','return later()'),fn('later','integer','return 42')]).value,42);
});

test('linking rejects duplicates and bounds modules, aggregate source and tokens',()=>{
  const body=fn('main','nothing','');
  assert.throws(()=>J.link([body,body]),/Duplicate JASS module function main/);
  assert.throws(()=>J.link(['globals\ninteger x\nendglobals','globals\nreal x\nendglobals']),/Duplicate JASS module global x/);
  assert.throws(()=>J.link(['globals\ninteger x\ninteger x\nendglobals']),/Duplicate JASS module global x/);
  for(const sources of [null,{},'source',[body,123],Array(65).fill('')])assert.throws(()=>J.link(sources),/Invalid JASS module sources/);
  const half='//'+'.'.repeat(4*1024*1024-2);
  assert.equal(J.link([half,half]).tokenCount,0);
  assert.throws(()=>J.link([half,half,' ']),/Invalid JASS module sources/);
  const many='call Ping()\n'.repeat(31251);
  assert.throws(()=>J.link([fn('a','nothing',many),fn('b','nothing',many)]),/JASS module token limit exceeded/);
});

test('default handle relationships allow only checked upcasts and related equality',()=>{
  const u=Object.freeze({id:1}),constants={u:typed('unit',u),w:typed('widget',u),a:typed('agent',u),h:typed('handle',u),i:typed('item',Object.freeze({id:2}))};
  for(const type of ['unit','widget','agent','handle'])assert.equal(expression('u',type,constants),u);
  assert.equal(expression('u == w and a == u and h == u and u != null','boolean',constants),true);
  assert.equal(expression('null == u or u != h','boolean',constants),false);
  for(const [text,type] of [['w','unit'],['h','widget'],['u','item'],['u','player']])assert.throws(()=>expression(text,type,constants),/type mismatch/);
  assert.throws(()=>expression('u == i','boolean',constants),/incompatible equality operands/);
  const event=Object.freeze({id:3});
  assert.equal(expression('e','eventid',{e:typed('unitevent',event)}),event);
  assert.equal(expression('e','handle',{e:typed('unitevent',event)}),event);
  for(const type of ['item','destructable','player','trigger','event','triggeraction','unitstate','playercolor'])assert.equal(expression('v','handle',{v:typed(type,u)}),u);
  assert.equal(execute(fn('main','handle','local widget w=u\nreturn Accept(w)')+'\n'+fn('Accept','handle','return arg','agent arg'),{constants}).value,u);
});

test('caller-defined common.j types resolve independent of declaration order and remain checked',()=>{
  const handleTypes={derived:'location',location:'agent',race:'handle',version:'handle',playerstate:'handle',playerslotstate:'handle',agent:'handle'},object=Object.freeze({id:1});
  for(const [type,parent] of [['derived','location'],['derived','handle'],['location','agent'],['race','handle'],['version','handle'],['playerstate','handle'],['playerslotstate','handle']])assert.equal(expression('v',parent,{v:typed(type,object)},handleTypes),object);
  assert.throws(()=>expression('v','derived',{v:typed('location',object)},handleTypes),/type mismatch/);
  assert.throws(()=>expression('a == b','boolean',{a:typed('race',object),b:typed('version',object)},handleTypes),/incompatible equality operands/);
  const source=fn('main','location','local location p=null\nreturn p');
  assert.equal(execute(source,{handleTypes}).value,null);
  assert.throws(()=>execute(source),/Unsupported JASS type location/);
});

test('invalid handle graphs, primitive overrides and oversized type tables fail before execution',()=>{
  const program=J.link([]),bad=[null,[],false,{x:123},{'bad-name':'handle'},{x:'bad-name'},{x:'missing'},{x:'integer'},{x:'x'},{x:'y',y:'x'},{unit:'handle'},{handle:'agent'},{integer:'handle'},{real:'handle'},{boolean:'handle'},{string:'handle'},{code:'handle'},{nothing:'handle'}];
  for(const handleTypes of bad)assert.throws(()=>J.create(program,{handleTypes}),/JASS (handle|parent)/);
  const chain=Object.fromEntries(Array.from({length:128},(_,i)=>['type'+i,i?'type'+(i-1):'handle'])),object=Object.freeze({id:1});
  assert.equal(expression('v','handle',{v:typed('type127',object)},chain),object);
  assert.throws(()=>J.create(program,{handleTypes:{...chain,extra:'handle'}}),/Invalid JASS handle types/);
});

test('special identifiers use own entries without prototype lookup or pollution',()=>{
  const object=Object.freeze({id:7}),handleTypes=Object.fromEntries([['__proto__','handle'],['constructor','__proto__']]);
  const source=['globals\ninteger __proto__=4\nendglobals\n'+fn('constructor','integer','return __proto__+1'),fn('main','integer','return constructor()')];
  assert.equal(execute(source).value,5);
  assert.equal(expression('v','handle',{v:typed('constructor',object)},handleTypes),object);
  assert.equal(expression('v','__proto__',{v:typed('constructor',object)},handleTypes),object);
  assert.throws(()=>execute(fn('main','nothing','call constructor()')),/Unsupported JASS native constructor/);
  assert.equal(Object.getPrototypeOf(J.link(source).functions),null);
  assert.equal(Object.prototype.polluted,undefined);
});

test('native callbacks share the outer budget; separate external runs receive a fresh budget',()=>{
  const source='globals\ninteger calls=0\nendglobals\n'+fn('leaf','nothing','set calls=calls+1')+'\n'+fn('read','integer','return calls')+'\n'+fn('main','nothing','loop\nexitwhen calls>=20\ncall Callback(function leaf)\nendloop');
  let runtime,callbacks=0;
  const options={instructionLimit:70,natives:{Callback:{parameters:['code'],returns:'nothing',call(code){callbacks++;runtime.run(code.functionName);}}}};
  runtime=J.create(J.link([source]),options);
  assert.throws(()=>runtime.run('main'),/instruction limit exceeded/);assert.ok(callbacks>0&&callbacks<20);
  const first=runtime.run('read').value;assert.ok(first>0&&first<20);
  assert.equal(runtime.instructionsRemaining,67);
  runtime.run('leaf');assert.equal(runtime.run('read').value,first+1);
  const finite=J.create(J.link([fn('leaf','integer','return 9')+'\n'+fn('main','integer','return Callback(function leaf)')]),{instructionLimit:12,natives:{Callback:{parameters:['code'],returns:'integer',call(code){return finite.run(code.functionName).value;}}}});
  assert.equal(finite.run('main').value,9);assert.equal(finite.run('main').value,9);
});

test('nested native callback recursion preserves call depth and unwinds after failure',()=>{
  const source=fn('main','nothing','call Callback(function main)')+'\n'+fn('read','integer','return 11');let runtime;
  runtime=J.create(J.link([source]),{callLimit:6,natives:{Callback:{parameters:['code'],returns:'nothing',call(code){runtime.run(code.functionName);}}}});
  assert.throws(()=>runtime.run('main'),/call depth limit exceeded/);assert.equal(runtime.run('read').value,11);
});

test('original MeleeStartingResources fixture has stable provenance and ROC/TFT active-slot behavior',()=>{
  const folder=path.join(root,'scripts/fixtures/warcraft'),source=fs.readFileSync(path.join(folder,'melee-starting-resources.j'),'utf8').replaceAll('\r\n','\n'),receipt=JSON.parse(fs.readFileSync(path.join(folder,'melee-starting-resources.source.json'),'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'),receipt.fragmentSha256);
  assert.equal(receipt.source.path,'Scripts/Blizzard.j');assert.equal(receipt.source.archive,'War3Patch.mpq');
  assert.equal(receipt.source.sha256,'d290865bd673f8394f4e6fb7b4d6720412fed3a447877523cec9e54e65b8e62c');
  const players=Array.from({length:12},(_,id)=>Object.freeze({id})),roc=Object.freeze({id:'roc'}),tft=Object.freeze({id:'tft'}),playing=Object.freeze({id:'playing'}),empty=Object.freeze({id:'empty'}),gold=Object.freeze({id:'gold'}),lumber=Object.freeze({id:'lumber'});
  const constants={VERSION_REIGN_OF_CHAOS:typed('version',roc),PLAYER_SLOT_STATE_PLAYING:typed('playerslotstate',playing),PLAYER_STATE_RESOURCE_GOLD:typed('playerstate',gold),PLAYER_STATE_RESOURCE_LUMBER:typed('playerstate',lumber)};
  for(const version of [roc,tft])for(const active of [new Set(),new Set([0,3,11]),new Set(players.map(p=>p.id))]){
    const writes=[],visited=[],resources=new Map(players.map(p=>[p,{gold:100+p.id,lumber:200+p.id}]));
    const natives={Player:{parameters:['integer'],returns:'player',call(index){assert.ok(index>=0&&index<12);return players[index];}},VersionGet:{parameters:[],returns:'version',call(){return version;}},
      GetPlayerSlotState:{parameters:['player'],returns:'playerslotstate',call(player){assert.equal(players[player.id],player);visited.push(player.id);return active.has(player.id)?playing:empty;}},
      SetPlayerState:{parameters:['player','playerstate','integer'],returns:'nothing',call(player,state,amount){assert.ok(state===gold||state===lumber);resources.get(player)[state.id]=amount;writes.push([player.id,state.id,amount]);}}};
    const runtime=J.create(J.link([source,fn('main','nothing','call MeleeStartingResources()')]),{constants,natives,handleTypes:{version:'handle',playerstate:'handle',playerslotstate:'handle'}});
    runtime.run('main');assert.deepEqual(visited,players.map(p=>p.id));assert.equal(writes.length,active.size*2);
    for(const player of players)assert.deepEqual(resources.get(player),active.has(player.id)?{gold:version===roc?750:500,lumber:version===roc?200:150}:{gold:100+player.id,lumber:200+player.id});
    assert.deepEqual(writes,[...active].sort((a,b)=>a-b).flatMap(id=>[[id,'gold',version===roc?750:500],[id,'lumber',version===roc?200:150]]));
    assert.ok(runtime.instructionsRemaining>0);
  }
});
