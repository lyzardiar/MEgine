import {
  Behaviour,
  BoxGroup,
  Button,
  ButtonGroup,
  EnableIf,
  Enum,
  FoldoutGroup,
  Header,
  HideIf,
  HorizontalGroup,
  InfoBox,
  Label,
  Min,
  Multiline,
  OnValueChanged,
  ProgressBar,
  PropertyOrder,
  Range,
  ReadOnly,
  RegisterBehaviour,
  Required,
  SerializeField,
  ShowIf,
  Space,
  SuffixLabel,
  TextArea,
  Title,
  ToggleLeft,
  Tooltip,
  type Color4,
  type Vec3,
} from '@mengine/behaviour';

/**
 * Demo-only Behaviour: registers field/method meta for the Decorator Gallery window.
 * Not added to the default scene.
 */
@RegisterBehaviour('__DecoratorShowcase', {
  label: 'Decorator Showcase',
  description: 'Field decorator gallery (demo)',
})
export class DecoratorShowcase extends Behaviour {
  @Header('Basics')
  @SerializeField()
  @Label('Display Name')
  @Tooltip('普通字符串 + Tooltip')
  @Required()
  @PropertyOrder(0)
  displayName = 'Hero';

  @SerializeField()
  @ToggleLeft()
  @Label('Enabled')
  @PropertyOrder(1)
  enabled = true;

  @SerializeField()
  @ShowIf('enabled', true)
  @Label('Only When Enabled')
  @InfoBox('ShowIf(enabled === true)')
  @PropertyOrder(2)
  onlyWhenEnabled = 'visible';

  @SerializeField()
  @HideIf('enabled', true)
  @Label('Only When Disabled')
  @PropertyOrder(3)
  onlyWhenDisabled = 'hidden when enabled';

  @Space(10)
  @Header('Numbers')
  @SerializeField()
  @Range(0, 100)
  @SuffixLabel('%')
  @Label('Health')
  @PropertyOrder(10)
  health = 75;

  @SerializeField()
  @Range(0, 1)
  @ProgressBar()
  @Label('Charge')
  @PropertyOrder(11)
  charge = 0.4;

  @SerializeField()
  @Min(0)
  @EnableIf('enabled', true)
  @Label('Damage')
  @PropertyOrder(12)
  damage = 12;

  @SerializeField()
  @ReadOnly()
  @Label('Read Only Id')
  @PropertyOrder(13)
  readOnlyId = 42;

  @Title('Vectors & Color')
  @SerializeField({ type: 'vec3' })
  @Label('Offset')
  @PropertyOrder(20)
  offset: Vec3 = [0, 1, 0];

  @SerializeField({ type: 'color' })
  @Label('Tint')
  @PropertyOrder(21)
  tint: Color4 = [0.2, 0.6, 1, 1];

  @FoldoutGroup('Text')
  @SerializeField()
  @Multiline(2)
  @Label('Note')
  @PropertyOrder(30)
  note = 'Multiline note';

  @FoldoutGroup('Text')
  @SerializeField()
  @TextArea(3, 8)
  @Label('Description')
  @PropertyOrder(31)
  description = 'TextArea with scroll…';

  @BoxGroup('Enum')
  @SerializeField()
  @Enum([
    { value: 'idle', label: 'Idle' },
    { value: 'walk', label: 'Walk' },
    { value: 'attack', label: 'Attack' },
  ])
  @Label('State')
  @OnValueChanged('onStateChanged')
  @PropertyOrder(40)
  state = 'idle';

  @BoxGroup('Enum')
  @SerializeField()
  @Label('State Echo')
  @PropertyOrder(41)
  stateEcho = 'idle';

  @HorizontalGroup('Pair')
  @SerializeField()
  @Label('A')
  @PropertyOrder(50)
  pairA = 1;

  @HorizontalGroup('Pair')
  @SerializeField()
  @Label('B')
  @PropertyOrder(51)
  pairB = 2;

  onStateChanged() {
    this.stateEcho = String(this.state);
  }

  @Button('Reset Health')
  resetHealth() {
    this.health = 100;
    this.charge = 1;
  }

  @ButtonGroup('actions')
  @Button('Clear Note', { buttonGroup: 'actions' })
  clearNote() {
    this.note = '';
  }

  @ButtonGroup('actions')
  @Button('Random Tint', { buttonGroup: 'actions' })
  randomTint() {
    this.tint = [Math.random(), Math.random(), Math.random(), 1];
  }
}
