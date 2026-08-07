# 2D Effects

MEngine 的基础 2D 特效由 `ParticleEmitter2D` 和 `TrailRenderer2D` 组成。两者都使用现有场景组件、排序层、资源路径和帧编译管线，Editor 2D Scene 与原生 Runtime/Player 共用相同的组件语义。

## 创建入口

顶部菜单 `GameObject > Effects` 提供：

- `Particle System 2D`：默认连续发射器。
- `2D Particle Presets > Fire`：向上发射、加色混合的短寿命火焰。
- `2D Particle Presets > Smoke`：透明混合、缓慢扩散的烟雾。
- `2D Particle Presets > Spark Burst`：一次性 32 粒子爆发。
- `2D Particle Presets > Magic Aura`：局部空间、环形扩散的魔法光点。
- `2D Particle Presets > Snow`：箱形区域、长寿命的下落雪花。
- `Trail Renderer 2D`：根据实体 XY 世界坐标移动采样的带状拖尾。

预设只是普通组件默认值，创建后可在 Inspector 继续修改。Hierarchy 的搜索创建菜单也能按上述名称找到它们。

## ParticleEmitter2D

基础生命周期包含播放、循环、持续时间、开始延迟、每秒发射率、最大粒子数、随机种子和世界/局部模拟空间。外观与运动包含：

- 单次或按间隔重复的 `burst_count` / `burst_interval`。
- 最小/最大寿命、速度，起止尺寸和颜色。
- 重力、指数阻力 `drag`、方向和扩散角。
- point、circle、box 三种发射形状。
- alpha/additive 混合、可选纹理、Sorting Layer 与 Order。

模拟按随机种子确定，Inspector、后台 Agent、Editor 预览和 Runtime 都读取同一序列化组件。Timeline 的 Particle Track 仍可控制发射器播放区间；时间轴预览不会把粒子状态写回场景。

## TrailRenderer2D

拖尾仅在实体移动超过 `min_vertex_distance` 时采样，采样点按 `time` 自动过期，并受 `max_points` 上限约束。Inspector 可控制：

- `enabled` 与 `emitting`。
- 生存时间、最小采样距离和最大点数。
- 起止宽度、起止颜色。
- 可选纹理、alpha/additive 混合、Sorting Layer 与 Order。

Runtime 将有效采样点编译成带状三角形；停止 emitting 会保留并自然衰减已有拖尾。拖尾跟随 Transform，不额外创建或序列化轨迹实体。

## Agent 创建

通用 `create_typed` 支持以下类型：

```text
particle_2d
particle_2d_fire
particle_2d_smoke
particle_2d_spark_burst
particle_2d_magic_aura
particle_2d_snow
trail_2d
```

例如：

```text
mengine-agent execute entity.create_typed --args {"kind":"particle_2d_spark_burst"}
```

MCP 的类型枚举与 CLI 使用相同的受限列表，Behaviour SDK 的组件 token 也包含 `TrailRenderer2D`。

## 验证与边界

2026-08-07 的隐藏后台编辑器验收覆盖 Editor 全量测试、Rust workspace all-targets、TypeScript/Vite 构建和 Tauri Debug 构建。离屏像素对比确认粒子连续两帧发生可见变化，并确认启用/禁用拖尾会改变预期区域；验证期间后台窗口保持 `visible=false`、`focused=false`。

当前实现定位为常用基础 2D 特效，不是完整的 Unity Particle System 模块复刻。首版尚不包含曲线编辑、子发射器、碰撞、噪声、灯光、GPU 粒子、拖尾圆角/拐角细分或自动材质生成。复杂成品特效仍应使用 Effekseer 管线。
