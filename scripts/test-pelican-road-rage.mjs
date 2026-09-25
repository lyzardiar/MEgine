import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
const scene=JSON.parse(fs.readFileSync('samples/pelican-road-rage/Assets/Scenes/Main.mscene','utf8')).world;
const source=JSON.parse(execFileSync(process.execPath,['packages/cli/dist/cli.js','compile-play-script','samples/pelican-road-rage'],{encoding:'utf8'})).source;
function game() {
  const world=structuredClone(scene), byId=new Map(world.entities.map(e=>[e.entity,e]));
  let lastKeys=[];
  const engine={snapshot:world,input:{keys:[],pressedKeys:[],releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[0,0],viewport:[1280,720]},pushCommandJson(json){const c=JSON.parse(json);assert.equal(c.op,'setComponent');byId.get(c.entity).components[c.component]=c.value;},playAudio(){return true;},pauseAudio(){return true;}};
  const context=vm.createContext({engine});vm.runInContext(source,context);vm.runInContext('onSceneLoaded()',context);
  const step=(keys=[],dt=1/60)=>{engine.input.keys=keys;engine.input.pressedKeys=keys.filter(k=>!lastKeys.includes(k));engine.input.releasedKeys=lastKeys.filter(k=>!keys.includes(k));lastKeys=keys;context.dt=dt;vm.runInContext('onTick(dt)',context);return JSON.parse(world.entities.find(e=>e.name==='Race telemetry').components.Text.text);};
  const drive=(keys,seconds,dt=1/60)=>{let s;for(let i=0;i<Math.ceil(seconds/dt);i++)s=step(keys,dt);return s;};
  step();
  return {step,drive,world,context};
}
const start=performance.now();
const g=game();assert.equal(g.step().mode,'title');g.step(['Enter']);let s=g.drive([],3.2);assert.equal(s.mode,'racing');
s=g.drive(['KeyW'],3);assert.ok(s.speed>35);
const normal=s.speed;s=g.drive(['KeyW','Space'],1);assert.ok(s.speed>normal && s.boost<85);
g.drive(['KeyW','ShiftLeft','KeyD'],.4);s=g.drive(['KeyW','ShiftLeft','KeyA'],.4);assert.ok(s.drift>.7);
const driftScore=s.score;s=g.step(['KeyW']);assert.ok(s.score>driftScore,'releasing a sustained drift awards style');
const frozen=g.step(['Escape']);s=g.drive(['KeyW','Space'],2);assert.deepEqual(s,frozen);g.step(['Escape']);
s=g.drive(['KeyS'],2);assert.equal(s.speed,0);
g.step(['KeyR']);s=g.drive([],3.2);assert.equal(s.health,100);assert.equal(s.score,0);
const h=game();h.step(['Enter']);let bot=h.drive([],3.1,.1), attacks=0;
for(let i=0;i<1800 && bot.mode==='racing';i++) {
  const keys=['KeyW'];
  let target=0;
  const nextFish=Math.ceil((bot.distance-70)/79);const fishS=70+nextFish*79;
  if(nextFish>=0 && nextFish<32 && fishS-bot.distance<45) target=[-4,0,4][nextFish%3];
  const rival=bot.rivals.find(r=>Math.abs(r.s-bot.distance)<5 && r.hp>0 && r.stun<.1);
  if(rival && i%7===0) {keys.push(rival.x<bot.lane?'KeyJ':'KeyK');attacks++;}
  if(target>bot.lane+.22)keys.push('KeyD');else if(target<bot.lane-.22)keys.push('KeyA');
  if(bot.boost>25 && Math.abs(target-bot.lane)<1)keys.push('Space');
  bot=h.step(keys,.1);
}
assert.equal(bot.mode,'finished',JSON.stringify(bot));assert.ok(bot.pickups>=8,'collectibles must be reachable');assert.ok(bot.hits>0,'rivals must be reachable for melee');
const frames=[];
for(const dt of [1/30,1/60,1/120]) {const run=game();run.step(['Enter'],dt);run.drive([],3.1,dt);const before=run.step([],dt).distance;const after=run.drive(['KeyW'],2,dt);frames.push(after.distance-before);}
assert.ok(Math.max(...frames)-Math.min(...frames)<1.3,JSON.stringify(frames));
const report={passed:true,completeRace:bot,attackAttempts:attacks,frameRateDistances:frames,elapsedMs:Math.round(performance.now()-start)};
fs.mkdirSync('docs/designs/pelican-road-rage',{recursive:true});fs.writeFileSync('docs/designs/pelican-road-rage/gameplay-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
