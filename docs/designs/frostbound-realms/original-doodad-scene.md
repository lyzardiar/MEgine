# 原版装饰场景生成

Author: MiYu。

`scripts/build-frost-original-doodads.py` 在原版地形上生成独立的装饰预览项目，消费完整 `war3map.doo`、源 SLK、MDX 与贴图。主游戏 `samples/frostbound-realms` 尚未切换到生成地图；砍伐、碰撞、掉落、保存、寻路、单位放置与联机仍待接入。当前两图生成与 MEngine 原生检查通过，源生命状态和 flags 分流已通过限定模拟执行；原版完整创建／动画调度与实际画面对照仍列入 B001 待测。

## 数据与更新方式

- 从保留的地图原件重新读取 DOO 并核对摘要，保留每条原始放置记录。位置使用 `(X,Z,-Y)/128`，缩放使用 `(sx,sz,sy)`，角度转换为绕引擎 Y 轴的四元数。父实体保存放置变换，网格与发射器是其子实体。
- 资源按地图、War3Patch、War3xLocal、War3x、war3 的顺序读取。模型路径及变体来自 `Doodads.slk`／`DestructableData.slk`。模型必须与已转换库的来源摘要一致；材质引用贴图直接按上述优先级重新解码，因此保留地图内同名贴图覆盖。源替换贴图与网格顶点色从 SLK 取得。
- 复用 `asset-library/warcraft-iii/{game-ready,remaining-ready}`，核对目录、GLB、材质和状态轨道的转换摘要。为蒙皮网格加入源 MDX 节点与轨道，保留 billboard 数据。单候选静止部件不加入更新；单候选动态部件按状态共享时钟，多Stand候选的对象独立计时并共享候选资源。12 Hz 采样帧与序列不变时不重复发布命令，实体 ID 在运行时按名称解析一次。有变化的网格与发射器通过 `pushCommandsJson` 一次提交；旧 Host 沿用逐条路径，批次原生验收必须使用支持新接口的二进制。
- 包含 PREM／PRE2／RIBB／LITE 的模型生成 `SampledEffect`，包括无普通网格的纯发射器模型。发射器沿用现有 viewer 采样器；其随机、发射及运动行为尚未证明与原版求解器一致。
- 初始 Stand 按源64个名称标签筛选候选，按源rarity权重选择，默认使用种子1的独立MSVCR120随机流；`--animation-seed` 可复现不同初始选择。只有 `DestructableData.slk` 中的可破坏物在 life=0 且存在完整名称 `Death` 时使用其末帧，名称忽略大小写并取第一个匹配；缺失时保持初始动画与播放状态。网格和发射器共享同一次序列选择，源／网格／发射器的序列名称与顺序不一致时拒绝生成。普通装饰物忽略生命字节。
- 正向Stand按源整数毫秒推进；到达序列长度后重选、归零并跳过下一次推进，循环与非循环序列均走此结束行为，大步越界不带入新序列。初始选择后继续同一独立随机流，单候选不抽随机数。发射器关闭自主播放，与网格同步发布采样时间；固定Death与suppressed对象不加入调度，suppressed不消耗该随机流。静态多候选对象仍参与结束重选，以保持预览流的调用顺序。
- 放置按源模式值为0时的分流保存 `kind`：普通装饰或 flags&1 为 `decorative`，其余可破坏物在 flags&2 时为 `destructable`，否则为 `suppressed`。父实体仅在 `suppressed` 时 inactive；kind 描述创建路径，不表示碰撞／寻路已实现。完整源字节仍保留；依据见[原件说明](original-doodads-import.md#放置标志分流)。
- 对象覆盖 W3B／W3D、地形装饰变形、模型粒子、无采样序列、无法追溯到原贴图的合成材质暂不支持，遇到时明确报错。未知或已改动模型不会被静默遗漏。
- 生成要求新目录，成功后移动临时项目至目标目录。`doodad-placements.json` 保存放置映射及选定 `animation.clip/held`；`doodad-scene-sources.json` 保存来源归档、模型／资源摘要、转换库摘要、脚本与 DLL 摘要、输出摘要、`animationSeed`及覆盖边界，模型序列保留源rarity。

## 来源与维护

MDX 工具沿用 [Darithos/W3ModelViewer](https://github.com/Darithos/W3ModelViewer)，固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e`。生成项目的 `Assets/Licenses/OriginalDoodads/` 保留 MIT 许可及原转换库的来源收据；实际使用的采样器、节点读取器及各自 `Wc3ModelViewer.Core.dll` 摘要另写入场景收据。

本地工具源码为 `scripts/warcraft-assets/` 与 `scripts/warcraft-node-metadata/`，依赖 .NET 10；构建时将 `Wc3Core` 指向固定上游的 `src/Wc3ModelViewer.Core`。生成器默认使用 `tmp/warcraft-effects/sentinel-bin/MdxExport.dll` 和 `tmp/warcraft-effects/node-metadata/NodeMetadata.dll`，也可通过 `--sampler`／`--metadata-reader` 显式指定。更新工具或转换库后生成新输出，并将受影响验证加入当前测试批次。

地图格式与 REA 证据沿用[装饰读取说明](original-doodads-import.md)，不重复运行同一 DLL 探针，也不将表名／加载入口证据视为运行语义证明。

## 生成与批次验证

直接读取游戏目录中的真实地图，生成可在 Editor 打开的测试项目：

```powershell
python scripts/load-frost-warcraft-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m'
```

入口支持经典 `.w3m/.w3x`，输出默认位于 `tmp/docs-artifacts/warcraft-map-tests/<地图名-时间>/`。`source-map/` 保存原地图及成员摘要，`project/project.json` 是编辑器打开入口；可通过 `--output <新目录>` 固定输出位置。地图资源覆盖、未支持对象和转换依赖沿用本文生成器约束。输入原件只读，现有输出不会覆盖；失败产物保留用于诊断，再次执行需使用新目录。

针对画面修改可执行 `node scripts/qa-frost-original-doodads.mjs <project目录> --visual-only`。设置 `MENGINE_EDITOR_EXECUTABLE` 指向现有原生编辑器，设置独立的 `MENGINE_DOODAD_LABEL` 保存报告。该模式只加载、截取全景及树木／水岸近景、检查控制台并退出，跳过动画／性能完整回归；截图须人工查看，不等于原版画面验收。

2026-10-23 直接加载 `(2)BootyBay.w3m` 的原生检查通过，源 SHA-256 为 `3180a12a1df1cbacc3c11da9260e35fff2a3fe53314f63155e5f0735b2408b9e`。地面法线按实际地面三角形共享累积，悬崖高差不参与平坦地面的坡度计算。修复前1,519块平坦地面受到跨悬崖法线影响，修复后树下平地的方块明暗边界消失。52个网格的位置、UV、索引与旧项目逐项相同，非地面法线保持不变；两个定向用例验证平坦台地和连续斜坡。测试项目在 `tmp/docs-artifacts/warcraft-map-tests/booty-bay-lighting/project/`；截图与报告为 B001 下的 `booty-bay-lighting-*`。原版 World Editor 已启动，但窗口捕获超时，尚无原版同视角对照。

```powershell
python scripts/build-frost-original-doodads.py tmp/docs-artifacts/frost-original-doodads/exported/booty-bay --output tmp/docs-artifacts/frost-original-doodad-scene/booty-bay
node scripts/test-frost-original-doodads.mjs --callback-smoke
```

2026-10-23 必要生成冒烟完成：Booty Bay 的 2,011 条放置使用 67 个模型，生成 5,541 个实体；6 个模型含发射器，92 个部件归入 22 个动态状态组。Python 和生成 JavaScript 语法检查通过；定向回调检查通过，覆盖原地形回调、运行时 ID、相同帧去重、暂停、循环及新上下文。这里的生成数量不表示画面或性能验收。

两图已按本批最终客户端执行以下生成与资源完整性检查并通过；输出目录已存在，后续重建需选择新目录：

```powershell
python scripts/build-frost-original-doodads.py tmp/docs-artifacts/frost-original-doodads/exported/booty-bay --output tmp/docs-artifacts/testing-batches/B001/booty-bay-doodads
node scripts/test-frost-original-doodads.mjs --project tmp/docs-artifacts/testing-batches/B001/booty-bay-doodads
python scripts/build-frost-original-doodads.py tmp/docs-artifacts/frost-original-doodads/exported/amazonia --output tmp/docs-artifacts/testing-batches/B001/amazonia-doodads
node scripts/test-frost-original-doodads.mjs --project tmp/docs-artifacts/testing-batches/B001/amazonia-doodads
```

完整项目检查核对全部源放置、变换、父子关系、输出／源摘要和网格／材质／贴图／粒子引用。Booty Bay 为2,011放置、5,541实体、92动态部件、30个发射器实体；Amazonia 为2,452放置、6,842实体、98动态部件、65个发射器实体。

`qa-frost-original-doodads.mjs <project>` 已在两图验证全部放置和运行时父子ID、动画推进、暂停像素冻结、Stop恢复及重开像素重现；查看了全景、树木、鱼群与火盆近景，控制台error为0。Amazonia另以 `--effects-only` 对两个纯发射器各运行2秒，关闭目标发射器后重放相同时间，像素不同，证明其实际参与绘制。`--single` 用于强制客户端逐条提交；Booty Bay批量／逐条路径的5组对应截图逐字节相同。设置 `MENGINE_EDITOR_EXECUTABLE` 和不同的 `MENGINE_DOODAD_LABEL` 选择二进制及报告名称。

同一新二进制下 Booty Bay 地形54实体截图总耗时中位数4.71175ms，加入装饰后5,541实体25.18910ms；Amazonia装饰项目33.47670ms。Booty Bay装饰项目批量／逐条两次采样分别25.18910／22.84035ms，未观察到原生整帧加速。数据包含GPU、回读及采样波动，且动画每12Hz变化，不能用每次截图对应的最后一个模拟步代表所有动画更新成本。详见性能文档第二十四／二十五阶段与本批报告。

生命分类与 Death 末帧、flags 分流已分别通过原 DLL 的1,024组限定模拟执行。当前八对象夹具通过生成完整性及原生状态验证：零生命普通风车组件与像素推进，死亡树固定末帧，Pause像素稳定；普通 flags=0、树 flags=1 的模型有像素贡献，树 flags=0 被父实体抑制，切换 active 后产生像素。临时相机／active 和 Stop 均恢复，控制台error为0，测试编辑器正常退出。夹具为定向状态测试移位，未重采样地面高度，不作为地图美术验收。证据为 `tmp/docs-artifacts/warcraft-map-tests/life-fixture-79t499fs/result.json` 和 `tmp/docs-artifacts/testing-batches/B001/doodad-state-1792725155040.json`。

原版完整创建、模式初始化、共享随机流初始化／调用顺序、可见性门控与特殊状态队列仍待实际运行对照。正向Stand结束重选已接入；原版同视角渲染、粒子求解器和逐像素一致性仍未验收，不得将以上原生检查写成完整1:1复刻完成。状态夹具可用 `python scripts/test-frost-doodad-life.py` 生成，再设置 `MENGINE_EDITOR_EXECUTABLE` 并运行 `node scripts/qa-frost-doodad-state.mjs <夹具project目录>`；该定向检查复用本批已有二进制。

命名死亡动画边界由 `python scripts/probe-frost-rea-doodad-sequence-cpu.py` 的75组原DLL限定执行与生产选择函数对照验证，涵盖完整名、重复名、大小写、前后空白、前缀／后缀、缺失和空序列，以及首／末帧定位、循环输出和死亡状态3到4。证据为 `tmp/docs-artifacts/warcraft-map-tests/doodad-runtime/sequence-cpu.json`。模型元数据、字符串比较和选择／定位API使用桩，不是原版渲染验收。已有两图中Booty Bay没有零生命放置，Amazonia四个零生命放置均有完整Death，因此此修正不改变其生成行为，复用已有全图验收；缺失Death的原生展示仍待补。

初始Stand的REA3组证据、原DLL265组候选／权重选择、60组权重累积／随机范围、17组rarity及256次本机MSVCR120随机数对照通过。`python scripts/test-frost-doodad-stand.py` 从Amazonia派生24放置／3模型／92实体夹具；显式源候选权重与本机C随机流逐条核对，墓碑选中两个Stand，鱼选中两个Stand。生成完整性与回调检查通过。`node scripts/qa-frost-doodad-stand.mjs <夹具project目录>` 复用已有EXE，检查所有选定clip、墓碑像素贡献、鱼／船推进、暂停及场景恢复，控制台error为0并正常退出。初次测试错误假定墓碑两序列应产生不同像素；源模型唯一节点没有动画轨道，两序列静态几何相同，修正测试预期后通过。证据为 `tmp/docs-artifacts/warcraft-map-tests/stand-fixture-6n4q2ft3/`、`tmp/docs-artifacts/testing-batches/B001/doodad-stand-1792726999821.json`，首轮失败保留在同目录 `doodad-stand-1792726862114.json`。该移位夹具只用于序列验证，不作为地图布局／美术验收；两张完整地图未因本次修改重新生成。

法线修复后的 Amazonia 已从原 `.w3x` 重新生成并完成 `--visual-only` 原生加载、全景及近景检查，2,452放置、6,842实体，控制台error为0，测试编辑器正常退出。项目位于 `tmp/docs-artifacts/warcraft-map-tests/amazonia-lighting/project/`，报告为 `tmp/docs-artifacts/testing-batches/B001/amazonia-lighting.json`；仍未取得原版同视角对照。

生成冒烟及日志保留在 `tmp/docs-artifacts/frost-original-doodad-scene/`；批次画面与性能证据保留在 `tmp/docs-artifacts/testing-batches/B001/`。详情见[测试台账](../../testing-batches.md)。

### Stand结束重选验证

`probe-frost-rea-doodads.mjs --cycle` 的3组REA证据与 `probe-frost-rea-doodad-cycle-cpu.py` 的28步原DLL执行通过。`test-frost-doodad-cycles.mjs` 回放原CPU结果，并验证同clip重选、单候选非循环重启、零／单位权重、批量与逐条一致、提交拒绝后的恢复。源范围和桩说明见[结束回调与时钟](original-doodads-import.md#结束回调与时钟)。

`python scripts/test-frost-doodad-stand.py --cycles` 生成26放置／5模型／96实体：24个多候选对象共享3份候选定义，两种纯发射器使用固定组。独立本机MSVCR120随机流给出跨周期预期；`node scripts/qa-frost-doodad-cycles.mjs <project>` 在真实Editor逐项检查6个时间点的clip、pose、材质、颜色／active及发射器时间，检查纯发射器重启后的像素贡献、暂停、重新Play和Stop恢复，控制台0 error并正常退出。报告 `tmp/docs-artifacts/testing-batches/B001/doodad-cycles-1792728436649.json`，输入为 `tmp/docs-artifacts/warcraft-map-tests/stand-fixture-mcuebye8/`。八对象生成检查另确认Death／suppressed不加入调度，证据 `life-fixture-bk90s45t/result.json`。本次只验受影响的小场景，没有重新生成完整地图、运行全库或构建EXE，不能据此宣称整图性能改善。
