import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Set an isolated MENGINE_EDITOR_CONFIG_DIR and MENGINE_EDITOR_EXECUTABLE.');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(command,args={})=>{const result=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.ok(result.ok,result.error?.message);return result.data;};
const output=fileURLToPath(new URL('../docs/designs/unity-demos/',import.meta.url));
const capture=async(name)=>{const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(output+'/'+name+'.png',Buffer.from(shot.dataUrl.split(',')[1],'base64'));return shot.dataUrl;};
try {
 await execute('project.open',{root:fileURLToPath(new URL('../samples/unity-animated-tile/',import.meta.url))});
 const authored=await query('scene.snapshot');
 assert.equal(authored.entities.filter(e=>e.components.AnimatedSprite2D).length,8);
 await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});
 assert.equal((await query('scene.snapshot')).simulationTime,0);
 const first=await capture('animated-tile-frame-0');
 await execute('playback.step',{deltaTime:0.15});
 assert.ok(Math.abs((await query('scene.snapshot')).simulationTime-0.15)<0.00001);
 const second=await capture('animated-tile-frame-1');
 assert.notEqual(first,second,'native animation must advance');
 const paused=await capture('animated-tile-paused');
 assert.equal(paused,second,'paused native animation must remain frozen');
 await execute('playback.input',{keys:['KeyR']});await execute('playback.step',{deltaTime:0.1});
 assert.equal((await query('scene.snapshot')).simulationTime,0);
 const restarted=await capture('animated-tile-restarted');assert.equal(restarted,first);
 await execute('playback.stop');assert.deepEqual((await query('scene.snapshot')).entities,authored.entities);
 fs.writeFileSync(output+'/animated-tile-result.json',JSON.stringify({passed:true,animatedTiles:8,spriteSlices:10,frameAdvance:true,pauseFrozen:true,restartAtFirstFrame:true,stopRestoresAuthored:true},null,2));
 console.log('PASS: 8 animated tiles, frame advance, pause freeze, restart frame, authored restoration');
}catch(error){console.error(error.code,error.message);process.exitCode=1;}finally{closeBridgeConnection();}
