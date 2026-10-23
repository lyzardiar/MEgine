// Author: MiYu. Execute the original unit creation entry with explicit unit and trigger handles.
var FrostWarcraftUnitInitialization=(()=>{
  function run(source){
    if(source===null)throw Error('Original JASS encoding or size is unsupported');
    const program=FrostWarcraftJass.parse(source),units=[],triggers=[],unitHandles=new Set(),triggerHandles=new Set(),players=Array.from({length:16},(_,id)=>Object.freeze({id})),colors=Array.from({length:16},(_,id)=>Object.freeze({id})),natives=Object.create(null);
    const constants={PLAYER_NEUTRAL_AGGRESSIVE:{type:'integer',value:12},PLAYER_NEUTRAL_PASSIVE:{type:'integer',value:15}};
    for(const [type,names] of [['unitstate',['LIFE','MAX_LIFE','MANA','MAX_MANA']],['unitevent',['DEATH','CHANGE_OWNER']]])for(const name of names){const symbol=(type==='unitstate'?'UNIT_STATE_':'EVENT_UNIT_')+name;constants[symbol]={type,value:Object.freeze({name})};}
    const bind=(name,parameters,returns,call)=>{natives[name]={parameters,returns,call};};
    const unit=u=>{if(!unitHandles.has(u))throw Error('Invalid initialization unit handle');return u;};
    const trigger=t=>{if(!triggerHandles.has(t))throw Error('Invalid initialization trigger handle');return t;};
    const finite=n=>{if(!Number.isFinite(n))throw Error('Non-finite initialization coordinate');return n;};
    bind('Player',['integer'],'player',id=>{if(!players[id])throw Error('Invalid player ID');return players[id];});
    bind('ConvertPlayerColor',['integer'],'playercolor',id=>{if(!colors[id])throw Error('Invalid player color');return colors[id];});
    bind('CreateUnit',['player','integer','real','real','real'],'unit',(player,typeId,x,y,facing)=>{
      if(!players.includes(player))throw Error('Invalid initialization player handle');
      const u={id:units.length+1,typeId:Array.from({length:4},(_,i)=>String.fromCharCode(typeId>>>(24-i*8)&255)).join(''),player:player.id,sourcePosition:[finite(x),finite(y)],facing:finite(facing),color:player.id,states:{},resourceAmount:null,acquireRange:null};units.push(u);unitHandles.add(u);return u;
    });
    bind('SetResourceAmount',['unit','integer'],'nothing',(u,amount)=>{unit(u).resourceAmount=amount;});
    bind('SetUnitAcquireRange',['unit','real'],'nothing',(u,range)=>{unit(u).acquireRange=finite(range);});
    bind('SetUnitColor',['unit','playercolor'],'nothing',(u,color)=>{if(!colors.includes(color))throw Error('Invalid initialization color handle');unit(u).color=color.id;});
    bind('SetUnitState',['unit','unitstate','real'],'nothing',(u,state,amount)=>{if(!Object.values(constants).some(c=>c.type==='unitstate'&&c.value===state))throw Error('Invalid unit state handle');unit(u).states[state.name]=finite(amount);});
    bind('CreateTrigger',[],'trigger',()=>{const t={id:triggers.length+1,events:[],actions:[]};triggers.push(t);triggerHandles.add(t);return t;});
    bind('TriggerRegisterUnitEvent',['trigger','unit','unitevent'],'event',(t,u,event)=>{
      if(!Object.values(constants).some(c=>c.type==='unitevent'&&c.value===event))throw Error('Invalid unit event handle');
      const registration={unit:unit(u).id,event:event.name};trigger(t).events.push(registration);return registration;
    });
    bind('TriggerAddAction',['trigger','code'],'triggeraction',(t,action)=>{trigger(t).actions.push(action.functionName);return Object.freeze({trigger:t.id,action:action.functionName});});
    const vm=FrostWarcraftJass.create(program,{natives,constants});vm.run('CreateAllUnits');
    return {entry:'CreateAllUnits',units,triggers,instructions:100000-vm.instructionsRemaining};
  }
  function initialize(source){try{return {status:'ready',...run(source)};}catch(error){return {status:'unsupported',error:error.message,units:[],triggers:[]};}}
  return {run,initialize};
})();
if(typeof module!=='undefined')module.exports=FrostWarcraftUnitInitialization;
