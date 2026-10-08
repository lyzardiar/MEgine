// Author: MiYu. Original elf.ai strategy with deterministic, paid MEngine native adapters.
var FrostNightAI=(()=>{
  const source=typeof module!=='undefined'?require('./night-elf-ai-source.js'):FrostNightAISource;
  const kinds={ewsp:'worker',earc:'nightarcher',esen:'nighthuntress',ebal:'glaivethrower',edoc:'druidclaw',edcm:'druidbear',edot:'druidtalon',edtm:'druidcrow',edry:'dryad',echm:'chimaera',emtg:'mountaingiant',efdr:'faeriedragon',ehip:'hippogryph',ehpr:'hippogryphrider',eaoe:'ancientlore',eaom:'barracks',eaow:'ancientwind',edos:'chimaeraroost',etrp:'tower',eate:'altar',edob:'workshop',emow:'farm',egol:'entangledmine',eden:'shop'};
  const halls={etol:1,etoa:2,etoe:3},aliases={etol:['etoa','etoe'],etoa:['etoe'],edoc:['edcm'],edot:['edtm']};
  const allowedIds=new Set([...Object.keys(kinds),...Object.keys(halls),...Object.values(source.constants).filter(v=>typeof v==='string'), 'hero:0','hero:1','hero:2','hero:3']);
  const isHero=id=>/^hero:\d$/.test(id),heroClass=id=>Number(id.slice(5));
  const enabled=(s,t)=>s.nightAiVersion===1&&s.mode==='skirmish'&&s.teams[t].ai&&s.teams[t].faction===2;
  function create(s,t,difficulty=2){
    const first=s.teams[t].heroClass,ids=[first,...[0,1,2,3].filter(i=>i!==first)].slice(0,3);
    return {difficulty,vars:{...source.defaults,hero_id:'hero:'+ids[0],hero_id2:'hero:'+ids[1],hero_id3:'hero:'+ids[2]},plan:[],nextVars:0,nextPlan:0,nextBuild:0,rng:(123456789+t*101)>>>0};
  }
  function validate(s){
    if(![0,1].includes(s.nightAiVersion))throw Error('Invalid saved Night Elf AI version');
    if(s.nightAiVersion===0){if(s.nightAI!==undefined)throw Error('Unexpected saved Night Elf AI state');return;}
    if(!Array.isArray(s.nightAI)||s.nightAI.length!==2)throw Error('Missing saved Night Elf AI state');
    for(let t=0;t<2;t++){
      const a=s.nightAI[t];if(!enabled(s,t)){if(a!==null)throw Error('Unexpected saved Night Elf AI player');continue;}
      if(!a||Object.keys(a).sort().join(',')!=='difficulty,nextBuild,nextPlan,nextVars,plan,rng,vars'||![1,2,3].includes(a.difficulty)||!Number.isSafeInteger(a.rng)||a.rng<0||a.rng>4294967295||['nextVars','nextPlan','nextBuild'].some(k=>!Number.isSafeInteger(a[k])||a[k]<0||a[k]>s.frame+30))throw Error('Invalid saved Night Elf AI clock');
      const g=a.vars,keys=[...Object.keys(source.defaults),'hero_id','hero_id2','hero_id3'];
      if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).length!==keys.length||Object.entries(source.defaults).some(([k,v])=>typeof v==='boolean'?typeof g[k]!=='boolean':!Number.isSafeInteger(g[k])||g[k]<0||g[k]>1000000000)||['hero_id','hero_id2','hero_id3'].some(k=>!isHero(g[k]||'')||heroClass(g[k])>=4)||new Set([g.hero_id,g.hero_id2,g.hero_id3]).size!==3)throw Error('Invalid saved Night Elf AI source variables');
      if(!Array.isArray(a.plan)||a.plan.length>150||a.plan.some(p=>!p||Object.keys(p).sort().join(',')!=='id,qty,town,type'||!['unit','research','expand'].includes(p.type)||!allowedIds.has(p.id)||!Number.isInteger(p.qty)||p.qty<1||p.qty>160||!Number.isInteger(p.town)||p.town< -1||p.town>2))throw Error('Invalid saved Night Elf AI plan');
    }
  }
  function environment(S,s,t,a){
    const own=()=>s.units.filter(u=>u.team===t&&u.hp>0&&!u.consumed);
    const matches=(u,id)=>isHero(id)?u.kind==='hero'&&u.heroClass===heroClass(id):halls[id]?u.kind==='hall'&&(u.baseUpgrade?.tier??u.upgradeTier)===halls[id]:u.kind===kinds[id];
    // Native contract: live unfinished units and paid production queues count; completed excludes both.
    const count=(id,done=false,town=-1)=>own().filter(u=>matches(u,id)&&(!done||u.built===1&&!u.baseUpgrade)&&inTown(u,town)).length+(done?0:own().reduce((n,u)=>n+(inTown(u,town)?u.queue.filter(q=>q.kind&&(isHero(id)?q.kind==='hero'&&q.heroClass===heroClass(id):q.kind===kinds[id])).length:0),0));
    const towns=()=>own().filter(u=>u.kind==='hall').sort((x,y)=>S.distance(x,{x:s.map.spawns[t][0],z:s.map.spawns[t][1]})-S.distance(y,{x:s.map.spawns[t][0],z:s.map.spawns[t][1]})||x.id-y.id);
    function inTown(u,town){if(town<0)return true;const bases=towns();return bases[town]&&bases.reduce((best,b,i)=>S.distance(u,b)<S.distance(u,bases[best])?i:best,0)===town;}
    const townCount=(id,done=false,town=-1)=>count(id,done,town)+(aliases[id]||[]).reduce((n,other)=>n+count(other,false,town),0);
    const rank=id=>s.teams[t].giantResearch[id]??s.teams[t].druidResearch[id]??s.teams[t].nightResearch[id]??({Resi:s.teams[t].abolishMagic,Recb:s.teams[t].corrosiveBreath,Reht:s.teams[t].hippogryphTaming,Renb:s.teams[t].naturesBlessing}[id]||0);
    const add=(type,qty,id,town=-1)=>{if(qty>0)a.plan.push({type,qty,id,town});};
    const native={GetUpgradeLevel:rank,GetUnitCount:id=>count(id),GetUnitCountDone:id=>count(id,true),TownCount:id=>townCount(id),TownCountDone:id=>townCount(id,true),GetFoodMade:id=>id==='etol'?10:id==='emow'?10:0,FoodUsed:()=>S.population(s,t).used,GetGold:()=>Math.trunc(s.teams[t].gold),GetWood:()=>Math.trunc(s.teams[t].wood),GetGoldOwned:()=>Math.trunc(own().filter(u=>u.kind==='entangledmine').reduce((n,u)=>n+(s.resources[u.mineResource]?.amount||0),0)),GetMinesOwned:()=>own().filter(u=>u.kind==='entangledmine').length,MeleeDifficulty:()=>a.difficulty,InitBuildArray:()=>{a.plan=[];},SetBuildUnit:(qty,id)=>add('unit',qty,id),SetBuildNext:(qty,id)=>{if(count(id)<qty)add('unit',count(id,true)+1,id);},SetBuildUpgr:(qty,id)=>{if(a.difficulty!==1||qty===1)add('research',qty,id);},BasicExpansion:(build,id)=>{if(build&&count(id)===count(id,true))add('expand',townCount(id)+1,id);},BuildFactory:id=>add('unit',s.teams[t].gold>1000&&s.teams[t].wood>500?2:1,id),GuardSecondary:(town,qty,id)=>{const b=towns()[town];if(b&&own().some(u=>u.kind==='entangledmine'&&inTown(u,town)))add('unit',qty,id,town);},MeleeTownHall:(town,id)=>{if(!towns()[town]&&s.resources.filter(r=>r.kind==='mine'&&r.amount>0).sort((x,y)=>S.distance(x,{x:s.map.spawns[t][0],z:s.map.spawns[t][1]})-S.distance(y,{x:s.map.spawns[t][0],z:s.map.spawns[t][1]}))[town])add('expand',town+1,id);},GetZeppelin:()=>{}};
    return {own,count,townCount,towns,inTown,rank,native};
  }
  function building(S,s,t,env,kind,center){
    const workers=env.own().filter(u=>u.kind==='worker'&&!u.inside&&!u.stun&&!u.cyclone&&!u.sanctuary&&!['construct','repair'].includes(u.order?.type)).sort((x,y)=>S.distance(x,center)-S.distance(y,center)||x.id-y.id);
    for(const w of workers){
      const radius=S.types[kind].radius;
      const points=[];for(const r of [5,8,11,14,17,20,23,26])for(let i=0;i<16;i++){const angle=i*Math.PI/8;points.push({x:S.clamp(center.x+Math.cos(angle)*r,-27,27),z:S.clamp(center.z+Math.sin(angle)*r,-27,27)});}
      for(let i=0;i<16;i++){const angle=i*Math.PI/8;points.push({x:w.x+Math.cos(angle)*(radius+.8),z:w.z+Math.sin(angle)*(radius+.8)});}
      for(const {x,z} of points){
        // Start construction from a reachable approach; never strand a paid footprint behind obstacles.
        if(Math.abs(x)>27||Math.abs(z)>27||S.distance({x,z},center)>30||S.distance(w,{x,z})>15||!S.buildingSite(s,x,z,S.buildingType(s,kind,t).radius,t))continue;
        if(S.distance(w,{x,z})>radius+1.1||!S.traversable(s.map,w.x,w.z,x,z)||!S.obstacleClear(s,w.x,w.z,x,z,0,t)){
          const probe={...s,serial:s.serial+1,units:[...s.units,{id:s.serial+1,kind,team:t,x,z,hp:1,built:.01,queue:[]}]},route=S.path(probe,w,x,z),last=route.at(-1);
          if(!last||Math.hypot(last[0]-x,last[1]-z)>radius+1.1)continue;
        }
        if(S.command(s,t,{type:'build',ids:[w.id],kind,x,z})===null)return true;
      }
    }
    return false;
  }
  function cost(S,s,t,id){
    if(isHero(id)){const dead=S.heroRoster(s,t).find(h=>h.heroClass===heroClass(id)&&h.hp<=0);return dead?S.heroRevival(dead):S.heroRecruitment(s,t);}
    if(id==='etoa'||id==='etoe')return S.mainBaseTypes[2][halls[id]-1];
    const kind=id==='etol'?'hall':kinds[id];return kind?(S.types[kind].speed?S.trainType(s,kind,t):S.buildingType(s,kind,t)):null;
  }
  function produce(S,s,t,env,p,qty){
    if(halls[p.id]&&p.id!=='etol'){
      const base=env.own().find(u=>u.kind==='hall'&&u.built===1&&!u.baseUpgrade&&u.upgradeTier===halls[p.id]-1);
      return !!base&&S.command(s,t,{type:'tech',ids:[base.id]})===null;
    }
    const kind=isHero(p.id)?'hero':p.id==='etol'?'hall':kinds[p.id];if(!kind)return false;
    if(!S.types[kind].speed){const base=env.towns()[p.town<0?0:p.town],center=base||{x:s.map.spawns[t][0],z:s.map.spawns[t][1]};return building(S,s,t,env,kind,center);}
    let produced=0;
    for(const b of env.own().filter(u=>u.built===1&&S.trainable(s,u).includes(kind)&&env.inTown(u,p.town)).sort((x,y)=>x.queue.length-y.queue.length||x.id-y.id)){
      while(produced<qty&&b.queue.length<3){
        const dead=isHero(p.id)&&S.heroRoster(s,t).find(h=>h.heroClass===heroClass(p.id)&&h.hp<=0),cmd=dead?{type:'revive',ids:[b.id],target:dead.id}:{type:'train',ids:[b.id],kind,...(isHero(p.id)?{heroClass:heroClass(p.id)}:{})};
        if(S.command(s,t,cmd)!==null)break;produced++;
      }
    }
    return produced>0;
  }
  function research(S,s,t,env,id){
    for(const b of env.own().filter(u=>u.built===1)){
      const options=[['giantResearch',()=>S.giantResearchOption(s,b,id)],['druidResearch',()=>S.druidResearchOption(s,b,id)],['nightResearch',()=>S.nightResearchOption(s,b,id)],...({Resi:[['dryadResearch',()=>S.dryadResearchOption(s,b)]],Recb:[['chimaeraResearch',()=>S.corrosiveOption(s,b)]],Reht:[['hippogryphResearch',()=>S.tamingOption(s,b)]]}[id]||[])];
      for(const [type,get] of options){const r=get();if(r?.enabled)return {b,r,type};}
    }
    return null;
  }
  function expansion(S,s,t,env,p,budget){
    if(env.townCount(p.id)>=p.qty)return true;
    const base=env.towns()[0]||{x:s.map.spawns[t][0],z:s.map.spawns[t][1]},mine=s.resources.filter(r=>r.kind==='mine'&&r.amount>0&&!S.entangledMine(s,r)&&!S.hauntedMine(s,r)&&!s.units.some(u=>u.hp>0&&u.kind==='hall'&&S.distance(u,r)<11)).sort((x,y)=>S.distance(x,base)-S.distance(y,base))[0];
    if(!mine)return true;
    const price=cost(S,s,t,p.id);if(budget.gold<price.gold)return false;budget.gold-=price.gold;
    const worker=env.own().find(u=>u.kind==='worker'&&!u.inside&&!['construct','repair'].includes(u.order?.type));if(!worker)return true;
    // Navigation adapter: scout distant expansion before the paid build command can reach it.
    if(S.distance(worker,mine)>12){if(!worker.order||worker.order.type==='gather')S.command(s,t,{type:'move',ids:[worker.id],x:mine.x,z:mine.z});return true;}
    building(S,s,t,env,'hall',mine);return true;
  }
  function execute(S,s,t,a,env){
    const budget={gold:s.teams[t].gold,wood:s.teams[t].wood};
    for(const p of a.plan){
      if(p.type==='research'){
        if(env.rank(p.id)>=p.qty)continue;const o=research(S,s,t,env,p.id);
        if(o&&budget.gold>=o.r.gold&&budget.wood>=o.r.wood)S.command(s,t,{type:o.type,ids:[o.b.id],upgrade:p.id});
        continue;
      }
      if(p.type==='expand'){if(!expansion(S,s,t,env,p,budget))return;continue;}
      const need=p.qty-env.townCount(p.id,false,p.town);if(need<=0)continue;
      const r=cost(S,s,t,p.id);if(!r)return;
      const qty=Math.min(need,r.gold?Math.trunc(budget.gold/r.gold):need,r.wood?Math.trunc(budget.wood/r.wood):need);if(qty<1)return;
      budget.gold=Math.max(0,budget.gold-r.gold*need);budget.wood=Math.max(0,budget.wood-r.wood*need);
      if(!produce(S,s,t,env,p,qty))return;
    }
  }
  function harvest(S,s,t,env){
    const own=env.own(),mines=own.filter(u=>u.kind==='entangledmine'&&u.built===1&&s.resources[u.mineResource]?.amount>0).sort((x,y)=>x.id-y.id);
    const available=own.filter(u=>u.kind==='worker'&&!u.stun&&!u.cyclone&&!u.sanctuary&&(!u.order||u.order.type==='gather'));
    const assigned=b=>own.filter(u=>u.kind==='worker'&&u.order?.type==='gather'&&u.order.resource===b.mineResource).length;
    for(let i=0;i<mines.length;i++){
      const b=mines[i],target=Math.min(5,Math.max(0,available.length-(i===0?1:8+(i-1)*5)));
      while(assigned(b)>target){
        const w=available.filter(u=>u.order?.type==='gather'&&u.order.resource===b.mineResource).sort((x,y)=>Number(!!x.inside)-Number(!!y.inside)||y.id-x.id)[0];
        if(!w||S.command(s,t,w.inside?{type:'unloadWisps',ids:[b.id],target:w.id}:{type:'stop',ids:[w.id]})!==null)break;
      }
      while(assigned(b)<target){
        const w=available.filter(u=>!u.inside&&(!u.order||s.resources[u.order.resource]?.kind==='tree')).sort((x,y)=>S.distance(x,b)-S.distance(y,b)||x.id-y.id)[0];
        if(!w||S.command(s,t,{type:'gather',ids:[w.id],resource:b.mineResource})!==null)break;
      }
    }
    const workers=available.filter(u=>!u.inside&&!u.order);
    // Source assignment order: 4 gold, 1 wood, 1 gold, 2 wood, second mine 5 gold, remaining wood.
    for(const w of workers){
      const miners=b=>own.filter(u=>u.kind==='worker'&&u.order?.type==='gather'&&u.order.resource===b.mineResource).length;
      const lumber=own.filter(u=>u.kind==='worker'&&u.order?.type==='gather'&&s.resources[u.order.resource]?.kind==='tree').length;
      const mine=mines[0]&&(miners(mines[0])<4||lumber>=1&&miners(mines[0])<5)?mines[0]:lumber>=3&&mines.find(b=>miners(b)<5);
      const trees=s.resources.map((r,i)=>({r,i,used:own.filter(u=>u.order?.type==='gather'&&u.order.resource===i).length})).filter(v=>v.r.kind==='tree'&&v.r.amount>0&&S.canGather(s,w,v.r)).sort((x,y)=>x.used-y.used||S.distance(w,x.r)-S.distance(w,y.r)||x.i-y.i);
      const ri=mine?.mineResource??trees[0]?.i;if(ri!==undefined)S.command(s,t,{type:'gather',ids:[w.id],resource:ri});
    }
  }
  function step(S,s,t){
    const a=s.nightAI[t],env=environment(S,s,t,a);
    if(s.frame>=a.nextVars){source.init_vars(a.vars,env.native);a.nextVars=s.frame+10;}
    if(s.frame>=a.nextPlan){harvest(S,s,t,env);source.build_sequence(a.vars,env.native);a.rng=(Math.imul(a.rng,1664525)+1013904223)>>>0;a.nextPlan=s.frame+(1+a.rng%3)*10;}
    if(s.frame>=a.nextBuild){
      const pending=env.own().find(u=>u.built<1&&u.construction&&!u.construction.started&&!env.own().some(w=>w.order?.type==='construct'&&w.order.target===u.id)),worker=env.own().find(u=>u.kind==='worker'&&!u.inside&&!['construct','repair','move'].includes(u.order?.type));
      if(pending&&worker)S.command(s,t,{type:'construct',ids:[worker.id],target:pending.id});else execute(S,s,t,a,env);
      a.nextBuild=s.frame+20;
    }
    // Captain adapter uses existing attack-move navigation, gated by source opening troop counts.
    const g=a.vars;if(g.c_hero1_done>0&&g.c_archer_done>=(g.wave?4:2)&&s.frame%40===0){const foe=s.map.spawns[1-t],army=env.own().filter(u=>S.types[u.kind].speed&&u.kind!=='worker'&&!u.order);if(army.length){for(const u of army)S.command(s,t,{type:'attackMove',ids:[u.id],x:foe[0],z:foe[1]});g.wave++;}}
  }
  return {source,kinds,halls,enabled,create,validate,environment,cost,execute,step};
})();
if(typeof module!=='undefined')module.exports=FrostNightAI;
