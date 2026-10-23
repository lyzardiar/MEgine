// Author: MiYu. Share source animation states and publish only changed sampled frames.
var originalTerrainTick=onTick,originalDoodadElapsed=0,originalDoodadIds=null;
var originalDoodadActors=typeof originalDoodadActors==='undefined'?[]:originalDoodadActors;
var originalDoodadDefinitions=typeof originalDoodadDefinitions==='undefined'?[]:originalDoodadDefinitions;
var originalDoodadRandomState=typeof originalDoodadRandomState==='undefined'?1:originalDoodadRandomState;
function originalDoodadAdvance(state,durationMs,deltaMs){
  if(!state.clockStarted){state.clockStarted=true;return false;}
  state.timeMs=(state.timeMs||0)+deltaMs;
  if(state.timeMs<durationMs)return false;
  state.timeMs=0;state.clockStarted=false;return true;
}
function originalDoodadChoose(definition){
  if(definition.choices.length===1)return definition.choices[0][0];
  const total=definition.choices.reduce((sum,choice)=>sum+choice[1],0);
  let roll=1;
  if(total>1){originalDoodadRandomState=(Math.imul(originalDoodadRandomState,214013)+2531011)>>>0;roll+=((originalDoodadRandomState>>>16)&32767)%(total-1);}
  let accumulated=0;
  for(const choice of definition.choices){accumulated+=choice[1];if(roll<=accumulated)return choice[0];}
  return 0;
}
function originalDoodadPart(commands,part,frame,beforePart,beforeFrame,names){
  frame=Math.min(frame,part.frames-1);beforeFrame=Math.min(beforeFrame,beforePart.frames-1);
  const state=part.states[frame],before=beforePart.states[beforeFrame];
  const materialChanged=state.material!==before.material,colorChanged=state.color.some((v,i)=>v!==before.color[i]);
  const meshChanged=part.clip!==beforePart.clip||part.mesh!==beforePart.mesh||(part.moving&&frame!==beforeFrame);
  for(const name of names){
    const entity=originalDoodadIds.get(name);
    if(meshChanged||materialChanged)commands.push({op:'setComponent',entity,component:'MeshRenderer',value:{mesh:part.mesh+'#pose='+part.clip+':'+(part.moving?frame:0),material:state.material}});
    if(colorChanged)commands.push({op:'setComponent',entity,component:'MaterialPropertyBlock',value:{override_base_color:true,base_color:state.color}});
    if((state.color[3]>.001)!==(before.color[3]>.001))commands.push({op:'setActive',entity,active:state.color[3]>.001});
  }
}
onTick=function(dt){
  originalTerrainTick(dt);
  const commands=[],frames=[],actors=[];
  const deltaMs=Math.floor(Math.fround(Math.fround(Math.max(0,dt))*1000));
  originalDoodadElapsed+=Math.max(0,dt);
  if(!originalDoodadIds){
    const names=[...originalDoodadGroups.flatMap(g=>g.names),...originalDoodadActors.flatMap(actor=>actor.effect?[...actor.parts,actor.effect]:actor.parts)];
    originalDoodadIds=new Map(engine.findEntitiesByName(names).map(e=>[e.name,e.entity]));
    for(const name of names)if(!originalDoodadIds.has(name))throw new Error('Missing runtime doodad part: '+name);
    for(const actor of originalDoodadActors){actor.lastClip=actor.clip;actor.lastFrame=0;}
  }
  for(const group of originalDoodadGroups){
    if(group.restartOnEnd)originalDoodadAdvance(group,group.durationMs,deltaMs);
    const t=group.restartOnEnd?(group.timeMs||0)/1000:group.loop?originalDoodadElapsed%Math.max(group.duration,1e-6):Math.min(originalDoodadElapsed,group.duration);
    const frame=Math.min(group.frames-1,Math.floor(t*12)),previous=group.lastFrame??0;
    if(frame===previous)continue;
    if(group.effect)for(const name of group.names)commands.push({op:'setComponent',entity:originalDoodadIds.get(name),component:'SampledEffect',value:{...group.effect,time_seconds:t}});
    else originalDoodadPart(commands,group,frame,group,previous,group.names);
    frames.push([group,frame]);
  }
  for(const actor of originalDoodadActors){
    const definition=originalDoodadDefinitions[actor.definition],previousClip=actor.lastClip??actor.clip,previousFrame=actor.lastFrame??0;
    if(originalDoodadAdvance(actor,definition.clips[actor.clip].durationMs,deltaMs))actor.clip=originalDoodadChoose(definition);
    const clip=definition.clips[actor.clip],before=definition.clips[previousClip],frame=Math.floor((actor.timeMs||0)*.012);
    if(actor.clip===previousClip&&frame===previousFrame)continue;
    for(let index=0;index<actor.parts.length;index++)originalDoodadPart(commands,clip.parts[index],frame,before.parts[index],previousFrame,[actor.parts[index]]);
    if(actor.effect)commands.push({op:'setComponent',entity:originalDoodadIds.get(actor.effect),component:'SampledEffect',value:{...clip.effect,time_seconds:(actor.timeMs||0)/1000}});
    actors.push([actor,actor.clip,frame]);
  }
  if(commands.length){
    if(typeof engine.pushCommandsJson==='function'){
      if(!engine.pushCommandsJson(JSON.stringify(commands)))throw new Error('Invalid doodad command batch');
    }else for(const command of commands)engine.pushCommandJson(JSON.stringify(command));
  }
  for(const [group,frame] of frames)group.lastFrame=frame;
  for(const [actor,clip,frame] of actors){actor.lastClip=clip;actor.lastFrame=frame;}
};
