// Author: MiYu. Compare native water atlas RGB/alpha with independent repeating textures and verify real map animation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {configureNativeQa,closeNativeQa} from './frost-native-qa-runtime.mjs';

const repo=fileURLToPath(new URL('../',import.meta.url)),fixture=path.resolve(process.argv[2]||''),map=path.resolve(process.argv[3]||''),out=path.join(repo,'tmp/docs-artifacts/testing-batches/B001');
assert.ok(process.argv[2]&&process.argv[3]&&process.env.MENGINE_EDITOR_EXECUTABLE,'Provide water atlas fixture, generated terrain project and MENGINE_EDITOR_EXECUTABLE');
const label='water-atlas-'+Date.now(),root=path.join(out,'native-qa',label),reportPath=path.join(out,label+'.json'),hash=raw=>createHash('sha256').update(raw).digest('hex');
configureNativeQa(root);
const samples=[fixture,map].map((source,index)=>{const target=path.join(root,'sample-'+index);fs.cpSync(source,target,{recursive:true,filter:file=>!file.includes(path.sep+'SourceAssets')});return target;});
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={fixture,map,label,passed:false,cases:[],checks:[],editorSha256:hash(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)),shaderSha256:hash(fs.readFileSync(path.join(map,'Assets/Shaders/Water.mshader')))};
async function capture(name){
  const deadline=Date.now()+30000;
  for(;;)try{const shot=await query('view.screenshot',{target:'game',maxSize:1280});const file=path.join(out,label+'-'+name+'.png');fs.writeFileSync(file,Buffer.from(shot.dataUrl.split(',')[1],'base64'));return {path:file,pixels:shot.dataUrl};}
  catch(error){if(Date.now()>=deadline||!/NOT_READY|canvas is not available yet/.test(error.message))throw error;await sleep(500);}
}
try{
  for(let attempt=0;;attempt++)try{await query('project.state');break;}catch(error){if(attempt>=20||!/BridgeConnectionError|request timed out|not ready/.test(error.message))throw error;await sleep(500);}
  await execute('project.open',{root:samples[0]});const authored=await query('scene.snapshot'),water=authored.entities.find(e=>e.name==='Water');
  async function render(mode,frame,lod){
    await execute('component.set',{entity:water.entity,type:'MeshRenderer',value:{...water.components.MeshRenderer,material:'Assets/Materials/'+mode+'.mmat'}});
    await execute('component.set',{entity:water.entity,type:'MaterialPropertyBlock',value:{custom_parameter_names:['test'],custom_parameter_values:[[frame,lod,0,0]]}});
    await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});const shot=await capture(mode+'-'+frame+'-'+lod);await execute('playback.stop');return shot.path;
  }
  const reuseIndex=process.argv.indexOf('--reuse-pixels');
  if(reuseIndex>=0){
    const previous=path.resolve(process.argv[reuseIndex+1]),prior=JSON.parse(fs.readFileSync(previous,'utf8'));assert.equal(prior.editorSha256,report.editorSha256);assert.equal(prior.shaderSha256,report.shaderSha256);assert.equal(prior.cases.length,16);
    for(const file of ['Assets/Models/Water.glb','Assets/Scenes/Main.mscene','Assets/Textures/atlas.png','Assets/Textures/legacy.png',...['fixed','legacy','reference-0','reference-7','reference-8','reference-44'].map(n=>'Assets/Shaders/'+n+'.mshader'),...[0,7,8,44].map(n=>'Assets/Textures/frame-'+n+'.png')])assert.equal(hash(fs.readFileSync(path.join(prior.fixture,file))),hash(fs.readFileSync(path.join(fixture,file))),file);
    report.cases=prior.cases;report.legacy=prior.legacy;report.reusedPixels=previous;
    if(prior.pixelChecks?.length===16){
      for(const frame of [0,7,8,44])for(const ext of ['Shaders/compare-'+frame+'.mshader','Materials/compare-'+frame+'.mmat'])assert.equal(hash(fs.readFileSync(path.join(prior.fixture,'Assets',ext))),hash(fs.readFileSync(path.join(fixture,'Assets',ext))),ext);
      assert.ok(report.cases.every(c=>c.comparison&&fs.existsSync(c.comparison)));report.reusedComparisons=previous;
    }
  }else{
    for(const frame of [0,7,8,44])for(const lod of [0,2.5,7,10])report.cases.push({frame,lod,fixed:await render('fixed',frame,lod),reference:await render('reference-'+frame,frame,lod)});
    report.legacy=await render('legacy',0,7);
  }
  if(!report.reusedComparisons)for(const entry of report.cases)entry.comparison=await render('compare-'+entry.frame,entry.frame,entry.lod);
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
  report.pixelOutput=execFileSync('python',[path.join(repo,'scripts/test-frost-water-atlas.py'),'--verify-native',reportPath],{encoding:'utf8',windowsHide:true});
  const checked=JSON.parse(fs.readFileSync(reportPath,'utf8'));report.pixelChecks=checked.pixelChecks;report.legacyMaxDifference=checked.legacyMaxDifference;
  report.fixtureErrors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.fixtureErrors.length,0,JSON.stringify(report.fixtureErrors));
  await execute('scene.open',{name:'Main',discardDirty:true});await execute('project.close');await sleep(1000);closeBridgeConnection();
  for(let attempt=0;;attempt++)try{await execute('project.open',{root:samples[1]});break;}catch(error){if(attempt>=10||!/BridgeConnectionError|NOT_READY|not ready|request timed out/.test(error.message))throw error;await sleep(500);}
  const mapAuthored=await query('scene.snapshot');
  const rate=Number(fs.readFileSync(path.join(map,'Assets/Scripts/Main.js'),'utf8').match(/Math.floor\(elapsed\*([\d.]+)\)/)[1]);
  await execute('playback.play',{paused:true});await execute('panel.focus',{kind:'game'});await execute('playback.step',{steps:1,deltaTime:1/60});const initial=await capture('map-initial');
  await execute('playback.step',{steps:8,deltaTime:1/60});const advanced=await query('scene.snapshot'),waterFrames=advanced.entities.filter(e=>e.name.startsWith('Water-')).map(e=>e.components.MaterialPropertyBlock.custom_parameter_values[0][0]);
  assert.ok(waterFrames.length&&waterFrames.every(v=>v===Math.floor(9/60*rate)));report.waterFrames=waterFrames;
  const animated=await capture('map-animated');assert.notEqual(animated.pixels,initial.pixels);assert.equal((await capture('map-paused')).pixels,animated.pixels);
  await execute('playback.stop');assert.deepEqual((await query('scene.snapshot')).entities,mapAuthored.entities);
  await execute('playback.play',{paused:true});await execute('playback.step',{steps:1,deltaTime:1/60});assert.equal((await capture('map-restarted')).pixels,initial.pixels);await execute('playback.stop');
  report.errors=(await query('console.get_logs',{limit:300})).filter(log=>log.level==='error');assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  report.checks.push('16 frame/LOD cases compare repeated RGB and alpha with standalone native textures; source water animation, Pause, Stop and restart pass');report.passed=true;console.log('PASS native water atlas',label,report.pixelOutput);
}catch(error){report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{try{await execute('playback.stop');await execute('scene.open',{name:'Main',discardDirty:true});}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);}catch(error){report.cleanupError=error.message;}fs.writeFileSync(reportPath,JSON.stringify(report,null,2));}
