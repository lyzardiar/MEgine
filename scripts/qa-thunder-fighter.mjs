import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
if (!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE) throw new Error('Use an isolated QA editor configuration and executable.');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(command,args={})=>{console.log(command);const r=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;};
const root=fileURLToPath(new URL('../samples/thunder-fighter/',import.meta.url));
const out=process.env.MENGINE_PERFORMANCE_OUT ?? fileURLToPath(new URL('../docs/designs/thunder-fighter/',import.meta.url));
const snapshot=()=>query('scene.snapshot');
const state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Flight telemetry').components.Text.text);
const capture=async name=>{const result=await query('view.screenshot',{target:'game'});fs.writeFileSync(`${out}/${name}.png`,Buffer.from(result.dataUrl.split(',')[1],'base64'));console.log('captured',name);};
const drive=async(keys,steps=1)=>{await execute('playback.input',{keys});await execute('playback.step',{deltaTime:.1,steps});return state();};
try {
  fs.mkdirSync(out,{recursive:true});
  if((await query('project.state')).project){await execute('playback.stop');await execute('project.close');}
  await execute('project.open',{root});const authored=await snapshot();
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await drive([],1);
  assert.equal((await state()).mode,'title');await capture('title');
  await drive(['Enter']);const start=await state();assert.equal(start.mode,'playing');
  const moved=await drive(['KeyD'],4);assert.ok(moved.px>start.px+1.5);
  await drive(['Space']);assert.equal((await state()).bombs,2);await capture('live-nova');
  await drive(['Escape']);const paused=await state();assert.equal(paused.mode,'paused');await drive(['KeyW','Space'],2);assert.deepEqual(await state(),paused);
  await drive(['Enter']);assert.equal((await state()).mode,'playing');await drive(['KeyR']);assert.equal((await state()).bombs,3);
  if(process.argv.includes('--measure')){
    await execute('playback.input',{keys:[]});await execute('playback.pause');
    await new Promise(resolve=>setTimeout(resolve,4000));await execute('profiler.clear');
    const before=await snapshot(),started=performance.now();
    await new Promise(resolve=>setTimeout(resolve,12000));
    const after=await snapshot(),elapsedMs=performance.now()-started,telemetry=await state();
    assert.equal(telemetry.mode,'playing','Performance capture must include active combat');
    await execute('playback.pause');
    const game=await query('profiler.get_samples',{source:'game',limit:120});
    fs.writeFileSync(`${out}/performance.json`,JSON.stringify({scope:'Release native editor, live opening combat, 4s warmup and 12s capture',elapsedMs,simulationFrames:after.simFrame-before.simFrame,telemetry,game},null,2)+'\n');
    await capture('realtime-combat');
    const windowFrame=await query('view.window_screenshot',{windowLabel:'main'});
    fs.writeFileSync(`${out}/realtime-editor.png`,Buffer.from(windowFrame.dataUrl.split(',')[1],'base64'));
  }
  await execute('playback.stop');assert.deepEqual((await snapshot()).entities,authored.entities);
  if(!process.argv.includes('--live-only')){
    for(const name of ['boss-3-0','boss-3-1','boss-4-0','boss-4-1','boss-4-2','laser','nova','victory']){
      const json=fs.readFileSync(fileURLToPath(new URL(`../tmp/thunder-${name}.mscene`,import.meta.url)),'utf8');
      await execute('scene.load_json',{json});await capture(name);
    }
    await execute('scene.load_json',{json:JSON.stringify({version:1,name:'Astral Thunder / Ion Front',world:authored})});
  }
  fs.writeFileSync(`${out}/agent-checks.json`,JSON.stringify({passed:true,path:'Native editor Agent bridge',start:true,movement:true,nova:true,pauseFreezes:true,resume:true,restart:true,stopRestoresAuthored:true,screenshots:process.argv.includes('--live-only') ? 'Live title and Nova' : 'Live title and Nova; boss phases, Nova and victory rendered from native input replay snapshots'},null,2)+'\n');
  console.log('PASS: Agent input, pause, restart, Stop restoration and native captures');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{try{await execute('playback.stop');}catch{}closeBridgeConnection();}
