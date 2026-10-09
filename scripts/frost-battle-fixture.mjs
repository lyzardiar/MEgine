// Author: MiYu. Explicit authored actors for battle tests; default melee opening is tested separately.
export function setTechnology(S,s,team,tier){const bases=s.units.filter(u=>u.team===team&&u.kind==='hall'&&u.built===1&&u.hp>0);if(!bases.length)throw Error('Technology fixture requires a completed main base');for(const u of bases)u.upgradeTier=tier;S.updateTechnology(s);}
export function battleFixture(S,mode='skirmish',options={},actors=[]){
 const map=S.clone(options.map||S.defaultMap(mode));if(map.mode!=='skirmish')return S.create(mode,options);
 const placed=[];for(let team=0;team<2;team++){
  const [x,z]=map.spawns[team],faction=options.factions?.[team]??map.players[team].faction,heroClass=options.heroes?.[team]??map.players[team].heroClass??0;
  if(actors.includes('barracks'))placed.push({kind:'barracks',team,x:x+(team?-6:6),z:z+(team?-5:5)});
  if(actors.includes('farm'))placed.push({kind:'farm',team,x:S.clamp(x+(team?5:-5),-27,27),z});
  if(actors.includes('hero'))placed.push({kind:'hero',heroClass,team,x:x+(team?-4:4),z:z+(faction===3?(team?5:-5):(team?2:-2))});
  if(actors.includes('guard')&&faction!==3)placed.push({kind:S.armies[faction].units[0],team,x,z:z+(team?6:-6)});
 }
 for(const u of placed){u.x=S.clamp(u.x,-27,27);u.z=S.clamp(u.z,-27,27);}map.units=[...placed,...map.units];map.startingWood=250;const s=S.create(mode,{taurenVersion:0,farseerVersion:0,blademasterVersion:0,mountainKingVersion:0,paladinVersion:0,archmageVersion:0,bloodMageVersion:0,...options,map});
 if(actors.includes('harvest'))for(let team=0;team<2;team++){let i=0;for(const u of s.units.filter(u=>u.team===team&&['worker','ghoul'].includes(u.kind))){const kind=u.kind==='ghoul'?'tree':s.teams[team].faction===3?'mine':i++<2?'mine':'tree',resource=s.resources.findIndex(r=>r.kind===kind&&S.distance(r,u)<14);if(resource>=0)S.command(s,team,{type:'gather',ids:[u.id],resource});}}
 return s;
}
