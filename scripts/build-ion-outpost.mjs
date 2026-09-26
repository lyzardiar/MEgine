import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../samples/ion-outpost/',import.meta.url)),Sim=createRequire(import.meta.url)('../samples/ion-outpost/game/simulation.js');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'model-catalog.json'),'utf8'));
for(const dir of ['Scenes','Scripts','Fonts','Audio'])fs.mkdirSync(path.join(root,'Assets',dir),{recursive:true});
for(const name of ['Roboto-Regular.ttf','LICENSE.txt'])fs.copyFileSync(fileURLToPath(new URL('../samples/pelican-road-rage/Assets/Fonts/'+name,import.meta.url)),path.join(root,'Assets/Fonts',name));
const entities=[];
const quat=(yaw=0,pitch=0,roll=0)=>{const a=yaw/2,b=pitch/2,c=roll/2;return [Math.cos(a)*Math.sin(b)*Math.cos(c)+Math.sin(a)*Math.cos(b)*Math.sin(c),Math.sin(a)*Math.cos(b)*Math.cos(c)-Math.cos(a)*Math.sin(b)*Math.sin(c),Math.cos(a)*Math.cos(b)*Math.sin(c)-Math.sin(a)*Math.sin(b)*Math.cos(c),Math.cos(a)*Math.cos(b)*Math.cos(c)+Math.sin(a)*Math.sin(b)*Math.sin(c)];};
function entity(name,components,parent=null){const id=entities.length+1;entities.push({entity:id,name,parent,siblingIndex:id-1,active:true,components});return id;}
const transform=(position=[0,0,0],scale=[1,1,1],rotation=[0,0,0,1])=>({position,scale,rotation});
function box(name,position,size,color,emission=[0,0,0,1]){return entity(name,{Transform:transform(position,size),MeshRenderer:{mesh:'cube',material:'default'},PbrMaterial:{base_color:color,metallic:.12,roughness:.8,emission}});}
function model(key,name,position,scale=[1,1,1],yaw=0,parent=null){
  const asset=catalog[key];
  if(asset.parts.length===1)return entity(name,{Transform:transform(position,scale,quat(yaw)),MeshRenderer:{mesh:asset.parts[0].mesh,material:asset.material}},parent);
  const id=entity(name,{Transform:transform(position,scale,quat(yaw))},parent);
  for(const part of asset.parts)entity(name+'/'+part.name,{Transform:transform(part.pivot),MeshRenderer:{mesh:part.mesh,material:asset.material}},id);
  return id;
}
const camera=entity('FPS Camera',{Transform:transform([-19,12,25],[1,1,1],quat(-.5,-.25)),Camera3D:{fov_y_degrees:72,near:.035,far:260,primary:true,clear_flags:'skybox',capture_pointer:false},AudioListener:{primary:true}});
entity('Late afternoon sun',{Transform:transform([0,0,0],[1,1,1],quat(-.65,-.85)),DirectionalLight:{color:[1,.82,.62,1],intensity:2.25,cast_shadows:true,shadow_distance:65,shadow_strength:.8,shadow_bias:.001}});
entity('Desert atmosphere',{EnvironmentLight:{sky_color:[.035,.2,.33,1],equator_color:[.18,.44,.55,1],ground_color:[.10,.08,.055,1],diffuse_intensity:.7,specular_intensity:.65,background_enabled:true,tone_mapping:true,exposure:.05}});
box('Sandy basin',[0,-.3,0],[210,.55,210],[.33,.235,.16,1]);
box('Outpost foundation',[0,-.09,0],[44,.16,44],[.3,.32,.32,1]);
for(let i=-20;i<=20;i+=4){box('Deck seam X '+i,[i,.003,0],[.025,.006,44],[.12,.17,.19,1]);box('Deck seam Z '+i,[0,.003,i],[44,.006,.025],[.12,.17,.19,1]);}
for(const sign of [-1,1]){
  box('Boundary E/W '+sign,[sign*22.15,.7,0],[.3,1.4,44.6],[.19,.24,.26,1]);box('Boundary N/S '+sign,[0,.7,sign*22.15],[44.6,1.4,.3],[.19,.24,.26,1]);
  box('Perimeter cyan X '+sign,[sign*21.91,.95,0],[.045,.07,44],[.03,.5,.6,1],[.02,.6,.8,1]);box('Perimeter cyan Z '+sign,[0,.95,sign*21.91],[44,.07,.045],[.03,.5,.6,1],[.02,.6,.8,1]);
}
Sim.blocks.forEach((b,i)=>{
  const key=i===4?'machine_generatorLarge':i>=9?'barrels':'crate-wide',asset=catalog[key];
  model(key,'Cover '+i,[b[0],0,b[1]],[b[2]/asset.size[0],b[4]/asset.size[1],b[3]/asset.size[2]]);
  if(i===4)box('Reactor ion core',[0,3.4,0],[1.6,.25,1.6],[.06,.6,.85,1],[.08,1.8,2.5,1]);
});
model('hangar_roundA','North hangar',[-12,0,-30],[4,4,4]);model('hangar_smallA','East hangar',[32,0,8],[5,5,5],Math.PI/2);
model('satelliteDish','Long range antenna',[8,0,-30],[6,6,6]);model('machine_wireless','Uplink',[-28,0,-7],[7,7,7]);
model('rover','Survey rover',[-30,0,16],[4,4,4],-.6);model('craft_speederA','Patrol skimmer',[24,1,-28],[4,4,4],.8);
for(let i=0;i<28;i++){
  const a=i*Math.PI*2/28,r=47+(i%4)*8,s=7+(i%5)*3;
  model(i%2?'rock_largeA':'rock_largeB','Canyon '+i,[Math.cos(a)*r,-.5,Math.sin(a)*r],[s,s*(.6+i%3*.25),s],a);
}
for(let i=0;i<8;i++)model('rock_crystalsLargeA','Crystal deposit '+i,[Math.cos(i*2.4)*31,0,Math.sin(i*2.4)*31],[2.8,2.8,2.8],i);
for(let i=0;i<8;i++){
  model('astronautA',`Actor ${i}`,[0,-100,0]);
  model('blaster-f',`Actor ${i} weapon`,[0,-100,0],[.7,.7,.7]);
}
model('blaster-f','View carbine',[.25,-.28,-.64],[.58,.58,.58],0,camera);
model('blaster-n','View scatter',[0,-100,0],[.65,.65,.65],0,camera);
entity('Muzzle lamp',{Transform:transform([.23,-.08,-1.05]),PointLight:{color:[.12,.8,1,1],intensity:0,range:4}},camera);
for(let i=0;i<20;i++)box('Tracer '+i,[0,-100,0],[.025,.025,1],[.1,.8,1,1],[.1,3,5,1]);
Sim.pickups.forEach((p,i)=>{model('rock_crystalsLargeA','Pickup '+i,[p[0],.25,p[1]],[.9,.9,.9]);box('Pickup pad '+i,[p[0],.03,p[1]],[1.8,.06,1.8],[.03,.4,.5,1],[.03,.3,.4,1]);});
const canvas=entity('Interface',{Canvas:{render_mode:'ScreenSpaceOverlay'},CanvasScaler:{ui_scale_mode:'ScaleWithScreenSize',reference_resolution:[1280,720],match_width_or_height:.5}});
const colors={navy:[.012,.031,.045,.92],white:[.89,.94,.96,1],muted:[.48,.64,.7,1],cyan:[.12,.85,.91,1],amber:[1,.65,.23,1]};
function ui(name,x,y,w,h,component){entity(name,{RectTransform:{anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]},...component},canvas);}
const panel=(name,x,y,w,h,c)=>ui(name,x,y,w,h,{Image:{color:c,raycast_target:false}});
const text=(name,value,x,y,w,h,size=20,color=colors.white,alignment='Left')=>ui(name,x,y,w,h,{Text:{text:value,font:'Assets/Fonts/Roboto-Regular.ttf',font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false}});
panel('Menu shade',-338,0,604,720,colors.navy);panel('Menu rule',-578,-260,4,34,colors.cyan);
text('Menu eyebrow','ORBITAL FRONTIER  /  SECTOR 07',-334,-260,440,30,16,colors.cyan);
text('Menu title','ION\nOUTPOST',-330,-155,450,180,78);text('Menu tagline','A signal. A frontier. No second chances.',-330,-32,450,36,18,colors.muted);
text('Menu content','',-330,105,450,235,23);text('Menu status','',-330,244,450,45,17,colors.amber);
text('Menu footer','WASD move   /   MOUSE aim\nLMB fire   /   RMB aim down sights\nSHIFT sprint   /   SPACE jump   /   R reload\n1 / 2 weapons   /   TAB scores   /   ESC release',-330,307,450,82,14,colors.muted);
text('Location label','DUSTLINE RESEARCH STATION',320,300,530,30,20,colors.white,'Right');
text('Location sublabel','CC0 FIELD KIT  /  KENNEY  /  MENGINE',320,329,530,24,12,colors.cyan,'Right');
panel('HUD header',0,-320,1200,50,colors.navy);text('HUD brand','ION / OUTPOST',-468,-321,230,36,22,colors.cyan);text('HUD clock','03:00',0,-321,180,36,28,colors.white,'Center');text('HUD network','OFFLINE  /  60 HZ',442,-321,280,32,16,colors.muted,'Right');
panel('Vitals panel',-455,296,290,82,colors.navy);text('Health','100',-514,284,100,48,38);text('Shield','SHIELD  40',-397,289,130,38,15,colors.cyan);
panel('Health rail',-455,326,252,5,[.1,.2,.25,1]);panel('Health fill',-455,326,252,5,colors.cyan);
panel('Ammo panel',459,296,280,82,colors.navy);text('Ammo','24 / 24',460,282,236,44,35,colors.white,'Right');text('Weapon','PULSE CARBINE',460,320,236,20,12,colors.cyan,'Right');
text('Hint','',0,316,570,36,15,colors.white,'Center');text('Kill feed','',418,-208,340,135,15,colors.white,'Right');
for(const [name,x,y,w,h] of [['Cross left',-10,0,7,2],['Cross right',10,0,7,2],['Cross top',0,-10,2,7],['Cross bottom',0,10,2,7]])panel(name,x,y,w,h,[.8,1,1,.9]);
text('Hit marker','',0,0,80,70,33,colors.amber,'Center');text('Center notice','',0,85,700,150,30,colors.white,'Center');
panel('Damage border',0,-283,1200,6,[1,.1,.04,0]);panel('Score shade',0,0,750,460,colors.navy);text('Score title','SCOREBOARD',0,-184,660,45,30,colors.cyan);text('Score rows','',0,18,660,320,22);text('Score footer','',0,207,660,30,15,colors.muted,'Center');
text('FPS telemetry','{}',5000,5000,1,1,1);
function wav(name,duration,frequency,decay,noise=.2){
  const rate=22050,count=Math.floor(rate*duration),b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);
  let seed=3;for(let i=0;i<count;i++){const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=(Math.sin(2*Math.PI*frequency*t*(1-.35*t/duration))*(1-noise)+(seed/2147483648-1)*noise)*Math.exp(-t*decay)*.65;b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(v*32767))),44+i*2);}fs.writeFileSync(path.join(root,'Assets/Audio',name+'.wav'),b);
  entity('Sound '+name,{AudioSource:{clip:'Assets/Audio/'+name+'.wav',volume:name==='shot'?.26:.38,looped:false,play_on_awake:false,playing:false}});
}
wav('shot',.16,180,24,.7);wav('scatter',.3,90,15,.8);wav('hit',.09,860,32,.15);wav('kill',.35,560,9,.07);wav('reload',.16,1300,29,.8);wav('pickup',.3,1000,9,.04);wav('hurt',.2,65,17,.45);
fs.writeFileSync(path.join(root,'Assets/Scenes/Main.mscene'),JSON.stringify({version:1,name:'Ion Outpost / Dustline',world:{entities,frame:0,sim_frame:0,clear_color:[.23,.39,.46,1],selected:camera}},null,2)+'\n');
fs.writeFileSync(path.join(root,'project.json'),JSON.stringify({name:'Ion Outpost',version:1,language:'javascript',mainScene:'Assets/Scenes/Main.mscene',buildScenes:['Assets/Scenes/Main.mscene'],startupScript:'Assets/Scripts/Main.js',assetMode:'all'},null,2)+'\n');
const client=path.join(root,'game/client.js');if(fs.existsSync(client))fs.writeFileSync(path.join(root,'Assets/Scripts/Main.js'),'// Generated by scripts/build-ion-outpost.mjs\nvar IonModels = '+JSON.stringify({astronautA:catalog.astronautA,alien:catalog.alien})+';\n'+fs.readFileSync(path.join(root,'game/simulation.js'),'utf8')+'\n'+fs.readFileSync(client,'utf8'));
console.log(`Built Ion Outpost: ${entities.length} entities, ${Object.keys(catalog).length} imported models`);
