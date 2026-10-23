// Author: MiYu. Restore the original LAN creation page around the available network maps.
import fs from 'node:fs';
import {stableUiId,fullStretchRect} from './frost-ui-prefabs.mjs';
import {WARCRAFT_UI_FONT as font,WARCRAFT_UI_GOLD as gold} from './frost-warcraft-ui.mjs';

export function restoreWarcraftCreate(prefab){
  const frames=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/warcraft-create-layout.json',import.meta.url),'utf8')).pages.create,byName=Object.fromEntries(frames.map(f=>[f.name,f])),textures='Assets/WarcraftUI/Textures/';
  const bindings={PlayButton:'createStart',CancelButton:'createCancel',MapInfoButton:'createOptions'},children=[];
  const rect=([x,y,w,h])=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
  const node=(name,components,children=[])=>({id:stableUiId(name),name,active:true,tag:'Untagged',layer:0,components,children});
  const image=name=>({sprite:textures+name+'.png',color:[1,1,1,1],raycast_target:false});
  const text=(value,size=15.6,color=gold,alignment='Left')=>({text:value.replace(/\|c[0-9a-f]{8}|\|r/gi,'').replace(/\|n/gi,'\n'),font,font_size:size,color,alignment,vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false});
  const shadow={effect_color:[0,0,0,.9],effect_distance:[1.2,1.2],use_graphic_alpha:true};
  const find=(n,name)=>n.name===name?n:(n.children??[]).map(c=>find(c,name)).find(Boolean);
  function button(id,value,box){return node('UI Control '+id,{RectTransform:rect(box)},[node(id+' border',{RectTransform:fullStretchRect()}),node(id+' box',{RectTransform:fullStretchRect(),Image:{...image('StandardButton-Normal-256x64'),image_type:'Sliced',border:[19,19,19,19],source_size:[256,64],pixels_per_unit_multiplier:1}}),node(id+' label',{RectTransform:{...fullStretchRect(),size_delta:[-12,0]},Text:text(value,15.6,gold,'Center'),Shadow:shadow})]);}
  for(const f of frames){
    if(f.type==='TEXT'&&byName[f.parent]?.type==='GLUETEXTBUTTON')continue;
    if(bindings[f.name]){children.push(button(bindings[f.name],byName[f.name+'Text'].text,f.rect));continue;}
    const components={RectTransform:rect(f.rect)};
    if(f.type==='TEXT'){components.Text=text(f.text,f.fontSize,f.color??gold,({JUSTIFYRIGHT:'Right',JUSTIFYCENTER:'Center'})[f.alignment.horizontal]??'Left');components.Shadow=shadow;}
    if(f.type==='BACKDROP'&&f.backdrop.background){if(f.backdrop.mirrored)throw Error('Unmapped mirrored creation backdrop');components.Image=image(f.backdrop.background.replaceAll('\\','/').split('/').at(-1).replace(/\.blp$/i,''));}
    const n=node('Warcraft Create '+f.name,components);if(f.name.startsWith('AdvancedOptions'))n.active=false;children.push(n);
  }
  // Only the fixed server speed is available; the original slider is rendered disabled.
  const slider=byName.GameSpeedSlider,thumbWidth=19.2;
  children.push(node('Warcraft Create Speed thumb',{RectTransform:rect([slider.rect[0]+(slider.rect[2]-thumbWidth)/2,slider.rect[1],thumbWidth,thumbWidth]),Image:image('SinglePlayerSkirmish-ScrollBarKnobDisabled')}));
  const [lx,ly,lw,lh]=byName.MapListContainer.rect;
  children.push(node('Warcraft Create List background',{RectTransform:rect([lx,ly,lw,lh]),Image:{color:[0,0,0,.55],raycast_target:false}}));
  for(const [i,id] of ['netSkirmish','netMoba','netTd'].entries()){
    const old=find(prefab.root,'UI Control '+id);if(!old)throw Error('Missing network map '+id);
    const n=button(id,'',[lx,ly-lh/2+18+i*34,lw-12,32]);n.children[1].components.Image={color:[1,.82,.07,.12],raycast_target:false};n.children[2].components.Text.alignment='Left';Object.assign(old,n);
  }
  const [mx,my,mw,mh]=byName.MapInfoPaneContainer.rect;
  children.push(node('Warcraft Create Map title',{RectTransform:rect([mx,my-mh/2+14,mw,28]),Text:text('',18,[1,1,1,1],'Center')}));
  children.push(node('Warcraft Create Map information',{RectTransform:rect([mx,my+34,mw-12,mh-80]),Text:{...text('',15.6,[1,1,1,1]),horizontal_overflow:'Wrap',vertical_align:'Top'}}));
  children.push(node('Warcraft Create Status',{RectTransform:rect([lx,248,lw,52]),Text:{...text('',13.2,[1,1,1,1]),horizontal_overflow:'Wrap'}}));
  const root=node('Warcraft Create Page',{RectTransform:fullStretchRect()},children),index=prefab.root.children.findIndex(n=>n.name===root.name);
  if(index>=0)prefab.root.children.splice(index,1);prefab.root.children.unshift(root);
}
