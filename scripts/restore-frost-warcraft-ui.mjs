// Author: MiYu. Apply installed Warcraft FDF geometry and source textures to editable UI prefabs.
import fs from 'node:fs';
import path from 'node:path';
import {stableUiId,fullStretchRect,UI_SCREENS} from './frost-ui-prefabs.mjs';
import {WARCRAFT_UI_FONT as font,WARCRAFT_UI_GOLD as gold} from './frost-warcraft-ui.mjs';
import {syncFrostUI} from './sync-frost-ui.mjs';

const project=path.resolve(process.argv[2]??'samples/frostbound-realms'),folder=path.join(project,'Assets/Prefabs/UI');
const prefabs=Object.fromEntries(UI_SCREENS.map(([key])=>[key,JSON.parse(fs.readFileSync(path.join(folder,key+'.prefab'),'utf8'))]));
const textures='Assets/WarcraftUI/Textures/';
const background=JSON.parse(fs.readFileSync(path.join(project,'warcraft-menu-background.json'),'utf8'));
const nodes=new Map(),walk=(n,fn)=>{fn(n);for(const c of n.children??[])walk(c,fn);};
for(const p of Object.values(prefabs))walk(p.root,n=>nodes.set(n.name,n));
const rect=(x,y,w,h)=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
const node=(name,components,children=[])=>({id:stableUiId(name),name,active:true,tag:'Untagged',layer:0,components,children});
function add(screen,n){const old=nodes.get(n.name);if(old)return old;prefabs[screen].root.children.push(n);walk(n,c=>nodes.set(c.name,c));return n;}
function place(name,x,y,w,h){const n=nodes.get(name);if(!n)throw Error('Missing UI node '+name);n.components.RectTransform=rect(x,y,w,h);return n;}
function image(sprite,extra={}){return {sprite,color:[1,1,1,1],raycast_target:false,...extra};}
function sliced(sprite,border=19,size=[256,64]){return image(textures+sprite,{image_type:'Sliced',border:[border,border,border,border],source_size:size,pixels_per_unit_multiplier:1});}
function clear(name){const n=nodes.get(name);if(n){delete n.components.Image;delete n.components.Text;}}
function label(name,value){const n=nodes.get(name);if(n?.components.Text)n.components.Text.text=value;}
function control(screen,id,value,x,y,w=214.8,h=37.2,base=false){
  let root=nodes.get('UI Control '+id);
  if(!root){root=add(screen,node('UI Control '+id,{RectTransform:rect(x,y,w,h)},[
    node(id+' border',{RectTransform:fullStretchRect(),Image:image('')}),node(id+' box',{RectTransform:fullStretchRect(),Image:image('')}),
    node(id+' label',{RectTransform:fullStretchRect(),Text:{text:value,font,font_size:15.6,color:gold,alignment:'Center',vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false}})
  ]));}
  root.components.RectTransform=rect(x,y,w,h);
  nodes.get(id+' box').components.Image=sliced('StandardButton-Normal-256x64.png');
  const border=nodes.get(id+' border');border.components.RectTransform=fullStretchRect();delete border.components.Image;
  if(base){border.components.RectTransform=rect(w/2+14.4-(w===201.6?288:307.2)/2,0,w===201.6?288:307.2,76.8);border.components.Image=image(textures+'GlueScreen-Button1-Border.png');}
  const text=nodes.get(id+' label');text.components.RectTransform={...fullStretchRect(),size_delta:[-10,0]};Object.assign(text.components.Text,{text:value,font,font_size:15.6,color:gold,alignment:'Center'});
  text.components.Shadow={effect_color:[0,0,0,.9],effect_distance:[1.2,1.2],use_graphic_alpha:true};
  return root;
}
function text(screen,name,value,x,y,w,h,size=15.6,color=gold){return add(screen,node(name,{RectTransform:rect(x,y,w,h),Text:{text:value,font,font_size:size,color,alignment:'Left',vertical_align:'Middle',horizontal_overflow:'Wrap',vertical_overflow:'Truncate',raycast_target:false}}));}

