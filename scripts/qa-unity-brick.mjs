import fs from 'node:fs';
import assert from 'node:assert/strict';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Set MENGINE_EDITOR_CONFIG_DIR to an isolated QA directory and MENGINE_EDITOR_EXECUTABLE to the editor executable.');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
const root = new URL('../', import.meta.url);
const { fileURLToPath } = await import('node:url');
const output = fileURLToPath(new URL('docs/designs/unity-demos/',root));
fs.mkdirSync(output,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(command,args={})=>{const r=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.equal(r.ok,true,r.error?.message);return r.data;};
try {
 await execute('project.open',{root:fileURLToPath(new URL('samples/unity-brick/',root))});
 console.log('Brick opened');
 const authored=await query('scene.snapshot');

 const initialCount=authored.entities.filter(e=>e.name?.startsWith('Brick ')).length;assert.equal(initialCount,128);
 await execute('playback.play',{paused:true});
 const wallId=(await query('entity.get',{name:'Top wall'})).entity;
 const ball=await query('entity.get',{name:'Ball'});console.log('ball before',ball.components.Transform.position);
 await execute('playback.input',{keys:['ArrowRight']});
 for(let i=0;i<5;i++) await execute('playback.step',{deltaTime:0.1});
 assert.equal((await query('entity.get',{name:'Paddle'})).components.Transform.position[0],10.5);
 await execute('playback.input',{keys:[]});
 for(let i=0;i<20;i++) await execute('playback.step',{deltaTime:0.1});
 console.log('ball after',(await query('entity.get',{name:'Ball'})).components.Transform.position);
 const live=await query('scene.snapshot');const count=live.entities.filter(e=>e.name?.startsWith('Brick ')).length;assert.ok(count<128);assert.equal((await query('entity.get',{name:'Top wall'})).entity,wallId);
 await execute('panel.focus',{kind:'game'});
 const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(output+'/brick-game.png',Buffer.from(shot.dataUrl.split(',')[1],'base64'));
 const full=await query('view.window_screenshot');fs.writeFileSync(output+'/brick-editor.png',Buffer.from(full.dataUrl.split(',')[1],'base64'));
 await execute('playback.input',{keys:['ArrowLeft']});
 let restarted=false;
 for(let i=0;i<70;i++) {await execute('playback.step',{deltaTime:0.1}); const current=await query('scene.snapshot');if(current.entities.filter(e=>e.name?.startsWith('Brick ')).length===128 && current.entities.find(e=>e.name==='Ball').components.Transform.position[1]===10){restarted=true;break;}}
 assert.ok(restarted,'missed ball must trigger scene reload');
 await execute('playback.input',{keys:['KeyR']});await execute('playback.step',{deltaTime:0.1});
 assert.equal((await query('entity.get',{name:'Paddle'})).components.Transform.position[0],8);
 await execute('playback.stop');
 const restored=await query('scene.snapshot');assert.deepEqual(restored.entities,authored.entities);
 await execute('playback.play',{paused:true});await execute('playback.step',{deltaTime:0.1});
 assert.equal((await query('entity.get',{name:'Paddle'})).components.Transform.position[0],8);
 await execute('playback.stop');
 fs.writeFileSync(output+'/brick-result.json',JSON.stringify({passed:true,initialBricks:128,remainingBricks:count,stableEntityId:true,lossReload:true,manualRestart:true,stopRestoresAuthored:true,restartClearsInput:true},null,2));
 console.log('PASS: movement, collision destruction, stable IDs, loss reload, R restart, stop restoration, clean restart');
}catch(error){console.error(error.code,error.message);process.exitCode=1;}finally{closeBridgeConnection();}
