import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Behaviour,
  Name,
  RegisterBehaviour,
  SerializeField,
  createBehaviourRunner,
} from '@mengine/behaviour';

const TYPE = 'BehaviourLifecycleProbe';
const events = [];

class BehaviourLifecycleProbe extends Behaviour {
  counter = 0;

  onEnable(ctx) {
    events.push(`enable:${ctx.entity}:${ctx.get(Name)?.value ?? 'missing'}`);
    this.counter += 1;
  }

  onUpdate(ctx) {
    events.push(`update:${ctx.entity}:${ctx.dt}`);
    this.counter += 10;
  }

  onDisable(ctx) {
    events.push(`disable:${ctx.entity}:${ctx.get(Name)?.value ?? 'missing'}`);
    this.counter += 100;
  }
}

SerializeField()(BehaviourLifecycleProbe.prototype, 'counter');
RegisterBehaviour(TYPE)(BehaviourLifecycleProbe);

test('Behaviour runner reconciles active state and dynamic component lifetime', () => {
  events.length = 0;
  const parent = { entity: 6, active: false, components: {} };
  const entity = {
    entity: 7,
    parent: 6,
    active: true,
    components: {
      Name: { value: 'Probe' },
      [TYPE]: { counter: 0 },
    },
  };
  const entities = [parent, entity];
  const runner = createBehaviourRunner();

  runner.mount(entities);
  assert.deepEqual(events, [], 'inactive entities do not receive onEnable at mount');

  parent.active = true;
  runner.tick(entities, 0.25);
  assert.deepEqual(events, ['enable:7:Probe', 'update:7:0.25']);
  assert.equal(entity.components[TYPE].counter, 11, 'onEnable state reaches onUpdate');

  parent.active = false;
  runner.tick(entities, 0.5);
  assert.equal(entity.components[TYPE].counter, 111);
  runner.tick(entities, 0.5);
  assert.equal(events.filter((event) => event.startsWith('disable:')).length, 1);

  parent.active = true;
  runner.tick(entities, 0.5);
  assert.equal(entity.components[TYPE].counter, 122);

  delete entity.components[TYPE];
  runner.tick(entities, 0.5);
  assert.equal(entity.components[TYPE], undefined, 'onDisable cannot resurrect a removed component');
  assert.equal(events.at(-1), 'disable:7:Probe');

  entity.components[TYPE] = { counter: 5 };
  runner.tick(entities, 0.125);
  assert.equal(entity.components[TYPE].counter, 16);
  assert.deepEqual(events.slice(-2), ['enable:7:Probe', 'update:7:0.125']);

  entities.splice(1, 1);
  runner.tick(entities, 0.25);
  assert.equal(events.at(-1), 'disable:7:Probe');
  runner.unmount();
  assert.equal(
    events.filter((event) => event.startsWith('disable:')).length,
    3,
    'removed instances are not disabled a second time during unmount',
  );
});

test('Behaviour runner unmount supplies the last live component context', () => {
  events.length = 0;
  const entity = {
    entity: 8,
    components: {
      Name: { value: 'Unmounted' },
      [TYPE]: { counter: 2 },
    },
  };
  const runner = createBehaviourRunner();
  runner.mount([entity]);
  runner.unmount();
  assert.deepEqual(events, ['enable:8:Unmounted', 'disable:8:Unmounted']);
  assert.equal(entity.components[TYPE].counter, 103);
});
