/* Author: MiYu. Authoritative lane objectives and future-wave reinforcement for the scaled MOBA map. */
var FrostMobaObjectives = (() => {
  const lanes=[
    {towers:[[-24,-13],[-24,-1],[-24,9]],melee:[-27,19],ranged:[-27,14]},
    {towers:[[-3,3],[-8,8],[-13,13]],melee:[-18,12],ranged:[-12,18]},
    {towers:[[13,24],[1,24],[-9,24]],melee:[-19,27],ranged:[-14,27]}
  ];
  function layout(team){
    const entries=[];for(let local=0;local<3;local++){const lane=team?2-local:local,r=lanes[local];r.towers.forEach((p,i)=>entries.push({role:'tower',lane,tier:i+1,p}));for(const role of ['melee','ranged'])entries.push({role,lane,tier:0,p:r[role]});}
    for(const p of [[-21,19],[-19,22]])entries.push({role:'tower',lane:-1,tier:4,p});
    return entries.map(o=>({...o,p:team?o.p.map(v=>-v):o.p}));
  }
  function attach(s,u,role,lane=-1,tier=0){const record={id:u.id,team:u.team,role,lane,tier,alive:true};s.mobaObjectives.push(record);u.mobaObjective={role,lane,tier};}
  function setup(s,team,hall,spawn){
    s.mobaObjectives??=[];attach(s,hall,'ancient');hall.damage=0;
    for(const o of layout(team)){const u=spawn(s,o.role==='tower'?'tower':'barracks',team,...o.p,{lane:o.lane});if(!u)throw Error('MOBA objective capacity exceeded');attach(s,u,o.role,o.lane,o.tier);}
    refresh(s);
  }
  function protectedObjective(s,o){
    const alive=(role,lane,tier)=>s.mobaObjectives.some(v=>v.team===o.team&&v.role===role&&(lane===undefined||v.lane===lane)&&(tier===undefined||v.tier===tier)&&v.alive);
    if(o.role==='ancient')return alive('tower',-1,4);
    if(o.role!=='tower')return alive('tower',o.lane,3);
    if(o.tier===4)return s.mobaObjectives.filter(v=>v.team===o.team&&v.role==='tower'&&v.tier===3).every(v=>v.alive);
    return o.tier>1&&alive('tower',o.lane,o.tier-1);
  }
  function refresh(s){if(s.mobaObjectivesVersion!==1)return;const records=new Map(s.mobaObjectives.map(o=>[o.id,o]));for(const u of s.units){const o=records.get(u.id);if(o)u.mobaProtected=o.alive&&protectedObjective(s,o);}}
  function destroyed(s,u){if(s.mobaObjectivesVersion!==1||!u.mobaObjective)return;const o=s.mobaObjectives.find(o=>o.id===u.id);if(o?.alive){o.alive=false;refresh(s);}}
  function reinforcement(s,team,lane,kind){
    if(s.mobaObjectivesVersion!==1||!['creep','rangedcreep'].includes(kind))return {};
    const enemy=s.mobaObjectives.filter(o=>o.team===1-team&&['melee','ranged'].includes(o.role)),mega=enemy.length===6&&enemy.every(o=>!o.alive),role=kind==='creep'?'melee':'ranged';
    const rank=mega?2:enemy.some(o=>o.lane===lane&&o.role===role&&!o.alive)?1:0;
    return {mobaReinforcement:rank};
  }
  function validate(s){
    s.mobaObjectivesVersion??=0;
    if(![0,1].includes(s.mobaObjectivesVersion)||s.mobaObjectivesVersion===1&&s.mode!=='moba')throw Error('Invalid saved MOBA objective version');
    if(s.mobaObjectivesVersion===0){if(s.mobaObjectives!==undefined||s.units.some(u=>u.mobaObjective!==undefined||u.mobaProtected!==undefined||u.mobaReinforcement!==undefined))throw Error('Unexpected saved MOBA objective state');return;}
    if(!Array.isArray(s.mobaObjectives)||s.mobaObjectives.length!==36)throw Error('Invalid saved MOBA objectives');
    const ids=new Set();for(const team of [0,1]){
      const expected=[{role:'ancient',lane:-1,tier:0},...layout(team)];
      for(const o of s.mobaObjectives.filter(o=>o.team===team)){
        const i=expected.findIndex(v=>v.role===o.role&&v.lane===o.lane&&v.tier===o.tier);
        if(i<0||Object.keys(o).some(k=>!['id','team','role','lane','tier','alive'].includes(k))||!Number.isSafeInteger(o.id)||o.id<1||o.id>s.serial||ids.has(o.id)||typeof o.alive!=='boolean')throw Error('Invalid saved MOBA objective record');
        if(!o.alive&&protectedObjective(s,o))throw Error('Destroyed protected MOBA objective');
        expected.splice(i,1);ids.add(o.id);const u=s.units.find(u=>u.id===o.id);
        if(o.alive&&!u||u&&(u.team!==team||u.kind!==(o.role==='ancient'?'hall':o.role==='tower'?'tower':'barracks')||(u.hp>0)!==o.alive||!u.mobaObjective||Object.keys(u.mobaObjective).length!==3||['role','lane','tier'].some(k=>u.mobaObjective[k]!==o[k])||u.mobaProtected!==(o.alive&&protectedObjective(s,o))))throw Error('Inconsistent saved MOBA objective');
      }
      if(expected.length)throw Error('Missing saved MOBA objective');
    }
    for(const u of s.units){
      if((u.mobaObjective!==undefined||u.mobaProtected!==undefined)&&!ids.has(u.id))throw Error('Unexpected saved MOBA objective unit');
      if(u.mobaReinforcement!==undefined&&(!['creep','rangedcreep'].includes(u.kind)||![0,1,2].includes(u.mobaReinforcement)||![0,1,2].includes(u.lane)||![0,1].includes(u.team)))throw Error('Invalid saved MOBA reinforcement');
    }
  }
  function label(u){const o=u?.mobaObjective;return !o?'':o.role==='ancient'?'远古遗迹':o.role==='tower'?'T'+o.tier+' 防御塔':o.role==='melee'?'近战兵营':'远程兵营';}
  function status(s,team){if(s.mobaObjectivesVersion!==1)return '';const own=s.mobaObjectives.filter(o=>o.team===team);return '防御塔 '+own.filter(o=>o.role==='tower'&&o.alive).length+'/11 · 兵营 '+own.filter(o=>['melee','ranged'].includes(o.role)&&o.alive).length+'/6';}
  function model(u){const o=u?.mobaObjective;if(!o)return null;return o.role==='ancient'?(u.team===0?'WildwoodHall':'RevenantHall'):o.role==='tower'?(u.team===0?'WildwoodTower':'RevenantSpiritTower'):o.role==='melee'?(u.team===0?'WildwoodBarracks':'RevenantBarracks'):(u.team===0?'WildwoodWorkshop':'RealTemple');}
  return {layout,setup,destroyed,reinforcement,validate,label,status,model};
})();
if(typeof module!=='undefined')module.exports=FrostMobaObjectives;
