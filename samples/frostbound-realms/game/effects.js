/* Author: MiYu. Original Warcraft effects, geometry and animated attachment positions. */
var FrostEffects=(()=>{
  const slots=['recovery','clarity','sanctuary','rejuvenation','cripple','poison','fire0','fire1','fire2'];
  const definitions=Object.assign({},...FrostEffectArt.artDefinitions.map(d=>d.sections)),stem=p=>{const name=p.split(/[\\/]/).pop().replace(/\.mdl$/i,'');return Object.keys(FrostEffectArt.effects).find(k=>k.toLowerCase()===name.toLowerCase());};
  const blood=definitions.Bblo.Targetart.split(',');
  const spellBindings={bloodlustLeft:stem(blood[0]),bloodlustRight:stem(blood[1]),shield:stem(definitions.Blsh.Targetart),shieldCast:stem(definitions.Blsh.Specialart),portalCaster:stem(definitions.AItp.Casterart),portalArea:stem(definitions.AItp.Areaeffectart),portalArrival:stem(definitions.AItp.Targetart)};
  Object.assign(spellBindings,{trueshotAura:'TrueshotAura',starfall:'StarfallCaster',starfallHit:'StarfallTarget',keeperRoots:'EntanglingRootsTarget',thornsAura:'ThornsAura',thornsHit:'ThornsAuraDamage',tranquility:'Tranquility',tranquilityHit:'TranquilityTarget',manaBurn:'ManaBurnTarget',immolation:'ImmolationTarget',immolationHit:'ImmolationDamage',taunt:'TauntCaster',flareBase:'ManaFlareBase',flareImpact:'ManaFlareBoltImpact',flareTarget:'ManaFlareTarget',phaseShift:'FaerieDragon_Invis',roar:'RoarTarget',roarCaster:'RoarCaster',faerieFire:'FaerieFireTarget',cyclone:'CycloneTarget'});
  Object.assign(spellBindings,{blinkCaster:'BlinkCaster',blinkTarget:'BlinkTarget',fanKnives:'FanOfKnivesCaster',shadowStrike:'shadowstrike',vengeanceBirth:'feralspiritdone',vengeanceSpiritBirth:'SpiritOfVengeanceBirthMissile'});
  Object.assign(spellBindings,{brillianceAura:'Brilliance',massTeleportCaster:'MassTeleportCaster',massTeleportTo:'MassTeleportTo',massTeleportArrival:'MassTeleportTarget'});
  Object.assign(spellBindings,{shadowhunterActor:'ClassicShadowHunterEmbedded',wardActor:'ClassicSerpentWardEmbedded',healingWave:'HealingWaveTarget',hexTransform:'PolyMorphDoneGround',voodooCaster:'VoodooAura',voodooTarget:'VoodooAuraTarget'});
  Object.assign(spellBindings,{taurenActor:'ClassicTaurenChieftainEmbedded',taurenStomp:'WarStompCaster',enduranceAura:'CommandAura',reincarnation:'ReincarnationTarget'});
  Object.assign(spellBindings,{farseerActor:'ClassicFarSeerEmbedded',wolfActor:'ClassicSpiritWolfEmbedded',wolfBirth:'FeralSpiritTarget',wolfBirthDone:'FeralSpiritDone',farseerImpact:'BoltImpact',farseerBolt:'LightningBoltMissile',earthquake:'EarthquakeTarget',earthquakeSlow:'StasisTotemTarget'});
  Object.assign(spellBindings,{holyLight:'HolyBoltSpecialArt',divineShield:'DivineShieldTarget',devotionBearer:'DevotionAura',devotionBuff:'GeneralAuraTarget',resurrectionCaster:'Resurrectcaster',resurrectionTarget:'Resurrecttarget'});
  Object.assign(spellBindings,{mountainClapCaster:'ThunderClapCaster',mountainAvatarCaster:'AvatarCaster',mountainStun:'ThunderclapTarget',mountainClap:'StasisTotemTarget'});
  Object.assign(spellBindings,{bloodBanish:'BanishTarget',bloodSiphonCaster:'ManaDrainCaster',bloodSiphonTarget:'ManaDrainTarget',phoenixFire:'FlameStrikeDamageTarget',bloodActor:'ClassicBloodMageEmbedded',phoenixActor:'ClassicPhoenixEmbedded',bloodSphere0:'BloodElfBall',bloodSphere1:'BloodElfBall',bloodSphere2:'BloodElfBall'});
  Object.assign(spellBindings,{bladeMirrorCaster:'MirrorImageCaster',bladeMirrorMissile:'MirrorImageMissile',bladeMirrorTarget:'LevelupCaster',bladeActor:'ClassicBladeMasterEmbedded'});
  for(let i=1;i<=6;i++)spellBindings['vengeanceOrbs'+i]='SpiritOfVengeanceOrbs'+i;
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
    if(Frost.slowPoisonLeft(u)>0)add('poison','PoisonStingTarget');
    if(u.built===1&&!Frost.mobile(u)&&u.hp>0&&u.maxHp>0){
      const damage=u.hp/u.maxHp<.25?3:u.hp/u.maxHp<.5?2:u.hp/u.maxHp<.75?1:0;if(!damage)return effects;
      const faction=u.kind==='hall'?u.baseFaction??state.teams[u.team]?.faction:state.teams[u.team]?.faction,prefix=faction===2?'Elf':faction===3?'Undead':'',large=at(/^Sprite Large Ref$/i),size=large||Frost.types[u.kind].radius>=1.8?'Large':'Small',points=['First','Second','Third'].map(n=>at(new RegExp('^Sprite '+n+' Ref$','i'))).filter(Boolean);
      if(large)points.push(large);
      if(!points.length)points.push([0,Math.max(0,(visual.height-.5)/scale)*.65,0]);
      for(let i=0;i<Math.min(damage,points.length,3);i++)add('fire'+i,prefix+size+'BuildingFire'+(points.length===1?damage-1:i),points[i]);
    }
    return effects;
  }
  function spells(state,u,visual,mesh,position,facing,scale,clock,at=visual.asset.classic?anchors(mesh,facing,scale):()=>null,viewerTeam=0){
    const result=[];
    function add(slot,elapsed,point,destination=null){
      const name=spellBindings[slot],art=FrostEffectArt.effects[name];if(!art||elapsed<0)return;
      const birth=art.animations.findIndex(a=>/^birth(?: - \d+)?$/i.test(a.name)),stand=art.animations.findIndex(a=>/^stand$/i.test(a.name));
      let clip=birth>=0&&elapsed<art.animations[birth].duration?birth:stand>=0?stand:birth,seconds=elapsed;
      if(slot==='farseerBolt'){clip=art.animations.findIndex(a=>a.name==='Death');seconds=elapsed+(birth>=0?art.animations[birth].duration:0);}if(slot==='mountainAvatarCaster'){clip=art.animations.findIndex(a=>/^spell$/i.test(a.name));seconds=elapsed;}if(clip<0)return;if(clip!==birth&&birth>=0)seconds-=art.animations[birth].duration;
      if(slot==='flareTarget'){let remaining=elapsed;clip=-1;for(const name of ['Birth','Stand','Death']){const i=art.animations.findIndex(a=>a.name.toLowerCase()===name.toLowerCase());if(i<0)continue;if(remaining<art.animations[i].duration){clip=i;seconds=remaining;break;}remaining-=art.animations[i].duration;}if(clip<0)return;}
      const animation=art.animations[clip];if(slot==='massTeleportCaster')seconds%=animation.duration;if(!animation.loop&&seconds>=animation.duration)return;if(animation.loop&&slot!=='flareTarget')seconds%=animation.duration;
      if(!destination)point??=at(/^Origin Ref$/i)||[0,0,0];
      const c=Math.cos(facing),s=Math.sin(facing),world=destination||[position.x+(point[0]*c+point[2]*s)*scale,position.y+point[1]*scale,position.z+(-point[0]*s+point[2]*c)*scale];
      result.push({slot,name,component:{effect:art.effect,clip,playing:false,looping:animation.loop&&slot!=='flareTarget',speed:1,time_seconds:seconds},parts:art.parts.length?FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(seconds*30)+'@30'):[],position:world,scale:[scale,scale,scale],rotation:[0,Math.sin(facing/2),0,Math.cos(facing/2)]});
    }
    if(u.banish||u.banishLeft>0)add('bloodBanish',clock,at(/^Chest Ref$/i));
    if(u.phoenixFire||u.phoenixFireLeft>0)add('phoenixFire',clock,at(/^Chest Ref$/i));
    if(u.siphonMana||u.siphonManaLeft>0){add('bloodSiphonCaster',clock,at(/^Chest Ref$/i));const v=u.siphonTarget||state.units.find(v=>v.id===u.siphonMana?.target);if(v)add('bloodSiphonTarget',clock,undefined,[v.x,v.y??Frost.unitHeight(state,v)+1.3,v.z]);}
    if(Frost.bloodMageUnit(u))for(const [i,name] of ['First','Second','Third'].entries()){const point=at(new RegExp('^Sprite '+name+' Ref$','i'));if(point)add('bloodSphere'+i,clock,point);}
    if(!(u.hex||u.hexLeft>0)&&(Frost.shadowhunterUnit(u)||Frost.serpentward(u)||Frost.taurenUnit(u)||Frost.farseerUnit(u)||Frost.spiritwolf(u)||Frost.bloodMageUnit(u)||Frost.phoenixUnit(u)||Frost.blademasterUnit(u)||Frost.bladeIllusion(u))){const slot=Frost.shadowhunterUnit(u)?'shadowhunterActor':Frost.serpentward(u)?'wardActor':Frost.taurenUnit(u)?'taurenActor':Frost.farseerUnit(u)?'farseerActor':Frost.spiritwolf(u)?'wolfActor':Frost.bloodMageUnit(u)?'bloodActor':Frost.phoenixUnit(u)?'phoenixActor':'bladeActor',art=FrostEffectArt.effects[spellBindings[slot]],pose=mesh.match(/#pose=(\d+):(\d+)(?:@(\d+))?$/);if(pose){const clip=Number(pose[1]),seconds=Number(pose[2])/Number(pose[3]||12);result.push({slot,name:spellBindings[slot],component:{effect:art.effect,clip,playing:false,looping:false,speed:1,time_seconds:seconds},parts:[],position:[position.x,position.y,position.z],scale:[scale,scale,scale],rotation:[0,Math.sin(facing/2),0,Math.cos(facing/2)]});}}
    if(Frost.spiritwolf(u)&&u.wolfBornFrame!==undefined){add('wolfBirth',clock-u.wolfBornFrame*Frost.DT);add('wolfBirthDone',clock-u.wolfBornFrame*Frost.DT);}
    if(u.healingWaveFrame!==undefined)add('healingWave',clock-u.healingWaveFrame*Frost.DT,at(/^Origin Ref$/i));
    if(u.hex||u.hexLeft>0)add('hexTransform',clock-(u.hex?.frame??u.hexFrame)*Frost.DT);
    if((u.voodoo||u.voodooLeft>0)&&u.hp>0)add('voodooCaster',u.voodoo?clock-u.voodoo.frame*Frost.DT:clock);
    if(u.voodooProtected||Frost.voodooProtection(state,u))add('voodooTarget',clock,at(/^Origin Ref$/i));
    if(u.farseerBoltFrame!==undefined){const age=clock-u.farseerBoltFrame*Frost.DT;add('farseerImpact',age,at(/^Chest Ref$/i));add('farseerBolt',age,at(/^Chest Ref$/i));}
    if(u.earthquake&&u.earthquake.delay<=1e-8&&state.visible[viewerTeam]?.[Frost.index(u.earthquake.x,u.earthquake.z)])add('earthquake',clock-u.earthquake.frame*Frost.DT-.5,undefined,[u.earthquake.x,Frost.elevation(state.map,u.earthquake.x,u.earthquake.z),u.earthquake.z]);
    if(u.earthquakeSlow)add('earthquakeSlow',clock,at(/^Overhead Ref$/i));
    const mirror=u.bladeMirrorEffect;if(mirror){const source=[mirror.x,Frost.elevation(state.map,mirror.x,mirror.z),mirror.z],sourceVisible=state.visible[viewerTeam]?.[Frost.index(mirror.x,mirror.z)];if(sourceVisible&&u.bladeCastFrame===mirror.frame)add('bladeMirrorCaster',clock-mirror.frame*Frost.DT,undefined,source);if(mirror.born!==undefined){const elapsed=clock-mirror.born*Frost.DT,dx=mirror.toX-mirror.x,dz=mirror.toZ-mirror.z,length=Math.hypot(dx,dz),speed=Number(Frost.blademasterRules.abilities.AOmi.sourceFunc.Missilespeed)/100;if(sourceVisible&&elapsed>=0&&length>0&&elapsed<length/speed){const t=elapsed*speed/length,y=Frost.elevation(state.map,mirror.toX,mirror.toZ);add('bladeMirrorMissile',elapsed,undefined,[mirror.x+dx*t,source[1]+(y-source[1])*t,mirror.z+dz*t]);const effect=result.at(-1),yaw=Math.atan2(-dz,dx);if(effect?.slot==='bladeMirrorMissile')effect.rotation=[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];}add('bladeMirrorTarget',elapsed);}}
    if(Frost.taurenUnit(u)&&u.hp>0&&u.skills[2]>0)add('enduranceAura',clock);
    if(u.taurenLastSlot===1)add('taurenStomp',clock-u.taurenCastFrame*Frost.DT);
    if(u.taurenRebornFrame!==undefined){const effect=reincarnation(u,clock,state.map,scale);if(effect)result.push({slot:'reincarnation',...effect});}
    if(u.taurenStun||u.taurenStunLeft>0)add('mountainStun',clock,at(/^Overhead Ref$/i));
    if(u.mountainKingLastSlot===1)add('mountainClapCaster',clock-u.mountainKingCastFrame*Frost.DT);
    if(u.mountainAvatarFrame!==undefined)add('mountainAvatarCaster',clock-u.mountainAvatarFrame*Frost.DT);
    if(u.mountainStun||u.mountainStunLeft>0)add('mountainStun',clock,at(/^Overhead Ref$/i));
    if(u.mountainClap||u.mountainClapLeft>0)add('mountainClap',clock,at(/^Overhead Ref$/i));
    if(u.holyLightFrame!==undefined)add('holyLight',clock-u.holyLightFrame*Frost.DT);
    if(u.divineShield>0)add('divineShield',clock-u.divineShieldFrame*Frost.DT);
    if(Frost.devotionAura(state,u)>0)add('devotionBuff',clock);
    if(Frost.paladinUnit(u)&&u.hp>0&&u.skills[2]>0)add('devotionBearer',clock);
    if(u.paladinLastSlot===3)add('resurrectionCaster',clock-u.paladinCastFrame*Frost.DT);
    if(u.resurrectionFrame!==undefined)add('resurrectionTarget',clock-u.resurrectionFrame*Frost.DT);
    if(Frost.brillianceAura(state,u)>0)add('brillianceAura',clock);
    if(u.massTeleport){const age=clock-u.massTeleport.frame*Frost.DT,target=state.units.find(v=>v.id===u.massTeleport.target);add('massTeleportCaster',age);if(target)add('massTeleportTo',age,undefined,[target.x,Frost.elevation(state.map,target.x,target.z),target.z]);}
    if(u.massTeleportArrivalFrame!==undefined)add('massTeleportArrival',clock-u.massTeleportArrivalFrame*Frost.DT);
    if(u.wardenLastSlot===0&&u.wardenBlinkFrom){const elapsed=clock-u.wardenCastFrame*Frost.DT;add('blinkCaster',elapsed,undefined,[u.wardenBlinkFrom.x,Frost.elevation(state.map,u.wardenBlinkFrom.x,u.wardenBlinkFrom.z),u.wardenBlinkFrom.z]);add('blinkTarget',elapsed);}
    if(u.wardenLastSlot===1)add('fanKnives',clock-u.wardenCastFrame*Frost.DT);
    if(u.shadowStrike)add('shadowStrike',clock-u.shadowStrike.frame*Frost.DT,at(/^Head Ref$/i)||at(/^Overhead Ref$/i));
    if(Frost.vengeanceAvatar(u)){if(u.vengeanceBornFrame!==undefined)add('vengeanceBirth',clock-u.vengeanceBornFrame*Frost.DT);const count=u.vengeanceSpirits??Frost.vengeanceCount(state,u);if(count)add('vengeanceOrbs'+count,clock,at(/^Overhead Ref$/i));}
    if(Frost.vengeanceSpirit(u)&&u.vengeanceBornFrame!==undefined)add('vengeanceSpiritBirth',clock-u.vengeanceBornFrame*Frost.DT);
    if(Frost.priestessTrueshot(state,u)>0)add('trueshotAura',clock);
    if(u.starfall)add('starfall',clock-u.starfall.frame*Frost.DT);
    if(u.starfallHitFrame!==undefined)add('starfallHit',clock-u.starfallHitFrame*Frost.DT);
    if(u.keeperRoots)add('keeperRoots',clock-u.keeperRoots.frame*Frost.DT);
    if(Frost.keeperThorns(state,u)>0)add('thornsAura',clock);
    if(u.thornsHitFrame!==undefined&&clock-u.thornsHitFrame*Frost.DT<.534)add('thornsHit',clock-u.thornsHitFrame*Frost.DT);
    if(u.tranquility)add('tranquility',clock-u.tranquility.frame*Frost.DT);
    if(u.tranquilityHitFrame!==undefined&&clock-u.tranquilityHitFrame*Frost.DT<1)add('tranquilityHit',clock-u.tranquilityHitFrame*Frost.DT);
    if(u.manaBurnFrame!==undefined)add('manaBurn',clock-u.manaBurnFrame*Frost.DT);
    if(u.immolation)add('immolation',clock-u.immolationFrame*Frost.DT);
    if(u.immolationHitFrame!==undefined&&clock-u.immolationHitFrame*Frost.DT<1)add('immolationHit',clock-u.immolationHitFrame*Frost.DT);
    if(u.tauntFrame!==undefined)add('taunt',clock-u.tauntFrame*Frost.DT);
    if(u.flareLeft>0)add('flareBase',Frost.faerieRules.abilities.Amfl.duration-u.flareLeft);
    if(u.phaseLeft>0)add('phaseShift',Frost.faerieRules.abilities.Apsh.duration-u.phaseLeft);
    if(u.manaFlareHitFrame!==undefined){add('flareImpact',clock-u.manaFlareHitFrame*Frost.DT);add('flareTarget',clock-u.manaFlareHitFrame*Frost.DT);}
    if(u.bloodlust>0){const age=Frost.casterSpells.bloodlust.duration-u.bloodlust;add('bloodlustLeft',age,at(/^Hand Left Ref$/i));add('bloodlustRight',age,at(/^Hand Right Ref$/i));}
    if(u.roar>0)add('roar',Frost.druidRules.commands.Aroa.duration-u.roar,at(/^Overhead Ref$/i)||[0,visual.height/scale,0]);
    if(u.faerieFire>0)add('faerieFire',(Frost.heroDuration(u)?Frost.druidRules.commands.Afae.heroDuration:Frost.druidRules.commands.Afae.duration)-u.faerieFire,at(/^Head Ref$/i)||at(/^Overhead Ref$/i)||[0,(visual.height-.5)/scale,0]);
    if(u.cyclone>0)add('cyclone',(Frost.heroDuration(u)?Frost.druidRules.commands.Acyc.heroDuration:Frost.druidRules.commands.Acyc.duration)-u.cyclone,undefined,[position.x,Frost.elevation(state.map,u.x,u.z),position.z]);
    if(u.druidLastSpell==='roar')add('roarCaster',clock-u.druidCastFrame*Frost.DT);
    if(u.lightningShield>0){const age=Frost.casterSpells.lightningShield.duration-u.lightningShield;add('shield',age);add('shieldCast',age);}
    const left=Frost.portalLeft(u);if(left>0){const age=Frost.townPortal.time-left;add('portalCaster',age);if(u.order?.type==='townPortal')add('portalArea',age,undefined,[u.order.x,Frost.elevation(state.map,u.order.x,u.order.z),u.order.z]);}
    if(u.portalArrivalFrame!==undefined)add('portalArrival',clock-u.portalArrivalFrame*Frost.DT);
    return result;
  }
  function flames(state,clock,team){return (state.flameStrikes||[]).filter(c=>state.visible[team]?.[Frost.index(c.x,c.z)]).map(c=>{const r=Frost.bloodMageRules.abilities.AHfs.levels[c.rank-1],age=Math.max(0,clock-c.frame*Frost.DT),position=[c.x,Frost.elevation(state.map,c.x,c.z),c.z],scale=FrostUnitScales.worldScale,result={};for(const [slot,name] of [['flame','FlameStrike'],['target','FlameStrikeTarget'],['embers','FlameStrikeEmbers']]){const art=FrostEffectArt.effects[name];let phase=age,action='birth';if(slot==='flame'){phase-=r.castTime;if(phase<0)continue;const birth=art.animations.find(a=>a.name.toLowerCase()==='birth').duration;if(phase>=3){action='death';phase-=3;}else if(phase>=birth){action='stand';phase-=birth;}}else if(slot==='embers'){phase-=r.castTime+3;if(phase<0)continue;action='stand';}else if(phase>=r.castTime){action='death';phase-=r.castTime;}const clip=art.animations.findIndex(a=>a.name.toLowerCase()===action),animation=art.animations[clip];if(!animation||!animation.loop&&phase>=animation.duration)continue;phase=animation.loop?phase%animation.duration:phase;result[slot]={component:{effect:art.effect,clip,playing:false,looping:animation.loop,speed:1,time_seconds:phase},parts:art.parts.length?FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(phase*30)+'@30'):[],position,scale:[scale,scale,scale],rotation:[0,0,0,1]};}return result;});}
  function siphonRibbon(state,u,position,clock=state.frame*Frost.DT){const v=u.siphonTarget||state.units.find(v=>v.id===u.siphonMana?.target);if(!v||!(u.siphonMana||u.siphonManaLeft>0))return null;const from=[position.x,position.y+1.3,position.z],to=[v.x,v.y??Frost.unitHeight(state,v)+1.3,v.z],delta=to.map((v,i)=>v-from[i]),length=Math.hypot(...delta);if(length<1e-8)return null;const x=delta.map(v=>v/length),look=[0,-FrostVisual.camera.height,-FrostVisual.camera.depth],cross=[x[1]*look[2]-x[2]*look[1],x[2]*look[0]-x[0]*look[2],x[0]*look[1]-x[1]*look[0]],norm=Math.hypot(...cross);if(norm<1e-8)return null;const y=cross.map(v=>v/norm),z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],transform=nodeTransform([...x,0,...y,0,...z,0,0,0,0,1],{x:(from[0]+to[0])/2,y:(from[1]+to[1])/2,z:(from[2]+to[2])/2},0,1);return {parts:[{mesh:'Assets/Models/BloodMageLightning.glb',material:'Assets/Materials/BloodMageLightning.mmat',visible:true,color:[1,1,1,1]}],position:transform.position,scale:[length,Number(Frost.bloodMageRules.lightning.DRAM.Width)/100,1],rotation:transform.rotation,materialPropertyBlock:{custom_parameter_names:['ribbon','noise'],custom_parameter_values:[[length,Number(Frost.bloodMageRules.lightning.DRAM.TexCoordScale),clock,Number(Frost.bloodMageRules.lightning.DRAM.Duration)],[Number(Frost.bloodMageRules.lightning.DRAM.NoiseScale),Number(Frost.bloodMageRules.lightning.DRAM.AvgSegLen)/100,0,0]]}};}
  function lightningRibbon(c,clock,rule,material){const age=clock-c.frame*Frost.DT;if(age<0||age>Number(rule.Duration))return null;const from=[c.fromX,c.fromY,c.fromZ],to=[c.x,c.y,c.z],delta=to.map((v,i)=>v-from[i]),length=Math.hypot(...delta);if(length<1e-8)return null;const x=delta.map(v=>v/length),look=[0,-FrostVisual.camera.height,-FrostVisual.camera.depth],cross=[x[1]*look[2]-x[2]*look[1],x[2]*look[0]-x[0]*look[2],x[0]*look[1]-x[1]*look[0]],norm=Math.hypot(...cross);if(norm<1e-8)return null;const y=cross.map(v=>v/norm),z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],transform=nodeTransform([...x,0,...y,0,...z,0,0,0,0,1],{x:(from[0]+to[0])/2,y:(from[1]+to[1])/2,z:(from[2]+to[2])/2},0,1);return {parts:[{mesh:'Assets/Models/BloodMageLightning.glb',material,visible:true,color:[1,1,1,1]}],position:transform.position,scale:[length,Number(rule.Width)/100,1],rotation:transform.rotation,materialPropertyBlock:{custom_parameter_names:['ribbon','noise'],custom_parameter_values:[[length,Number(rule.TexCoordScale),age,Number(rule.Duration)],[Number(rule.NoiseScale),Number(rule.AvgSegLen)/100,0,0]]}};}
  function chainRibbon(c,clock){const rule=Frost.farseerRules.lightning[c.primary?'CLPB':'CLSB'];return lightningRibbon(c,clock,rule,'Assets/Materials/FarseerLightning'+rule.Name+'.mmat');}
  function healingRibbons(state,clock,team){const result=[];for(const c of state.healingWaves||[]){let from={x:c.fromX,y:c.fromY,z:c.fromZ};for(const [i,to] of c.points.entries()){const rule=Frost.shadowhunterRules.lightning[i===0?'HWPB':'HWSB'];if(state.visible[team]?.[Frost.index(from.x,from.z)]&&state.visible[team]?.[Frost.index(to.x,to.z)]){const ribbon=lightningRibbon({frame:c.frame,fromX:from.x,fromY:from.y,fromZ:from.z,x:to.x,y:to.y,z:to.z},clock,rule,'Assets/Materials/ShadowHunterLightning'+rule.Name+'.mmat');if(ribbon)result.push(ribbon);}from=to;}}return result;}
  function farSight(c,clock,map){const age=clock-c.frame*Frost.DT;if(age<0||age>=(c.expires-c.frame)*Frost.DT)return null;const art=FrostEffectArt.effects.FarSight,birth=art.animations.findIndex(a=>a.name==='Birth'),stand=art.animations.findIndex(a=>a.name==='Stand'),clip=age<art.animations[birth].duration?birth:stand,seconds=clip===birth?age:(age-art.animations[birth].duration)%art.animations[stand].duration;return {component:{effect:art.effect,clip,playing:false,looping:clip===stand,speed:1,time_seconds:seconds},parts:FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(seconds*30)+'@30'),position:[c.x,Frost.elevation(map,c.x,c.z),c.z],scale:[1,1,1],rotation:[0,0,0,1]};}
  function shockwave(c,clock){const art=FrostEffectArt.effects.ShockwaveMissile,age=Math.max(0,clock-c.frame*Frost.DT),birth=art.animations.findIndex(a=>/^birth$/i.test(a.name)),stand=art.animations.findIndex(a=>/^stand$/i.test(a.name)),clip=age<art.animations[birth].duration?birth:stand,seconds=clip===birth?age:(age-art.animations[birth].duration)%art.animations[stand].duration,yaw=Math.atan2(-c.dz,c.dx);return {component:{effect:art.effect,clip,playing:false,looping:clip===stand,speed:1,time_seconds:seconds},parts:FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(seconds*30)+'@30'),position:[c.x,c.y,c.z],scale:Array(3).fill(FrostUnitScales.worldScale),rotation:[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]};}
  function reincarnation(u,clock,map,scale=1){const art=FrostEffectArt.effects.ReincarnationTarget;let clip,seconds;if(u.reincarnation){seconds=Math.max(0,clock-u.reincarnation.frame*Frost.DT);const death=art.animations.findIndex(a=>/^death$/i.test(a.name)),stand=art.animations.findIndex(a=>/^stand$/i.test(a.name));clip=seconds<art.animations[death].duration?death:stand;if(clip===stand)seconds=(seconds-art.animations[death].duration)%art.animations[stand].duration;}else if(u.taurenRebornFrame!==undefined){clip=art.animations.findIndex(a=>/^birth$/i.test(a.name));seconds=clock-u.taurenRebornFrame*Frost.DT;if(seconds<0||seconds>=art.animations[clip].duration)return null;}else return null;return {component:{effect:art.effect,clip,playing:false,looping:art.animations[clip].loop,speed:1,time_seconds:seconds},parts:FrostVisual.parts(art,art.parts[0].mesh+'#pose='+clip+':'+Math.floor(seconds*30)+'@30'),position:[u.x,Frost.elevation(map,u.x,u.z),u.z],scale:[scale,scale,scale],rotation:[0,0,0,1]};}
  return {slots,spellBindings,anchor,anchors,nodeTransform,embedded,status,spells,flames,siphonRibbon,chainRibbon,healingRibbons,farSight,shockwave,reincarnation};
})();
if(typeof module!=='undefined')module.exports=FrostEffects;
