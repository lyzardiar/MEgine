# 悬崖凸角与凹角

Author: MiYu

每个悬崖高度层从交点周围四格的高低关系提取边界方向。凸角和凹角采用同一条二次曲线；直线边界保持直线，斜对角相接的地块保留分别闭合的岩壁。顶面以四边曲线构成连续曲面，露出的岩壁也沿相同的上沿和下沿生成，避免顶面与崖面在转角处分离。相向坡道在共有的高度交点会合，只为露出的高差生成岩壁；不同悬崖层级的垂直接缝采用共同高度分段，连接各层转角。

四格交点和曲线参数来自共享邻接数据，不依赖渲染块的生成顺序。原有 `terrain4:` 格式保持不变，`terrain4r:` 与 `terrain4h:` 复用角点曲线；地图数据、连续起伏、坡道方向和联机协议保持现有定义。

地块仍为 2 世界单位，角点曲线占每条边前后 0.8 单位。凸角顶面相对原始交点的收边不超过 0.6 单位，另有原有小幅轮廓扰动。该收边目前用于视觉造型；寻路和高度查询仍以地块及共享起伏组织，尚未覆盖原版全部悬崖造型与精确边缘碰撞。

验证入口：

```powershell
cargo test -p mengine-assets terrain_mesh
node scripts/test-frost-terrain.mjs
node scripts/test-frost-sculpt.mjs
node scripts/qa-frostbound.mjs --ground-only
node scripts/qa-frostbound.mjs --terrain-only
```

网格验证遍历全部 16 种相邻高低组合及平地、同向坡道、相向坡道和不同坡度交点，共 64 种情况。每种情况组合四个原生渲染块，焊接三角形的世界坐标边，检查内部不存在开放边，并检查法线有限、顶面朝向正确、凸角和凹角使用共同曲线交点。实际原生画面、地形编辑与英雄沿坡道登高另行验收，不以网格测试代替。

同机位实拍：[之前](corner-before-ground-highland.png)、[之后](corner-after-ground-highland.png)。旧引擎基线保存为提交 `2ca1de0` 的独立 Release 可执行文件；样例与机位保持一致。阶段记录见 [悬崖转角验证](terrain-corners-validation.json)。
