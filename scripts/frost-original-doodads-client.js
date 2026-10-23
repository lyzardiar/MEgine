// Author: MiYu. Share source animation states and publish only changed sampled frames.
var originalTerrainTick=onTick,originalDoodadElapsed=0,originalDoodadIds=null;
onTick=function(dt){
  originalTerrainTick(dt);
  const commands=[],frames=[];
  originalDoodadElapsed+=Math.max(0,dt);
  if(!originalDoodadIds){
    const names=originalDoodadGroups.flatMap(g=>g.names);
    originalDoodadIds=new Map(engine.findEntitiesByName(names).map(e=>[e.name,e.entity]));
    for(const name of names)if(!originalDoodadIds.has(name))throw new Error('Missing runtime doodad part: '+name);
  }
  for(const group of originalDoodadGroups){
    const t=group.loop?originalDoodadElapsed%Math.max(group.duration,1e-6):Math.min(originalDoodadElapsed,group.duration);
    const frame=Math.min(group.frames-1,Math.floor(t*12)),previous=group.lastFrame??0;
    if(frame===previous)continue;
    const before=group.states[previous],state=group.states[frame],materialChanged=state.material!==before.material,colorChanged=state.color.some((v,i)=>v!==before.color[i]);
    for(const name of group.names){
      const entity=originalDoodadIds.get(name);
      if(group.moving||materialChanged)commands.push({op:'setComponent',entity,component:'MeshRenderer',value:{mesh:group.mesh+'#pose='+group.clip+':'+(group.moving?frame:0),material:state.material}});
      if(colorChanged)commands.push({op:'setComponent',entity,component:'MaterialPropertyBlock',value:{override_base_color:true,base_color:state.color}});
      if((state.color[3]>.001)!==(before.color[3]>.001))commands.push({op:'setActive',entity,active:state.color[3]>.001});
    }
    frames.push([group,frame]);
  }
  if(commands.length){
    if(typeof engine.pushCommandsJson==='function'){
      if(!engine.pushCommandsJson(JSON.stringify(commands)))throw new Error('Invalid doodad command batch');
    }else for(const command of commands)engine.pushCommandJson(JSON.stringify(command));
  }
  for(const [group,frame] of frames)group.lastFrame=frame;
};
