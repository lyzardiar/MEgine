import {
  Behaviour,
  DisallowMultipleComponent,
  Header,
  InfoBox,
  Label,
  Min,
  PropertyOrder,
  Range,
  RegisterBehaviour,
  SerializeField,
  SuffixLabel,
  Transform,
  type BehaviourContext,
  type Vec3,
} from '@mengine/behaviour';

function finiteVec3(value: Vec3, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    Number.isFinite(Number(value[0])) ? Number(value[0]) : fallback[0],
    Number.isFinite(Number(value[1])) ? Number(value[1]) : fallback[1],
    Number.isFinite(Number(value[2])) ? Number(value[2]) : fallback[2],
  ];
}

/** Constant-speed ping-pong motion for trail and projectile previews. */
@DisallowMultipleComponent
@RegisterBehaviour('LoopMotion', {
  label: 'Loop Motion',
  description: 'Moves this entity between two points while Play mode is running.',
})
export class LoopMotion extends Behaviour {
  @Header('Path')
  @SerializeField({ type: 'vec3' })
  @Label('Start')
  @PropertyOrder(0)
  start: Vec3 = [-1, 0, 0];

  @SerializeField({ type: 'vec3' })
  @Label('End')
  @PropertyOrder(1)
  end: Vec3 = [1, 0, 0];

  @Header('Playback')
  @SerializeField()
  @Min(0)
  @SuffixLabel('cycles/s')
  @Label('Frequency')
  @InfoBox('Use a low frequency for readable projectile trails. Play mode only.')
  @PropertyOrder(2)
  frequency = 0.2;

  @SerializeField()
  @Range(0, 1)
  @Label('Phase')
  @PropertyOrder(3)
  phase = 0;

  private elapsed = 0;

  onEnable() {
    this.elapsed = 0;
  }

  onUpdate(ctx: BehaviourContext) {
    const transform = ctx.get(Transform);
    if (!transform) return;

    const frequency = Math.max(0, Number(this.frequency) || 0);
    const phase = Number.isFinite(Number(this.phase)) ? Number(this.phase) : 0;
    this.elapsed += Math.max(0, Number(ctx.dt) || 0);

    const cycle = ((this.elapsed * frequency + phase) % 1 + 1) % 1;
    const amount = cycle <= 0.5 ? cycle * 2 : (1 - cycle) * 2;
    const start = finiteVec3(this.start, [-1, 0, 0]);
    const end = finiteVec3(this.end, [1, 0, 0]);
    ctx.set(Transform, {
      ...transform,
      position: [
        start[0] + (end[0] - start[0]) * amount,
        start[1] + (end[1] - start[1]) * amount,
        start[2] + (end[2] - start[2]) * amount,
      ],
    });
  }
}
