import net from 'node:net';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const Sim=createRequire(import.meta.url)('./game/simulation.js');
export const PROTOCOL=1;

export function createOutpostServer({host='127.0.0.1',port=7777,autoTick=true}={}) {
  const rooms=new Map(),clients=new Set(),metrics={ticks:0,maxTickMs:0,discardedCatchupTicks:0};
  const safeName=value=>typeof value==='string'?value.replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,20):'';
  const send=(client,message)=>{if(client.socket.destroyed)return;if(client.socket.writableLength>262144){client.socket.destroy();return;}client.socket.write(JSON.stringify(message)+'\n');};
  const fail=(client,code,message)=>send(client,{type:'error',code,message});
  const members=room=>[...clients].filter(c=>c.room===room);
  const roster=room=>({type:'room',code:room.code,name:room.name,owner:room.owner,bots:room.bots,phase:room.state.phase,players:room.state.actors.filter(p=>!p.bot).map(p=>({id:p.id,name:p.name,ready:room.ready.has(p.id),connected:p.connected}))});
  const broadcast=(room,message)=>members(room).forEach(c=>send(c,message));
  const publish=room=>broadcast(room,roster(room));
  const electOwner=room=>{if(!room.state.actors.some(p=>p.id===room.owner&&p.connected))room.owner=room.state.actors.find(p=>!p.bot&&p.connected)?.id||room.owner;};
  function fillBots(room){
    room.state.actors=room.state.actors.filter(p=>!p.bot);
    const names=['KESTREL','MANTIS','VECTOR','WRAITH','ECHO','NOMAD','CIPHER'];
    for(let i=0;i<room.bots&&room.state.actors.length<Sim.MAX_PLAYERS;i++){
      const slot=Array.from({length:8},(_,n)=>n).find(n=>!room.state.actors.some(p=>p.slot===n));
      room.state.actors.push(Sim.actor('b'+i,names[i],true,slot));
    }
  }
  function leave(client,reserve=false){
    const room=client.room;if(!room)return;const p=room.state.actors.find(p=>p.id===client.id);
    if(reserve&&p){p.connected=false;room.expiry.set(p.id,Date.now()+15000);}
    else{
      room.state.actors=room.state.actors.filter(p=>p.id!==client.id);room.ready.delete(client.id);room.tokens.delete(client.id);room.expiry.delete(client.id);
    }
    room.inputs.delete(client.id);client.room=null;
    electOwner(room);
    if(!room.state.actors.some(p=>!p.bot)){rooms.delete(room.code);return;}
    publish(room);
  }
  function enter(client,room,resumeId=null){
    if(client.room)return fail(client,'already_in_room','Leave your current room first.');
    const humans=room.state.actors.filter(p=>!p.bot);
    if(!resumeId&&humans.length>=8)return fail(client,'room_full','This room has eight players.');
    client.room=room;client.id=resumeId||crypto.randomBytes(6).toString('hex');client.queue=[];client.lastSeq=0;client.lastInput=null;client.inputAt=0;
    let p=room.state.actors.find(p=>p.id===client.id);
    if(p){p.connected=true;client.lastSeq=p.ack;room.expiry.delete(client.id);}
    else{
      if(room.state.actors.length>=8)room.state.actors.splice(room.state.actors.findIndex(p=>p.bot),1);
      const slot=Array.from({length:8},(_,n)=>n).find(n=>!room.state.actors.some(p=>p.slot===n));
      p=Sim.actor(client.id,client.name,false,slot);room.state.actors.push(p);room.tokens.set(p.id,crypto.randomBytes(24).toString('hex'));
    }
    if(!room.owner)room.owner=p.id;
    electOwner(room);
    if(p.id===room.owner)room.ready.add(p.id);
    send(client,{type:'joined',id:p.id,token:room.tokens.get(p.id),code:room.code,state:Sim.snapshot(room.state),resumed:!!resumeId});publish(room);
  }
  function handle(client,m){
    if(!m||typeof m!=='object'||typeof m.type!=='string')return fail(client,'bad_message','Expected a protocol object.');
    if(m.type==='hello'){
      if(client.hello)return fail(client,'already_identified','Already identified.');
      if(m.protocol!==PROTOCOL){send(client,{type:'error',code:'protocol',message:'Protocol version mismatch.'});client.socket.end();return;}
      client.hello=true;client.name=safeName(m.name)||'Ranger';send(client,{type:'welcome',protocol:PROTOCOL,hz:Sim.HZ});return;
    }
    if(!client.hello)return fail(client,'hello_required','Send hello first.');
    if(m.type==='ping'){send(client,{type:'pong',nonce:typeof m.nonce==='number'?m.nonce:0});return;}
    if(m.type==='list'){send(client,{type:'rooms',rooms:[...rooms.values()].slice(0,32).map(r=>({code:r.code,name:r.name,players:r.state.actors.filter(p=>!p.bot).length,phase:r.state.phase}))});return;}
    if(m.type==='leave'){leave(client);send(client,{type:'left'});return;}
    if(m.type==='create'){
      if(client.room)return fail(client,'already_in_room','Leave your current room first.');
      if(rooms.size>=32)return fail(client,'server_full','The server has reached its room limit.');
      let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
      const room={code,name:safeName(m.name)||'Ion Outpost',owner:null,bots:Number.isInteger(m.bots)?Sim.clamp(m.bots,0,7):5,state:Sim.create(),ready:new Set(),tokens:new Map(),expiry:new Map(),inputs:new Map(),frames:[],created:Date.now()};
      rooms.set(code,room);enter(client,room);return;
    }
    if(m.type==='join'||m.type==='resume'){
      const room=rooms.get(typeof m.code==='string'?m.code.toUpperCase():'');if(!room)return fail(client,'room_missing','Room not found.');
      if(m.type==='resume'){
        const id=[...room.tokens].find(([id,token])=>typeof m.token==='string'&&m.token===token&&room.expiry.has(id)&&room.expiry.get(id)>Date.now())?.[0];
        if(!id)return fail(client,'resume_expired','Reconnect reservation expired. Join the room again.');
        enter(client,room,id);
      }else enter(client,room);
      return;
    }
    const room=client.room;if(!room)return fail(client,'room_required','Create or join a room first.');
    if(m.type==='ready'){if(m.ready===true)room.ready.add(client.id);else room.ready.delete(client.id);publish(room);return;}
    if(m.type==='start'){
      if(room.owner!==client.id)return fail(client,'owner_required','Only the room owner can start.');
      if(room.state.phase==='playing')return fail(client,'already_playing','The match is already running.');
      if(room.state.actors.some(p=>!p.bot&&p.connected&&!room.ready.has(p.id)))return fail(client,'not_ready','Wait for every player to be ready.');
      fillBots(room);room.state.round++;Sim.start(room.state);room.frames=[];
      for(const c of members(room)){c.queue=[];c.lastInput=null;}publish(room);broadcast(room,{type:'state',state:Sim.snapshot(room.state),checksum:Sim.checksum(room.state),frames:[]});return;
    }
    if(m.type==='input'){
      const input=Sim.cleanInput(m.input);
      if(!input||input.seq<=client.lastSeq||input.seq>client.lastSeq+240||Math.abs(input.frame-room.state.frame)>120)return fail(client,'invalid_input','Invalid, stale or future input.');
      if(client.queue.length>=12)return fail(client,'input_backlog','Input queue is full.');
      client.lastSeq=input.seq;client.queue.push(input);return;
    }
    fail(client,'unknown_message','Unknown message type.');
  }
  const server=net.createServer(socket=>{
    if(clients.size>=64||[...clients].filter(c=>c.socket.remoteAddress===socket.remoteAddress).length>=16){socket.destroy();return;}
    socket.setNoDelay(true);socket.setTimeout(12000,()=>socket.destroy());
    const client={socket,hello:false,name:'Ranger',buffer:'',room:null,id:null,queue:[],lastSeq:0,lastInput:null,inputAt:0,rateAt:Date.now(),rate:0};clients.add(client);
    socket.setEncoding('utf8');send(client,{type:'hello',protocol:PROTOCOL});
    socket.on('data',chunk=>{
      client.buffer+=chunk;
      if(Buffer.byteLength(client.buffer,'utf8')>65536){socket.destroy();return;}
      let end;
      while((end=client.buffer.indexOf('\n'))>=0){
        const line=client.buffer.slice(0,end);client.buffer=client.buffer.slice(end+1);
        if(Buffer.byteLength(line,'utf8')>16384){socket.destroy();return;}
        if(Date.now()-client.rateAt>=1000){client.rateAt=Date.now();client.rate=0;}
        if(++client.rate>180){socket.destroy();return;}
        try{handle(client,JSON.parse(line));}catch{fail(client,'bad_json','Malformed message.');}
      }
    });
    socket.on('error',()=>{});socket.on('close',()=>{leave(client,true);clients.delete(client);});
  });
  function tick(){
    const started=performance.now();
    for(const room of rooms.values()){
      for(const [id,expires] of room.expiry)if(expires<=Date.now()){
        room.state.actors=room.state.actors.filter(p=>p.id!==id);room.expiry.delete(id);room.tokens.delete(id);room.ready.delete(id);electOwner(room);publish(room);
      }
      if(!room.state.actors.some(p=>!p.bot)){rooms.delete(room.code);continue;}
      const inputs={};
      for(const c of members(room)){
        const next=c.queue.shift();if(next){c.lastInput=next;c.inputAt=room.state.frame;}
        if(c.lastInput&&room.state.frame-c.inputAt<15)inputs[c.id]=c.lastInput;
      }
      const before=room.state.phase;Sim.step(room.state,inputs);
      room.frames.push({frame:room.state.frame,inputs});
      if(room.state.frame%3===0){broadcast(room,{type:'state',state:Sim.snapshot(room.state),checksum:Sim.checksum(room.state),frames:room.frames});room.frames=[];}
      if(before!==room.state.phase)publish(room);
    }
    metrics.ticks++;metrics.maxTickMs=Math.max(metrics.maxTickMs,performance.now()-started);
  }
  let last=performance.now(),accumulator=0;
  const timer=autoTick?setInterval(()=>{const now=performance.now();accumulator+=(now-last)/1000;last=now;let count=0;while(accumulator>=Sim.DT&&count++<8){tick();accumulator-=Sim.DT;}if(accumulator>Sim.DT*8){metrics.discardedCatchupTicks+=Math.floor(accumulator/Sim.DT);accumulator=0;}},4):null;
  const listening=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolve(server.address()));});
  return {server,rooms,clients,metrics,tick,listening,async close(){if(timer)clearInterval(timer);for(const c of clients)c.socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
  const app=createOutpostServer({host:option('--host','127.0.0.1'),port:Number(option('--port','7777'))});
  const address=await app.listening;console.log(`Ion Outpost / TCP ${address.address}:${address.port} / 60 Hz / protocol ${PROTOCOL}`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
