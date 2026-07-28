import {
  Behaviour,
  Button,
  ContextMenu,
  DisallowMultipleComponent,
  Label,
  Range,
  RegisterBehaviour,
  SerializeField,
  SuffixLabel,
} from '@mengine/behaviour';

export const TEST_BEHAVIOUR_TYPE = 'AgentSchemaTest';

class AgentSchemaTest extends Behaviour {
  axis = [0, 1, 0];
  angle = 90;
  speed = 1;

  resetAngle() {
    this.angle = 90;
    this.speed = 1;
  }

  zeroRate() {
    this.angle = 0;
  }
}

SerializeField({ type: 'vec3' })(AgentSchemaTest.prototype, 'axis');
SerializeField()(AgentSchemaTest.prototype, 'angle');
Range(0, 720)(AgentSchemaTest.prototype, 'angle');
SuffixLabel('°/s')(AgentSchemaTest.prototype, 'angle');
Label('Angle')(AgentSchemaTest.prototype, 'angle');
SerializeField()(AgentSchemaTest.prototype, 'speed');
Button('Reset Angle')(AgentSchemaTest.prototype, 'resetAngle');
ContextMenu('Zero Rotation Rate')(AgentSchemaTest.prototype, 'zeroRate');
RegisterBehaviour(TEST_BEHAVIOUR_TYPE, {
  label: 'Agent Schema Test',
  description: 'Test-only Behaviour metadata fixture',
})(AgentSchemaTest);
DisallowMultipleComponent(AgentSchemaTest);
