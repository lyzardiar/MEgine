# 批次测试台账

Author: MiYu。2026-10-23起执行，规则入口为[AGENTS.md](../AGENTS.md)。

任务完成时提交代码、必要资产和待测记录，默认累计3个功能／修复任务后合并验证。原始日志、截图、性能采样等写入`tmp/docs-artifacts/testing-batches/<批次号>/`；本文件只保留范围、状态和精简结论。

## 当前批次 B001

- 计数起点：`f90ccb1ac6fede47ff1b7a4909ecc93babed7d95`之后的新功能／修复任务。
- 已登记：3 / 3。
- 状态：B001-02／03 已完成验证；B001-01 原版行为对照待补，保留本批，不开始下一批。
- 此前已执行的验证沿用各阶段记录；本次规则更新不增加计数。
- B001-01 补充：`load-frost-warcraft-map.py` 直接接收真实地图，地面法线改按实际三角形累积；Booty Bay 直接加载、两个法线用例及原生全景／近景检查通过，52网格的位置／UV／索引保持一致。截图 `B001/booty-bay-lighting-*.png`，生成项目及几何对照在 `tmp/docs-artifacts/warcraft-map-tests/booty-bay-lighting/`。Amazonia 更新法线后的原生近景已通过，报告 `B001/amazonia-lighting.json`。原版同视角、完整创建／动画调度仍待测；沿用已有通过项，不重跑全库或重建引擎。
- B001-01 生命分类修复：`build-frost-original-doodads.py` 只对源可破坏物应用死亡状态；`probe-frost-rea-doodads.mjs --life` 3组新增证据、`probe-frost-rea-doodad-life-cpu.py` 1,024组限定原DLL执行、初版三放置真实生成夹具均通过。修复不改变两张原地图现有放置的状态，不重复生成或运行全图。
- B001-01 flags分流补充：`warcraft_doodads.py`、生成器及完整性检查按类别与flags保存kind，仅suppressed父实体inactive。`probe-frost-rea-doodads.mjs --flags` 2组证据、`probe-frost-rea-doodad-flags-cpu.py` 1,024组限定原DLL执行、扩展八对象生成及完整性／回调检查通过。`qa-frost-doodad-state.mjs` 原生定向验证通过：普通life=0风车动态、死亡树末帧、暂停像素、flags模型贡献与抑制、恢复及控制台0 error；报告 `B001/doodad-state-1792725155040.json`，生成证据 `tmp/docs-artifacts/warcraft-map-tests/life-fixture-79t499fs/result.json`。复用本批EXE；源码分流不等于完整创建／碰撞／寻路已实现，原版模式初始化、完整调度与画面对照继续待测。本补充不增加任务计数。
- B001-01 命名死亡动画补充：`warcraft_doodads.py`、`build-frost-original-doodads.py` 按完整Death名称选择首个匹配，缺失时保留初始动画与播放；`probe-frost-rea-doodad-sequence-cpu.py` 的75组限定原DLL执行／生产选择对照通过，证据 `tmp/docs-artifacts/warcraft-map-tests/doodad-runtime/sequence-cpu.json`。两张已验收图的零生命放置均不触发缺失Death路径，复用其结果；缺失Death的原生展示、Stand候选／随机调度及原版同视角仍待补。此为本批补充，不增加任务计数，不重复全图、全库或构建。
- B001-01 初始Stand补充：`warcraft_doodads.py`、生成器与地图入口接入源64标签评分、MDX rarity权重和可复现MSVCR120随机流；`--animation-seed`默认1，网格／发射器共享选择，收据保留种子与clip。`probe-frost-rea-doodads.mjs --stand` 3组证据、`probe-frost-rea-doodad-stand-cpu.py` 265组选择／60组范围／17组rarity／256次C rand对照及受影响的75组死亡边界通过。`test-frost-doodad-stand.py` 生成24放置／3模型夹具，完整性和回调通过；`qa-frost-doodad-stand.mjs` 原生选择、像素贡献、动画、暂停、恢复及0 error通过，复用EXE，报告 `B001/doodad-stand-1792726999821.json`。首轮错误的墓碑差异断言失败保留在 `B001/doodad-stand-1792726862114.json`，据源静态轨道修正后通过。未重跑全图／全库／构建；原版随机流初始化与调用顺序、结束后重选、缺失Death原生展示和同视角画面对照继续待补。本补充不增加计数。

