/* Author: MiYu. Create hidden effect slots on demand and retain them for reuse. */
var FrostEffectPool=(()=>{
  const pattern=/^Classic (spell|status|attachment) (\d+)(.*)$/;
  const identity={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
  const pooled=name=>pattern.test(name);
  // Native typed components include defaults and serialize their floating fields as f32.
  function matches(actual,desired){
    if(actual===desired)return true;
    if(typeof actual==='number'&&typeof desired==='number')return Math.fround(actual)===Math.fround(desired);
    if(!actual||!desired||typeof actual!=='object'||typeof desired!=='object'||Array.isArray(actual)!==Array.isArray(desired))return false;
    if(Array.isArray(desired)&&actual.length!==desired.length)return false;
    return Object.keys(desired).every(key=>Object.hasOwn(actual,key)&&matches(actual[key],desired[key]));
  }
  function create(engine,entities,authored,register){
    const pending=new Map(),writes=new Map();let frame=0;
    const command=value=>engine.pushCommandJson(JSON.stringify(value));
    function spawn(name,entry){command({op:'spawn',name,active:entry.active,parent:entities[entry.parent]?.entity??null,components:entry.components});entry.frame=frame;}
    function queue(name,components,parent,active=false){
      if(entities[name]||pending.has(name))return;
      const entry={components:JSON.parse(JSON.stringify(components)),parent,active,frame};pending.set(name,entry);spawn(name,entry);
    }
    function beginFrame(){
      frame++;if(!pending.size&&!writes.size)return;
      register([...new Set([...pending.keys(),...writes.keys()])],true);
      for(const [name,entry] of pending){
        const entity=entities[name],parent=entities[entry.parent];
        if(entity&&parent){if(entity.parent===parent.entity)pending.delete(name);else command({op:'setParent',entity:entity.entity,parent:parent.entity});}
        else if(!entity&&frame-entry.frame>=3)spawn(name,entry);
      }
      for(const [name,entry] of writes){
        const entity=entities[name];if(!entity)continue;
        if(entry.active!==undefined){if((entity.active!==false)===entry.active)delete entry.active;else command({op:'setActive',entity:entity.entity,active:entry.active});}
        for(const [component,value] of entry.components){if(matches(entity.components[component],value.value))entry.components.delete(component);else command({op:'setComponent',entity:entity.entity,component,value:value.value});}
        if(entry.active===undefined&&!entry.components.size)writes.delete(name);
      }
    }
    function ensure(name,count){
      const match=pattern.exec(name);if(!match)return true;
      const [,kind,index,suffix]=match,template='Classic '+kind+' 0'+suffix;
      if(!authored[template])return false;
      const base='Scene / Effects/Classic '+kind,first=Math.floor(Number(index)/32)*32,group=base+'/Slots '+first+'-'+(first+31);
      queue(group,{Transform:identity},base,true);
      queue(name,authored[template],group);
      const names=[group,name];
      for(let i=0;i<count;i++){
        const child=name+' mesh '+i,components=authored[template+' mesh '+i]??authored[template+' mesh 0'];
        if(!components)return false;
        queue(child,{...components,Transform:identity},name);names.push(child);
      }
      return names.every(n=>entities[n]&&!pending.has(n));
    }
    function entryFor(name){let entry=writes.get(name);if(!entry){entry={components:new Map()};writes.set(name,entry);}return entry;}
    function setActive(name,active){
      const entity=entities[name];if(!entity)return;
      const entry=writes.get(name);if(entry?.active===active||entry?.active===undefined&&(entity.active!==false)===active)return;
      entryFor(name).active=active;command({op:'setActive',entity:entity.entity,active});
    }
    function setComponent(name,component,value){
      const entity=entities[name];if(!entity)return;
      const json=JSON.stringify(value),previous=writes.get(name)?.components.get(component);
      if(previous?.json===json||!previous&&matches(entity.components[component],value))return;
      const stored={json,value:JSON.parse(json)};entryFor(name).components.set(component,stored);command({op:'setComponent',entity:entity.entity,component,value:stored.value});
    }
    return {beginFrame,ensure,setActive,setComponent};
  }
  return {pooled,create};
})();
if(typeof module!=='undefined')module.exports=FrostEffectPool;
