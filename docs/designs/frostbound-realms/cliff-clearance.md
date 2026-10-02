# 地表轮廓与单位通行

Author: MiYu

原生地块顶面以共享崖沿和两圈内部顶点组成三角形，保持多层转角、坡道交点与区块接缝一致。JavaScript 使用相同轮廓和三角形查询地表高度；角色脚底与点击射线使用实际三角面高度。可编辑的起伏仍为共享顶点的双线性数据，渲染和落地高度则按实际三角面插值。

地面单位按步兵 0.5、骑兵 0.7、攻城单位 0.9 世界单位的半径检查整段移动与崖沿线段的距离。路线、编队落点、逐帧行走、闪烁、生产出口与回城落点使用该轮廓。平坦地基也检查整圈地基是否容纳在地表内。已在地表内但过于贴近崖沿的单位可以沿距离持续增大的方向退回安全位置；空中单位跨越悬崖。

平坦邻域与线性起伏采用等价的解析高度查询，曲线计算在单格内复用。地形连通分量和各兵种半径的固定路线边按地形内容复用，地形编辑、起伏变化与地图更换会更新缓存。规则变化将联机协议更新为 24，旧协议客户端不能加入。

验证入口：

```powershell
node scripts/test-frost-cliff-clearance.mjs
cargo test -p mengine-assets terrain_mesh --target-dir D:/MEngineNativeQA/tile-build-1790939800003
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --terrain-only --cliff-clearance
node scripts/qa-frostbound.mjs --network-only --deterministic-input
```

`cliff-surface-fixtures.json` 包含 16 种邻格高低组合与四类坡道配置，共 64 组。JavaScript 检查这些地块全部三角形中心的高度；Rust 对照其中 768 个完整三角形的世界坐标，误差限为 0.00002 世界单位，并保留原有四区块闭合边、法线、顶面朝向与平面高度验证。修改地形三角化后通过 `--write-fixtures` 重新生成这份对照数据。

原生地形验收使用暂停后的 Agent 逐帧输入与实际渲染，覆盖笔刷、撤销、保存加载、两次试玩、登坡和危险崖角落点。该过程的帧耗时包含编辑、初次载入及人工步进，不作为稳定运行帧率或 5 ms 性能目标的验收。物理鼠标和听音尚未验收。

两台独立原生 Release 编辑器连接同一 TCP 服务，从默认经济开局执行伐木、建祭坛和首次英雄招募，验证混合工人队列、英雄路径、巡逻与重连后的视角保留。阶段结果见 `clearance-terrain-native.json`、`clearance-network-native.json`；构建、打包哈希与验证汇总见 `cliff-clearance-validation.json`。

当前碰撞范围为地表轮廓及足底半径。岩壁中部的凸起尚未使用完整三维人体碰撞体，水面通行仍按水域格子判断；旧存档中落在无地表三角面间隙里的位置也仍需迁移。射击遮挡保留按地块与共享起伏求交的实现。完整原版悬崖变体、经典地图、兵种、美术与战役仍未完成。
