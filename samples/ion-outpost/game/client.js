/* Native MEngine client: lobby, local prediction/reconciliation and presentation. */
var IonClient=(()=>{
  const S=Outpost;
  let initialized=false,entities={},authored={},sent={},mode='title',status='',address='127.0.0.1:7777',name='Ranger',edit='',intent='',online=false,connected=false,room=null,rooms=[],selection=0,id='local',token='',code='',state=null,predicted=null,pending=[],seq=0,accumulator=0,time=0,yaw=0,pitch=0,paused=false,lastLocked=false,lastEvent=-1,shotSerial=0,recoil=0,hit=0,hurt=0,lastHp=140,lastReload=0,displayPositions={},tracers=[],ping=0,pingAt=0,lastReceive=0,retryAt=0,retryUntil=0,netFrames=0,lastServerFrame=0,previousState=null,arrival=0,renderClock=0,menuDirty=true;
  const menuNames=['Menu shade','Menu rule','Menu eyebrow','Menu title','Menu tagline','Menu content','Menu status','Menu footer','Location label','Location sublabel'];
  const hudNames=['HUD header','HUD brand','HUD clock','HUD network','Vitals panel','Health','Shield','Health rail','Health fill','Ammo panel','Ammo','Weapon','Hint','Kill feed','Cross left','Cross right','Cross top','Cross bottom','Hit marker','Center notice','Damage border'];
  const visibility={},hiddenTransforms={},actorModels={};
  let verifiedFrames=0,resyncs=0;
  function set(n,c,value){const e=entities[n];if(!e)return;const key=n+'/'+c,json=JSON.stringify(value);if(sent[key]===json)return;sent[key]=json;engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:e.entity,component:c,value}));}
  function q(y=0,p=0,r=0){const a=y/2,b=p/2,c=r/2;return [Math.cos(a)*Math.sin(b)*Math.cos(c)+Math.sin(a)*Math.cos(b)*Math.sin(c),Math.sin(a)*Math.cos(b)*Math.cos(c)-Math.cos(a)*Math.sin(b)*Math.sin(c),Math.cos(a)*Math.cos(b)*Math.sin(c)-Math.sin(a)*Math.sin(b)*Math.cos(c),Math.cos(a)*Math.cos(b)*Math.cos(c)+Math.sin(a)*Math.sin(b)*Math.sin(c)];}
  function move(n,position,rotation=[0,0,0,1],scale){const hidden=position[1]===-100;if(hidden&&hiddenTransforms[n])return;hiddenTransforms[n]=hidden;set(n,'Transform',{position,rotation,scale:scale||authored[n]?.Transform?.scale||[1,1,1]});}
  function label(n,text,color){set(n,'Text',{...authored[n].Text,text,...(color?{color}:{})});}
  function show(n,visible){if(visibility[n]===visible)return;visibility[n]=visible;const r=authored[n]?.RectTransform;if(r)set(n,'RectTransform',{...r,anchored_position:visible?r.anchored_position:[5000,5000]});}
  function sound(n){const e=entities['Sound '+n];if(e)engine.playAudio(e.entity);}
  function message(text){status=text;menuDirty=true;}
  function send(value){if(!engine.network.send(value))message('Network queue unavailable. Reconnect from the menu.');}
  function initialize(){
    for(const e of engine.snapshot.entities)if(e.name){entities[e.name]=e;authored[e.name]=e.components;}
    initialized=true;state=S.create();for(let i=0;i<6;i++)state.actors.push(S.actor('b'+i,['KESTREL','MANTIS','VECTOR','WRAITH','ECHO','NOMAD'][i],true,i));S.start(state);menuDirty=true;
  }
  function solo(){engine.network.close();online=false;connected=false;room=null;pending=[];seq=0;accumulator=0;lastEvent=-1;state=S.create();state.actors.push(S.actor('local',name,false,0));for(let i=1;i<6;i++)state.actors.push(S.actor('b'+i,['','KESTREL','MANTIS','VECTOR','WRAITH','ECHO'][i],true,i));S.start(state);id='local';const p=state.actors[0];yaw=p.yaw;pitch=0;mode='playing';paused=false;lastHp=140;menuDirty=true;}
  function connect(action){
    engine.network.close();intent=action;mode='connecting';online=true;connected=false;retryAt=Date.now()/1000+.1;retryUntil=Date.now()/1000+5;message('Connecting to '+address+' ...');
  }
  function joined(m){
    id=m.id;token=m.token;code=m.code;state=m.state;pending=[];lastEvent=state.frame-1;lastServerFrame=state.frame;netFrames=0;seq=state.actors.find(p=>p.id===id)?.ack||0;predicted=structuredCloneActor(state.actors.find(p=>p.id===id));yaw=predicted?.yaw||0;pitch=predicted?.pitch||0;paused=false;mode=state.phase==='playing'?'playing':'lobby';menuDirty=true;message(m.resumed?'Connection restored.':'Room '+code+' / Waiting for players');
  }
  function structuredCloneActor(p){return p?{...p,ammo:[...p.ammo],botPath:[]}:null;}
  function receive(){
    const now=Date.now()/1000;
    for(const event of engine.network.poll()){
      if(event.type==='connected'){connected=true;lastReceive=now;send({type:'hello',protocol:1,name});}
      if(event.type==='closed'){
        connected=false;if(online&&code&&token){intent='resume';retryAt=now+1;retryUntil=now+12;mode='reconnecting';message('Connection lost. Reconnecting ...');}else{mode='title';message('Cannot connect: '+(event.error||'server closed'));online=false;}menuDirty=true;
      }
      if(event.type!=='message')continue;const m=event.data;lastReceive=now;
      if(m.type==='welcome'){
        if(intent==='create')send({type:'create',name:name+"'s Outpost",bots:5});
        if(intent==='browse'){send({type:'list'});mode='browser';message('Choose a room and press ENTER.');}
        if(intent==='resume')send({type:'resume',code,token});
      }
      if(m.type==='joined')joined(m);
      if(m.type==='rooms'){rooms=m.rooms;selection=Math.min(selection,Math.max(0,rooms.length-1));menuDirty=true;}
      if(m.type==='room'){room=m;code=m.code;menuDirty=true;}
      if(m.type==='pong')ping=Math.max(0,Math.round((now-m.nonce)*1000));
      if(m.type==='error'){
        message(m.message);
        if(m.code==='resume_expired'||m.code==='room_missing'){code='';token='';mode='browser';send({type:'list'});}
      }
      if(m.type==='state'){
        if(!state||m.state.frame<=lastServerFrame)continue;
        previousState=state;arrival=time;
        const sameRoster=JSON.stringify(state.actors.map(p=>[p.id,p.connected]))===JSON.stringify(m.state.actors.map(p=>[p.id,p.connected]));
        const replay=state.phase===m.state.phase&&sameRoster?S.replayFrames(state,m.frames||[]):null;
        if(replay&&replay.frame===m.state.frame&&S.checksum(replay)===m.checksum){verifiedFrames+=replay.frame-state.frame;state=replay;}
        else{if(replay&&sameRoster&&state.phase===m.state.phase)resyncs++;state=m.state;}
        lastServerFrame=state.frame;netFrames+=(m.frames||[]).length;
        const p=state.actors.find(p=>p.id===id);pending=p?pending.filter(v=>v.seq>p.ack):[];
        predicted=structuredCloneActor(p);if(predicted)for(const input of pending)S.move(predicted,input);
        const prior=previousState?.actors.find(a=>a.id===id);if(p&&prior?.dead&&!p.dead){yaw=p.yaw;pitch=p.pitch;pending=[];predicted=structuredCloneActor(p);}
        if(state.phase==='playing'&&mode!=='playing'){mode='playing';paused=false;menuDirty=true;yaw=p?.yaw||0;pitch=p?.pitch||0;}
        if(state.phase==='finished'){mode='finished';menuDirty=true;}
      }
    }
    if((mode==='connecting'||mode==='reconnecting')&&!connected&&now>=retryAt){
      if(now>retryUntil){mode='title';online=false;engine.network.close();message('Connection timed out. Check the server address.');}
      else{engine.network.connect(address);retryAt=now+3.2;}
    }
    if(connected&&now-pingAt>2){pingAt=now;send({type:'ping',nonce:now});}
    if(connected&&now-lastReceive>7){engine.network.close();connected=false;mode='reconnecting';intent='resume';retryAt=now+.2;retryUntil=now+12;message('Server stopped responding. Reconnecting ...');}
  }
  function menu(input){
    const press=k=>input.pressedKeys.includes(k);
    if(press('F10')){if(connected)send({type:'leave'});engine.network.close();mode='title';online=false;connected=false;code='';token='';paused=false;menuDirty=true;message('');return;}
    if(mode==='address'||mode==='name'||mode==='code'){
      for(const key of input.pressedKeys){
        if(key==='Backspace')edit=edit.slice(0,-1);else if(/^Key[A-Z]$/.test(key))edit+=(mode==='code'?key.slice(3):key.slice(3).toLowerCase());else if(/^Digit[0-9]$/.test(key))edit+=key.slice(5);else if(key==='Period')edit+='.';else if(key==='Semicolon')edit+=':';else if(key==='Space'&&mode==='name')edit+=' ';
      }
      edit=edit.slice(0,mode==='code'?6:mode==='name'?20:64);menuDirty=true;
      if(press('Enter')){if(mode==='address'){address=edit||'127.0.0.1:7777';mode='title';}else if(mode==='name'){name=edit||'Ranger';mode='title';}else{send({type:'join',code:edit});mode='browser';}}
      if(press('Escape'))mode=connected?'browser':'title';return;
    }
    if(mode==='title'){
      if(press('F1'))solo();else if(press('Enter')){code='';token='';connect('create');}else if(press('F2')){code='';token='';connect('browse');}else if(press('F3')){mode='address';edit=address;}else if(press('F4')){mode='name';edit=name;}
      menuDirty=true;
    }else if(mode==='browser'){
      if(press('ArrowDown'))selection=(selection+1)%Math.max(1,rooms.length);if(press('ArrowUp'))selection=(selection+rooms.length-1)%Math.max(1,rooms.length);
      if(press('F5'))send({type:'list'});if(press('KeyJ')){mode='code';edit='';}if(press('Enter')&&rooms[selection])send({type:'join',code:rooms[selection].code});menuDirty=true;
    }else if(mode==='lobby'){
      const me=room?.players.find(p=>p.id===id);
      if(press('KeyR'))send({type:'ready',ready:!me?.ready});
      if(press('Enter')){if(!me?.ready)send({type:'ready',ready:true});else if(room?.owner===id)send({type:'start'});}
    }else if(mode==='finished'){
      if(press('Enter')){if(online)send({type:'start'});else solo();}
    }else if(mode==='playing'){
      if(press('Escape')){paused=!paused;menuDirty=true;}
      if(paused&&press('Enter')){paused=false;menuDirty=true;}
    }
  }
  function inputFrame(input){
    const keys=input.keys,held=k=>keys.includes(k),active=mode==='playing'&&!paused;
    const p=online?predicted:state.actors.find(p=>p.id===id);
    return {seq:++seq,frame:state.frame+pending.length+1,x:active?Number(held('KeyD'))-Number(held('KeyA')):0,z:active?Number(held('KeyW'))-Number(held('KeyS')):0,yaw,pitch,fire:active&&(input.buttons.includes(0)||held('KeyF')),reload:active&&held('KeyR'),jump:active&&held('Space'),sprint:active&&held('ShiftLeft'),weapon:held('Digit2')?1:held('Digit1')?0:p?.weapon||0};
  }
  function events(){
    for(const e of state.events||[]){
      if(e.frame<=lastEvent)continue;
      if(e.type==='shot'){
        tracers.push({...e,life:.075,index:shotSerial++%20});
        if(e.actor===id){recoil=1;sound(e.weapon===1?'scatter':'shot');if(e.hit){hit=.16;sound('hit');}}
      }
      if(e.type==='kill'&&e.killer===id){hit=.45;sound('kill');}
      if(e.type==='pickup'&&e.actor===id)sound('pickup');
    }
    lastEvent=Math.max(lastEvent,state.frame);
  }
  function present(dt,input){
    const playing=mode==='playing'||mode==='finished'||mode==='reconnecting',p=online?predicted:state.actors.find(p=>p.id===id);
    const me=p||state.actors[0];recoil=Math.max(0,recoil-dt*10);hit=Math.max(0,hit-dt);hurt=Math.max(0,hurt-dt*2.5);
    if(p&&playing){
      if(p.hp+p.shield<lastHp){hurt=1;sound('hurt');}lastHp=p.hp+p.shield;
      if(p.reloading>lastReload)sound('reload');lastReload=p.reloading;
    }
    for(let slot=0;slot<8;slot++){
      const actor=state.actors.find(a=>a.slot===slot),visible=actor&&!actor.dead&&actor.connected&&(!playing||actor.id!==id);
      const key=actor?.bot&&slot%2?'alien':'astronautA',old=displayPositions[slot];
      let pos=actor?[actor.x,actor.y,actor.z]:[0,-100,0];
      if(online&&actor){
        const previous=previousState?.actors.find(a=>a.id===actor.id),t=S.clamp((time-arrival)/.05,0,1);
        if(previous&&!previous.dead&&!actor.dead&&Math.hypot(previous.x-actor.x,previous.z-actor.z)<4)pos=[previous.x+(actor.x-previous.x)*t,previous.y+(actor.y-previous.y)*t,previous.z+(actor.z-previous.z)*t];
      }
      const walking=old?Math.hypot(pos[0]-old[0],pos[2]-old[2])>dt*.3:false;displayPositions[slot]=pos;
      move(`Actor ${slot}`,visible?pos:[0,-100,0],q((actor?.yaw||0)+Math.PI));
      if(visible){
        if(actorModels[slot]!==key){actorModels[slot]=key;const model=IonModels[key];for(const part of model.parts)set(`Actor ${slot}/${part.name}`,'MeshRenderer',{mesh:part.mesh,material:model.material});}
        for(const [part,sign] of [['legLeft',1],['legRight',-1],['armLeft',-1],['armRight',1]]){
          const n=`Actor ${slot}/${part}`,a=authored[n]?.Transform;if(a)move(n,a.position,q(0,walking?Math.sin(time*11+slot)*.5*sign:0));
        }
        const a=actor.yaw;move(`Actor ${slot} weapon`,[pos[0]+Math.cos(a)*.32-Math.sin(a)*.33,pos[1]+1.22,pos[2]-Math.sin(a)*.32-Math.cos(a)*.33],q(a,actor.pitch));
      }else move(`Actor ${slot} weapon`,[0,-100,0]);
    }
    if(playing&&me){
      const ads=input.buttons.includes(2)&&!paused&&!me.dead,bob=(input.keys.includes('KeyW')||input.keys.includes('KeyD')||input.keys.includes('KeyA')||input.keys.includes('KeyS'))?Math.sin(time*12)*.025:0;
      move('FPS Camera',[me.x,me.y+(me.dead ? .62 : 1.6)+bob,me.z],q(yaw,pitch+recoil*.012));
      set('FPS Camera','Camera3D',{...authored['FPS Camera'].Camera3D,fov_y_degrees:ads?52:input.keys.includes('ShiftLeft')?80:74,capture_pointer:mode==='playing'&&!paused});
      const reload=me.reloading?Math.sin(me.reloading/S.weapons[me.weapon].reload*Math.PI):0;
      move('View carbine',me.weapon===0&&!me.dead?[ads?.02:.25,-.28-bob-reload*.3,-.64+recoil*.075]:[0,-100,0],q(0,-reload*.6,reload*.18));
      move('View scatter',me.weapon===1&&!me.dead?[ads?.02:.25,-.27-bob-reload*.3,-.62+recoil*.12]:[0,-100,0],q(0,-reload*.6,reload*.18));
    }else{
      move('FPS Camera',[-19+Math.sin(time*.06)*3,12,25],q(-.54,-.27));set('FPS Camera','Camera3D',{...authored['FPS Camera'].Camera3D,capture_pointer:false});move('View carbine',[0,-100,0]);move('View scatter',[0,-100,0]);
    }
    set('Muzzle lamp','PointLight',{...authored['Muzzle lamp'].PointLight,intensity:recoil>.5?4:0});
    const used=new Set();tracers=tracers.filter(t=>(t.life-=dt)>0);
    for(const t of tracers){const delta=t.end.map((v,i)=>v-t.origin[i]),length=Math.hypot(...delta);move('Tracer '+t.index,t.origin.map((v,i)=>(v+t.end[i])/2),q(Math.atan2(delta[0],delta[2]),-Math.asin(delta[1]/Math.max(.01,length))),[.018,.018,length]);used.add(t.index);}
    for(let i=0;i<20;i++)if(!used.has(i))move('Tracer '+i,[0,-100,0]);
    S.pickups.forEach((point,i)=>move('Pickup '+i,state.pickups[i]?[0,-100,0]:[point[0],.3+Math.sin(time*2+i)*.12,point[1]],q(time*.5)));
    const overlay=!playing||paused;for(const n of menuNames)show(n,overlay);for(const n of hudNames)show(n,playing&&!overlay);
    if(overlay&&menuDirty){
      const title=paused?'FIELD\nPAUSE':mode==='lobby'?'SQUAD\nROOM':mode==='browser'?'ROOM\nBROWSER':'ION\nOUTPOST';label('Menu title',title);
      let copy='[ F1 ]   SOLO VS BOTS\n\n[ ENTER ]   CREATE ROOM\n[ F2 ]   BROWSE ROOMS\n[ F3 ]   SERVER ADDRESS\n[ F4 ]   PLAYER NAME';
      if(mode==='lobby')copy=`ROOM ${code}  /  ${room?.bots??5} BOTS\n`+(room?.players||[]).map(v=>`${v.ready?'READY':'WAIT '}  ${v.name}${v.id===room?.owner?' [HOST]':''}`).join('\n')+'\n\nR  READY     ENTER  START';
      if(mode==='browser')copy=rooms.length?rooms.slice(0,5).map((v,i)=>`${i===selection?'>':' '} ${v.code}  ${v.players}/8  ${v.phase}\n   ${v.name}`).join('\n'):'No rooms yet.\nCreate one from the main menu.';
      if(['address','name','code'].includes(mode))copy=`ENTER ${mode.toUpperCase()}\n\n${edit}_\n\nENTER  APPLY    ESC  CANCEL`;
      if(mode==='connecting'||mode==='reconnecting')copy='CONNECTING TO THE FRONTIER\n\n'+address+'\n\nF10  CANCEL';
      if(paused)copy='ENTER   RESUME\n\nF10   LEAVE MATCH\n\n'+(online?'The online match continues.':'Local simulation is paused.');
      label('Menu content',copy);label('Menu tagline',mode==='title'?`${name}  /  ${address}`:mode==='lobby'?'Ready up. Hold the outpost.':mode==='browser'?'ARROWS select / ENTER join / J room code':'DUSTLINE RESEARCH STATION');label('Menu status',status||(mode==='browser'?'F5 refresh  /  F10 main menu':''));menuDirty=false;
    }
    const score=mode==='finished'||(playing&&input.keys.includes('Tab'));for(const n of ['Score shade','Score title','Score rows','Score footer'])show(n,score);
    if(score){label('Score title',mode==='finished'?'MATCH COMPLETE':'FIELD ROSTER');label('Score rows',[...state.actors].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths).map((a,i)=>`${i+1}   ${a.name.padEnd(16)}  ${a.kills} K   ${a.deaths} D${a.id===id?'   YOU':''}`).join('\n'));label('Score footer',mode==='finished'?(online?'HOST: ENTER rematch  /  F10 leave':'ENTER rematch  /  F10 main menu'):'FIRST TO 20  /  3 MINUTES');}
    if(me&&playing){
      const gun=S.weapons[me.weapon];label('Health',String(me.hp).padStart(3,'0'));label('Shield','SHIELD  '+me.shield);label('Ammo',me.reloading?'RELOADING':`${me.ammo[me.weapon]} / ${gun.capacity}`);label('Weapon',gun.name);
      const r=authored['Health fill'].RectTransform,w=252*me.hp/100;set('Health fill','RectTransform',{...r,size_delta:[Math.max(.1,w),5],anchored_position:overlay?[5000,5000]:[-455-(252-w)/2,326]});
      const seconds=Math.max(0,Math.ceil(state.remaining/60));label('HUD clock',Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));
      label('HUD network',online?`${code} / ${ping} MS / 60 HZ`:'SOLO / 60 HZ');label('Hit marker',hit>0?'×':'');
      label('Hint',paused?'':me.dead?'':!input.pointerLocked?'CLICK GAME TO CAPTURE MOUSE  /  ESC RELEASE':me.reloading?'RELOADING ...':'R RELOAD   /   1-2 WEAPONS   /   TAB SCORE');
      label('Center notice',me.dead?`ELIMINATED\nRESPAWN IN ${Math.ceil(me.dead/60)}`:mode==='reconnecting'?'RECONNECTING ...':me.protection>0?'SPAWN PROTECTION':'');
      set('Damage border','Image',{color:[1,.14,.04,hurt],raycast_target:false});
      const names=new Map(state.actors.map(a=>[a.id,a.name]));label('Kill feed',(state.events||[]).filter(e=>e.type==='kill'&&state.frame-e.frame<420).slice(-4).map(e=>`${names.get(e.killer)||'Ranger'}  >  ${names.get(e.victim)||'Ranger'}${e.head?'  HEADSHOT':''}`).join('\n'));
    }
    if(time-renderClock>.2){renderClock=time;label('FPS telemetry',JSON.stringify({mode,online,connected,room:code,id,frame:state.frame,receivedFrames:netFrames,verifiedFrames,resyncs,pending:pending.length,ping,phase:state.phase,paused,player:me?{x:me.x,y:me.y,z:me.z,yaw,hp:me.hp,shield:me.shield,ammo:me.ammo,kills:me.kills,deaths:me.deaths}:null,actors:state.actors.length,shots:shotSerial}));}
  }
  function tick(dt){
    if(!initialized)initialize();dt=Math.min(.1,Math.max(0,dt));time+=dt;const input=engine.input;receive();menu(input);
    if(mode==='playing'&&!paused){
      if(input.pointerLocked){yaw=S.wrap(yaw-(input.pointerDelta?.[0]||0)*.0023);pitch=S.clamp(pitch-(input.pointerDelta?.[1]||0)*.0023,-1.35,1.35);}
      yaw=S.wrap(yaw+(Number(input.keys.includes('ArrowLeft'))-Number(input.keys.includes('ArrowRight')))*dt*1.8);pitch=S.clamp(pitch+(Number(input.keys.includes('ArrowUp'))-Number(input.keys.includes('ArrowDown')))*dt*1.3,-1.35,1.35);
    }
    if(mode==='playing'&&lastLocked&&!input.pointerLocked&&!paused){paused=true;menuDirty=true;}
    lastLocked=!!input.pointerLocked;
    accumulator+=dt;let count=0;
    while(accumulator>=S.DT&&count++<6){
      accumulator-=S.DT;
      if(online&&connected&&mode==='playing'){
        const command=inputFrame(input);if(pending.length<120){send({type:'input',input:command});pending.push(command);if(predicted)S.move(predicted,command);}
      }else if(!online){
        if(mode==='playing'&&!paused){const command=inputFrame(input),p=state.actors.find(a=>a.id===id),dead=p.dead;S.step(state,{[id]:command});if(dead&&!p.dead){yaw=p.yaw;pitch=p.pitch;}}
        else if(mode==='title'||mode==='address'||mode==='name')S.step(state);
        if(state.phase==='finished'&&mode==='playing'){mode='finished';menuDirty=true;}
      }
    }
    events();present(dt,input);
  }
  return {tick};
})();
function onTick(dt){IonClient.tick(dt);}
