// Author: MiYu. Apply the original GameChatroom containers and current room presentation.
import fs from 'node:fs';
import {stableUiId,fullStretchRect} from './frost-ui-prefabs.mjs';
import {WARCRAFT_UI_FONT as font,WARCRAFT_UI_GOLD as gold} from './frost-warcraft-ui.mjs';
export function restoreWarcraftLobby(prefab){
  const layout=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/warcraft-lobby-layout.json',import.meta.url),'utf8')),frames=layout.pages.lobby,byName=Object.fromEntries(frames.map(f=>[f.name,f])),textures='Assets/WarcraftUI/Textures/';
  const rect=([x,y,w,h])=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
  const node=(name,components,children=[])=>({id:stableUiId(name),name,active:true,tag:'Untagged',layer:0,components,children});
  const image=name=>({sprite:textures+name+'.png',color:[1,1,1,1],raycast_target:false});
  const sliced=name=>({...image(name),image_type:'Sliced',border:[19,19,19,19],source_size:[256,64],pixels_per_unit_multiplier:1});
  const text=(value='',size=13.2,color=[1,1,1,1],alignment='Left')=>({text:value.replace(/\|c[0-9a-f]{8}|\|r/gi,'').replace(/\|n/gi,'\n'),font,font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Truncate',vertical_overflow:'Truncate',raycast_target:false});
  const shadow={effect_color:[0,0,0,.9],effect_distance:[1.2,1.2],use_graphic_alpha:true},children=[],bindings={StartGameButton:'lobbyStart',CancelButton:'lobbyCancel'};
  for(const f of frames){
    if(f.type==='TEXT'&&bindings[f.parent])continue;
    if(bindings[f.name]){const id=bindings[f.name];children.push(node('UI Control '+id,{RectTransform:rect(f.rect)},[node(id+' border',{RectTransform:fullStretchRect()}),node(id+' box',{RectTransform:fullStretchRect(),Image:sliced('StandardButton-Normal-256x64')}),node(id+' label',{RectTransform:fullStretchRect(),Text:text(byName[f.name+'Text'].text,15.6,gold,'Center'),Shadow:shadow})]));continue;}
    const components={RectTransform:rect(f.rect)};
    if(f.type==='TEXT'){components.Text=text(f.text,f.fontSize,f.color??gold,f.alignment.horizontal==='JUSTIFYRIGHT'?'Right':'Left');components.Shadow=shadow;}
    if(f.type==='BACKDROP'&&f.backdrop.background)components.Image=image(f.backdrop.background.replaceAll('\\','/').split('/').at(-1).replace(/\.blp$/i,''));
    if(f.type==='TEXTAREA')components.Text={...text('',layout.fonts.ChatroomTextArea),horizontal_overflow:'Wrap',vertical_align:'Bottom'};
    if(f.type==='SLASHCHATBOX'){
      components.Image={...sliced('StandardEditBox-96x48'),border:[24,24,24,24],source_size:[96,48]};
      children.push(node('Warcraft Lobby '+f.name,components,[node('Warcraft Lobby Chat input',{RectTransform:{...fullStretchRect(),size_delta:[-21.6,-12]},InputField:{text:'',placeholder:'',font,font_size:layout.fonts.ChatroomChatEditBox,character_limit:256,multiline:false,interactable:true,background_color:[0,0,0,0],text_color:[1,1,1,1]}})]));continue;
    }
    children.push(node('Warcraft Lobby '+f.name,components));
  }
  const [x,y,w,h]=byName.TeamSetupContainer.rect,top=y-h/2,left=x-w/2,slot=layout.slot;
  for(let i=0;i<2;i++){
    const rowTop=top+i*(slot.headerHeight+slot.height);
    children.push(node('Warcraft Lobby Team '+i,{RectTransform:rect([x,rowTop+slot.headerHeight/2,w,slot.headerHeight]),Text:text('',layout.fonts.ChatroomHeaders,gold)}));
    let offset=0;
    for(const [name,width] of Object.entries(slot.columns)){
      if(name==='NameMenu')offset+=slot.nameInset;
      const label=node('Warcraft Lobby Slot '+i+' '+name,{RectTransform:rect([left+offset+width/2,rowTop+slot.headerHeight+slot.height/2,width,slot.height]),Text:text()});children.push(label);offset+=width;
    }
  }
  const [mx,my,mw,mh]=byName.MapInfoPaneContainer.rect;
  children.push(node('Warcraft Lobby Map information',{RectTransform:rect([mx,my,mw,mh]),Text:{...text(),horizontal_overflow:'Wrap',vertical_align:'Top'}}));
  const root=node('Warcraft Lobby Page',{RectTransform:fullStretchRect()},children),index=prefab.root.children.findIndex(n=>n.name===root.name);
  if(index>=0)prefab.root.children.splice(index,1);prefab.root.children.unshift(root);
}
