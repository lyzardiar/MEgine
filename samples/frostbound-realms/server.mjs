// Author: MiYu. Authoritative TCP JSON-lines rooms; the native client sends orders only.
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const S=createRequire(import.meta.url)('./game/simulation.js');
export function createServer({host='127.0.0.1',port=7788}={}) {
  const rooms=new Map(),clients=new Set();
  const send=(c,m)=>{if(c.socket.destroyed)return;if(c.socket.writableLength>262144){c.socket.destroy();return;}c.socket.write(JSON.stringify(m)+'\n');};
  const fail=(c,message)=>send(c,{type:'error',message});
  function roomInfo(r){return {type:'room',code:r.code,mode:r.map.mode,name:r.map.name,phase:r.phase,owner:r.owner,players:r.players.map(p=>({team:p.team,name:p.name,ready:p.ready,online:!!p.client,faction:p.faction,heroClass:p.heroClass}))};}
  function publish(r){for(const p of r.players)if(p.client)send(p.client,roomInfo(r));}
  function view(r,p){const state=S.publicState(r.state,p.team);for(const u of state.units){delete u.path;delete u.dest;delete u.route;delete u.home;}state.events=state.events.slice(-24);return state;}
  function leave(c,retain=false){const r=c.room,p=c.player;if(!r||!p)return;c.room=null;c.player=null;p.client=null;p.expires=Date.now()+(retain?15000:0);if(!retain){r.players=r.players.filter(v=>v!==p);if(r.state)r.state.teams[p.team].ai=true;}if(!r.players.some(v=>v.client)&&!retain)rooms.delete(r.code);else {if(!r.players.some(v=>v.team===r.owner&&v.client))r.owner=r.players.find(v=>v.client)?.team??r.owner;publish(r);}}
  function join(c,r,p){leave(c);p.client=c;p.expires=0;c.room=r;c.player=p;c.lastSeq=0;send(c,{type:'joined',team:p.team,token:p.token,code:r.code,state:r.state?view(r,p):null});publish(r);}
  function handle(c,m){
    if(!m||typeof m!=='object'||Array.isArray(m))return fail(c,'Invalid message');
    if(m.type==='hello'){if(m.protocol!==14)return fail(c,'Protocol version mismatch');c.hello=true;c.name=String(m.name||'Commander').replace(/[\r\n]/g,'').slice(0,20);return send(c,{type:'welcome',protocol:14});}
    if(!c.hello)return fail(c,'Handshake required');
    if(m.type==='ping')return send(c,{type:'pong',nonce:typeof m.nonce==='number'?m.nonce:0});
    if(m.type==='list')return send(c,{type:'rooms',rooms:[...rooms.values()].map(roomInfo)});
    if(m.type==='leave'){leave(c);return;}
    if(['create','join','pick'].includes(m.type)&&m.heroClass!==undefined&&!S.validHero(m.heroClass))return fail(c,'Invalid hero selection');
    if(m.type==='create'){
      if(rooms.size>=24)return fail(c,'Server room limit reached');let map;try{map=S.validateMap(m.map||S.defaultMap(m.mode));}catch(e){return fail(c,e.message);}
      if(!['skirmish','moba'].includes(map.mode))return fail(c,'This map is single player');
      const code=randomBytes(3).toString('hex').toUpperCase(),r={code,map,players:[],owner:0,phase:'lobby',state:null,queue:[]};rooms.set(code,r);
      const p={team:0,token:randomBytes(18).toString('hex'),name:c.name,ready:false,heroClass:m.heroClass??0,faction:S.clamp(Number.isInteger(m.faction)?m.faction:0,0,3)};r.players.push(p);join(c,r,p);return;
    }
    if(m.type==='join'){
      const r=rooms.get(String(m.code).toUpperCase());if(!r||r.phase!=='lobby')return fail(c,'Room not available');if(r.players.length>=2)return fail(c,'Room is full');
      const p={team:r.players.some(p=>p.team===0)?1:0,token:randomBytes(18).toString('hex'),name:c.name,ready:false,heroClass:m.heroClass??0,faction:S.clamp(Number.isInteger(m.faction)?m.faction:1,0,3)};r.players.push(p);join(c,r,p);return;
    }
    if(m.type==='resume'){const r=rooms.get(String(m.code)),p=r?.players.find(v=>v.token===m.token&&!v.client&&v.expires>Date.now());if(!p)return fail(c,'Reconnect token expired');join(c,r,p);return;}
    const r=c.room,p=c.player;if(!r||!p)return fail(c,'Join a room first');
    if(m.type==='pick'){if(r.phase!=='lobby')return fail(c,'Match already started');if(!S.validHero(m.heroClass))return fail(c,'Invalid hero selection');p.heroClass=m.heroClass;for(const v of r.players)v.ready=false;publish(r);return;}
    if(m.type==='ready'){if(r.phase!=='lobby')return fail(c,'Match already started');p.ready=!!m.ready;publish(r);return;}
    if(m.type==='start'){
      if(p.team!==r.owner)return fail(c,'Only the host can start');if(r.phase==='playing')return fail(c,'Match already started');if(r.players.some(v=>!v.ready||!v.client))return fail(c,'All commanders must be ready');
      r.state=S.create(r.map.mode,{map:r.map,ai:[0,1].map(t=>!r.players.some(p=>p.team===t)),heroes:[0,1].map(t=>r.players.find(p=>p.team===t)?.heroClass??r.map.players[t].heroClass),factions:[0,1].map(t=>r.players.find(p=>p.team===t)?.faction||0)});r.phase='playing';r.queue=[];publish(r);for(const v of r.players)if(v.client)send(v.client,{type:'state',state:view(r,v)});return;
    }
    if(m.type==='order'){
      if(r.phase!=='playing'||!Number.isSafeInteger(m.seq)||m.seq<=c.lastSeq||m.seq>c.lastSeq+1000)return fail(c,'Stale or invalid order');if(r.queue.filter(q=>q.team===p.team).length>=12)return fail(c,'Order queue full');c.lastSeq=m.seq;r.queue.push({team:p.team,command:m.command,client:c});return;
    }
    return fail(c,'Unknown message');
  }
  const server=net.createServer(socket=>{
    if(clients.size>=48||[...clients].filter(c=>c.socket.remoteAddress===socket.remoteAddress).length>=8){socket.destroy();return;}
    socket.setNoDelay(true);socket.setTimeout(12000,()=>socket.destroy());socket.setEncoding('utf8');const c={socket,buffer:'',hello:false,name:'Commander',room:null,player:null,lastSeq:0,rate:0,rateAt:Date.now()};clients.add(c);
    socket.on('data',chunk=>{c.buffer+=chunk;if(Buffer.byteLength(c.buffer)>1048576)return socket.destroy();let end;while((end=c.buffer.indexOf('\n'))>=0){const line=c.buffer.slice(0,end);c.buffer=c.buffer.slice(end+1);if(Date.now()-c.rateAt>1000){c.rateAt=Date.now();c.rate=0;}if(++c.rate>40||Buffer.byteLength(line)>524288)return socket.destroy();try{handle(c,JSON.parse(line));}catch{fail(c,'Invalid request');}}});
    socket.on('error',()=>{});socket.on('close',()=>{leave(c,true);clients.delete(c);});
  });
  const interval=setInterval(()=>{
    for(const r of rooms.values()){
      for(const p of [...r.players])if(!p.client&&p.expires<=Date.now()){r.players=r.players.filter(v=>v!==p);if(r.state)r.state.teams[p.team].ai=true;}
      if(!r.players.length){rooms.delete(r.code);continue;}if(r.phase!=='playing'&&!(r.phase==='finished'&&r.state.corpses.length))continue;
      for(const q of r.queue){const err=S.command(r.state,q.team,q.command);if(err&&q.client.room===r)fail(q.client,err);}r.queue=[];S.tick(r.state);
      for(const p of r.players)if(p.client)send(p.client,{type:'state',state:view(r,p)});
      if(r.state.winner!==null&&r.phase!=='finished'){r.phase='finished';publish(r);}
    }
  },S.DT*1000);
  const listening=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>resolve(server.address()));});
  return {rooms,clients,server,listening,close:()=>new Promise(resolve=>{clearInterval(interval);for(const c of clients)c.socket.destroy();server.close(resolve);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),app=createServer({host:args.includes('--host')?args[args.indexOf('--host')+1]:'127.0.0.1',port:args.includes('--port')?Number(args[args.indexOf('--port')+1]):7788});console.log('Frostbound server',await app.listening);}
