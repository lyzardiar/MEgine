# 原版装饰场景生成

Author: MiYu。

`scripts/build-frost-original-doodads.py` 在原版地形上生成独立的装饰预览项目，消费完整 `war3map.doo`、源 SLK、MDX 与贴图。主游戏 `samples/frostbound-realms` 尚未切换到生成地图；砍伐、碰撞、掉落、保存、寻路、单位放置与联机仍待接入。当前状态为**已实现，待 B001 批次运行验证**。

## 数据与更新方式

- 从保留的地图原件重新读取 DOO 并核对摘要，保留每条原始放置记录。位置使用 `(X,Z,-Y)/128`，缩放使用 `(sx,sz,sy)`，角度转换为绕引擎 Y 轴的四元数。父实体保存放置变换，网格与发射器是其子实体。
- 资源按地图、War3Patch、War3xLocal、War3x、war3 的顺序读取。模型路径及变体来自 `Doodads.slk`／`DestructableData.slk`。模型必须与已转换库的来源摘要一致；材质引用贴图直接按上述优先级重新解码，因此保留地图内同名贴图覆盖。源替换贴图与网格顶点色从 SLK 取得。
- 复用 `asset-library/warcraft-iii/{game-ready,remaining-ready}`，核对目录、GLB、材质和状态轨道的转换摘要。为蒙皮网格加入源 MDX 节点与轨道，保留 billboard 数据。静止部件不加入动画更新；相同状态分组共享，12 Hz 采样帧不变时不重复发布命令，实体 ID 在运行时按名称解析一次。
- 包含 PREM／PRE2／RIBB／LITE 的模型生成 `SampledEffect`，包括无普通网格的纯发射器模型。发射器沿用现有 viewer 采样器；其随机、发射及运动行为尚未证明与原版求解器一致。
- 当前预览选择 Stand；life=0 使用 Death 末帧；父实体初始可见性取 flags 的第 1 位。完整源字节仍保留，这些运行语义及源动画调度需要与原版实际画面对照。
- 对象覆盖 W3B／W3D、地形装饰变形、模型粒子、无采样序列、无法追溯到原贴图的合成材质暂不支持，遇到时明确报错。未知或已改动模型不会被静默遗漏。
- 生成要求新目录，成功后移动临时项目至目标目录。`doodad-placements.json` 保存放置映射；`doodad-scene-sources.json` 保存来源归档、模型／资源摘要、转换库摘要、脚本与 DLL 摘要、输出摘要及覆盖边界。

## 来源与维护

MDX 工具沿用 [Darithos/W3ModelViewer](https://github.com/Darithos/W3ModelViewer)，固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e`。生成项目的 `Assets/Licenses/OriginalDoodads/` 保留 MIT 许可及原转换库的来源收据；实际使用的采样器、节点读取器及各自 `Wc3ModelViewer.Core.dll` 摘要另写入场景收据。

本地工具源码为 `scripts/warcraft-assets/` 与 `scripts/warcraft-node-metadata/`，依赖 .NET 10；构建时将 `Wc3Core` 指向固定上游的 `src/Wc3ModelViewer.Core`。生成器默认使用 `tmp/warcraft-effects/sentinel-bin/MdxExport.dll` 和 `tmp/warcraft-effects/node-metadata/NodeMetadata.dll`，也可通过 `--sampler`／`--metadata-reader` 显式指定。更新工具或转换库后生成新输出，并将受影响验证加入当前测试批次。

地图格式与 REA 证据沿用[装饰读取说明](original-doodads-import.md)，不重复运行同一 DLL 探针，也不将表名／加载入口证据视为运行语义证明。

## 生成与批次验证

```powershell
python scripts/build-frost-original-doodads.py tmp/docs-artifacts/frost-original-doodads/exported/booty-bay --output tmp/docs-artifacts/frost-original-doodad-scene/booty-bay
node scripts/test-frost-original-doodads.mjs --callback-smoke
```

2026-10-23 必要生成冒烟完成：Booty Bay 的 2,011 条放置使用 67 个模型，生成 5,541 个实体；6 个模型含发射器，92 个部件归入 22 个动态状态组。Python 和生成 JavaScript 语法检查通过；定向回调检查通过，覆盖原地形回调、运行时 ID、相同帧去重、暂停、循环及新上下文。这里的生成数量不表示画面或性能验收。

批次执行以下检查，当前均为**待测**：

```powershell
node scripts/test-frost-original-doodads.mjs --project tmp/docs-artifacts/frost-original-doodad-scene/booty-bay
python scripts/build-frost-original-doodads.py tmp/docs-artifacts/frost-original-doodads/exported/amazonia --output tmp/docs-artifacts/testing-batches/B001/amazonia-doodads
node scripts/test-frost-original-doodads.mjs --project tmp/docs-artifacts/testing-batches/B001/amazonia-doodads
```

完整项目检查核对全部源放置、变换、父子关系、输出／源摘要和网格／材质／贴图／粒子引用。首次执行后按结果修复，不预先宣称通过。

原生 Editor 分别打开两份生成项目，核对树木、鱼群、火盆、瀑布及 Amazonia 两个纯发射器；观察父子变换、透明材质、billboard、暂停／单步／Stop／重开与控制台错误。源 flags、life 与动画选择另与原版地图对照。使用同一二进制、视角和窗口尺寸，采集地形项目与装饰项目的加载、空闲、Play 帧时间及内存；数千实体的成本与现有 Frostbound 受影响场景合并评估。该批不默认扩大为所有地图或整个仓库回归。

生成冒烟及日志保留在 `tmp/docs-artifacts/frost-original-doodad-scene/`；批次画面与性能证据保留在 `tmp/docs-artifacts/testing-batches/B001/`。详情见[测试台账](../../testing-batches.md)。
