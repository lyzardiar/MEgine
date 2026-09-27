/* Author: MiYu. Validated solo saves, deterministic command replays and campaign maps. */
var FrostSession=(()=>{
  const S=typeof module!=='undefined'?require('./simulation.js'):Frost;
  const finite=(v,min=0,max=1e9)=>Number.isFinite(v)&&v>=min&&v<=max;
  const point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v,-40,40));
  function restore(raw){
    if(!raw||raw.version!==1||!Number.isSafeInteger(raw.frame)||!finite(raw.frame,0,1e7)||!Number.isSafeInteger(raw.serial)||!Array.isArray(raw.units)||raw.units.length>S.LIMIT||!Array.isArray(raw.teams)||raw.teams.length!==2||![null,0,1].includes(raw.winner))throw Error('Invalid saved match');
    const s=S.clone(raw);s.map=S.validateMap(s.map);if(s.mode!==s.map.mode)throw Error('Saved map mode mismatch');
    if(s.teams.some(t=>!t||!['gold','wood','upgrade','kills','faction'].every(k=>finite(t[k]))||!Number.isInteger(t.faction)||t.faction>3||typeof t.ai!=='boolean'))throw Error('Invalid saved teams');
    const ids=new Set();for(const u of s.units){
      if(!u||!Object.hasOwn(S.types,u.kind)||![-1,0,1].includes(u.team)||!Number.isSafeInteger(u.id)||u.id<1||u.id>s.serial||ids.has(u.id)||!point([u.x,u.z])||!['hp','maxHp','damage','speed','cd','built','level','xp','mana','cargo','respawn'].every(k=>finite(u[k]))||u.maxHp<=0||u.built>1||u.level<1||u.level>10)throw Error('Invalid saved unit');
      if(!Array.isArray(u.spell)||u.spell.length!==4||u.spell.some(v=>!finite(v))||!Array.isArray(u.inventory)||u.inventory.length>6||u.inventory.some(v=>!Number.isInteger(v)||!S.items[v])||!Array.isArray(u.queue)||u.queue.length>3||u.queue.some(q=>!q||!Object.hasOwn(S.types,q.kind)||!finite(q.left,-1,100)))throw Error('Invalid saved inventory or production');
      if(u.route&&(!Array.isArray(u.route)||u.route.length>64||!u.route.every(point)||!Number.isInteger(u.waypoint)||u.waypoint<0||u.waypoint>u.route.length))throw Error('Invalid saved route');
      if(u.td!==undefined&&(typeof u.td!=='boolean'||(u.td&&(s.mode!=='td'||!Array.isArray(u.route)||!u.route.length))))throw Error('Invalid tower defense unit');
      if(u.home&&!point(u.home))throw Error('Invalid saved camp');
      if(u.order&&(!['move','attackMove','attack','gather'].includes(u.order.type)||(['move','attackMove'].includes(u.order.type)&&!point([u.order.x,u.order.z]))||(u.order.type==='attack'&&!Number.isInteger(u.order.target))||(u.order.type==='gather'&&!Number.isInteger(u.order.resource))))throw Error('Invalid saved order');
      ids.add(u.id);u.path=[];u.pathAt=-100;delete u.dest;
    }
    if(!Array.isArray(s.resources)||s.resources.length!==s.map.props.length||s.resources.some((r,i)=>!r||r.kind!==s.map.props[i].kind||r.x!==s.map.props[i].x||r.z!==s.map.props[i].z||!finite(r.amount,0,10000)))throw Error('Invalid saved resources');
    if(!['wave','nextWave','lives'].every(k=>finite(s[k])))throw Error('Invalid saved wave');
    if(!Array.isArray(s.explored)||s.explored.length!==2||s.explored.some(v=>!Array.isArray(v)||v.length!==1024||v.some(x=>x!==0&&x!==1)))throw Error('Invalid explored terrain');
    if(s.fired!==undefined&&(!Array.isArray(s.fired)||s.fired.some(i=>!Number.isInteger(i)||i<0||i>=s.map.triggers.length)))throw Error('Invalid saved triggers');
    s.fired??=[];s.events=[];s.visible=[[],[]];S.visibility(s);return s;
  }
  function recording(state){return {version:1,rules:1,initial:S.clone(state),orders:[],endFrame:state.frame};}
  function append(log,frame,team,command){if(log.orders.length>=1400)return false;log.orders.push({frame,team,command:S.clone(command)});return true;}
  function replay(raw){
    if(!raw||raw.version!==1||raw.rules!==1||!Array.isArray(raw.orders)||raw.orders.length>1400||!Number.isSafeInteger(raw.endFrame))throw Error('Invalid replay');
    const log=S.clone(raw),state=restore(log.initial);if(log.endFrame<state.frame||log.endFrame-state.frame>72000)throw Error('Replay duration exceeds two hours');
    let frame=state.frame;for(const o of log.orders){if(!o||!Number.isSafeInteger(o.frame)||o.frame<frame||o.frame>log.endFrame||![0,1].includes(o.team)||!o.command||typeof o.command!=='object')throw Error('Invalid replay order');frame=o.frame;}
    // Keep the exact validated path state so recordings started from a loaded match reproduce movement.
    for(let i=0;i<state.units.length;i++){const u=log.initial.units[i];if(!Array.isArray(u.path)||u.path.length>1024||!u.path.every(point)||!finite(u.pathAt,-100,1e7)||(u.dest&&!point(u.dest)))throw Error('Invalid replay path');state.units[i].path=u.path;state.units[i].pathAt=u.pathAt;if(u.dest)state.units[i].dest=u.dest;}
    return {log,state,cursor:0,finished:false};
  }
  function advance(player){
    if(player.finished)return;const s=player.state;
    while(player.cursor<player.log.orders.length&&player.log.orders[player.cursor].frame===s.frame){const o=player.log.orders[player.cursor++];S.command(s,o.team,o.command);}
    if(s.frame>=player.log.endFrame||s.winner!==null){player.finished=true;return;}S.tick(s);
  }
  const chapters=[
    {name:'I / Winterfall Landing',objective:'Raise your treasury to 900 gold. Workers can gather while your hero defends.',gold:500,ai:false,triggers:[{event:'gold',threshold:900,action:'victory',team:0,value:1,x:0,z:0,text:'Winterfall is supplied. The northern pass is open.'}]},
    {name:'II / Hold the Northern Pass',objective:'Protect your stronghold for 180 seconds. Reinforcements arrive from the east.',gold:1000,ai:true,triggers:[30,65,100,135].map((n,i)=>({event:'time',threshold:n,action:'spawn',team:1,value:3+i,x:15,z:-15,text:'An enemy warband has entered the pass.'})).concat([{event:'time',threshold:180,action:'victory',team:0,value:1,x:0,z:0,text:'The pass has held. March on the citadel.'}])},
    {name:'III / The Frozen Citadel',objective:'Destroy the rival stronghold. Use your army, hero and weapon research.',gold:1200,ai:true,triggers:[{event:'time',threshold:90,action:'spawn',team:1,value:8,x:15,z:-15,text:'The citadel guard has joined the battle.'}]}
  ];
  function campaign(index){const chapter=chapters[index];if(!chapter)throw Error('Unknown chapter');const map=S.defaultMap();map.name=chapter.name;map.objective=chapter.objective;map.startingGold=chapter.gold;map.triggers=S.clone(chapter.triggers);return {map,ai:[false,chapter.ai]};}
  return {restore,recording,append,replay,advance,chapters,campaign};
})();
if(typeof module!=='undefined')module.exports=FrostSession;
