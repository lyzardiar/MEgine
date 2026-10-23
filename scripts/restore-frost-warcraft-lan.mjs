// Author: MiYu. Apply original local multiplayer browser frames to the existing network prefab.
import {LAN_BUTTONS,lanNode,warcraftLan} from './frost-warcraft-lan.mjs';
import {stableUiId,fullStretchRect} from './frost-ui-prefabs.mjs';
import {WARCRAFT_UI_FONT as font,WARCRAFT_UI_GOLD as gold} from './frost-warcraft-ui.mjs';

export function restoreWarcraftLan(prefab){
  const frames=warcraftLan().pages.join,byName=Object.fromEntries(frames.map(f=>[f.name,f])),textures='Assets/WarcraftUI/Textures/';
  const rect=([x,y,w,h])=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
  const node=(name,components,children=[])=>({id:stableUiId(name),name,active:true,tag:'Untagged',layer:0,components,children});
  const image=(name,extra={})=>({sprite:textures+name+'.png',color:[1,1,1,1],raycast_target:false,...extra});
  const sliced=(name='StandardButton-Normal-256x64',border=19,size=[256,64])=>image(name,{image_type:'Sliced',border:[border,border,border,border],source_size:size,pixels_per_unit_multiplier:1});
  const clean=value=>value.replace(/\|c[0-9a-f]{8}|\|r/gi,'').replace(/\|n/gi,'\n');
  const text=(value,size=15.6,color=gold,alignment='Left')=>({text:clean(value),font,font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Truncate',vertical_overflow:'Overflow',raycast_target:false});
  const shadow={effect_color:[0,0,0,.9],effect_distance:[1.2,1.2],use_graphic_alpha:true};
  const children=[];
  const find=(n,name)=>n.name===name?n:(n.children??[]).map(c=>find(c,name)).find(Boolean);
  function button(id,value,box,source=true){return node('UI Control '+id,{RectTransform:rect(box)},[node(id+' border',{RectTransform:fullStretchRect()}),node(id+' box',{RectTransform:fullStretchRect(),...(source?{Image:sliced()}: {})}),node(id+' label',{RectTransform:{...fullStretchRect(),size_delta:[-12,0]},Text:text(value,15.6,gold,source?'Center':'Left'),Shadow:shadow})]);}
  for(const f of frames){
    if(f.type==='TEXT'&&LAN_BUTTONS[f.parent])continue;
    if(f.type==='GLUETEXTBUTTON'){children.push(button(LAN_BUTTONS[f.name],byName[f.name+'Text'].text,f.rect));continue;}
    const components={RectTransform:rect(f.rect)};
    if(f.type==='TEXT'){components.Text={...text(f.text,f.fontSize,f.color,({JUSTIFYRIGHT:'Right',JUSTIFYCENTER:'Center'})[f.alignment.horizontal]??'Left'),horizontal_overflow:'Overflow'};components.Shadow=shadow;}
    if(f.type==='BACKDROP'){
      const name=f.backdrop.background.replaceAll('\\','/').split('/').at(-1).replace(/\.blp$/i,'');
      if(f.backdrop.mirrored&&name!=='GlueScreen-Button1-SmallBorder')throw Error('Unmapped mirrored LAN backdrop '+name);
      components.Image=image(f.backdrop.mirrored?'LAN-SmallButtonBase-Mirrored':name);
    }
    if(f.type==='EDITBOX'){
      components.Image=sliced('StandardEditBox-96x48',24,[96,48]);
      children.push(node(lanNode(f.name),components,[node(lanNode('Player input'),{RectTransform:{...fullStretchRect(),size_delta:[-21.6,-12]},InputField:{text:'玩家',font,font_size:15.6,character_limit:20,multiline:false,interactable:true,background_color:[0,0,0,0],text_color:[1,1,1,1]}})]));continue;
    }
    children.push(node(lanNode(f.name),components));
  }
  // Dynamic row placement stays inside the source GameListContainer; it is independent of static FDF anchors.
  const [lx,ly,lw,lh]=byName.GameListContainer.rect;
  children.push(node(lanNode('List background'),{RectTransform:rect([lx,ly,lw,lh]),Image:{color:[0,0,0,.55],raycast_target:false}}));
  for(let i=0;i<8;i++){
    const name='UI Control room'+i,old=find(prefab.root,name);
    if(!old)throw Error('Missing room control '+name);
    const n=button('room'+i,'',[lx,ly-lh/2+18+i*34,lw-12,32],false);
    n.children[1].components.Image={color:[1,.82,.07,.12],raycast_target:false};
    Object.assign(old,n);
  }
  children.push(node(lanNode('Empty list'),{RectTransform:rect([lx,ly,lw-20,80]),Text:text('正在连接…',15.6,[1,1,1,1],'Center')}));
  for(const [id,value,r] of [['lanPrevious','上一页',[lx-120,ly+lh/2-18,100,28]],['lanNext','下一页',[lx+120,ly+lh/2-18,100,28]],['lanRefresh','刷新列表(F5)',[lx-120,190,160,30]],['lanAddress','服务器地址',[lx+120,190,160,30]]])children.push(button(id,value,r));
  children.push(node(lanNode('Server status'),{RectTransform:rect([263.25,188,326.25,44]),Text:text('',13.2,[1,1,1,1])}));
  const [mx,my,mw,mh]=byName.MapInfoPaneContainer.rect;
  children.push(node(lanNode('Map title'),{RectTransform:rect([mx,my-mh/2+14,mw,28]),Text:text('',18,[1,1,1,1],'Center')}));
  children.push(node(lanNode('Map information'),{RectTransform:rect([mx,my+34,mw-12,mh-80]),Text:{...text('',15.6,[1,1,1,1]),horizontal_overflow:'Wrap',vertical_align:'Top'}}));
  const root=node(lanNode('Browser'),{RectTransform:fullStretchRect()},children),index=prefab.root.children.findIndex(n=>n.name===root.name);
  if(index>=0)prefab.root.children.splice(index,1);
  prefab.root.children.unshift(root);
}
