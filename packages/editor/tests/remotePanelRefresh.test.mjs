// Author: MiYu. Panel cadence retains the latest work and cancels obsolete timer callbacks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemotePanelRefresh } from '../src/remotePanelRefresh.ts';

function clock() {
  let now=0,sequence=0;const timers=new Map(),cancelled=[];
  const refresh=createRemotePanelRefresh(()=>now,(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;},id=>{if(timers.has(id))cancelled.push(timers.get(id).fn);timers.delete(id);});
  return {refresh,timers,cancelled,advance(to){for(;;){const next=[...timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=to;}};
}

test('remote panel bursts keep one pending callback and publish the newest state at 10 Hz',()=>{
  const f=clock(),seen=[];f.refresh.publish(()=>seen.push(0),false);
  for(let i=1;i<=9;i++){f.advance(i*10);f.refresh.publish(()=>seen.push(i),true);assert.equal(f.timers.size,1);}
  assert.deepEqual(seen,[0]);f.advance(100);assert.deepEqual(seen,[0,9]);assert.equal(f.timers.size,0);
  f.advance(250);f.refresh.publish(()=>seen.push(10),true);assert.deepEqual(seen,[0,9,10]);
});

test('immediate boundaries replace pending work and obsolete queued callbacks remain cancelled',()=>{
  const f=clock(),seen=[];f.refresh.publish(()=>seen.push('first'),false);f.advance(10);f.refresh.publish(()=>seen.push('stale'),true);
  f.refresh.publish(()=>seen.push('pause'),false);for(const fn of f.cancelled)fn();f.advance(200);assert.deepEqual(seen,['first','pause']);
  f.refresh.publish(()=>seen.push('pending'),true);f.advance(210);f.refresh.publish(()=>seen.push('discard'),true);f.refresh.cancel();for(const fn of f.cancelled)fn();f.advance(400);assert.deepEqual(seen,['first','pause','pending']);
  f.refresh.publish(()=>seen.push('reopened'),true);assert.equal(seen.at(-1),'reopened');
});

test('a callback can schedule the next publication without losing it during cleanup',()=>{
  const f=clock(),seen=[];f.refresh.publish(()=>{seen.push(1);f.refresh.publish(()=>seen.push(2),true);},false);assert.deepEqual(seen,[1]);f.advance(100);assert.deepEqual(seen,[1,2]);
});
