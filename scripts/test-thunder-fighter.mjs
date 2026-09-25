import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const source=JSON.parse(execFileSync(process.execPath,['packages/cli/dist/cli.js','compile-play-script','samples/thunder-fighter'],{encoding:'utf8'})).source;
const scene=JSON.parse(fs.readFileSync('samples/thunder-fighter/Assets/Scenes/Main.mscene','utf8')).world;
function game(){
  const world=structuredClone(scene),ids=new Map(world.entities.map(e=>[e.entity,e]));let last=[];
  const engine={snapshot:world,input:{keys:[],pressedKeys:[],releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[0,0],viewport:[1280,720]},pushCommandJson(json){const c=JSON.parse(json);assert.equal(c.op,'setComponent');ids.get(c.entity).components[c.component]=c.value;},playAudio(){return true;}};
  const context=vm.createContext({engine});vm.runInContext(source,context);vm.runInContext('onSceneLoaded()',context);
  const state=()=>JSON.parse(world.entities.find(e=>e.name==='Flight telemetry').components.Text.text);
  const step=(keys=[],dt=1/60)=>{engine.input.keys=keys;engine.input.pressedKeys=keys.filter(k=>!last.includes(k));engine.input.releasedKeys=last.filter(k=>!keys.includes(k));last=keys;context.dt=dt;vm.runInContext('onTick(dt)',context);return state();};
  const drive=(keys,seconds,dt=1/60)=>{let s;for(let i=0;i<Math.ceil(seconds/dt);i++)s=step(keys,dt);return s;};step();return {step,drive,state,world};
}

function pilot(state){
  const boss=state.enemies.find(e=>e.kind>=3),targetX=boss?.x??0,targetY=-6.1;
  let best=-Infinity,choice=[];
  for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
    const x=Math.max(-5.2,Math.min(5.2,state.px+dx*.53)),y=Math.max(-7.6,Math.min(6,state.py+dy*.53));
    let cost=-Math.abs(x-targetX)*.7-Math.abs(y-targetY)*.4-(dx*dx+dy*dy)*.01;
    for(const b of state.threats){
      for(const t of [.08,.22,.4]){const distance=Math.hypot(b.x+b.vx*t-x,b.y+b.vy*t-y);cost-=Math.exp(-distance*distance/ .26)*8;}
    }
    for(const l of state.lasers)if(l.age>.6&&l.age<2.3)cost-=Math.exp(-((x-l.x)**2)/.22)*30;
    if(cost>best){best=cost;choice=[...(dx<0?['KeyA']:dx>0?['KeyD']:[]),...(dy<0?['KeyS']:dy>0?['KeyW']:[])];}
  }
  if(state.energy>=100)choice.push('KeyE');
  if(state.bombs>0&&state.invincible<.1&&state.threats.some(b=>Math.hypot(b.x-state.px,b.y-state.py)<.65))choice.push('Space');
  return choice;
}
const start=performance.now(),g=game();assert.equal(g.state().mode,'title');g.step(['Enter']);
const p=g.state();let s=g.drive(['KeyD'],.5);assert.ok(s.px>p.px+2.5);
const prior=s.px;s=g.drive(['KeyD','ShiftLeft'],.5);assert.ok(s.px-prior<1.3);
const frozen=g.step(['Escape']);assert.equal(frozen.mode,'paused');assert.deepEqual(g.drive(['KeyW','Space'],1),frozen);g.step(['Enter']);
g.drive([],2);const pre=g.state();s=g.step(['Space']);assert.equal(s.bombs,pre.bombs-1);assert.equal(s.bullets,0);assert.ok(s.invincible>1.8);
g.step(['KeyR']);s=g.state();assert.equal(s.armor,5);assert.equal(s.bombs,3);assert.equal(s.score,0);
const run=game();let state=run.step(['Enter']);const replay=[];const milestones=[];
for(let frame=0;frame<2400&&state.mode==='playing';frame++){
  const keys=pilot(state);replay.push(keys);state=run.step(keys,.1);
  if(frame%100===0)milestones.push({t:state.time,stage:state.stage,armor:state.armor,bullets:state.bullets,kills:state.kills});
}
const report={passed:false,flight:state,milestones,elapsedMs:Math.round(performance.now()-start)};
fs.mkdirSync('docs/designs/thunder-fighter',{recursive:true});fs.writeFileSync('docs/designs/thunder-fighter/gameplay-test.json',JSON.stringify(report,null,2)+'\n');
fs.mkdirSync('tmp',{recursive:true});fs.writeFileSync('tmp/thunder-replay.json',JSON.stringify(replay));
assert.equal(state.mode,'victory','The input-only pilot must clear both bosses');assert.ok(state.bossPhases>=5);assert.ok(state.peak>=150);assert.ok(state.level>=2);assert.ok(state.graze>0);
const idle=game();idle.step(['Enter']);s=idle.drive([],150,.1);assert.equal(s.mode,'defeat','Incoming fire must damage the player');idle.step(['Enter']);assert.equal(idle.state().mode,'playing');
for(const name of ['Enemy bullets','Needle bullets','Sparks']){const e=run.world.entities.find(e=>e.name===name);assert.ok(e.components.SpriteBatch2D.instances.length<=900);}
report.passed=true;fs.writeFileSync('docs/designs/thunder-fighter/gameplay-test.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
console.log('PASS: start, precision movement, pause, nova, reset, complete campaign, defeat and retry');
