// Author: MiYu. Reproducible native game scene and script bundle.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'model-catalog.json'),'utf8'));
for(const dir of ['Scenes','Scripts','Fonts','Maps','Audio'])fs.mkdirSync(path.join(root,'Assets',dir),{recursive:true});
for(const file of ['Roboto-Regular.ttf','LICENSE.txt'])fs.copyFileSync(fileURLToPath(new URL('../samples/ion-outpost/Assets/Fonts/'+file,import.meta.url)),path.join(root,'Assets/Fonts',file));
for(const file of ['Cinzel-OFL.txt','NotoSansSC-OFL.txt'])fs.copyFileSync(path.join(root,'Licenses',file),path.join(root,'Assets/Fonts',file));
const E=[],T=(position=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation}),q=p=>[Math.sin(p/2),0,0,Math.cos(p/2)];
const entity=(name,components,parent=null)=>{const id=E.length+1;E.push({entity:id,name,parent,siblingIndex:id-1,active:true,components});return id;};
const box=(name,p,size,color)=>entity(name,{Transform:T(p,size),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:color,roughness:.95}});
entity('Strategy camera',{Transform:T([0,42,32],[1,1,1],q(-Math.atan2(42,32))),Camera3D:{primary:true,projection:'orthographic',orthographic_size:27,near:.1,far:220,capture_pointer:false},AudioListener:{primary:true}});
entity('Winter sun',{Transform:T([0,0,0],[1,1,1],[-.45,-.25,-.12,.84]),DirectionalLight:{color:[1,.91,.78,1],intensity:2,cast_shadows:true,shadow_distance:90,shadow_strength:.5,shadow_bias:.005,shadow_normal_bias:.08}});
entity('Northern sky',{EnvironmentLight:{sky_color:[.09,.15,.24,1],equator_color:[.23,.32,.37,1],ground_color:[.13,.19,.18,1],diffuse_intensity:.85,specular_intensity:.4,background_enabled:true,tone_mapping:true,exposure:.1}});
entity('Terrain bed',{Transform:T([0,-.7,0],[180,1.2,180]),MeshRenderer:{mesh:'cube',material:'Assets/Materials/Ground.mmat'}});
for(let z=0;z<8;z++)for(let x=0;x<8;x++)entity('Ground '+(z*8+x),{Transform:T([x*8-28,0,z*8-28],[1,1,1]),MeshRenderer:{mesh:'terrain4:'+'0'.repeat(64),material:'Assets/Materials/Ground.mmat'}});
for(let i=0;i<140;i++)entity('Scenery '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.tree_pineTallA.parts[0].mesh,material:catalog.tree_pineTallA.material}});
entity('Command marker',{Transform:T([0,-100,0]),MeshRenderer:{mesh:'cube',material:'Assets/Materials/Selection.mmat'}});
entity('Rally marker',{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.flag.parts[0].mesh,material:catalog.flag.material}});
entity('Placement preview',{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog['tower-square'].parts[0].mesh,material:'Assets/Materials/Placement.mmat'}});
for(let i=0;i<100;i++)entity('Prop '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.tree.parts[0].mesh,material:catalog.tree.material}});
for(let i=0;i<32;i++)entity('Objective '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog['roof-point'].parts[0].mesh,material:catalog['roof-point'].material}});
for(let i=0;i<S.LIMIT;i++){
  entity('Unit '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.Warrior.parts[0].mesh+'#pose=1:0',material:catalog.Warrior.material}});
  entity('Ring '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:'cube',material:'Assets/Materials/Selection.mmat'}});box('HP '+i,[0,-100,0],[1.6,.09,.15],[.24,.86,.47,1]);entity('Flag '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.flag.parts[0].mesh,material:catalog.flag.material}});
}
for(let i=0;i<S.CORPSE_LIMIT;i++)entity('Corpse '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.Warrior.parts[0].mesh,material:catalog.Warrior.material}});
for(let i=0;i<24;i++)entity('FX '+i,{Transform:T([0,-100,0]),ParticleEmitter3D:{playing:false,looping:true,rate_over_time:90,max_particles:36,lifetime_min:.25,lifetime_max:.65,speed_min:1,speed_max:4,size_start:.8,size_end:.05,color_start:[.3,.8,1,1],color_end:[.1,.3,1,0],gravity:[0,-2,0],shape:'sphere',shape_radius:.2,direction:[0,1,0],spread_degrees:160,simulation_space:'world',texture:'Assets/Textures/magic_01.png',billboard:true,seed:i+1}});
for(let i=0;i<S.PROJECTILE_LIMIT;i++){
  entity('Missile '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.RealArrow.parts[0].mesh,material:catalog.RealArrow.material}});
  entity('Missile aura '+i,{Transform:T([0,-100,0]),ParticleEmitter3D:{playing:false,looping:true,rate_over_time:70,max_particles:24,lifetime_min:.18,lifetime_max:.3,speed_min:0,speed_max:.4,size_start:.4,size_end:0,color_start:[.5,.48,1,1],color_end:[.2,.1,.5,0],gravity:[0,0,0],shape:'sphere',shape_radius:.08,direction:[0,1,0],spread_degrees:180,simulation_space:'world',texture:'Assets/Textures/spark_01.png',billboard:true,blend_mode:'additive',seed:i+1}});
}
entity('Snow',{Transform:T([0,12,0]),ParticleEmitter3D:{playing:true,looping:true,rate_over_time:30,max_particles:150,lifetime_min:8,lifetime_max:12,speed_min:.1,speed_max:.3,size_start:.07,size_end:.03,color_start:[.8,.9,1,.55],color_end:[.7,.85,1,0],gravity:[.05,-.1,0],shape:'box',shape_size:[65,1,65],direction:[0,-1,0],simulation_space:'world',texture:'Assets/Textures/spark_01.png',billboard:true,seed:17}});
const canvas=entity('Interface',{Canvas:{render_mode:'ScreenSpaceOverlay'},GraphicRaycaster:{enabled:true},CanvasScaler:{ui_scale_mode:'ScaleWithScreenSize',reference_resolution:[1280,720],match_width_or_height:.5}});
const C={ink:[.025,.04,.057,.96],panel:[.042,.064,.078,.97],gold:[.81,.65,.36,1],white:[.84,.9,.91,1],muted:[.48,.61,.65,1],cyan:[.35,.83,.93,1]};
const ui=(n,x,y,w,h,c)=>entity(n,{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]},...c},canvas);
const panel=(n,x,y,w,h,c=C.panel)=>ui(n,x,y,w,h,{Image:{color:c,raycast_target:false}});
const art=(n,sprite,x,y,w,h)=>ui(n,x,y,w,h,{Image:{sprite,color:[1,1,1,1],raycast_target:false}});
const metal=(n,x,y,w,h)=>ui(n,x,y,w,h,{Image:{material:'Assets/Materials/Panel.mmat',color:[.20,.17,.11,1],raycast_target:false}});
const text=(n,value,x,y,w,h,size=18,color=C.white,alignment='Left')=>ui(n,x,y,w,h,{Text:{text:value,font:'Assets/Fonts/NotoSansSC.ttf',font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false}});
const buttons=[];
function button(id,label,x,y,w,h,group='menu',detail=''){panel(id+' border',x,y,w+2,h+2,[.3,.24,.13,1]);metal(id+' box',x,y,w,h);text(id+' label',label,x,y-(detail?10:0),w-30,h,detail?21:16,C.white);if(detail)text(id+' detail',detail,x,y+19,w-30,24,12,C.muted);buttons.push({id,x,y,w,h,group});}
art('Menu painting','Assets/Art/winterfall-menu.png',0,0,1280,720);panel('Menu shade',-330,0,620,720,[.008,.019,.032,.32]);panel('Menu line',-570,-275,4,27,C.gold);
text('Menu eyebrow','冰封王座 · 北境战役',-324,-276,440,30,18,C.gold);
text('Menu title','FROSTBOUND\nREALMS',-320,-175,460,150,57);
E.at(-1).components.Text.font='Assets/Fonts/Cinzel.ttf';E.at(-1).components.Text.font_size=51;E.at(-1).components.Text.color=[.86,.78,.56,1];
text('Menu subtitle','建立王国，统领你的军队。',-320,-73,460,30,16,C.muted);
button('solo','单人游戏',-324,9,452,69,'menu','遭遇战 · 采集资源、建造基地、指挥军队');
button('moba','远古遗迹',-324,91,452,69,'menu','三路战场 · 英雄、装备与对立要塞');
button('td','自定义游戏',-324,173,452,69,'menu','蜿蜒守望 · 十二波塔防挑战');
button('editor','地图编辑器',-440,245,220,43);button('network','局域网',-207,245,220,43);
button('faction','种族',-440,298,220,37);button('continue','载入游戏',-207,298,220,37);
text('Menu vista','冬落盆地',360,248,440,45,30,C.white,'Right');text('Menu credit','FROSTBOUND REALMS',360,289,440,26,12,C.gold,'Right');
button('rpg','破碎盟约 (F8)',360,171,440,69,'menu','战役 · 任务、遗物与寒霜领主');
button('siege','冬落围城 (F9)',360,89,440,69,'menu','攻城战 · 突破坚固的山口');
button('heroChoice','FROST WARDEN [H]',360,7,440,69,'menu','Control / healing / click to change');
art('Hero preview','Assets/Art/hero-portraits.png#hero-0',173,7,62,62);
for(const suffix of [' label',' detail']){const r=E.find(e=>e.name==='heroChoice'+suffix).components.RectTransform;r.anchored_position[0]+=30;r.size_delta[0]-=70;}
function frame(n,x,y,w,h){metal('HUD Frame '+n,x,y,w,h);panel('HUD Frame '+n+' inset',x,y,w-12,h-12,[.025,.022,.017,1]);for(const [dx,dy,bw,bh] of [[0,-h/2+3,w-4,2],[0,h/2-3,w-4,2],[-w/2+3,0,2,h-4],[w/2-3,0,2,h-4]])panel('HUD Frame '+n+' trim '+dx+' '+dy,x+dx,y+dy,bw,bh,[.42,.34,.19,1]);for(const dx of [-w/2+6,w/2-6])for(const dy of [-h/2+6,h/2-6])panel('HUD Frame '+n+' rivet '+dx+' '+dy,x+dx,y+dy,4,4,[.65,.53,.30,1]);}
metal('Header',0,-340,1280,40);text('Brand','',-513,-338,200,24,15,C.gold);text('Resources','',210,-338,600,24,15,C.white);text('Clock','',0,-332,116,38,13,C.gold,'Center');
for(const [id,label,x] of [['hudMenu','菜单 (F10)',-550],['hudQuest','任务 (F9)',-426],['hudHero','英雄 (Space)',-294]])button(id,label,x,-339,116,29,'toolbar');
for(const [name,icon,x] of [['Gold','gold',237],['Lumber','wood',369],['Supply','tower',501]]){art('HUD '+name+' icon','Assets/Art/command-icons.png#'+icon,x,-339,23,23);text('HUD '+name+' value','',x+54,-339,80,26,16,C.gold,'Left');}
metal('Bottom',0,261,1280,198);panel('Bottom rule',0,162,1280,5,[.33,.27,.15,1]);
frame('Minimap',-531,263,206,194);frame('Portrait',-344,263,158,194);frame('Info',-26,263,466,194);frame('Inventory',291,263,158,194);frame('Commands',493,263,234,194);
panel('Minimap',-531,263,180,174,[.025,.06,.04,1]);
for(let i=0;i<256;i++)panel('Mini tile '+i,-615+(i%16)*11.2,181+Math.floor(i/16)*10.7,11.3,10.8,[.15,.25,.22,1]);
for(let i=0;i<S.LIMIT;i++)panel('Mini unit '+i,5000,5000,4,4,C.cyan);
for(let i=0;i<S.LIMIT;i++)text('Sleep '+i,'Zzz',5000,5000,40,22,14,C.cyan);
art('Portrait','Assets/Art/command-icons.png#hero',-344,247,132,136);text('Selection title','',-32,190,420,27,19,C.gold,'Center');text('Selection stats','',-53,252,322,72,14,C.white);text('Selection queue','',-32,333,420,32,12,C.muted,'Center');
for(const [name,icon,x] of [['Attack','attack',-214],['Armor','shield',-8]]){art('HUD Stat '+name+' icon','Assets/Art/command-icons.png#'+icon,x,245,38,38);text('HUD Stat '+name+' value','',x+102,245,155,60,14,C.white);}
text('HUD Stat rank','',-32,212,400,22,14,C.white,'Center');text('HUD Stat movement','',-32,293,400,22,13,C.white,'Center');panel('HUD Stat experience back',-32,311,390,5,[.02,.01,.04,1]);panel('HUD Stat experience fill',-32,311,390,5,[.55,.22,.72,1]);
panel('Health back',-344,325,132,10,[.01,.025,.01,1]);panel('Health fill',-344,325,132,10,[.08,.72,.18,1]);panel('Mana back',-344,341,132,8,[.01,.015,.04,1]);panel('Mana fill',-344,341,132,8,[.10,.29,.90,1]);text('HUD Health value','',-344,325,130,12,10,C.white,'Center');text('HUD Mana value','',-344,341,130,12,10,C.white,'Center');
text('HUD Inventory title','物品栏',291,187,140,22,14,C.gold,'Center');
for(let i=0;i<6;i++){const x=265+(i%2)*53,y=222+Math.floor(i/2)*51;button('item'+i,'',x,y,42,42,'inventory');art('item'+i+' icon','Assets/Art/command-icons.png#shield',x,y,38,38);text('item'+i+' key',String(i+1),x+14,y+14,12,14,11,C.gold,'Right');}
for(let i=0;i<12;i++){const x=411+(i%4)*54,y=205+Math.floor(i/4)*59;button('action'+i,'',x,y,46,46,'hud');art('action'+i+' icon','Assets/Art/command-icons.png#attack',x,y,42,42);text('action'+i+' key','',x+15,y+15,14,16,12,C.gold,'Right');const b=buttons.at(-1);b.editor={x:5+(i%4)*147,y:214+Math.floor(i/4)*50,w:137,h:42};const label=E.find(e=>e.name==='action'+i+' label');label.components.Text.font_size=12;}
for(let i=0;i<12;i++){const x=-218+(i%6)*74,y=237+Math.floor(i/6)*57;art('HUD Selected '+i,'Assets/Art/unit-portraits.png#RealFootman',x,y,43,43);panel('HUD Selected '+i+' health',x,y+24,43,3,[.1,.8,.2,1]);}
art('HUD Hero portrait','Assets/Art/hero-portraits.png#hero-0',-605,-253,48,48);panel('HUD Hero health',-605,-224,48,4,[.1,.8,.2,1]);panel('HUD Hero mana',-605,-216,48,3,[.1,.3,.9,1]);text('HUD Hero level','',-584,-234,18,18,12,C.gold,'Center');
for(let i=0;i<12;i++)text('Damage '+i,'',5000,5000,90,28,20,C.gold,'Center');
metal('Tooltip panel',386,103,444,100);text('Tooltip text','',386,103,416,86,13,C.white);E.at(-1).components.Text.horizontal_overflow='Wrap';
text('Status','',0,135,1150,25,14,C.gold,'Center');text('Controls','',60,350,400,16,10,C.muted,'Right');
text('Objective text','',0,-280,1100,38,18,C.gold,'Center');
panel('Modal shade',0,0,760,430,C.ink);panel('Modal rule',0,-213,760,2,C.gold);text('Modal title','',0,-164,690,48,34,C.gold);text('Modal text','',0,-13,690,230,19,C.white);button('modalPrimary','',-174,156,320,44,'modal');button('modalBack','BACK',174,156,320,44,'modal');
panel('Drag box',5000,5000,1,1,[.1,.7,.5,.16]);
text('Frost telemetry','{}',5000,5000,1,1,1);
panel('Rename shade',0,-35,880,300,C.ink);panel('Rename rule',0,-184,880,2,C.gold);
text('Rename title','编辑名称 / 任务公告',0,-143,800,38,26,C.gold);
text('Rename hint','点击输入框，使用键盘或输入法编辑；点击保存应用到地图。',0,-96,800,32,17,C.muted);
ui('Rename input',0,-28,800,64,{InputField:{text:'',font:'Assets/Fonts/NotoSansSC.ttf',font_size:22,character_limit:120,multiline:false,interactable:true,background_color:[.06,.1,.14,1],text_color:C.white}});
button('renameClear','清空',-270,65,220,44,'rename');button('renameSave','保存',0,65,220,44,'rename');button('renameCancel','取消',270,65,220,44,'rename');
panel('Pause shade',0,0,1280,720,[0,0,0,.58]);metal('Pause frame',0,-20,394,406);panel('Pause inset',0,-20,378,390,[.024,.034,.044,.98]);text('Pause title','游戏菜单',0,-172,330,42,28,C.gold,'Center');
for(const [id,label,y] of [['pauseResume','返回游戏 (Esc)',-102],['pauseSave','保存游戏',-37],['pauseLoad','载入游戏',28],['pauseExit','结束游戏 (X)',93]])button(id,label,0,y,298,48,'pause');text('Pause hint','单人游戏暂停 · 联机对局继续运行',0,157,340,24,12,C.muted,'Center');
// Original deterministic score and layered effects, generated at PCM 22050 Hz.
function audio(name,duration,sample,loop=false){const count=Math.floor(22050*duration),b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample(i/22050,i)))*24000),44+i*2);fs.writeFileSync(path.join(root,'Assets/Audio',name+'.wav'),b);entity('Sound '+name,{AudioSource:{clip:'Assets/Audio/'+name+'.wav',volume:loop?.12:.25,looped:loop,play_on_awake:loop,playing:loop}});}
const sine=(hz,t)=>Math.sin(hz*t*Math.PI*2),midi=n=>440*2**((n-69)/12);let noiseSeed=71823;const noise=()=>{noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;return noiseSeed/2147483648-1;};
audio('order',.16,t=>(sine(660,t)+.3*sine(1325,t))*Math.exp(-t*32)*.4);
audio('battle',.35,t=>(noise()*.45*Math.exp(-t*28)+sine(115-t*120,t)*.5*Math.exp(-t*18)+sine(1703,t)*.15*Math.exp(-t*24)));
audio('spell',.8,t=>(sine(330+t*500,t)*.2+sine(660+t*400,t)*.12+noise()*.1)*Math.sin(Math.PI*t/.8));
audio('victory',2.4,t=>{const note=[69,72,76,81][Math.min(3,Math.floor(t/.6))],phase=t%.6;return (sine(midi(note),t)+sine(midi(note-12),t)*.4)*Math.exp(-phase*4)*.3*Math.min(1,t*30);});
audio('winter-theme',24,t=>{const root=[45,48,41,43][Math.floor(t/6)],phase=t%6,env=Math.sin(Math.PI*phase/6)**.4,chord=[0,3,7].reduce((v,n)=>v+sine(midi(root+n),t),0)*.065*env,beat=t%.75,note=root+24+[0,7,3,10,7,3,2,7][Math.floor(t/.75)%8],melody=(sine(midi(note),t)+.15*sine(midi(note)*2,t))*.1*Math.exp(-beat*5)*Math.min(1,beat*80);return chord+melody;},true);
for(let i=0;i<32;i++)entity('Foundation '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog['wall-block'].parts[0].mesh,material:catalog['wall-block'].material}});
for(let i=0;i<32;i++)for(let edge=0;edge<4;edge++)entity('Region '+i+' '+edge,{Transform:T([0,-100,0]),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:[.2,.7,1,1],roughness:1,emissive:[.1,.3,.4],emissive_strength:.4}});
for(let i=0;i<9;i++)entity('Waypoint '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:'cube',material:'Assets/Materials/Selection.mmat'}});
for(let i=0;i<9;i++)text('Waypoint label '+i,'',0,0,28,24,15,C.gold,'Center');
for(const mode of ['skirmish','moba','td','rpg'])fs.writeFileSync(path.join(root,'Assets/Maps',mode+'.json'),JSON.stringify(S.defaultMap(mode),null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Maps/highland-pass.json'),JSON.stringify(S.highlandMap(),null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Maps/supply-road.json'),JSON.stringify(S.eventMap(),null,2)+'\n');
for(let i=32;i<S.LIMIT;i++)entity('Objective '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog['roof-point'].parts[0].mesh,material:catalog['roof-point'].material}});
for(let i=0;i<S.LIMIT;i++)entity('Unit aura '+i,{Transform:T([0,-100,0]),ParticleEmitter3D:{playing:false,looping:true,rate_over_time:45,max_particles:24,lifetime_min:.12,lifetime_max:.3,speed_min:1,speed_max:3,size_start:.55,size_end:0,color_start:[.45,.65,1,1],color_end:[.2,.25,1,0],gravity:[0,0,0],shape:'sphere',shape_radius:1.15,direction:[0,1,0],spread_degrees:180,simulation_space:'local',texture:'Assets/Textures/spark_01.png',billboard:true,blend_mode:'additive',seed:i+1}});
fs.writeFileSync(path.join(root,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Frostbound Realms',world:{entities:E,frame:0,sim_frame:0,clear_color:[.08,.13,.18,1]}},null,2)+'\n');
fs.writeFileSync(path.join(root,'project.json'),JSON.stringify({name:'Frostbound Realms',storageId:'frostbound-realms-2d128968-5677-47b3-8d38-a128a763e15a',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js',assetMode:'all'},null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Scripts/Main.js'),'// Generated by scripts/build-frostbound.mjs\nvar FrostArt='+JSON.stringify(catalog)+';\nvar FrostButtons='+JSON.stringify(buttons)+';\n'+['simulation','terrain','visuals','client'].map(n=>fs.readFileSync(path.join(root,'game/'+n+'.js'),'utf8')).join('\n'));
console.log('Built Frostbound Realms:',E.length,'entities;',Object.keys(catalog).length,'model entries');
