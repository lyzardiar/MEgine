// Author: MiYu. Validate cached native delta indices against the independent full merge path.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

test('retained delta indices preserve topology, resets, direct edits and error recovery', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldUpdater,applyPlayWorldUpdate}=await server.ssrLoadModule('/src/playRuntime.ts'),{toWorldSnapshotView}=await server.ssrLoadModule('/src/transport/editorTransport.ts');
    const host={entities:[{entity:1,name:'One',components:{}},{entity:4294967297,name:'Large ID',components:{}}],frame:0,sim_frame:0,clear_color:[0,0,0,1]};
    let world=toWorldSnapshotView(host),revision=0;const apply=createPlayWorldUpdater();
    const run=(entities,entityOrder=world.entities.map(e=>e.entity),reset=false)=>{const update={snapshot:{...host,entities,frame:revision+1},entityOrder,reset,baseRevision:revision,revision:revision+1},expected=applyPlayWorldUpdate(world,revision,update),before=world,actual=apply(world,revision,update);assert.deepEqual(actual,expected);assert.notEqual(actual.entities,before.entities);world=actual;revision++;return before;};
    run([]);const first=world.entities[0];run([{entity:4294967297,name:'Changed',components:{}}]);assert.equal(world.entities[0],first);
    run([{entity:1,name:'First duplicate',components:{}},{entity:1,name:'Last duplicate',components:{}},{entity:99,components:{}}]);assert.equal(world.entities[0].name,'Last duplicate');assert.equal(world.entities.length,2);
    world.entities.reverse();run([],world.entities.map(e=>e.entity));
    world.entities[0].entity=7;run([],world.entities.map(e=>e.entity));
    const invalid={snapshot:{...host,entities:[]},entityOrder:[7,7],baseRevision:revision,revision:revision+1,reset:false};assert.throws(()=>apply(world,revision,invalid),/entity order/);run([]);
    assert.throws(()=>apply(world,revision,{...invalid,baseRevision:revision-1}),/revision mismatch/);run([]);
    run([{entity:42,name:'Reset',components:{}}],[42],true);assert.equal(world.entities.length,1);
    run([{entity:13,name:'Added',components:{}}],[13,42]);run([],[13]);
    let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
    for(let i=0;i<150;i++){
      let order=world.entities.map(e=>e.entity),changed=[{entity:order[random()%order.length],name:'Tick '+i,components:{Custom:{value:random()}}}];
      if(i%11===0){const id=100+i;order.push(id);changed.push({entity:id,components:{}});}
      if(i%17===0)order.reverse();if(i%23===0&&order.length>1)order.shift();run(changed,order);
    }
    const fresh=createPlayWorldUpdater();assert.deepEqual(fresh(world,revision,{...host,snapshot:{...host,entities:[]},entityOrder:world.entities.map(e=>e.entity),baseRevision:revision,revision:revision+1,reset:false}).entities,world.entities);
  } finally {await server.close();}
});

test('native IPC driver accepts compact frames and resynchronizes explicit editor resets', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  const savedWindow=globalThis.window;globalThis.window={};
  try {
    const {mockIPC,clearMocks}=await server.ssrLoadModule('@tauri-apps/api/mocks'),{createNativePlayRuntime,emptyPlayInput}=await server.ssrLoadModule('/src/playRuntime.ts');
    const initial={entities:[{entity:1,name:'Initial',components:{}},{entity:2,parent:1,components:{Text:{text:'before'}}}],frame:0,sim_frame:0,clear_color:[0,0,0,1]};
    let revision=0;const calls=[];
    mockIPC(async (command,args)=>{
      if(command==='start_editor_play') return {sessionId:8,snapshot:structuredClone(initial)};
      if(command==='step_editor_play') {
        calls.push(args);const baseRevision=revision++,snapshot={...initial,frame:revision,sim_frame:revision,elapsed:revision*.1,entities:[]};
        if(args.snapshot) return {snapshot:{...snapshot,entities:[{entity:2,name:'Inspector reset',components:{}}]},entityOrder:[2],reset:true,baseRevision,revision};
        if(revision===1) snapshot.entities=[{entity:2,parent:1,components:{Text:{text:'after'}}}];
        return {...(revision===2?{entityOrder:[2,1]}:{}),snapshot,reset:false,baseRevision,revision};
      }
    });
    const runtime=createNativePlayRuntime(error=>{throw error;});await runtime.start({});
    const first=await runtime.step(undefined,emptyPlayInput(),.1);assert.equal(first.entities[1].components.Text.text,'after');assert.equal(first.nativeRevision,1);
    const second=await runtime.step(undefined,emptyPlayInput(),.1);assert.deepEqual(second.entities.map(entity=>entity.entity),[2,1]);
    const third=await runtime.step(undefined,emptyPlayInput(),.1);assert.equal(third.entities[0],first.entities[1]);assert.equal(third.nativeSessionId,8);assert.equal(third.nativeRevision,3);
    const reset=await runtime.step(third,emptyPlayInput(),.1);assert.equal(calls[3].snapshot,third);assert.deepEqual(reset.entities.map(entity=>entity.entity),[2]);assert.equal(reset.entities[0].name,'Inspector reset');
    assert.equal(first.entities.length,2);runtime.stop();await new Promise(resolve=>setImmediate(resolve));clearMocks();
  } finally {globalThis.window=savedWindow;await server.close();}
});

