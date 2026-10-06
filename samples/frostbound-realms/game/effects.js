/* Author: MiYu. Original Warcraft effects, geometry and animated attachment positions. */
var FrostEffects=(()=>{
  const slots=['recovery','clarity','sanctuary','rejuvenation','cripple','fire0','fire1','fire2'];
  const definitions=Object.assign({},...FrostEffectArt.artDefinitions.map(d=>d.sections)),stem=p=>{const name=p.split(/[\\/]/).pop().replace(/\.mdl$/i,'');return Object.keys(FrostEffectArt.effects).find(k=>k.toLowerCase()===name.toLowerCase());};
  const blood=definitions.Bblo.Targetart.split(',');
  const spellBindings={bloodlustLeft:stem(blood[0]),bloodlustRight:stem(blood[1]),shield:stem(definitions.Blsh.Targetart),shieldCast:stem(definitions.Blsh.Specialart),portalCaster:stem(definitions.AItp.Casterart),portalArea:stem(definitions.AItp.Areaeffectart),portalArrival:stem(definitions.AItp.Targetart)};
  function anchors(mesh,facing=0,scale=1){
    const pitch=-Math.atan2(FrostVisual.camera.height,FrostVisual.camera.depth),c=Math.cos(facing)*scale,s=Math.sin(facing)*scale;
    const camera={model:[c,0,-s,0,0,scale,0,0,s,0,c,0,0,0,0,1],look:[0,Math.sin(pitch),-Math.cos(pitch)],up:[0,Math.cos(pitch),Math.sin(pitch)]};let nodes;
    return name=>{nodes??=engine.assets.sampleNodes(mesh,{camera,attachmentsOnly:true});return nodes.find(n=>name.test((n.name||'').trim()))?.position||null;};
  }
  function anchor(key,mesh,name){
    if(!FrostArt[key]?.classic)return null;
    return anchors(mesh)(name);
  }
  function status(state,u,visual,mesh,position,facing,scale,clock,at=visual.asset.classic?anchors(mesh,facing,scale):()=>null){
    const effects=[],add=(slot,name,point)=>{
      const art=FrostEffectArt.effects[name];if(!art)return;
      point??=at(/^Origin Ref$/i)||[0,0,0];
      const c=Math.cos(facing),s=Math.sin(facing),phase=(Math.max(0,clock)+u.id*.037)%art.duration;
      effects.push({slot,name,component:{effect:art.effect,clip:art.clip,playing:false,looping:true,speed:1,time_seconds:phase},position:[position.x+(point[0]*c+point[2]*s)*scale,position.y+point[1]*scale,position.z+(-point[0]*s+point[2]*c)*scale],scale:[scale,scale,scale]});
    };
    if(u.itemRegen?.hp>0){const item=Frost.items.find(i=>i.regen?.hp&&Math.abs(i.regen.hp/i.regen.time-u.itemRegen.hp)<1e-7);add('recovery',item?.regen.radius?'Scroll_Regen_Target':'HealingSalveTarget');}
    if(u.itemRegen?.mana>0)add('clarity','ClarityTarget');
    if(u.sanctuary)add('sanctuary','Staff_Sanctuary_Target');
    if(u.ancientRegen>0)add('rejuvenation','RejuvenationTarget');
    if(u.cripple>0)add('cripple','CrippleTarget');
    if(u.built===1&&!Frost.mobile(u)&&u.hp>0&&u.maxHp>0){
      const damage=u.hp/u.maxHp<.25?3:u.hp/u.maxHp<.5?2:u.hp/u.maxHp<.75?1:0;if(!damage)return effects;
      const faction=u.kind==='hall'?u.baseFaction??state.teams[u.team]?.faction:state.teams[u.team]?.faction,prefix=faction===2?'Elf':faction===3?'Undead':'',large=at(/^Sprite Large Ref$/i),size=large||Frost.types[u.kind].radius>=1.8?'Large':'Small',points=['First','Second','Third'].map(n=>at(new RegExp('^Sprite '+n+' Ref$','i'))).filter(Boolean);
      if(large)points.push(large);
      if(!points.length)points.push([0,Math.max(0,(visual.height-.5)/scale)*.65,0]);
      for(let i=0;i<Math.min(damage,points.length,3);i++)add('fire'+i,prefix+size+'BuildingFire'+(points.length===1?damage-1:i),points[i]);
    }
    return effects;
  }
  function spells(state,u,visual,mesh,position,facing,scale,clock,at=visual.asset.classic?anchors(mesh,facing,scale):()=>null){
    const result=[];
    function add(slot,elapsed,point,destination=null){
      const name=spellBindings[slot],art=FrostEffectArt.effects[name];if(!art||elapsed<0)return;
      const birth=art.animations.findIndex(a=>/^birth$/i.test(a.name)),stand=art.animations.findIndex(a=>/^stand$/i.test(a.name));
      let clip=birth>=0&&elapsed<art.animations[birth].duration?birth:stand>=0?stand:birth,seconds=elapsed;
      if(clip<0)return;if(clip!==birth&&birth>=0)seconds-=art.animations[birth].duration;
      const animation=art.animations[clip];if(!animation.loop&&seconds>=animation.duration)return;if(animation.loop)seconds%=animation.duration;
      if(!destination)point??=at(/^Origin Ref$/i)||[0,0,0];
      const c=Math.cos(facing),s=Math.sin(facing),world=destination||[position.x+(point[0]*c+point[2]*s)*scale,position.y+point[1]*scale,position.z+(-point[0]*s+point[2]*c)*scale];
      result.push({slot,name,component:{effect:art.effect,clip,playing:false,looping:animation.loop,speed:1,time_seconds:seconds},parts:FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(seconds*30)+'@30'),position:world,scale:[scale,scale,scale],rotation:[0,Math.sin(facing/2),0,Math.cos(facing/2)]});
    }
    if(u.bloodlust>0){const age=Frost.casterSpells.bloodlust.duration-u.bloodlust;add('bloodlustLeft',age,at(/^Hand Left Ref$/i));add('bloodlustRight',age,at(/^Hand Right Ref$/i));}
    if(u.lightningShield>0){const age=Frost.casterSpells.lightningShield.duration-u.lightningShield;add('shield',age);add('shieldCast',age);}
    const left=Frost.portalLeft(u);if(left>0){const age=Frost.townPortal.time-left;add('portalCaster',age);if(u.order?.type==='townPortal')add('portalArea',age,undefined,[u.order.x,Frost.elevation(state.map,u.order.x,u.order.z),u.order.z]);}
    if(u.portalArrivalFrame!==undefined)add('portalArrival',clock-u.portalArrivalFrame*Frost.DT);
    return result;
  }
  return {slots,spellBindings,anchor,anchors,status,spells};
})();
if(typeof module!=='undefined')module.exports=FrostEffects;
