// Author: MiYu. Reproducible native game scene and script bundle.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'model-catalog.json'),'utf8'));
for(const dir of ['Scenes','Scripts','Fonts','Maps','Audio'])fs.mkdirSync(path.join(root,'Assets',dir),{recursive:true});
for(const file of ['Roboto-Regular.ttf','LICENSE.txt'])fs.copyFileSync(fileURLToPath(new URL('../samples/ion-outpost/Assets/Fonts/'+file,import.meta.url)),path.join(root,'Assets/Fonts',file));
const E=[],T=(position=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation}),q=p=>[Math.sin(p/2),0,0,Math.cos(p/2)];
const entity=(name,components,parent=null)=>{const id=E.length+1;E.push({entity:id,name,parent,siblingIndex:id-1,active:true,components});return id;};
const box=(name,p,size,color)=>entity(name,{Transform:T(p,size),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:color,roughness:.95}});
entity('Strategy camera',{Transform:T([0,42,32],[1,1,1],q(-Math.atan2(42,32))),Camera3D:{primary:true,projection:'orthographic',orthographic_size:27,near:.1,far:220,capture_pointer:false},AudioListener:{primary:true}});
entity('Winter sun',{Transform:T([0,0,0],[1,1,1],[-.45,-.25,-.12,.84]),DirectionalLight:{color:[.93,.93,1,1],intensity:2.2,cast_shadows:true,shadow_distance:100,shadow_strength:.6,shadow_bias:.002}});
entity('Northern sky',{EnvironmentLight:{sky_color:[.09,.15,.24,1],equator_color:[.23,.32,.37,1],ground_color:[.13,.19,.18,1],diffuse_intensity:.85,specular_intensity:.4,background_enabled:true,tone_mapping:true,exposure:.1}});
box('Terrain bed',[0,-.7,0],[72,1.2,72],[.11,.18,.2,1]);
for(let z=0;z<32;z++)for(let x=0;x<32;x++)box('Tile '+(z*32+x),[x*2-31,-.12,z*2-31],[2,.2,2],[.24,.37,.3,1]);
for(let i=0;i<100;i++)entity('Prop '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.tree.parts[0].mesh,material:catalog.tree.material}});
for(let i=0;i<32;i++)entity('Objective '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog['roof-point'].parts[0].mesh,material:catalog['roof-point'].material}});
for(let i=0;i<S.LIMIT;i++){
  entity('Unit '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.Warrior.parts[0].mesh+'#pose=1:0',material:catalog.Warrior.material}});
  box('Ring '+i,[0,-100,0],[1.7,.04,1.7],[.12,.9,.65,1]);box('HP '+i,[0,-100,0],[1.6,.09,.15],[.24,.86,.47,1]);box('Flag '+i,[0,-100,0],[.24,.3,.24],[.22,.62,1,1]);
}
for(let i=0;i<24;i++)entity('FX '+i,{Transform:T([0,-100,0]),ParticleEmitter3D:{playing:false,looping:true,rate_over_time:90,max_particles:36,lifetime_min:.25,lifetime_max:.65,speed_min:1,speed_max:4,size_start:.8,size_end:.05,color_start:[.3,.8,1,1],color_end:[.1,.3,1,0],gravity:[0,-2,0],shape:'sphere',shape_radius:.2,direction:[0,1,0],spread_degrees:160,simulation_space:'world',texture:'Assets/Textures/magic_01.png',billboard:true,seed:i+1}});
entity('Snow',{Transform:T([0,12,0]),ParticleEmitter3D:{playing:true,looping:true,rate_over_time:30,max_particles:150,lifetime_min:8,lifetime_max:12,speed_min:.1,speed_max:.3,size_start:.07,size_end:.03,color_start:[.8,.9,1,.55],color_end:[.7,.85,1,0],gravity:[.05,-.1,0],shape:'box',shape_size:[65,1,65],direction:[0,-1,0],simulation_space:'world',texture:'Assets/Textures/spark_01.png',billboard:true,seed:17}});
const canvas=entity('Interface',{Canvas:{render_mode:'ScreenSpaceOverlay'},CanvasScaler:{ui_scale_mode:'ScaleWithScreenSize',reference_resolution:[1280,720],match_width_or_height:.5}});
const C={ink:[.025,.04,.057,.96],panel:[.042,.064,.078,.97],gold:[.81,.65,.36,1],white:[.84,.9,.91,1],muted:[.48,.61,.65,1],cyan:[.35,.83,.93,1]};
const ui=(n,x,y,w,h,c)=>entity(n,{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]},...c},canvas);
const panel=(n,x,y,w,h,c=C.panel)=>ui(n,x,y,w,h,{Image:{color:c,raycast_target:false}});
const text=(n,value,x,y,w,h,size=18,color=C.white,alignment='Left')=>ui(n,x,y,w,h,{Text:{text:value,font:'Assets/Fonts/Roboto-Regular.ttf',font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false}});
const buttons=[];
function button(id,label,x,y,w,h,group='menu',detail=''){panel(id+' border',x,y,w+2,h+2,C.gold);panel(id+' box',x,y,w,h);text(id+' label',label,x,y-(detail?10:0),w-30,h,detail?21:16,C.white);if(detail)text(id+' detail',detail,x,y+19,w-30,24,12,C.muted);buttons.push({id,x,y,w,h,group});}
panel('Menu shade',-330,0,620,720,C.ink);panel('Menu line',-570,-275,4,27,C.gold);
text('Menu eyebrow','THE NORTHERN CHRONICLES',-324,-276,440,30,14,C.gold);
text('Menu title','FROSTBOUND\nREALMS',-320,-175,460,150,57);
text('Menu subtitle','Raise a kingdom. Command the storm.',-320,-73,460,30,16,C.muted);
button('solo','I    SKIRMISH',-324,9,452,69,'menu','Harvest, build and lead your army against the AI');
button('moba','II   ANCIENTS OF THE VALE',-324,91,452,69,'menu','Three lanes, heroes, items and rival strongholds');
button('td','III  SERPENTINE WATCH',-324,173,452,69,'menu','Tower defense / twelve escalating waves');
button('editor','WORLD EDITOR',-440,245,220,43);button('network','MULTIPLAYER',-207,245,220,43);
button('faction','FACTION',-440,298,220,37);button('continue','LOAD GAME',-207,298,220,37);
text('Menu vista','WINTERFALL BASIN',360,248,440,45,30,C.white,'Right');text('Menu credit','FREE CC0 ART / QUATERNIUS + KENNEY',360,289,440,26,12,C.gold,'Right');
button('rpg','THE SHATTERED COVENANT [F8]',360,171,440,69,'menu','RPG / quests, relics and the frost sovereign');
panel('Header',0,-333,1250,43,C.ink);text('Brand','FROSTBOUND',-513,-334,200,30,19,C.gold);text('Resources','',30,-334,650,30,17,C.white);text('Clock','',509,-334,210,30,16,C.cyan,'Right');
panel('Bottom',0,266,1250,179,C.ink);panel('Bottom rule',0,177,1250,2,C.gold);
panel('Minimap',-514,265,174,156,[.04,.11,.12,1]);
for(let i=0;i<256;i++)panel('Mini tile '+i,-590+(i%16)*10,195+Math.floor(i/16)*9,10,9,[.15,.25,.22,1]);
for(let i=0;i<S.LIMIT;i++)panel('Mini unit '+i,5000,5000,4,4,C.cyan);
text('Selection title','',-238,203,330,28,21,C.gold);text('Selection stats','',-238,251,330,72,15,C.white);text('Selection queue','',-238,315,330,42,13,C.muted);
for(let i=0;i<12;i++){const x=5+(i%4)*147,y=214+Math.floor(i/4)*50;button('action'+i,'',x,y,137,40,'hud');}
text('Status','',0,151,1180,32,15,C.gold,'Center');text('Controls','',60,340,1020,20,12,C.muted,'Right');
text('Objective text','',0,-280,1100,38,18,C.gold,'Center');
panel('Modal shade',0,0,760,430,C.ink);panel('Modal rule',0,-213,760,2,C.gold);text('Modal title','',0,-164,690,48,34,C.gold);text('Modal text','',0,-13,690,230,19,C.white);button('modalPrimary','',-174,156,320,44,'modal');button('modalBack','BACK',174,156,320,44,'modal');
panel('Drag box',5000,5000,1,1,[.1,.7,.5,.16]);
text('Frost telemetry','{}',5000,5000,1,1,1);
function tone(name,hz,duration){const count=Math.floor(22050*duration),b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.sin(i/22050*hz*Math.PI*2)*Math.exp(-i/count*5)*6000),44+i*2);fs.writeFileSync(path.join(root,'Assets/Audio',name+'.wav'),b);entity('Sound '+name,{AudioSource:{clip:'Assets/Audio/'+name+'.wav',volume:.25,looped:false,play_on_awake:false,playing:false}});}
tone('order',620,.12);tone('spell',320,.5);tone('battle',110,.15);tone('victory',880,.8);
for(const mode of ['skirmish','moba','td','rpg'])fs.writeFileSync(path.join(root,'Assets/Maps',mode+'.json'),JSON.stringify(S.defaultMap(mode),null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Frostbound Realms',world:{entities:E,frame:0,sim_frame:0,clear_color:[.08,.13,.18,1]}},null,2)+'\n');
fs.writeFileSync(path.join(root,'project.json'),JSON.stringify({name:'Frostbound Realms',storageId:'frostbound-realms-2d128968-5677-47b3-8d38-a128a763e15a',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js',assetMode:'all'},null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Scripts/Main.js'),'// Generated by scripts/build-frostbound.mjs\nvar FrostArt='+JSON.stringify(catalog)+';\nvar FrostButtons='+JSON.stringify(buttons)+';\n'+fs.readFileSync(path.join(root,'game/simulation.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'game/client.js'),'utf8'));
console.log('Built Frostbound Realms:',E.length,'entities;',Object.keys(catalog).length,'downloaded models');
