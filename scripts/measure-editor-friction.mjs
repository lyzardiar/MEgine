import fs from 'node:fs';
import assert from 'node:assert/strict';
if(!process.env.MENGINE_EDITOR_CONFIG_DIR || !process.env.MENGINE_EDITOR_EXECUTABLE)throw Error('Use isolated QA editor paths');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(command,args={})=>{const r=await bridgeExecute(command,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;};
const tag=process.argv[2]??'measurement';
fs.mkdirSync('docs/designs/editor-performance',{recursive:true});
try{
  if((await query('project.state')).project){await execute('playback.stop');await execute('project.close');}
  await execute('project.open',{root:fs.realpathSync('samples/unity-physics-friction')});
  await execute('view.set_game_resolution',{resolution:{width:1080,height:1920}});
  await execute('panel.focus',{kind:'profiler'});
  await execute('panel.focus',{kind:'game'});
  await execute('playback.play');
  const readyDeadline=Date.now()+30000;
  while(true){
    const profile=await query('profiler.get_samples',{source:'game',limit:1});
    if(profile.nativeProfileCount>=5 && profile.nativeLatest?.counts.entities===65)break;
    assert.ok(Date.now()<readyDeadline,'Game must finish initialization before measurement');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  await new Promise(resolve=>setTimeout(resolve,4000));
  await execute('profiler.clear');
  const simulationBefore=await query('scene.snapshot');
  const started=performance.now();
  await new Promise(resolve=>setTimeout(resolve,12000));
  const simulationAfter=await query('scene.snapshot');
  const elapsedMs=performance.now()-started;
  const simulation={frames:simulationAfter.simFrame-simulationBefore.simFrame,elapsedMs,framesPerSecond:(simulationAfter.simFrame-simulationBefore.simFrame)*1000/elapsedMs};
  const result={simulation,scope:'Isolated native editor, friction sample, 1080x1920 Game output, Game and Profiler visible in the default layout',executable:process.env.MENGINE_EDITOR_EXECUTABLE,elapsedMs:performance.now()-started,game:await query('profiler.get_samples',{source:'game',limit:120}),scene:await query('profiler.get_samples',{source:'scene',limit:120})};
  fs.writeFileSync(`docs/designs/editor-performance/${tag}.json`,JSON.stringify(result,null,2)+'\n');
  const screenshot=await query('view.window_screenshot',{windowLabel:'main'});
  fs.writeFileSync(`docs/designs/editor-performance/${tag}.png`,Buffer.from(screenshot.dataUrl.split(',')[1],'base64'));
  console.log(JSON.stringify({game:result.game.summary,native:result.game.nativeSummary,nativeProfileCount:result.game.nativeProfileCount},null,2));
  await execute('playback.stop');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{closeBridgeConnection();}
