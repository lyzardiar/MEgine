// Author: MiYu. Render source-resolved option frames into editable page hierarchies.
import {warcraftOptions,WARCRAFT_OPTION_BINDINGS,optionId,optionNode,optionPage} from './frost-warcraft-options.mjs';
import {stableUiId,fullStretchRect} from './frost-ui-prefabs.mjs';
import {WARCRAFT_UI_FONT as font} from './frost-warcraft-ui.mjs';

export function restoreWarcraftOptions(prefab){
  const {pages}=warcraftOptions(),textures='Assets/WarcraftUI/Textures/';
  const rect=([x,y,w,h])=>({anchor_min:[.5,.5],anchor_max:[.5,.5],pivot:[.5,.5],anchored_position:[x,y],size_delta:[w,h]});
  const node=(name,components,children=[])=>({id:stableUiId(name),name,active:true,tag:'Untagged',layer:0,components,children});
  const image=(name,extra={})=>({sprite:textures+name,color:[1,1,1,1],raycast_target:false,...extra});
  const sliced=(name,border=19,size=[256,64])=>image(name,{image_type:'Sliced',border:[border,border,border,border],source_size:size,pixels_per_unit_multiplier:1});
  const text=(value,size,color)=>({text:value,font,font_size:size,color,alignment:'Left',vertical_align:'Middle',horizontal_overflow:'Overflow',vertical_overflow:'Overflow',raycast_target:false});
  const shadow={effect_color:[0,0,0,.9],effect_distance:[1.2,1.2],use_graphic_alpha:true};
  for(const [page,frames] of Object.entries(pages)){
    const children=[];
    for(const f of frames){
      const name=optionNode(f.name),r=rect(f.rect),enabled=!!WARCRAFT_OPTION_BINDINGS[f.name];
      if(f.type==='TEXT'){
        const relation=f.anchors.find(a=>frames.some(g=>g.name===a.relative&&g.type==='GLUECHECKBOX'));
        const color=relation&&!WARCRAFT_OPTION_BINDINGS[relation.relative]?[.5,.5,.5,1]:f.color;
        children.push(node(name,{RectTransform:r,Text:text(f.text,f.fontSize,color),Shadow:shadow}));continue;
      }
      if(f.type==='BACKDROP'){
        if(f.templateChain.includes('OptionsPopupMenuBackdropTemplate'))children.push(node(name,{RectTransform:r,Image:image('OptionsPopup-Base-Mirrored.png')}));
        else if(f.name==='GammaNotch')children.push(node(name,{RectTransform:r,Image:image('GlueScreen-Pulldown-Arrow.png')}));
        else throw Error('Unmapped original options backdrop '+f.name);
        continue;
      }
      const id=optionId(f.name),parts=[node(id+' border',{RectTransform:fullStretchRect()}),node(id+' box',{RectTransform:fullStretchRect()}),node(id+' label',{RectTransform:fullStretchRect()})],box=parts[1],label=parts[2];
      if(f.type==='GLUECHECKBOX')box.components.Image=image('StandardCheckbox-'+(enabled?'Normal':'Disabled')+'-Unchecked.png');
      else if(f.type==='SLIDER'){
        box.components.Image=sliced('StandardSlider-256x32.png',10,[256,32]);
        parts.push(node(id+' thumb',{RectTransform:rect([0,0,19.2,19.2]),Image:image('SinglePlayerSkirmish-ScrollBarKnob'+(enabled?'':'Disabled')+'.png')}));
      }else if(['POPUPMENU','GLUEPOPUPMENU'].includes(f.type)){
        box.components.Image=sliced('StandardButton-Disabled-256x64.png');
        label.components.RectTransform={...fullStretchRect(),anchored_position:[0,0],size_delta:[-24,0]};
        label.components.Text=text('不可用',13.2,[.5,.5,.5,1]);label.components.Shadow=shadow;
        parts.push(node(id+' arrow',{RectTransform:rect([f.rect[2]/2-18.6,0,13.2,13.2]),Image:image('GlueScreen-Pulldown-Arrow.png',{color:[.5,.5,.5,1]})}));
      }else if(['EDITBOX','GLUEEDITBOX'].includes(f.type)){
        box.components.Image=sliced('StandardEditBox-96x48.png',24,[96,48]);
        label.components.RectTransform={...fullStretchRect(),size_delta:[-12,0]};label.components.Text=text('不可用',15.6,[.5,.5,.5,1]);
      }else throw Error('Unmapped original options control '+f.type+'/'+f.name);
      children.push(node('UI Control '+id,{RectTransform:r},parts));
    }
    const name=optionPage(page),root=node(name,{RectTransform:fullStretchRect()},children),index=prefab.root.children.findIndex(n=>n.name===name);
    if(index<0)prefab.root.children.push(root);else prefab.root.children[index]=root;
  }
}
