// Author: MiYu. Render the actual faction building meshes into a native building atlas.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),tag=Date.now(),sample=path.join(process.env.MENGINE_QA_ROOT||path.join(repo,'tmp'),'faction-icons-'+tag,'sample');
process.env.MENGINE_AGENT_EDITOR_MODE='auto-background';process.env.MENGINE_EDITOR_EXECUTABLE=path.join(repo,'target/release/mengine-editor-tauri.exe');process.env.MENGINE_EDITOR_CONFIG_DIR=path.join(repo,'tmp','faction-icons-'+tag,'config');
process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows';
fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds'].includes(path.basename(p))});
const catalog=JSON.parse(fs.readFileSync(path.join(source,'model-catalog.json'))),original=JSON.parse(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene'))),entities=[],slices=[],models=[];
const buildingKeys=['Kingdom','Warclans','Wildwood','Revenant'].flatMap(faction=>['Hall','Hall2','Hall3','Barracks','Lodge','Tower','Altar','Workshop'].map(kind=>faction+kind)).concat('RealTemple'),rows=Math.ceil(buildingKeys.length/8);
const add=(name,components)=>entities.push({entity:entities.length+1,name,parent:null,siblingIndex:entities.length,active:true,components}),transform=(position,scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation}),sin=Math.SQRT1_2;
add('Icon camera',{Transform:transform([0,80,80],[1,1,1],[Math.sin(-Math.PI/8),0,0,Math.cos(-Math.PI/8)]),Camera3D:{primary:true,projection:'orthographic',orthographic_size:rows*4,near:.1,far:220}});
for(const name of ['Winter sun','Northern sky'])add(name,original.world.entities.find(e=>e.name===name).components);
entities.at(-1).components.EnvironmentLight.background_enabled=false;
for(const [i,key] of buildingKeys.entries()){
  const row=Math.floor(i/8),col=i%8,asset=catalog[key],width=(asset.size[0]+asset.size[2])*sin,height=asset.size[1]*sin+width*sin,scale=6.2/Math.max(width,height),x=(col-3.5)*8,z=((row-(rows-1)/2)*8+asset.size[1]*scale*sin/2)/sin;
  add(key,{Transform:transform([x,0,z],[scale,scale,scale],[0,Math.sin(Math.PI/8),0,Math.cos(Math.PI/8)]),MeshRenderer:{mesh:asset.parts[0].mesh,material:asset.material}});
  slices.push({name:key,rect:[col*256,row*256,256,256],pivot:[.5,.5]});models.push({name:key,mesh:asset.parts[0].mesh,material:asset.material});
}
fs.writeFileSync(path.join(sample,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Faction building icons',world:{entities,frame:0,sim_frame:0,clear_color:[.025,.04,.055,1]}}));
fs.writeFileSync(path.join(sample,'Assets/Scripts/Main.js'),'function onTick(dt) {}');
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId='faction-icons-'+tag;fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
const {bridgeQuery,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID()});assert.ok(r.ok,r.error?.message);return r.data;};
try{
  for(let attempt=0;;attempt++){try{await execute('project.open',{root:sample});break;}catch(e){if(e.message.includes('workspace is still loading')||e.message.includes('A project is already open'))break;if(attempt>=40||!e.message.includes('lifecycle is busy'))throw e;await sleep(500);}}
  for(let attempt=0;;attempt++){try{const state=await bridgeQuery('project.state');if(state.ready&&state.editorReady){assert.equal(path.resolve(state.project.root),path.resolve(sample));break;}}catch(e){if(e.code!=='NOT_READY')throw e;}if(attempt>=180)throw Error('Native portrait project did not become ready');await sleep(500);}
  await execute('view.set_game_resolution',{resolution:{width:2048,height:rows*256}});await execute('panel.focus',{kind:'game'});await execute('playback.play');await sleep(2000);
  const shot=await bridgeQuery('view.screenshot',{target:'game'}),png=Buffer.from(shot.dataUrl.split(',')[1],'base64');assert.equal(png.readUInt32BE(16),2048);assert.equal(png.readUInt32BE(20),rows*256);
  const atlas='Assets/Art/faction-buildings.png';fs.writeFileSync(path.join(source,atlas),png);fs.writeFileSync(path.join(source,atlas+'.sprite.json'),JSON.stringify({version:1,mode:'multiple',pixels_per_unit:256,slices},null,2)+'\n');
  fs.writeFileSync(path.join(source,'faction-icons.json'),JSON.stringify({file:atlas,sha256:crypto.createHash('sha256').update(png).digest('hex'),generator:'scripts/render-frost-faction-icons.mjs',method:'Native MEngine Release render of the actual building meshes; no generated concept art',runtimeSha256:crypto.createHash('sha256').update(fs.readFileSync(process.env.MENGINE_EDITOR_EXECUTABLE)).digest('hex'),models},null,2)+'\n');
  console.log('Rendered '+buildingKeys.length+' native building icons at 2048 x '+rows*256);
}finally{try{await execute('playback.stop');}finally{closeBridgeConnection();}}
