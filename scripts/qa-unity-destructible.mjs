import { assertUnityGammaCapture } from './assert-unity-capture.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Set an isolated MENGINE_EDITOR_CONFIG_DIR and MENGINE_EDITOR_EXECUTABLE.');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(command,args={})=>{const result=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.ok(result.ok,result.error?.message);return result.data;};
const output=fileURLToPath(new URL('../docs/designs/unity-demos/',import.meta.url));
const capture=async(name)=>{const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(output+'/'+name+'.png',Buffer.from(shot.dataUrl.split(',')[1],'base64'));assertUnityGammaCapture(output+'/'+name+'.png');};
const root=fileURLToPath(new URL('../samples/unity-destructible/',import.meta.url));
const dataText=fs.readFileSync(root+'Assets/Scripts/Data.ts','utf8');
const data=JSON.parse(dataText.slice(dataText.indexOf('= ')+2).trim().replace(/;$/,''));
const borders=data.cells.filter(cell=>cell.tile==='Border').map(cell=>cell.name);
try {
 if ((await query('project.state')).project) { await execute('playback.stop'); await execute('project.close'); await new Promise(resolve => setTimeout(resolve, 600)); }
 await execute('project.open',{root});
 const authored=await query('scene.snapshot');assert.equal(authored.entities.length,560);
 await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});
 await capture('destructible-initial');
 await execute('playback.input',{buttons:[0],pointer:[456.25,281.25],viewport:[800,600]});
 await execute('playback.step',{deltaTime:0.016});
 const burst=await query('scene.snapshot');
 assert.equal(burst.entities.filter(e=>e.name?.startsWith('Explosion ')).length,9);
 const remaining=burst.entities.filter(e=>e.name?.startsWith('Foreground '));assert.ok(remaining.length<235);
 for(const name of borders) assert.ok(remaining.some(e=>e.name===name),name);
 const burned=burst.entities.filter(e=>e.name?.startsWith('Background ')&&e.components.SpriteRenderer.sprite!==authored.entities.find(a=>a.name===e.name).components.SpriteRenderer.sprite).length;
 assert.ok(burned>0,'floor sprites must change');
 const distant=data.cells.filter(cell=>cell.tile==='Destructible'&&(Math.abs(cell.x-1)>3||Math.abs(cell.y)>3));
 for(const cell of distant){const before=authored.entities.find(e=>e.name===cell.name);const after=burst.entities.find(e=>e.name===cell.name);assert.deepEqual(after.components.SpriteRenderer,before.components.SpriteRenderer,cell.name);}
 await execute('playback.step',{deltaTime:0.2});await capture('destructible-explosion');
 const held=await query('scene.snapshot');assert.equal(held.entities.filter(e=>e.name?.startsWith('Explosion ')).length,9);
 await execute('playback.input',{buttons:[]});await execute('playback.step',{deltaTime:0.5});
 assert.equal((await query('scene.snapshot')).entities.filter(e=>e.name?.startsWith('Explosion ')).length,0);
 await capture('destructible-aftermath');
 await execute('playback.input',{keys:['KeyR']});await execute('playback.step',{deltaTime:0.016});
 assert.equal((await query('scene.snapshot')).entities.length,560);
 await execute('playback.stop');assert.deepEqual((await query('scene.snapshot')).entities,authored.entities);
 fs.writeFileSync(output+'/destructible-result.json',JSON.stringify({passed:true,gammaBackgroundVerified:true,sourceCells:559,originalForeground:235,remainingForeground:remaining.length,preservedBorders:borders.length,burnedFloorCells:burned,explosionCount:9,heldClickDoesNotRepeat:true,effectsExpire:true,restartRestores:true,stopRestoresAuthored:true},null,2));
 console.log('PASS:',remaining.length,'foreground cells,',borders.length,'borders preserved,',burned,'burned floor cells; effects expire and restart restores');
}catch(error){console.error(error.code,error.message);process.exitCode=1;}finally{closeBridgeConnection();}
