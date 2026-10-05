/* Author: MiYu. Original Warcraft status effects and animated building fire attachments. */
var FrostEffects=(()=>{
  const slots=['recovery','clarity','sanctuary','rejuvenation','cripple','fire0','fire1','fire2'];
  function anchor(key,mesh,name){
    const tracks=FrostEffectArt.models[FrostEffectArt.attachments[key]],node=tracks?.names.findIndex(n=>name.test(n.trim()));if(node===undefined||node<0)return null;
    const pose=mesh.match(/#pose=(\d+):([\d.]+)(?:@(\d+))?$/),clip=tracks.clips[pose?Number(pose[1]):0];if(!clip?.frames)return null;
    const seconds=Math.min(clip.duration,pose?Number(pose[2])/Number(pose[3]||12):0),lo=Math.min(clip.frames-1,Math.floor(seconds*tracks.fps+1e-7)),hi=Math.min(clip.frames-1,lo+1),end=Math.min(clip.duration,hi/tracks.fps),t=end>lo/tracks.fps?(seconds-lo/tracks.fps)/(end-lo/tracks.fps):0;
    const sample=frame=>{let l=0,h=clip.runs.length-1;while(l<h){const m=Math.ceil((l+h)/2);if(clip.runs[m][0]<=frame)l=m;else h=m-1;}return clip.runs[l][1][node];},a=sample(lo),b=sample(hi);
    return a.map((v,i)=>v+(b[i]-v)*t);
  }
  function status(state,u,visual,mesh,position,facing,scale,clock){
    const effects=[],origin=anchor(visual.key,mesh,/^Origin Ref$/i)||[0,0,0],add=(slot,name,point=origin)=>{
      const art=FrostEffectArt.effects[name];if(!art)return;
      const c=Math.cos(facing),s=Math.sin(facing),phase=(Math.max(0,clock)+u.id*.037)%art.duration;
      effects.push({slot,name,component:{effect:art.effect,clip:art.clip,playing:false,looping:true,speed:1,time_seconds:phase},position:[position.x+(point[0]*c+point[2]*s)*scale,position.y+point[1]*scale,position.z+(-point[0]*s+point[2]*c)*scale],scale:[scale,scale,scale]});
    };
    if(u.itemRegen?.hp>0){const item=Frost.items.find(i=>i.regen?.hp&&Math.abs(i.regen.hp/i.regen.time-u.itemRegen.hp)<1e-7);add('recovery',item?.regen.radius?'Scroll_Regen_Target':'HealingSalveTarget');}
    if(u.itemRegen?.mana>0)add('clarity','ClarityTarget');
    if(u.sanctuary)add('sanctuary','Staff_Sanctuary_Target');
    if(u.ancientRegen>0)add('rejuvenation','RejuvenationTarget');
    if(u.cripple>0)add('cripple','CrippleTarget');
    if(u.built===1&&!Frost.mobile(u)&&u.hp>0&&u.maxHp>0){
      const faction=u.kind==='hall'?u.baseFaction??state.teams[u.team]?.faction:state.teams[u.team]?.faction,prefix=faction===2?'Elf':faction===3?'Undead':'',large=anchor(visual.key,mesh,/^Sprite Large Ref$/i),size=large||Frost.types[u.kind].radius>=1.8?'Large':'Small',points=['First','Second','Third'].map(n=>anchor(visual.key,mesh,new RegExp('^Sprite '+n+' Ref$','i'))).filter(Boolean),damage=u.hp/u.maxHp<.25?3:u.hp/u.maxHp<.5?2:u.hp/u.maxHp<.75?1:0;
      if(large)points.push(large);
      if(!points.length)points.push([0,Math.max(0,(visual.height-.5)/scale)*.65,0]);
      for(let i=0;i<Math.min(damage,points.length,3);i++)add('fire'+i,prefix+size+'BuildingFire'+(points.length===1?damage-1:i),points[i]);
    }
    return effects;
  }
  return {slots,anchor,status};
})();
if(typeof module!=='undefined')module.exports=FrostEffects;
