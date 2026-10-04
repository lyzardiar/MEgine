// Author: MiYu. Reproducible native game scene and script bundle.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url)),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const V=createRequire(import.meta.url)('../samples/frostbound-realms/game/visuals.js');
const detailCount=createRequire(import.meta.url)('../samples/frostbound-realms/game/terrain.js').detailCount;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'model-catalog.json'),'utf8'));
const portraitViews=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root,'head-portraits.json'),'utf8')).views.map(v=>[v.key,v]));
for(const dir of ['Scenes','Scripts','Fonts','Maps','Audio'])fs.mkdirSync(path.join(root,'Assets',dir),{recursive:true});
for(const file of ['Roboto-Regular.ttf','LICENSE.txt'])fs.copyFileSync(fileURLToPath(new URL('../samples/ion-outpost/Assets/Fonts/'+file,import.meta.url)),path.join(root,'Assets/Fonts',file));
for(const file of ['Cinzel-OFL.txt','NotoSansSC-OFL.txt'])fs.copyFileSync(path.join(root,'Licenses',file),path.join(root,'Assets/Fonts',file));
const E=[],T=(position=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation}),q=p=>[Math.sin(p/2),0,0,Math.cos(p/2)];
const entity=(name,components,parent=null)=>{const id=E.length+1;E.push({entity:id,name,parent,siblingIndex:id-1,active:true,components});return id;};
const box=(name,p,size,color)=>entity(name,{Transform:T(p,size),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:color,roughness:.95}});
entity('Strategy camera',{Transform:T([0,V.camera.height,V.camera.depth],[1,1,1],q(-Math.atan2(V.camera.height,V.camera.depth))),Camera3D:{primary:true,projection:'orthographic',orthographic_size:27,near:.1,far:220,capture_pointer:false},AudioListener:{primary:true}});
entity('Winter sun',{Transform:T([0,0,0],[1,1,1],[-.45,-.25,-.12,.84]),DirectionalLight:{color:[1,.91,.78,1],intensity:2,cast_shadows:true,shadow_distance:90,shadow_strength:.65,shadow_bias:.0004,shadow_normal_bias:.025}});
entity('Northern sky',{EnvironmentLight:{sky_color:[.09,.15,.24,1],equator_color:[.23,.32,.37,1],ground_color:[.13,.19,.18,1],diffuse_intensity:.85,specular_intensity:.4,background_enabled:true,tone_mapping:true,exposure:.1}});
entity('Terrain bed',{Transform:T([0,-1.35,0],[22.5,1,22.5]),MeshRenderer:{mesh:'terrain4r:33'+'0000'.repeat(36),material:'Assets/Materials/Ground.mmat'}});
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
const menuMetal=(n,x,y,w,h)=>ui(n,x,y,w,h,{Image:{material:'Assets/Materials/ClassicPanel.mmat',color:[1,1,1,1],raycast_target:false}});
const iron=(n,x,y,w,h,density=10)=>ui(n,x,y,w,h,{Image:{sprite:'Assets/Art/classic-iron-frame.png',image_type:'Sliced',border:[250,250,250,250],source_size:[1254,1254],pixels_per_unit_multiplier:density,color:[1,1,1,1],raycast_target:false}});
function classicButton(id,label,x,y,w,h,group){panel(id+' border',x,y,w+4,h+4,[.035,.043,.057,1]);ui(id+' box',x,y,w,h,{Image:{material:'Assets/Materials/ClassicButton.mmat',color:[1,1,1,1],raycast_target:false}});text(id+' label',label,x,y,w-12,h,20,[.92,.79,.45,1],'Center');buttons.push({id,x,y,w,h,group});}
art('Menu painting','Assets/Art/frozen-throne-menu.png',0,0,1280,720);
for(let i=0;i<70;i++)art('Menu snow '+i,'Assets/Textures/spark_01.png',-640+(i*197%1280),-360+(i*149%720),2+i%3,2+i%3);
// Suspension links remain native geometry; panel and button labels stay independent and interactive.
for(const x of [343,557])for(let i=0;i<35;i++){const y=-352+i*10;panel('Title chain '+x+' '+i,x,y,i%2?5:9,12,[.055,.063,.075,1]);panel('Title chain glint '+x+' '+i,x-2,y,i%2?1:2,9,[.32,.34,.37,1]);panel('Title chain hole '+x+' '+i,x,y,i%2?1:4,7,[.008,.012,.018,1]);}
for(const [n,x,y,w,h,d] of [['outer',0,0,1280,720,20],['panel',450,-30,330,372,9],['quit',450,268,330,90,10]]){if(n!=='outer')menuMetal('Title '+n+' backing',x,y,w-14,h-14);iron((n==='outer'?'Menu ':'Title ')+n+' frame',x,y,w,h,d);}
art('Menu logo','Assets/Art/classic-title-logo.png',-388,-270,460,160);
text('Menu subtitle','THE FROZEN THRONE',-388,-182,450,34,19,[.59,.74,.83,1],'Center');E.at(-1).components.Text.font='Assets/Fonts/Cinzel.ttf';text('Menu subtitle cn','冰 封 王 座',-388,-148,450,30,22,[.79,.84,.85,1],'Center');
for(const [id,label,y] of [['solo','单人游戏',-154],['multiplayer','多人游戏',-96],['network','局域网',-38],['options','选项',20],['credits','制作人员',78]])classicButton(id,label,450,y,270,40,'menu');classicButton('quit','退出游戏',450,268,270,40,'menu');
text('Menu version','v0.2  ·  MEngine',488,335,228,20,12,C.muted,'Right');
menuMetal('Solo backing',450,-30,316,358);iron('Solo frame',450,-30,330,372,9);text('Solo title','单人游戏',450,-172,290,36,23,C.gold,'Center');
for(const [id,label,y] of [['rpg','战役',-113],['custom','自定义游戏',-55],['continue','载入游戏',3],['editor','地图编辑器',61],['soloBack','返回',119]])classicButton(id,label,450,y,270,40,'single');
menuMetal('Front backing',0,20,1000,570);iron('Front frame',0,20,1020,590,12);text('Front title','自定义游戏',0,-230,860,44,32,C.gold,'Center');
menuMetal('Map list backing',-273,-13,410,380);iron('Map list frame',-273,-13,422,392,16);text('Map list title','地图',-273,-173,370,30,20,C.gold,'Center');
for(const [i,name] of ['冬落盆地','远古遗迹 · Dota','蜿蜒守望 · 塔防','破碎盟约 · 战役','冬落围城'].entries())classicButton('map'+i,name,-273,-120+i*59,360,43,'custom');
panel('Map preview backing',15,-81,198,198,[.015,.025,.029,1]);iron('Map preview frame',15,-81,214,214,16);
for(let i=0;i<256;i++)panel('Map tile '+i,-75+(i%16)*12,-171+Math.floor(i/16)*12,12.2,12.2,[.2,.3,.28,1]);
text('Map name','',280,-173,290,34,23,C.gold,'Center');text('Map description','',280,-76,290,150,17,C.white);E.at(-1).components.Text.horizontal_overflow='Wrap';
classicButton('faction','人类',247,50,350,42,'custom');classicButton('heroChoice','英雄',247,108,350,42,'custom');art('Hero preview','Assets/Art/hero-portraits.png#hero-0',102,108,36,36);
text('Map settings hint','玩家 1：指挥官       玩家 2：电脑',245,163,350,28,16,C.muted,'Center');classicButton('mapStart','开始游戏',-166,245,270,42,'custom');classicButton('mapBack','返回',166,245,270,42,'custom');
text('Options heading','声音与环境',0,-150,830,42,25,C.gold,'Center');classicButton('musicVolume','音乐音量',0,-73,580,50,'options');classicButton('sfxVolume','音效音量',0,2,580,50,'options');classicButton('menuSnow','背景飘雪',0,77,580,50,'options');classicButton('optionsBack','确定',0,245,270,42,'options');
text('Credits text','FROSTBOUND REALMS\n\n基于 MEngine 的经典即时战略游戏复刻项目\n程序、引擎与地图：MiYu\n\n免费模型与材质：详见随包 Sources 与 Licenses\n冰冠背景 / 金属边框：原创生成素材\n字体：Cinzel / Noto Sans SC（OFL）',0,4,850,300,22,C.white,'Center');classicButton('creditsBack','返回',0,245,270,42,'credits');
text('Quit text','是否退出游戏？',0,-30,850,120,30,C.gold,'Center');classicButton('quitConfirm','退出',-166,150,270,42,'quit');classicButton('quitCancel','取消',166,150,270,42,'quit');
function frame(n,x,y,w,h){ui('HUD Frame '+n,x,y,w,h,{Image:{sprite:'Assets/Art/hud-human-frame.png',image_type:'Sliced',border:[350,350,350,350],source_size:[1254,1254],pixels_per_unit_multiplier:10,color:[1,1,1,1],raycast_target:false}});}
metal('Header',0,-340,1280,40);text('Brand','',-513,-338,200,24,15,C.gold);text('Resources','',210,-338,600,24,15,C.white);text('Clock','',0,-284,140,24,11,C.gold,'Center');
for(const [id,label,x] of [['hudMenu','菜单 (F10)',-550],['hudQuest','任务 (F9)',-426],['hudHero','英雄 (Space)',-294]]){classicButton(id,label,x,-339,116,29,'toolbar');E.at(-1).components.Text.font_size=13;}
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
for(let i=0;i<3;i++){const prefix=i?'HUD Hero '+i:'HUD Hero',y=i*76;art(prefix+' portrait','Assets/Art/hero-portraits.png#hero-0',-605,-253+y,48,48);panel(prefix+' health',-605,-224+y,48,4,[.1,.8,.2,1]);panel(prefix+' mana',-605,-216+y,48,3,[.1,.3,.9,1]);text(prefix+' level','',-584,-234+y,18,18,12,C.gold,'Center');}
for(let i=0;i<12;i++)text('Damage '+i,'',5000,5000,90,28,20,C.gold,'Center');
metal('Tooltip panel',386,103,444,100);text('Tooltip text','',386,103,416,86,13,C.white);E.at(-1).components.Text.horizontal_overflow='Wrap';
text('Status','',0,135,1150,25,14,C.gold,'Center');text('Controls','',60,350,400,16,10,C.muted,'Right');
text('Objective text','',0,-280,1100,38,18,C.gold,'Center');
menuMetal('Modal shade',0,10,1000,552);iron('Modal frame',0,10,1020,570,12);text('Modal title','',0,-222,870,48,32,C.gold,'Center');text('Modal text','',0,-30,870,294,19,C.white);classicButton('modalPrimary','',-166,245,270,42,'modal');classicButton('modalBack','返回',166,245,270,42,'modal');
for(const [id,label,x,y] of [['netSkirmish','创建遭遇战',-230,-87],['netMoba','创建 Dota',230,-87],['netBrowse','加入游戏',-230,-18],['netAddress','服务器地址',230,-18]])classicButton(id,label,x,y,400,46,'network');
classicButton('roomRefresh','刷新列表',0,162,270,36,'rooms');classicButton('lobbyHero','选择英雄',0,162,400,36,'lobby');
for(let i=0;i<8;i++)classicButton('room'+i,'',0,-143+i*35,870,30,'rooms');
panel('Drag box',5000,5000,1,1,[.1,.7,.5,.16]);
text('Frost telemetry','{}',5000,5000,1,1,1);
panel('Rename shade',0,-35,880,300,C.ink);panel('Rename rule',0,-184,880,2,C.gold);
text('Rename title','编辑名称 / 任务公告',0,-143,800,38,26,C.gold);
text('Rename hint','点击输入框，使用键盘或输入法编辑；点击保存应用到地图。',0,-96,800,32,17,C.muted);
ui('Rename input',0,-28,800,64,{InputField:{text:'',font:'Assets/Fonts/NotoSansSC.ttf',font_size:22,character_limit:120,multiline:false,interactable:true,background_color:[.06,.1,.14,1],text_color:C.white}});
button('renameClear','清空',-270,65,220,44,'rename');button('renameSave','保存',0,65,220,44,'rename');button('renameCancel','取消',270,65,220,44,'rename');
panel('Pause shade',0,0,1280,720,[0,0,0,.58]);ui('Pause frame',0,-20,394,406,{Image:{sprite:'Assets/Art/hud-human-frame.png',image_type:'Sliced',border:[350,350,350,350],source_size:[1254,1254],pixels_per_unit_multiplier:8,color:[1,1,1,1],raycast_target:false}});panel('Pause inset',0,-20,326,338,[.024,.034,.044,.98]);text('Pause title','游戏菜单',0,-172,330,42,28,C.gold,'Center');
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
const portraitModel=entity('Portrait model',{Transform:T([1000,0,0],[1,1,1],[0,Math.sin(-Math.PI/16),0,Math.cos(-Math.PI/16)]),MeshRenderer:{mesh:portraitViews.RealFrostWarden.mesh,material:portraitViews.RealFrostWarden.material,cast_shadows:false,receive_shadows:false}});
const portraitCamera=entity('Portrait camera',{Transform:T([1000,2,10]),Camera3D:{primary:false,projection:'orthographic',orthographic_size:1,near:.1,far:100,clear_flags:'solidcolor',background_color:[.025,.04,.055,1]}});
ui('HUD Live portrait',-344,247,132,136,{RawImage:{render_camera:String(portraitCamera),render_root:String(portraitModel),color:[1,1,1,1],raycast_target:false}});
E.at(-1).siblingIndex=E.find(e=>e.name==='Portrait').siblingIndex;
art('HUD Skyline','Assets/Art/hud-human-battlements.png#skyline',0,154,1280,57);E.at(-1).siblingIndex=E.find(e=>e.name==='HUD Frame Minimap').siblingIndex-1;
ui('HUD Daynight dial',0,-328,64,64,{Image:{material:'Assets/Materials/DayNightDial.mmat',color:[8/24,1,0,1],raycast_target:false}});
for(let i=0;i<32;i++)box('Sculpt outline '+i,[0,-100,0],[.4,.04,.06],[.25,.85,1,1]);
for(let z=0;z<8;z++)for(let x=0;x<8;x++)for(const layer of ['Riverbed','Water']){entity(layer+' '+(z*8+x),{Transform:T([x*8-28,0,z*8-28]),MeshRenderer:{mesh:'terrain4:'+'0'.repeat(64),material:'Assets/Materials/'+layer+'.mmat',cast_shadows:false,receive_shadows:layer==='Water'}});E[E.length-1].active=false;}
for(let i=0;i<detailCount;i++)entity('Grass patch '+i,{Transform:T([0,-100,0]),MeshRenderer:{mesh:catalog.RealGrassA.lods[0],material:catalog.RealGrassA.material}});
fs.writeFileSync(path.join(root,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Frostbound Realms',world:{entities:E,frame:0,sim_frame:0,clear_color:[.08,.13,.18,1]}},null,2)+'\n');
fs.writeFileSync(path.join(root,'project.json'),JSON.stringify({name:'Frostbound Realms',storageId:'frostbound-realms-2d128968-5677-47b3-8d38-a128a763e15a',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js',assetMode:'all'},null,2)+'\n');
fs.writeFileSync(path.join(root,'Assets/Scripts/Main.js'),'// Generated by scripts/build-frostbound.mjs\nvar FrostArt='+JSON.stringify(catalog)+';\nvar FrostPortraitViews='+JSON.stringify(portraitViews)+';\nvar FrostButtons='+JSON.stringify(buttons)+';\n'+['simulation','terrain','visuals','client'].map(n=>fs.readFileSync(path.join(root,'game/'+n+'.js'),'utf8')).join('\n'));
console.log('Built Frostbound Realms:',E.length,'entities;',Object.keys(catalog).length,'model entries');
