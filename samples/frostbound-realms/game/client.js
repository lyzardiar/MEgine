/* Author: MiYu. Native RTS controls, presentation, map editor and TCP client. */
var FrostClient=(()=>{
  const S=Frost,hidden=[0,-100,0],pitch=-Math.atan2(42,32),sin=-Math.sin(pitch);
  let entities={},authored={},sent={},initialized=false,mode='title',state=null,team=0,faction=0,heroClass=0,heroPanel='skills',selected=[],groups={},camera=[0,0],zoom=27,time=0,accumulator=0,notice='',noticeUntil=0,drag=null,armed=null,paused=false,actions=[],renderAt=0,lastFrame=-1,fx=[],fxSerial=0,lastBattleSound=0,commandMarker=null,damageText=[];
  let editMap=S.defaultMap(),brush=0,undo=[],paintCell=-1,slot=1,returnEditor=false,online=false,address='127.0.0.1:7788',edit='',intent='',connected=false,code='',token='',room=null,rooms=[],roomIndex=0,seq=0,lastReceive=0,reconnectUntil=0,retry=0,netStates=0;
  const previous={},visibility={},modelNames={},active={},tileState=[];
  let editorPage=0,placeKind='soldier',placeHeroClass=0,placeTeam=0,placeTag='',triggerWhen='enter',triggerAction='spawn',triggerValue=10;
  function set(n,c,v){const e=entities[n];if(!e)return;const json=JSON.stringify(v),key=n+'/'+c;if(sent[key]===json)return;sent[key]=json;engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:c,value:v}));}
  function activate(n,on){const e=entities[n];if(!e||active[n]===on)return;active[n]=on;engine.setActive(e.entity,on);}
  function transform(n,position,scale=[1,1,1],rotation=[0,0,0,1]){activate(n,position!==hidden);if(position!==hidden)set(n,'Transform',{position,scale,rotation});}
  function label(n,text,color){if(authored[n]?.Text)set(n,'Text',{...authored[n].Text,text,...(color?{color}:{})});}
  function show(n,on){if(visibility[n]===on)return;visibility[n]=on;activate(n,on);const a=authored[n]?.RectTransform;if(a&&on)set(n,'RectTransform',{...a,anchored_position:a.anchored_position});}
  function message(text){notice=text;noticeUntil=time+5;}
  function sound(n){if(entities['Sound '+n])engine.playAudio(entities['Sound '+n].entity);}
  function init(){for(const e of engine.snapshot.entities)if(e.name){entities[e.name]=e;authored[e.name]=e.components;}activate('Frost telemetry',false);state=S.create();initialized=true;}
  function persist(key,value){try{engine.storage.save(key,value);message('Saved '+key+' to your project user-data folder');return true;}catch(e){message('Save failed: '+e.message);return false;}}
  function load(key){try{return engine.storage.load(key);}catch(e){message('Load failed: '+e.message);return null;}}
  function stopNetwork(){if(connected)engine.network.send({type:'leave'});engine.network.close();online=false;connected=false;room=null;code='';token='';}
  function solo(kind,map){stopNetwork();state=S.create(kind,{map,...(map?{}:{factions:[faction,(faction+1)%4],heroes:[heroClass,(heroClass+1)%S.heroes.length]})});team=0;mode='playing';heroPanel='skills';paused=false;selected=state.units.filter(u=>u.team===0&&u.kind==='hero').map(u=>u.id);camera=state.map.spawns[0].map(v=>S.clamp(v,-18,18));zoom=16;accumulator=0;lastFrame=-1;armed=null;groups={};notice='';selectHero();}
  function title(){stopNetwork();mode='title';state=S.create();camera=[0,0];zoom=27;paused=false;selected=[];armed=null;returnEditor=false;}
  function order(command){const c={ids:[...selected],...command};if(online){if(connected)engine.network.send({type:'order',seq:++seq,command:c});else message('Reconnecting; orders are paused');}else{const error=S.command(state,team,c);if(error)message(error);else{sound('order');if(Number.isFinite(c.x)&&Number.isFinite(c.z))commandMarker={x:c.x,z:c.z,until:time+1.2};}}}
  function selectHero(){const h=state.units.find(u=>u.team===team&&u.kind==='hero'&&u.hp>0);if(h){selected=[h.id];camera=[h.x+3,h.z+4];}}
  function enterEditor(){stopNetwork();returnEditor=false;mode='editor';paused=false;selected=[];state=S.create(editMap.mode,{map:editMap});camera=[0,0];zoom=29;undo=[];brush=0;message('Paint terrain / place objects. F5 save, F6 load, F7 play your map.');}
  function editorState(){state=S.create(editMap.mode,{map:editMap});lastFrame=-1;}
  function paint(p){const i=S.index(p.x,p.z);if(i===paintCell)return;paintCell=i;undo.push(S.clone(editMap));if(undo.length>20)undo.shift();const [cx,cz]=S.cell(p.x,p.z),x=cx*2-31,z=cz*2-31;
    if(editorPage===1){if(editMap.units.length<64)editMap.units.push({kind:placeKind,team:placeTeam,x:S.clamp(x,-27,27),z:S.clamp(z,-27,27),...(placeKind==='hero'?{heroClass:placeHeroClass}:placeTag?{tag:placeTag}:{})});}
    else if(editorPage===2){if(editMap.triggers.length<32)editMap.triggers.push({when:triggerWhen,action:triggerAction,team:placeTeam,value:triggerValue,after:-1,x:S.clamp(x,-27,27),z:S.clamp(z,-27,27),kind:placeKind,text:triggerAction+' activated'});}
    else if(editorPage===3){undo.pop();return;}
    else if(brush<3)editMap.terrain[i]=brush;
    else if(brush===6||brush===7){editMap.spawns[brush-6]=[S.clamp(x,-27,27),S.clamp(z,-27,27)];}
    else if(brush===8){editMap.props=editMap.props.filter(v=>Math.hypot(v.x-x,v.z-z)>2);editMap.units=editMap.units.filter(v=>Math.hypot(v.x-x,v.z-z)>2);editMap.triggers=editMap.triggers.filter(v=>Math.hypot(v.x-x,v.z-z)>2);}
    else if(editMap.props.length<100){editMap.props=editMap.props.filter(v=>Math.hypot(v.x-x,v.z-z)>1);editMap.props.push({kind:['tree','mine','camp'][brush-3],x,z,amount:brush===4?9000:600});}
    try{editorState();}catch(e){editMap=undo.pop();message(e.message);}
  }
  function connect(action){stopNetwork();online=true;intent=action;mode='connecting';retry=time;reconnectUntil=time+8;message('Connecting to '+address);}
  function receive(){
    for(const e of engine.network.poll()){
      if(e.type==='connected'){connected=true;lastReceive=time;engine.network.send({type:'hello',protocol:3,name:'Commander'});}
      if(e.type==='closed'){connected=false;if(online&&token){mode='reconnecting';intent='resume';retry=time+.5;reconnectUntil=time+12;message('Connection lost. Reconnecting...');}else if(online){online=false;mode='network';message('Connection failed. Start server.mjs and check the address.');}}
      if(e.type!=='message')continue;const m=e.data;lastReceive=time;
      if(m.type==='welcome'){
        if(intent==='create')engine.network.send({type:'create',mode:editMap.mode==='moba'?'moba':'skirmish',map:editMap.mode==='td'?S.defaultMap():editMap,faction,heroClass});
        if(intent==='browse'){engine.network.send({type:'list'});mode='rooms';}
        if(intent==='resume')engine.network.send({type:'resume',code,token});
      }
      if(m.type==='joined'){team=m.team;token=m.token;code=m.code;seq=0;if(m.state){state=m.state;mode=state.winner===null?'playing':'finished';}else mode='lobby';selected=[];camera=[...(m.state?.map.spawns[team]||[team?23:-23,team?-23:23])];zoom=18;}
      if(m.type==='room'){room=m;if(m.phase==='playing'&&state?.frame>0)mode='playing';}
      if(m.type==='rooms'){rooms=m.rooms;roomIndex=S.clamp(roomIndex,0,Math.max(0,rooms.length-1));}
      if(m.type==='state'){state=m.state;netStates++;mode=state.winner===null?'playing':'finished';if(!selected.length)selected=state.units.filter(u=>u.team===team&&u.kind==='hero').map(u=>u.id);}
      if(m.type==='error'){message(m.message);if(intent==='resume'&&m.message.includes('expired')){stopNetwork();mode='network';}}
    }
    if(online&&!connected&&time>=retry){if(time>reconnectUntil){stopNetwork();mode='network';message('Connection timed out');}else {engine.network.connect(address);retry=time+3;}}
    if(connected&&Math.floor(time)%3===0&&Math.floor(time)!==receive.lastPing){receive.lastPing=Math.floor(time);engine.network.send({type:'ping',nonce:time});}
    if(connected&&time-lastReceive>8)engine.network.close();
  }
  function screenPointer(input){const [w,h]=input.viewport||[1280,720],scale=Math.sqrt(w/1280*h/720);return {x:(input.pointer[0]-w/2)/scale,y:(input.pointer[1]-h/2)/scale};}
  function worldPointer(input){const [w,h]=input.viewport||[1280,720];return {x:S.clamp(camera[0]+(input.pointer[0]/w*2-1)*zoom*w/h,-30,30),z:S.clamp(camera[1]+(input.pointer[1]/h*2-1)*zoom/sin,-30,30)};}
  function screenWorld(u,input){const [w,h]=input.viewport||[1280,720],scale=Math.sqrt(w/1280*h/720);return {x:(u.x-camera[0])/zoom*h/2/scale,y:((u.z-camera[1])*sin-(u.y??(S.types[u.kind]?.flying?4:0))*Math.cos(pitch))/zoom*h/2/scale};}
  function hovered(button,p){return Math.abs(p.x-button.x)<button.w/2&&Math.abs(p.y-button.y)<button.h/2;}
  function saveMap(){try{editMap=S.validateMap(editMap);persist('map'+slot,editMap);}catch(e){message(e.message);}}
  function restoreMap(){const map=load('map'+slot);if(map){try{editMap=S.validateMap(map);editorState();message('Loaded map slot '+slot);}catch(e){message(e.message);}}else message('Map slot '+slot+' is empty');}
  function primary(){
    if(mode==='network')connect('create');else if(mode==='rooms'){if(rooms[roomIndex])engine.network.send({type:'join',code:rooms[roomIndex].code,faction,heroClass});else engine.network.send({type:'list'});}
    else if(mode==='lobby'){const p=room?.players.find(p=>p.team===team);if(!p?.ready)engine.network.send({type:'ready',ready:true});else if(room?.owner===team)engine.network.send({type:'start'});}
    else if(mode==='address'){address=edit||'127.0.0.1:7788';mode='network';}
    else if(mode==='finished'){if(returnEditor)enterEditor();else title();}
  }
  function action(id){
    if(id==='solo'){returnEditor=false;solo('skirmish');}else if(id==='moba'){returnEditor=false;solo('moba');}else if(id==='td'){returnEditor=false;solo('td');}else if(id==='siege'){returnEditor=false;solo('skirmish',S.siegeMap());camera=[-15,18];zoom=20;}else if(id==='rpg'){returnEditor=false;solo('rpg');}
    else if(id==='heroChoice'){heroClass=(heroClass+1)%S.heroes.length;message(S.heroes[heroClass].label+' / '+S.heroes[heroClass].role);}
    else if(id==='editor')enterEditor();else if(id==='network'){mode='network';}else if(id==='faction'){faction=(faction+1)%4;message(S.factions[faction]+': '+['balanced army','12% more health','12% faster movement','10% more attack damage'][faction]);}
    else if(id==='continue'){const saved=load('quicksave');if(saved){try{const restored=S.restore(saved);stopNetwork();state=restored;team=0;mode=state.winner===null?'playing':'finished';paused=false;accumulator=0;armed=null;returnEditor=false;camera=state.map.spawns[0].map(v=>S.clamp(v,-18,18));zoom=16;selected=[];}catch(e){message('Invalid saved game: '+e.message);}}else message('No saved game. F5 saves a single-player match.');}
    else if(id==='modalPrimary')primary();else if(id==='modalBack')title();else if(id.startsWith('action')){const a=actions[Number(id.slice(6))];if(a)a.run();}
  }
  function updateActions(){
    selected=selected.filter(id=>state.units.some(u=>u.id===id&&u.hp>0&&!u.inside));actions=[];const add=(label,run,detail='',icon='')=>actions.push({label,run,detail,icon});
    if(mode==='editor'){
      if(editorPage===0)['Grass [1]','Water [2]','Road [3]','Tree [4]','Mine [5]','Camp [6]','Blue spawn [7]','Red spawn [8]','Erase [9]'].forEach((n,i)=>add((brush===i?'> ':'')+n,()=>brush=i));
      else if(editorPage===1){for(const kind of ['soldier','archer','worker','hero','neutral','tower'])add((placeKind===kind?'> ':'')+S.types[kind].label,()=>placeKind=kind);add('Unit: '+S.types[placeKind].label,()=>{const kinds=Object.keys(S.types);placeKind=kinds[(kinds.indexOf(placeKind)+1)%kinds.length];placeTag='';});if(placeKind==='hero')add(S.heroes[placeHeroClass].label,()=>placeHeroClass=(placeHeroClass+1)%S.heroes.length);else add('Role: '+(placeTag||'none'),()=>{placeTag=['','scout','keeper','boss'][(['','scout','keeper','boss'].indexOf(placeTag)+1)%4];if(placeTag){placeKind='neutral';placeTeam=1;}});add('Team: '+placeTeam,()=>placeTeam=1-placeTeam);}
      else if(editorPage===2){for(const when of ['enter','timer','kills'])add((triggerWhen===when?'> ':'')+when,()=>triggerWhen=when);for(const effect of ['spawn','gold','message','victory'])add((triggerAction===effect?'> ':'')+effect,()=>triggerAction=effect);add('Team: '+placeTeam,()=>placeTeam=1-placeTeam);add('Value: '+triggerValue,()=>triggerValue=triggerValue>=60?10:triggerValue+10);}
      else {for(let t=0;t<2;t++){add('P'+(t+1)+' '+S.factions[editMap.players[t].faction],()=>{undo.push(S.clone(editMap));editMap.players[t].faction=(editMap.players[t].faction+1)%4;editorState();});add('P'+(t+1)+' '+S.heroes[editMap.players[t].heroClass??0].label,()=>{undo.push(S.clone(editMap));editMap.players[t].heroClass=((editMap.players[t].heroClass??0)+1)%S.heroes.length;editorState();});add('P'+(t+1)+' '+(editMap.players[t].ai?'AI':'Human'),()=>{undo.push(S.clone(editMap));editMap.players[t].ai=!editMap.players[t].ai;editorState();});}add('Reset '+editMap.mode,()=>{undo.push(S.clone(editMap));editMap=S.defaultMap(editMap.mode);editorState();});}
      while(actions.length<9)add('PAGE [V]',()=>editorPage=(editorPage+1)%4);
      add('SAVE [F5]',saveMap);add('LOAD [F6]',restoreMap);add('PLAY [F7]',()=>{try{editMap=S.validateMap(editMap);returnEditor=true;solo(editMap.mode,editMap);}catch(e){message(e.message);}});return;
    }
    const u=state.units.find(u=>selected.includes(u.id)&&u.team===team&&u.hp>0);if(!u)return;
    if(u.built<1){add('Cancel / 75% refund',()=>order({type:'cancelBuild'}));return;}
    if(u.kind==='worker'){
      for(const [kind,key] of (state.mode==='td'?[['tower','T'],['frosttower','G'],['flametower','H']]:[['hall','C'],['farm','F'],['barracks','B'],['tower','T'],['altar','L'],['workshop','J']]))add(S.types[kind].label+' ['+key+']',()=>{armed={type:'build',kind};message('Choose a site within 15 units of the worker');});
      add('Repair / assist [R]',()=>{armed={type:'repair'};message('Choose a friendly building to repair or finish');});
    }else if(S.types[u.kind].model==='tower'){add('Upgrade '+(100*u.level),()=>order({type:'towerUpgrade'}));if(state.mode==='td')add('Sell / 65%',()=>order({type:'sell'}));
    }else if(u.kind==='hero'){
      const definition=S.unitType(u);
      if(heroPanel==='shop'){S.items.forEach((item,i)=>add(item.name+' '+item.gold,()=>order({type:'buy',item:i}),'Buy at your stronghold. '+(item.recipe?'Requires '+item.recipe.map(n=>S.items[n].name).join(' + '):'Permanent hero attribute bonus.'),['blade','heart','boots','edge','storm','charm'][i]));add('Back to skills',()=>heroPanel='skills');}
      else {definition.spells.forEach((spell,i)=>{const rank=u.skills[i],learn=heroPanel==='learn',key=['Q','W','E','R'][i];add((learn?'+ ':'')+spell.name+' ['+key+'] '+rank+'/'+(i===3?1:3)+(u.spell[i]>.1?' '+Math.ceil(u.spell[i])+'s':''),()=>{if(learn)order({type:'learn',slot:i});else if(spell.range===0)order({type:'spell',slot:i,x:u.x,z:u.z});else{armed={type:'spell',slot:i};message('Choose a visible target within '+spell.range+' units');}},spell.cost+' mana / '+spell.cooldown+'s. '+spell.description+' Learn: '+(i===3?'level 6':'levels 1 / 3 / 5')+'. Shift+'+key+' spends a skill point.','hero-'+u.heroClass+'-'+i);});add(heroPanel==='learn'?'Back to skills':'Learn skills +'+u.skillPoints+' [K]',()=>heroPanel=heroPanel==='learn'?'skills':'learn');add('Stronghold shop [O]',()=>heroPanel='shop');}
    }else if(['hall','barracks','altar','workshop'].includes(u.kind)){
      for(const kind of S.trainable(state,u))add(S.types[kind].label+' '+S.types[kind].gold,()=>order({type:'train',kind}));if(u.kind==='barracks')add('Weapons +6 [U]',()=>order({type:'upgrade'}));if(u.kind==='hall')add('Advance tier [U]',()=>order({type:'tech'}));
    }
    if(S.trainable(state,u).length){add('Rally point',()=>armed={type:'rally'});if(u.queue.length)add('Cancel last / refund',()=>order({type:'cancelTrain',index:u.queue.length-1}));}
    add('Attack move [A]',()=>armed={type:'attackMove'});add('Stop [S]',()=>order({type:'stop'}));add('Hero [Space]',selectHero);
  }
  function controls(input,dt){
    const press=k=>input.pressedKeys.includes(k),held=k=>input.keys.includes(k),p=screenPointer(input),w=worldPointer(input);updateActions();
    if(press('F10')){if(returnEditor)enterEditor();else title();return;}
    if(mode==='address'){for(const k of input.pressedKeys){if(k==='Backspace')edit=edit.slice(0,-1);else if(/^Digit\d$/.test(k))edit+=k.slice(5);else if(k==='Period')edit+='.';else if(k==='Semicolon')edit+=':';else if(/^Key[A-Z]$/.test(k))edit+=k.slice(3).toLowerCase();}edit=edit.slice(0,64);if(press('Enter'))primary();if(press('Escape'))mode='network';}
    else if(mode==='network'){if(press('F1')){editMap=S.defaultMap('skirmish');connect('create');}if(press('F2')){editMap=S.defaultMap('moba');connect('create');}if(press('F3'))connect('browse');if(press('KeyI')){mode='address';edit=address;}if(press('Enter'))primary();}
    else if(mode==='rooms'){if(press('ArrowDown'))roomIndex=(roomIndex+1)%Math.max(1,rooms.length);if(press('ArrowUp'))roomIndex=(roomIndex+rooms.length-1)%Math.max(1,rooms.length);if(press('F5'))engine.network.send({type:'list'});if(press('Enter'))primary();}
    else if(mode==='lobby'||mode==='finished'){if(mode==='lobby'&&press('KeyH')){const choice=room?.players.find(p=>p.team===team)?.heroClass??heroClass;engine.network.send({type:'pick',heroClass:(choice+1)%S.heroes.length});}if(press('Enter'))primary();}
    else if(mode==='title'){if(press('F1'))action('solo');if(press('F2'))action('moba');if(press('F3'))action('td');if(press('F4'))enterEditor();if(press('F8'))action('rpg');if(press('F9'))action('siege');if(press('KeyH'))action('heroChoice');if(press('Enter'))action('network');}
    else if(mode==='playing'||mode==='editor'){
      if(press('Escape')){if(armed)armed=null;else if(mode==='playing')paused=!paused;}
      if(mode==='editor'){
        if(press('F5'))saveMap();if(press('F6'))restoreMap();if(press('F7'))actions[11].run();
        if(held('ControlLeft')&&press('KeyZ')&&undo.length){editMap=undo.pop();editorState();}
        for(let i=0;i<9;i++)if(press('Digit'+(i+1)))brush=i;
        if(press('KeyV'))editorPage=(editorPage+1)%4;
        if(press('Tab')){undo.push(S.clone(editMap));editMap.mode=['skirmish','moba','td','rpg'][(['skirmish','moba','td','rpg'].indexOf(editMap.mode)+1)%4];if(editMap.mode==='rpg'&&!editMap.units.some(u=>u.tag))editMap.units.push(...S.defaultMap('rpg').units);try{editorState();}catch(e){editMap=undo.pop();message(e.message);}}
        if(press('BracketRight'))editMap.waveInterval=S.clamp(editMap.waveInterval+2,10,60);if(press('BracketLeft'))editMap.waveInterval=S.clamp(editMap.waveInterval-2,10,60);
        if(press('Equal'))editMap.startingGold=S.clamp(editMap.startingGold+100,100,2000);if(press('Minus'))editMap.startingGold=S.clamp(editMap.startingGold-100,100,2000);
        if(press('PageUp'))editMap.waves=S.clamp(editMap.waves+1,3,30);if(press('PageDown'))editMap.waves=S.clamp(editMap.waves-1,3,30);if(press('KeyN'))slot=slot%3+1;
      }else if(!paused){
        if(press('F5')){if(online)message('Network matches are saved on the server during reconnect');else persist('quicksave',state);}
        if(press('Space'))selectHero();if(press('KeyA'))armed={type:'attackMove'};if(press('KeyS'))order({type:'stop'});
        const u=state.units.find(u=>selected.includes(u.id)&&u.team===team);
        if(u?.kind==='hero'){if(press('KeyK'))heroPanel=heroPanel==='learn'?'skills':'learn';if(press('KeyO'))heroPanel=heroPanel==='shop'?'skills':'shop';for(const [i,k] of ['KeyQ','KeyW','KeyE','KeyR'].entries())if(press(k)){if(held('ShiftLeft')||held('ShiftRight')||heroPanel==='learn')order({type:'learn',slot:i});else if(S.unitType(u).spells[i].range===0)order({type:'spell',slot:i,x:u.x,z:u.z});else armed={type:'spell',slot:i};}}
        if(u?.kind==='worker')for(const [k,kind] of [['KeyC','hall'],['KeyF','farm'],['KeyB','barracks'],['KeyT','tower'],['KeyL','altar'],['KeyG','frosttower'],['KeyH','flametower'],['KeyJ','workshop']])if(press(k))armed={type:'build',kind};
        if(u?.kind==='worker'&&press('KeyR'))armed={type:'repair'};
        if(press('KeyU'))order({type:u?.kind==='hall'?'tech':'upgrade'});
        for(let i=1;i<=9;i++)if(press('Digit'+i)){if(held('ControlLeft'))groups[i]=[...selected];else selected=[...(groups[i]||[])];}
      }
      if(held('ArrowLeft'))camera[0]-=dt*20;if(held('ArrowRight'))camera[0]+=dt*20;if(held('ArrowUp'))camera[1]-=dt*20;if(held('ArrowDown'))camera[1]+=dt*20;
      if(press('Home'))zoom=S.clamp(zoom-3,12,36);if(press('End'))zoom=S.clamp(zoom+3,12,36);camera=camera.map(v=>S.clamp(v,-25,25));
    }
    if(input.pressedButtons.includes(0)){
      const group=mode==='title'?'menu':['playing','editor'].includes(mode)?'hud':'modal',b=FrostButtons.find(b=>b.group===group&&hovered(b,p)&&(!b.id.startsWith('action')||actions[Number(b.id.slice(6))]));if(b){action(b.id);return;}
      if(['playing','editor'].includes(mode)&&p.x>-604&&p.x<-420&&p.y>185&&p.y<347){camera=[S.clamp((p.x+594)/160*64-32,-25,25),S.clamp((p.y-190)/144*64-32,-25,25)];return;}
      if(['playing','editor'].includes(mode)&&p.y<175&&p.y>-305&&!paused){if(mode==='editor'){paintCell=-1;paint(w);}else if(armed){if(armed.type==='repair'){const b=state.units.find(u=>u.team===team&&u.hp>0&&!S.types[u.kind].speed&&Math.hypot(screenWorld(u,input).x-p.x,screenWorld(u,input).y-p.y)<28);if(b)order({type:b.built<1?'construct':'repair',target:b.id});else message('Select a friendly building');}else order({...armed,x:w.x,z:w.z});armed=null;}else drag={start:p,end:p};}
    }
    if(mode==='editor'&&input.buttons.includes(0)&&p.y<175&&p.y>-305){paint(w);}
    if(drag){drag.end=p;if(input.releasedButtons.includes(0)){
      const large=Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>8;let ids=[];
      if(large)ids=state.units.filter(u=>u.team===team&&u.hp>0&&!u.inside&&S.types[u.kind].speed).filter(u=>{const a=screenWorld(u,input);return a.x>=Math.min(p.x,drag.start.x)&&a.x<=Math.max(p.x,drag.start.x)&&a.y>=Math.min(p.y,drag.start.y)&&a.y<=Math.max(p.y,drag.start.y);}).map(u=>u.id);
      else {let nearest=null,best=25;for(const u of state.units){if(u.hp<=0||!S.isVisible(state,team,u))continue;const a=screenWorld(u,input),d=Math.hypot(a.x-p.x,a.y-p.y);if(d<best){nearest=u;best=d;}}if(nearest)ids=[nearest.id];}
      selected=(held('ShiftLeft')?[...new Set([...selected,...ids])]:ids).slice(0,40);drag=null;sound('order');
    }}
    if(mode==='playing'&&!paused&&input.pressedButtons.includes(2)&&p.y<175){armed=null;const target=state.units.find(u=>u.team!==team&&u.hp>0&&S.isVisible(state,team,u)&&Math.hypot(screenWorld(u,input).x-p.x,screenWorld(u,input).y-p.y)<28),r=state.resources.findIndex(r=>r.kind!=='camp'&&r.amount>0&&Math.hypot(r.x-w.x,r.z-w.z)<2.8),worker=state.units.some(u=>selected.includes(u.id)&&u.kind==='worker');const b=worker&&state.units.find(u=>u.team===team&&u.hp>0&&!S.types[u.kind].speed&&(u.built<1||u.hp<u.maxHp)&&Math.hypot(screenWorld(u,input).x-p.x,screenWorld(u,input).y-p.y)<28);if(target)order({type:'attack',target:target.id});else if(b)order({type:b.built<1?'construct':'repair',target:b.id});else if(r>=0&&worker)order({type:'gather',resource:r});else order({type:state.units.some(u=>selected.includes(u.id)&&S.trainable(state,u).length)?'rally':'move',x:w.x,z:w.z});}
  }
  function render(input){
    const playing=['playing','finished','reconnecting'].includes(mode),editing=mode==='editor',world=playing||editing,modal=!['title','playing','editor'].includes(mode),allVisible=!playing;
    for(const n of Object.keys(entities)){if(n.startsWith('Menu '))show(n,mode==='title');if(n.startsWith('Modal '))show(n,modal);}
    for(const b of FrostButtons){const on=b.group==='menu'?mode==='title':b.group==='modal'?modal:world&&!!actions[Number(b.id.slice(6))];for(const suffix of [' border',' box',' label',' detail',' icon'])show(b.id+suffix,on);}
    for(const n of ['Header','Brand','Resources','Clock','Bottom','Bottom rule','Minimap','Selection title','Selection stats','Selection queue','Controls','Portrait','Health back','Health fill','Mana back','Mana fill'])show(n,world);
    show('Hero preview',mode==='title');set('Hero preview','Image',{...authored['Hero preview'].Image,sprite:'Assets/Art/hero-portraits.png#hero-'+heroClass});
    label('heroChoice label',S.heroes[heroClass].label.toUpperCase()+' [H]');label('heroChoice detail',S.heroes[heroClass].role+' / click to change');
    label('faction label',S.factions[faction].toUpperCase());
    transform('Strategy camera',[camera[0],42,camera[1]+32],[1,1,1],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);set('Strategy camera','Camera3D',{...authored['Strategy camera'].Camera3D,orthographic_size:zoom});
    const map=editing?editMap:state.map;
    const ground=FrostTerrain.cells(state,team,allVisible);
    for(let z=0;z<8;z++)for(let x=0;x<8;x++)set('Ground '+(z*8+x),'MaterialPropertyBlock',{custom_parameter_names:FrostTerrain.names,custom_parameter_values:FrostTerrain.chunk(ground,x,z)});
    for(let j=0;j<256;j++){const v=ground[Math.floor(j/16)*64+(j%16)*2],kind=Math.floor(v/2),factor=v-kind*2,c=kind===1?[.04,.2,.27,1]:kind===2?[.43,.37,.25,1]:[.49,.6,.61,1];show('Mini tile '+j,world);set('Mini tile '+j,'Image',{color:c.map((n,k)=>k===3?n:n*factor),raycast_target:false});}
    for(let i=0;i<140;i++){
      const edge=i<72,angle=i*2.399963,x=edge?Math.cos(angle)*(35+i%4*2):((i*17.71)%54)-27,z=edge?Math.sin(angle)*(35+i%4*2):((i*23.19)%54)-27,idx=S.index(x,z);
      const seen=edge||allVisible||state.explored[team]?.[idx],clear=edge||map.terrain[idx]===0&&state.units.every(u=>(!allVisible&&!S.isVisible(state,team,u))||S.types[u.kind].speed||Math.hypot(x-u.x,z-u.z)>4)&&!(state.mode==='td'&&Math.floor(ground[idx]/2)===2);
      if(!seen||!clear){transform('Scenery '+i,hidden);continue;}
      const key=edge?(i%4===0?'rock_largeB':i%2?'tree_pineTallA':'tree_pineTallB'):(i%3===0?'rock_largeA':i%3===1?'rock_smallA':'tree_pineDefaultA'),asset=FrostArt[key],scale=edge?(i%4===0?5:3.6):(i%3===2?2.6:1.2);
      set('Scenery '+i,'MeshRenderer',{mesh:asset.parts[0].mesh,material:asset.material});transform('Scenery '+i,[x,-.02,z],[scale,scale,scale],[0,Math.sin(angle/2),0,Math.cos(angle/2)]);
    }
    if(commandMarker&&time<commandMarker.until)transform('Command marker',[commandMarker.x,.055,commandMarker.z],[1.7+(commandMarker.until-time),.01,1.7+(commandMarker.until-time)]);else transform('Command marker',hidden);
    if(mode==='playing'&&armed?.type==='build'&&screenPointer(input).y<175){const p=worldPointer(input),key={hall:'Citadel',farm:'House',barracks:'Barracks',tower:'GuardTower',frosttower:'GuardTower',flametower:'GuardTower',altar:'Archery',workshop:'Barracks'}[armed.kind],asset=FrostArt[key],scale={hall:3,farm:3.2,barracks:3.8,tower:3,frosttower:3,flametower:3,altar:3.5,workshop:4.3}[armed.kind];set('Placement preview','MeshRenderer',{mesh:asset.parts[0].mesh,material:'Assets/Materials/Placement.mmat'});transform('Placement preview',[p.x,.03,p.z],[scale,scale,scale]);}else transform('Placement preview',hidden);
    for(let i=0;i<100;i++){const r=(editing?map.props:state.resources)[i],visible=r&&r.amount>0&&(allVisible||state.explored[team]?.[S.index(r.x,r.z)]);if(!visible){transform('Prop '+i,hidden);continue;}const key=r.kind==='tree'?(i%3===0?'tree_pineTallB':'tree_pineTallA'):r.kind==='mine'?'rock-large':'rock-wide',asset=FrostArt[key];set('Prop '+i,'MeshRenderer',{mesh:asset.parts[0].mesh,material:asset.material});const scale=r.kind==='tree'?2.1+(i%4)*.22:2.1;transform('Prop '+i,[r.x,0,r.z],[scale,scale,scale]);}
    const sites=state.units.filter(u=>u.hp>0&&u.built<1&&(allVisible||S.isVisible(state,team,u)));
    for(let i=0;i<32;i++){const b=sites[i],r=b?(S.types[b.kind].radius+.5)*2:1;transform('Foundation '+i,b?[b.x,-.03,b.z]:hidden,[r,.18,r]);set('Foundation '+i,'MaterialPropertyBlock',{override_base_color:true,base_color:b?[ [.75,.61,.4,1],[.65,.4,.22,1],[.3,.65,.38,1],[.5,.35,.7,1] ][state.teams[b.team]?.faction||0]:[1,1,1,1]});}
    for(let i=0;i<S.LIMIT;i++){
      const u=state.units[i],visible=u&&u.hp>0&&!u.inside&&(allVisible||S.isVisible(state,team,u));if(!visible){for(const n of ['Unit ','Ring ','HP ','Flag '])transform(n+i,hidden);show('Mini unit '+i,false);continue;}
      const keys={worker:'Monk',soldier:'Warrior',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',hall:'Citadel',barracks:'Barracks',farm:'House',tower:'GuardTower',altar:'Archery',creep:'Rogue',neutral:'Warrior',workshop:'Barracks',ballista:'siege-ballista',catapult:'siege-catapult',trebuchet:'siege-trebuchet',ram:'siege-ram',dragon:'Dragon'},key=u.kind==='hero'?S.unitType(u).art:u.tag==='boss'?'Wizard':u.kind==='frosttower'?'FrostTower':u.kind==='flametower'?'EmberTower':keys[u.kind]||keys[S.types[u.kind].model],asset=FrostArt[key],old=previous[u.id],walking=old&&Math.hypot(u.x-old.x,u.z-old.z)>.008;let yaw=old?.yaw||0;if(walking)yaw=Math.atan2(u.x-old.x,u.z-old.z);previous[u.id]={x:u.x,z:u.z,yaw};
      let mesh=asset.parts[0].mesh;if(asset.animations?.length){const desired=S.types[u.kind].flying?(u.cd>.25?/Dragon_Attack$/:/Dragon_Flying/):u.cd>.25&&u.kind!=='worker'?/Sword_Attack|Bow_Shoot|Staff_Attack|Punch/:walking?/^Run$|^Walk$/:/^Idle$/;let clip=asset.animations.findIndex(a=>desired.test(a.name));if(clip<0)clip=0;const frame=Math.floor(time*12)%asset.animations[clip].frames;mesh+='#pose='+clip+':'+frame;}
      set('Unit '+i,'MeshRenderer',{mesh,material:asset.material});set('Unit '+i,'MaterialPropertyBlock',{override_base_color:true,base_color:u.kind==='frosttower'?[.5,.85,1,1]:u.kind==='flametower'?[1,.58,.3,1]:[1,1,1,1]});const scale=u.tag==='boss'||u.tdBoss?1.5:S.types[u.kind].flying?1.1:S.types[u.kind].attack==='siege'?2:S.types[u.kind].speed?(u.kind==='hero'?1.1:S.types[u.kind].model==='knight'?1:.85):({hall:3,barracks:3.8,farm:3.2,tower:3,altar:3.5,workshop:4.3}[S.types[u.kind].model]);transform('Unit '+i,[u.x,S.types[u.kind].flying?4:0,u.z],[scale,scale*Math.max(.15,u.built),scale],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]);
      const picked=selected.includes(u.id),height=S.types[u.kind].flying?7:S.types[u.kind].attack==='siege'?asset.size[1]*scale+.4:S.types[u.kind].speed?3.25:u.kind==='hall'?5.7:4.3;transform('Ring '+i,picked?[u.x,.04,u.z]:hidden,[S.types[u.kind].speed?2.5:5,.012,S.types[u.kind].speed?2.5:5]);transform('HP '+i,[u.x,height,u.z],[1.7*u.hp/u.maxHp,.1,.17]);set('HP '+i,'PbrMaterial',{base_color:u.team===team?[.18,.82,.47,1]:[.9,.2,.18,1],roughness:1});transform('Flag '+i,S.types[u.kind].speed?hidden:[u.x+.5,height-.6,u.z],[1.5,1.5,1.5]);set('Flag '+i,'MaterialPropertyBlock',{override_base_color:true,base_color:u.team===0?[.35,.68,1,1]:[1,.3,.2,1]});
      show('Mini unit '+i,world);const r=authored['Mini unit '+i].RectTransform;set('Mini unit '+i,'RectTransform',{...r,anchored_position:world?[-594+(u.x+32)/64*160,190+(u.z+32)/64*144]:[5000,5000]});set('Mini unit '+i,'Image',{color:u.team===team?[.2,.7,1,1]:[1,.25,.15,1],raycast_target:false});
    }
    if(lastFrame!==state.frame){for(const e of state.events||[]){if(playing&&!state.visible[team]?.[S.index(e.x,e.z)])continue;if(e.type==='damage'){damageText.push({e,until:time+.8});if(damageText.length>12)damageText.shift();continue;}const id=fxSerial++%24;fx.push({id,e,until:time+(e.type==='spell'?.65:e.ranged?.35:.22),start:time});if(e.type==='spell')sound('spell');if(e.type==='hit'&&time-lastBattleSound>.25){sound('battle');lastBattleSound=time;}}lastFrame=state.frame;}
    fx=fx.filter(f=>f.until>time);for(let i=0;i<24;i++){const f=fx.findLast?fx.findLast(f=>f.id===i):[...fx].reverse().find(f=>f.id===i);set('FX '+i,'ParticleEmitter3D',{...authored['FX '+i].ParticleEmitter3D,playing:!!f,shape_radius:f?.e.type==='spell'?2:.2,color_start:f?.e.type==='spell'?S.heroes[f.e.heroClass??0].color:f?.e.team===1?[1,.35,.12,1]:[.25,.7,1,1]});if(f)transform('FX '+i,[f.e.x,.6,f.e.z]);}
    const missiles=fx.filter(f=>f.e.ranged).slice(-12);
    for(let i=0;i<12;i++){const f=missiles[i];if(f){const t=S.clamp((time-f.start)/.35,0,1),e=f.e,dx=e.x-e.fromX,dz=e.z-e.fromZ,yaw=Math.atan2(dx,dz);transform('Missile '+i,[e.fromX+dx*t,(e.fromY||1.6)+((e.toY||1.6)-(e.fromY||1.6))*t+Math.sin(t*Math.PI)*1.4,e.fromZ+dz*t],[.12,.12,.85],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]);}else transform('Missile '+i,hidden);}
    damageText=damageText.filter(d=>d.until>time);
    for(let i=0;i<12;i++){const d=damageText[i];show('Damage '+i,playing&&!!d);if(d){const p=screenWorld(d.e,input),r=authored['Damage '+i].RectTransform;set('Damage '+i,'RectTransform',{...r,anchored_position:[p.x,p.y-36-(.8-d.until+time)*26]});label('Damage '+i,'-'+d.e.amount,d.e.team===team?[1,.46,.35,1]:[1,.87,.52,1]);}}
    const markers=editing?map.triggers:state.loot||[];for(let i=0;i<32;i++){const m=markers[i];transform('Objective '+i,m&&(editing||state.explored[team]?.[S.index(m.x,m.z)])?[m.x,.4+Math.sin(time*2)*.15,m.z]:hidden,[.8,.8,.8],[0,Math.sin(time/2),0,Math.cos(time/2)]);}
    label('Objective text',editing?'[V] '+['Terrain & objects','Units — click ground to place','Triggers — choose condition / action, click a region','Players & data'][editorPage]:state.mode==='rpg'?'QUEST '+(state.quest.stage+1)+'/4: '+(S.questNames[state.quest.stage]||'Covenant restored')+(state.quest.stage===0?' ('+state.quest.scouts+'/3)':''):state.announcement||'');show('Objective text',world);
    const t=state.teams[team],pop=S.population(state,team),u=state.units.find(u=>selected.includes(u.id));
    label('Resources',editing?'WORLD EDITOR / '+map.mode.toUpperCase()+' / SLOT '+slot:'GOLD '+Math.floor(t.gold)+'    LUMBER '+Math.floor(t.wood)+'    SUPPLY '+pop.used+'/'+pop.cap+'    '+S.factions[t.faction].toUpperCase());
    label('Clock',editing?'TAB changes mode':state.mode==='td'?'WAVE '+Math.min(state.wave,map.waves)+'/'+map.waves+'  LIVES '+state.lives:(online?'ONLINE  ':'SOLO  ')+Math.floor(state.frame/600)+':'+String(Math.floor(state.frame/10)%60).padStart(2,'0'));
    transform('Rally marker',world&&u?.rally?[u.rally.x,.2,u.rally.z]:hidden,[2,2,2]);
    label('Selection title',editing?'TERRAIN & OBJECTS':selected.length>1?selected.length+' units selected':u?S.unitType(u).label:'Your command awaits');
    label('Selection stats',editing?'Gold '+map.startingGold+'  [+ / -]\nWaves '+map.waves+'  [PgUp / PgDn]\nInterval '+map.waveInterval+'s  [[ / ]]':u?'HP '+Math.ceil(u.hp)+' / '+Math.ceil(u.maxHp)+'\nATK '+Math.round(u.damage)+'  '+(u.kind==='hero'?'LV '+u.level+'\nMP '+Math.floor(u.mana)+' / '+(150+u.level*10):S.types[u.kind].attack+' / '+S.types[u.kind].armor+'\n'+(S.types[u.kind].flying?'Flying / ':'' )+(S.types[u.kind].antiAir?'Ground + air':'Ground only')):'Left click / drag to select\nRight click to move or attack\nWorkers gather from mines and trees');
    label('Selection queue',editing?'Units '+map.units.length+' / Triggers '+map.triggers.length+'\nUndo Ctrl+Z / Slot N / Pages V':u?.built<1?'Building '+Math.floor(u.built*100)+'% / '+({work:'Workers required',inside:'Worker stationed',growth:'Living growth',summon:'Summoning',legacy:'Construction'}[u.construction?.style]||'Construction'):u?.kind==='hall'?'Stronghold tier '+t.tier+(t.research>0?' / upgrading '+Math.ceil(t.research)+'s':''):u?.queue.length?'Training: '+u.queue.map(q=>q.kind+' '+Math.ceil(q.left)+'s').join(', '):u?.kind==='hero'?'XP '+u.xp+'/'+(u.level*90)+' / Skill points '+u.skillPoints:u?.inventory.length?'Items: '+u.inventory.map(i=>S.items[i].name).join(', '):u?.built<1?'Building '+Math.floor(u.built*100)+'%':'');
    label('Controls',editing?'Paint LMB   /   F5 save   F6 load   F7 test   /   arrows pan   Home/End zoom':'Arrows pan   Home/End zoom   Space hero   Ctrl+1..9 groups   F5 save   Esc pause   F10 menu');
    const icons=['frost','heal','blink','blizzard','blade','heart','boots','edge','storm','charm','attack','shield'];
    const pointer=screenPointer(input);let hint='';
    for(let i=0;i<12;i++){
      const a=actions[i],b=FrostButtons.find(b=>b.id==='action'+i),hover=world&&a&&hovered(b,pointer);label('action'+i+' label',a?.label||'');
      const icon=a?.icon|| (editing?'tower':u?.kind==='hero'?icons[i]:/tower|spire|bastion|farm|barrack|altar/i.test(a?.label||'')?'tower':/worker|wood/i.test(a?.label||'')?'wood':/Hero/.test(a?.label||'')?'hero':/Stop/.test(a?.label||'')?'shield':'attack');
      set('action'+i+' icon','Image',{...authored['action'+i+' icon'].Image,sprite:(icon.startsWith('hero-')?'Assets/Art/hero-skills.png#':'Assets/Art/command-icons.png#')+icon});
      set('action'+i+' box','Image',{...authored['action'+i+' box'].Image,color:hover?[.13,.21,.24,1]:[.028,.045,.06,1]});
      if(hover)hint=a.label+'\n'+(a.detail||(editing?'Choose a tool, then click the battlefield.':'Select a target or building site when prompted.'));
    }
    show('Tooltip panel',!!hint);show('Tooltip text',!!hint);if(hint)label('Tooltip text',hint);
    set('Portrait','Image',{...authored.Portrait.Image,sprite:u?.kind==='hero'&&!editing?'Assets/Art/hero-portraits.png#hero-'+u.heroClass:'Assets/Art/command-icons.png#'+(editing?'tower':u?.kind==='hero'?'hero':u?.kind==='worker'?'wood':u&&!S.types[u.kind].speed?'tower':'shield')});
    for(const [n,value] of [['Health',u?u.hp/u.maxHp:0],['Mana',u?.kind==='hero'?u.mana/(150+u.level*10):0]]){const a=authored[n+' fill'].RectTransform;set(n+' fill','RectTransform',{...a,size_delta:[182*S.clamp(value,0,1),a.size_delta[1]],anchored_position:[-294+91*S.clamp(value,0,1),a.anchored_position[1]]});show(n+' back',world&&!editing&&!!u);show(n+' fill',world&&!editing&&!!u);}

    label('Status',paused?'PAUSED — Escape to resume':armed?'TARGET: '+(armed.kind||armed.type)+' — click ground / Escape cancels':time<noticeUntil?notice:'');
    if(modal){
      let title='',body='',primaryLabel='CONTINUE';
      if(mode==='network'){title='MULTIPLAYER';body='Host address: '+address+'  [I to edit]\n\nF1  Host a skirmish     F2  Host an Ancients match\nF3  Browse rooms\n\nRun server.mjs on the host computer.\nCurrent map: '+editMap.name;primaryLabel='CREATE ROOM';}
      if(mode==='connecting'||mode==='reconnecting'){title='CONNECTING';body=address+'\n\n'+notice;primaryLabel='WAITING';}
      if(mode==='address'){title='SERVER ADDRESS';body=edit+'|\n\nType IPv4:port or localhost:port\nEnter applies the address.';primaryLabel='APPLY ADDRESS';}
      if(mode==='rooms'){title='JOIN A ROOM';body=rooms.length?rooms.map((r,i)=>(i===roomIndex?'> ':'   ')+r.code+' / '+r.name+' / '+r.players.length+'/2').join('\n'):'No rooms yet. F5 refreshes the list.';body+='\n\nUp/Down select / Enter joins / F5 refresh';primaryLabel='JOIN SELECTED';}
      if(mode==='lobby'){title='ROOM '+code;body=(room?.players||[]).map(p=>(p.team===team?'> ':'   ')+p.name+' / '+S.heroes[p.heroClass??0].label+' / '+(p.ready?'READY':'NOT READY')).join('\n')+'\n\nH changes your hero and clears readiness.\nA vacant opponent slot is played by AI.\nThe host presses Enter again to start.';primaryLabel=room?.players.find(p=>p.team===team)?.ready?'START MATCH':'READY';}
      if(mode==='finished'){title=state.winner===team?'VICTORY':'DEFEAT';body=state.map.name+'\n\nEnemy units defeated: '+state.teams[team].kills+'\nBattle time: '+Math.floor(state.frame/600)+'m '+Math.floor(state.frame/10)%60+'s';primaryLabel=returnEditor?'RETURN TO EDITOR':'RETURN TO MENU';}
      label('Modal title',title);label('Modal text',body);label('modalPrimary label',primaryLabel);
    }
    show('Drag box',!!drag);if(drag){const a=authored['Drag box'].RectTransform;set('Drag box','RectTransform',{...a,anchored_position:[(drag.start.x+drag.end.x)/2,(drag.start.y+drag.end.y)/2],size_delta:[Math.abs(drag.start.x-drag.end.x),Math.abs(drag.start.y-drag.end.y)]});}
    label('Frost telemetry',JSON.stringify({mode,heroChoice:heroClass,heroPanel,camera,zoom,flyers:state.units.filter(u=>S.types[u.kind].flying),construction:state.units.filter(u=>u.team===team&&u.built<1),production:state.units.filter(u=>u.team===team&&S.trainable(state,u).length),worker:state.units.find(u=>u.team===team&&u.kind==='worker'),frame:state.frame,kind:state.mode,team,units:state.units.length,gold:state.teams[team].gold,selected,hero:state.units.find(u=>u.team===team&&u.kind==='hero'),paused,online,room:code,netStates,brush,slot,editorPage,placedHeroes:map.units.filter(u=>u.kind==='hero').map(u=>({heroClass:u.heroClass??map.players[u.team]?.heroClass??0,team:u.team})),placedUnits:map.units.length,triggers:map.triggers.length,quest:state.quest,loot:state.loot.length,map:map.name,terrainWater:map.terrain.filter(v=>v===1).length,winner:state.winner,notice}));
  }
  function tick(dt){if(!initialized)init();dt=Math.min(.2,Math.max(0,dt));time+=dt;const input=engine.input||{keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};receive();controls(input,dt);
    if(mode==='playing'&&!online&&!paused){accumulator+=dt;while(accumulator>=S.DT){S.tick(state);accumulator-=S.DT;}if(state.winner!==null){mode='finished';sound('victory');}}
    if(time>=renderAt){renderAt=time+.08;render(input);}
  }
  return {tick};
})();
function onTick(dt){FrostClient.tick(dt);}
