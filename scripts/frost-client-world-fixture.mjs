// Author: MiYu. Simulate native command commits and name queries between script ticks.
import {createRequire} from 'node:module';
const UI=createRequire(import.meta.url)('../samples/frostbound-realms/game/ui-manager.js');
const HUD=createRequire(import.meta.url)('../samples/frostbound-realms/game/hud.js');
export function clientWorldFixture(source,normalize=false){
  const snapshot=structuredClone(source),names=new Map(snapshot.entities.map(e=>[e.name,e])),ids=new Map(snapshot.entities.map(e=>[e.entity,e])),commands=[],values=new Map(),active=new Map(snapshot.entities.map(e=>[e.entity,e.active!==false]));
  let next=Math.max(...snapshot.entities.map(e=>e.entity))+1,queries=0;
  const engine={findEntitiesByName:keys=>{queries++;return keys.map(n=>names.get(n)).filter(Boolean).map(e=>structuredClone(e));},pushCommandJson:raw=>commands.push(JSON.parse(raw)),setActive:(entity,on)=>commands.push({op:'setActive',entity,active:on})};
  function commit(drop=false){for(const c of commands.splice(0)){
    if(drop)continue;
    if(c.op==='spawn'){if(names.has(c.name))throw Error('duplicate spawn '+c.name);const e={entity:next++,name:c.name,parent:c.parent??null,active:c.active??true,components:structuredClone(c.components)};snapshot.entities.push(e);names.set(e.name,e);ids.set(e.entity,e);active.set(e.entity,e.active);}
    else if(c.op==='setParent')ids.get(c.entity).parent=c.parent;
    else if(c.op==='setActive'){ids.get(c.entity).active=c.active;active.set(c.entity,c.active);}
    else if(c.op==='setComponent'){
      const typed=value=>typeof value==='number'?Math.fround(value):Array.isArray(value)?value.map(typed):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,typed(value[k])])):value;
      const value=normalize?typed(c.value):structuredClone(c.value);if(normalize&&c.component==='MaterialPropertyBlock')Object.assign(value,{unusedNativeDefault:0});
      ids.get(c.entity).components[c.component]=value;values.set(c.entity+'/'+c.component,value);
    }else throw Error('unsupported command '+c.op);
  }}
  function render(tick,deltaTime){
    tick(deltaTime);commit();
    // A 10 Hz simulation step also presents two frames with no simulation time; pooled nodes acknowledge deferred native creation.
    if(deltaTime>=.08)for(let i=0;i<2;i++){engine.input={...engine.input,pressedKeys:[],pressedButtons:[],releasedButtons:[]};tick(0);commit();}
  }
  function visible(name){for(let e=names.get(name);e;e=ids.get(e.parent))if(e.active===false)return false;return names.has(name);}
  function canvasRect(name){
    const e=names.get(name),identity={anchor_min:[0,0],anchor_max:[1,1],pivot:[.5,.5],anchored_position:[0,0],size_delta:[0,0]};
    if(!e||e.components.Canvas)return identity;
    const parent=ids.get(e.parent),rect=parent?canvasRect(parent.name):identity;
    return e.components.RectTransform?UI.compose(rect,e.components.RectTransform):rect;
  }
  function canvasPoint(name,viewport=[1280,720],world=true){if(!names.has(name))throw Error('Unknown UI entity '+name);const v=HUD.viewport({viewport},world),r=UI.rectangle(canvasRect(name),[v.width,v.height]);return [v.w/2+r.x*v.scale,v.h/2+r.y*v.scale];}
  return {engine,snapshot,values,active,commit,render,visible,canvasRect,canvasPoint,entity:name=>names.get(name),queries:()=>queries};
}
