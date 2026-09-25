import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Use an isolated QA editor configuration and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE = 'auto-background';
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = [process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?? '', '--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'].join(' ').trim();
const { bridgeQuery: query, bridgeExecute, closeBridgeConnection } = await import('../packages/agent/mcp/server.mjs');
const execute = async (command,args={}) => { console.log(command,JSON.stringify(args)); const result=await bridgeExecute(command,args,{requestId:crypto.randomUUID()}); assert.ok(result.ok,result.error?.message); console.log('done',command); return result.data; };
const root=fileURLToPath(new URL('../samples/pelican-road-rage/',import.meta.url));
const out=fileURLToPath(new URL('../docs/designs/pelican-road-rage/',import.meta.url));
fs.mkdirSync(out,{recursive:true});
const snapshot=()=>query('scene.snapshot');
const state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Race telemetry').components.Text.text);
const step=(steps=1)=>execute('playback.step',{deltaTime:steps>2 ? .1 : 1/60,steps:steps>2 ? Math.ceil(steps/6) : steps});
const drive=async(keys,frames)=>{await execute('playback.input',{keys});await step(frames);return state();};
const tap=async key=>{await drive([],1);return drive([key],1);};
const capture=async name=>{const image=await query('view.screenshot',{target:'game'});fs.writeFileSync(`${out}/${name}.png`,Buffer.from(image.dataUrl.split(',')[1],'base64'));};
try {
  if((await query('project.state')).project) {await execute('playback.stop');await execute('project.close');}
  await execute('project.open',{root}); const authored=await snapshot();
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await step(2);
  assert.equal((await state()).mode,'title');await capture('title');
  await tap('Enter');
  if(process.argv.includes('--model')) {
    await drive([],190);await drive(['KeyW'],90);await drive(['KeyS'],60);
    await tap('KeyC');await tap('KeyC');await tap('KeyV');await drive([],60);await capture('model-sunset');console.log('Model view ready');
  } else {
  await drive([],190);assert.equal((await state()).mode,'racing');
  await drive(['KeyW'],180);await capture('coast');
  console.log(JSON.stringify(await state()));
  if(process.argv.includes('--preview')) {console.log('Preview ready');} else {
    const acceleration=await state(); assert.ok(acceleration.speed>30);
    const before=acceleration.distance;const fast=await drive(['KeyW','Space'],100);assert.ok(fast.speed>45 && fast.boost<90 && fast.distance>before);
    await capture('nitro');
    const paused=await tap('Escape');assert.equal(paused.mode,'paused');await drive(['KeyW','Space'],60);assert.deepEqual(await state(),paused);await capture('pause');
    await tap('Escape');assert.equal((await state()).mode,'racing');
    const stopped=await drive(['KeyS'],120);assert.ok(stopped.speed<1);
    await tap('KeyR');await drive([],190);const restart=await state();assert.equal(restart.mode,'racing');assert.ok(restart.distance<1);assert.equal(restart.health,100);assert.equal(restart.score,0);
    await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
    fs.writeFileSync(`${out}/result.json`,JSON.stringify({passed:true,acceleration,boost:fast,pauseFreezes:true,braking:stopped.speed,restart,stopRestoresAuthored:true},null,2)+'\n');
    console.log('PASS: start, throttle, nitro, pause, braking, restart and Stop restoration');
  }
  }
} catch(error) {console.error(error.stack);process.exitCode=1;} finally {if(!process.argv.includes('--preview'))try{await execute('playback.stop');}catch{} closeBridgeConnection();}
