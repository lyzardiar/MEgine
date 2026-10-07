/* Author: MiYu. Original Warcraft effects, geometry and animated attachment positions. */
var FrostEffects=(()=>{
  const slots=['recovery','clarity','sanctuary','rejuvenation','cripple','fire0','fire1','fire2'];
  const definitions=Object.assign({},...FrostEffectArt.artDefinitions.map(d=>d.sections)),stem=p=>{const name=p.split(/[\\/]/).pop().replace(/\.mdl$/i,'');return Object.keys(FrostEffectArt.effects).find(k=>k.toLowerCase()===name.toLowerCase());};
  const blood=definitions.Bblo.Targetart.split(',');
  const spellBindings={bloodlustLeft:stem(blood[0]),bloodlustRight:stem(blood[1]),shield:stem(definitions.Blsh.Targetart),shieldCast:stem(definitions.Blsh.Specialart),portalCaster:stem(definitions.AItp.Casterart),portalArea:stem(definitions.AItp.Areaeffectart),portalArrival:stem(definitions.AItp.Targetart)};
  Object.assign(spellBindings,{roar:'RoarTarget',roarCaster:'RoarCaster',faerieFire:'FaerieFireTarget',cyclone:'CycloneTarget'});
  function anchors(mesh,facing=0,scale=1){
    const pitch=-Math.atan2(FrostVisual.camera.height,FrostVisual.camera.depth),c=Math.cos(facing)*scale,s=Math.sin(facing)*scale;
    const camera={model:[c,0,-s,0,0,scale,0,0,s,0,c,0,0,0,0,1],look:[0,Math.sin(pitch),-Math.cos(pitch)],up:[0,Math.cos(pitch),Math.sin(pitch)]};let nodes;
    const query=()=>nodes??=engine.assets.sampleNodes(mesh,{camera,attachmentsOnly:true}),at=name=>query().find(n=>name.test((n.name||'').trim()))?.position||null;at.nodes=query;return at;
  }
  function nodeTransform(matrix,position,facing,scale){
    const c=Math.cos(facing)*scale,s=Math.sin(facing)*scale,m=matrix.map((v,i)=>i%4===3?v: i%4===0?c*matrix[i]+s*matrix[i+2]:i%4===2?-s*matrix[i-2]+c*matrix[i]:v*scale),length=j=>Math.hypot(m[j],m[j+1],m[j+2]),sx=length(0),sy=length(4),sz=length(8);
    if(Math.min(sx,sy,sz)<1e-8)return null;
    const determinant=m[0]*(m[5]*m[10]-m[6]*m[9])-m[4]*(m[1]*m[10]-m[2]*m[9])+m[8]*(m[1]*m[6]-m[2]*m[5]),scales=[determinant<0?-sx:sx,sy,sz],r=[...m];
    for(let col=0;col<3;col++)for(let row=0;row<3;row++)r[col*4+row]/=scales[col];
    for(const [a,b] of [[0,4],[0,8],[4,8]])if(Math.abs(r[a]*r[b]+r[a+1]*r[b+1]+r[a+2]*r[b+2])>.00001)throw Error('Attachment matrix requires affine transform support');
    let q,t=r[0]+r[5]+r[10];
    if(t>0){const n=Math.sqrt(t+1)*2;q=[(r[6]-r[9])/n,(r[8]-r[2])/n,(r[1]-r[4])/n,n/4];}
    else if(r[0]>r[5]&&r[0]>r[10]){const n=Math.sqrt(1+r[0]-r[5]-r[10])*2;q=[n/4,(r[4]+r[1])/n,(r[8]+r[2])/n,(r[6]-r[9])/n];}
    else if(r[5]>r[10]){const n=Math.sqrt(1+r[5]-r[0]-r[10])*2;q=[(r[4]+r[1])/n,n/4,(r[9]+r[6])/n,(r[8]-r[2])/n];}
    else{const n=Math.sqrt(1+r[10]-r[0]-r[5])*2;q=[(r[8]+r[2])/n,(r[9]+r[6])/n,n/4,(r[1]-r[4])/n];}
    const norm=Math.hypot(...q);return {position:[position.x+m[12],position.y+m[13],position.z+m[14]],scale:scales,rotation:q.map(v=>v/norm)};
  }
  function embedded(u,visual,mesh,position,facing,scale,at,clock=null){
    const definitions=visual.asset.classic&&FrostConstructionArt.owners[visual.asset.sourceModel.replace(/\\/g,'/').toLowerCase()];if(!definitions)return [];
    const pose=mesh.match(/#pose=(\d+):(\d+)(?:@(\d+))?$/),seconds=pose?Number(pose[2])/Number(pose[3]||12):0,result=[];
    const cargo=u.kind==='entangledmine'&&u.built===1&&u.hp>0?Math.min(5,u.workers||0):0;
    if(!cargo&&!definitions.some(d=>d.clips.includes(pose?Number(pose[1]):0)))return result;
    const cargoIds=definitions.filter(d=>/entanglewisp\.mdl$/i.test(d.path)).slice(0,cargo).map(d=>d.id);
    for(const node of at.nodes()){
      const definition=node.attachment;if(!definition?.path)continue;const resident=cargoIds.includes(definition.id);if(!resident&&definition.visibility<=.001)continue;
      const key=definition.path.replace(/\\/g,'/').replace(/\.mdl$/i,'.mdx').toLowerCase(),art=FrostConstructionArt.models[key];if(!art)throw Error('Unresolved embedded model: '+definition.path);
      const transform=nodeTransform(node.matrix,position,facing,scale);if(!transform)continue;
      const clip=art.animations.findIndex(a=>(resident?/^stand$/i:/^birth$/i).test(a.name));if(clip<0)throw Error('Embedded construction model has no Birth: '+key);
      const elapsed=resident?Math.max(0,clock??seconds)%art.animations[clip].duration:Math.min(seconds,art.animations[clip].duration),frame=Math.floor(elapsed*30+1e-7);
      result.push({slot:result.length,name:key,node:node.index,attachmentId:definition.id,visibility:resident?1:definition.visibility,component:{effect:art.effect,clip,playing:false,looping:resident,speed:1,time_seconds:elapsed},parts:FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+frame+'@30',u.team),...transform});
    }
    return result;
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
    if(u.ancientRegen>0||u.rejuvenation>0)add('rejuvenation','RejuvenationTarget',u.rejuvenation>0?at(/^Chest Ref$/i)||[0,(visual.height-.5)/scale*.6,0]:undefined);
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
    if(u.roar>0)add('roar',Frost.druidRules.commands.Aroa.duration-u.roar,at(/^Overhead Ref$/i)||[0,visual.height/scale,0]);
    if(u.faerieFire>0)add('faerieFire',(u.kind==='hero'?Frost.druidRules.commands.Afae.heroDuration:Frost.druidRules.commands.Afae.duration)-u.faerieFire,at(/^Head Ref$/i)||at(/^Overhead Ref$/i)||[0,(visual.height-.5)/scale,0]);
    if(u.cyclone>0)add('cyclone',(u.kind==='hero'?Frost.druidRules.commands.Acyc.heroDuration:Frost.druidRules.commands.Acyc.duration)-u.cyclone,undefined,[position.x,Frost.elevation(state.map,u.x,u.z),position.z]);
    if(u.druidLastSpell==='roar')add('roarCaster',clock-u.druidCastFrame*Frost.DT);
    if(u.lightningShield>0){const age=Frost.casterSpells.lightningShield.duration-u.lightningShield;add('shield',age);add('shieldCast',age);}
    const left=Frost.portalLeft(u);if(left>0){const age=Frost.townPortal.time-left;add('portalCaster',age);if(u.order?.type==='townPortal')add('portalArea',age,undefined,[u.order.x,Frost.elevation(state.map,u.order.x,u.order.z),u.order.z]);}
    if(u.portalArrivalFrame!==undefined)add('portalArrival',clock-u.portalArrivalFrame*Frost.DT);
    return result;
  }
  return {slots,spellBindings,anchor,anchors,nodeTransform,embedded,status,spells};
})();
if(typeof module!=='undefined')module.exports=FrostEffects;
