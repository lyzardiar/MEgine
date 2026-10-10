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
