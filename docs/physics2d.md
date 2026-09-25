# 2D 碰撞与拖拽

`EdgeCollider2D` 使用局部 XY 点列建立开口边界，首尾重复可闭合。`edge_radius` 默认为 0；正值以原生胶囊段形成圆角边界，半径按最大 XY 缩放变化。最多 4096 个点，非有限输入和不足两个有效点的形状不参与碰撞。

`PolygonCollider2D` 使用 3–256 个局部 XY 顶点定义简单实心多边形。凹形交给 Rapier 分解；退化、自交和非有限形状不参与碰撞。多个互不相连的轮廓使用独立实体。两类碰撞体都支持 `offset`、`is_trigger`、`friction` 和 `bounciness`，无需 Rigidbody2D 的对象作为静态边界。

动态 Box、Circle 和 Polygon 按形状面积分配质量与转动惯量。碰撞对采用几何平均摩擦与最大弹性值。`TargetJoint2D` 将动态刚体的局部 `anchor` 拉向世界 `target`，支持频率、阻尼比和最大合力；两个世界轴的弹簧保守均分力预算。移除或禁用组件会释放约束。

Inspector 支持点列表编辑，Scene 视图显示所选轮廓与关节目标。Agent 使用组件读写命令以及 `playback.step {deltaTime:0.02, steps:100}` 驱动原生物理。

官方示例：`samples/unity-physics-*` 和 `samples/unity-isometric-z-as-y`。相同参数在 Rapier2D 与 Unity Box2D 中可能产生不同轨迹；验收检查碰撞、触发、稳定性、输入及场景生命周期。

等距碰撞参考的复现步骤：用 `python scripts/prepare-unity-isometric-probe.py <固定版本官方仓库> <独立Unity工程>` 复制所需 Sprite 和单元格，随后在该独立工程运行 `-batchmode -quit -executeMethod IsometricColliderProbe.Run`。输出为工程根目录 `isometric-colliders.json`。已记录的 probe 使用 Unity 2022.3.47f1c1；场景导入器保留官方序列化的 Base/Level 1 Composite 轮廓，Level 2 使用该 probe 生成的 31 个 Polygon。