test('compact native deltas keep clocks, payloads and old revisions across topology changes', async () => {
  const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  try {
    const {createPlayWorldUpdater,applyPlayWorldUpdate}=await server.ssrLoadModule('/src/playRuntime.ts'),{toWorldSnapshotView}=await server.ssrLoadModule('/src/transport/editorTransport.ts');
    const host={entities:[{entity:1,name:'Root',components:{Custom:{value:4}}},{entity:4294967297,parent:1,components:{}}],frame:0,sim_frame:0,clear_color:[0,0,0,1]};
    const authored=structuredClone(host.entities);
    let world=toWorldSnapshotView(host),revision=0;const apply=createPlayWorldUpdater();
    const run=(entities,entityOrder,reset=false)=>{
      const update={snapshot:{...host,entities,frame:revision+1,sim_frame:revision+1,elapsed:(revision+1)*.1,selected:4294967297,clear_color:[.5,0,0,1]},entityOrder,reset,baseRevision:revision,revision:revision+1};
      const previous=world,expected=applyPlayWorldUpdate(world,revision,update);world=apply(world,revision,update);revision++;
      assert.deepEqual(world,expected);assert.notEqual(world.entities,previous.entities);assert.equal(world.simulationTime,revision*.1);return previous;
    };
    const initial=world;run([]);assert.equal(world.entities[0],initial.entities[0]);
    const retained=run([{entity:4294967297,name:'Changed',active:false,parent:1,components:{Text:{text:'new UI'}}}]);
    assert.equal(retained.entities[1].name,undefined);assert.equal(world.entities[1].name,'Changed');assert.equal(world.entities[0],initial.entities[0]);
    world.entities[0].components.Custom.value=9;run([]);assert.equal(world.entities[0].components.Custom.value,9);
    run([],[4294967297,1]);run([]);assert.deepEqual(world.entities.map(e=>e.entity),[4294967297,1]);
    run([{entity:8589934593,name:'Reused slot',components:{}}],[8589934593,1]);run([]);assert.equal(world.entities[0].name,'Reused slot');
    run([],[1]);run([]);run([],[]);run([]);assert.equal(world.entities.length,0);
    run(structuredClone(authored),[1,4294967297],true);run([]);assert.equal(world.entities[0].components.Custom.value,4);
    const invalid={snapshot:{...host,entities:[{entity:777,components:{}}]},reset:false,baseRevision:revision,revision:revision+1};
    for(const update of [invalid,{...invalid,reset:true,snapshot:{...host,entities:[]}},{...invalid,baseRevision:revision-1}]) {
      assert.throws(()=>apply(world,revision,update),/entity order|revision mismatch/);assert.throws(()=>applyPlayWorldUpdate(world,revision,update),/entity order|revision mismatch/);
    }
    run([]);world.entities.reverse();run([]);assert.equal(world.entities[0].entity,4294967297);
    const duplicate=world.entities[0];world.entities[1]=duplicate;
    assert.throws(()=>apply(world,revision,{...invalid,baseRevision:revision,revision:revision+1,snapshot:{...host,entities:[]}}),/entity order/);
    run(structuredClone(authored),[1,4294967297],true);run([]);
  } finally {await server.close();}
});
