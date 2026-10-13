// Author: MiYu. Run the real TD scenario with the captured alternate hypot rounding at symmetric A* nodes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const file=new URL('../samples/frostbound-realms/game/simulation.js',import.meta.url),source=fs.readFileSync(file,'utf8'),require=createRequire(file),plain=value=>JSON.parse(JSON.stringify(value));
const initial=JSON.parse(fs.readFileSync(new URL('./fixtures/frost-td-priority-frame323.json',import.meta.url),'utf8')).state;
function fixture(distance){const math=Object.create(Math),module={exports:{}};let probes=0;math.hypot=(...args)=>{if(args.length===2&&Math.abs(args[0])===40&&Math.abs(args[1])===1){probes++;return distance;}return Math.hypot(...args);};vm.runInNewContext(source,{module,require,Math:math});const S=module.exports;return {S,state:S.restore(plain(initial)),probes:()=>probes};}
function compare(a,b,at='$'){if(typeof a==='number'&&typeof b==='number'){if(Number.isInteger(a)||Number.isInteger(b))assert.equal(a,b,at);else assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8,`${at}: ${a} != ${b}`);}else if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b),at);for(const key of Object.keys(a))compare(a[key],b[key],at+'.'+key);}else assert.equal(a,b,at);}
const a=fixture(40.01249804748511),b=fixture(40.012498047485125);let peakUnits=0;
for(let frame=324;frame<=600;frame++){a.S.tick(a.state);b.S.tick(b.state);compare(plain(a.state),plain(b.state),'frame '+frame);if(frame===324)assert.deepEqual(plain(a.state.units.find(u=>u.id===18).path[0]),[-23,-21.5],'captured equal-priority route keeps the stable heap order');peakUnits=Math.max(peakUnits,a.state.units.length);if(frame===350){a.state=a.S.restore(a.state);b.state=b.S.restore(b.state);}}
assert.ok(a.probes()>0&&b.probes()>0,'captured symmetric queue scores exercised');assert.equal(a.state.wave,3);assert.equal(a.state.lives,20);
console.log(JSON.stringify({passed:true,fixturePrefixFrames:323,completeFrameComparisons:277,restoredAtFrame:350,peakUnits,hypotProbes:[a.probes(),b.probes()],scope:'Captured TD divergence input with alternate QuickJS/V8 hypot rounding, full state comparison every frame, exact integer/structure checks and unchanged 1e-8 float bound; includes legacy-state loading and mid-match save restore.'}));
