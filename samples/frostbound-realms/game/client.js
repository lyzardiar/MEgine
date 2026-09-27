/* Author: MiYu. Native RTS controls, presentation, map editor and TCP client. */
var FrostClient=(()=>{
  const S=Frost,R=FrostSession,hidden=[0,-100,0],pitch=-Math.atan2(42,32),sin=-Math.sin(pitch);
  let entities={},authored={},sent={},initialized=false,mode='title',state=null,team=0,faction=0,selected=[],groups={},camera=[0,0],zoom=27,time=0,accumulator=0,notice='',noticeUntil=0,drag=null,armed=null,paused=false,actions=[],renderAt=0,lastFrame=-1,fx=[],fxSerial=0;
  let editMap=S.defaultMap(),brush=0,undo=[],paintCell=-1,slot=1,returnEditor=false,online=false,address='127.0.0.1:7788',edit='',intent='',connected=false,code='',token='',room=null,rooms=[],roomIndex=0,seq=0,lastReceive=0,reconnectUntil=0,retry=0,netStates=0;
  const previous={},visibility={},modelNames={};
  let log=null,replay=null,replaySpeed=1,chapter=-1,campaignIndex=0,unlocked=0,triggerIndex=0;
  function set(n,c,v){const e=entities[n];if(!e)return;const json=JSON.stringify(v),key=n+'/'+c;if(sent[key]===json)return;sent[key]=json;engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:c,value:v}));}
  function transform(n,position,scale=[1,1,1],rotation=[0,0,0,1]){set(n,'Transform',{position,scale,rotation});}
  function label(n,text,color){if(authored[n]?.Text)set(n,'Text',{...authored[n].Text,text,...(color?{color}:{})});}
  function show(n,on){if(visibility[n]===on)return;visibility[n]=on;const a=authored[n]?.RectTransform;if(a)set(n,'RectTransform',{...a,anchored_position:on?a.anchored_position:[5000,5000]});}
  function message(text){notice=text;noticeUntil=time+5;}
  function sound(n){if(entities['Sound '+n])engine.playAudio(entities['Sound '+n].entity);}
  function init(){for(const e of engine.snapshot.entities)if(e.name){entities[e.name]=e;authored[e.name]=e.components;}state=S.create();initialized=true;}
  function persist(key,value){try{engine.storage.save(key,value);message('Saved '+key+' to your project user-data folder');return true;}catch(e){message('Save failed: '+e.message);return false;}}
  function load(key){try{return engine.storage.load(key);}catch(e){message('Load failed: '+e.message);return null;}}
  function stopNetwork(){if(connected)engine.network.send({type:'leave'});engine.network.close();online=false;connected=false;room=null;code='';token='';}
  function solo(kind,map,options={}){stopNetwork();state=S.create(kind,{...options,map,factions:[faction,(faction+1)%4]});chapter=options.chapter??-1;state.chapter=chapter;replay=null;log=R.recording(state);team=0;mode='playing';paused=false;selected=state.units.filter(u=>u.team===0&&u.kind==='hero').map(u=>u.id);camera=[...state.map.spawns[0]];zoom=18;accumulator=0;lastFrame=-1;armed=null;groups={};}
  function title(){stopNetwork();mode='title';state=S.create();camera=[0,0];zoom=27;paused=false;selected=[];armed=null;returnEditor=false;replay=null;log=null;chapter=-1;}
  function order(command){if(paused){message('Resume the match before issuing orders');return;}if(replay){message('Replay controls: Escape pause, Tab speed, F10 menu');return;}const c={ids:[...selected],...command};if(online){if(connected)engine.network.send({type:'order',seq:++seq,command:c});else message('Reconnecting; orders are paused');}else{const error=S.command(state,team,c);if(error)message(error);else {if(log&&!R.append(log,state.frame,team,c)){log=null;message('Replay command limit reached (1400).');}sound('order');}}}
  function saveReplay(){if(!log){message('No solo recording available');return;}log.endFrame=state.frame;if(state.frame-log.initial.frame>72000){message('Replay duration exceeds two hours');return;}persist('replay',log);}
  function openCampaign(){stopNetwork();const progress=load('campaign');unlocked=S.clamp(Number.isInteger(progress?.unlocked)?progress.unlocked:0,0,2);campaignIndex=unlocked;mode='campaign';}
  function startChapter(){const data=R.campaign(campaignIndex);returnEditor=false;solo('skirmish',data.map,{ai:data.ai,chapter:campaignIndex});}
  function watchReplay(){try{const player=R.replay(load('replay'));stopNetwork();replay=player;state=player.state;log=null;chapter=-1;team=0;mode='playing';paused=false;replaySpeed=1;selected=[];camera=[...state.map.spawns[0]];zoom=18;accumulator=0;returnEditor=false;}catch(e){message('Cannot load replay: '+e.message);}}
  function selectHero(){const h=state.units.find(u=>u.team===team&&u.kind==='hero'&&u.hp>0);if(h){selected=[h.id];camera=[h.x,h.z];}}
  function enterEditor(){stopNetwork();returnEditor=false;mode='editor';paused=false;selected=[];state=S.create(editMap.mode,{map:editMap});camera=[0,0];zoom=29;undo=[];brush=0;message('Paint terrain / place objects. F5 save, F6 load, F7 play your map.');}
  function editorState(){editMap=S.validateMap(editMap);state=S.create(editMap.mode,{map:editMap});lastFrame=-1;}
  function paint(p){const i=S.index(p.x,p.z);if(i===paintCell)return;paintCell=i;undo.push(S.clone(editMap));if(undo.length>20)undo.shift();const [cx,cz]=S.cell(p.x,p.z),x=cx*2-31,z=cz*2-31;
    if(brush<3)editMap.terrain[i]=brush;
    else if(brush===6||brush===7){editMap.spawns[brush-6]=[S.clamp(x,-27,27),S.clamp(z,-27,27)];}
    else if(brush===8)editMap.props=editMap.props.filter(v=>Math.hypot(v.x-x,v.z-z)>2);
    else if(editMap.props.length<100){editMap.props=editMap.props.filter(v=>Math.hypot(v.x-x,v.z-z)>1);editMap.props.push({kind:['tree','mine','camp'][brush-3],x,z,amount:brush===4?9000:600});}
    try{editorState();}catch(e){editMap=undo.pop();message(e.message);}
  }
  function connect(action){stopNetwork();online=true;intent=action;mode='connecting';retry=time;reconnectUntil=time+8;message('Connecting to '+address);}
  function receive(){
    for(const e of engine.network.poll()){
      if(e.type==='connected'){connected=true;lastReceive=time;engine.network.send({type:'hello',protocol:1,name:'Commander'});}
      if(e.type==='closed'){connected=false;if(online&&token){mode='reconnecting';intent='resume';retry=time+.5;reconnectUntil=time+12;message('Connection lost. Reconnecting...');}else if(online){online=false;mode='network';message('Connection failed. Start server.mjs and check the address.');}}
      if(e.type!=='message')continue;const m=e.data;lastReceive=time;
      if(m.type==='welcome'){
        if(intent==='create')engine.network.send({type:'create',mode:editMap.mode==='moba'?'moba':'skirmish',map:editMap.mode==='td'?S.defaultMap():editMap,faction});
        if(intent==='browse'){engine.network.send({type:'list'});mode='rooms';}
        if(intent==='resume')engine.network.send({type:'resume',code,token});
      }
      if(m.type==='joined'){team=m.team;token=m.token;code=m.code;seq=0;if(m.state){state=m.state;mode='playing';}else mode='lobby';selected=[];camera=[...(m.state?.map.spawns[team]||[team?23:-23,team?-23:23])];zoom=18;}
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
  function screenWorld(u,input){const [w,h]=input.viewport||[1280,720],scale=Math.sqrt(w/1280*h/720);return {x:(u.x-camera[0])/zoom*h/2/scale,y:(u.z-camera[1])*sin/zoom*h/2/scale};}
  function hovered(button,p){return Math.abs(p.x-button.x)<button.w/2&&Math.abs(p.y-button.y)<button.h/2;}
  function saveMap(){try{editMap=S.validateMap(editMap);persist('map'+slot,editMap);}catch(e){message(e.message);}}
  function restoreMap(){const map=load('map'+slot);if(map){try{editMap=S.validateMap(map);editorState();message('Loaded map slot '+slot);}catch(e){message(e.message);}}else message('Map slot '+slot+' is empty');}
  function primary(){
    if(mode==='campaign'){startChapter();return;}if(mode==='triggers'){mode='editor';editorState();return;}
    if(mode==='network')connect('create');else if(mode==='rooms'){if(rooms[roomIndex])engine.network.send({type:'join',code:rooms[roomIndex].code,faction});else engine.network.send({type:'list'});}
    else if(mode==='lobby'){const p=room?.players.find(p=>p.team===team);if(!p?.ready)engine.network.send({type:'ready',ready:true});else if(room?.owner===team)engine.network.send({type:'start'});}
    else if(mode==='address'){address=edit||'127.0.0.1:7788';mode='network';}
    else if(mode==='finished'){if(returnEditor)enterEditor();else title();}
  }
  function action(id){
    if(id==='solo'){returnEditor=false;solo('skirmish');}else if(id==='moba'){returnEditor=false;solo('moba');}else if(id==='td'){returnEditor=false;solo('td');}
    else if(id==='campaign')openCampaign();else if(id==='replay')watchReplay();else if(id==='editor')enterEditor();else if(id==='network'){mode='network';}else if(id==='faction'){faction=(faction+1)%4;message(S.factions[faction]+': '+['balanced army','12% more health','12% faster movement','10% more attack damage'][faction]);}
    else if(id==='continue'){try{const saved=R.restore(load('quicksave'));stopNetwork();state=saved;replay=null;log=R.recording(state);chapter=Number.isInteger(state.chapter)?S.clamp(state.chapter,-1,2):-1;team=0;mode='playing';paused=false;returnEditor=false;camera=[...state.map.spawns[0]];zoom=18;selected=[];accumulator=0;}catch(e){message('Cannot load saved game: '+e.message);}}
    else if(id==='modalPrimary')primary();else if(id==='modalBack')title();else if(id.startsWith('action')){const a=actions[Number(id.slice(6))];if(a)a.run();}
  }
  function updateActions(){
    actions=[];const add=(label,run)=>actions.push({label,run});
    if(mode==='editor'){
      ['Grass [1]','Water [2]','Road [3]','Tree [4]','Mine [5]','Camp [6]','Blue spawn [7]','Red spawn [8]','Erase [9]'].forEach((n,i)=>add((brush===i?'> ':'')+n,()=>brush=i));add('SAVE [F5]',saveMap);add('LOAD [F6]',restoreMap);add('PLAY [F7]',()=>{try{editMap=S.validateMap(editMap);returnEditor=true;solo(editMap.mode,editMap);}catch(e){message(e.message);}});return;
    }
    const u=state.units.find(u=>selected.includes(u.id)&&u.team===team&&u.hp>0);if(!u)return;
    if(u.kind==='worker'){
      for(const [kind,key] of [['farm','F'],['barracks','B'],['tower','T'],['altar','L']])add(S.types[kind].label+' ['+key+']',()=>{armed={type:'build',kind};message('Choose a site within 15 units of the worker');});
    }else if(u.kind==='hero'){
      ['Frost nova [Q]','Restoration [W]','Blink [E]','Blizzard [R]'].forEach((n,i)=>add(n+(u.spell[i]>.1?' '+Math.ceil(u.spell[i])+'s':''),()=>{armed={type:'spell',slot:i};message('Left click a target within 14 units');}));
      S.items.forEach((item,i)=>add(item.name+' '+item.gold,()=>order({type:'buy',item:i})));
    }else if(['hall','barracks','altar'].includes(u.kind)){
      const kinds={hall:['worker'],barracks:['soldier','archer','knight','mage'],altar:['hero']}[u.kind];for(const kind of kinds)add(S.types[kind].label+' '+S.types[kind].gold,()=>order({type:'train',kind}));if(u.kind==='barracks')add('Weapons +6 [U]',()=>order({type:'upgrade'}));
    }
    add('Attack move [A]',()=>armed={type:'attackMove'});add('Stop [S]',()=>order({type:'stop'}));add('Hero [Space]',selectHero);
  }
  function controls(input,dt){
    const press=k=>input.pressedKeys.includes(k),held=k=>input.keys.includes(k),p=screenPointer(input),w=worldPointer(input);updateActions();
    if(press('F10')){if(returnEditor)enterEditor();else title();return;}
    if(mode==='campaign'){if(press('ArrowUp'))campaignIndex=Math.max(0,campaignIndex-1);if(press('ArrowDown'))campaignIndex=Math.min(unlocked,campaignIndex+1);if(press('Enter'))startChapter();}
    else if(mode==='triggers'){
      const list=editMap.triggers??=[];if(press('Insert')&&list.length<24){undo.push(S.clone(editMap));list.push({event:'time',threshold:30,action:'message',team:0,value:3,x:Math.round(camera[0]),z:Math.round(camera[1]),text:'Objective updated'});triggerIndex=list.length-1;}
      if(press('ArrowUp'))triggerIndex=Math.max(0,triggerIndex-1);if(press('ArrowDown'))triggerIndex=Math.min(list.length-1,triggerIndex+1);
      const t=list[triggerIndex];if(t){if(input.pressedKeys.some(k=>['Delete','Tab','KeyA','KeyT','Equal','Minus','PageUp','PageDown'].includes(k))){undo.push(S.clone(editMap));if(undo.length>20)undo.shift();}
        if(press('Delete')){list.splice(triggerIndex,1);triggerIndex=Math.max(0,triggerIndex-1);}if(press('Tab'))t.event=['time','kills','enter','gold'][(['time','kills','enter','gold'].indexOf(t.event)+1)%4];if(press('KeyA'))t.action=['message','gold','spawn','victory'][(['message','gold','spawn','victory'].indexOf(t.action)+1)%4];if(press('KeyT'))t.team=1-t.team;
        if(press('Equal'))t.threshold=S.clamp(t.threshold+1,1,7200);if(press('Minus'))t.threshold=S.clamp(t.threshold-1,1,7200);if(press('PageUp'))t.value=S.clamp(t.value+1,1,2000);if(press('PageDown'))t.value=S.clamp(t.value-1,1,2000);
      }if(press('Enter')||press('Escape')||press('F8')){mode='editor';editorState();}
    }
    else if(mode==='address'){for(const k of input.pressedKeys){if(k==='Backspace')edit=edit.slice(0,-1);else if(/^Digit\d$/.test(k))edit+=k.slice(5);else if(k==='Period')edit+='.';else if(k==='Semicolon')edit+=':';else if(/^Key[A-Z]$/.test(k))edit+=k.slice(3).toLowerCase();}edit=edit.slice(0,64);if(press('Enter'))primary();if(press('Escape'))mode='network';}
    else if(mode==='network'){if(press('F1')){editMap=S.defaultMap('skirmish');connect('create');}if(press('F2')){editMap=S.defaultMap('moba');connect('create');}if(press('F3'))connect('browse');if(press('KeyI')){mode='address';edit=address;}if(press('Enter'))primary();}
    else if(mode==='rooms'){if(press('ArrowDown'))roomIndex=(roomIndex+1)%Math.max(1,rooms.length);if(press('ArrowUp'))roomIndex=(roomIndex+rooms.length-1)%Math.max(1,rooms.length);if(press('F5'))engine.network.send({type:'list'});if(press('Enter'))primary();}
    else if(mode==='lobby'||mode==='finished'){if(press('Enter'))primary();}
    else if(mode==='title'){if(press('F1'))action('solo');if(press('F2'))action('moba');if(press('F3'))action('td');if(press('F4'))enterEditor();if(press('F6'))openCampaign();if(press('F8'))watchReplay();if(press('Enter'))action('network');}
    else if(mode==='playing'||mode==='editor'){
      if(press('Escape')){if(armed)armed=null;else if(mode==='playing')paused=!paused;}
      if(mode==='editor'){
        if(press('F5'))saveMap();if(press('F6'))restoreMap();if(press('F7'))actions[11].run();
        if(press('F8')){mode='triggers';triggerIndex=0;}
        if(held('ControlLeft')&&press('KeyZ')&&undo.length){editMap=undo.pop();editorState();}
        for(let i=0;i<9;i++)if(press('Digit'+(i+1)))brush=i;
        if(press('Tab')){editMap.mode=['skirmish','moba','td'][(['skirmish','moba','td'].indexOf(editMap.mode)+1)%3];editorState();}
        if(press('BracketRight'))editMap.waveInterval=S.clamp(editMap.waveInterval+2,10,60);if(press('BracketLeft'))editMap.waveInterval=S.clamp(editMap.waveInterval-2,10,60);
        if(press('Equal'))editMap.startingGold=S.clamp(editMap.startingGold+100,100,2000);if(press('Minus'))editMap.startingGold=S.clamp(editMap.startingGold-100,100,2000);
        if(press('PageUp'))editMap.waves=S.clamp(editMap.waves+1,3,30);if(press('PageDown'))editMap.waves=S.clamp(editMap.waves-1,3,30);if(press('KeyN'))slot=slot%3+1;
      }else if(!paused){
        if(press('F9')&&!online&&!replay)saveReplay();if(press('Tab')&&replay)replaySpeed=replaySpeed===4?1:replaySpeed*2;
        if(press('F5')){if(online)message('Network matches are saved on the server during reconnect');else if(!replay)persist('quicksave',state);}
        if(press('Space'))selectHero();if(press('KeyA'))armed={type:'attackMove'};if(press('KeyS'))order({type:'stop'});
        const u=state.units.find(u=>selected.includes(u.id)&&u.team===team);
        if(u?.kind==='hero')for(const [i,k] of ['KeyQ','KeyW','KeyE','KeyR'].entries())if(press(k))armed={type:'spell',slot:i};
        if(u?.kind==='worker')for(const [k,kind] of [['KeyF','farm'],['KeyB','barracks'],['KeyT','tower'],['KeyL','altar']])if(press(k))armed={type:'build',kind};
        if(press('KeyU'))order({type:'upgrade'});
        for(let i=1;i<=9;i++)if(press('Digit'+i)){if(held('ControlLeft'))groups[i]=[...selected];else selected=[...(groups[i]||[])];}
      }
      if(held('ArrowLeft'))camera[0]-=dt*20;if(held('ArrowRight'))camera[0]+=dt*20;if(held('ArrowUp'))camera[1]-=dt*20;if(held('ArrowDown'))camera[1]+=dt*20;
      if(press('Home'))zoom=S.clamp(zoom-3,12,36);if(press('End'))zoom=S.clamp(zoom+3,12,36);camera=camera.map(v=>S.clamp(v,-25,25));
    }
    if(input.pressedButtons.includes(0)){
      const group=mode==='title'?'menu':['playing','editor'].includes(mode)?'hud':'modal',b=FrostButtons.find(b=>b.group===group&&hovered(b,p)&&(!b.id.startsWith('action')||actions[Number(b.id.slice(6))]));if(b){action(b.id);return;}
      if(['playing','editor'].includes(mode)&&p.x>-604&&p.x<-420&&p.y>185&&p.y<347){camera=[S.clamp((p.x+594)/160*64-32,-25,25),S.clamp((p.y-190)/144*64-32,-25,25)];return;}
      if(['playing','editor'].includes(mode)&&p.y<175&&p.y>-305&&!paused){if(mode==='editor'){paintCell=-1;paint(w);}else if(armed){order({...armed,x:w.x,z:w.z});armed=null;}else drag={start:p,end:p};}
    }
    if(mode==='editor'&&input.buttons.includes(0)&&p.y<175&&p.y>-305){paint(w);}
    if(drag){drag.end=p;if(input.releasedButtons.includes(0)){
      const large=Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>8;let ids=[];
      if(large)ids=state.units.filter(u=>u.team===team&&u.hp>0&&S.types[u.kind].speed).filter(u=>{const a=screenWorld(u,input);return a.x>=Math.min(p.x,drag.start.x)&&a.x<=Math.max(p.x,drag.start.x)&&a.y>=Math.min(p.y,drag.start.y)&&a.y<=Math.max(p.y,drag.start.y);}).map(u=>u.id);
      else {let nearest=null,best=25;for(const u of state.units){if(u.hp<=0||!S.isVisible(state,team,u))continue;const a=screenWorld(u,input),d=Math.hypot(a.x-p.x,a.y-p.y);if(d<best){nearest=u;best=d;}}if(nearest)ids=[nearest.id];}
      selected=(held('ShiftLeft')?[...new Set([...selected,...ids])]:ids).slice(0,40);drag=null;sound('order');
    }}
    if(mode==='playing'&&!paused&&input.pressedButtons.includes(2)&&p.y<175){armed=null;const target=state.units.find(u=>u.team!==team&&u.hp>0&&S.isVisible(state,team,u)&&Math.hypot(u.x-w.x,u.z-w.z)<2.5),r=state.resources.findIndex(r=>r.kind!=='camp'&&r.amount>0&&Math.hypot(r.x-w.x,r.z-w.z)<2.8),worker=state.units.some(u=>selected.includes(u.id)&&u.kind==='worker');if(target)order({type:'attack',target:target.id});else if(r>=0&&worker)order({type:'gather',resource:r});else order({type:'move',x:w.x,z:w.z});}
  }
  function render(input){
    const playing=['playing','finished','reconnecting'].includes(mode),editing=mode==='editor',world=playing||editing,modal=!['title','playing','editor'].includes(mode),allVisible=!playing;
    for(const n of Object.keys(entities)){if(n.startsWith('Menu '))show(n,mode==='title');if(n.startsWith('Modal '))show(n,modal);}
    for(const b of FrostButtons){const on=b.group==='menu'?mode==='title':b.group==='modal'?modal:world&&!!actions[Number(b.id.slice(6))];for(const suffix of [' border',' box',' label',' detail'])show(b.id+suffix,on);}
    for(const n of ['Header','Brand','Resources','Clock','Bottom','Bottom rule','Minimap','Selection title','Selection stats','Selection queue','Controls'])show(n,world);
    label('faction label',S.factions[faction].toUpperCase());
    transform('Strategy camera',[camera[0],42,camera[1]+32],[1,1,1],[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]);set('Strategy camera','Camera3D',{...authored['Strategy camera'].Camera3D,orthographic_size:zoom});
    const map=editing?editMap:state.map;
    for(let i=0;i<1024;i++){
      const kind=map.terrain[i],seen=allVisible||state.explored[team]?.[i],visible=allVisible||state.visible[team]?.[i],c=kind===1?[.08,.24,.3,1]:kind===2?[.37,.32,.23,1]:[.22+(i%7)*.005,.34+(i%3)*.008,.27,1],factor=visible?1:seen?.4:.13;
      if(state.mode==='td'&&kind===0&&S.defensePath(map).slice(1).some((p,j)=>{const a=S.defensePath(map)[j],x=i%32*2-31,z=Math.floor(i/32)*2-31;return Math.abs(a[0]-p[0])<1?Math.abs(x-p[0])<2&&z>=Math.min(a[1],p[1])&&z<=Math.max(a[1],p[1]):Math.abs(z-p[1])<2&&x>=Math.min(a[0],p[0])&&x<=Math.max(a[0],p[0]);})){c[0]=.42;c[1]=.36;c[2]=.25;}
      set('Tile '+i,'PbrMaterial',{base_color:c.map((v,j)=>j===3?v:v*factor),roughness:kind===1?.3:.95});
      if(i%2===0&&Math.floor(i/32)%2===0){const j=Math.floor(i/64)*16+(i%32)/2;show('Mini tile '+j,world);set('Mini tile '+j,'Image',{color:c.map((v,k)=>k===3?v:v*factor),raycast_target:false});}
    }
    for(let i=0;i<100;i++){const r=(editing?map.props:state.resources)[i],visible=r&&r.amount!==0&&(allVisible||state.explored[team]?.[S.index(r.x,r.z)]);if(!visible){transform('Prop '+i,hidden);continue;}const key=r.kind==='tree'?'tree':r.kind==='mine'?'rock-large':'rock-wide',asset=FrostArt[key];set('Prop '+i,'MeshRenderer',{mesh:asset.parts[0].mesh,material:asset.material});const scale=r.kind==='tree'?3.5:2.5;transform('Prop '+i,[r.x,0,r.z],[scale,scale,scale]);}
    for(let i=0;i<S.LIMIT;i++){
      const u=state.units[i],visible=u&&u.hp>0&&(allVisible||S.isVisible(state,team,u));if(!visible){for(const n of ['Unit ','Ring ','HP ','Flag '])transform(n+i,hidden);show('Mini unit '+i,false);continue;}
      const keys={worker:'Monk',soldier:'Warrior',archer:'Ranger',knight:'Warrior',mage:'Wizard',hero:'Cleric',hall:'Citadel',barracks:'Barracks',farm:'House',tower:'Citadel',altar:'Archery',creep:'Rogue',neutral:'Warrior'},key=keys[u.kind],asset=FrostArt[key],old=previous[u.id],walking=old&&Math.hypot(u.x-old.x,u.z-old.z)>.008;let yaw=old?.yaw||0;if(walking)yaw=Math.atan2(u.x-old.x,u.z-old.z);previous[u.id]={x:u.x,z:u.z,yaw};
      let mesh=asset.parts[0].mesh;if(asset.animations?.length){const desired=u.cd>.25&&u.kind!=='worker'?/Sword_Attack|Bow_Shoot|Staff_Attack|Punch/:walking?/^Run$|^Walk$/:/^Idle$/;let clip=asset.animations.findIndex(a=>desired.test(a.name));if(clip<0)clip=0;const frame=Math.floor(time*12)%asset.animations[clip].frames;mesh+='#pose='+clip+':'+frame;}
      set('Unit '+i,'MeshRenderer',{mesh,material:asset.material});const scale=S.types[u.kind].speed?(u.kind==='hero'?.85:u.kind==='knight'?.8:.65):({hall:3.4,barracks:3.8,farm:3,tower:1.8,altar:3.2}[u.kind]);transform('Unit '+i,[u.x,0,u.z],[scale,scale*Math.max(.15,u.built),scale],[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]);
      const picked=selected.includes(u.id),height=S.types[u.kind].speed?2.6:u.kind==='hall'?6.5:4;transform('Ring '+i,picked?[u.x,.04,u.z]:hidden,[S.types[u.kind].speed?1.8:4,.04,S.types[u.kind].speed?1.8:4]);transform('HP '+i,[u.x,height,u.z],[1.7*u.hp/u.maxHp,.1,.17]);set('HP '+i,'PbrMaterial',{base_color:u.team===team?[.18,.82,.47,1]:[.9,.2,.18,1],roughness:1});transform('Flag '+i,[u.x,height+.4,u.z],[.22,.3,.22]);set('Flag '+i,'PbrMaterial',{base_color:u.team===0?[.13,.56,1,1]:u.team===1?[.92,.18,.12,1]:[.75,.59,.24,1],roughness:1});
      show('Mini unit '+i,world);const r=authored['Mini unit '+i].RectTransform;set('Mini unit '+i,'RectTransform',{...r,anchored_position:world?[-594+(u.x+32)/64*160,190+(u.z+32)/64*144]:[5000,5000]});set('Mini unit '+i,'Image',{color:u.team===team?[.2,.7,1,1]:[1,.25,.15,1],raycast_target:false});
    }
    if(lastFrame!==state.frame){for(const e of state.events||[]){const id=fxSerial++%24;fx.push({id,e,until:time+(e.type==='spell'?.65:.22)});if(e.type==='spell')sound('spell');}lastFrame=state.frame;}
    fx=fx.filter(f=>f.until>time);for(let i=0;i<24;i++){const f=fx.findLast?fx.findLast(f=>f.id===i):[...fx].reverse().find(f=>f.id===i);set('FX '+i,'ParticleEmitter3D',{...authored['FX '+i].ParticleEmitter3D,playing:!!f,shape_radius:f?.e.type==='spell'?2:.2,color_start:f?.e.slot===1?[.2,1,.45,1]:f?.e.team===1?[1,.35,.12,1]:[.25,.7,1,1]});if(f)transform('FX '+i,[f.e.x,.6,f.e.z]);}
    const t=state.teams[team],pop=S.population(state,team),u=state.units.find(u=>selected.includes(u.id));
    label('Resources',editing?'WORLD EDITOR / '+map.mode.toUpperCase()+' / SLOT '+slot:'GOLD '+Math.floor(t.gold)+'    LUMBER '+Math.floor(t.wood)+'    SUPPLY '+pop.used+'/'+pop.cap+'    '+S.factions[t.faction].toUpperCase());
    label('Clock',editing?'TAB changes mode':state.mode==='td'?'WAVE '+Math.min(state.wave,map.waves)+'/'+map.waves+'  LIVES '+state.lives:(replay?'REPLAY '+replaySpeed+'x  ':online?'ONLINE  ':'SOLO  ')+Math.floor(state.frame/600)+':'+String(Math.floor(state.frame/10)%60).padStart(2,'0'));
    label('Selection title',editing?'TERRAIN & OBJECTS':selected.length>1?selected.length+' units selected':u?S.types[u.kind].label:'Your command awaits');
    label('Selection stats',editing?'Gold '+map.startingGold+'  [+ / -]\nWaves '+map.waves+'  [PgUp / PgDn]\nInterval '+map.waveInterval+'s  [[ / ]]':u?'Health '+Math.ceil(u.hp)+' / '+Math.ceil(u.maxHp)+'\nAttack '+Math.round(u.damage)+'  '+(u.kind==='hero'?'Level '+u.level+' / XP '+u.xp+'\nMana '+Math.floor(u.mana)+' / '+(150+u.level*10):'Armor research '+t.upgrade):'Left click / drag to select\nRight click to move or attack\nWorkers gather from mines and trees');
    label('Selection queue',editing?'Ctrl+Z undo / N slot / F8 triggers':u?.queue.length?'Training: '+u.queue.map(q=>q.kind+' '+Math.ceil(q.left)+'s').join(', '):u?.inventory.length?'Items: '+u.inventory.map(i=>S.items[i].name).join(', '):u?.built<1?'Building '+Math.floor(u.built*100)+'%':'');
    label('Controls',editing?'LMB paint / F5 save / F6 load / F7 test / F8 triggers / arrows pan':'Arrows pan / Space hero / Ctrl+1..9 groups / F5 save / F9 replay / Esc pause / F10 menu');
    for(let i=0;i<12;i++)label('action'+i+' label',actions[i]?.label||'');
    label('Status',paused?'PAUSED — Escape to resume':armed?'TARGET: '+(armed.kind||armed.type)+' — click ground / Escape cancels':time<noticeUntil?notice:state.map.objective||state.objectiveNotice||'');
    if(modal){
      let title='',body='',primaryLabel='CONTINUE';
      if(mode==='campaign'){title='THE NORTHERN CHRONICLES';body=R.chapters.map((c,i)=>(i===campaignIndex?'> ':'   ')+c.name+(i>unlocked?' [LOCKED]':'')).join('\n')+'\n\n'+R.chapters[campaignIndex].objective+'\n\nUp/Down select / Enter begins';primaryLabel='BEGIN CHAPTER';}
      if(mode==='triggers'){const t=editMap.triggers?.[triggerIndex];title='MAP TRIGGERS / '+(editMap.triggers?.length||0)+'/24';body=t?'Trigger '+(triggerIndex+1)+': '+t.event+' >= '+t.threshold+'  [Tab / +/-]\nAction: '+t.action+' x '+t.value+'  [A / PgUp / PgDn]\nTeam: '+(t.team===0?'Blue':'Red')+'  [T] / Region '+t.x+', '+t.z+'\n\nUp/Down select / Insert add / Delete remove\nNew regions use the camera center (radius 3).\nEach trigger fires once. Enter returns to terrain.':'Insert adds a trigger at the camera center.\n\nEvents: time (seconds), kills, enter region, gold\nActions: message, gold, soldiers, victory\n\nMove the camera before adding a region trigger.\nEnter returns to terrain.';primaryLabel='RETURN TO TERRAIN';}
      if(mode==='network'){title='MULTIPLAYER';body='Host address: '+address+'  [I to edit]\n\nF1  Host a skirmish     F2  Host an Ancients match\nF3  Browse rooms\n\nRun server.mjs on the host computer.\nCurrent map: '+editMap.name;primaryLabel='CREATE ROOM';}
      if(mode==='connecting'||mode==='reconnecting'){title='CONNECTING';body=address+'\n\n'+notice;primaryLabel='WAITING';}
      if(mode==='address'){title='SERVER ADDRESS';body=edit+'|\n\nType IPv4:port or localhost:port\nEnter applies the address.';primaryLabel='APPLY ADDRESS';}
      if(mode==='rooms'){title='JOIN A ROOM';body=rooms.length?rooms.map((r,i)=>(i===roomIndex?'> ':'   ')+r.code+' / '+r.name+' / '+r.players.length+'/2').join('\n'):'No rooms yet. F5 refreshes the list.';body+='\n\nUp/Down select / Enter joins / F5 refresh';primaryLabel='JOIN SELECTED';}
      if(mode==='lobby'){title='ROOM '+code;body=(room?.players||[]).map(p=>(p.team===team?'> ':'   ')+p.name+' / '+S.factions[p.faction]+' / '+(p.ready?'READY':'NOT READY')).join('\n')+'\n\nAll commanders must ready up.\nA vacant opponent slot is played by AI.\nThe host presses Enter again to start.';primaryLabel=room?.players.find(p=>p.team===team)?.ready?'START MATCH':'READY';}
      if(mode==='finished'){title=state.winner===team?'VICTORY':'DEFEAT';body=state.map.name+'\n\nEnemy units defeated: '+state.teams[team].kills+'\nBattle time: '+Math.floor(state.frame/600)+'m '+Math.floor(state.frame/10)%60+'s';primaryLabel=returnEditor?'RETURN TO EDITOR':'RETURN TO MENU';}
      label('Modal title',title);label('Modal text',body);label('modalPrimary label',primaryLabel);
    }
    show('Drag box',!!drag);if(drag){const a=authored['Drag box'].RectTransform;set('Drag box','RectTransform',{...a,anchored_position:[(drag.start.x+drag.end.x)/2,(drag.start.y+drag.end.y)/2],size_delta:[Math.abs(drag.start.x-drag.end.x),Math.abs(drag.start.y-drag.end.y)]});}
    label('Frost telemetry',JSON.stringify({mode,frame:state.frame,kind:state.mode,team,units:state.units.length,gold:state.teams[team].gold,selected,hero:state.units.find(u=>u.team===team&&u.kind==='hero'),paused,online,room:code,netStates,brush,slot,map:map.name,terrainWater:map.terrain.filter(v=>v===1).length,winner:state.winner,notice,replay:!!replay,replaySpeed,chapter,triggers:editMap.triggers?.length||0}));
  }
  function tick(dt){if(!initialized)init();dt=Math.min(.2,Math.max(0,dt));time+=dt;const input=engine.input||{keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};receive();controls(input,dt);
    if(mode==='playing'&&!online&&!paused){accumulator+=dt*(replay?replaySpeed:1);while(accumulator>=S.DT){if(replay)R.advance(replay);else S.tick(state);accumulator-=S.DT;}
      if(replay?.finished){paused=true;message('Replay complete. F10 returns to the menu.');}
      if(state.winner!==null){mode='finished';if(!replay){saveReplay();if(chapter>=0&&state.winner===0){const progress=load('campaign');persist('campaign',{unlocked:Math.max(Number.isInteger(progress?.unlocked)?progress.unlocked:0,Math.min(2,chapter+1))});}}sound('victory');}}
    if(time>=renderAt){renderAt=time+.08;render(input);}
  }
  return {tick};
})();
function onTick(dt){FrostClient.tick(dt);}
