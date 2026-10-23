// Author: MiYu. Exercise room-local chat, private history and host start through real TCP sockets.
import net from 'node:net';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),{port}=await app.listening,clients=[];
async function client(name){
  const socket=net.createConnection({host:'127.0.0.1',port}),messages=[];let buffer='';socket.setEncoding('utf8');socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){messages.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);}});
  const c={socket,messages,send:m=>socket.write(JSON.stringify(m)+'\n'),wait:async predicate=>{const deadline=Date.now()+5000;for(;;){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];assert.ok(Date.now()<deadline,'Expected TCP message');await new Promise(r=>setTimeout(r,10));}}};clients.push(c);
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});c.send({type:'hello',protocol:S.PROTOCOL,name});await c.wait(m=>m.type==='welcome');return c;
}
try{
  const host=await client('房主'),guest=await client('客人'),outsider=await client('旁观浏览者');
  host.send({type:'create',mode:'skirmish'});const joined=await host.wait(m=>m.type==='joined');guest.send({type:'join',code:joined.code});const member=await guest.wait(m=>m.type==='joined');await guest.wait(m=>m.type==='room');
  host.send({type:'chat',text:'你好\n队友 😀',name:'forged',seat:99});const a=await host.wait(m=>m.type==='chat'),b=await guest.wait(m=>m.type==='chat');assert.deepEqual(a,b);assert.equal(a.name,'房主');assert.equal(a.seat,0);assert.equal(a.text,'你好 队友 😀');
  outsider.send({type:'chat',text:'intrude'});assert.match((await outsider.wait(m=>m.type==='error')).message,/Join a room/);outsider.send({type:'list'});const list=await outsider.wait(m=>m.type==='rooms');assert.equal('chat' in list.rooms[0],false);assert.equal(outsider.messages.some(m=>m.type==='chat'),false);
  guest.socket.destroy();await new Promise(resolve=>setTimeout(resolve,60));const resumed=await client('重连');resumed.send({type:'resume',code:member.code,token:member.token});const history=await resumed.wait(m=>m.type==='joined');assert.deepEqual(history.chat,[a]);
  const room=app.rooms.get(joined.code);room.chat=Array.from({length:128},(_,i)=>({type:'chat',id:i+1,seat:0,name:'房主',text:String(i)}));room.chatSequence=128;
  host.send({type:'chat',text:'😀'.repeat(300)});const capped=await host.wait(m=>m.type==='chat');assert.equal([...capped.text].length,256);assert.equal(room.chat.length,128);assert.equal(room.chat[0].id,2);assert.equal(room.chat.at(-1).id,129);
  resumed.send({type:'start'});assert.match((await resumed.wait(m=>m.type==='error')).message,/host/);
  host.send({type:'ready',ready:true});await host.wait(m=>m.type==='room'&&m.players.find(p=>p.seat===0)?.ready);host.send({type:'pick',heroClass:3});await host.wait(m=>m.type==='room'&&m.players.find(p=>p.seat===0)?.heroClass===3&&m.players.every(p=>!p.ready));assert.ok(room.players.every(p=>!p.ready));host.send({type:'start'});await host.wait(m=>m.type==='state');assert.equal(room.phase,'playing');
  host.send({type:'chat',text:'late'});assert.match((await host.wait(m=>m.type==='error')).message,/during a match/);
  console.log('PASS TCP chat room isolation, authenticated identity, normalized Unicode, bounded history, reconnect, non-host rejection and direct host start');
}finally{for(const c of clients)c.socket.destroy();await app.close();}
