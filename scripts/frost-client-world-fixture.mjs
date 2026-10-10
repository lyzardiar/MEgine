// Author: MiYu. Simulate native command commits and name queries between script ticks.
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
    }
  }}
  return {engine,snapshot,values,active,commit,entity:name=>names.get(name),queries:()=>queries};
}
