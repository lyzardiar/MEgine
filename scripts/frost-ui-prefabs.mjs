// Author: MiYu. UI prefab assets are the editable source for linked scene instances.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const UI_SCREENS=[
  ['MenuBackdrop','Background',true],['MenuBrand','Screens',true],['MainMenu','Screens',true],
  ['SinglePlayer','Screens',false],['FrontChrome','Screens',false],['MapSelection','Screens',false],
  ['Options','Screens',false],['Credits','Screens',false],['WorldOverlay','Screens',false],['BattleHUD','Screens',false],
  ['QuitDialog','Modals',false],['NetworkDialog','Modals',false],['PauseDialog','Modals',false],['RenameDialog','Modals',false],
  ['Tooltip','Overlays',false],['Notifications','Overlays',true]
];
export const UI_LAYERS=['Background','Screens','Modals','Overlays'];
export const prefabSource=key=>'Assets/Prefabs/UI/'+key+'.prefab';
export const fullStretchRect=()=>({anchor_min:[0,0],anchor_max:[1,1],pivot:[.5,.5],anchored_position:[0,0],size_delta:[0,0]});
export function stableUiId(name){const hex=createHash('sha256').update('frostbound-ui-v1/'+name).digest('hex');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);}

// Compose axis-aligned RectTransforms without a reference-resolution approximation.
export function canvasRect(parent,child){
  const result=structuredClone(child);
  for(let i=0;i<2;i++){
    const span=parent.anchor_max[i]-parent.anchor_min[i],childSpan=child.anchor_max[i]-child.anchor_min[i],anchor=child.anchor_min[i]+childSpan*child.pivot[i];
    result.anchor_min[i]=parent.anchor_min[i]+span*child.anchor_min[i];
    result.anchor_max[i]=parent.anchor_min[i]+span*child.anchor_max[i];
    result.size_delta[i]=parent.size_delta[i]*childSpan+child.size_delta[i];
    result.anchored_position[i]=parent.anchored_position[i]+parent.size_delta[i]*(anchor-parent.pivot[i])+child.anchored_position[i];
  }
  return result;
}

export function controlLocalRect(parent,child){
  if(child.anchor_min.some((v,i)=>v!==parent.anchor_min[i])||child.anchor_max.some((v,i)=>v!==parent.anchor_max[i]))throw new Error('A control part must share its control anchors before conversion');
  const result=structuredClone(child);result.anchor_min=[0,0];result.anchor_max=[1,1];
  for(let i=0;i<2;i++){
    result.anchored_position[i]=child.anchored_position[i]-parent.anchored_position[i]+(parent.pivot[i]-child.pivot[i])*parent.size_delta[i];
    result.size_delta[i]=child.size_delta[i]-parent.size_delta[i];
  }
  return result;
}

export function uiSceneEntities(entities){
  const canvas=entities.find(e=>e.name==='Interface'&&e.components.Canvas);
  if(!canvas)throw new Error('Frost UI requires the Interface canvas');
  const byParent=new Map();for(const e of entities){const siblings=byParent.get(e.parent)??[];siblings.push(e);byParent.set(e.parent,siblings);}
  const result=[];const visit=e=>{result.push(e);for(const child of byParent.get(e.entity)??[])visit(child);};
  for(const child of byParent.get(canvas.entity)??[])visit(child);
  for(const name of ['Portrait model','Portrait camera']){const e=entities.find(e=>e.name===name);if(e&&!result.includes(e))visit(e);}
  return {canvas,entities:result};
}

function resolveReferences(value,ids){
  if(Array.isArray(value))return value.map(v=>resolveReferences(v,ids));
  if(!value||typeof value!=='object')return value;
  const token=value.$mengine_entity_ref;
  if(token){if(token.kind!=='prefab_node'||!ids.has(token.node))throw new Error('Unresolved UI prefab reference: '+JSON.stringify(token));return String(ids.get(token.node));}
  return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,resolveReferences(v,ids)]));
}

export function applyUiPrefabs(entities,buttons,sourceRoot,outputRoot=sourceRoot){
  const old=uiSceneEntities(entities),removed=new Set(old.entities.map(e=>e.entity)),retained=entities.filter(e=>!removed.has(e.entity));
  let nextId=entities.reduce((id,e)=>Math.max(id,e.entity+1),1);
  const result={version:1,layers:[],screens:[],nodes:{},controls:{}};
  const names=new Set(retained.map(e=>e.name)),layers=new Map(),nodeRects=new Map();
  for(const [index,key] of UI_LAYERS.entries()){
    const e={entity:nextId++,name:'UI Layer '+key,parent:old.canvas.entity,siblingIndex:index,active:true,components:{RectTransform:fullStretchRect()}};
    retained.push(e);names.add(e.name);layers.set(key,e.entity);result.layers.push({key,name:e.name,entity:e.entity});
  }
  for(const [key,layer] of UI_SCREENS){
    const source=prefabSource(key),sourcePath=path.join(sourceRoot,source),prefab=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
    if(prefab.version!==2||!prefab.root)throw new Error('Expected prefab v2: '+source);
    const pending=[],ids=new Map(),instance=stableUiId('instance/'+key);
    const walk=(node,parent,order,depth)=>{
      if(depth>32||!node.id||ids.has(node.id)||!node.name||names.has(node.name))throw new Error('Invalid or duplicate UI prefab node: '+source+'/'+node.name);
      const id=nextId++;ids.set(node.id,id);names.add(node.name);pending.push({node,id,parent,order});
      for(const [index,child] of (node.children??[]).entries())walk(child,id,index,depth+1);
    };
    walk(prefab.root,layers.get(layer),result.screens.filter(s=>s.layer===layer).length,0);
    const screen={key,name:prefab.root.name,root:pending[0].id,source,layer,nodes:pending.map(p=>p.node.name)};result.screens.push(screen);
    const parentsById=new Map(pending.map(p=>[p.id,p.node.name]));
    for(const {node,id,parent,order} of pending){
      const components=resolveReferences(structuredClone(node.components??{}),ids);
      components.__MEnginePrefab={source,instance,node:node.id,root:id===screen.root};
      const e={entity:id,name:node.name,parent,siblingIndex:order,active:node.active!==false,tag:node.tag??'Untagged',layer:node.layer??0,components};retained.push(e);
      const info={screen:key,parent:parentsById.get(parent)??'UI Layer '+layer};
      if(components.RectTransform){const parentRect=nodeRects.get(parent)??fullStretchRect();info.rect=canvasRect(parentRect,components.RectTransform);nodeRects.set(id,info.rect);}
      result.nodes[node.name]=info;
    }
    if(path.resolve(sourceRoot)!==path.resolve(outputRoot))for(const suffix of ['', '.meta']){const target=path.join(outputRoot,source+suffix);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(sourcePath+suffix,target);}
  }
  for(const button of buttons){
    const name='UI Control '+button.id,root=retained.find(e=>e.name===name);if(!root)throw new Error('Missing UI control prefab: '+button.id);
    const parts=retained.filter(e=>e.parent===root.entity).map(e=>e.name);
    result.controls[button.id]={name,screen:result.nodes[name].screen,rect:result.nodes[name].rect,parts};
    for(const part of parts)result.nodes[part].control=name;
  }
  // Fail a build rather than silently leaving newly authored UI outside the prefab source.
  for(const e of old.entities)if(!names.has(e.name)&&!e.name.startsWith('UI '))throw new Error('UI prefab source is missing scene node: '+e.name);
  entities.splice(0,entities.length,...retained);
  return result;
}
