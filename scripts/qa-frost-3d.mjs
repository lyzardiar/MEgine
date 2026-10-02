// Author: MiYu. Native scene meshes, volumetric ridges, input and rendered comparison.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),out=path.join(repo,'docs/designs/frostbound-realms');
const before=process.argv.includes('--before'),tag=process.env.MENGINE_QA_TAG||'1790892104338',sample=path.join(process.env.MENGINE_QA_ROOT||'D:/MEngineNativeQA','frost-qa-'+tag,'sample');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(repo,'tmp','frost-qa-'+tag+'-0');process.env.MENGINE_EDITOR_EXECUTABLE=path.join(repo,'target/release/mengine-editor-tauri.exe');
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='frost-qa-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
if(before){
  const old=file=>execFileSync('git',['show','5894a01:samples/frostbound-realms/'+file],{cwd:repo,maxBuffer:8*1024*1024}).toString();
  fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),old('Assets/Scenes/Main.mscene'));
  const prefix=fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'),'utf8').split('/* Author: MiYu.')[0];
  fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),prefix.replace(/var FrostArt=.*;\n/, 'var FrostArt='+JSON.stringify(JSON.parse(old('model-catalog.json')))+';\n')+['simulation','terrain','visuals','client'].map(n=>old('game/'+n+'.js')).join('\n'));
}
const telemetry=path.join(sample,'Assets/Scripts/Main.js');fs.writeFileSync(telemetry,fs.readFileSync(telemetry,'utf8').replace('JSON.stringify({mode,','JSON.stringify({qaUnits:state.units,mode,'));
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;};
const until=async(check,label)=>{const end=Date.now()+45000;while(Date.now()<end){try{const result=await check();if(result)return result;}catch(e){if(!/loading|NOT_READY/.test(e.message+' '+e.code))throw e;}await sleep(350);}throw Error('Timed out '+label);};
const scene=()=>bridgeQuery('scene.snapshot'),state=async()=>JSON.parse((await scene()).entities.find(e=>e.name==='Frost telemetry').components.Text.text);
const press=async key=>{await execute('playback.input',{keys:[key],viewport:[1280,720]});await sleep(200);await execute('playback.input',{keys:[]});await sleep(180);};
const click=async(p,button=0)=>{await execute('playback.input',{pointer:p,buttons:[button],viewport:[1280,720]});await sleep(250);await execute('playback.input',{buttons:[]});await sleep(250);};
const point=(s,u)=>{const pitch=Math.atan2(before?42:V.camera.height,before?32:V.camera.depth);return [640+(u.x-s.camera[0])/s.zoom*360,360+((u.z-s.camera[1])*Math.sin(pitch)-(u.y??S.elevation(S.defaultMap(),u.x,u.z))*Math.cos(pitch))/s.zoom*360];};
const capture=async name=>{await sleep(500);const shot=await bridgeQuery('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'3d-'+(before?'before-':'')+name+'.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));};
const report={passed:false,scope:'Native Release editor, actual meshes and Agent input',physicalInput:false,before};
try{
  const boot=await bridgeQuery('project.state');if(!boot.ready||path.resolve(boot.project.root)!==path.resolve(sample))try{await execute('project.open',{root:sample});}catch(e){if(!/loading|already open|BridgeConnectionError/.test(e.message))throw e;}
  await until(async()=>{const p=await bridgeQuery('project.state');return p.ready&&p.editorReady&&path.resolve(p.project.root)===path.resolve(sample)&&await scene();},'scene ready');
  await execute('view.set_game_resolution',{resolution:{width:1280,height:720}});await execute('panel.focus',{kind:'game'});await execute('playback.play');await until(async()=>(await state()).mode==='title','title');
  await press('F1');await until(async()=>(await state()).mode==='playing','default battle');await press('KeyS');await press('KeyF');await capture('settlement');
  const initial=await state(),snapshot=await scene();report.defaultRaisedCells=initial.terrainRaised;
  if(!before){
    const trees=snapshot.entities.filter(e=>e.active!==false&&/^(Prop|Scenery) /.test(e.name||'')&&/RealSpruce/.test(e.components.MeshRenderer?.mesh||''));assert.ok(trees.length>5);assert.ok(trees.every(e=>!e.components.MeshRenderer.mesh.includes('-card')));report.visible3dTrees=trees.length;
    assert.ok(initial.terrainRaised>=100);const camera=snapshot.entities.find(e=>e.name==='Strategy camera').components.Transform;assert.equal(camera.position[1],V.camera.height);
    const worker=initial.qaUnits.find(u=>u.team===0&&u.kind==='worker'&&!u.inside);assert.ok(worker);await until(async()=>{const s=await state();if(s.selected.includes(worker.id))return true;const u=s.qaUnits.find(v=>v.id===worker.id);await click(point(s,u));return false;},'native worker picking');await press('KeyS');
    const start=(await state()).qaUnits.find(u=>u.id===worker.id);await click(point(await state(),{x:start.x+3,z:start.z+2}),2);await until(async()=>{const u=(await state()).qaUnits.find(u=>u.id===worker.id);return Math.hypot(u.x-start.x,u.z-start.z)>1;},'native move');report.workerSelectionMovement=true;
  }
  await press('Home');await capture('buildings');await press('F5');await press('F10');await press('KeyX');
  const menuButton=async id=>{const e=(await scene()).entities.find(e=>e.name===id+' box');assert.notEqual(e.active,false);const r=e.components.RectTransform;await click([640+r.anchored_position[0],360+r.anchored_position[1]]);};await menuButton('solo');await menuButton('custom');const choose=async()=>{const e=(await scene()).entities.find(e=>e.name==='faction box').components.RectTransform;await click([640+e.anchored_position[0],360+e.anchored_position[1]]);};await choose();await choose();await press('Enter');await until(async()=>(await state()).mode==='playing','wildwood battle');assert.ok((await scene()).entities.some(e=>e.active!==false&&/RealWildwoodHall/.test(e.components.MeshRenderer?.mesh||''))||before,'Wildwood hall rendered');await press('Home');await capture('wildwood');report.wildwoodMeshes=(await scene()).entities.filter(e=>e.active!==false&&/RealWildwood/.test(e.components.MeshRenderer?.mesh||'')).length;await press('F10');await press('KeyX');
  await press('F4');await capture('terrain');
  if(!before){const snap=await scene();assert.ok(snap.entities.some(e=>/^Ground /.test(e.name||'')&&/[246]/.test(e.components.MeshRenderer.mesh.slice(9))));}
  await click([69.625,601.25]);for(let i=0;i<6;i++)await press('Home');await capture('ridge-detail');for(let i=0;i<6;i++)await press('End');await click([109,623]);await press('F9');await capture('highland');
  const profile=await bridgeQuery('profiler.get_samples',{source:'game',limit:60});assert.equal(profile.nativeLatest.counts.materialPipelinesRejected,0);report.profiler=profile.nativeSummary;report.passed=true;console.log('PASS native 3D meshes, default ridges, camera, worker selection/movement and captures');
}catch(e){report.error=e.stack;throw e;}finally{fs.writeFileSync(path.join(out,'native-3d'+(before?'-before':'')+'-qa.json'),JSON.stringify(report,null,2)+'\n');try{await execute('playback.stop');}catch{}closeBridgeConnection();}
