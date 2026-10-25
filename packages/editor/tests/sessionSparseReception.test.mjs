// Author: MiYu. Reuse complete immutable receive baselines while preserving validation and rollback.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const entity=id=>({entity:id,components:{Custom:{values:[id]}}});
const header=(frame=0,version=3)=>JSON.stringify({version,world:{frame,entities:[]}});
const message=(base,length,changed=[],frame=0,version=3)=>({sceneDelta:{base,length,changed,header:header(frame,version)}});
async function modules(run){
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
 try{await run(await server.ssrLoadModule('/src/sessionSceneSerialization.ts'));}finally{await server.close();}
}

test('clock and equivalent changes reuse frozen arrays; sparse replacement preserves earlier documents',async()=>modules(({createSessionSceneReceiver,isSessionSceneDocument})=>{
 const receiver=createSessionSceneReceiver(),values=Array.from({length:8},(_,i)=>entity(i+1)),checkpoint=values.map((v,i)=>[i,JSON.stringify(v)]);
 const first=receiver.readDocument(message(null,8,checkpoint),'a'),clock=receiver.readDocument(message('a',8,[],1),'b');
 assert.ok(isSessionSceneDocument(clock));assert.equal(clock.world.entities,first.world.entities);assert.equal(first.world.frame,0);assert.equal(clock.world.frame,1);
 const same=receiver.readDocument(message('b',8,[[6,checkpoint[6][1]],[1,checkpoint[1][1]]],2),'c');assert.equal(same.world.entities,first.world.entities);
 const replacement={...entity(2),name:'changed'},next=receiver.readDocument(message('c',8,[[6,JSON.stringify(entity(99))],[1,JSON.stringify(replacement)]],3),'d');
 assert.notEqual(next.world.entities,first.world.entities);assert.equal(next.world.entities[0],first.world.entities[0]);assert.deepEqual(next.world.entities[1],replacement);assert.deepEqual(first.world.entities,values);
 for(const node of [next,next.world,next.world.entities,next.world.entities[1],next.world.entities[1].components.Custom.values])assert.ok(Object.isFrozen(node));
 assert.throws(()=>next.world.entities.reverse());assert.throws(()=>next.world.entities[1].components.Custom.values.push(10));
}));

test('growth validates every new slot and truncation keeps retained input immutable',async()=>modules(({createSessionSceneReceiver})=>{
 const receiver=createSessionSceneReceiver(),first=receiver.readDocument(message(null,2,[[0,JSON.stringify(entity(1))],[1,JSON.stringify(entity(2))]]),'a');
 assert.throws(()=>receiver.readDocument(message('a',4,[[3,JSON.stringify(entity(4))]]),'bad'),/Incomplete/);
 const grown=receiver.readDocument(message('a',4,[[3,JSON.stringify(entity(4))],[2,JSON.stringify(entity(3))]]),'b');assert.deepEqual(grown.world.entities,[1,2,3,4].map(entity));
 const short=receiver.readDocument(message('b',1,[]),'c');assert.deepEqual(short.world.entities,[entity(1)]);assert.equal(first.world.entities.length,2);assert.equal(grown.world.entities.length,4);
 const empty=receiver.readDocument(message('c',0,[]),'d');assert.deepEqual(empty.world.entities,[]);
 assert.throws(()=>receiver.readDocument(message(null,3,[[2,JSON.stringify(entity(3))],[0,JSON.stringify(entity(1))]]),'bad'),/Incomplete/);
 assert.deepEqual(receiver.readDocument(message('d',1,[[0,JSON.stringify(entity(9))]]),'e').world.entities,[entity(9)]);
}));

test('failed tuples, fragments and headers never modify an accepted immutable baseline',async()=>modules(({createSessionSceneReceiver})=>{
 const receiver=createSessionSceneReceiver(),first=receiver.readDocument(message(null,2,[[0,JSON.stringify(entity(1))],[1,JSON.stringify(entity(2))]]),'a');
 for(const changed of [[[0,'{}'],[0,'{}']],[[0,'{}'],[-1,'{}']],[[0,'{}'],[2,'{}']],[[0,'{}'],[1,8]],[[0,'{}'],[1,'{']]])assert.throws(()=>receiver.readDocument(message('a',2,changed),'bad'));
 const broken=message('a',2,[[0,'{}']]);broken.sceneDelta.header='{"version":3,broken,"entities":[]}}';assert.throws(()=>receiver.readDocument(broken,'bad'));
 assert.deepEqual(first.world.entities,[entity(1),entity(2)]);const clock=receiver.readDocument(message('a',2,[]),'b');assert.equal(clock.world.entities,first.world.entities);
 assert.equal(receiver.readDocument(message('missing',2,[]),'c'),undefined);assert.equal(receiver.requestCheckpoint(),true);assert.equal(receiver.requestCheckpoint(),false);
 receiver.readDocument(message('b',2,[]),'c');assert.equal(receiver.requestCheckpoint(),true);
}));

test('raw, legacy and customized-parser transitions retain complete parsing semantics',async()=>modules(({createSessionSceneReceiver,isSessionSceneDocument})=>{
 const receiver=createSessionSceneReceiver(),values=[null,false,0,'',[],JSON.parse('{"__proto__":{"nested":[1]}}')],changes=values.map((v,i)=>[i,JSON.stringify(v)]);
 const first=receiver.readDocument(message(null,values.length,changes),'a');assert.deepEqual(first.world.entities,values);
 const raw=receiver.read(message('a',values.length,[],1),'b');assert.equal(typeof raw,'string');assert.deepEqual(JSON.parse(raw).world.entities,values);
 const parsed=receiver.readDocument(message('b',values.length,[],2),'c');assert.deepEqual(parsed.world.entities,values);assert.ok(Object.isFrozen(parsed.world.entities[5].__proto__.nested));
 assert.equal(typeof receiver.readDocument(message('c',values.length,[],3,1),'d'),'string');
 const original=JSON.parse;JSON.parse=(...args)=>original(...args);
 try{assert.equal(typeof receiver.readDocument(message('d',values.length,[],4),'e'),'string');}finally{JSON.parse=original;}
 const restored=receiver.readDocument(message('e',values.length,[],5),'f');assert.ok(isSessionSceneDocument(restored));assert.deepEqual(restored.world.entities,values);
 receiver.read({sceneJson:'{}'},'raw');assert.equal(receiver.readDocument(message('f',values.length,[]),'g'),undefined);
 receiver.reset();assert.deepEqual(receiver.readDocument(message(null,0,[]),'new').world.entities,[]);
}));

test('structured failure after a raw baseline keeps valid partial parsing private',async()=>modules(({createSessionSceneReceiver})=>{
 const receiver=createSessionSceneReceiver();receiver.read(message(null,2,[[0,JSON.stringify(entity(1))],[1,'{']]),'a');
 assert.throws(()=>receiver.readDocument(message('a',2,[]),'bad'));
 const repaired=receiver.readDocument(message('a',2,[[1,JSON.stringify(entity(2))]]),'b');assert.deepEqual(repaired.world.entities,[entity(1),entity(2)]);
}));
