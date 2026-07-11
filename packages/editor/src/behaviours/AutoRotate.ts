import {
  Behaviour,
  Button,
  ContextMenu,
  DisallowMultipleComponent,
  Header,
  InfoBox,
  Label,
  Min,
  PropertyOrder,
  Range,
  RegisterBehaviour,
  SerializeField,
  Space,
  SuffixLabel,
  Transform,
  type BehaviourContext,
  type Vec3,
} from '@mengine/behaviour';
import { quatAxisAngle, quatMul, quatNormalize } from '../math3d';

@DisallowMultipleComponent
@RegisterBehaviour('AutoRotate', {
  label: 'Auto Rotate',
  description: '3D 绕轴旋转 / UI 绕 Z 旋转（Angle × Speed）',
})
export class AutoRotate extends Behaviour {
  @Header('Rotation')
  @SerializeField({ type: 'vec3' })
  @Label('Axis')
  @InfoBox('3D：绕此轴转；UI(RectTransform)：用 Z/Y 符号决定方向（默认正转）')
  @PropertyOrder(0)
  axis: Vec3 = [0, 1, 0];

  @SerializeField()
  @Range(0, 720)
  @SuffixLabel('°/s')
  @Label('Angle')
  @PropertyOrder(1)
  angle = 90;

  @Space(6)
  @SerializeField()
  @Min(0)
  @Label('Speed')
  @InfoBox('有效角速度 = Angle × Speed · Play 模式生效')
  @PropertyOrder(2)
  speed = 1;

  onUpdate(ctx: BehaviourContext) {
    const rate = (Number(this.angle) || 0) * (Number(this.speed) || 0);
    const delta = rate * ctx.dt;
    if (Math.abs(delta) < 1e-8) return;

    // UI：驱动 RectTransform.local_rotation（绕 Z）
    const rt = ctx.get('RectTransform') as
      | { local_rotation?: number; [k: string]: unknown }
      | undefined;
    if (rt) {
      const axisRaw = this.axis;
      const az = Array.isArray(axisRaw) ? Number(axisRaw[2]) || 0 : 0;
      const ay = Array.isArray(axisRaw) ? Number(axisRaw[1]) || 0 : 0;
      const sign = az !== 0 ? Math.sign(az) : ay !== 0 ? Math.sign(ay) : 1;
      const cur = Number(rt.local_rotation ?? 0) || 0;
      ctx.set('RectTransform', {
        ...rt,
        local_rotation: cur + delta * sign,
      });
      return;
    }

    const t = ctx.get(Transform);
    if (!t) return;
    const axisRaw = this.axis;
    const axis: Vec3 = Array.isArray(axisRaw)
      ? [Number(axisRaw[0]) || 0, Number(axisRaw[1]) || 0, Number(axisRaw[2]) || 0]
      : [0, 1, 0];
    if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-8) return;
    const spin = quatAxisAngle(axis, delta);
    const cur = t.rotation ?? [0, 0, 0, 1];
    ctx.set(Transform, {
      ...t,
      rotation: quatNormalize(quatMul(spin, cur)),
    });
  }

  @Button('Reset Angle')
  resetAngle() {
    this.angle = 90;
    this.speed = 1;
  }

  @ContextMenu('Zero Rotation Rate')
  zeroRate() {
    this.angle = 0;
  }
}
