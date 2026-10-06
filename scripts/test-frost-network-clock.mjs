// Author: MiYu. Exercise the production client's network deadlines with independent wall and game clocks.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=new URL('../samples/frostbound-realms/',import.meta.url),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))),main=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),marker='/* Author: MiYu. Native RTS controls, presentation, map editor and TCP client. */';
const source=process.env.MENGINE_QA_CLIENT_SOURCE?main.slice(0,main.indexOf(marker))+fs.readFileSync(process.env.MENGINE_QA_CLIENT_SOURCE,'utf8'):main,program=new vm.Script(source),telemetry=scene.world.entities.find(e=>e.name==='Frost telemetry').entity;
function client(){
 let clock=1_800_000_000_000,events=[],text='',closed=0;const sent=[],attempts=[];
 const input={keys:[],pressedKeys:[],releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,230],viewport:[1280,720]};
 const engine={snapshot:scene.world,input,storage:{load:()=>null,save:()=>true},setActive(){},playAudio(){},quit(){},pushCommandJson(raw){if(raw.includes('"entity":'+telemetry+',')){const c=JSON.parse(raw);if(c.component==='Text')text=c.value.text;}},network:{poll:()=>events.splice(0),send:m=>{sent.push(m);return true;},connect:address=>{attempts.push({address,clock});return true;},close:()=>{closed++;}}};
 const context=vm.createContext({engine,Date:class extends Date{static now(){return clock;}}});program.runInContext(context,{timeout:10000});
 const tick=(dt=.1)=>context.FrostClient.tick(dt),press=key=>{input.pressedKeys=[key];input.keys=[key];tick();input.pressedKeys=[];input.keys=[];tick();};
 tick();return {sent,attempts,tick,press,advance:ms=>clock+=ms,feed:(...v)=>events.push(...v),state:()=>JSON.parse(text),closed:()=>closed,clock:()=>clock};
}
const c=client();c.press('Enter');assert.equal(c.state().mode,'network');c.press('F1');assert.equal(c.attempts.length,1);assert.equal(c.attempts[0].address,'127.0.0.1:7788');
c.feed({type:'connected'},{type:'message',data:{type:'welcome'}});c.tick();assert.ok(c.sent.some(m=>m.type==='hello'));assert.ok(c.sent.some(m=>m.type==='create'));
c.feed({type:'message',data:{type:'joined',team:0,token:'test-token',code:'CLOCK0'}},{type:'message',data:{type:'room',phase:'lobby',players:[{team:0}]}});c.tick();assert.equal(c.state().mode,'lobby');
const firstPings=c.sent.filter(m=>m.type==='ping').length;c.advance(3200);c.feed({type:'message',data:{type:'pong'}});c.tick(.001);assert.equal(c.sent.filter(m=>m.type==='ping').length,firstPings+1,'heartbeat follows elapsed wall time even with a tiny game step');
const before=c.closed();for(let i=0;i<55;i++)c.tick(.2);assert.equal(c.closed(),before,'advancing simulation while wall time stands still does not disconnect TCP');assert.equal(c.sent.filter(m=>m.type==='ping').length,firstPings+1);
c.advance(8200);c.tick();assert.equal(c.closed(),before+1,'silent peer timeout follows wall time');
c.feed({type:'closed'});c.tick();assert.equal(c.state().mode,'reconnecting');const attempts=c.attempts.length;c.advance(499);c.tick();assert.equal(c.attempts.length,attempts);c.advance(2);c.tick();assert.equal(c.attempts.length,attempts+1,'resume retries after half a wall second');
c.feed({type:'connected'},{type:'message',data:{type:'welcome'}});c.tick();assert.ok(c.sent.some(m=>m.type==='resume'&&m.code==='CLOCK0'&&m.token==='test-token'));
c.feed({type:'message',data:{type:'joined',team:0,token:'test-token',code:'CLOCK0'}});c.tick();assert.equal(c.state().mode,'lobby');
c.feed({type:'closed'});c.tick();c.advance(12100);c.tick();assert.equal(c.state().online,false);assert.equal(c.state().mode,'network');assert.equal(c.state().notice,'Connection timed out');
const initial=client();initial.press('Enter');initial.press('F3');initial.advance(8100);initial.tick();assert.equal(initial.state().online,false);assert.equal(initial.state().mode,'network');assert.equal(initial.attempts.length,1,'initial timeout does not launch another expired connection attempt');
console.log('PASS production client: wall-time heartbeats, silent-peer timeout, resume retry, resume token, reconnect deadline and initial connection deadline');