for(const n of nodes.values()){
  if(n.components.Text)n.components.Text.font=font;
  if(n.components.Image?.material==='Assets/Materials/ClassicButton.mmat')n.components.Image=sliced('StandardButton-Normal-256x64.png');
}
const model=background.models.ClassicWarcraftMenuBackground,identity={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
const backdrop=add('MenuBackdrop',node('Warcraft menu backdrop',{RectTransform:fullStretchRect(),Image:{color:[0,0,0,1],raycast_target:false}}));
prefabs.MenuBackdrop.root.children=[backdrop,...prefabs.MenuBackdrop.root.children.filter(n=>n!==backdrop)];
const modelNode=add('MenuBackdrop',node('Menu background model',{Transform:{...identity,position:[2000,0,0]}},model.parts.map((p,i)=>node('Menu background model mesh '+i,{Transform:identity,MeshRenderer:{mesh:p.mesh+'#pose=0:0',material:p.material,cast_shadows:false,receive_shadows:false}}))));
for(const light of background.lighting.engineLights){const n=node(light.name,structuredClone(light.components));if(!nodes.has(n.name)){modelNode.children.push(n);nodes.set(n.name,n);}}
const view=background.camera.view,camera=add('MenuBackdrop',node('Menu background camera',{Transform:{...view.camera,position:[2000+view.camera.position[0],...view.camera.position.slice(1)]},Camera3D:{...view.camera3D,primary:false,clear_flags:'solidcolor',background_color:[0,0,0,1]}}));
const painting=place('Menu painting',0,0,960,720);delete painting.components.Image;
painting.components.RawImage={render_camera:{$mengine_entity_ref:{kind:'prefab_node',node:camera.id}},render_root:{$mengine_entity_ref:{kind:'prefab_node',node:modelNode.id}},color:[1,1,1,1],raycast_target:false};
const decorationRoot=add('MenuBackdrop',node('Menu decoration model',{Transform:identity}));
for(const [name,key] of [['Menu decoration left','ClassicWarcraftMenuTopLeft'],['Menu decoration right','ClassicWarcraftMenuTopRight']])if(!nodes.has(name)){
  const asset=background.models[key],children=[];
  for(let start=0;start<asset.parts.length;start+=32)children.push(node(name+' group '+start,{Transform:identity},asset.parts.slice(start,start+32).map((p,i)=>node(name+' mesh '+(start+i),{Transform:identity,MeshRenderer:{mesh:p.mesh+'#pose=5:12',material:p.material,cast_shadows:false,receive_shadows:false}}))));
  const layer=node(name,{Transform:{...identity,position:[3000,0,0],scale:[128,128,128]}},children);decorationRoot.children.push(layer);walk(layer,n=>nodes.set(n.name,n));
}
const projection=background.decorations.experimentalProjection;
const decorationCamera=add('MenuBackdrop',node('Menu decoration camera',{Transform:{...projection.camera,position:[3000.4,1000,-.3]},Camera3D:{...projection.camera3D,clear_flags:'solidcolor',background_color:[0,0,0,0]}}));
add('MenuBackdrop',node('Menu decoration image',{RectTransform:rect(0,0,960,720),RawImage:{render_camera:{$mengine_entity_ref:{kind:'prefab_node',node:decorationCamera.id}},render_root:{$mengine_entity_ref:{kind:'prefab_node',node:decorationRoot.id}},color:[1,1,1,1],raycast_target:false}}));
const logo=place('Menu logo',-200,-246,420,210);logo.components.Image=image(background.logo.texture);clear('Menu subtitle');clear('Menu subtitle cn');
place('Menu version',382,341,180,18);
for(let i=0;i<70;i++)clear('Menu snow '+i);
// Menu base borders are present on each FDF button; decorative sprite layers are separate MDX assets.
for(const n of nodes.values())if(/^Title chain|^Title .* (frame|backing)$|^Solo (frame|backing|title)$|^Menu outer frame$/.test(n.name)){delete n.components.Image;delete n.components.Text;}
for(const [i,[id,title]] of [['solo','单人模式(S)'],['multiplayer','Battle.net'],['network','局域网(L)'],['options','选项(O)'],['credits','鸣谢(C)']].entries())control('MainMenu',id,title,340.2,-188.85+i*70.8,214.8,37.2,true);
control('MainMenu','multiplayer','Battle.net',322.2,-118.05,178.8,37.2,true);nodes.get('multiplayer border').components.RectTransform=rect(-13.8,0,307.2,76.8);
control('MainMenu','realm','',429,-118.05,37.2,37.2);
control('MainMenu','quit','退出(Q)',346.8,261.6,201.6,37.2,true);
for(const [i,[id,title]] of [['rpg','战役(C)'],['continue','装载存档(L)'],['replay','观看录象(R)'],['customCampaign','自定义战役(U)'],['custom','自定义游戏(G)']].entries())control('SinglePlayer',id,title,340.2,-141.6+i*60,214.8,37.2,true);
control('SinglePlayer','soloBack','取消(A)',346.8,294.6,201.6,37.2,true);
control('SinglePlayer','profile','',436.8,-219.6,36,31.2);
text('SinglePlayer','Warcraft profile name','玩家',263,-236,192,48,24,[1,1,1,1]);
for(const n of ['editor border','editor box','editor label'])clear(n);

for(const [i,[id,title]] of [['optionsGameplay','游戏性(G)'],['optionsVideo','图像(V)'],['optionsSound','声音(S)']].entries())control('Options',id,title,340.2,-188.85+i*70.8,214.8,37.2,true);
control('Options','optionsBack','确定(O)',346.8,294.6,201.6,37.2,true);
place('Options heading',-180,-246,540,32);label('Options heading','声音设置');
control('Options','musicVolume','音乐音量',-180,-130,390,37.2);control('Options','sfxVolume','音效音量',-180,-70,390,37.2);
for(const n of ['menuSnow border','menuSnow box','menuSnow label'])clear(n);
text('Options','Warcraft option availability','',-180,-170,510,56,15.6,[1,1,1,1]);

// Skirmish.fdf containers: list upper left, team setup lower left, information upper right.
for(const name of ['Front backing','Front frame','Map list backing','Map list frame','Map preview frame'])clear(name);
place('Front title',-373.5,-312,163,32);label('Front title','游戏设置');
place('Map list title',-210,-341,340,20);nodes.get('Map list title').components.Text.font_size=14;
for(let i=0;i<5;i++)control('MapSelection','map'+i,i===4?'下一页':'',-94.2,-320+i*29.5,380.1,28);
place('Map name',307.125,-281.25,281.25,28);nodes.get('Map name').components.Text.font_size=16;
place('Map preview backing',307.125,-161,157.5,157.5);
for(let i=0;i<256;i++)place('Map tile '+i,307.125+((i%16+.5)/16-.5)*157.5,-161+((Math.floor(i/16)+.5)/16-.5)*157.5,9.95,9.95);
place('Map description',307.125,-24,260,98);nodes.get('Map description').components.Text.font_size=14;
place('Map settings hint',-183,-130,540,28);nodes.get('Map settings hint').components.Text.alignment='Left';
control('MapSelection','faction','人类',-183,-80,270,30);control('MapSelection','heroChoice','英雄',-183,-38,270,30);place('Hero preview',-337,-38,30,30);
control('MapSelection','mapStart','开始游戏(S)',346.8,232.8,201.6,37.2,true);control('MapSelection','mapBack','取消(A)',346.8,294.6,201.6,37.2,true);
control('MapSelection','mapOpen','打开地图文件…',-183,294.6,270,37.2);
place('Map loading back',-183,230,510,12);place('Map loading fill',-183,230,510,12);place('Map loading status',-183,255,540,24);

// EscMenuMainPanel.fdf: .288 x .384, with .228 x .035 buttons.
place('Pause frame',0,0,345.6,460.8);nodes.get('Pause frame').components.Image=sliced('EscPanel-Normal-346x461.png',58,[346,461]);clear('Pause inset');
place('Pause title',0,-181,300,28);nodes.get('Pause title').components.Text.font_size=21;
place('Pause hint',0,248,350,24);nodes.get('Pause hint').components.Text.font_size=12;
for(const [id,title,x,y,w] of [['pauseToggle','暂停游戏(M)',0,-129,273.6],['pauseSave','保存游戏(S)',0,-84.6,273.6],['pauseLoad','装载游戏(L)',0,-40.2,273.6],['pauseOptions','选项(O)',0,4.2,273.6],['pauseHelp','帮助(H)',-70.8,48.6,132],['pauseTips','提示(T)',70.8,48.6,132],['pauseExit','结束游戏(E)',0,93,273.6],['pauseResume','回到游戏(R)',0,173.4,273.6]]){control('PauseDialog',id,title,x,y,w,42);nodes.get(id+' box').components.Image=sliced('EscButton-Normal-256x64.png',15);}
for(const [i,[id,title]] of [['hudQuest','任务(F9)'],['hudMenu','菜单(F10)'],['hudAllies','盟友'],['hudChat','聊天']].entries()){
  control('BattleHUD',id,title,0,0,102,26.4);const r=nodes.get('UI Control '+id).components.RectTransform;r.anchor_min=r.anchor_max=[0,0];r.anchored_position=[54+i*102,16.8];nodes.get(id+' label').components.Text.font_size=12;
}
for(const n of ['hudHero border','hudHero box','hudHero label'])clear(n);
for(const [name,x,y,w,h] of [['Credits text',0,0,790,440],['Quit text',0,-35,390,60]])place(name,x,y,w,h);
control('Credits','creditsBack','取消(A)',346.8,294.6,201.6,37.2,true);
control('QuitDialog','quitConfirm','退出',-81,68,154.8,42);control('QuitDialog','quitCancel','取消',81,68,154.8,42);
label('Credits text','FROSTBOUND REALMS\n\nMEngine 复刻工程\n开发：MiYu\n\nWarcraft III 界面字体、纹理、模型：本机游戏档案\n原始文件、来源与摘要见 warcraft-ui-sources.json\n\n工程其他模型及音频来源见 Assets/Licenses');
for(const [key,prefab] of Object.entries(prefabs))fs.writeFileSync(path.join(folder,key+'.prefab'),JSON.stringify(prefab,null,2)+'\n');
console.log(syncFrostUI(project));
