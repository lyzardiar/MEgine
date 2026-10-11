// Author: MiYu. Preserve late script registration and callback-driven lifecycle in sparse worlds.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Behaviour, RegisterBehaviour, SerializeField, createBehaviourRunner } from '@mengine/behaviour';

test('a world without script instances discovers late registration and direct component additions', () => {
  const events=[],entity={entity:1,components:{LateSparseProbe:{count:3}}},runner=createBehaviourRunner();
  runner.mount([entity]);runner.tick([entity],.1);
  class Probe extends Behaviour {
    count=0;
    onEnable(){events.push('enable');}
    onUpdate(){events.push('update');this.count++;}
    onDisable(){events.push('disable');}
  }
  SerializeField()(Probe.prototype,'count');RegisterBehaviour('LateSparseProbe')(Probe);
  runner.tick([entity],.1);assert.deepEqual(events,['enable','update']);assert.equal(entity.components.LateSparseProbe.count,4);
  delete entity.components.LateSparseProbe;runner.tick([entity],.1);assert.equal(events.at(-1),'disable');
  runner.tick([entity],.1);const before=events.length;
  Object.defineProperty(entity.components,'LateSparseProbe',{configurable:true,enumerable:false,value:{count:8}});
  runner.tick([entity],.1);assert.equal(events.length,before,'non-enumerable components are not mounted');
  Object.defineProperty(entity.components,'LateSparseProbe',{configurable:true,enumerable:true,writable:true,value:{count:8}});
  runner.tick([entity],.1);assert.deepEqual(events.slice(-2),['enable','update']);assert.equal(entity.components.LateSparseProbe.count,9);
  runner.unmount();assert.equal(events.at(-1),'disable');
});

test('callbacks can add scripts in the same tick using the activation state from tick start', () => {
  const events=[],first={entity:1,components:{}},second={entity:2,active:true,components:{}},runner=createBehaviourRunner();
  class Added extends Behaviour {
    onEnable(){events.push('added-enable');}
    onUpdate(){events.push('added-update');}
    onDisable(){events.push('added-disable');}
  }
  class Adder extends Behaviour {
    onEnable(){second.components.SparseAdded={};second.active=false;events.push('adder-enable');}
  }
  RegisterBehaviour('SparseAdded')(Added);RegisterBehaviour('SparseAdder')(Adder);
  runner.mount([first,second]);runner.tick([first,second],.1);
  first.components.SparseAdder={};runner.tick([first,second],.1);
  assert.deepEqual(events,['adder-enable','added-enable','added-update']);
  runner.tick([first,second],.1);assert.equal(events.at(-1),'added-disable');
  runner.tick([first,second],.1);assert.equal(events.filter(e=>e==='added-disable').length,1);
  runner.unmount();
});