| 任务标识 | 变更路径／提交 | 待测场景与预期 | 执行命令／人工操作 | 已做快速检查 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B001-01 原版装饰场景 | `4bf357b`：`scripts/build-frost-original-doodads.py`、`scripts/frost-original-doodads-client.js`、`scripts/test-frost-original-doodads.mjs`；生成资产复用已提交的转换库，验证项目保留本地 | 两图全部放置／变换／摘要／资源引用；原生父子变换、网格与纯粒子、透明／billboard、暂停重开；原版 flags／life／动画语义对照；数千实体加载、空闲、Play 性能 | 按[场景说明的批次命令与操作](designs/frostbound-realms/original-doodad-scene.md#生成与批次验证)执行；B001-02 已更新客户端，两图按最终脚本重新生成到新目录；同一新二进制对比地形与装饰项目，按累计影响合并 Frostbound 回归 | Booty Bay 生成冒烟成功：2,011 放置、67 模型、5,541 实体；Python／生成 JS 语法及定向回调检查通过；数量来自 `4bf357b` | 生成完整性与 MEngine 原生验证通过；原版行为对照与画面修复未完成 |
| B001-02 脚本命令跨桥批次 | `crates/mengine-script/src/{bridge.rs,engine_api.js,vm_v8.rs,vm_quickjs.rs,command_batch_tests.rs}`；CLI／共享脚本声明；装饰客户端与定向用例 | 双 VM 有序提交、精确整数、非法整批拒绝、空批次、单命令／精灵命令交错、失败帧清理和宿主隔离；新旧 Host 客户端命令一致；1／32／256／1024 条命令的跨桥性能；生成项目真实 Play | 下节批次命令；双 VM 库用例及手动基准；一次 SDK／原生构建供 B001-01／02 共用，装饰项目用新脚本重新生成后做原生验收；原 Frostbound Play／Pause／Step／Stop 回归一次 | 两种 VM `cargo check --lib`、JS 语法及客户端单条／批量输出对照通过；CLI 类型检查结果见第二十四阶段 | 双 VM 行为与基准、SDK／EXE 构建及原生验证通过；性能限制见下方结论 |
| B001-03 嵌入视图根筛选 | `crates/mengine-runtime/src/frame_compiler.rs`、`frame_mesh_cache_tests.rs` | 共享父链距离复用、128层包含边界、深层查询不污染较浅候选、循环、旧generation、重设父级、主相机／UI-only、对象顺序及相机副本隔离；浅层成本与深层收益 | `cargo test -p mengine-runtime --release --lib frame_compiler -- --test-threads=1`；另以 `benchmark_cached_render_root_filter -- --ignored --nocapture --test-threads=1` 运行同进程对照；与 B001-01／02 共用最终 SDK／EXE 和一次 Frostbound 原生回归 | `cargo check -p mengine-runtime --lib`；结果见第二十五阶段 | 行为、基准与原生验证通过；浅层成本增加约0.02ms |

### B001-01 Stand结束重选补充

变更为 `scripts/{warcraft_doodads.py,build-frost-original-doodads.py,frost-original-doodads-client.js}` 及对应探针／夹具／QA。源整数毫秒时钟驱动Stand结束重选、seek归零和下一步跳过；多候选对象共享候选资源、各自计时，单候选动态组共享更新，固定Death／suppressed排除。网格与发射器同步，提交成功才确认已发布帧。放置收据索引保持源顺序，分别统计网格部件、发射器和独立调度对象。

本补充不增加3/3计数。针对新增调度风险已执行：

- `node scripts/probe-frost-rea-doodads.mjs --cycle`：3组REA证据通过；首次callback组预期了本组未读取的Stand字符串，改用实际状态字段／调用地址后通过，原始运行记录保留于会话。
- `python scripts/probe-frost-rea-doodad-cycle-cpu.py`：28步原DLL时钟／结束分派／seek通过；`node scripts/test-frost-doodad-cycles.mjs` 对照该结果，并通过同clip重选、固定非循环重启、零／单位权重、批量一致及拒绝恢复检查。
- `python scripts/test-frost-doodad-stand.py --cycles` 和 `test-frost-original-doodads.mjs --project <project>`：26放置／5模型／96实体生成、来源顺序、资源摘要及回调检查通过。`test-frost-doodad-life.py` 八对象生成检查通过，Death和suppressed不加入调度。
- `node scripts/qa-frost-doodad-cycles.mjs <project>`：6个检查点与独立MSVCR120后续选择一致，覆盖clip／pose／材质／颜色／active、鱼的附属发射器和两个纯发射器；纯发射器结束重启后的像素贡献、暂停、重新Play／Stop恢复通过，0 error，测试进程正常退出。报告 `B001/doodad-cycles-1792728436649.json`，项目 `tmp/docs-artifacts/warcraft-map-tests/stand-fixture-mcuebye8/project`；生命夹具为同目录下 `life-fixture-bk90s45t/`。

复用本批EXE，没有全图生成、整库测试或构建；无整图性能改善结论。B001-01继续保留原版共享RNG初始化／调用顺序、隐藏／离屏更新、特殊状态队列、完整创建／模式、缺失Death原生展示、粒子求解器和同视角画面待测项。按[场景说明](designs/frostbound-realms/original-doodad-scene.md#stand结束重选验证)复现本补充；后续只验证上述剩余项与新增修复影响范围。

B001-01 地表图集采样补充：`build-frost-original-terrain.py` 生成64像素对齐图集和逐级边界约束Shader，防止缩小时混入其他地表图块；原地图位置／法线／索引、纹理层和基础像素不变。`test-frost-terrain-atlas.py` 与 `qa-frost-terrain-atlas.mjs` 的六色GPU对照通过：7种LOD下区域与各自中心基准最大差0，整图mip对照在LOD3／6的最大差201／205。Amazonia 26网格／1,502图块对比、原生远近景、重开／恢复与0 error通过，EXE复用，图集基础像素量减少约11.4%，未宣称整帧提速。证据 `B001/terrain-atlas-1792729576774.json`，GPU截图复用 `terrain-atlas-1792729481847.json`；测试入口修正前的失败记录均保留。新项目 `tmp/docs-artifacts/warcraft-map-tests/amazonia-atlas/project/`；其余既有完整装饰项目保留原版本。此为B001-01修复，不增加3/3计数，不重跑全库／全地图或构建。新Shader同场景性能对照和水面采样见下节，原版同视角验收仍待补；具体命令见[地表采样说明](designs/frostbound-realms/original-terrain-scene.md#地表缩小采样隔离)。

### B001-01 水面采样与图集性能补充

变更为 `scripts/build-frost-original-terrain.py`、`test-frost-water-atlas.py`、`qa-frost-water-atlas.mjs`、`qa-frost-atlas-performance.mjs`。水面按源帧对齐，逐级帧内repeat双线性与相邻mip插值；源45帧RGBA、26个GLB、场景／时钟／地表／深度纹理保持一致，基础像素量约减少6%。Python／JS语法与差异检查通过。

原生16组帧／LOD对照通过：色调映射前RGBA误差≤1/256，映射后平均通道差≤0.00311、最大13；旧路径LOD7最大差63。真实Amazonia水动画、Pause、Stop恢复、重新Play像素与0 error通过，报告 `B001/water-atlas-1792730970604.json`。复用 `1792730626971` 的固定／参考截图和 `1792730892027` 的线性比较截图；原始像素断言失败和项目切换失败记录保留。新地形项目 `tmp/docs-artifacts/warcraft-map-tests/amazonia-water-atlas-v2/project/`，不含装饰、单位或对局接入。

同Editor相同场景交替旧／新采样，每视角每模式18帧硬件timestamp：地表GPU pass全景1.08268→1.10280ms、近景1.30742→1.32826ms；水面全景1.10208→1.21182ms、近景1.32942→1.44512ms。报告分别为 `B001/atlas-performance-ground-1792730050507.json`、`B001/atlas-performance-water-1792730993831.json`。已补地表Shader成本与水面采样检查，未证明FPS提升。继续保留原版同视角、粒子求解器、完整创建／共享调度语义和主游戏接入待测；B001仍3/3，未重建引擎、重跑全库或全地图。

### B001-01 原版单位放置数据补充

原地图接入继续使用B001：`warcraft_units.py` 接入 `warcraft_map.py`、导出器与地图加载入口，保留经典7/9、8/11的单位／物品／金矿／起点、四种随机模式及全部配置字段；额外保留W3U／W3T／W3A覆盖原件，尚未应用。新增Python布局及导出测试、固定上游读取器对照、JASS字面量审计，REA探针增加WorldEdit `--units`。

5组单位检查与受影响导入器9组检查通过；8夹具及两图159条记录的独立字段／字节对照通过。两图155条CreateUnit、4个起点、10处资源量匹配；REA2组文件名／脚本生成引用通过。单次unittest discover因连字符模块名发现0项，不计通过；新增导出用例随后用importlib显式执行1项通过。产物 `tmp/docs-artifacts/warcraft-map-tests/unit-placements/` 与 `tmp/docs-artifacts/frost-original-maps/unit-evidence/`，命令和字段范围见[单位说明](designs/frostbound-realms/original-map-import.md#单位与物品放置)。未构建、重跑原生QA、遍历全地图或全库。

这些是开局数据与源文本对照；单位尚未实例化、JASS未执行。原尺寸坐标／寻路、对象覆盖、随机表求值、单位资源与出生流程、保存／联机及原版对局验收继续待测。B001保持3/3，02／03已通过，01未结算。

### B001-01 原版单位视觉补充

`build-frost-original-units.py`、共享模型资源类和地图加载入口把源模型、缩放、颜色、移动高度、采样Stand及PREM模型粒子接入独立场景；复用已有地形／装饰项目，`sloc`仅保留记录。Amazonia新增96个视觉对象／561实体，复用基础28实体，33模型、148更新组、338单位资产。2组变换／拒绝边界测试、生成资源摘要和基础网格／实体一致性通过；REA1组外观字段字符串证据通过。

`B001/original-units-1792732411819.json` 的全部变换／父子关系、动画、暂停、Stop恢复、金矿／石头人／飞羊像素贡献与重开一致通过，末尾待机羽毛断言失败；源轨道表明羽毛仅Death发射。失败项改为手动采样Death0.5秒后，定向 `--effects-only` 报告 `B001/original-units-1792732541325.json`通过，模型粒子有像素贡献、重开一致、0 error。原失败完整保留，不把手动采样当作死亡玩法。复用EXE，无全库／全地图／构建；未重新运行已通过目标。

新项目 `tmp/docs-artifacts/warcraft-map-tests/amazonia-units/project/` 只含地形与单位。完整装饰＋单位组合入口、其他地图、实际Unit创建／JASS／寻路／保存联机、原版同视角继续待测，B001仍3/3。复现命令见[单位视觉场景](designs/frostbound-realms/original-map-import.md#单位视觉场景)。

### B001-01 原地图组合入口验收

完整入口生成Amazonia地形／水面／装饰／单位项目：`tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project/`，2,452装饰放置、96单位视觉对象、7,403实体。新增`qa-frost-original-map-composition.mjs`，加载入口按项目内容返回组合或单位检查命令；本补充不增加任务计数。

原生定向报告`B001/original-map-composition-1792733463253.json`通过：合并后的放置名称与父引用、三层动画同时推进、暂停像素、Stop全部恢复、重开状态与像素一致，控制台0 error。单位资产与基础6,842实体／地形网格完整性检查通过。复用EXE，未运行旧单层QA、全库或构建；打开加快照5.01秒和截图耗时仅为观察值。全景／金矿周边截图保留本地，Editor正常退出，WebView锁缓存保留。

B001仍3/3，02／03已通过；01剩余原版行为／同视角、对象覆盖及主玩法接入未结算。复现入口见[合并地图说明](designs/frostbound-realms/original-map-import.md#合并原地图测试项目)。

### B001-01 大图绘制状态复用

变更：`crates/mengine-rhi/src/{renderer.rs,material_submission_tests.rs}`。shadow／forward pass内部复用未变化的纹理和网格绑定，forward同时复用管线、阴影采样及环境绑定；保留逐物体动态uniform、绘制次数与排序。该项处理组合原地图暴露的重复绘制准备，计入B001-01补充，不增加3/3计数。

已做定向验证：`cargo check -p mengine-rhi --lib`；材质提交2项GPU用例、独立嵌入视图1项通过；共享资源和混合资源各1次交替基准通过，像素与重复绑定基准逐字节一致。4,096共享物体世界通道3.299325→2.454825ms，混合输入4.879525→4.351100ms，均为CPU编码耗时。完整数值和命令见[第二十六阶段](performance-risk-todo.md#第二十六阶段大图绘制状态复用)，日志`tmp/docs-artifacts/testing-batches/B001-draw-bindings-*.log`。

状态：实现及定向GPU验证完成，**原生集成待批次执行**。下一次相关构建只做一次Editor构建，在Amazonia组合项目验证Scene／Game切换、不同相机／材质下绘制、Play／Pause／Stop与错误日志；涉及嵌入视图的原生场景一并验证。需要性能结论时固定相机／世界状态并对齐轮询帧做新旧比较。未重建原生EXE、未重跑地图QA或全库；上一版截图不作为此次修改的运行证明。B001-01其余原版行为与主玩法待测项继续保留。

### B001-01 原始WPM运行时

新增`game/warcraft-pathing.js`、`install-frost-original-pathing.py`、`test-frost-original-pathing.mjs`、`probe-frost-pathing-cpu.py`，地图入口自动安装；REA探针增加`--pathing`。原尺寸／原点／轴向的基础格查询、可变标志和独立快照接入生成项目脚本。此为地图接入补充，不增加3/3计数。

已完成定向检查：REA2组入口／类型／修改证据、原DLL259组掩码和4,608组标志写入、对应JS组合及矩形边界／畸形数据；Amazonia147,456格、Booty Bay294,912格在生成脚本中逐格匹配原WPM，Node VM重建恢复原值；重复安装和不同地图拒绝且原脚本保持。证据`tmp/docs-artifacts/frost-original-maps/pathing-evidence/`，Booty脚本夹具`tmp/docs-artifacts/warcraft-map-tests/pathing-runtime/booty-bay/`。新增来源摘要的首次断言因CRLF归一化失败；修复后只复测CRLF／LF字节保留、摘要、相同网格及生成脚本，结果见`pathing-evidence/installer.json`。容量拒绝及语法已检查，沿用不受影响的逐格结果。

**待合并原生验证**：与绘制状态修复共用下一次Editor构建，检查原地图项目加载及Play／Stop，核对新增`originalMapPathing`状态和场景恢复。尚未接入主模拟的移动／视野／保存、动态阻挡、路径搜索或JASS；静态网格查询不作为原版完整寻路行为验收。本次没有原生QA／全库／全地图或构建，B001-01继续保留。

### B001-01 同工程地图目录与场景生命周期

变更：`game/{client,map-session}.js`、脚本拼装／安装／缩略图导出工具、`Assets/Maps/amazonia/`、目录与项目构建场景。地图通过同一游戏选图菜单加载，返回／重载重建实体缓存、动画与 WPM 状态；原文件、转换来源和资产摘要随包保留。本项属于主玩法接入基础设施补充，不增加3/3计数。

已验证：`node scripts/test-frost-map-session.mjs` 的真实生成脚本菜单点击、场景替换、失败重试、旧遭遇战再开、WPM 隔离及摘要；安装器完整安装／非法和重复 ID 拒绝。Editor 共用一次 `cargo build -p mengine-editor-tauri --release --features custom-protocol`，日志 `B001/map-session-build.log`，EXE SHA-256 `8a6268d41aefb3d3fbac9a19c9cb69244b3c329c167c4d555abf6184f3dfcc63`，同时包含绘制状态复用和 WPM。

`qa-frost-map-session.mjs` 原生行为断言全部完成：菜单选原图、地形／装饰／单位动画、暂停像素、移动视角、重载、鼠标和键盘返回、再开原有遭遇战、Stop 恢复主场景和重开标题。报告 `map-session-1792743004654.json` 的最终日志查询因 limit=400 超过300上限而失败，保留失败状态。修正后用 `--logs-only` 仅补加载与日志检查，`map-session-1792743134396.json` 通过；原版缩略图及空白／无效控件隐藏的最后定向检查为 `map-session-1792743303829.json`，通过且0 error。未重复全库、性能基准、原地图全量遍历或构建。测试进程正常退出，WebView锁缓存保留。

仍待：独立 Player 打包后的场景加载、其他尺寸地图、多图间切换、原生嵌入视图，以及原版行为和完整对局接入。Amazonia 仅登记场景运行，主模拟任意尺寸、出生／资源／单位、动态寻路／视野／保存／网络和 JASS 继续留在 B001-01；原地图可见和动画正确不作为对局规则验收。此原生场景覆盖新 RHI 的实际地图绘制与生命周期，但没有新的整帧性能结论。

### B001-02 执行命令

```powershell
cargo test -p mengine-script --release --lib -- --test-threads=1
cargo test -p mengine-script --release --lib --no-default-features --features quickjs-runtime -- --test-threads=1
cargo test -p mengine-script --release --lib benchmark_command_batch_transport -- --ignored --nocapture --test-threads=1
cargo test -p mengine-script --release --lib --no-default-features --features quickjs-runtime benchmark_command_batch_transport -- --ignored --nocapture --test-threads=1
node scripts/test-frost-original-doodads.mjs --callback-smoke
node scripts/prepare-editor-build-sdk.mjs
cargo build -p mengine-editor-tauri --release --features custom-protocol
```

基准在同一进程交错比较逐条／批量 JSON 提交，先核对命令值和顺序；不含世界应用、绘制及 IPC。原生 SDK 与 EXE 一次构建后供本批所有集成场景使用。保留单命令路径的对照产物；相同最终二进制及场景无需因不同任务重复验收。

## 登记要求

1. 每项功能或修复使用稳定任务标识，提交前补充一行待测记录。提交尚未产生时记录准确路径，批次执行时根据Git历史补齐提交范围。一个任务的补充提交更新同一行。
2. 写明受影响行为、验收预期和可执行的命令／人工步骤；覆盖所需的关联模块和数据。仅写“全部回归”或“后续测试”不能作为测试计划。
3. 区分已经执行的快速检查和待执行的测试。新编写但未运行的用例标为待测；保留本次未执行的性能对照、真实运行和多客户端验收要求。
4. 在同一批内合并相同测试，并保留每个任务到测试的对应关系。记录所用代码、二进制、SDK和输入资产版本，确保结果覆盖本批集成状态。

## 批次执行

达到3个任务，或用户要求提前验证时，先汇总本批的变更和覆盖需求，再执行合并后的测试。按需要选择针对性用例、受影响模块测试、集成／原生运行和性能采样；全量仓库或全量地图／资产测试只有在累计影响需要时才加入。

同一构建与相同测试场景只执行一次，结果可同时覆盖多项任务。已有结果的代码和输入未变化时直接引用。测试过程中出现失败，记录原始错误和受影响任务；修复后重测失败项及修复影响范围。

发布或打包交付前完成相关待测项。只因批次未满而结束一次对话时，保留当前计数和台账，下一次接续，不自动把每轮对话当成完整验证批次。

## 结算记录

每批结束追加：批次号、实际提交范围、任务列表、合并后的执行项、通过／失败及未执行原因、证据目录、遗留问题。已通过的任务归入结算；失败或未执行的任务继续保留并关联后续修复，不能清零隐藏。当前批次所需覆盖全部完成后建立下一批。

### B001 合并验证进度（2026-10-23）

实现提交为 `4bf357b`、`9183cbf`、`a750f1b`；批次期间的解析性能修正、TCP测试夹具修正与验收脚本为同批补充，不增加任务数。原始证据位于 `tmp/docs-artifacts/testing-batches/B001/`；早期脚本库日志位于上一级 `B001-script-v8-tests.log`。原生编辑器报告为 `tmp/docs-artifacts/editor-performance-risk/b001-editor.json`，地形对照为 `tmp/docs-artifacts/frost-original-terrain/b001-booty-terrain.json`。

- B001-01：两图4,463条放置的完整生成／资源／变换校验通过；原生父子关系、动画、暂停／Stop／重开、控制台和纯发射器像素贡献通过。原版 flags／life／动画调度实际对照尚未执行，继续待测；地表层边界与原版粒子求解器一致性也未确认，不将独立预览交付写成主游戏完成。
- B001-02：V8整库初次43通过、4忽略；QuickJS初次42通过、1个TCP夹具失败、4忽略。接收socket改为显式阻塞后，失败项在两种VM下各1通过。最终批次解析5个行为用例加1个基准在两种VM下各6通过，完整保留初次失败记录。CLI、共享API、SDK及真实Play通过；Booty Bay单条／批量5组截图逐字节一致。V8微基准接近持平，QuickJS大批次约快9%，没有原生整帧加速结论。
- B001-03：frame_compiler 10通过、4手动基准忽略；共享祖先基准单独1通过，4,096候选在1／16／64层与原函数结果逐项相同。深层共享链耗时下降，浅层增加约0.02ms；同批Frostbound真实编辑、undo／redo、持久恢复、资产监听、Play／Pause／Step／Stop及热更新检查通过。

SDK与原生EXE只为本批统一构建一次，版本摘要见 `sdk-binaries.json`；EXE SHA-256 为 `cd7954d86ce37b651cc8c09b7a44d5364951523d600a4479911d925f7ad27820`。所有测试编辑器正常退出，部分WebView缓存锁保留；主样例源文件保持不变。已通过项目不重复执行，接下来仅补 B001-01 剩余原版对照，失败时再重测修复影响范围。本批尚未全部结算。


### B001-01 任意地图文件入口

变更：runtime 内容导入任务／脚本 API／Editor Play 与 Player 接口，`game/{client,map-session}.js`、MapSelection prefab／Main 场景与脚本、项目导入器配置，`runtime-import-frost-map.py`、`prepare-frost-map-import.py`、包安装器运行时模式及两项定向 QA。游戏文件选择框选择任意路径的 `.w3m/.w3x`，后台转换、取消、失败提示、摘要缓存与同次 Play 切换；此为同一地图接入任务补充，B001 保持 3/3。

快速检查：Rust 内容导入 3 通过（成功／失败／Drop 子进程清理、取消后迟到结果、路径约束），脚本桥接 1 通过；生成脚本任意地图菜单测试通过。Echo Isles 原文件 SHA256 为 `081cf08ec48ace39670cc786a896ee1ede6c5bab0bab3f9fe3232160d1b5bf9a`，未加入 catalog，冷转换与缓存摘要检查通过。夹具首轮的 UI 刷新间隔／PowerShell 扩展路径错误保留在日志；修正后只复测本项。

本任务一次 Editor 构建：`arbitrary-map-build.log`，EXE SHA256 `604ac3e46f7eb559cf310568da80a311c2fac69429bedf9c84c78176e3670fcf`；原生报告 `arbitrary-map-1792745402307.json` 全部通过、0 error，7,221 个场景实体。验证文件框启动／取消；实际选择路径由 QA 注入同一 API，未自动点击文件框内部。冷转换期间菜单响应、无 Play 重启的场景切换、返回和缓存复用、Stop 恢复均通过。源码 Main SHA256 `d0b682f32a7bbd990b4bcd419b6f201d134b78de6bd92161b1912dff1b25e7a5`。所有原始输出在 `tmp/docs-artifacts/testing-batches/B001/`。

复验命令：`cargo test -p mengine-runtime --lib content_import::tests -- --test-threads=1`、`cargo test -p mengine-script --lib scripts_request_content_import_and_receive_result -- --test-threads=1`；先用 `runtime-import-frost-map.py --project samples/frostbound-realms --source <map> --result <tmp/result.json>` 转换 catalog 外地图，再运行 `node scripts/test-frost-map-import.mjs <tmp/result.json>`；设置 `MENGINE_EDITOR_EXECUTABLE` 后运行 `node scripts/qa-frost-map-import.mjs <map.w3x>`。

待测：文件框内人工选中文件并确认、跨盘作业发布／取消残留清理、新机器转换器准备及独立 Player 分发。完整地图格式／JASS／对局兼容性仍属 B001-01 未完成项；本次不重复其他玩法、全库回归或性能基准，不据此宣称完整 War3 地图兼容。

补充缓存完整性检查：`python scripts/test-frost-map-cache.py` 4 通过，覆盖有效缓存、原图被修改、资产被修改／缺失和跨包路径拒绝；最终 Echo Isles 缓存摘要复验通过。证据 `B001/map-cache-tests.log` 与 `B001/arbitrary-echo/final-cache-result.json`。


### B001-01 跨地图资源共享

变更：`warcraft_resource_cache.py`，地形／装饰／单位构建器的可选缓存参数，`frost-shared-map-assets.mjs`、地图安装器、运行时导入器 v2 与三个窄测试。公共 MPQ 成员和纯转换结果持久缓存；最终依赖按内容摘要发布到 `Assets/WarcraftShared/v1/`，地图覆盖资源保持档案优先级，损坏缓存禁止来源降级。整图缓存身份包含游戏档案、reader、工具和实际生成输入；成功作业只清理本次独占创建的中间目录。属于 B001-01 接入补充，计数仍为 3/3。

已执行：`python scripts/test-warcraft-resource-cache.py` 6 通过，`python scripts/test-frost-map-cache.py` 5 通过；`node scripts/test-frost-shared-map-assets.mjs` 的递归依赖、跨图共用、同名不同内容、GLB片段／二进制、循环／缺失引用和不可变发布通过。独立只读审核发现并修复缺失blob误降级、遗漏缓存失效输入和复用既有stage后误清理问题，修复后复核通过。实际生成脚本的菜单切换测试通过。

两图定向导入：最终 Amazonia／Echo Isles 在 `shared-maps/amazonia-final` 与 `shared-maps/echo-final`；共享 298 个文件、56,854,680 字节，清理成功作业的中间文件；统计 `shared-maps/sharing-summary.json`。首轮 Amazonia 失败由本机旧 sentinel 转换器缺少粒子模型字段引起，保留 `shared-amazonia.log`，运行准备脚本后恢复；相关 `.NET` 构建只用于更新实际转换工具，没有重建 Editor 或扩大到全库测试。

原生 `arbitrary-map-1792746961699.json` 通过，0 error、7,221实体；复用 EXE SHA256 `604ac3e46f7eb559cf310568da80a311c2fac69429bedf9c84c78176e3670fcf`。验证共享资源的实际渲染、转换期间菜单响应、同次Play切图／返回、整图缓存和Stop恢复。重新生成地图包时 225 次公共成员读取全命中，120 次纹理解码、79 次节点解析、183 次网格标注、183 次动画变化分析、19 次特效转换均命中缓存，0 新成员解包／0 新派生构建。所有日志、报告、截图仍存 `tmp/docs-artifacts/testing-batches/B001/`。

待批次：共享包独立 Player 分发、跨盘发布、旧预装／v1缓存迁移与历史空间回收；旧包本次保持兼容，未删除。未新增完整War3对局、JASS、全部地图格式或性能帧率结论，不重复已通过的B001-02／03及无关玩法测试。

### B001-01 地图加载进度条

变更：`content_import.rs` 的工作线程进度转发和项目脚本类型；运行时地图导入器／装饰物／单位构建器的步骤与数量快照；`game/{client,map-session}.js`、MapSelection prefab、Main 场景／生成脚本及构建源。转换条按实际步骤和数量推进；缓存校验、取消和失败状态可见。场景切换前先提交加载界面，等待 `onSceneLoaded`；同步场景加载期间不估算百分比。本项为地图入口补充，B001 仍为 3/3。

本次快速检查：`cargo test -p mengine-runtime --lib content_import::tests -- --test-threads=1` 4 通过，包含真实子进程进度转发、取消与迟到结果、异常快照；`python scripts/test-frost-map-cache.py` 7 通过，包含数量回调、原子快照和节流；Python 语法检查通过。`node scripts/test-frost-map-import.mjs tmp/docs-artifacts/testing-batches/B001/shared-maps/echo-final/result.json` 与 `node scripts/test-frost-map-session.mjs` 通过，覆盖真实生成脚本／UI实体、进度不随时间虚增、进入提示先于场景请求、失败重试、取消收起、预装与动态地图入口。Rust日志为 `tmp/docs-artifacts/testing-batches/B001/map-progress/runtime-tests.log`。

待批次验证：在同一次集成 Editor／Player 构建上运行 `qa-frost-map-import.mjs <map.w3x>`，观察冷转换各阶段及数量、热缓存校验、取消／失败恢复、预装地图直接进入和不同窗口尺寸的进度条布局。验收须确认界面在同步场景加载前已实际呈现，并记录首次资源绘制期间的停顿；脚本夹具不能替代该原生验收。本次不执行全量地图转换、Editor发布构建、无关玩法或已通过批次项目回归。

2026-10-23 原生补验：一次集成 Editor 构建，EXE SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`。`arbitrary-map-1792757158153.json` 通过：原版 Echo Isles 冷转换／缓存导入、转换期间菜单响应、进入前实际截图、7,221实体和0 error。冷流程收取62条进度事件，含2,491装饰、97单位和496资源校验；此处数量包含起点记录。截图发现进入时按钮、说明和选中地图信息更新未与加载条同步，已让状态文字每次轻量更新、目录替换只强制一次菜单刷新。最终 `arbitrary-map-1792757510780.json` 仅复测缓存进入，地图标题、按钮、说明、加载条与场景请求一致，返回收起，0 error；没有重复冷转换或重建。中间视觉检查记录 `arbitrary-map-1792757417165.json` 保留。

QA增加 `--cache-project <前次隔离项目>`，校验源地图和共享文件摘要后复用已完成地图包；进度采样、截图、两份JSON、构建和日志均在 `tmp/docs-artifacts/testing-batches/B001/`，构建日志在 `map-progress/native-build.log`。两个复验进程正常退出，WebView锁缓存保留。不同窗口尺寸、独立Player以及同步场景阶段的持续响应仍待测，B001未结算。

### B001-01 原版界面资源与布局

同一原版内容接入任务的界面补充，B001保持3/3。涉及 `import-frost-{warcraft-ui,menu-background}.py`、`restore-frost-warcraft-ui.mjs`、`sync-frost-ui.mjs`、UI prefab、Main场景／脚本与 `game/{client,hud}.js`。保留原FDF、字体、纹理、背景和两侧装饰来源摘要；主菜单／单人／选项分类／暂停／选图布局按原定义，布局与点击统一960×720等比坐标。完整逐屏待办见 `docs/designs/frostbound-realms/warcraft-ui-fidelity.md`。

快速检查：BLP解码及边框7项通过；新UI脚本检查两个窗口比例下的点击、禁用入口、音量和暂停选项返回通过；既有地图场景切换和任意地图进度检查通过。加载条断言使用当前prefab宽度，保留进度随实际工作推进的断言。独立只读审核核对既有实体ID无变化、prefab／scene一致、引用无悬空，并发现和修正F10返回重置对局、Pause换肤覆盖、透明点击区与快捷键遗漏。

原生展示复用 EXE SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`，没有构建引擎。`native-1792758842790.json` 六张截图／导航检查通过、0 error；主菜单、单人、选图、声音、竖屏主菜单、暂停均有实际画面。初次QA参数错误在 `native-1792758749372.json` 保留。截图发现背景透明处透出对局地形，加独立黑底后仅主菜单复验，`native-1792759005361.json` 通过。后续两侧装饰视觉复验单独记录，不重复整库或玩法回归。

待批次：原客户端／REA对照两侧层投影、背景摄像机FOV解释、粒子／billboard／光照、各页装饰和全部控件细节；图像与游戏性设置、档案／战役／录像、联网页和各族暂停皮肤继续待实现。不得将本轮菜单导航检查写成所有界面1:1验收或完整War3兼容。

两侧装饰接入后仅复验主菜单，`native-1792759323736.json` 通过、0 error；截图确认链条、面板与源按钮位置对齐，模型专用4:3正交视口没有拉伸。来源动画／材质状态及依赖检查通过，原生进程正常退出。完整主菜单与原客户端的逐像素对照仍待执行。

### B001-01 原版选项控件与设置

界面接入补充，计数仍3/3。变更：选项FDF提取器、控件纹理导入器、源布局JSON、Options prefab及生成场景／脚本，`frost-warcraft-options.mjs`、`restore-frost-warcraft-options.mjs` 与 `game/warcraft-options.js`。三页88节点；原滑条、复选框、输入框和下拉底座；音量／静音、滚屏、生命条、高级提示及确定／取消事务。来源记录保留50个原始成员与168个文件hash；4个布局输入摘要、88项锚点约束通过。既有4045个实体ID均保留，场景现4252实体。

快速检查：提取器6项、BLP／控件导入9项通过。`node scripts/test-frost-warcraft-ui.mjs` 两个长宽比下的点击与滑条拖拽、越界钳制、捕获释放、静音恢复、取消回滚／确定持久化、非法存档值、保存失败恢复、实际键盘滚屏和暂停返回通过。仅检查相关JS语法与差异，未构建引擎或运行全库／玩法／地图回归。

原生针对性检查复用现有EXE（SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`），命令 `node scripts/qa-frost-warcraft-ui.mjs --options-only`。报告 `tmp/docs-artifacts/war3-ui/native-1792760716663.json` 三页及960×900声音页共4张截图，0 error；最终 `native-1792760888302.json` 复验原输入框切片参数和禁用文本，4张截图、0 error，进程正常退出。截图确认原字体的破折号字形不适合作为空值占位，禁用值明确显示不可用。

待批次：原客户端文字度量／焦点导航对照，真实音频听感、生命条与高级提示的实机交互，导入地图独立运行脚本的设置绑定；未支持的图像、设备／音频、录像及队形设置保持禁用。摄像机与原客户端构图对照、动画、光照、粒子与billboard继续来源核对。不得将菜单控件验收等同于所有界面1:1完成。

选项页同阶段的菜单相机修正：`import-frost-menu-background.py` 使用固定Warsmash提交的菜单FOV×0.6约定；catalog、MenuBackdrop prefab、场景／脚本同步。定向静态检查确认35.97808429078253度一致。`qa-frost-warcraft-ui.mjs --main-only` 复用同EXE，`tmp/docs-artifacts/war3-ui/native-1792761287966.json` 单张主菜单复验通过、0 error，海面覆盖底缘，进程正常退出。未重跑选项交互、全量地图或引擎构建；原Game.dll公式与完整动态视觉仍待对照。

### B001-01 大图绘制绑定原生补验

第二十六阶段的定向GPU验证继续有效。本轮扩展 `qa-frost-original-map-composition.mjs`，可按 `MENGINE_MAP_PROFILE_FRAMES` 记录最多60次固定Game采样及像素摘要，并记录Scene截图／独立profiler数据；默认仍保留原来的短流程。来源场景、脚本和实际EXE摘要进入报告。

复用现有EXE `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`，没有重建。`MENGINE_MAP_PROFILE_FRAMES=12 node scripts/qa-frost-original-map-composition.mjs tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project` 通过：7403实体，Scene/Game、三层动画、12次固定Game像素一致、Stop完整恢复、确定性重启，0 error。报告 `B001/original-map-composition-1792762023404.json`，统计 `B001/draw-bindings-native-summary.json`；首次Scene参数错误记录保留于 `original-map-composition-1792761964519.json`。两次测试进程均正常退出，锁定WebView缓存保留。

该EXE在第二十六阶段提交之后构建；已通过的同EXE菜单／选项报告复用为嵌入视图证据。完整性能口径见 `docs/performance-risk-todo.md`：固定截图样本不代表实时FPS，也未新增原生前后提速结论。仍待独立Player分发、原客户端完整视觉和JASS／对局兼容性，B001保持3/3未结算，不重新运行已通过的02／03。


### B001-01 原版局域网浏览页

变更：LAN FDF保留／布局提取／prefab恢复脚本、NetworkDialog prefab、Main场景／脚本和client浏览流程。25个源节点（含4个按钮文字定义），51个源成员、171个文件摘要；4252个既有场景ID保留，当前4308实体。原输入框与镜像按钮底座、房间刷新／选择／翻页、玩家名持久化与握手、满员禁入、断线／地址／取消恢复；多人存档装载禁用。为同一界面接入补充，B001仍3/3未结算。

快速检查：`extract-frost-warcraft-options.py --self-test` 6通过；`test-frost-warcraft-lan.mjs` 通过，覆盖两个比例、21个独立源框几何、全部布局输入摘要、玩家名输入保护、选择／翻页／满员禁入、刷新、创建返回、迟到事件取消和断线。源资源171项摘要与既有实体ID检查通过，相关JS语法／差异检查通过。生成选项页只更新提取器摘要，88节点内容保持一致。

原生定向验证：复用EXE SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`，未构建引擎或执行全库／玩法回归。`qa-frost-warcraft-ui.mjs --lan-only` 最终报告 `tmp/docs-artifacts/war3-ui/native-1792763499711.json`，3张截图、0 error，真实TCP浏览和加入通过。QA隔离副本仅覆盖随机TCP端口，记录源／实际脚本摘要；960×900截图设置真实游戏渲染分辨率，检查了页首和底部按钮完整可见。测试进程正常退出，WebView锁定缓存保留。

最初原生截图暴露文字裁剪及颜色标记显示问题；修复后定向复看。`native-1792763270883.json`、`native-1792763397275.json` 保留为过程证据；后者仅改变输入尺寸的竖屏截图不作为分辨率验收依据。日志为 `lan-client-test.log`、`lan-import.log`、`lan-native-resolution.log`，均位于同一临时目录。

待批次：原客户端逐像素与原动态列表／滚动条／缩略图／高级选项对照，中文IME实机输入、Tab焦点、多人创建／等待房间源布局、原LAN发现协议。原旧 `qa-frost-menu-network.mjs` 及 `qa-frostbound.mjs` 菜单分支仍使用旧按钮路径和坐标，应更新后再纳入两端完整对局验收；本轮独立LAN入口已覆盖当前菜单真实浏览／加入，不据此宣称原版所有界面或Warcraft网络兼容。


### B001-01 来源校验设备路径优化

变更：`mengine-assets/src/gltf_pose/{file_metadata,shared}.rs`。共享来源加载时仅在DOS／标准卷设备路径的卷内组件完全一致时记录规范化NT路径；顺序查询混合名称、挂载目录前缀差异及未知设备保留DOS回退。匹配绝对DOS组件的后续轮询由同一新文件handle验证设备路径和metadata；别名／UNC及不支持设备路径时继续原DOS校验。无跨帧结果缓存、不改变轮询间隔与新姿态即时检查。属于大图性能补充，B001仍3/3未结算。

快速检查：shared收尾复验9通过、0失败、1项手动基准忽略，包含混合名称拒绝；Runtime来源校验3通过、旧手动基准1忽略。新增用例覆盖canonical目录被替换成junction、文件名大小写改名、硬链接别名和设备信息缺失回退。263文件同进程交替基准由13.26196ms降至9.34456ms（29.54%），只代表来源校验CPU／文件系统开销；细节见性能todo第二十七阶段。没有Editor构建、全库测试、全量地图转换或重复原生UI验收。

待批次：下次相关SDK／Editor构建后，在同一集成版本验证原地图Scene／Game／RawImage、主文件与依赖热更新、目录重新指向、Play暂停／Stop恢复，记录同输入原生来源校验和整帧指标；当前EXE仍是此前版本，不能用其截图证明本项已集成。UNC／网络盘、实际卷挂载变化及非Windows回退路径仍待对应环境验证。证据均在 `tmp/docs-artifacts/editor-performance-risk/metadata-*`，不提交原始产物。


### B001-01 原版创建游戏页

变更：LocalMultiplayerCreate源FDF／两张BLP及PNG、创建页布局提取／恢复脚本、NetworkDialog prefab、Main场景／脚本和client选图流程。21个源节点、54个公共UI源成员、178个文件摘要；保留4308个既有实体ID，当前4340实体。选择地图后按创建才发出请求，取消返回浏览，断线回到选图；固定速度与高级选项禁用。界面补充，B001保持3/3未结算。

快速检查：`test-frost-warcraft-create.mjs` 与LAN入口集成检查通过；来源摘要、布局、两个长宽比、点击／键盘、创建载荷、断线／返回和禁用控件均覆盖；相关JS语法、差异与资源摘要通过。原生只执行 `qa-frost-warcraft-ui.mjs --create-only`，复用EXE SHA256 `03e55ada83c9a26a2c194bc84ec529c01d82260ea86d7c3bfa3fa5357318ff7c`，没有引擎构建、全库或全地图回归。

最终 `tmp/docs-artifacts/war3-ui/native-1792765684295.json`：实际TCP创建moba房间、1280×720与960×900两张截图、0 error，正常退出；WebView锁定缓存保留。首次QA误读room.mode字段的报告1792765608846保留，已改为检查服务端实际room.map.mode后复验。原生源脚本SHA256为13f7744feaf7d6b3c449b6c1ca4f2e786021166660072af6591a6a78eff9ecd7，隔离副本仅修改随机TCP端口。

待批次：原目录／地图列表行与缩略图、源地图动态详情、等待大厅玩家槽、原速度／高级选项运行语义和原客户端逐像素／焦点对照；旧双客户端QA需从直接点击地图创建改为选择后点击createStart，再纳入完整对局验证。当前EXE不含第二十七阶段来源校验优化，本次UI检查不能作为该性能项集成证据。


### B001-01 网格对象输出分配

变更：`frame_compiler.rs`先收集本次提取的合格借用输入，再一次分配大型RenderObject数组；材质和对象仍各自拥有输出，不增加跨帧缓存。`frame_mesh_cache_tests.rs`增加手动分段诊断与旧实现对照。属于B001-01性能补充，批次保持3/3未结算。

快速检查：frame_compiler相关10通过、0失败、6手动忽略；最终同进程交替基准2747对象，3.353525→2.515425ms，24.99%，完整输出一致。最终容量4096→2747；该输出数组节省不等于进程总内存。详见performance-risk-todo第二十八阶段，证据 `tmp/docs-artifacts/editor-performance-risk/mesh-output-*`。

待批次：与来源设备路径优化共同构建一次原生Editor，再验证原地图Scene／Game、嵌入视图、动画／暂停／Stop恢复、主文件／依赖热更新并采样实际帧成本；不能用既有EXE宣称本项已集成。


### B001-01 来源校验与输出分配原生合并验证

0b9c6f4与30eb1a2共用一次原生构建，EXE `544fb7fc2ee301653197ab39153814e0d83f168d8f5432c96a23e402ecf243fa`。`MENGINE_MAP_PROFILE_FRAMES=12 node scripts/qa-frost-original-map-composition.mjs tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project` 与 `node scripts/qa-frost-warcraft-ui.mjs --main-only` 通过，原地图Scene／Game、动画／暂停／Stop恢复／确定性重启、主菜单嵌入视图均覆盖。两份报告0 error、正常退出；输入与旧固定画面像素摘要一致。

原生报告 `B001/original-map-composition-1792767053644.json`、`war3-ui/native-1792767119833.json`。固定Game后10帧总耗时中位27.7694ms、来源校验8.30915ms、对象／材质3.80875ms；历史同输入样本仅供对照，非严格交替EXE基准或实时FPS。原始日志与汇总入口见性能todo。本次关闭这两项的常规原生集成待测；真实编辑器主文件／外部依赖热更新、目录重定向与跨平台边界仍待专门场景验证，底层定向测试保持已有通过结果。B001仍3/3未结算，不重复02／03或完整玩法回归。


### B001-01 等待大厅来源准备

UI导入器增加GameChatroom、TeamSetup、AdvancedOptionsDisplay与MiscUI原件，58源成员／182文件摘要全部核对。REA lobby脚本四组注册／工厂／构造／初始化探针通过，确认聊天字体存在MiscUI运行时覆盖。仅源证据与维护入口补充，不计新功能，不重跑已有UI截图，也不宣称大厅已还原。待接入原大厅布局／玩家槽／聊天／配置覆盖，并核对原运行时行排列和队伍语义；验证入口与边界见warcraft-ui-fidelity文档。


### B001-01 编辑器顺序、地图镜头、聚焦与快照性能

变更：Inspector单选/多选组件按类型稳定排序，UI分组内也使用同一规则；Hierarchy标准双击与空格聚焦，App先立即定位再异步细化模型包围盒，运行快照刷新不取消仍有效的聚焦，用户换场景/模式/选择或移动镜头时取消旧细化；Play搜索使用运行世界。普通Edit刷新复用已有快照，预览期间保留原始编辑值独立副本。地图转换器与Amazonia接入原MiscData斜视镜头和控制，来源原件/摘要随地图保留。属于同批编辑器/原图补充，B001保持3/3未结算。

快速检查：Inspector顺序、App异步聚焦与sceneNavigation共11项通过；新增authoredPresentation 1项与nativePlayOwnership中hierarchy定向1项通过；相机脚本、map-session功能/资产摘要检查通过，4个相关Python文件编译通过。没有全库回归或全地图重导。性能复制环节数据与边界见performance-risk-todo第二十九阶段。

原生前端与Release构建通过（既有world_from_snapshot未使用告警），EXE SHA256 `4ca390526edd5f48329efd990b9667850ddb170a70ac66385c947fc67b5131d3`。`qa-frost-map-session.mjs --editor-feedback` 的报告 `B001/map-session-1792770198151.json` 已验证运行地图搜索、真实双击/空格聚焦两个不同根节点、三层动画、暂停像素稳定、镜头移动及重新加载；后段再次进入地图时QA观察实体尚未更新，故该整份报告标记失败。统一等待地图状态就绪后，复用同EXE仅补测 `--return-only`，`B001/map-session-1792770298806.json` 通过返回/重入/键盘返回/既有skirmish/Stop还原，0 error。两个原生进程均正常退出；WebView锁缓存保留。运行截图已目视核对斜视构图。构建与原生日志位于 `tmp/docs-artifacts/war3-ui/editor-issues-*`。待后续批次：编辑器持续操作延迟/完整性能基准、原客户端FOV与构图对照、边缘滚屏和完整对局控制；不得把当前定向检查等同完整Warcraft运行兼容。


### B001-01 层级展开与场景刷新分离

变更：App新增独立层级呈现刷新，Hierarchy工具栏/右键/箭头/键盘展开与折叠不再走完整场景刷新；普通选择不重建树，Ping和选中后代显式刷新祖先展开；Play展开全部使用当前运行世界ID。代码路径为App.tsx、panels/Hierarchy.tsx、store.ts，测试为hierarchyRefresh.test.mjs及nativePlayOwnership.test.mjs。属于B001-01性能补充，不另增批次计数。

快速检查：`node --test packages/editor/tests/hierarchyRefresh.test.mjs packages/editor/tests/sceneSelectionRefresh.test.mjs` 5通过；`node --test --test-name-pattern='expand all follows' packages/editor/tests/nativePlayOwnership.test.mjs` 1通过。hierarchyRefresh补充Ping/左右键后仅重测该项通过。`node node_modules/typescript/bin/tsc -b` 在packages/editor通过，独立只读审核通过。实际Amazonia输入的局部快照/树构建对照均值14.649→0.742ms；口径及证据见performance-risk-todo第三十阶段。无全库测试、原生构建或重复地图QA。

待合并验证：原生Hierarchy展开/折叠/搜索、Ping定位并滚动到隐藏后代、双击/空格聚焦、地图切换后Play展开全部、独立Hierarchy窗口、自动恢复定时与内容编辑/撤销。下次相关前端/原生合并构建运行这些路径；当前已生成EXE仍为dd883f6版本，不能作为本项集成通过证据。


### B001-01 原版普通游戏相机投影

变更：warcraft_camera.py按原Game.dll的角度归一化和普通游戏逻辑区域16/9生成垂直角；保留原FOV=70，Camera3D约34.3183度。Amazonia场景/脚本、任意地图地形转换和来源收据同步，更新器可替换已有末尾控制器且重复执行字节稳定。源逻辑比例不随窗口像素尺寸变化。新增REA六组探针和原矩阵CPU探针；本项是既有地图镜头补充，B001计数不增加。

快速检查：REA字段/矩阵/调用/逻辑坐标/锚点/root六组通过，Game.dll摘要一致且未修改；原矩阵30个隔离CPU用例通过。test-frost-original-camera.mjs与test-frost-map-session.mjs通过，覆盖角度、控制、缩放窗口不改变源逻辑投影、切图/返回和资产摘要。增量更新连续执行文件摘要不变；相关Python编译、JS语法和diff检查通过。没有全库回归、全地图转换或原生重建。

复用EXE SHA256 `4ca390526edd5f48329efd990b9667850ddb170a70ac66385c947fc67b5131d3`执行`qa-frost-map-session.mjs --camera-only`，报告`tmp/docs-artifacts/testing-batches/B001/map-session-1792772651285.json`通过。验证源投影、WASD移动、档位缩放、1280×720/960×900渲染和Stop恢复；0 error，正常退出，两张镜头截图已目视检查，锁定WebView缓存保留。原始来源/CPU/运行日志在`tmp/docs-artifacts/war3-ui/camera-source/`。

待批次：原HUD区域裁剪/宽屏显示与原客户端逐像素对照、电影/隐藏UI后续重定位，以及上一项层级独立刷新在新Editor构建中的集成验证。该EXE不包含9b39d0f层级优化，本次数据驱动镜头检查不能代替该项验收；Amazonia持续性能与编辑器操作延迟仍按性能todo待测。


### B001-01 层级搜索与刷新原生合并验证

变更：hierarchySearch.ts一次解析查询并合并命中/祖先结果，Hierarchy复用同一匹配结果；测试补充共享祖先、命中标记、原地元数据更新、缺失父节点/循环与空查询边界。qa-frost-map-session.mjs增加--hierarchy-only，只验证相关层级操作。属于B001-01编辑器性能补充，不增加任务计数。

快速检查：hierarchySearch和hierarchyRefresh共5项通过；实际Amazonia四组查询的新旧完整结果一致，局部合计均值28.6767→11.6985ms，口径见performance-risk-todo第三十一阶段。TypeScript/Vite构建通过，diff/JS语法检查通过，没有全库回归或地图重导。

与9b39d0f层级独立刷新共用一次原生构建，cargo release耗时1分08秒，仅既有world_from_snapshot未使用警告。EXE SHA256 `9cb87294569f0e5e8d71666f38583eb0df5e59185874fa9583a9ccacfb52a93a`。`qa-frost-map-session.mjs --hierarchy-only`报告`tmp/docs-artifacts/testing-batches/B001/map-session-1792773300710.json`通过，0 error，进程正常退出。覆盖真实按钮展开/折叠、selection.reveal后代定位、左右键、运行地图搜索、双击/空格聚焦不同根节点、重载地图后再次操作与Stop恢复；折叠操作前后实体内容一致。WebView锁缓存保留，构建/运行日志位于`tmp/docs-artifacts/editor-performance-risk/hierarchy-search/`。

此EXE已包含第三十、三十一阶段；关闭两项常规主窗口层级集成待测。脱离Hierarchy窗口同步、独立Ping事件滚动、自动恢复计时/内容撤销，以及持续操作延迟/实际FPS仍待对应场景，不能把局部搜索提速当成整图卡顿已解决。

### B001-01 编辑选择跨窗口薄消息

变更：App.tsx的Edit选择发送节点ID和同步版本，接收端复用已有实体快照；完整场景与选择分别统一排序，内容排队、场景替换和Play/Pause保留同步边界。新增workspaceSelectionSync.test.mjs，更新sceneSelectionRefresh.test.mjs。属于现有编辑器性能修复补充，不新增批次计数。

快速检查：`node --test packages/editor/tests/workspaceSelectionSync.test.mjs packages/editor/tests/sceneSelectionRefresh.test.mjs` 10通过、0失败；`node node_modules/typescript/bin/tsc -b`在packages/editor通过，diff检查通过。三窗口并发发送、相反递送顺序、延迟重复消息均覆盖。Amazonia局部路径测量与口径见performance-risk-todo第三十二阶段，原始产物在`tmp/docs-artifacts/editor-performance-risk/selection-sync/`。没有完整前端/原生构建或全量QA，现有EXE不包含本项。

待合并验证：新Editor中实际脱离Hierarchy/Inspector窗口并连续点击/多选/清空，三个窗口同时操作；内容编辑/撤销、同名场景重载、Play/Stop和重新打开面板；测量真实输入延迟及IPC。Agent selection.set单独执行不能代替UI薄消息路径验证。状态为实现及快速检查完成，原生集成待测。

### B001-01 连续呈现基线与特效文件检查

变更：`sampled_effects.rs`复用平台文件stamp接口，保留逐次收集的检查频率及mtime/长度失效；强化共享特效同mtime长度变更和删除恢复测试，增加手动37文件对照。`qa-frost-map-session.mjs`新增`--continuous-profile`，10秒内不轮询Agent。属于既有性能修复补充，不增加批次计数。

快速检查：最终SampledEffect定向6通过、0失败、1手动忽略，手动CPU基准单独通过（37文件0.82789→0.15752ms）；JS语法和diff检查通过。复用原EXE执行一次连续采样，报告`B001/map-session-1792774425728.json`通过、0 error、正常退出。完成呈现约50.15次/秒仅是850×478旧EXE保留240帧的基线；详细采样范围与日志入口见performance-risk-todo第三十三阶段。

待合并验证：与e46f049共同构建原生Editor，验证Amazonia特效动画／暂停／Stop恢复、特效文件修改/损坏/删除恢复及相同视口的连续呈现；已有跨窗口选择验收项一并执行。未执行全库测试、地图重导或原生重建，旧EXE不含两项优化。


### B001-01 脱离窗口操作与选择／特效原生合并验证

变更：AgentBridge的window.ui_*只观察目标窗口已处理的状态，避免主窗重复发布旧世界；新增agentWindowUiOwnership.test.mjs和qa-editor-selection-sync.mjs。map-session QA增加--effect-reload，在连续采样后通过游戏输入移至原火焰区域，验证真实文件修改与恢复。属于既有编辑器性能补充，不增加批次计数。

快速检查：窗口操作归属与playback输入成本共2项通过；JS语法及diff检查通过。与e46f049、44cde9a合并构建前端和原生Editor，最终EXE `40f8e9048c975dcc6273b99e0dee3765aa51471f29af1aff71e2e230acad9710`；只因集成发现的Agent广播问题补做相关增量构建及失败路径重测，没有全库回归或地图重导。

`node scripts/qa-editor-selection-sync.mjs`报告`B001/selection-sync-1792775727537.json`通过：主窗到脱离Inspector、三窗口顺序选择/多选/清空与键盘导航、内容/脏状态保持、脱离编辑及发起窗口Undo、同名重载、Play/Step/Stop恢复与面板重开。QA在隔离副本中使用空启动脚本测试编辑状态恢复，不作为完整游戏脚本兼容验收。

`node scripts/qa-frost-map-session.mjs --continuous-profile --effect-reload`报告`B001/map-session-1792776070367.json`通过：原脚本连续运行10秒、37份原特效文件修改后可见像素及图元变化、恢复后暂停像素精确还原且场景实体不变。两个报告均0 error、进程正常退出，锁定WebView缓存保留。连续呈现保留240帧，48.475次/秒，完整采样口径见performance-risk-todo第三十四阶段；本次没有证明整体FPS提升。

以上关闭三十二、三十三阶段已列出的常规脱离窗口选择/编辑/发起窗口Undo、同名重载/Play/Stop/重开面板、原生特效修改/恢复及连续采样待测。三窗口同时并发、真实输入延迟与IPC成本、独立Ping滚动、自动恢复计时、原生特效损坏/删除恢复、跨平台仍保留待测；不是跨窗口全局Undo或全地图不卡顿保证。B001整体保持未结算，其余既有功能待测不因本项通过关闭。


### B001-01 层级结果表预留容量

变更：`crates/mengine-core/src/transform_hierarchy.rs`完整构建按活动请求收集ID，子集构建按迭代器容量下界预留HashMap；新增`transform_hierarchy_capacity_tests.rs`。保留解析顺序和每帧重建，减少数千条变换结果逐级扩容搬运。归属既有编辑器性能补充，不另增功能计数。

快速检查：`cargo test -p mengine-core --release --lib transform_hierarchy -- --test-threads=1` 7通过、0失败、1手动基准忽略；单独执行`benchmark_hierarchy_capacity -- --ignored --nocapture --test-threads=1`通过。真实Amazonia和主菜单旧/新输出逐项一致，构建CPU中位分别1.11017→0.97115ms、0.18387→0.15269ms。采样口径与本地证据见performance-risk-todo第三十五阶段；diff检查通过。

待合并验证：下次相关原生构建后验证Scene/Game加载、父级/活动状态编辑及Undo、Play/Stop、Amazonia连续呈现；目标是结果一致与实际帧耗时，不能以局部CPU基准宣布整体不卡顿。未执行全库测试、原生重建、全地图遍历或重复已通过的多窗口/特效QA。现有c90e966 EXE不包含本项。


### B001-01 网格提取借用层级结果

变更：TransformHierarchy增加只读get_ref，frame_compiler的中间网格输入借用当前层级聚合；最终对象仍拥有独立矩阵/材质。新增手动benchmark_mesh_transform_borrows，与原值复制提取逐项对照。属于既有编辑器性能补充，不新增批次计数。

快速检查：层级定向7通过、1手动忽略；mesh_cache_tests 6通过、7手动忽略，均0失败；新手动基准单独通过。Amazonia2,747对象的有效临时输入字节351,616→65,928，完整输出相等。CPU样本有场景差异，不作为稳定提速结论。证据与口径见performance-risk-todo第三十六阶段；diff检查通过。

待合并验证：与2e8c4be共同构建后核对Scene/Game、父级/活动状态编辑、Undo、Play/Stop、原地图连续呈现。未执行全库回归、原生重建、重复多窗口/特效QA；现有Editor EXE不包含这两项。既有材质热更新定向测试通过不替代新EXE的运行验收。


### B001-01 对象材质覆盖就地更新

变更：materials.rs增加内部就地覆盖入口，既有按值API调用同一实现；frame_compiler直接更新其私有材质。新增benchmark_material_override_moves比较等价值传递／就地提取，保留完整输出核对。属于既有编辑器性能补充，不另增功能计数。

快速检查：属性覆盖边界1通过，mesh_cache_tests 6通过、8手动忽略，均0失败；新手动基准单独通过。Amazonia2,747对象中位1.62840→1.58706ms，主菜单219对象0.22755→0.20856ms；CPU局部口径见performance-risk-todo第三十七阶段。diff检查通过。

与2e8c4be和3fd5b17共用一次Rust Release构建通过，EXE `4e429e11e48deacb53be7bb8509fd40de71bd21708dec72e757820c576a74faa`。`qa-frost-map-session.mjs --continuous-profile --effect-reload`报告`B001/map-session-1792777658238.json`通过Amazonia加载、原动画连续呈现、暂停特效修改/恢复、场景不变及Stop快照还原，0 error、正常退出。锁定WebView缓存保留，原生Game画面已核对；脚本增加Stop后显式快照断言。

关闭这三项常规Game加载/连续呈现/暂停恢复/Stop待测。父级/活动状态编辑、Undo及Scene视图仍保留；未重跑不相关窗口同步或全库回归。连续采样仅保留末尾240帧，46.979次完成呈现/秒，未证明整体流畅度提高；完整口径与日志见performance-risk-todo第三十七阶段。


### B001-01 Game 完成校验与原生时序查询

变更：editorProfiler、AgentBridge/querySchemas、MCP server 增加按需轻量原生时序；map-session QA 增加 --transport-profile。Viewport 的有效 Game 帧完成回调复用一次新鲜快照，并记录请求前准备/完成回调两个分段；新增 agentProfilerTimings 与 viewportGameCompletion 定向测试，校正 nativePlayOwnership 完整快照的既有会话时钟断言。属于现有性能修复补充，不新增批次计数。

诊断查询版本已完成一次前端/原生构建和 `--continuous-profile --transport-profile`，报告 `B001/map-session-1792778305733.json` 通过、0 error、正常退出，Stop 快照恢复通过。EXE `e869302c07b4edf5cd96d5cd22bd450a7a15f058ead7c230f32cfd6293f2e214`，47.132 次完成呈现/秒；时序、范围和本地日志见 performance-risk-todo 第三十八阶段。该 EXE 不含随后新增的 Game 快照复用与前端分段字段。

最终快速检查：agentProfilerTimings、viewportGameCompletion、nativePlayOwnership、nativeViewportFrame 共 29 通过、0 失败；TypeScript、JS 语法及 diff 检查通过。未重复原生构建、地图全量导入或全库回归。

待合并验证：下一次相关原生构建运行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile`，验证 frontendPrepareMs/frontendCompleteMs 字段及相同视口的实际耗时；增加请求进行中 Game/Scene 切换、调整分辨率、重载地图、Stop 后过期帧拒绝。既有父级/活动状态编辑与 Undo 的 Scene 原生待测项继续保留。状态：实现及快速检查完成，最终 Game 优化的原生验证待批次执行。


### B001-01 Scene 完成校验与视口合并验证

变更：Viewport 的 Scene 和相机预览完成回调只读一次当前运行时快照；新增 viewportSceneCompletion 定向检查。map-session QA 增加 --viewport-transitions 和 --viewport-transitions-only，支持合并采样后验证及只重跑切换阶段。属于编辑器性能补充，不新增功能计数。

快速检查：Scene/预览共 22 组输入加 Game 回调，共 2 个测试通过、0 失败；前端 TypeScript/Vite 构建及 JS/diff 检查通过。与 507c149 一次原生构建，EXE `1f0c9f8f44581de0cd3a1654cde768c216ad7e84e0f620f514200d8408dea4d6`。连续时序报告 `B001/map-session-1792779146027.json` 的时序断言通过（240帧、50.313 次完成呈现/秒，前端准备 1.8363ms、完成 2.0304ms），随后 QA 模式错误导致整份报告失败，详细口径见 performance-risk-todo 第三十九阶段。

修正 QA 后只执行 `node scripts/qa-frost-map-session.mjs --viewport-transitions-only`，报告 `B001/map-session-1792779242868.json` 通过、0 error、正常退出；实际 Scene/Game/选中相机预览、环绕相机、Game 分辨率切换、实体不变与 Stop 恢复通过。已核对 Scene 截图。没有重复性能采样、原生构建或全库回归。

待测：强制请求在途的面板/地图切换与 Stop 竞态，编辑模式隐藏节点、父级/活动状态编辑与 Undo，真实交互延迟与持续帧率。保留这些风险，不以回调测试或独立单次 50.313 次/秒宣布整体性能达标。


### B001-01 运行时归属读取与内容校验分离

变更：App 提供实时会话读取；Viewport 的 Game/Scene 返回帧、截图返回、UI命中与异常归属改用轻量归属读取。新请求的数据校验、相机预览的数据校验不变。新增 viewportOwnership 集成测试，更新 Game/Scene 回调测试。属于现有性能优化补充，不新增功能计数。

快速检查：16个相关定向测试通过；最终回退调整及实际 App 接线补充分别重测相关3项/1项通过，TypeScript与diff检查通过。真实7,409实体局部对照覆盖私有世界和公共数组暴露两种状态；暴露状态旧归属检查2.801755ms，新路径低于0.001ms，正确性断言通过。完整口径及本地证据见 performance-risk-todo 第四十阶段，不能当作原生提速或FPS验收。

待合并验证：下次相关原生构建后执行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --viewport-transitions`，核对 frontendCompleteMs；追加请求在途 Stop/重启/切换地图、截图返回与 UI 命中拒绝旧会话、脱离窗口新会话、直接实体编辑和相机预览。当前 EXE 不包含本项，本轮没有原生构建/QA或全库回归。


### B001-01 等待原生请求的 Game 重复唤醒

变更：Viewport 在满足请求/调度均无法推进且原生 Game 画面完全未变时，提前跳过世界内容校验；共用画面失效状态生成逻辑。新增 viewportPendingPaint 生产路径检查，并将 nativeViewportRequests 的旧请求键断言同步到当前参数签名。属于现有性能优化补充，不新增功能计数。

快速检查：相关20项最终通过，其中失败项定向重测8项通过；TypeScript/diff通过。验证等待路径不读世界，到期/新帧恢复读取，浏览器动画与交互不被抑制。原始日志与边界见 performance-risk-todo 第四十一阶段。本轮没有原生构建、地图QA或独立微基准，不能报告实际FPS收益。

待合并验证：与8421aa4共同构建后执行连续时序和视口切换QA；覆盖队列饱和/重试恢复、隐藏窗口的请求/捕获结束唤醒、实际输入/resize/环境热更新、直接引用编辑及新帧显示。现有全世界读取与归属拆分待测项继续保留。

### B001-01 归属与等待路径合并验证结果

8421aa4与73b74de已完成一次前端/原生构建，EXE `4ee10a4afa086e07ec1865048c612334439b2ad2c064b47c7de2902f8c9d6d54`。`node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --viewport-transitions --effect-reload` 报告 `B001/map-session-1792780821762.json` 通过，0 error，正常退出；未重复全库测试或全量地图导入。

连续呈现、Scene/Game与相机预览、环绕、960×900/1280×720截图、37个特效原件热更新及像素精确恢复、实体不变、Stop还原通过。850×478、7,410实体、末尾240帧为53.0997次完成呈现/秒，完成回调均值0.5867ms；独立采样不证明稳定60 FPS或受控提速。口径、日志与缓存保留原因见performance-risk-todo第四十二阶段。

上两项的正常集成待测已完成；强制在途竞态、脱离窗口、饱和/重试/隐藏恢复、Edit状态变更及Undo、直接引用编辑和实际输入延迟继续待测，不将整个B001标记完成。

### B001-03 等待大厅动态布局依据

`probe-frost-rea-lobby.mjs` 增加TeamSetup工厂/构造/初始化、变更处理、PlayerSlot创建、分组布局和标题高度探针；共12组通过，原DLL哈希及未修改、输出完整性、MiscUI字体与PlayerSlot高度断言通过。字符串读取使用Rizin的显式UTF-8命令；前两次探针失败分别为自动编码判断和不支持的psz命令，最终日志 `tmp/docs-artifacts/war3-ui/lobby-source/team-probe-verified.log` 正常退出。仅静态依据与维护工具补充，不增加功能计数，不重复原生构建。完整队伍策略、槽位交互和大厅实际布局仍待实现/验证，见warcraft-ui-fidelity文档。

### B001-01 模拟增量共享序列化

变更：mengine-editor-host的PlaySnapshotStream/PlayWorldUpdate保留共享实体，新增advance_shared_update；Tauri step_editor_play调用共享入口。既有advance_update保留独占数据接口，JSON格式不变。属于现有编辑器性能补充，不新增功能计数。

快速检查：play_runtime最终25项通过/4项手动忽略，新增测试ID映射断言修正后仅重跑失败项；定向序列化基准1项通过，Tauri release接口编译检查通过。Amazonia前64/全7,409实体的局部序列化耗时与边界见performance-risk-todo第四十三阶段。未重建EXE、运行原生地图QA或全库回归。

待合并验证：下一相关原生构建执行 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --viewport-transitions --effect-reload`，核对共享响应的实际连续模拟/呈现与模拟请求耗时；追加直接编辑触发reset、Stop/重启/换图/退出时共享响应归属。当前EXE尚未包含本项，原有强制竞态与交互延迟待测继续保留。

### B001-01 空增量实体索引复用

变更：playWorldSync的空patch复用冻结实体数组、原生基线按需复制；store的认证私有空增量保留可编辑数组。新增基线写时复制、连续空帧时钟/颜色、后续修改隔离、重复ID和异步曝光编辑检查。属于现有性能补充，不新增功能计数。

快速检查：playWorldSync/nativePlayOwnership共32项通过，Play增量与nativeViewportFrame相关17项检查通过，TypeScript与diff通过。实际7,409实体配合模拟空增量，100帧整表slice300→0，前端采样中位0.543986→0.209788ms；非原生FPS结论。范围与临时证据见performance-risk-todo第四十四阶段。

待合并验证：与c694440共同构建后核对连续模拟/动画/水面、帧版本与时钟、Inspector直接修改完整上传、Stop/重启/换图、跨窗口版本传播。当前EXE不含本项，本轮未重建Editor或重复地图QA；真实空增量分布和输入延迟尚未测量。

### B001-01 共享增量与空帧索引集成结果

c694440与8679fcb完成一次前端/原生构建，EXE `ff659f5a318a9c15e2ddc9b3abec8b26631da5c245a55a69180f861cf4a1e281`。QA新增真实Inspector运行中修改检查及独立重测入口。`B001/map-session-1792782700435.json` 连续时序、特效修改/精确恢复、Scene/Game/相机预览/环绕和分辨率切换通过，新增Inspector测试的步长输入不合法使整份报告失败；修正测试后只跑 `--runtime-edits-only`，`B001/map-session-1792782801041.json` 通过，0 error、正常退出。

真实Inspector高度0→3.2经30个模拟步仍保留，三层动画和地图时钟推进；恢复0经后续模拟保持，Stop还原作者场景。完整采样52.3915次呈现/秒、模拟请求9.6704ms，未证明整体稳定提速。详细范围、失败原因及日志见performance-risk-todo第四十五阶段。仅关闭阶段43/44上述正常集成待测；强制在途竞态、脱离窗口、隐藏/重试、Edit状态及Undo、真实输入延迟继续待测。


### B001-01 渲染对象共享材质

变更：mengine-rhi的RenderObject.material使用SharedRenderMaterial；mengine-runtime/frame_compiler按本次提取共享基础材质和纯颜色覆盖，写入时分离；同步runtime与editor-host构造/预览/预热调用及测试。Rust构造调用需要.into()，数据格式不变。属于现有编辑器性能补充，不新增功能计数。

快速检查：提取7项、RHI材质提交2项、纹理同步1项通过；手动局部基准1项通过。runtime/editor-host/rhi tests/examples和Tauri release编译通过。Amazonia提取中位1.731245→1.022065ms，输出值一致；不作为整帧、总内存或FPS结论。完整边界及本地日志见performance-risk-todo第四十六阶段。

待合并验证：下一相关原生构建后执行map-session的continuous-profile、transport-profile、viewport-transitions、effect-reload、runtime-edits；另覆盖材质预览与单对象编辑隔离、材质/纹理/着色器热更新、透明/自定义材质和阴影。重点核对共享载荷是否影响实际Game/Scene及相机视图，记录真实连续性能。当前EXE不包含本项，本轮未重复原生地图QA、全库测试或全量构建；原有强制竞态/脱离窗口/Edit状态及Undo/真实延迟待测继续保留。


### B001-01 模拟请求分段计时与材质共享集成

变更：host PlayWorldUpdate增加可选timing，Tauri补命令计时，playRuntime/store保存成功会话/版本的不可变样本，Viewport/Profiler传递并展示分段；playStepTiming测试覆盖嵌套范围、缺失/非法值、采样副本隔离、Stop/重启/过期返回。map-session新增--simulation-profile，校验去重版本及真实嵌套范围。属于既有编辑器性能补充，不增加功能计数。

快速检查：前端21项通过，Stop清空补充后计时/视口/归属5项通过（含2项重测），原生计时1项通过，TypeScript/Tauri编译通过。首次原生测试编译缺少既有内部Request的queued_at，修正后定向通过。完整口径见performance-risk-todo第四十七阶段。

与c12e856共用一次前端/原生构建，EXE aa67609c2f6c6b2b3cd975d0cbb54b797793cebfbf1d3b282f61a68c81c4686b。命令 `node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --simulation-profile --viewport-transitions --effect-reload --runtime-edits` 的B001/map-session-1792784239971.json通过，0 error、正常退出。225个去重模拟样本完整，Scene/Game/相机预览、分辨率、Inspector编辑/动画推进、特效修改和精确恢复、Stop还原通过。正常材质共享地图路径已集成，未执行全库测试或全量地图导入。

最新呈现51.6562次/秒，独立运行不证明整体提速；模拟请求去重平均11.0116ms，原生排队0.01135ms，invoke减命令5.41515ms（含编码/投递/解码/回调等待）。继续分解前端准备和该剩余范围。待测保留原生材质/纹理/着色器专项热更新、材质预览及特殊透明/自定义材质；强制在途竞态、脱离窗口、隐藏/重试、Edit状态/Undo和真实输入延迟不关闭。Profiler新增表格尚未单独目视验收，真实采样传递已由原生QA验证。


### B001-01 菜单只读可用性查询

变更：store.hasVisibleHierarchyRows只读检查根节点，MenuBar“全选”disabled使用该查询；避免关闭的菜单构造整棵可见树并暴露运行世界的可编辑记录。实际全选逻辑不变。新增menuReadOwnership真实React渲染与native driver/store测试。属于现有编辑器性能补充，不增加功能计数。

快速检查：相关6项最终通过，TypeScript/diff通过；两次初始失败分别修正getter逗号和测试API名，已只重测失败项。Amazonia 7,409实体模拟空增量局部对照，菜单可编辑行读取2,577→0，准备耗时中位1.052660→0.010140ms，HTML/实体内容相同。完整口径及临时证据见performance-risk-todo第四十八阶段。

待合并验证：下一相关前端/原生构建复用map-session --continuous-profile --transport-profile --simulation-profile --runtime-edits，确认prepareMs/acceptMs及输入表现；增加关闭/展开菜单、Ctrl+A、空/折叠层级、换图后的菜单状态。当前aa67609c EXE尚不含本项，本轮未重复原生构建、地图QA或整库测试。原有特殊材质和生命周期风险继续待测。


### B001-01 稳定结构的原生世界同步

变更：mengine-scene/snapshot_world在源ID顺序及父级稳定时，仅应用变化记录和元数据；保留完整结构更新入口处理增删/重排/父级及引用变化。新增snapshot_world_stability_tests保存6370937完整实现用于结果/局部性能对照。属于现有编辑器性能补充，不增加功能计数。

快速检查：既有5项、新增等价1项、Play运行时集成26项通过；手动基准1项通过，4项其他手动基准忽略。初次对照的本地槽位差异与基准的部分Transform字段假设已修正，仅定向重测。Amazonia时钟/64 Transform局部同步中位0.675540→0.144000ms、0.864505→0.358015ms；每份mirror多保留约116 KiB顺序表。详细口径和证据见performance-risk-todo第四十九阶段。

待合并验证：与6370937菜单修复共用下一次前端/原生构建及map-session连续simulation-profile、viewport-transitions、runtime-edits；核对worldSyncMs、prepareMs、真实动画/编辑/镜头、Stop/重启/换图，补重排和父级修改。当前EXE不含两项，本轮未重建原生Editor、运行地图QA或全库测试。原有特殊材质与交互/生命周期待测不关闭。


### B001-01 节点选择只读访问与三项性能集成

变更：store内部范围/全选/子节点/方向导航使用只读查询；新增hierarchyReadOwnership测试；map-session新增--hierarchy-interactions，覆盖菜单、Ctrl+A、范围选择、聚焦和换图。属于现有性能补充，不新增功能计数。

快速检查：29项通过，前端构建通过。新测试确认连续内部选择不暴露可编辑记录，显式公共引用修改仍上传。与6370937/c8902a0共用一次原生构建，运行continuous-profile、transport-profile、simulation-profile、viewport-transitions、runtime-edits、hierarchy-interactions。待记录结果；全库测试和全量地图导入不在本次范围，原有特殊材质与交互生命周期风险保留。


本批已完成一次前端/原生构建，EXE f00c7f2e53e6b59257b80270cb0d5ee5bcef7abea35f288cf544b7d0bf94757c。首次QA的连续模拟计时、Scene/Game/预览、Inspector编辑与动画、双击/空格聚焦通过；新增菜单测试空名称异常、后续范围测试锚点准备错误分别修正，仅重测hierarchy-only。保留失败报告1792785972914/1792786047637，不把整次失败报告记为通过。性能采样55.1382次呈现/秒、模拟准备0.02720ms/世界同步1.26488ms，口径及局限见performance-risk-todo第五十阶段。


最终定向报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792786117908.json` 通过：折叠Ctrl+A、展开菜单全选、Shift范围选择、展开/折叠/左右键、双击/空格聚焦、换图后重复操作和Stop作者场景恢复全部通过，编辑器正常退出。结合首次采样已通过的阶段，本批关闭三项优化的上述正常集成覆盖；其余专项待测保持开放。


### B001-01 密集层级按槽存储

变更：mengine-core/transform_hierarchy为完整密集世界使用带generation校验的槽数组；稀疏世界和子集查询保留哈希存储。独立旧解析器对照与边界测试随实现提交，既有容量基准保持仅比较哈希容量策略。属于现有性能补充，不新增功能计数。

快速检查：层级9项、渲染11项、物理5项、音频1项通过；新增密度边界单项重测通过；手动局部基准1项通过。Amazonia层级构建中位1.023467→0.636240ms，菜单稀疏场景基本持平；结果一致，不代表整帧收益。完整口径及日志见performance-risk-todo第五十一阶段。

待合并验证：下一相关前端/原生批次覆盖真实Game/Scene/相机预览、动画/失活复活、父级和Undo/Redo、换图/Stop，采集连续TransformHierarchy.build与呈现耗时。当前f00c7f2e EXE未包含本项，本轮未重复原生构建、完整地图QA、全库测试或全量导入。其他专项和生命周期待测不关闭。


### B001-01 密集层级原生集成

3af0a3d与大厅文本提交共用一次前端／原生Release构建，EXE SHA256 `3371f8fc2dfb46bf16bf871569bbc570e7feecd594d45ae4934339b261ae1054`。`node scripts/qa-frost-map-session.mjs --continuous-profile --transport-profile --simulation-profile --viewport-transitions --runtime-edits` 报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792788103376.json` 通过，0 error、正常退出。覆盖Scene/Game、相机预览／轨道、两种分辨率、Inspector高度0→3.2经30步保留及恢复、三层动画／时钟推进与Stop还原。

7,410实体、850×478的末尾240次呈现平均54.4452次/秒，间隔18.3671ms/P95 27.7ms，原生渲染12.4069ms／世界同步1.3059ms。与前次55.1382次/秒属于独立运行，不能据此宣称整帧提升或稳定60 FPS。单帧TransformHierarchy.build 1.4908ms不是平均值。父级编辑／Undo、失活复活、强制在途切换、脱离窗口、特殊材质和真实操作延迟继续待测。

### B001-03 等待大厅与真实文本提交

变更：GameChatroom布局提取／还原脚本、NetworkDialog prefab及生成场景／脚本，client/server房间聊天与房主直接开始；Editor PlayInput/store/Viewport/App及mengine-script增加帧内InputField提交，脚本声明与运行文档同步。属于既有界面还原补充，不增加新任务计数。

定向检查：创建／LAN／大厅脚本通过；TCP聊天隔离、Unicode界限、身份、历史、重连、选英雄后无需重新准备及权限通过；提交队列1项、原生脚本提交1项通过；前端／原生Release构建通过。既有test-frostbound的准备门槛断言同步为房主直接开始，仅语法检查，完整规则套件未重跑。TCP补充测试曾误消费旧room事件，断言加入所选heroClass后定向通过；产品逻辑未因此调整。

`node scripts/qa-frost-warcraft-ui.mjs --lobby-only` 最终报告 `tmp/docs-artifacts/war3-ui/native-1792788057530.json` 通过，0 error、正常退出。真实DOM文本代理、Enter→原生脚本→TCP回显、两人大厅开始通过；4张截图覆盖草稿与消息、1280×720及960×900，已目视检查。此前失败报告7194319、7666811、7734988、7788538、7872551、7952363（文件名前缀native-179278）保留在war3-ui目录，原因与边界见warcraft-ui-fidelity。最终测试使用实时Play保持心跳，未延长产品超时。锁定WebView缓存保留，原始报告／截图不提交。

待测／待实现：中文IME实机、emoji字形回退、独立Player文本输入、旧原生QA大厅入口迁移、完整规则套件；原版12槽／队伍／观察者、种族颜色让步菜单、滚动条／斜杠命令、动态地图详情与逐像素对照。其余界面和编辑器性能待测保持开放。


### B001-01 普通材质复用与颜色覆盖去重

变更：mengine-runtime的materials/frame_compiler及两组对应测试。普通源材质按不可变来源身份复用渲染载荷；同色覆盖直接复用、其他颜色在帧内按载荷身份去重。保留文件轮询、自定义shader与实例解析、旧帧隔离和可编辑resolve API。属于既有性能任务补充，不新增计数。

快速检查：材质19项、网格提取8项通过，固定9d3e983旧实现的局部对照基准1项通过。Amazonia提取1.008140→0.788635ms，菜单0.176265→0.153020ms，输出相等；不等同整帧提升。过程与本地产物见performance-risk-todo第五十二阶段。首次新增shader测试断言修正末尾换行，错误过滤名未计作测试通过。

待合并验证：下一相关原生构建执行Game/Scene／相机预览、连续性能、材质及纹理／shader热更新、普通材质与自定义材质互换、属性覆盖编辑及旧帧隔离；覆盖资源删除恢复和项目切换，测量缓存保留内存。当前EXE3371f8fc仍为上一原生批次，未重跑前端构建、完整地图QA或全库测试。既有父级／Undo、竞态、脱离窗口与真实输入延迟待测保持开放。

原生集成检查 `cargo check -p mengine-editor-tauri --release --features custom-protocol` 通过，耗时13.34秒，仅既有world_from_snapshot未使用告警；日志 `tmp/docs-artifacts/editor-performance-risk/prepared-material-integration-check.log`。该检查不生成本次可验收的Editor EXE。


### B001-01 网格同步提前去重

变更：mengine-runtime/meshes.rs及mesh_sync_dedup_tests.rs。主视图和嵌套视图按完整GPU键在解析前去重，减少重复姿势解析、路径分配与缓存使用帧更新。每个相机专属billboard键仍独立同步，轮询／失败重试／淘汰不变。属于现有性能任务补充，不新增功能计数。

快速检查：18项网格测试通过，固定0a7f7d2旧实现的局部对照基准1项通过。实际Amazonia作者网格列表的非轮询热缓存遍历中位0.460216→0.133081ms，菜单0.039481→0.037798ms；缓存状态一致。此数据不包含billboard准备、源加载、GPU上传和IPC，不能推算实际FPS。完整口径及本地产物见performance-risk-todo第五十三阶段。

待合并验证：与第五十二阶段普通材质复用共用下一相关原生构建，覆盖连续Amazonia性能、Game／Scene／多相机预览、姿势及billboard、资源热更新／删除恢复、缓存淘汰和地图切换／Stop。当前EXE3371f8fc不含这两阶段代码；未重复前端构建、全库测试或完整地图QA。既有材质专项、父级／Undo、竞态、脱离窗口与真实操作延迟待测保持开放。


### B001-01 同视图普通姿势键复用判定

变更：mengine-runtime/meshes.rs及mesh_billboard_prepare_tests.rs。每个视图借用不需要billboard的键并复用判定，真正需要相机朝向的对象仍逐个计算变换；写回延后到同次调用末尾，保留各视图源检查与文件轮询。属于现有性能任务补充，不新增计数。

快速检查：19项网格测试及1项固定旧实现对照基准通过。Amazonia局部暖源准备0.351219→0.144535ms，菜单0.023742→0.036900ms；后者增加约0.013ms，结果与取舍见performance-risk-todo第五十四阶段。

本次合并验收范围：第五十二阶段普通材质及颜色覆盖、第五十三阶段网格去重、本阶段billboard准备，共用一次原生Release构建，检查连续Amazonia、Game／Scene／预览与动画、编辑恢复及资源热更新。结果下附；未列出的专项保持待测。


### B001-01 三项渲染优化的原生集成

普通材质／颜色覆盖、同步入口去重和同视图普通姿势键判定共用一次Release构建（1分14秒），EXE `c49946ba87fdad37899dfeb3feb7607f7f72944c16a1c79cce7aebc022d896aa`。报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792790439071.json` 通过，0 error、正常退出；真实Game／Scene／多相机预览、轨道和分辨率、Inspector修改与恢复、三层动画／模拟时钟、Stop恢复均通过，运行截图已检查。

连续Amazonia 7,410实体／850×478，末尾240次呈现54.1908次/秒，平均18.4533ms／P95 27.3ms，原生渲染11.4695ms，世界同步1.2987ms。240个模拟版本计时完整。与此前54.4452次/秒为独立运行，不作整体FPS提升结论；完整口径与本地产物见performance-risk-todo第五十四阶段。


同一EXE执行 `node scripts/qa-editor-performance-risk.mjs`，最终报告 `tmp/docs-artifacts/editor-performance-risk/render-cache-resources-final.json` 通过，0 error、正常退出。覆盖改名／Undo／Redo、持久恢复点、原生资产监听新增／修改／删除、Play暂停／恢复／逐步／Stop、稳定世界与像素；Ground.mmat、ClassicGround.mshader、UI图标、队伍颜色纹理、TownHall动画glTF均热更新可见并精确恢复原像素，原项目文件摘要不变。截图已目视检查。上述普通材质／shader／纹理／模型热更新正常路径关闭待测；父级变更与Undo、失活复活、强制竞态、独立窗口、资源删除恢复、完整项目切换、缓存总内存及真实操作延迟仍未完成。

首次资源报告 `render-cache-native.json` 在启动连接阶段失败，未执行业务检查；QA脚本改为按error.name识别BridgeConnectionError，并保留前台冲突直接失败。脚本语法检查通过，再使用同一EXE重跑上述资源专项成功；失败报告和日志render-cache-resources-qa.log保留。首次／重测原生进程均正常退出，仍被WebView锁定的临时缓存保留。原始截图／JSON／日志均在tmp/docs-artifacts下，未纳入提交。


### B001-01 原生视口按实际提交节拍续帧

变更：nativeViewportRequests、Viewport及Game／Scene调度测试。接受ticket后才推进lastRequestAt，重复／满容量请求不延后截止时间；Game到期完成立即续帧，重复请求等待完成或新版本通知，保留重试间隔、所有权、并发上限与截图排空。

快速检查：56项请求／Game／Scene调度测试通过，前端及原生Release构建通过（1分07秒）。已有测试环境与当前视口归属接口同步，首次失败和修复后的日志保留；测试初始可变容量设置改为构造时配置，未修改产品容量。此处实时计时风险需要定向原生验收，范围限定为连续Amazonia、Scene／Game／相机预览／分辨率与Stop；不重复上一批已通过的资源热更新等专项。


原生定向报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792791223023.json` 通过，0 error、正常退出。EXE SHA256 `46eecf10edec16a1fa35e82ee3ff675d18626f7383fd66a1f26d2e1d825d1887`；覆盖连续Amazonia、Scene／Game／相机预览／轨道、分辨率、Stop还原，截图已检查。7,410实体，末尾240次呈现55.0269次/秒，平均18.1729ms／P95 27.0ms；239个模拟版本计时完整。请求间隔18.1778ms、相对上一完成平均2.0226ms，仅与上一独立运行作观察对照，不宣称稳定FPS提升。完整口径和本地产物见performance-risk-todo第五十五阶段。

资源热更新和Inspector修改复用上批结果；本次没有新增这些路径的验收结论。真实操作延迟、强制竞态、独立窗口、父级Undo／激活等既有待测项保持开放。


### B001-01 原脚本 CreateAllUnits 初始化

变更：新增 game/warcraft-jass.js、warcraft-unit-initialization.js，map-session 工厂建立独立单位／触发器状态；地图安装器、既有包升级器、缓存身份及生成脚本保留来源与模块摘要。Amazonia 数据由原 CreateAllUnits 执行产生，96 单位／26 触发器登记；未驱动视觉实体，也未执行完整启动、掉落、战斗、AI 或对局。

快速检查：JASS 类型／求值／指令／深度／数组／文本边界、源 SHA 与幂等打包、旧脚本边界、菜单重载隔离及两图动态导入通过。Amazonia 初始化通过；Echo Isles 的 IssueImmediateOrder 明确 unsupported，空状态、场景仍可加载。原脚本的 Unit 编号按放置序号核对，ItemTable 编号按共享表核对。首次测试将放置序号误写为 creationNumber 导致断言失败，修正后独立二进制对照通过，失败日志保留。REA 探针仅验证 native 名称，不作为执行语义证明。

命令：node scripts/test-frost-jass.mjs；node scripts/test-frost-unit-initialization-package.mjs；node scripts/test-frost-map-session.mjs；node scripts/test-frost-map-import.mjs <Amazonia或EchoIsles的entry.json> --unit-initialization。日志位于 tmp/docs-artifacts/frost-original-maps/unit-init-{jass,package,session,dynamic-amazonia,dynamic-echo}.log。只验证本次初始化范围，无全库／全地图遍历或性能重跑；原生定向验收复用当前 Editor。

待测／未实现：完整启动与 common.j／Blizzard.j、单位状态与视觉实体关联、原客户端 native 语义对照、事件实际触发、战斗／移动／AI、跨地图存档及联网；独立 Player 分发继续待验收。现有 editor 性能专项的真实输入延迟、强制竞态、独立窗口、父级 Undo／激活待测项不受本项结论替代。本项属于原地图接入补充，不新增批次计数。

原生定向命令 `node scripts/qa-frost-map-session.mjs --unit-initialization-only` 通过，报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792792615135.json`：96 单位／26 触发器登记、连续帧、重载、返回清空、重新进入及 Stop 恢复通过，0 error，进程正常退出。复用 EXE SHA256 `46eecf10edec16a1fa35e82ee3ff675d18626f7383fd66a1f26d2e1d825d1887`，未重新构建；启动脚本摘要 `03a809825e618507fd470bddf1e747a9162990b819ce62507203889a1df5fe99`。WebView 锁缓存保留。此结果证明 MEngine 内执行本入口，不表示原 Warcraft 完整对局兼容或新增性能收益。

维护链补充：refresh-frost-map-camera.py 验证并保留 JASS 数据段，镜头控制器更新仍拒绝未知边界。包测试包含真实 Amazonia 脚本尾部分离与无损拼接、非法尾部拒绝；实际已安装地图升级器重复执行三个输出文件摘要一致。Python AST、修改的 JS 工具语法及 git diff --check 通过。


### B001 编辑器 Play 编译大小校验

变更：packages/editor/src-tauri/src/play_compiler.rs、lib.rs。16 MiB 限制作用于解码后的 UTF-8 源码，编码信封另设界限；拥有型反序列化后直接交付 String。原来有效的 15,993,429 字节脚本被 16,795,948 字节 JSON 输出误拒绝；失败原生报告 map-session-1792794010926.json 保留。

必要快速检查：play_compiler::source_tests 两项通过，覆盖 JSON 转义／中文边界、真实超限与非法信封。因本项阻断本批 Play，复用最终原生构建进行单位选择专项验收；不扩大到已通过的连续帧、资源热更和所有编辑器功能。风险及源码大小口径见 performance-risk-todo 第五十六阶段。


Release 构建通过，耗时1分06秒，仅既有 world_from_snapshot 未使用警告。EXE SHA256 `7e8e4e9b2f32cec3c8a75342ba0bf5932d2c7a12856bd778718cd670ee87f93a`。原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792794409250.json` 确认大入口脚本能进入 Play、进行地图交互并 Stop 恢复，0 error、进程正常退出；该报告的选择圈组件断言不代替视觉验收，后续贴图修复与截图结论另记。源码 LF 规范化发生在构建后，未改变 Rust 语义。没有重跑完整编辑器回归或帧率基准。


### B001 原地图单位绑定、选择反馈与贴图透明度

变更：warcraft-map-units.js、map-session.js、单位绑定导出／升级／地形裁切工具、单位导入／打包／缓存链、BLP1 解码器、Amazonia 绑定数据及选择资产。96 个单位连接原脚本状态和实际视觉根节点，按当前透视相机点击包围盒，显示源名称／生命／魔法／金矿资源；三张原圈纹理修正 mip alpha，初始放置使用由地形三角形裁切的选择网格。原场景只新增一个非激活实体。

快速检查：test-frost-map-units.mjs 通过（96 绑定、64位实体、斜视／方形点击、源尺寸颜色、Inspector 位移和失活、清除／重载／原子失败、600空闲帧无查询写入）；test-warcraft-unit-bindings.py 5 项通过；test-warcraft-texture-alpha.py 5 项通过；test-frost-unit-initialization-package.mjs 与 test-frost-map-session.mjs 通过。贴地新增案例验证裁切面积、UV、平面高度插值、空区域和 GLB 读取。108 个输出幂等，96 贴地网格来自9个 Ground GLB，全部选择资产 227,656 字节。Python AST／JS 语法／差异检查通过。首次 0/-0 测试期望纠正，失败日志保留。

定向原生命令：`node scripts/qa-frost-map-session.mjs --unit-selection-only`，MENGINE_EDITOR_EXECUTABLE 指向当前 release EXE。报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792795243536.json` 通过，0 error、正常退出；1280×720 和 960×900 选择金矿、源尺寸／中立黄／12500黄金、空白清除、重载／返回／Stop 恢复。两张截图已人工查看，完整贴地圈可见。EXE SHA256 `7e8e4e9b2f32cec3c8a75342ba0bf5932d2c7a12856bd778718cd670ee87f93a`，本次没有再构建。此前 1792794409250 仅状态通过但圈不可见，1792794698569 alpha 修复后仍局部沉入地面；均保留作诊断，不计为最终视觉验收。

证据：tmp/docs-artifacts/frost-original-maps/unit-bindings-*，最终 ground-native.log、ground-checks.json、ground-package.log；REA unit-selection-evidence 只提供名称证据。未重跑整库、全地图或 FPS 基准。本项为原地图接入补充，不另增批次数。

待测／未实现：移动单位的动态贴地、悬崖／水面／可行走装饰、地形编辑、原客户端精确拾取与遮挡、框选多选、原联盟语义、完整HUD与高窗口状态条布局、完整原图启动／移动战斗AI。共享资源新地图完整转换及其他 BLP 资产迁移待相关批次验证。现有编辑器实际输入延迟、强制竞态、独立窗口、父级 Undo／激活、缓存内存待测项继续保留；本次不替代这些结果。


### B001 编辑器变换层级缓存

变更：mengine-core 的 transform_hierarchy_cache、World.hierarchy_revision，以及 editor-host 的 EditorViewportRenderer。返回各帧独立层级数据，依赖局部输入和父级版本复用；稀疏场景使用原 resolver。Transform／Parent／active 失效与其他组件变更分开，自定义投影逐次读取，跨 World 和 generation 隔离。

快速检查：核心库34项通过、6项手动基准忽略；新增局部基准1项通过，三类变更×两真实场景输出对照一致。基准细节、额外缓存容量及全变换更新时的代价见 performance-risk-todo 第五十七阶段。只有相关核心库检查，没有运行全仓测试。

原生定向计划：复用本次唯一构建，运行 `qa-frost-map-session.mjs --continuous-profile --transport-profile --simulation-profile --viewport-transitions --runtime-edits`，检查连续模拟、实际Inspector修改／恢复、Scene/Game/相机预览／轨道／分辨率和Stop。原生父级Undo、激活UI、强制竞态／独立窗口、缓存总内存与真实操作延迟仍需后续相关批次验收；核心值对照不替代这些实际交互。


原生Release构建1分26秒通过，仅既有 world_from_snapshot 未使用告警；EXE SHA256 `b09afab0956b20576c023ac697a01324a699a7fb468023ca8393221f85aded54`。原生报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792796299328.json` 通过连续模拟、Game／Scene／相机预览／轨道／分辨率、Inspector高度0→3.2经30步保留与恢复、三层动画和Stop还原，0 error、正常退出，截图已目视查看。此次不重复资源热更和全库测试。

7,411实体／850×478，末尾240次呈现平均54.9388次/秒，间隔18.2021ms／P95 27.9ms，原生渲染11.0336ms、世界同步1.2703ms，239个不同模拟版本。与此前独立运行55.0269次/秒相比，仍无稳定整体FPS收益或60 FPS结论。最新单帧TransformHierarchy.build为0.4897ms，仅用于定位，不充当平均或严格原生前后对照。摘要为 tmp/docs-artifacts/editor-performance-risk/hierarchy-cache-native-summary.json。


补充像素验收复用同EXE，仅运行 `qa-frost-map-session.mjs --runtime-edits-only`，报告 `B001/map-session-1792796459914.json` 通过，0 error、正常退出。QA将Scene相机对准受测岩石根节点，在截图前清除选择，避免选中框／gizmo变化代替实际网格变化；暂停时修改Inspector高度使原生像素变化，还原后图像SHA256与修改前完全一致。前后截图已目视确认岩石升起。随后30步的修改保留、动画／时钟、恢复和Stop也通过。测试脚本记录三张图的摘要；没有再次构建或重跑连续性能采样。WebView锁缓存按既有约定保留。


### B001 模拟与视口固定时间轴

变更：frameCadence.ts、App.tsx的Play循环、nativeViewportRequests.ts及Viewport.tsx的Game／Scene节拍；对应调度和生产视口测试。沿60Hz时间轴恢复相位，跳过错过时隙，相邻启动至少8.33ms；模拟保持串行／dt≤0.25秒，视口容量、归属、截图和错误退避继续保留。

快速检查：调度71项、生产视口3项通过；记录、命令、首次旧计时期望及测试环境修正见performance-risk-todo第五十八阶段。前端和原生一次构建后，仅运行连续Amazonia／transport／simulation／viewport-transitions原生专项。不重跑上一阶段Inspector像素恢复、资源热更或全库；原生实测结果见下。

剩余专项：实际输入延迟、强制在途竞态、独立窗口、父级Undo／激活UI、进程缓存内存及跨机器长期帧率；确定性调度测试不代替这些运行验收。


原生定向结果：前端构建3.14秒、Release构建1分04秒通过，仅既有 world_from_snapshot 未使用告警。报告 `tmp/docs-artifacts/testing-batches/B001/map-session-1792797179807.json` 通过连续模拟、Game／Scene切换、相机预览／轨道、宽高分辨率及Stop还原，0 error、正常退出，截图已目视查看。EXE SHA256 `457b1b5c4c977ef9cc5585cea21ea49ca8cb4f87cf29d5e19e5c9da31e5dd55a`。测试临时WebView缓存因EPERM保留在本报告对应native-qa/runtime目录，发现文件已清理。

10秒采样窗口，7,411实体／850×478；末尾240次呈现平均59.9970次/秒、间隔16.6675ms／P95 24.6ms，原生渲染10.8891ms、世界同步1.2092ms，237个不同模拟版本。239个推算请求起点间隔平均16.6686ms，完成至下一起点平均1.4653ms。上一独立运行54.9388次/秒仅作为同场景参考；当前短窗口平均接近60，不代表长期无抖动或跨机器稳定60 FPS。摘要为 tmp/docs-artifacts/editor-performance-risk/frame-cadence-native-summary.json。


### B001 跨窗口紧凑会话与实体JSON复用

变更：store.ts、sessionSceneSerialization.ts和对应测试。会话采用紧凑JSON，复用冻结实体的序列化片段；实时直接编辑回退，作者场景落盘格式保持不变。Node局部结果15.9624→4.9892ms／消息6,062,161→3,347,805字节，范围与内存口径见performance-risk-todo第五十九阶段。

快速检查：相关31项与TypeScript通过。现已与第六十／六十一阶段合并完成正常原生多窗口覆盖，见后续验收结果。原定验证范围：同时打开独立Scene、Game和Inspector，持续Play／Pause／Step／Stop，主窗口和独立窗口分别编辑组件，切换地图／重开，核对选择、相机、动画、原生session/revision及停止恢复；记录主窗口输入延迟、BroadcastChannel传输与接收端重建、窗口关闭后的内存。测试不重复无关地图转换／全库资源遍历。


### B001 独立窗口运行副本复用

变更：store.ts远端运行加载与私有副本复用；App接收发布保留的面板快照；remoteRuntimeReuse及workspaceSelectionSync定向测试。相关36项与TypeScript通过，Node接收链路的静态／单Transform／全Transform对照见performance-risk-todo第六十阶段。

状态：已与第五十九／六十一阶段合并完成正常原生多窗口覆盖。合并验收同时覆盖独立Scene／Game／Inspector的持续播放、双向组件编辑后下一消息覆盖、展开状态／选择／冻结旧帧、换图／重开／Stop后再次编辑、原生session/revision、收到乱序旧消息、关闭窗口与内存；记录发送、接收、指纹及真实输入延迟。完整JSON解析／规范化、作者指纹与跨窗口原生竞态尚未优化或验收，不重复无关资源热更和全库。


### B001 远端作者指纹与跨窗口运行修改

第三项：远端冻结作者镜像的规范化指纹复用；原生主窗口收到运行修改后强制上传，丢弃旧在途结果，保留作者场景及撤销历史。相关38项定向检查通过。与51890a5、ec60762合并执行原生多窗口专项，命令qa-frost-map-session.mjs --detached-only；本次不扩大为全库QA。

验收覆盖独立Inspector修改→主窗口→原生步骤、主窗口恢复→独立Inspector、Scene／Game持续呈现、暂停／单步、地图重载及Inspector重开、Stop完整作者实体恢复、停止后继续编辑及回收窗口。长期运行、输入延迟分布、总内存、强制原生竞态和跨机器性能仍需后续专项；确定性在途测试不替代原生强制竞态。


最终合并原生验收通过：B001/map-session-1792799928856.json，EXE f4b4b4d323fc70630932d4aa7a73e7797b90d75d4aec03786a7f8a37b8845bf0，0 error、正常退出。上述正常同步／播放／恢复覆盖全部通过，新增真实独立Game播放快捷键验收。晚到窗口启动回复复活Pause的问题已通过主窗口模式归属与重新同步修复；确定性消息乱序测试及最终原生Stop后编辑均通过。失败报告及QA修正范围见performance-risk-todo第六十一阶段。

本批关闭上述三项的正常集成验证，性能目标仍开放：三独立窗口5秒实测Scene5.97／Game4.90次呈现/秒，完整同步及请求等待仍需优化；Game最新profile缺worldRevision需定位。保留输入延迟、总内存、长期运行、跨机器和强制原生竞态专项。截图／原始JSON仅存tmp/docs-artifacts，未纳入docs提交。

### 下一批任务1/3：原生运行世界跨窗口增量传输

变更：`sessionSceneSerialization.ts`、`store.ts`、`App.tsx`，以及 `sessionSceneDelta.test.mjs`、`workspaceSelectionSync.test.mjs`。主窗口发布带状态基线的实体增量，独立窗口缺失基线时请求完整检查点；启动／补齐只由主窗口响应。编辑模式及未上传修改仍完整同步。

快速检查完成：19项相关测试、TypeScript检查通过；7,410实体Amazonia载荷重建与完整JSON逐项相等。命令为 `node --test packages/editor/tests/sessionSceneDelta.test.mjs packages/editor/tests/sessionSceneSerialization.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs` 和 `pnpm --dir packages/editor exec tsc --noEmit -p tsconfig.json`。最后新增的自定义序列化用例用 `--test-name-pattern="custom serialization"` 单独执行，未重复前18项。证据和载荷数字见performance-risk-todo第六十二阶段及tmp/docs-artifacts/editor-performance-risk/session-delta-*。

状态：实现完成，原生集成待本批累计3项后合并执行。合并构建后运行 `node scripts/qa-frost-map-session.mjs --detached-only`，检查三窗口呈现、双向Inspector修改与原生步骤、Pause／Step、主窗口播放归属、地图重载／窗口重开、Stop与停止后编辑。补测正在运行时新窗口加入及缺基线补齐，采样Game／Scene呈现间隔、worldRevision／回退情况和输入延迟。风险：漏收或乱序恢复、检查点竞争、密集变化载荷略增，接收端完整解析仍可能主导卡顿。本次没有新的原生FPS结论。

### 下一批任务2/3：增量消息解析与规范化复用

变更：`sessionSceneSerialization.ts`、`store.ts`、`playWorldSync.ts`、`App.tsx` 和新增 `sessionSceneReception.test.mjs`。当前版本的已认证实体解析结果与规范化记录跨帧复用；脚本实体引用字段变化及位置默认索引正确失效。可编辑对象与冻结消息隔离，旧版迁移和完整JSON兼容。

快速检查完成：46项相关测试最终通过，初次两项夹具错误修正后定向复查；TypeScript通过。命令：`node --test packages/editor/tests/sessionSceneReception.test.mjs packages/editor/tests/sessionSceneDelta.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs packages/editor/tests/remoteRuntimeReuse.test.mjs packages/editor/tests/playWorldSync.test.mjs`；两项补测用 `--test-name-pattern="runtime store|behavior entity"`，追加版本断言用 `--test-name-pattern="runtime store"`。局部Amazonia CPU对照及证据见performance-risk-todo第六十三阶段。

状态：实现完成，与任务1合并待原生验证；当前累计2/3，本次未构建Release或重复原生QA。合并覆盖任务1场景，追加相机聚焦／操控、运行组件编辑后后续帧不回退、行为字段更新、窗口关闭重开与地图往返后的总内存观察。确认视口版本引用与显示帧一致；局部CPU下降不替代真实多窗口帧率和输入延迟验收。

### 当前批次任务3/3：原生视口世界请求观测

变更：nativeViewportTransport／nativeViewportFrame／editorProfiler，传输测试，以及qa-frost-map-session和sample-native-qa-memory.ps1。worldRequest明确指定版本、直接快照、过期回退、尝试次数和请求耗时。18项传输／步骤观测检查通过，QA语法通过。命令：`node --test packages/editor/tests/nativeViewportTransport.test.mjs packages/editor/tests/playStepTiming.test.mjs`。

三项实现已累计，提交后合并执行前端及原生Release构建，再运行 `node scripts/qa-frost-map-session.mjs --detached-only`。验收覆盖三窗口编辑／播放／重载／Stop，Play中新窗口加入、请求版本／回退采样和进程树内存。脚本操作至主窗口观察时间仅作为自动化链路指标；真实输入到显示延迟、强制原生乱序和长期回收另保留。结果待补记。

本批常规集成覆盖已完成，性能目标继续开放。0752409、a5b9c95及世界请求观测合并构建；18项观测测试通过，上传实体数补充断言单独复查通过。原生 `1792801709656` 的Inspector双向编辑及原生步骤保留通过，后续数量断言失败；`1792801839175` 同样在数量口径检查处失败，不能称为整份通过。修正为使用实际帧上传数量后，`node scripts/qa-frost-map-session.mjs --detached-profile-only` 报告 `1792802023180` 全部通过、0 error、正常退出，覆盖后续播放、重载、Stop和作者编辑；此模式保留菜单→地图初始化并跳过已通过的Inspector前置编辑。相机画面已截图核对，行为字段热更新仅定向测试覆盖，尚未原生验证。

本次三窗口Scene10.27／Game14.85次呈现每秒，Scene13/49帧过期回退而Game0/74；最新profile的实体数与请求内容一致，回退历史尚未逐一比对渲染实体数量。短时内存采样完成，尚不代表长期回收验收。原始结果／图片仅在tmp/docs-artifacts，详细限制及EXE哈希见performance-risk-todo第六十四阶段。下一批应围绕Scene版本过期回退和实际请求等待优化；不重复本批已通过的无关范围。

### 新批次任务1/3：实时Scene版本过期限次重试

变更：nativeViewportRequests／nativeViewportTransport／Viewport／App／editorProfiler，相关请求及Scene调度测试、qa-frost-map-session。实时Scene共享两次过期重试预算，成功发布／所有者变更重置；暂停、截图和相机预览保持精确快照回退。timings增加延期次数与渲染实体数，QA按每个成功帧核对实际上传数量。

快速检查：`node --test packages/editor/tests/nativeViewportRequests.test.mjs packages/editor/tests/nativeSceneCompletionScheduling.test.mjs packages/editor/tests/nativeViewportTransport.test.mjs packages/editor/tests/viewportSceneCompletion.test.mjs` 初轮54项通过；新增Stop检查随4项受影响用例补测通过，合计55项不同用例；新增timings字段断言单独复查已有world-request-telemetry用例通过；`pnpm --dir packages/editor exec tsc --noEmit -p tsconfig.json` 与QA语法检查通过。日志及机制见performance-risk-todo第六十五阶段。

状态：实现完成，原生验收待本批累计3项后合并。合并构建后执行 `qa-frost-map-session.mjs --detached-profile-only`，核对Scene延期／回退次数、呈现间隔、逐帧实体数量，以及Pause／Step、截图、新开窗口、地图重载、Stop。增加原生持续过期时仍能呈现与暂停／截图立即回退的针对性验证；保留真实输入到显示延迟和长期内存专项。当前没有新的FPS结论。


### 新批次任务2/3：独立窗口运行面板合并刷新

变更：App的远端scene-state接收、remotePanelRefresh调度器及workspaceSelectionSync／remotePanelRefresh测试。运行增量立即进入Store和视口，常规面板发布合并到100ms；选择、场景／会话／模式变化与完整检查点立即发布，取消和清理阻止旧回调覆盖新状态。

快速检查：`node --test packages/editor/tests/remotePanelRefresh.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs` 16项通过；`pnpm --dir packages/editor exec tsc --noEmit -p tsconfig.json` 通过。证据、发布次数及限制见performance-risk-todo第六十六阶段。

状态：实现完成，待累计第3项后合并前端和原生Release构建。执行 `node scripts/qa-frost-map-session.mjs --detached-only`，覆盖三窗口运行与Inspector双向编辑、Play中新开窗口、选择／可见性、Pause／Step／Stop、地图重载和窗口重开；合并检查第六十五阶段Scene重试及逐帧实体数量，并记录呈现间隔和进程内存。真实输入延迟、长期运行及强制原生竞态仍需专项，不扩大到无关全库或资源热更测试。


### 新批次任务3/3：运行接收端编辑指纹按需计算

变更：App运行接收路径、workspaceSelectionSync测试及qa-frost-map-session原生dirty断言。独立窗口Play／Pause采用主窗口dirty字段，编辑检查点恢复指纹基线；主窗口比较和打开／保存逻辑继续保留。15项同步测试、TypeScript和QA语法检查通过，日志见performance-risk-todo第六十七阶段。

累计三项：cb20d61、51dab64及本项。提交后执行一次 `pnpm --dir packages/editor build`、`cargo build -p mengine-editor-tauri --release --features custom-protocol`，然后 `node scripts/qa-frost-map-session.mjs --detached-only`。检查三窗口运行、Inspector双向修改／还原、Pause／Step、窗口重开与地图重载、Stop作者实体及dirty恢复；合并采样Scene延期／回退、每帧实体数量、呈现间隔和进程内存。实际结果待补记，尚未关闭本批。


本批正常原生集成已通过并关闭：报告 `B001/map-session-1792803627596.json`，0 error、正常退出，EXE `506e871e825fafc1fe462ab63f24d2c448d8060fd3377550ed7cac637bdcd77b`。前端和Release各构建一次；三窗口Inspector双向修改／原生步骤保留、Play中新窗口、Pause／Step、快捷键、地图重载、Stop作者集合与dirty恢复及停靠通过，截图已目视核对。每个成功profile的实体数对照通过，包含一次Scene回退5,410实体。

Scene17.71／Game18.51次呈现每秒，Scene1/89完整回退、72次已记录延期，Game0/93回退。结果为5秒单次采样，仍未达到流畅目标；真实输入延迟、长期内存／跨机器、强制原生竞态、可见性交互及字段热更新保留专项。详细计时、内存和限制见performance-risk-todo第六十七阶段，产物仅存tmp/docs-artifacts。下一批从0/3开始，不重复本批已通过的正常集成范围。


### 新批次任务1/3：场景加载ID扫描合并

变更：store、selectionRestore及remoteRuntimeReuse测试。一次加载共用ID数组／集合，按需建立祖先索引，空交互列表无需扫描实体。相关18项测试和TypeScript通过，Amazonia局部CPU与语义对照见performance-risk-todo第六十八阶段及load-index-*产物。

状态：实现完成，原生验证待累计3项后合并构建。覆盖地图加载／重载，运行中节点选择、展开／折叠与隐藏／不可选，Stop后新增节点ID及三窗口呈现。保留前端paint采样、消息接收和请求调度等待数据，再判断多窗口收益；不重复无关资产转换和全库测试。


### 新批次任务2/3：后台视口前端绘制采样

变更：Viewport、editorProfiler采样器、viewportPaintProfiling测试及qa-frost-map-session。记录所有实际完成的绘制，跳过无变化帧，测量与唤醒时钟分离；隐藏／切换来源重置测量窗口。原生专项报告保留前端汇总和样本，避免只凭原生请求耗时推断前端瓶颈。

快速检查：19项不同用例最终通过，TypeScript及QA语法通过；首轮边界失败、修复及受影响复查见performance-risk-todo第六十九阶段。当前2/3，原生待合并。下一次验证检查后台Scene／Game均有前端样本、正常绘制和新帧呈现，分别报告paint耗时与native呈现间隔；同时覆盖第六十八阶段场景加载／选择／隐藏／新节点ID。此项改善观测完整性，不作为帧率提升。


### 新批次任务3/3：远端作者副本延迟可编辑化

变更：store远端加载和回到Edit边界、remoteRuntimeReuse测试、qa-frost-map-session的Stop后创建／undo／redo检查。作者镜像复用冻结数据，可编辑运行副本独立；主窗口原作者及撤销保持不变。31项测试、TypeScript及QA语法通过；密集变更收益和直接Store Stop复制成本见performance-risk-todo第七十阶段。

累计4ce6f62、1c4badf及本项，提交后合并一次前端与原生Release构建，执行 `node scripts/qa-frost-map-session.mjs --detached-only`。覆盖运行编辑保留、窗口重开／地图重载、Pause／Step、Stop作者恢复及后续编辑／ID分配／undo／redo；采集前端paint与原生呈现／回退。节点展开和隐藏列表已做定向Store检查，其真实UI交互继续保留专项，尚不声明本批已覆盖。原生结果待补记。


本批正常集成已通过：报告 `B001/map-session-1792804951765.json`，0 error、正常退出；前端和Release各构建一次，EXE `6af47b8deffce238c92d201470c2ee4e515d2a78c29a8d596a0319b198a6a849`。三窗口编辑／播放／重载／Stop／作者dirty恢复、新实体ID与undo／redo通过，前端paint样本有效，全部成功profile实体数一致；截图已目视核对。剩余隐藏／不可选UI、长期性能与内存、实际输入显示延迟和强制竞态不计为完成。

Scene24.01／Game19.87次呈现每秒；Scene0/121完整回退、81次已记录延期，Game0/100回退。前端paint加权平均7.56／1.90ms；短时进程内存已采样。指标口径及限制见performance-risk-todo第七十阶段和remote-author-native-summary.json。下一批0/3，不重复本批正常集成范围；优先复现Scene延期完成后的旧图像重复绘制，并继续定位Game请求间等待。


### 新批次任务1/3：跳过Scene完成回调的未变化绘制

变更：Viewport完成绘制判断及nativeSceneCompletionScheduling测试。延期／未产生新图像的完成回调可跳过Canvas重画，请求调度、新图像和交互变化继续执行，截图与编辑动画保持绘制。实际判断先复现失败后修复；相关38项和TypeScript通过，证据见performance-risk-todo第七十一阶段。

状态：实现完成，待累计3项后合并原生构建。采集前端paint、原生成功帧和延期次数，验证隐藏Scene持续呈现、相机／选择／截图及Pause／Step／Stop；不以旧采样推算FPS，不重复无关资产与全库检查。


### 新批次任务2/3：跨窗口发送间隔复用

变更：App的broadcastScene计时及workspaceSelectionSync测试。常规发布等待上次发送后的剩余33ms，保持单计时器／最新世界合并；立即同步取消待发送并重置间隔。实际处理器复现由960ms内19次恢复为29次，17项同步测试和TypeScript通过，日志见performance-risk-todo第七十二阶段。

状态：当前2/3，原生待合并。下一项完成后验证三窗口Play／Pause／Step／Stop、检查点与重开、Inspector编辑和最新原生版本；比较Game呈现及消息处理负载，合并第七十一阶段Scene绘制／延期与截图检查。发送次数是确定性调度测试，暂不宣称真实FPS提高。


### 新批次任务3/3：Scene交互呈现与隐藏页签停绘

变更：nativeSceneFrame、Viewport、DockWorkspace、panelVisibility及定向测试。保留尺寸变化期间的完整画面、连续相机帧按序显示，隐藏Dock页签停止rAF／重试及通知绘制。41项定向测试、TypeScript通过。提交后合并e468673、5df28a8构建一次，执行多窗口原生QA；补查Scene持续旋转、尺寸变化、切走页签后原生请求停止与切回恢复，避免截图强制绘制干扰隐藏采样。真实鼠标手感与持续满帧不据单元测试判定。


本批原生验证完成：e468673、5df28a8、c274d2e；Release构建1分26秒，EXE SHA256 1d22aaaa8cb680c5e02cb16014dd4f27ca4f72076ad66ef33823a2af25fa34d2。Scene专项报告B001/map-session-1792806256160.json通过：连续相机输入期间呈现14帧、分隔条尺寸拖动、隐藏900ms内0原生帧／0paint、恢复后33帧，Scene/Game切换、分辨率和Stop内容恢复通过。已目视检查Scene尺寸变化与旋转截图。

多窗口报告B001/map-session-1792806323286.json通过，0error、正常退出，覆盖Inspector双向编辑、运行三步保留、重开／重载、Pause／Step、Stop作者数据／dirty／新ID／undo恢复。两个隔离WebView缓存因EPERM保留，发现文件已清理。5秒样本Scene22.17／Game27.70次呈现每秒、完整回退均0；前端paint加权17.08／2.05ms。该采样与独立地图转换复现并行，存在CPU争用，不能用于与上批做性能收益比较；后续性能专项应在无转换任务时采集。正常功能集成关闭，新批0/3。日志／报告／截图仅在tmp/docs-artifacts，长期流畅、真实输入延迟和完整地图功能仍待处理。


### 新批次任务1/3：Game滚轮与原地图距离限制

变更包括编辑器／ScriptInput／独立运行输入、原地图相机脚本及Amazonia资产。8项输入测试、相机脚本测试和TypeScript通过；合并执行Rust输入桥定向测试、Release构建及qa-frost-map-session --camera-only，覆盖canvas真实滚轮、上下界、停止后作者数据恢复与独立Game输入转发。当前1/3，原生待测。


### 新批次任务2/3：地图父子层级

frost-map-hierarchy、安装与刷新工具、运行导入配方及Amazonia场景／摘要已更新。2项定向检查通过；当前2/3，合并覆盖新层级展开／折叠／双击／空格、单位拾取、运行修改、地图重载、Stop恢复及新增ID。分组使用恒等变换，不改变地图坐标或声称提升帧率。


### 第七十六阶段：自定义地图资源别名与单位／物品定义

用用户Maps目录复现WarChasers：先因Cliff1.tga被错误追加.blp失败；修复后又因war3map.w3u被整表拒绝而停止。现在贴图候选按地图、补丁、游戏档案优先级解析，每个档案先精确路径、再TGA／BLP别名；保留实际读取路径与源摘要。腐坏数据仍报错，不能用低优先级资源掩盖。

新增经典v1/v2单位／物品对象解析；按UnitMetaData把原对象修改和自定义继承应用到UnitUI／UnitData／UnitBalance／ItemData，模型、缩放、颜色、名称、生命和选择数据使用解析后的表，地图字符串解引用。放置物品生成源模型；原ItemStrings中的无赋值说明行允许保留。其他玩法／技能字段仍在源档案与覆盖记录中保存，不宣称执行；v3对象、装饰物修改表、随机放置和完整RPG逻辑仍有限制。

4项贴图、5项对象数据、5项单位绑定检查通过，含优先级、缓存路径、腐坏不回退、类型／边界／继承／兄弟隔离／物品及非有限数。WarChasers已完成完整转换：342个放置记录、147条对象定义／修改，生成1558资源记录；源SHA2e20cc37f939bac5341520d6d1d10bf30dfbd57ac25c0b0a949d80d100b401c6。日志和结果在tmp/docs-artifacts/map-loading-repro/war-chasers-complete*，各阶段失败证据保留。资源包存本地临时验证工程，不提交生成验证资产。

此前Booty Bay原生冷导入／缓存命中／返回／进度UI已通过（B001/arbitrary-map-1792806641566.json，5896实体，冷9.70秒／缓存2.00秒，0error，正常退出）。这不代表所有自定义地图兼容。当前3/3，合并原生构建验证滚轮、地图层级及WarChasers菜单导入；FPS在无资源转换并发时专项采样。


### 第七十七阶段：启动脚本同步地图相机

实际 Game 画布 wheelDelta=-1 已到达脚本输入，但注册地图的启动脚本仍嵌入旧相机代码。相机刷新工具现在同步已注册地图的启动 bundle；新增相机包／启动 bundle 一致性检查。同步只更新地图运行脚本，不重新生成场景或共享资源。

原生报告 B001/map-session-1792807989852.json 已通过主窗口滚轮、上下界与分离 Game 滚轮转发；该报告随后在层级 QA 的虚拟列表定位失败，不计整套通过。分组后展开全部需先 reveal 目标行，QA 已补充，层级验证继续执行。相机脚本定向检查通过；本次修复仅脚本资产，无需重复原生构建。当前集成 EXE SHA256 6839481621593ca37119e6b0461695713e0f657ebb7d926195baacc373dce13c。


### 第七十八阶段：DotA_v6.83d 地图场景导入

目标源文件为用户 Maps/Download/DotA_v6.83d.w3x，SHA256 c06547206849f7931ad61509e21b76d22d63ae38d05fe7f35dab48c3dff56ddf。支持完整 forces 后明确省略的 W3I 编辑器尾表并保留诊断，其他截断仍拒绝；读取 Scripts/war3map.j 并记录实际档案路径。经典装饰／可破坏物对象覆盖按源元数据解析，缺失模型变体可读取同源基础模型，损坏数据不回退。没有编辑器单位表时生成空静态单位收据，界面说明及 manifest 标明能力边界。

27项定向检查通过（地图10、对象6、装饰6、绑定5），语法与差异检查通过。最终完整转换约10秒：14,437实体、5,198装饰、111源模型、43覆盖、461资产；保留完整原地图和3,026,043字节JASS。结果 tmp/docs-artifacts/map-loading-repro/dota-final/result.json，失败阶段日志与最终摘要均在同目录。完整 DotA 脚本、动态单位生成和对局规则尚未接入，不能以场景加载通过表示可玩 DotA。

原生菜单缓存载入通过：B001/arbitrary-map-1792808418421.json，14,437实体，缓存载入2.724秒，进度／进入提示先于场景切换、返回菜单清除进度、Stop恢复作者场景，0 error、正常退出；已目视确认原生场景截图。测试缓存保留原地图标题，验证按源能力区分有／无静态单位；原生冷转换入口本次未重复，完整转换使用同一导入器独立执行。首轮原生QA仅因缓存标题断言写死而失败，证据保留。源说明、档案成员路径、哈希和能力信息随地图包保存，临时资源包不入库。


### 本批集成结论：滚轮、地图层级与自定义地图

范围 a8ff432、9ddbdda、d67cb8f、0e974f7、48090bb；前端和原生Release仅构建一次。Rust输入桥 `cargo test -p mengine-script --release --lib script_reads_world_and_input_edges_and_reports_failed_ticks` 1通过／0失败；首次遗漏 --lib 的命令触发无关QuickJS集成配置错误，修正后通过。EXE SHA256 6839481621593ca37119e6b0461695713e0f657ebb7d926195baacc373dce13c。

滚轮主窗口／分离窗口和源距离边界通过（B001/map-session-1792807989852.json的已完成子检查）；层级单独复测B001/map-session-1792808154384.json整体通过、0error，覆盖折叠／展开、隐藏子节点、左右键、Ctrl+A／菜单全选／Shift范围、搜索后双击／空格聚焦、重载和Stop恢复。虚拟列表QA在展开后先清空再选择目标，以触发选中滚动；不依赖同一已选项的重复选择。DotA转换及原生缓存菜单见第七十八阶段；WarChasers已通过转换，未追加原生菜单重复验证。

无转换／构建并发的5秒多窗口采样B001/map-session-1792808229345.json通过、0error、正常退出，Pause／Step、分离窗口快捷键、Stop及后续实体ID／undo／redo通过。Scene24.88／Game28.10次呈现每秒，平均间隔40.19／35.59ms，P95 67.0／49.2ms；原生渲染11.98／14.08ms，前端paint加权17.65／2.47ms，完整回退均0。摘要 tmp/docs-artifacts/editor-performance-risk/grouped-detached-native-summary.json。采样时间和系统负载有限，不据此声称稳定满帧或整体性能收益。

八叉树已参与相机和阴影视锥查询：2746渲染对象，Scene相机137／阴影602／实际提交607，Game相机82／阴影559／提交561。没有增加新LOD；阴影对象多于相机可见物有独立光源视锥依据，不能直接按相机列表删除。持续60FPS仍待解决：跨窗口世界发布33ms上限及Scene前端准备／绘制是下一步重点，需分别测量后优化。隐藏页签0刷新与连续相机／尺寸呈现已由上一批验证。本批正常功能集成已覆盖上述范围，长期内存／真实输入延迟／独立运行窗口滚轮／完整DotA玩法保持待测或未实现状态，不重跑无关全库测试。


### 第七十九阶段／新批次任务1/3：浏览器八叉树增量更新

Scene前端每帧计算对象包围盒并更新viewportSpatial；此前任一包围盒变化都会复制全部边界并重建八叉树。现在保持固定空间分区，对分区内变化只更新精确边界，跨分区对象移到能够完整包含它的最深已有节点；无边界项继续保守保留。长度变化、对象超出整体范围或节点迁入数量比建树时增加超过32项时重建，避免迁移持续堆积成线性列表。根区域留5%余量吸收边缘动画，最终查询仍逐项使用精确对象边界，不改变可见性判定，也不改变原生渲染或模拟。

6项定向测试和TypeScript通过：动态包围盒、跨区移动、未知／已知切换、重排、增删、聚集、原地修改、空场景与线性穷举结果一致，所有索引恰好出现一次；同时检查小幅动画不会为了重新建树反复读取静态边界。局部7400项／300动画索引、30帧预热＋120帧测量，索引更新加查询平均3.282→1.837ms，P95 5.006→2.219ms。该结果仅为本地空间索引样本，不能作为真实Scene帧率提升；脚本和汇总在tmp/docs-artifacts/editor-performance-risk/spatial-animation-bench.mjs、spatial-incremental-summary.json，测试与类型检查日志同目录。

本项代码与测试为packages/editor/src/viewportSpatial.ts及tests/viewportSpatial.test.mjs。当前1/3，待累计3项后统一构建和原生采样：覆盖Amazonia与DotA的持续动画、Scene移动／旋转、选择和框选、显隐、资源热加载、地图切换；检查拾取不漏项、Scene paint及呈现间隔。当前不重跑全库／原生QA，不将局部计时写成稳定满帧。


### 第八十阶段／新批次任务2/3：已显示帧世界包围盒复用

Viewport的原生帧拥有固定实体记录，worldTransform已有父变换身份缓存。空间剔除现在进一步按固定世界变换与模型局部边界身份复用world AABB；模型加载／热替换、动画网格切换、父变换变化分别使用新边界或新变换重新计算。缓存为WeakMap，不按实体ID跨项目复用；编辑态可变浏览器数据继续直接计算。未加载模型的立方体局部边界作为固定对象复用，仍在实际模型到达时失效；选择、粒子与轨迹保守不剔除规则保持不变。

相关7项空间检查与TypeScript通过，包含固定输入重复读取、移动后的新变换、模型边界替换、旧帧读取、非法变换和编辑态原地修改。局部4746网格／200变化变换、30帧预热＋120帧测量，仅world AABB转换平均1.054→0.380ms，P95 2.573→0.439ms，结果校验和一致。脚本／摘要在tmp/docs-artifacts/editor-performance-risk/spatial-owned-bounds-bench.mjs和spatial-owned-bounds-summary.json。此样本不代表完整渲染或FPS；没有重复原生构建。

变更：viewportSpatial、Viewport及viewportSpatial.test。当前2/3，待第三项后与第七十九阶段统一验证Scene动画与相机交互、父节点移动、资源热加载、选择／框选、显隐和Stop／地图切换；观察实际paint与呈现间隔，不把待测项写成通过。


### 第八十一阶段／新批次任务3/3：独立运行视口发布节奏

主窗口运行时，存在心跳有效的独立Scene或Game接收窗口，常规世界发布最短间隔改为16ms，与60Hz模拟完成节奏匹配；发布仍由完成通知触发，只保留一个计时器并在发送时读取最新世界。编辑／暂停、普通属性窗口及失效视口保持33ms合并。立即同步、选择顺序、会话／版本验证及接收端10Hz属性刷新边界保持不变，不增加空闲轮询。

19项实际App同步处理器与Store测试、TypeScript通过：16ms模拟输入960ms内向活跃视口发送60个世界，停止完成通知后不继续发送；1ms密集通知合并为一个最新版本，暂停及视口心跳失效恢复33ms。日志tmp/docs-artifacts/editor-performance-risk/viewport-cadence-tests.log和viewport-cadence-types.log。该检查证明调度上限解除，不保证实际FPS；更频繁的增量收发可能增加主线程负载，须用原生采样判断。

累计99498c9、76c5e1e及本项达到3/3，开始合并构建与原生验证。主工作区另有并发Unity包／粒子改动，本批复用干净验证worktree，仅构建本批已提交版本。合并检查多窗口Play／Pause／Step／Stop、Inspector编辑与重开、Scene选择／旋转／尺寸／隐藏、模型热加载及运行世界一致性，报告FPS和浏览器paint，逐项保留未覆盖范围。


### Unitypackage 导入批次：任务 1/3，导入基础

新增 mengine-unity-import 分析/导入 API 与 CLI、固定版本和 SHA256 校验的 FBX2glTF 准备脚本。校验包指纹、GUID/fileID、路径和依赖后，在独立目录暂存并发布；保存源文件、Unity meta、对象映射及产物哈希。重复导入检查实际内容，已有冲突保持不动。Prefab 变换反射 Z 轴，粒子明确记录 Unity 坐标及 sharedMesh 来源；转换 GLB 保持原件，源纹理色彩空间和每轴采样设置写入粒子数据。

必要检查：`cargo test -p mengine-unity-import --lib` 15 通过／0 失败。真实包转换：53 资产、15 节点、11 粒子系统、4 模型、9 运行材质，无缺失运行依赖。FBX 与现有 Unity Editor Mesh 比对，位置/UV/法线误差小于 1.1e-7，Color32 量化后顶点色误差小于 3e-8。17 张实际绑定纹理均双线性且无 mipmap，采样包含 Repeat、Clamp 和混合轴。预览关闭源雾，保留非运行依赖诊断。

证据：`tmp/docs-artifacts/unity-import-samplers/`、`tmp/docs-artifacts/unity-import-inspect/mesh-attribute-fidelity.json`。桌面菜单、模型/材质/Prefab 回归、停止重播、父级变换和渲染在三项任务完成后合并验证。导入通过不代表播放或视觉对照通过。

### 第八十二阶段：偏移网格鼠标选取修复（本批回归修复）

真实原生模型热更新复现中，模型从视口外移入后画面正确，但鼠标选取区域仍以Transform原点为中心。导入网格现在按可见三角形的投影边界确定选取中心；通过空间视锥的网格不再因为原点在相机后面而跳过选取准备。原生延迟选取和浏览器预览使用同一边界语义。

变更math3d.ts、Viewport.tsx及nativeSceneMeshSelection.test.mjs；新增scripts/qa-viewport-spatial-picking.mjs，覆盖资源热替换、父节点位移和原点位于相机后的实际Scene画布选取，失败画面与诊断写入tmp/docs-artifacts/testing-batches/B001。12项相关投影／选取缓存测试通过，日志editor-performance-risk/offset-mesh-picking-tests.log；原生修复验证待构建。此项属于第七十九至八十一阶段集成发现的修复，仅重测受影响选取及本批尚未执行范围。


### Unitypackage 导入批次：任务 2/3，粒子运行时与世界空间渲染

新增版本化 `.mparticle`、ParticleEmitter3D.definition、确定性模拟和世界空间 Mesh/Billboard/Stretch 绘制，旧粒子保持原路径。源 Hermite 曲线、Burst、CustomData、局部/世界空间、完整层级矩阵和序列帧进入模拟。Unity 模式按 20ms 固定步长处理，CustomData 使用前一步年龄；粒子颜色按 Unity Color32/Linear 规则转换。Mesh 读取 sharedMesh 原始几何，保留所有 primitive，修正 X、UV V 和顶点色量化。Billboard Euler、旋转方向、Stretch U 轴及端点锚定来自现有 Editor 的 BakeMesh 数据。

VFX 适配器以共享 WGSL 和参数数据实现本包启用的主纹理、遮罩、扰动、副贴图和溶解；保留各纹理采样、CustomData 通道、HDR、Alpha、双面、Less 深度与关闭深度写入。透明排序读取源 sortingFudge，材质共享独立于单个发射器重播的时钟；定义和网格修改会刷新缓存。非层级缩放模式和未覆盖的启用模块明确诊断，未知 Shader/关键字标为近似。

必要检查：粒子运行时 13/13、资产解析 3/3、WGSL/GPU 2/2 通过。GPU 实测覆盖顶点色×粒子色、Alpha、CustomData、透明排序偏移及普通网格深度遮挡；运行时覆盖首帧 seek、停止/重播、父级非激活、变换、曲线、生命周期、多个 primitive 与 UV。真实技能已生成生命周期帧，最终视觉与桌面交互在第 3 项后统一验证。证据写入 `tmp/docs-artifacts/unitypackage/`。

### 第七十九至八十二阶段集成结论

实现提交99498c9、76c5e1e、9d275fc及选取修复66a2739已推送。隔离工作区完成前端TypeScript/Vite及原生Release构建；修复版EXE SHA256为4a46e8ecba81e5aae64519876d1a03981ca4cee9c83fa3c28074070e0751d1f9，仅含本批编辑器变更，不含并发Unity导入／粒子改动。前期7项空间、19项同步检查与本次12项投影／缓存测试通过，未执行整库测试。

多窗口报告B001/map-session-1792809672118.json通过：Inspector编辑／恢复、独立Game重开、版本追赶、Pause／Step／快捷键、Stop作者数据恢复及后续undo／redo，0error且正常退出。5秒样本Scene41.37／Game51.00FPS，平均呈现间隔24.17／19.61ms，P95 40.0／30.7ms；Scene浏览器paint加权10.32ms。上一份相同QA样本24.88／28.10FPS；短时独立采样受系统负载影响，不能作为严格A/B或稳定60保证。

修复版B001/map-session-1792810463601.json整体通过、0error、正常退出。连续相机变化13帧；隐藏Scene原生0帧、浏览器0次绘制；恢复30帧，实际拖动分隔条调整尺寸。原始特效资源修改／恢复像素一致；运行中父节点Inspector变换、原生步进与三层动画、双击／Space聚焦、树显隐／展开／选择、地图重载、Stop恢复通过。单Game连续采样10.01秒，保留最近240个原生帧间隔平均16.645ms（60.08FPS）、P95 26.3ms；浏览器平均帧间隔17.18ms、paint3.35ms。原生保留窗口不是全部10秒帧统计，不外推为全程稳定满帧。

原生选取报告B001/spatial-picking-1792810589579.json整体通过、0error、正常退出：模型热更新后画布选取、父节点移动后选取、物体原点位于相机后方但几何可见时的选取均通过。脚本保存自有临时场景后关闭，并在退出失败时将报告标记失败。测试窗口均独立，未关闭用户编辑器；WebView缓存EPERM按规则保留。

本批未覆盖：长时间内存趋势、物理鼠标输入端到端延迟、DotA持续运行性能、3D精确框选及独立Player。已实现八叉树增量与世界边界缓存，未添加LOD；多窗口稳定60FPS和完整DotA脚本／玩法仍未完成。原始日志／图片留在tmp/docs-artifacts/editor-performance-risk/与testing-batches/B001。


Unitypackage 同任务收尾补充：导入器 1.3.0 将原始资产移至工程级 `SourceAssets/UnityPackages/`，暂存目录也置于 Assets 外，采用两目录发布与本次文件回滚。所有运行资产生成独立 MEngine JSON meta，纳入 manifest；20 项导入测试通过。真实注册表连续重建两次，49 个原生 GUID 与 Unity GUID 无重叠，sidecar 字节不变，再次导入复用成功；清单为 runtime 97 项及 source 163 项。证据 `tmp/docs-artifacts/unity-import-v1-3-metadata/`。材质顶点流按实际序列解码并校验，不匹配的 CustomData 排布阻断。寿命精确端点浮点残留补充测试 1/1 通过；未知 Shader 显示紫色棋盘预览。以上均为前两任务补充，不增加批次计数。

### 第八十三阶段／新批次任务1/3：显示帧层级激活索引复用

原生显示帧现在复用层级激活索引：实体顺序、ID、父节点及启用状态相同时，Transform或其他组件动画不重新建立索引和遍历祖先。只接入拥有固定实体记录的显示帧；作者态可变查询保留原行为。层级变化时生成只含ID／parent／active的索引记录，旧显示帧查询不会被新帧污染，也不会额外保留整份旧组件数据。

变更packages/editor/src/hierarchyActivation.ts、nativeViewportPresentation.ts及对应两份测试。17项定向检查和TypeScript通过，覆盖原生delta复用、父节点显隐／重挂、重复ID顺序、缺失父节点、循环、增删与旧帧回读；日志tmp/docs-artifacts/editor-performance-risk/owned-activation-tests.log和owned-activation-types.log。

局部7434实体／每帧200个组件变换更新，3组交替先后顺序、每组30帧预热＋120帧测量，完整显示数据准备（含世界变换、条目、overlay分类）均值2.242→1.403ms；每组结果校验和一致。三组P95分别3.637／3.965／3.974→1.537／2.021／2.441ms。此数据仅证明局部准备成本，不作为原生FPS或稳定满帧结论；脚本及摘要owned-activation-bench.mjs／json留在上述本地目录。

当前1/3；累计三项后统一构建与原生验证。待测Amazonia／DotA持续动画、Scene显隐与层级编辑、地图切换、独立窗口、旧帧呈现及Stop恢复，观察Scene paint和呈现间隔。频繁改变层级仍重建索引，需在后续原生样本中检查其峰值；本项不重跑整库或原生QA。


### Unitypackage 导入批次：任务 3/3，桌面入口与预览 sample

桌面 Assets 菜单增加 Unity Package 分析/导入，支持文件选择或直接输入路径，锁定目标工程并校验指纹，完成后统一刷新和定位结果。组件目录和 Inspector 增加 `.mparticle` 资产引用；Project 双击定义打开带 revision/工程守卫的 JSON 编辑器。资产重命名引用扫描与 Player 打包追踪定义、模型及材质纹理。构建 SDK 部署固定转换器与许可。

`samples/unity-package-preview` 提供中性 3D 场景、HUD、播放/停止/重播、相机环绕/缩放及背景切换。`prepare-preview.mjs` 将已有导入复制到忽略的 LocalPreview 工程，保留独立源资产目录；专有特效不入 Git。增加 native QA 脚本与 GPU 截图示例，所有产物写入 tmp/docs-artifacts。

快速检查：前端 production build、Tauri cargo check 通过；导入模型与 Player 依赖检查 7/7 通过。三项任务已齐，统一原生验证正在执行：真实指定路径的分析/导入、刷新后复导、Prefab 实例化、播放与 X/R、相机、JSON 参数保存/非法拒绝、保存重开和控制台检查。GPU/Unity 同条件对照另行记录；不将成功播放计为视觉还原通过。

### 第八十四阶段／新批次任务2/3：显示帧包围盒来源复用

Viewport的包围盒准备提取到viewportEntityBounds：固定显示帧按components对象身份复用组件分类、模型路径判断及精灵局部范围，避免每帧对所有实体重复检查22种保守组件。模型预览仍每次读取，模型到达、热替换、卸载或路径变化立即重新选择局部范围；世界变换变化使用现有world AABB失效规则。作者态可变数据直接重新分类和计算。选中实体、粒子与轨迹继续保守纳入，不改变八叉树查询或模拟。

变更packages/editor/src/viewportEntityBounds.ts、panels/Viewport.tsx及tests/viewportEntityBounds.test.mjs。6项定向测试与TypeScript通过，覆盖模型加载／替换／卸载、非法几何、父变换、精灵偏心／负缩放、编辑态原地修改、全部22种保守组件，以及实际Viewport提交空间索引时的选择与显示帧边界。日志tmp/docs-artifacts/editor-performance-risk/entity-bounds-tests.log、entity-bounds-types.log。

7434实体（4746模型、354精灵、100灯光）、每帧200模型组件／变换变化，3组交替先后顺序、30帧预热＋120帧测量，包围盒准备均值1.401→0.687ms；结果校验和一致。三组P95分别2.325／2.218／1.398→0.793／0.915／0.774ms。仅为局部准备计时，不代表整个Scene帧率；脚本／摘要entity-bounds-bench.mjs／json留在上述本地目录。

本批累计e1ac036及本项为2/3，原生构建和集成继续合并到第三项后。待测同一集成版本上的模型热更新选取、父变换、Scene隐藏／恢复、Amazonia与DotA持续动画、地图切换、多窗口以及Stop恢复；不追加整库测试。

### 第八十五阶段／新批次任务3/3：八叉树固定输入与平面检查

空间索引为固定显示帧保留输入包围盒身份，跳过未变化对象的逐坐标比较；编辑态默认继续复制边界并比较坐标，模式切换会清除身份缓存。视锥平面检查直接计算正顶点距离，移除每个对象／平面的临时三维数组；保留边界容差和非有限数据的保守行为。树分区、迁移、重建和结果顺序保持原规则。

变更viewportSpatial、Viewport及对应空间／包围盒测试。16项相关检查和TypeScript通过，覆盖固定输入不重复读取、坐标模式切换、迁移、未知范围、重排、增删、整体越界、聚集重建、旧帧回读，以及八角点独立几何判定和非有限数据。日志tmp/docs-artifacts/editor-performance-risk/owned-index-tests.log、owned-index-types.log。

7400范围／300变化项的3组局部样本，更新加查询均值1.975→0.297ms，3组校验和一致；三组P95分别3.171／3.276／2.605→0.381／0.480／0.557ms。脚本与摘要owned-index-bench.mjs／json留在上述本地目录；局部数据不代表整体FPS。

本批e1ac036、e484572及本项达到3/3，统一构建和原生验证开始。复用隔离工作区，仅纳入本批生产文件；检查Amazonia持续帧、Scene尺寸／旋转／隐藏、模型热更新选取、父变换、层级显隐、地图切换、多窗口和Stop，补充DotA场景持续采样，区分实际场景性能与完整脚本玩法。

### Unitypackage 导入批次：集成验证结论

实现范围为提交 9349e60、f1fb4aa、dcf9bd1、4ecf99b 及本次同任务收尾。导入器 1.4.0 按 Shader 和 6 个项目 HLSL 的原始字节签名选择适配器，相同内容更换 GUID 仍复用；修改或缺失任一已核验源码则降为近似。原包及 5 个变体均完成真实导入和无转换器重复导入校验，证据为 `tmp/docs-artifacts/unity-import-shader-signature/verification.json`。包外 URP 版本保持未核验，适配基线为本地参考工程 14.0.11。

收尾修复非循环连续发射在 duration 终点多生粒子、预览首次绘制丢失已推进时间及 HUD 根布局。预览脚本显式传递采样时间与重播代次，隐藏窗口或跳过中间显示帧也能清空和重播；世界空间粒子重播后重新捕获出生变换；残余步已显示粒子的出生矩阵保留至完整步提交，覆盖暂停父移动、倒退及 rate/Burst 混合发射。定向检查通过：导入 24、粒子定义 3、导入粒子运行时 17、视口时钟 2、粒子 GPU 2、前端导入及依赖 7；常规材质 13、Prefab 2、旧粒子 6、普通排序及材质管线状态各 1 通过。前端 production build、sample 实际 TypeScript 消费编译通过。原始日志保存在 `tmp/docs-artifacts/unitypackage/`。

最终 Windows 原生报告 `tmp/docs-artifacts/unity-import/native-1792812257761/report.json` 通过：真实指定包的路径分析/导入、资产刷新后复导、错误指纹和过期工程拒绝、定义资产引用、JSON 非法拒写/合法保存、Prefab 实例化、相机和背景、停止/重播及保存关闭重开。原生 readback 的首次播放对象数 40、清空 0、重播 38、3 秒结束 0；Shader 拒绝 0，Console 错误 0。截图中效果可见、HUD 无重叠。自有测试实例隐藏且正常退出，原用户 Editor 保持运行。系统文件选择器未执行；路径输入入口实际执行。

本次原生编译和链接完成，最终复制到被运行进程占用的 target/debug EXE 时失败；已从新链接的 deps 产物复制到独立 `tmp/docs-artifacts/unitypackage/native-bin-verified/mengine-editor-tauri.exe` 并完成上述 QA，SHA256 为 `7a37c652041512872de1ba5fe04516e3b18098fb618a0e8b2e7ef0d641e6a31a`。修复版播放复测报告为 `tmp/docs-artifacts/unity-import/native-1792812650675/report.json`，首次播放/清空/重播/结束对象数仍为 40/0/38/0，保存重开通过，错误 0；导入和 UI 检查复用前述完整报告。残余步出生回归证据为 `tmp/docs-artifacts/unitypackage/residual-birth-verification.md`。这是开发构建验收，正式 SDK/安装包的转换器资源分发尚未验收。

结果分列：**导入成功、播放通过、视觉对照待验收**。结构为 53 资源、15 Prefab 节点、11 粒子系统、4 模型和 9 运行材质，运行依赖已解析。相同相机、背景、Linear 处理及材质动画时间下，Unity 和 MEngine 均采样 0.1/0.3/0.6/1/1.5/3 秒；MEngine 绘制数为 13/17/19/28/10/0。0.6 秒所有粒子系统计数与 Unity 一致，精确寿命端点采用明确浮点容差；部分帧仍有粒子分布、环形纹理和消散外观差异，不能判为视觉还原通过。无雾、无曝光后处理；不保证与 Unity 相同随机序列。对照位于 `tmp/docs-artifacts/unitypackage/unity-reference/`、`mengine-reference-complete/`，逐系统计数位于 `particle-count-comparison.tsv`。

可直接打开 `samples/unity-package-preview/LocalPreview/project.json` 实验本次导入；其中专有美术资产和 SourceAssets 仅保留本地。长期维护的空 sample、导入工具及说明纳入提交。本批集成执行完成，剩余视觉差异和正式分发验收保持待测，不计作通过。

### 第八十三至八十五阶段集成结论

实现e1ac036、e484572、2c0cae6已推送；固定层级激活、包围盒来源、空间索引／平面检查各自局部收益及必要检查见上述记录。隔离验证de5eacf只复制本批5份生产文件，前端／TypeScript与原生Release构建通过；EXE SHA256 2fc9a3fdda01da25a45725b67f65466171e8126c0e87cadcd0c03cc115f9e5bb。全部以下最终报告使用该生产版本，不包含临时诊断插桩或并发Unity导入变更。

B001/spatial-picking-1792811986575.json通过、0error、正常退出：模型热替换、父节点移动、原点在相机后而网格可见时的真实画布选取。B001/map-session-1792812060449.json通过、0error、正常退出：持续相机变化16帧，隐藏Scene原生／浏览器均0，恢复37帧；实际分隔条尺寸变化、原始特效修改／恢复、父变换、步进／三层动画、层级选择／显隐／双击／Space、地图重载及Stop作者数据恢复通过。单Game10秒采样的最近240个原生间隔均值16.721ms（59.80FPS）、P95 26.5ms，浏览器平均paint2.07ms。

多窗口初测1792812163907及1792812355572未通过：固定等待后独立Game没有新原生样本，浏览器回退仍绘制；不能计为通过。只读复核与定向诊断未确认生产根因，关闭缓冲池复用仍复现；诊断构建及失败记录保留在本地产物。QA现在清空重开前采样，等待当前地图的真实原生帧后再计时，最多30秒，并记录整个准备等待；失败时保留独立Game的语义状态与窗口截图。临时插桩已从隔离源码移除。

最终B001/map-session-1792813730795.json功能整体通过、0error、正常退出，覆盖Inspector双向编辑、独立Game重开、版本追赶、Pause／Step／独立快捷键、Stop、undo／redo和回停靠。采样前准备等待16.812秒，因此独立窗口首帧停顿仍列待修，不能用这次功能通过认定启动性能正常。随后5秒样本Scene26.87／Game33.46FPS，平均间隔37.21／29.88ms，P95 116.0／72.5ms；浏览器平均paint13.52／2.85ms，原生render19.74／24.18ms。不同短时样本波动明显，本批仅确认局部准备成本减少，未证明整体稳定满帧或多窗口FPS提升。

真实DotA_v6.83d.w3x的缓存菜单与持续运行报告B001/arbitrary-map-1792813844205.json通过、0error、正常退出，14437实体，缓存进入2.652秒。新--profile-map在Game／Scene分别预热1秒后记录5秒无Agent轮询窗口：Game最近240个原生间隔均值17.091ms（58.51FPS）、P95 23.7ms、浏览器paint3.13ms；Scene143个间隔均值34.757ms（28.77FPS）、P95 57.5ms、paint17.71ms。Scene为距离150的全图视角，含选中Camera的预览，浏览器drawItems10723；图像确认实际地图和原始模型呈现。此结果不代表完整JASS／DotA玩法已接入。

本批必要功能集成完成。继续待办：独立Game重开后首帧约17秒等待的原生／共享交付阶段定位，多窗口持续帧率，DotA全图Scene绘制与相机预览成本，长期内存与真实输入延迟。QA窗口均正常退出，WebView缓存EPERM保留；用户编辑器未关闭。日志／图片／JSON位于tmp/docs-artifacts/editor-performance-risk/及testing-batches/B001，没有提交原始产物。

### 第八十六阶段／新批次任务1/3：原生Game首帧期间避免重复网格准备

桌面Game尚未得到原生图像、且原生渲染尚未报告失败时，不再建立浏览器世界网格条目、计算模型包围盒和启动网格预览加载；Canvas UI与原生请求调度继续运行。已有完整图像仍使用原生路径；原生失败后恢复浏览器网格回退，浏览器平台与Scene保持现有流程。

变更Viewport及nativeGamePending.test。8项首帧／包围盒定向检查、TypeScript通过：待原生图像时不读取网格来源，原生失败与浏览器Game仍绘制，Scene不受影响，完成帧保留Spine浏览器覆盖。日志tmp/docs-artifacts/editor-performance-risk/game-pending-tests.log、game-pending-types.log。

独立Game重开停顿的阶段探针已运行，报告B001/map-session-1792814341838.json。该次采样准备等待7.531秒；部分原生重开请求提交／回读／交付在几十毫秒完成，首轮提交约0.9秒，尚不足以确认全部等待的根因。诊断插桩仅在隔离工作区使用，不进入提交。此项减少明确存在的双路网格工作；不据此宣称约17秒等待已修复。

当前1/3。因已有独立窗口首帧停顿，按已知故障最小复现例外及时执行相同重开路径的原生对照，仅测首帧、独立窗口原生连续帧与相关Stop，不重跑已通过的地图全套／导入／选取QA。更广集成仍累计三项后合并。

### 第八十六阶段已知故障定向验证

实现45c5372已推送；隔离验证0601e1c完成前端与原生Release构建，EXE SHA256 0dc7ddab11391c545a32def2f4496f634d3de4c88be7ea7e1ad6f9da18ce81a7。8项定向检查、TypeScript与独立只读调用链复核通过：Canvas UI独立于worldEntries布局和命中；浏览器Game、Scene、原生失败回退及已完成帧的Spine覆盖保留。

新版本B001/map-session-1792814953803.json与旧生产版本2c0cae6的B001/map-session-1792815055089.json均执行相同--detached-profile-only路径，0error、正常退出。新版本采样前额外等待319ms即有17个当前地图原生样本；旧版本额外等待6.401秒才有2个样本。等待统计起点在已有固定2.5秒窗口启动等候和内存采样之后，不是从点击重开的完整延迟。单组顺序对照会受缓存与系统负载影响，不作稳定启动保证。

新版本5秒多窗口样本Scene53.32／Game55.53FPS，平均间隔18.75／18.01ms，P95 32.3／29.1ms，浏览器paint7.75／2.21ms；旧版本50.28／51.30FPS，paint8.00／2.21ms。原生帧、窗口重开、版本追赶、Pause／Step／快捷键、Stop与后续undo／redo通过，未重复执行本批无关的地图导入或资源选取测试。

此项确认减少首帧期间的重复浏览器网格准备，局部对照等待改善。阶段探针还观察到首次Game renderer初始化约8秒、过期运行修订回退等独立成本；本次未证明所有约17秒等待都由重复准备造成。冷初始化、过期快照回退和跨窗口交付仍保留待定位项，多窗口稳定60FPS未达成。原始诊断日志部分并发输出行交错，仅使用完整关联记录；临时前后端探针已移除，未进入生产提交。当前批次仍1/3，其余集成按三项合并。

### 第八十七阶段／新批次任务2/3：Game过期运行版本的有界重试

Game复用Scene的运行版本过期策略：Play期间前两次过期请求释放槽位并等待16ms后重取当前世界，不立即构造和上传旧版本完整快照；持续过期仍回退到该请求拥有的精确快照。暂停及显式截图保持精确回退；工程、session或请求代次失效时不再准备快照。成功发布后清空重试预算，Profiler记录本次累计延后次数。

变更Viewport、nativeGameCompletionScheduling及nativeViewportRequests测试。54项定向请求／传输／Game调度检查与TypeScript通过，覆盖瞬时／持续过期、暂停、截图冻结、失效所有权、并发容量、乱序完成、原生错误与精确快照。测试夹具补齐当前可见性上下文，Scene所有权断言同步当前presentation key及相机分支。日志tmp/docs-artifacts/editor-performance-risk/game-revision-tests.log和game-revision-types.log。

当前45c5372及本项为2/3。原生构建及多窗口Play／Pause／Step／Stop、重开、原生版本追赶和截图一致性待第三项后合并验证；尚无本项原生帧率或启动延迟结论。持续失配仍可能上传完整地图，保留快照回退是有界重试的保底行为。

### 第八十八阶段／新批次任务3/3：视口绘制条目直接收集

可见实体直接写入绘制条目数组，避免每个候选创建临时数组再flatMap合并及冗余filter。MeshRenderer实体跳过不影响其可见性／编辑器标记的灯光名称和碰撞体分类；保留投影、3D／2D／编辑器排序、特效独立条目和偏心网格选取候选。

变更Viewport及viewportDrawPreparation测试。4项实际代码块定向检查与TypeScript通过，覆盖投影外原点的网格、相机／灯光／碰撞体／Tilemap、不同图层的trail／particle／Spine、缺少Game相机及原生Game覆盖。10723候选、10745条目的3组交替先后局部样本，每组40次预热与160次测量，包含排序的准备均值2.537→1.665ms；三组P95为3.053／2.833／3.335→2.107／1.895／2.370ms。旧新实际代码结果逐项一致，所有样本校验和相同。日志和脚本位于tmp/docs-artifacts/editor-performance-risk/draw-preparation-*；局部收益不直接代表整个视口FPS。

本批45c5372、dbd6726及本项达到3/3，统一隔离生产构建及原生验证。范围合并为多窗口重开与版本追赶、Play／Pause／Step／Stop、原生截图、偏心网格／父变换／资源热替换选取，并复测实际DotA全图Scene持续采样。复用已经通过且不受改动影响的导入、地图菜单和层级功能结果。

### 第八十六至八十八阶段合并验证

实现45c5372、dbd6726、db6e418均已提交推送。102项相关定向检查通过；隔离验证43f49c8以0601e1c为基础，只接入后两项生产Viewport差异，前端与原生Release构建通过。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-db6e418/mengine-editor-tauri.exe，SHA256 100de6ddd608d231cfe363f96959fe39ce8e407a52953f32cb11786e397d88ab。未纳入共享工作区并行Unity导入／粒子改动，不代表整个共享HEAD的完整构建。

同一EXE的三份报告全部通过、0控制台error、正常退出：B001/spatial-picking-1792816005183.json覆盖模型热更新、父变换及原点在相机后方的可见网格选取；map-session-1792816039577.json覆盖独立Game重开与版本追赶、多窗口Scene／Game、Pause／Step／快捷键／截图、Stop、后续undo／redo及回停靠；arbitrary-map-1792816112092.json使用实际DotA_v6.83d.w3x、14437实体，验证缓存加载及Game／Scene持续原生采样。选取、Game和Scene图像已检查。

多窗口采样前额外等待318ms有18个当前地图Game原生样本，统计仍在固定2.5秒启动等候和内存采样之后。5秒样本最近240个原生间隔：Scene18.751ms／53.33FPS、P95 34.8ms；Game17.817ms／56.13FPS、P95 28.2ms。浏览器paint均值7.61／2.25ms；前一生产样本53.32／55.53FPS、paint7.75／2.21ms。此轮未出现初测约17秒等待，但不证明全部冷初始化停顿已消除。保留的Game稳定窗口没有过期延后或完整快照回退，不能从该窗口单独估算重试改动收益；其边界由定向测试覆盖。

DotA缓存进入2.271秒；Game5秒采样最近240个原生间隔16.742ms／59.73FPS、P95 22.2ms、浏览器paint3.00ms；全图Scene151个间隔32.925ms／30.37FPS、P95 55.1ms、paint16.74ms，drawItems10723，仍显示选中Camera预览。此前样本Game58.51／Scene28.77FPS、paint3.13／17.71ms；顺序短样本受缓存与系统负载影响，不将所有FPS差异归因于本批优化。

本批相关集成完成，未重跑无关的全库、地图转换或层级测试。用户编辑器未关闭；QA编辑器正常退出，WebView缓存因EPERM保留。原始证据在tmp/docs-artifacts/testing-batches/B001/及editor-performance-risk/draw-batch-*。继续待办：多窗口稳定60FPS、DotA全图Scene和Camera预览成本、首次renderer冷初始化、长期内存与真实输入延迟；LOD及完整DotA JASS玩法仍未实现。

### 第八十九阶段／新批次任务1/3：不透明Scene图像下的覆盖绘制省略

原生Scene原始帧附带opaquePixels：逐个检查最终RGBA的alpha，仅完整图像全部为255时置true。检查只用于Scene主视图，Game、相机预览及PNG截图不扫描；超过16MiB的图像保守置false以限制CPU开销。前端把标记与实际接受的原生Scene图像一起保存，true时省略随后被整幅原生图像覆盖的浏览器背景／初次网格及空节点圆点，命中区位置和顺序保留。透明像素、缺少标记、超预算图像及浏览器回退保留完整绘制。

变更native_viewport_transport、Tauri响应、nativeViewportFrame、Viewport和对应测试。17项前端帧／背景／节点命中定向检查、TypeScript通过；从生产源码提取实际Rust检查函数和其单测，rustc优化测试1/1通过。覆盖任一位置的半透明alpha、不完整／空RGBA、扫描预算、严格布尔及旧帧、图像覆盖时仍可选取。扫描局部均值850×507为0.106ms、1280×720为0.228ms；4096×4096跳过检查，不增加整幅alpha扫描。证据tmp/docs-artifacts/editor-performance-risk/scene-underlay-*及scene-opacity-*。

改动前临时分段诊断arbitrary-map-1792816702380得到23个DotA全图样本，浏览器paint均值16.674ms：请求0.357、背景0.835、世界准备1.765、空间索引2.674、绘制条目3.426、世界绘制4.361、原生合成0.243、辅助层0.526、UI2.365、收尾0.030ms。首次采集因console查询limit400超上限而失败，修正为300后完成；QA均正常退出。临时插桩已从隔离源码移除，脚本及原始日志留在tmp/docs-artifacts，未进入提交。

当前1/3，Tauri完整编译及同一生产版本上的不透明／透明Scene、选取、尺寸变化、Game／相机预览、多窗口和DotA持续帧率待第三项合并验证。本项尚无生产FPS结论。继续优先优化实际绘制条目和原生网格命中准备；不重跑无关地图导入和全库检查。

### 第九十阶段／新批次任务2/3：不透明Scene按需准备整批命中数据

不透明原生Scene每帧只为选中对象准备辅助绘制条目，不再为整幅视图的浏览器覆盖层逐实体投影、排序和重放绘制。普通对象点击通过UI／Gizmo优先判断后，才用该显示帧的实体、相机、资源及原顺序生成完整命中候选；使用独立1×1画布复用几何命中算法，结果只缓存到当前绘制所有者。候选位于后绘制的辅助层命中之前，保持等距离时的既有选择顺序。透明帧、浏览器和Game仍立即绘制。

Spine在不透明Scene的可见覆盖层推进动画，命中重放跳过Spine绘制；透明路径保留原推进位置。两条路径每次只推进一次。空间索引、UI、相机／灯光标记、选中碰撞体与操控柄仍每帧更新。Profiler的浏览器drawItems反映现在实际准备的选中辅助条目；原生对象数量继续读取native counts，不把drawItems减少解读为地图对象丢失。

变更Viewport、nativeSceneHitCollection及现有绘制／命中测试。23项针对性检查、TypeScript通过：整批准备在点击前为0、同一所有者只准备一次、替换及失败后重试、独立画布状态恢复、UI／Gizmo优先、等距顺序、不可选对象、旧帧相机／尺寸、模型加载／热替换、镜像与近裁剪，以及Spine推进一致性。日志tmp/docs-artifacts/editor-performance-risk/deferred-scene-hits-tests.log与deferred-scene-hits-types.log。

当前28c3aa0及本项为2/3。生产原生构建与不透明／透明Scene、空节点／模型／碰撞体点击、资源热更新、首次点击耗时、Spine、截图、多窗口及实际DotA持续帧率待第三项合并。首次普通对象点击承担此前每帧准备的工作，实际输入延迟尚未验证；不将定向算法检查或候选减少直接作为原生性能验收。

### 第九十一阶段／新批次任务3/3：多Canvas Scene共享布局与所属索引

layoutUiScene3D每次调用只生成一次屏幕布局，按当前Canvas所属关系分组，避免每个Canvas重新布局全体UI并遍历全部结果。分组在第一个需要屏幕布局的Canvas上延迟建立，WorldSpace／禁用根不触发布局；跨调用不复用，文字、父子关系、激活、相机、视口及选择变化均由本次输入决定。保持各Canvas内条目顺序、遮罩与嵌套根规则。

变更uiLayout及uiMultiCanvasLayout测试。7项多Canvas／大场景定向检查、TypeScript通过，覆盖共享提供的布局仅访问一次、WorldSpace与禁用根、指定相机、遮罩、嵌套Canvas、未知所属条目及动态输入。4Canvas／1204实体，3组交替先后的局部样本，每组8次预热及35次测量，Scene UI布局均值8.881→4.976ms；三组P95为12.362／11.956／10.127→7.860／5.794／6.733ms。完整输出和校验和一致，另16组输入变更逐项与旧实现相同。证据tmp/docs-artifacts/editor-performance-risk/multi-canvas-layout-*，只证明该布局路径的成本，不等同于DotA或整帧FPS。

本批28c3aa0、62f620c及本项达到3/3，开始统一隔离生产构建与相关原生集成。需验证原始帧opacity标记、透明回退、延后命中与模型热更新／父变换／偏心网格、Spine、多窗口、Canvas与截图，并复测DotA全图持续帧率及点击耗时；复用不受影响的地图转换和层级验证。

### 第八十九至九十一阶段合并验证

实现28c3aa0、62f620c、631bc90已提交推送。143项相关前端定向检查通过，隔离d8c45ee只接入本批5份生产文件差异，前端与Tauri Release构建通过；此前1项实际Rust opacity函数测试通过。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-631bc90/mengine-editor-tauri.exe，SHA256 f08cacc4058596f5f1eb1d605d5714e13ae455c4fd64fb41f59578e78fdfaa5b，不包含共享工作区并行Unity导入改动。

同一EXE四份报告均通过、0控制台error、正常退出。B001/spatial-picking-1792818795004.json覆盖模型热替换、父变换、原点在相机后的可见网格，以及alpha1→0→1切换后选取。真实Scene原生帧有4／3／3个样本，浏览器drawItems分别0／1／0，证明不透明省略与透明即时路径实际触发。--opacity-cases记录自动化UI动作及selection查询的往返耗时，成功动作约72～113ms；含UI与IPC，不等同于纯浏览器事件或物理输入延迟，初次资源热替换时存在重试，不能宣称首次点击无等待。

B001/spatial-picking-1792819157144.json由--spine-only创建独立官方Spineboy资产夹具，3张间隔350ms的动画帧各不相同，playing=false后画面相同，通过普通对象点击及恢复选择后仍完全相同。浏览器drawItems0、spineSkeletons1，确认不透明Scene的动画覆盖及延后命中不会重复推进；只验证该行为，不代表Spine所有附件的视觉还原验收。

B001/map-session-1792819200641.json通过多窗口Scene／Game、Game重开与版本追赶、截图、Pause／Step／快捷键、Stop、undo／redo及回停靠。采样前额外等待324ms有19个当前Game原生帧，起点仍在已有固定启动等候及内存采样之后。5秒样本Scene51.57／Game55.44FPS、浏览器paint7.77／2.22ms；Scene drawItems707，未触发整幅不透明省略。

B001/arbitrary-map-1792818854152.json通过实际DotA14437实体缓存与5秒持续采样，缓存进入2.288秒。Game59.85FPS／paint2.94ms；全图Scene31.63FPS／paint15.87ms、drawItems10723。该Scene仍有非完全不透明的原生像素，保持完整浏览器路径，本批不透明优化未覆盖它，不能用单次顺序样本的FPS变化证明该分支收益。Game原始PNG921600像素中211379个alpha<255；下一步需要核对原生材质输出和混合，不能直接将这些像素标为不透明来启用省略。

本批功能集成完成；仍未达到DotA全图或多窗口稳定60FPS。真实大地图首次点击、物理输入延迟、长时间内存和完整视觉还原仍待验收。临时产物留在tmp/docs-artifacts；QA编辑器正常退出，WebView缓存EPERM保留，用户编辑器未关闭。脚本新增检查仅属于本批验证，不另计任务。

### 第九十二阶段／新批次任务1/3：材质覆盖alpha与Multiply混合

RHI不透明材质忽略最终颜色的透明度写入：镂空仍按原始alpha裁剪，通过裁剪的片元写alpha1。透明材质继续保留shader输出alpha；预乘、普通透明及加法混合维持原规则。Multiply的alpha采用源覆盖公式，避免半透明源叠在不透明背景时降低背景alpha。复用对象uniform的保留分量传递覆盖规则，不改变绑定布局、阴影裁剪、RGB乘法公式或深度策略。

新增真实GPU单测覆盖透明／不透明清屏下的opaque-lit、opaque-unlit、镂空保留／丢弃、Alpha、Premultiplied、Additive、Multiply共16种情况，并检查未覆盖区域alpha。修复前实际输出存在8处错误：opaque和保留的镂空alpha128；Multiply在透明背景为64、不透明背景为191。修复后16种输出全部符合覆盖规则，GPU验证错误为0；透明清屏及实际透明源仍为0／128，不会将所有图像强制不透明。

GPU测试1/1、uniform角色测试1/1及forward shader检查2/2通过，日志tmp/docs-artifacts/editor-performance-risk/material-alpha-before-test.log、material-alpha-after-test.log、material-alpha-uniform-test.log、material-alpha-shader-tests.log。此项尚未证明实际DotA全部半透明像素均源于这两处错误。

当前新批次1/3。因已有实际DotA alpha异常及不透明省略无法触发的复现，按已知故障例外立即构建该RHI修复，并只检查同一地图的原始PNG alpha、Scene路径、持续采样和实际大地图对象点击，不重复已通过的全批选取、Spine或地图转换。其余集成按三项合并。

### 第九十二阶段已知故障定向验证

096b624已推送；隔离cb40895只在上一集成d8c45ee上接入本项renderer差异，原生Release构建通过。前端资源与上一集成一致，未重复构建。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-096b624/mengine-editor-tauri.exe，SHA256 a4fa72fe3e1126f897e00d53fc999af9970ab65f4179f009c29d392c1c226d66。

实际DotA报告B001/arbitrary-map-1792819809985.json通过、14437实体、0控制台error、正常退出，缓存进入2.313秒。Game原始PNG921600像素全部alpha255；此前相同场景有211379个非不透明像素。Scene浏览器drawItems由10723变为选中Camera辅助条目1，原生仍有5376个渲染对象、5342个可见／提交对象，图像确认地图与模型正常呈现。不透明按需准备现在实际覆盖该地图。

同一路径5秒样本：Game最近240个原生间隔约59.08FPS、paint3.11ms；全图Scene208个间隔均值23.974ms／41.71FPS、P95 42.5ms、paint10.41ms。上一生产样本31.63FPS／paint15.87ms；这是一次顺序本地对照，保留缓存和系统负载波动限制，不代表稳定60FPS。Scene原生render均值22.40ms，最新callTree场景编译7.492ms、backend11.468ms、资源同步1.165ms，后续优化继续以原生与浏览器剩余成本为依据。

QA新增--pick-map：全图Scene清空选择后连续3次中心点击均选中导入实体4294981705，UI动作与selection RPC往返171.32／153.04／149.72ms。统计从动作命令前到selection返回，未包含预热、截图和selector查询；不作为物理输入或纯JS处理时间。该检查直接覆盖实际大地图延后命中路径，未重跑无关导入、完整选取或Spine测试。

本项定向故障验证完成，当前批次仍1/3。多窗口最新RHI版本、长期内存、物理输入延迟、LOD和完整JASS玩法仍待后续验证或实现。原始图像／JSON／日志仅在tmp/docs-artifacts，QA退出后保留被WebView占用的缓存，未关闭用户编辑器。

### 第九十三阶段／新批次任务2/3：同次提交共享材质准备

RHI按本次提交中SharedRenderMaterial的源身份准备一次材质，未共享源直接准备；每个对象继续使用独立uniform槽位，阴影、粒子和世界绘制通过映射取得对应材质。复用只存在于一次提交内，源Arc在该期间保持存活，纹理上传、shader变化及写时复制的对象覆盖在下一次提交重新准备。

变更renderer及material_submission_tests。3项真实GPU定向检查通过，覆盖共享绑定、资源刷新及新增64对象／8源的逐像素对照：共享准备64→8、单对象写时复制后9、独立材质64；开启阴影并校验纹理缺失后上传。最终生产cargo check -p mengine-rhi --release --lib通过。手动局部GPU基准4096对象／128源，12轮交替先后、排除2轮预热，每模式10组且每组4帧，96帧像素完全一致；材质准备CPU均值1.014100→0.084892ms、中位1.018150→0.084050ms、P95 1.119000→0.101900ms。只衡量该准备阶段，不作为真实地图FPS。

日志tmp/docs-artifacts/editor-performance-risk/shared-material-preparation-{tests,bench,final-check}.log、shared-material-bindings-tests.log及shared-material-resources-tests.log。当前096b624与本项为2/3；下一项独立性能任务完成后统一原生构建与实际DotA／多窗口验证，真实地图材质数量、帧率和完整集成尚待确认。
