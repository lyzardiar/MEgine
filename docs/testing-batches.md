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

### 第九十四阶段／新批次任务3/3：复用稳定世界绘制指令

RHI在同一绘制列表再次出现时编译forward render bundle，后续精确匹配GPU pipeline／bind group／顶点与索引buffer句柄、index数量、uniform偏移及绘制顺序后复用。相机、灯光、对象uniform和顶点内容仍照常上传；透明顺序、资源替换和uniform扩容改变匹配输入。阴影保留原路径，包含原生粒子或不足64／超过32768候选的列表直接编码。缓存最多4份、累计32768绘制条目，超过8次提交未使用的记录释放；第一次出现只登记，不编译未复用的bundle。

变更renderer、world_bundles及material_submission_tests。新增真实GPU逐像素检查通过，覆盖opaque／透明／加法／镂空／自定义shader、相机和透明顺序、纹理缺失后上传／替换／删除、shader错误与恢复、网格buffer及index数量替换／删除、同句柄顶点更新、uniform扩容、视口尺寸、阴影、环境贴图替换／移除、粒子回退及空帧后的缓存释放。4096对象、12轮交替且排除2轮预热，每模式10组4帧，96帧像素一致；世界编码CPU均值3.097237→1.905038ms、中位3.104275→1.917550ms、P95 3.175600→1.972150ms。仅为局部CPU样本，真实地图FPS待验证。生产cargo check通过；日志tmp/docs-artifacts/editor-performance-risk/world-bundles-{tests,bench,check}.log。

当前096b624、d2cbff9与本项达到3/3。统一隔离生产构建，合并验证实际DotA缓存进入、Game／全图Scene持续采样与选取，以及多窗口重开／Pause／Step／Stop／截图；复用不受影响的导入、层级和Spine证据。稳定60FPS、完整JASS玩法和LOD仍未完成，不将指令缓存描述为几何数量减少。

### 第九十二至九十四阶段合并原生验证

实现096b624、d2cbff9、ee9a120已提交推送。主工作区材质提交GPU模块4项通过、4项手动基准默认忽略；两份基准已分别手动通过。复用第九十二阶段16种alpha组合结果。隔离31903e3基于cb40895接入本批材质复用和forward bundle，world_bundles与主提交逐字一致；隔离基线没有并行粒子字段／renderer，因此不含对应guard和粒子测试块，主工作区GPU测试已覆盖该回退。原生Release构建通过，前端未改，复用上一验收产物。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-ee9a120/mengine-editor-tauri.exe，SHA256 d69a43e064e10b299902c2e149d098c38d235ac45f5a4463428c76e78498baf0。此结论不代表包含并行Unity／粒子导入的整个共享HEAD原生构建验收。

同一EXE的两份真实报告全部通过、0控制台error、QA正常退出。B001/arbitrary-map-1792824175375.json使用实际DotA_v6.83d.w3x匹配缓存，14437实体、缓存进入2.299秒，验证进度条、返回、Game／全图Scene连续采样及三次地图点击；均选中4294981705，UI动作及selection RPC往返169.87／144.44／138.73ms，不等于物理输入延迟。全图仍5376对象／5342提交，浏览器drawItems1为Camera辅助条目，Game和Scene图像已检查。

DotA的5秒窗口，Game最近240间隔16.952ms／58.99FPS、paint3.09ms；Scene210间隔23.757ms／42.09FPS、P95 40.1ms、paint10.20ms。此前单次样本为59.08／41.71FPS、paint3.11／10.41ms，整帧差异很小，不能据此宣称明显或稳定FPS提升。最新单帧材质准备1.1415→0.1298ms、世界编码4.7619→4.2599ms、backend11.4682→10.2222ms；同时编译7.4921→8.9227ms、GPU回读等待3.4812→3.7021ms。这些是各自窗口最后一帧的分段值，不是阶段均值。Scene原生render窗口均值22.398→22.013ms；下一步仍需降低实际场景编译／绘制与回读成本。

B001/map-session-1792824239313.json覆盖7434实体、多窗口Game重开与版本追赶、Scene／Game持续采样、Pause／Step／快捷键、两窗口截图、Stop、编辑及undo／redo／回停靠。采样前额外等待324ms有18个当前Game原生样本，起点在固定启动等候与内存采样之后。5秒窗口最近240间隔Scene54.44／Game55.59FPS、paint7.00／2.19ms；前一多窗口样本51.57／55.44FPS在alpha修复之前，不能单独归因为指令缓存。两窗口均未达到稳定60FPS。

本批相关集成完成，未重跑无关导入／层级／Spine全套；LOD、完整JASS玩法、长期内存和物理输入延迟仍待后续工作。原始日志、报告与图像仅在tmp/docs-artifacts，QA编辑器正常退出，WebView的EPERM缓存保留，用户编辑器未关闭。

### 第九十五阶段／新批次任务1/3：按实体修订复用网格绘制输入

FrameMeshInputs由每个编辑器视口／独立运行器持有，使用World进程内身份、完整Entity句柄及可信实体修订复用网格路径、投影后的材质和阴影标志；每次提取仍读取当前层级矩阵与遍历顺序。自定义Any视图没有可信修订，逐次读取。材质源在本次实际使用时通过原RuntimeMaterialCache轮询一次，源Arc变化重新应用属性覆盖，保留材质／shader热更新；不再使用的实体及材质源在提取结束释放，源索引重排同步更新存活输入。复制后的RenderObject可独立由动画、billboard及视图处理修改。

变更Core修订查询、runtime FrameCompiler／FrameMeshInputs及测试、runtime主循环、EditorViewportRenderer和CPU诊断示例。所有FrameCompiler构造点已补齐缓存参数；主视图缓存收集的实体顺序继续供嵌入SceneView使用，UI-only视图保留原提取路径。benchmark_frame_compile新增--uncached-mesh-inputs对照开关。

11项runtime网格／共享视图定向检查及1项Core修订查询检查通过，另11项手动基准默认忽略。覆盖父变换不改子实体修订、激活／失活、MeshRenderer／PbrMaterial／属性覆盖编辑、遍历顺序、删除／槽位复用、World更换、来源清理、自定义Any原地切换、材质改写／缺失及旧帧材质独立性。cargo check -p mengine-editor-host -p mengine-runtime --release --all-targets通过，包含宿主、独立运行器及示例的构造点。

实际DotA保留工程的局部Release对照，5376绘制对象、139个材质源，10轮交替先后、排除2轮预热，每模式8组且每组20次提取，每轮结束逐项比较完整RenderObject输出。静态提取均值4.723225→1.775136ms；每次修改200个Transform的提取均值5.798501→2.340243ms。此处只计网格输入提取，层级构建、脚本、GPU和IPC不在计时内，不直接外推原生FPS。日志tmp/docs-artifacts/editor-performance-risk/mesh-inputs-{dota-bench,final-tests,core-tests,integration-check}.log。

当前新批次1/3，Tauri原生构建、DotA与多窗口持续FPS、缓存驻留内存、模型／材质热更新、Scene父变换与Stop后重开／场景切换待第三项后统一验证。真实编辑器收益、稳定60FPS、LOD和完整JASS玩法尚未完成；本项不触发无关全库及地图遍历。

### 第九十六阶段／新批次任务2/3：世界图元使用紧凑排序键

世界图元排序先检查输入是否有序；需要排序时缓存种类、2D图层序、sorting_order和与f32::total_cmp一致的深度键，由标准库稳定排序键及置换图元。3D仍只按深度，2D仍先图层再sorting_order再深度，同值保持原输入顺序。图层序每个条目计算一次，避免比较中重复查找及反复移动568字节的完整WorldPrimitive。

变更sorting及world_sort_tests。4项定向检查通过，覆盖旧排序逐项对照、空／单条目、3D／2D／混合、正序／倒序、稳定同值、未知及大小写图层、i32边界、正负零、无穷、正负NaN及payload；生产cargo check -p mengine-runtime --release --lib通过。

局部Release基准使用实际DotA资源显式采样1秒后的2521图元，另测同一数据正序／倒序和4096多图层条目；12轮交替先后，排除2轮预热，每模式10组，每组20次排序，复制不计入计时。完整图元输出与旧排序一致。排序均值：实际DotA0.834955→0.173579ms，已排序0.020809→0.011823ms，倒序0.866816→0.145654ms，多图层5.280150→0.512108ms。只衡量排序CPU，不能外推实际FPS；日志tmp/docs-artifacts/editor-performance-risk/world-sort-{tests,bench,check}.log。

当前50fc516及本项为2/3。第三项后统一生产构建并验证DotA／多窗口、透明特效与2D图层、模型／材质热更新、父变换、Stop／重开与场景切换；缓存驻留内存和真实FPS仍待确认。

### 第九十七阶段／新批次任务3/3：特效图元直接使用最终批次键

UiPrimitive提供solid_with_key，原solid继续使用原默认键。采样特效按最终材质、纹理、混合、深度与stencil信息构造图元，避免创建随后立即替换的默认资源名；颜色、UV、裁剪角点、模型粒子shader顶点数据、alpha裁剪和Multiply预乘规则保持原值。对照开关只存在于cfg(test)线程局部状态，不改变生产配置或协议。

6项采样特效检查通过，覆盖原版Multiply透明度、模型粒子层／年龄／UV／缩放、暂停／seek／热更新／失活、共享资源独立播放、材质参数及相机变换。原solid默认UV检查通过。实际DotA资源显式采样1秒后2521图元，完整SampledEffectWorld.collect的12轮交替对照、排除2轮预热，每模式10组20次收集，每组末尾完整图元与灯光输出一致；均值1.197697→1.033828ms，中位1.196420→1.032380ms。只计CPU收集，包含资源检查，不含GPU／IPC，不直接外推FPS。日志tmp/docs-artifacts/editor-performance-risk/effect-keys-{tests,bench,rhi-test}.log。

本批50fc516、0eb7a3a及本项达到3/3。统一构建当前分支前端与原生Release，验证实际DotA／多窗口持续采样、模型／材质热更新、Scene父变换与选取、Stop／重开／场景切换；复用不受影响的地图转换、层级和Spine结果。真实FPS与进程内存、稳定60FPS和LOD仍待确认。

### 第九十五至九十七阶段合并原生验证

实现50fc516、0eb7a3a、6aa764b已提交推送。累计23项相关定向检查通过，3份手动局部对照完成。当前主工作区前端TypeScript／Vite及Tauri Release构建通过；此次包含当前分支的Unity／粒子集成源码，未使用旧隔离工作区。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-6aa764b/mengine-editor-tauri.exe，SHA256 274c02def166d1478b1308a655c813e56f9d47db4a531fabe4f6abfd47802f8a；receipt.json记录前端入口摘要及源码范围。构建仅有已有world_from_snapshot未使用警告；这不等同于所有并行功能均已运行验收。

同一EXE的三份原生报告全部通过、0控制台error、QA正常退出。B001/spatial-picking-1792826667371.json验证模型文件热更新后原生像素与选取同步、父变换、原点在相机后的可见网格，以及opaque→transparent→opaque切换后的当前几何选取；热更新／父变换图像已检查。该路径确认网格输入复用仍允许资源与层级变化生效。

B001/arbitrary-map-1792826765617.json使用实际DotA_v6.83d.w3x匹配缓存，14437实体，缓存进入2.595秒；通过进度条／返回、Game及全图Scene持续采样和3次点击。Game的最近240个原生间隔均值16.665ms／60.00FPS、P95 22.4ms、浏览器paint3.53ms；全图Scene间隔均值22.994ms／43.49FPS、P95 40.3ms、paint10.39ms。原生仍5376对象／5342提交，图像已检查。3次点击均选择4294981705，UI动作及selection RPC往返169.26／157.02／141.73ms，不是物理输入延迟。

上一生产样本为Game58.99／Scene42.09FPS；Scene原生render窗口均值22.013→18.669ms，Game16.632→12.554ms，编译路径的成本实际下降。当前Scene最后一帧编译5.120ms、网格提取1.838ms、特效与排序0.447ms，backend10.163ms，其中世界编码4.517ms、GPU回读等待3.455ms；分段是最后一帧而非均值。前一EXE来自不含并行粒子路径的隔离基线，不能将所有差异严格归因于本批，也不能用单次短窗口宣称全图或Game稳定60FPS。没有新LOD或可见几何省略。

B001/map-session-1792826856467.json覆盖7434实体、多窗口重开／版本追赶、持续Scene／Game、Pause／Step／快捷键／截图、Stop、编辑、undo／redo及回停靠。采样前额外等待318ms有17个当前Game样本，起点在已有固定启动等候与内存采样之后。最近240间隔Scene53.82／Game56.40FPS、paint7.11／2.05ms；上次54.44／55.59FPS。原生render均值Scene10.319→8.773ms、Game11.768→10.135ms，但展示帧率仍未稳定满帧。

该流程的编辑器与当前子进程PrivateBytes合计依次为4520.62／6372.90／6947.46／5690.37MiB（detach前／三窗口／重载后／Stop并停靠后）。此为短流程进程树指标，不是网格缓存独立占用；Stop后仍高于起点，不能证明长期内存无增长。网格输入与来源的逻辑释放由定向检查覆盖，长期驻留仍待调查。原始证据只保存在tmp/docs-artifacts；WebView退出后的EPERM缓存保留，用户编辑器未关闭。

本批相关集成完成，未重跑无关地图转换、完整层级或Spine验证。继续待办：全图Scene／多窗口稳定60FPS、原生绘制编码／GPU回读、浏览器Scene约10ms paint、长期内存与物理输入延迟、LOD和完整JASS／DotA玩法。

### 第九十八阶段／新批次任务1/3：不透明Scene按需更新空间索引

每个绘制帧先按原流程准备包围盒并查询模型预览，保留模型预热与热替换观察；该帧固定包围盒、相机平面及ownership组成独立候选读取器。完整八叉树更新／查询在实际需要整图候选时执行一次。不透明原生Scene直接按原实体顺序准备选中辅助条目，普通对象点击再取完整候选；透明Scene、浏览器及Game即时取候选。选中对象在原索引中属于null保守候选，因此按实体顺序直接取得的辅助条目与原查询后过滤顺序相同。多个显示所有者共享索引时，各自保留自己的候选结果；失败不缓存部分结果。

变更Viewport、viewportSpatial、已有bounds检查及新增viewportSpatialFrame检查。34项空间／包围盒／绘制／延后命中针对性检查、TypeScript通过，覆盖首次普通点击触发真实prepareDrawn默认候选、空结果缓存、失败重试、较旧相机／包围盒在新所有者查询后仍可使用、选中／特效保守性、透明／浏览器即时路径及Spine原有推进规则。

局部对照使用实际DotA作者场景的10746活动条目及48个裸路径GLB预览，包含包围盒准备，保留当前带fragment模型的原有路径。12轮交替先后、排除2轮预热，每模式10组120帧；完整候选和选中条目逐项一致，计时窗口校验和一致，预览查询两模式均207504次。均值：不点击的不透明帧0.951328→0.441996ms，每30帧点击一次0.959596→0.457785ms，透明帧0.888238→0.831181ms。不包含完整绘制、GPU或IPC，不能外推原生FPS。脚本与日志tmp/docs-artifacts/editor-performance-risk/lazy-spatial-*。

当前新批次1/3。第三项后统一原生构建与DotA全图点击／模型热替换／父变换／透明切换、多窗口和持续FPS验证；本次未重跑全套原生QA。稳定60FPS与长期内存仍待完成。


### 第九十九阶段／新批次任务2/3：使用已显示原生帧的网格选取

Scene原生渲染器在成功提交后捕获当前相机、可见网格顺序、最终世界矩阵及不可变位置／索引数据。姿态和billboard采用渲染时已采样的几何；浏览器不再为这些节点使用默认方块命中区域。Game、运行时和Camera Preview不启用额外几何留存。首次开启时重新同步已有GPU网格。

Tauri把镜像实体映射回源节点ID，随实际图像返回选取token。查询只读取该token对应快照，释放缓存锁后执行射线检测；支持锁定节点过滤及其后方网格。每窗口最多3帧、全局12帧，逻辑几何与对象预算256MiB，同一帧共享几何去重、不同帧保守重复计费；过大快照不发布token。项目、窗口、Play代次不匹配或token过期时查询失败，不替换成当前帧。窗口销毁／项目关闭清除留存。Profiler单列当前renderer的位置／索引长度；旧帧独占几何、分配器开销和完整进程内存不计入该项。

前端使用实际显示图像的letterbox坐标，UI／操作柄及原有Spine和辅助图标仍优先。异步网格点击立即发起查询、按手势顺序应用；双击等候选择结果再聚焦，过期查询不触发旧节点聚焦。外部UI操作、相机滚轮、项目变化与卸载取消旧查询。原生选取对应三角形表面，尚未按纹理alpha、shader裁剪逐像素判断；浏览器的姿态包围盒、选择框与聚焦范围仍有独立改进空间。

小范围验证：RHI 3项（含真实GPU像素／缓冲复用／旧几何和排序），宿主骨骼glTF 1项（先上传再启用、父节点偏移、姿态推进、外部bin热更新、旧显示帧），token隔离／淘汰1项、源ID重排／销毁／代际复用1项；前端19项及TypeScript通过。网格输入顺序复用3项及过滤镜像映射1项通过。原始日志为tmp/docs-artifacts/editor-performance-risk/native-picking-*.log。必要的Tauri库编译已通过；没有据此报告新FPS。

当前6283871及本项为2/3。第三项完成后统一生产构建，执行实际DotA_v6.83d.w3x的姿态节点／锁定过滤／连续选择／双击、热更新／父变换／透明切换、多窗口和Stop重开，记录选取快照开销、内存与Scene／Game持续FPS。既有稳定60FPS、长期驻留、LOD和完整JASS玩法继续待办。


### 第一百阶段／新批次任务3/3：关闭项目时释放原生视口资源

项目成功关闭后释放Game、Scene、Camera Preview、材质及Effekseer的renderer，清空四类快照镜像和原生选取留存。五个renderer槽之前只在切换不同project_root时替换，关闭项目仍保留GPU／CPU资源；同一路径重开也会继续复用旧槽。本项限定项目关闭生命周期，Play Stop仍保留当前项目的视口缓存。

请求在读取当前项目时记录视口项目代次，后台渲染持有只读租约；关闭项目等待在途工作结束后推进代次并释放资源。排队旧请求被拒绝，原生Scene token发布也检查租约，避免清理后旧请求重新填充缓存。锁顺序为项目读取→短代次读取，后台为代次租约→世界／renderer；关闭按项目→停止Play→独占代次→资源释放执行，后台不获取项目锁。

2项定向检查通过：在途工作与关闭竞态、已排队旧请求拒绝／新代次可重建、资源Arc释放，以及全部镜像修订和token清空。Tauri测试目标编译通过，地图QA脚本语法检查通过。qa-frost-map-import新增--project-reopen，在真实地图流程后采样关闭前／欢迎页／同路径重开后的进程树PrivateBytes并验证实体与原生Game图像。日志viewport-lifetime-test.log；尚未据此报告实际内存下降或FPS变化。

本批6283871、f212fab及本项达到3/3。接下来统一构建当前前端与Tauri Release，执行原生选取／热更新／透明切换、实际DotA与项目关闭重开、多窗口持续采样；复用不受影响的转换、层级和Spine结果。长时间驻留、LOD、稳定60FPS及完整JASS玩法仍待完成。


### 第九十八至一百阶段合并原生验证

实现6283871、f212fab、4bca411已提交推送。相关定向检查通过；当前分支前端TypeScript／Vite（3.14秒）及Tauri Release（1分21秒）构建通过，只有已有world_from_snapshot未使用警告。固定EXE为tmp/docs-artifacts/editor-performance-risk/build-4bca411/mengine-editor-tauri.exe，SHA256 34b35a468c9c8ec1d55600ecfbfa123978e8e819f4b76e131a774b9f8ad2bee7，receipt.json记录源码及前端摘要。

B001/spatial-picking-1792831338865.json的5项原生检查通过、0控制台error、正常退出。--pose-cases让生产Scene加载带动画根节点的#pose路径，验证文件热更新、父节点移动、原点在相机后的可见几何、姿态推进和锁定前方网格后选择后方对象；同时执行opaque→transparent→opaque选取。9次UI操作与selection RPC往返56.72～77.82ms，只是该小夹具下的合成操作往返，不是物理输入延迟。姿态图像已检查；骨骼／外部bin／旧帧版本由宿主定向回归覆盖。

B001/arbitrary-map-1792831389250.json使用实际DotA_v6.83d.w3x匹配缓存，14437实体，缓存进入2.291秒；进度、返回、持续Game／全图Scene和3次地图点击通过。最近240个Game间隔均值16.694ms、59.90FPS、P95 23.3ms，浏览器paint均值3.35ms；Scene233个间隔均值21.418ms、46.69FPS、P95 36.4ms、paint9.36ms。上一生产样本Scene43.49FPS／paint10.39ms；此次单次短窗口有改善，Game59.90与此前60.00接近，不能宣称稳定60或严格归因某一改动。原生仍5376对象／5342提交，没有新增LOD或删减可见几何。Game／Scene图像已检查，完整JASS／DotA对局规则仍未接入。

DotA Scene原生render均值18.895ms（上一18.669ms）；最后一帧compile5.677ms、world编码5.790ms、回读等待2.993ms、选取捕获0.335ms；分段不是窗口均值。当前renderer选取几何逻辑长度4708152字节，旧快照独占版本及分配器开销另计。3次全图点击均选择4294981705，UI动作与selection RPC往返132.61／123.96／119.28ms；上次169.26／157.02／141.73ms，不作为物理输入延迟或单因素对照。

同次DotA流程执行--project-reopen：关闭项目返回欢迎页，同路径重开恢复原始实体并产生新的原生Game图像。进程树PrivateBytes为6176.82→2801.60→2903.35MiB（关闭前／欢迎页／重开），包含当前编辑器和WebView子进程，不是GPU缓存单项或长期泄漏测试。该流程验证项目关闭资源释放；Stop时仍保留当前项目缓存，不能由此认定Stop后所有驻留已解决。0控制台error的断言位于地图运行／Stop之后、关闭重开之前。

B001/map-session-1792831470405.json通过7434实体、多窗口重开／版本追赶、Pause／Step／快捷键／截图、Stop、编辑与undo／redo及停靠，0控制台error、正常退出。既有固定启动等候和内存采样后，额外315ms内出现18个新Game样本。最近240间隔Scene54.16／Game55.52FPS、paint7.60／2.16ms；上一53.82／56.40FPS，尚未稳定满帧。原生render均值Scene9.041／Game10.255ms。场景图像已检查。

多窗口进程树PrivateBytes为4550.07／6442.46／7450.48／5998.75MiB（detach前／三窗口／重载／Stop停靠）；这一短流程结束仍高于起点，长期驻留继续待查。三份QA均正常退出，WebView EPERM缓存保留，用户编辑器未关闭。脚本／原始报告只在tmp/docs-artifacts；本批不重复无关转换、完整层级及Spine验证。

本批3/3相关集成完成，下一批从0/3累计。继续待办：Scene及多窗口稳定60FPS、绘制编码／回读与浏览器paint、长期驻留、姿态选择框／聚焦范围及纹理alpha选取、LOD、完整JASS／DotA对局与War3界面保真。


### 第一百零一阶段／新批次任务1/3：对象参数按实例索引读取

原生主绘制、阴影和绘制bundle共用对象参数数组，通过first_instance及flat片元索引读取对应模型／法线矩阵、颜色、材质与自定义参数，减少逐网格的动态uniform绑定。GPU支持的存储绑定范围能覆盖原有max_buffer_size时启用；上限较低的设备继续沿用动态uniform路径，保持原有可容纳对象范围。材质hook中的object名称和参数、绘制顺序、粒子自身绑定、可见几何及阴影规则保持原语义。Profiler的indexedObjectSlots记录数组路径实际打包槽数，为0时可能是uniform路径或当前无提交对象。

实际DotA作者场景静态清点为5376活动网格／177种网格键；按当前源序连续网格及材质分组仍有4705段，单纯相邻实例合并最多减少约12.5%的调用。本项直接降低每次对象参数绑定成本，没有宣称减少绘制数量或加入LOD。

8项相关定向检查通过：新数组与uniform对照包含12阶段96帧的完整RGBA一致性（阴影、材质参数、shader与错误fallback、纹理／网格热替换、剔除、容量增长、相机／透明顺序、环境、resize及粒子之后的网格恢复），3种shader解析／布局验证，以及既有材质／绘制bundle4项、嵌套Scene View和原生几何选取GPU检查。RHI与editor-host Release库检查通过。未增加生产对照开关；强制uniform参考只存在于cfg(test)线程局部状态。

4096混合材质绘制、缓存bundle的12轮交替对照，排除2轮预热，10组各4帧；每帧128×128完整回读像素相同。世界编码CPU均值1.962848→1.694805ms，提交CPU3.194753→2.838718ms，提交加GPU回读5.135708→4.810100ms；不含IPC和游戏逻辑，不直接外推真实地图FPS。原始日志及摘要为tmp/docs-artifacts/editor-performance-risk/indexed-objects-{final-tests,gpu-final,material-tests,embedded-view-test,picking-test,benchmark,host-check}.log和indexed-objects-benchmark-summary.json。

当前新批次1/3。第三项后统一构建并验证实际DotA／多窗口持续FPS、indexedObjectSlots、材质／shader热更新、姿态选取／阴影与Stop／重开；本次没有重跑完整原生QA。最新已验证实际全图Scene仍为4bca411的46.69FPS、Game59.90FPS，完整JASS／War3保真、稳定60FPS、长期驻留和LOD继续待办。


第一百零一阶段补充：通过独立渲染阶段包装传递实例索引，保留材质辅助函数可用的VsOut结构、位置构造参数与成员；自动避开辅助函数、类型和私有变量的同名符号。构造函数及命名兼容回归通过，12阶段96帧uniform／数组完整像素对照仍一致。日志indexed-objects-constructor-before.log和indexed-objects-constructors-after.log。该补充属于同一功能，批次计数不增加。

### 2026-10-24／新批次任务2/3：combat-vfx-demo 外部工程快照

变更路径：`watcher/README.md`、`watcher/combat-vfx-demo/**` 及本台账。`watcher/` 为多个待跟踪工程的总目录，本工程独占子目录；完整导入 `https://github.com/yuewen-huang/combat-vfx-demo.git` 的 `main` 提交 `aee3b51bb2f22bd0262a4e191ac706e2cc0f82a5`，原样保留源码、配置、媒体及许可证。项目内 `UPSTREAM.json` 记录来源、分支、提交版本和归档摘要，`README-MENGINE.md` 记录手动同步流程；不包含 `.git`。

本次快速检查：GitHub 固定提交归档与完整 Git tree 清单逐文件比对，272 个上游文件、36,832,842 字节的大小和 Git blob SHA-1 全部一致；来源 JSON 可解析，项目内无 Git 元数据，新增维护文件与上游路径无冲突。入库前复核暂存文件清单及内容摘要，确保没有被忽略的上游文件、临时归档或其他任务改动。原始清单、归档、校验脚本及报告在 `tmp/docs-artifacts/watcher-import/`；文件摘要结果见 `verification.json`。

待测场景／操作：后续实际使用该 Godot 工程时，按上游 `README.zh-CN.md` 导入 `watcher/combat-vfx-demo/project.godot`，检查示例选择、组合回放及手动编辑器。版本检查命令：`git ls-remote --heads https://github.com/yuewen-huang/combat-vfx-demo.git main`。风险：Godot 项目尚未在本机运行验收；源码及资产沿用上游 PolyForm Noncommercial 1.0.0 许可证；后续同步需以记录的提交为基线保留本地改动。

状态：快照导入与完整性快速检查完成；接入远程已登记的对象参数索引任务后，本项作为新批次2/3登记。Godot 运行检查待实际使用时纳入相应批次，本次没有执行引擎构建、整库测试或原生QA，也不将文件完整性检查视为运行验收。


### 第一百零二阶段／新批次任务2/3：相邻兼容网格实例绘制

对象参数数组启用后，批量主绘制列表仅合并相邻、对象槽连续且pipeline／纹理绑定／顶点和索引缓冲及索引数量完全一致的项，每个实例仍读取自己的模型与材质参数。原有排序和阴影路径保留；含粒子的列表与不满足批量条件的列表沿用原编码路径。首次提交也执行合并列表，随后可复用bundle。缓存匹配包含实例数量，准入及总预算仍按逻辑对象数计算（最多4项／32768对象），避免少量合并命令扩大留存范围。Profiler新增worldMeshDrawCalls与worldInstancedObjects，统计本次提交各主世界pass的网格命令及多实例组内对象，包含嵌套视图，不包含阴影或粒子调用。

定向GPU对照11阶段44帧的完整RGBA一致：128个兼容对象为1次调用；阴影独占对象造成参数槽间隔时保持2段绘制；覆盖纹理／网格／错误pipeline边界、顺序变化、透明重叠、深度相同的遮挡、alpha裁剪、容量增长及实例范围缩短。单独验证缓存按8192实例的4项计为32768，而非4条命令。既有bundle资源替换检查及对象数组／uniform的shader和96帧GPU对照通过；editor-host Release库检查通过。

从实际DotA作者场景提取5376活动网格的网格／材质路径源序，得到187类、4705连续组。输入及源文件SHA256保存在tmp/docs-artifacts/editor-performance-risk/dota-adjacent-draw-groups.receipt.json；基准用代理立方体和颜色替换组内真实几何、纹理及材质，不代表真实地图完整渲染。两个独立renderer交替12轮、排除2轮预热，每模式10组4帧，每个测量帧均命中自己的缓存且完整128×128回读像素一致。调用5376→4705；世界编码CPU均值1.238800→1.223598ms，提交CPU4.193785→4.181793ms，提交加回读4.921560→4.885898ms。完整时间变化很小，本项不据此宣称真实FPS提高。

命令：设置MENGINE_DRAW_GROUPS为上述txt后运行cargo test -p mengine-rhi --release --lib benchmark_adjacent_instancing -- --ignored --nocapture。日志adjacent-instancing-{gpu-final,cache-test,host-check,dota-groups-final-benchmark}.log及adjacent-instancing-dota-groups-final-summary.json；构造兼容回归为indexed-objects-constructors-after.log。当前编辑器／RHI队列的504b42c（含3af8e85补充）及本项为2/3；第三项后统一原生构建，验证真实DotA／多窗口的调用数与持续FPS、材质热更、透明／阴影／姿态选取、Stop和重开。真实场景最新仍为4bca411的Scene46.69／Game59.90FPS，稳定满帧、LOD与完整JASS继续待办。


### 第一百零三阶段／编辑器批次任务3/3：按材质来源解析GPU绘制资源

材质准备和pipeline清理完成后，在本次提交内按材质来源解析GPU管线及纹理绑定引用，供阴影、主世界、bundle列表和粒子路径读取。引用只在该提交内有效；shader、纹理到达／移除／替换及错误fallback仍按当前准备结果解析。只需纹理的阴影／粒子来源可保留空的主绘制管线，实际网格绘制时验证管线。Profiler新增materialSources和materialBindingResolutions；后者按来源解析次数统计，单次解析可读取管线与纹理两个映射，不是底层HashMap调用次数。

48帧／12阶段的重复查表与来源引用完整RGBA一致；覆盖资源缺失／到达、纹理热替换和移除、shader错误及恢复、独立参数修改、相机／顺序／resize／环境、容量增长和缩短、粒子交错及空帧。来源解析数等于当次材质来源数；显式验证仅有纹理的部分来源有效。已有材质／bundle相关4项检查通过，editor-host Release库检查通过。对照开关只存在于cfg(test)，没有生产选项或跨帧GPU引用缓存。

4096绘制／128共享来源、两个独立renderer的12轮交替对照（2轮预热，10组各4帧）每个测量帧均命中自身bundle缓存，完整128×128像素一致。解析次数4096→128；材质准备CPU均值0.071653→0.085298ms，世界编码1.698693→1.246758ms，提交CPU2.860855→2.391148ms，提交加GPU回读4.845425→4.350050ms。该窗口包含新准备成本；不含IPC及游戏逻辑，不直接外推实际地图FPS。日志material-bindings-{gpu-final,existing-tests,host-check,benchmark}.log，摘要material-bindings-benchmark-summary.json，均在tmp/docs-artifacts/editor-performance-risk。

本批504b42c（含3af8e85补充）、48f317e及本项达到3/3。接下来在当前整合分支统一构建前端与Tauri Release，执行姿态／锁定选取／资源热更／透明切换、实际DotA与多窗口持续采样、Stop和关闭重开。记录indexedObjectSlots、worldMeshDrawCalls、worldInstancedObjects、materialSources、materialBindingResolutions及真实FPS／进程树内存；复用不受影响的地图转换、层级和Spine检查。完整JASS、War3保真、LOD、长期驻留与稳定满帧仍待完成。

### 第一百零一至一百零三阶段合并原生验证

504b42c（含3af8e85）、48f317e、61990bf已提交推送。当前前端Vite构建3.11秒、Tauri Release构建1分19秒通过，只有已有world_from_snapshot未使用警告。固定程序为tmp/docs-artifacts/editor-performance-risk/build-61990bf/mengine-editor-tauri.exe，SHA256为8fe92e9b6f767c7d11b11a5992324693ff91635ddef00557bc090b93d10f6a1a。B001/spatial-picking-1792837996799.json的5项姿态／锁定选取、资源热更、父变换和透明切换检查通过，0控制台错误、正常退出。

B001/arbitrary-map-1792838084538.json以实际DotA_v6.83d.w3x匹配缓存进入14437实体场景，耗时2.791秒，进度、返回、地图选取、Stop及同路径关闭重开通过。Scene对象槽5342、网格调用4675、多实例组内1123对象，材质来源及绑定解析均153；Game对象槽413、网格调用99、多实例组内28对象，来源及解析均33。三项优化已在实际地图生效，5376总对象保留。Game／Scene持续帧率60.05／46.56FPS；Scene原生渲染均值16.614ms，前次18.895ms，但Scene帧率与前次46.69FPS相近，不能宣称整帧提速或稳定60FPS。Scene浏览器paint均值9.382ms，仍需排查整帧调度与前端成本。3次UI动作与选取RPC往返182.24／127.82／129.96ms，不是物理输入延迟。进程树PrivateBytes关闭前／欢迎页／重开为6699.93／2651.41／3229.41MiB；短流程不能证明长期无泄漏。0控制台错误断言位于关闭重开之前。Game／Scene图像已检查。

B001/map-session-1792838172058.json的7434实体多窗口重开／版本追赶、Pause／Step／快捷键、Stop、编辑undo／redo及停靠通过，0控制台错误、正常退出。既有固定等待及内存采样后，额外319ms出现16个新Game样本。Scene／Game最近240间隔55.78／56.69FPS、原生渲染均值8.471／9.895ms、浏览器paint均值6.686／2.113ms；仍未稳定满帧。进程树PrivateBytes为5189.99／6971.92／8044.71／6453.90MiB（detach前／三窗口／重载／Stop停靠），结束仍高于起点，长期驻留待查。Scene图像已检查。三项QA正常退出，WebView的EPERM缓存保留，用户编辑器未关闭。

原始构建及QA日志在tmp/docs-artifacts/editor-performance-risk/indexed-batch-*，实际地图计数摘要为indexed-batch-runtime-metrics.json；上述B001报告、截图只在tmp/docs-artifacts/testing-batches。未重复不受影响的转换、层级及Spine检查。本编辑器批次验证完成，下一批从0/3累计。待办继续包含Scene／多窗口稳定60FPS、前端与请求调度、长期驻留、LOD、姿态选择框／聚焦范围、纹理alpha选取、完整JASS／DotA对局及War3保真。

### 第一百零四阶段／编辑器新批次任务1/3：Scene浏览器跳过原生已处理网格

变更packages/editor/src/nativeViewportPresentation.ts、panels/Viewport.tsx及定向测试。仅当实际显示的原生Scene图像附带meshPickToken时，普通未选中网格不进入浏览器世界条目、边界和后备命中准备。保留空节点、相机、灯光、选中节点、Spine和混合粒子／拖尾组件；选中网格继续提供碰撞体／操作柄。覆盖层直接收集所需条目，避免重新构造完整网格列表。无token、浏览器渲染及Game路径仍沿原流程；后台原生对象、可见几何、绘制顺序、选取token和LOD规则未改变。条目仍引用显示帧的固定实体与父变换，选区缓存仅保留当前集合。

快速检查：presentation、空间帧及边界23项、延迟命中与Spine推进4项检查通过，TypeScript检查通过。覆盖选区原地修改／顺序变化、旧帧恢复、新帧父变换与active、混合组件、token缺失回退及生产Viewport选择分支。实际DotA作者场景的14437实体中，浏览器有Transform的活动条目10746→5371，排除5375个未选中普通网格；这不是原生可见对象数或LOD删减。

源代码微基准包含派生TRS、条目、保守边界及辅助覆盖层准备，12轮交替／2轮预热／10组各24帧，前后保留条目／边界／覆盖层一致。相同固定帧均值0.366857→0.118327ms；每帧推进固定实体记录的原生修订时3.814223→3.238983ms。使用真实DotA作者场景、49个裸路径GLB预览及原有fragment回退，不包含Canvas完整绘制、原生渲染、IPC或模拟；不能外推FPS。日志native-scene-browser-entries-{tests,hit-tests,typecheck,benchmark}.log、摘要benchmark-summary.json及本地复现脚本均位于tmp/docs-artifacts/editor-performance-risk。

状态：已实现，定向检查通过，当前编辑器新批次1/3；待另外两项提交后统一原生构建，验证真实DotA的Scene连续选择／双击／锁定、碰撞体与辅助图形、透明和无token回退、多窗口持续FPS与Stop／重开。实际运行帧率仍以61990bf的Game60.05／Scene46.56FPS为最近验证结果。

### 第一百零五阶段／编辑器新批次任务2/3：浏览器视口CPU分段采样

变更packages/editor/src/editorProfiler.ts、panels/Viewport.tsx、panels/Profiler.tsx及viewportPaintStages.test.mjs。实际完成的Canvas绘制增加六个不重叠CPU范围：世界读取与请求派发、世界准备、世界合成、选择与操作柄、UI布局绘制、最终合成。六段合计为当前paintMs；异步原生渲染、图像上传回调及仅派发请求后跳过绘制的唤醒不纳入这些范围，不能将它们当作完整WebView线程占用或GPU时间。

沿用250ms采样及每来源480项历史上限；每段记录均值、峰值和实际覆盖的绘制次数。跨多个采样桶的分段汇总按覆盖次数加权，旧版本或缺失分段保持缺失，不填零。跨窗口消息只接收六个固定名称及有效数值，读历史时复制嵌套统计，发送者和读取者后续修改不污染留存。Profiler的CPU页显示所选浏览器采样桶的分段表，并说明其可能跨多个原生帧。现有profiler.get响应的samples、summary会携带paintStages。

快速检查：新增6项分段检查通过，覆盖生产表达式的非重叠范围与合计、实际代码位置、加权统计／峰值／浮点均值上界、缺失与非法输入、跨窗口所有权和历史清空；已有16项Profiler检查及55项Scene调度／原生呈现／空间帧／延迟命中检查通过，TypeScript检查通过。日志paint-stages-{tests,final-tests,scheduling-tests,typecheck}.log位于tmp/docs-artifacts/editor-performance-risk。此次没有重新构建原生程序或报告新FPS。

状态：已实现，当前编辑器批次2677114及本项为2/3。第三项后统一原生构建，检查真实DotA与多窗口的paintStages覆盖／加权汇总、CPU页实际显示、六段合计与paint总耗时，并与原生请求／模拟／呈现时间分开分析；合并第一百零四阶段的选择与辅助图形回归。实际Scene／Game性能仍以61990bf的最近原生结果为准。

### 第一百零六阶段／编辑器批次任务3/3：网格缓存条目原位输出

变更crates/mengine-runtime/src/frame_mesh_inputs.rs。FrameMeshInputs通过HashMap Entry取得条目，在同一引用上刷新材质或替换失效输入并输出当前对象，省去热路径再次按实体查表；首次及修订变化后的重建也使用已定位的槽。当前层级矩阵、作者顺序、动态Any组件读取、材质依赖轮询、颜色覆盖共享、父节点激活、实体代次与缓存裁剪规则继续保留。

3项既有网格缓存回归通过，覆盖父变换／激活、组件修改／移除、顺序、实体槽复用、世界替换、自定义Any投影、材质热更新和旧输出隔离。另1项手动基准通过：取6148060的原缓存实现与新实现，在相同HashMap种子、独立预热材质缓存下交替12轮，排除2轮预热，10组各24帧；实际DotA作者场景5376网格、139个运行时材质路径来源，每轮完整对象顺序／模型矩阵／材质字段及实体序列一致。静态提取CPU均值1.008993→0.895941ms；每帧修改200个节点时1.091764→0.951258ms。计时不含层级构建、模拟、原生渲染、IPC或GPU，不能直接外推FPS。

日志mesh-input-entry-{tests,benchmark}.log、benchmark-summary.json和旧实现／基准源码在tmp/docs-artifacts/editor-performance-risk；摘要记录实际场景和新实现SHA256。临时基准模块入口已移除，生产和提交内容没有本机绝对路径测试依赖。定向命令为cargo test -p mengine-runtime --release --lib mesh_inputs:: -- --nocapture；手动基准的旧实现仅用于本地对照，不作为生产依赖。

当前2677114、6148060及本项达到3/3，开始统一当前前端及Tauri Release构建。合并验证实际DotA／姿态选取／辅助节点／多窗口／Stop重开、六段CPU数据与界面，并记录持续FPS及进程树内存；不重复不受影响的地图转换与全量资产检查。实际运行性能仍以61990bf最近原生结果为准，当前优化尚待本批集成验收。

### 第一百零四至一百零六阶段合并原生验证

2677114、6148060、9c251d1已提交推送。当前前端Vite构建3.17秒、Tauri Release构建1分19秒通过，仅有已有world_from_snapshot未使用警告。固定程序tmp/docs-artifacts/editor-performance-risk/build-9c251d1/mengine-editor-tauri.exe的SHA256为3729e87303b753183130a5d551789017fad541d88b41d9acdaf4401b53940b5f，receipt.json记录源码及前端摘要。

最终B001/spatial-picking-1792840650696.json的5项模型热更／父变换／原点在相机后／姿态推进及锁定过滤／透明切换检查通过，0控制台错误、正常退出。透明夹具包含独立可见的非网格辅助节点，alpha 1→0→1对应浏览器drawItems 0→1→0，三个状态均能选取原生网格；透明图像已检查。首轮spatial-picking-1792840466302在旧网格条目计数断言失败，前四项通过；该断言未表达当前浏览器普通网格被原生token处理的范围。首轮清理等待超时，随后确认其QA进程和discovery已退出；最终复验使用同一固定程序。当前夹具验证实际非网格浏览器分支，未放宽网格选取要求。

B001/arbitrary-map-1792840702987.json以实际DotA_v6.83d.w3x匹配缓存进入14437实体，2.279秒；进度、地图选取、返回、Stop及同路径关闭重开通过。Game59.93／Scene51.70FPS，Scene最近240个间隔均值19.344ms、P95 33.8ms，原生渲染均值16.453ms；前次Scene46.56FPS、原生16.614ms，浏览器paint采样桶均值9.382→8.354ms。此次短窗口显示Scene改善，不能严格归因单项或宣称稳定60FPS。Game前次60.05FPS，本次相近。Scene仍为5376总对象／5342可见／4675网格调用／153材质来源及解析，没有新增LOD或削减可见几何。

DotA Scene覆盖305次实际绘制的CPU分段加权均值为请求派发0.440ms、世界准备4.826ms、世界合成0.599ms、选择与操作柄0.064ms、UI 2.380ms、最终合成0.024ms，合计8.332ms；Game覆盖294次、加权合计3.180ms。每个采样桶六段合计等于其paintMs，覆盖数与完整绘制数一致，汇总按覆盖次数加权、峰值等于各桶最大值的断言通过。请求后跳过绘制的唤醒、异步原生执行及上传回调仍不包含在这些CPU范围。新增--profiler-ui实际切换Profiler的Scene／CPU页并截图，表格与选中状态已检查；该图取暂停后最近桶，不与前述连续运行均值混同。

3次地图UI动作与选取RPC往返186.07／175.04／155.43ms，不是物理输入延迟。进程树PrivateBytes关闭前／欢迎页／重开为6779.38／2508.22／3518.96MiB，关闭释放仍有效，短流程不能证明长期无泄漏。错误断言位于关闭重开之前。Game与Scene图像已检查。

B001/map-session-1792840827243.json通过7434实体的三窗口重开／修订追赶、Pause／Step／快捷键、Stop、undo／redo及停靠，0控制台错误、正常退出。既有固定等待及内存采样后，额外323ms出现18个新Game样本。Scene57.47／Game55.89FPS，前次55.78／56.69；原生渲染均值8.530／10.059ms，浏览器paint桶均值5.777／2.116ms。Scene覆盖298次绘制、CPU世界准备4.042ms、UI 1.082ms；Game覆盖272次绘制。六段覆盖／加权／合计断言通过。进程树PrivateBytes为5207.35／6910.75／7973.09／6404.84MiB（detach前／三窗口／重载／Stop停靠），结束仍高于起点，长期驻留待查；Scene图像已检查。

最终三项QA均正常退出，用户编辑器未关闭，EPERM的WebView缓存保留。日志paint-batch-*、分段校验脚本assert-paint-batch-profile.py及摘要paint-batch-profile-*.json均在tmp/docs-artifacts/editor-performance-risk，B001报告及截图仅在tmp/docs-artifacts/testing-batches。复现沿用qa-viewport-spatial-picking --opacity-cases --pose-cases、qa-frost-map-import的实际DotA缓存／profile／pick／project-reopen参数（另加--profiler-ui）、qa-frost-map-session --detached-profile-only；不重复无关转换和资产全检。本编辑器批次验证完成，下一批0/3。下一重点为浏览器世界准备及UI，稳定60FPS、长期驻留、LOD、姿态聚焦范围、alpha选取及完整JASS／War3保真继续待办。

### 第一百零七阶段／编辑器新批次任务1/3：Scene按需解析变换父链

变更packages/editor/src/worldTransform.ts、nativeViewportPresentation.ts、panels/Viewport.tsx及相关测试。显示帧具备原生meshPickToken时，浏览器解析其选取／辅助图形／粒子／灯光及选择操作所需节点和父链，跳过无浏览器用途的普通网格叶节点。混合MeshRenderer的Light2D仍提供照明变换；不活动的选中节点和未包含在多选集合中的主节点仍保留操作柄变换。选区与主节点变化重建本帧的局部结果，保留旧帧的固定数据。辅助覆盖层复用当前局部结果。完整变换入口始终提供完整Map，局部Map不写入可变编辑缓存；无token、浏览器与Game路径保留完整语义。深层父链及循环层级按完整作者遍历顺序解析，以保留现有循环处理结果。

定向检查：新增7项局部变换检查、已有32项变换／呈现／多选操作检查通过，TypeScript通过。覆盖只访问所需祖先、混合Light2D及渲染组件、不活动选择／主节点、完整调用不受局部结果污染、父变换／激活／重排／移除、旧帧恢复、循环与重复ID、5000层父链、100轮确定性拓扑修订及生产Viewport的token／无token／Game分支。日志sparse-scene-{tests,final-tests,typecheck}.log位于tmp/docs-artifacts/editor-performance-risk。

实际DotA作者场景微基准使用0a60b6f前后实现、14437实体及49个裸路径GLB预览，保留原有fragment边界回退。解析节点14437→5377，5371个浏览器条目、边界、辅助覆盖层及保留节点的完整变换值一致。12轮交替，排除2轮预热，10组各24帧：相同固定帧均值0.265521→0.229528ms；新修订每轮在计时外创建新的实体数组及每帧一个新特效记录，准备均值3.301939→2.586000ms。计时包含派生层级／TRS、浏览器条目、保守边界及辅助覆盖层，不含完整Canvas／UI绘制、原生渲染、模拟或IPC；不能外推实际FPS。复现脚本sparse-scene-bench.mjs、日志sparse-scene-benchmark.log、包含场景及相关源码摘要的sparse-scene-benchmark-summary.json仅保留于tmp/docs-artifacts/editor-performance-risk。

状态：已实现，当前编辑器批次1/3；待另外两项独立任务后统一原生构建，复验DotA的父链／选取／主节点与多选操作、辅助图形、透明切换、无token回退、资源热更及多窗口，并对比paintStages.world和持续FPS。最近真实运行结果仍为9c251d1的DotA Scene51.70／Game59.93FPS，稳定满帧与完整War3保真继续待办。

第一百零七阶段补充：不透明且有原生token的显示帧，即时变换仅供选择操作、相机／灯光／Spine覆盖层及粒子／拖尾状态使用；普通浏览器节点的完整条目和父链在该帧首次普通命中查询时生成。空间边界与视锥候选随后按同一固定帧计算，完整命中结果缓存一次；原生网格仍按显示token选取。旧帧捕获独立的选区副本，后续选区、相机、透明模式或世界修订不改写旧帧数据；延迟准备不推进Spine状态。透明、无token及Game保留各自即时路径。此补充属于同一任务，计数仍1/3。

44项相关检查和TypeScript通过，覆盖首次查询前不解析普通节点、灯光与混合渲染状态仍即时、旧帧恢复／选区原地修改、透明切换、视锥排除及作者顺序、重复查询复用、失败重试、Spine推进及分段计时；延迟浏览器边界不读取原生网格预览版本。实际DotA作者场景选择一个网格时，即时解析5377→6节点、即时条目5371→1，点击时仍恢复完整5371个浏览器条目；绘制输入、辅助图形、保留变换、命中边界及空间候选顺序一致。日志deferred-scene-{final-tests,query-tests,frame-tests,typecheck}.log。

对照3580fb8的12轮交替微基准，2轮预热，10组各120帧：相同不透明固定帧均值0.181945→0.018548ms；新不透明修订2.717726→2.024139ms；每30帧一次命中查询2.671435→2.093199ms；新透明修订2.580525→2.659146ms，透明样本略增，集成时继续观察。独立冷缓存12轮／排除2轮的首次绘制均值9.316520→2.668300ms，紧接的首次点击准备0.284320→6.441270ms，合计9.600840→9.109570ms；每轮重新创建派生层级、条目、边界和索引缓存，JS代码与资产字节已预热。延迟准备将成本移到实际点击，不代表物理输入延迟。上述计时不含完整Canvas／UI、原生渲染、模拟及IPC，不外推FPS。

本地复现脚本deferred-scene-{bench,cold-bench}.mjs、日志及两个benchmark-summary.json在tmp/docs-artifacts/editor-performance-risk，记录源码和场景摘要。批次原生验收增加首次点击、连续空节点／Sprite／相机辅助选择、透明切换、重复／旧帧查询、Spine与混合粒子状态检查，并对比真实paintStages.world、输入操作往返与持续FPS。


### 第一百零八阶段／编辑器批次任务2/3：按需计算Game呈现标记

变更packages/editor/src/nativeViewportPresentation.ts及nativeViewportPresentationFlags.test.mjs。Spine存在与浏览器交互快照标记在首次读取时计算，按固定实体记录数组缓存真／假结果；Scene不读取时免除两次全量扫描。无Spine的Game帧复用缓存的否定结果，跳过Spine条目收集。保持原有局部active判定、非活动Spine存在标记、枚举时的布尔字段、相机单独发布与旧显示帧语义。

新增5项和既有22项定向检查通过，TypeScript通过；日志presentation-flags-{tests,typecheck}.log。实际DotA作者场景14437实体，对照58457db的独立读取器12轮交替／排除2轮预热，10组各120帧：新不透明修订浏览器准备2.003232→1.510236ms，透明2.645024→2.182571ms；仅Game标记与Spine条目读取0.701847→0.525838ms。绘制输入、完整浏览器命中／边界／顺序一致，即时6节点／1条目、完整命中5371条目未变；此作者夹具无Spine与交互控件。计时不含完整Canvas／UI、原生渲染、模拟及IPC，不是实际FPS。复现与摘要presentation-flags-{bench.mjs,benchmark.log,benchmark-summary.json}保留于tmp/docs-artifacts/editor-performance-risk。

当前批次2/3，第三项后统一构建与原生验收；增加无Spine的Game、含Spine与交互控件的快照路径、场景修订／相机单独发布及透明切换，合并107的实际DotA与多窗口检查。最近真实运行仍为9c251d1，稳定满帧与长期驻留继续待办。


### 第一百零九阶段／编辑器批次任务3/3：复用未变化的Scene UI输入与画布

变更packages/editor/src/nativeViewportPresentation.ts、panels/Viewport.tsx及nativeSceneUiReuse.test.mjs。固定显示帧的UI子集在记录身份、数量与顺序完全一致时复用数组，避免无关网格／特效修订使布局缓存失效。场景Canvas栅格缓存按该UI子集而非整个世界数组判断来源；投影、选择和标签仍每帧绘制。UI记录、保留祖先／相机、层级、根节点、顺序或画布范围改变仍重建；原有250ms刷新与资源事件清理保留。可变编辑数据不进入拥有固定记录的呈现读取器，通用UI子集读取器语义不变。

新增3项与既有15项定向检查、TypeScript通过，包含实际retainPlayWorldPatch增量、旧帧、UI文字／激活／相机／层级／根变更、空子集、完整布局对照及生产Viewport画布分支执行。该分支验证无关世界不重绘像素、UI／范围改变、250ms刷新与资源失效后重绘，而投影／选择／标签每次执行。日志owned-scene-ui-{tests,typecheck}.log。

实际DotA作者场景14437实体、7个UI相关实体，120次模拟60Hz无关特效修订，UI子集数组120→1份；按生产250ms条件的布局缓存重建120→8次。子集值／当前记录所有权及完整屏幕／世界UI布局一致。该计数并非CPU或FPS测量，含UI／相机记录变化的帧仍会重建。脚本owned-scene-ui-counts.mjs、摘要json和日志位于tmp/docs-artifacts/editor-performance-risk。

107（含补充）、108、109现达3/3。接下来统一前端及Tauri Release构建，复验实际DotA的原生选取、首次延迟命中、透明／姿态／资源热更、Game含控件／Spine、项目重开与多窗口；采样paintStages.world／ui、持续FPS和内存。复用未受影响的导入转换与全量资产检查；未完成集成前不将上述源代码检查写成实际运行验收。


### 第一百零七至一百零九阶段合并原生验证

3580fb8（含58457db补充）、ad7641c、2573607已提交推送。合并61项变换／呈现／延迟命中／UI定向检查通过。前端Vite构建3.13秒；最终命令cargo build -p mengine-editor-tauri --release --features custom-protocol构建1分09秒通过，仅已有world_from_snapshot未使用警告。固定程序tmp/docs-artifacts/editor-performance-risk/build-2573607/mengine-editor-tauri.exe，SHA256为650705e7406fc04321cd04523cf70a5163d182100b7ea4d30fa942e095127204；receipt.json记录源码、前端摘要与完整构建命令。

首轮构建遗漏custom-protocol，QA spatial-picking-1792844280020停在前端就绪前，没有执行测试；验证所属命令行与固定程序后停止该测试脚本、正常关闭其后台编辑器，进程及discovery随后消失。该构建与收据保留为initial-no-custom-protocol*，未作为验收程序。最终空间QA spatial-picking-1792844562501的6项热更／父变换／原点在相机后／姿态与锁定／透明切换／空节点选取通过，透明1→0→1对应浏览器drawItems 0→1→0。空辅助节点首次动作即选中，UI动作及选择RPC往返64.683ms，不是物理输入延迟。

Spine首轮spatial-picking-1792844589849图像动画／暂停／点击保持静止通过，但未固定背景的不透明分支计数断言为1而非0，未记为通过；正常关闭等待超时后确认进程与discovery已退出。夹具明确禁用环境背景、设置alpha1并等待分支计数，保留drawItems=0与spineSkeletons=1断言。最终spatial-picking-1792844902432通过：3张运行动画图像不同，暂停与延迟点击后的图像相同。图像已检查。

实际DotA_v6.83d.w3x的B001/arbitrary-map-1792844935595匹配缓存加载14437实体，2.679秒；进度、选取、返回、Stop、关闭重开通过。Game59.66／Scene57.25FPS，前次59.93／51.70；Scene最近240间隔均值17.466ms、P95 28.7ms，原生渲染均值16.345ms（前次16.453）。浏览器paint桶均值8.354→5.999ms，覆盖334次绘制的加权均值5.991ms。CPU分段世界准备4.826→2.293ms、UI 2.380→2.518ms；UI实际运行未改善，继续定位。其他段为请求0.470、世界合成0.630、操作0.060、最终合成0.021ms。Scene仍5376总对象／5342可见／4675网格调用／153材质来源及解析，未减少几何或新增LOD。短窗口有改善，不能严格归因单项或宣称稳定60FPS。

DotA 3次地图动作与选取RPC为192.734／174.690／164.702ms；并未证明首次物理点击延迟改善。进程树PrivateBytes关闭前／欢迎页／重开6737.58／2371.95／3323.42MiB。0控制台错误断言在关闭重开之前。Game／Scene及Profiler CPU页图像已检查；CPU页是暂停后最近桶，与连续运行均值区分。

B001/map-session-1792845027720的7434实体三窗口重开／修订追赶、Pause／Step／快捷键、Stop、作者编辑undo／redo及停靠通过。Scene58.09／Game55.64FPS，前次57.47／55.89；原生渲染均值8.513／10.241ms，浏览器paint桶均值3.851／1.967ms。Scene世界准备4.042→2.092ms、UI 1.082→1.093ms，覆盖288次绘制；Game覆盖282次。CPU六段覆盖、逐桶合计及加权汇总断言通过。进程树PrivateBytes为5138.23／6854.73／7950.76／6520.68MiB（detach前／三窗口／重载／Stop停靠），Stop后仍高于起点，长期驻留未解决；Scene图像已检查。

最终4项QA均0控制台错误、正常退出，用户编辑器64664保持运行；WebView EPERM缓存保留。构建与QA日志owned-ui-batch-*、分段校验assert-owned-ui-batch-profile.py、运行摘要owned-ui-batch-runtime-summary.json均在tmp/docs-artifacts/editor-performance-risk，B001报告及截图只在tmp/docs-artifacts/testing-batches。复现使用同一固定程序依次执行qa-viewport-spatial-picking --opacity-cases --pose-cases及--spine-only、qa-frost-map-import实际DotA缓存／profile／pick／project-reopen／profiler-ui、qa-frost-map-session --detached-profile-only。未重复不受影响的转换和全资产检查。本批验收完成，下一批0/3；继续定位UI及原生整帧成本，稳定满帧、长期驻留、LOD、姿态聚焦范围、alpha选取、完整JASS／DotA玩法与War3保真仍待完成。


### 第一百一十阶段／编辑器新批次任务1/3：固定UI记录跳过重复拓扑解引用

变更packages/editor/src/ui/uiLayout.ts、nativeViewportPresentation.ts及ownedSceneUiTopology.test.mjs。新增拥有固定记录的UI子集读取入口，逐项比较上一数组中的记录引用；未替换记录不再读取ID、父节点及Canvas／Camera组件，替换记录仍检查既有拓扑签名，拓扑变化重建完整索引。当前帧记录和作者顺序保留，不缓存可变编辑数据；原有实时入口继续观察原地修改。21项定向检查和TypeScript通过，覆盖固定记录访问次数、增量修订、旧帧恢复、重排／根节点／重复ID／缺失与循环父链、100轮拓扑修订及实时编辑。

实际DotA作者场景14437实体、7个UI相关记录，独立读取器12轮交替／排除2轮预热、10组各120帧：仅无关特效记录变化的拓扑读取0.213044→0.064036ms；同时替换相机与UI文字记录0.222220→0.066373ms。成员、顺序及当前记录所有权一致。计时只含子集拓扑读取，不含构造呈现记录、激活判断、完整UI布局／绘制、原生、模拟和IPC，不代表UI整段或FPS。日志owned-ui-topology-{tests,typecheck,benchmark}.log、复现owned-ui-topology-bench.mjs及摘要位于tmp/docs-artifacts/editor-performance-risk。

本项为新批次1/3，原生集成及实际UI收益待三项后合并验证；后续覆盖UI／相机／祖先变化、编辑原地修改、场景切换及多窗口。最近已验收的实际DotA Scene仍为2573607的57.25FPS／UI2.518ms，稳定60与长期驻留继续待办。


### 第一百一十一阶段／编辑器批次任务2/3：复用未变化的Canvas投影像素

变更packages/editor/src/ui/sceneCanvasProjection.ts及sceneCanvasProjection.test.mjs。每个目标Canvas的独立WebGL投影器保留上一份实际上传的Float32顶点；纹理来源／显式版本／尺寸、投影顶点和输出尺寸全部相同时复用已保留的绘制缓冲，避免重复clear、顶点上传和drawArrays。仍逐帧在调用者当前裁剪／合成状态下合成，并保留外部选择描边。相机／DPR／目标变换、裁剪多边形／UV／源范围、源尺寸／版本／身份变化重绘；输出resize即使归一化顶点相同也重绘；无版本的源继续每次上传及绘制，context loss／GPU容量及CPU回退语义保留。每个目标最多保留一份顶点数组，窗口之间不共享画面。

6项定向检查和TypeScript通过，含60次完全相同投影仅1次GPU命令计划、60次目标合成；覆盖上述输入变化、输出resize、空裁剪多边形、无版本源、不同窗口和context恢复。该命令计数通过WebGL测试替身验证，不是实际GPU像素或性能测量。日志cached-ui-projection-{tests,typecheck}.log位于tmp/docs-artifacts/editor-performance-risk。

本项为批次2/3，第三项后合并原生验证实际Canvas画面、相机旋转／resize／DPR、UI文字与资源刷新、选择和多窗口，并对比paintStages.ui。需要确认真实运行的GPU投影路径及收益，不能据命令计数声明已改善DotA UI或FPS。


### 第一百一十二阶段／编辑器批次任务3/3：Stop释放原生Play世界镜像

变更crates/mengine-editor-host/src/play_runtime.rs。Stop和新会话递增版本后，释放Game／Scene／相机预览中较早会话的空闲镜像；忙碌镜像通过持有其Arc的回收线程等锁释放后清理，不阻塞新会话初始化。锁获取后再比较版本，保留已被新渲染替换的镜像；迟到的旧Stop不触发回收。现有绘制中源记录持续有效，旧帧结果仍按原会话规则拒绝，CPU与GPU渲染资源的其他缓存未改变。

新最小复现先失败：Stop和脚本worker屏障后发布历史为空，镜像仍有1个实体／保留源记录。修复后3项新增及26项既有运行时检查通过，4项原有性能基准按ignored保留未执行。新增覆盖三份空闲镜像和弱引用释放、绘制中Stop／不等待重启、旧Stop、锁释放竞争与较新镜像保护；已有阻塞绘制、独立视图、修订过期、脚本／物理和作者快照检查一并通过。日志play-mirror-release-{before,final-tests}.log位于tmp/docs-artifacts/editor-performance-risk。测试证明记录与镜像释放，不代表进程PrivateBytes／长期驻留问题已全部解决。

110、111、112达3/3。接下来统一前端与带custom-protocol的Tauri Release，检查真实GPU Canvas投影与像素、相机／resize／资源刷新、实际DotA和多窗口重开／Stop／快速重启，比较UI分段及进程树内存。对照最近2573607的DotA Scene57.25FPS、UI2.518ms；多窗口Stop停靠6520.68MiB仍高于起点5138.23MiB。未执行的原生验收保持待测。


### 第一百一十至一百一十二阶段合并验证

49d04dd、92ae27c、90c5501已提交推送。27项前端定向检查与29项运行时检查通过，4项原有ignored基准未运行；前端生产构建3.13秒、cargo build -p mengine-editor-tauri --release --features custom-protocol构建1分14秒通过，仅已有world_from_snapshot未使用警告。固定程序tmp/docs-artifacts/editor-performance-risk/build-90c5501/mengine-editor-tauri.exe，SHA256为26dcbafddc124ec7a75dc03549aada2963abd0fdb6efbeb85ab552e5bbb9c616；收据记录源码和前端摘要。

Canvas投影在实际AMD Radeon RX6800XT／ANGLE D3D11中对照49d04dd源码。152对完整RGBA画面一致，17组范围包含固定输入、相机与透视权重、目标变换、DPR和resize、裁剪三角形、UV与源范围、显式纹理更新／源尺寸、copy／source-in／destination-in／xor合成、无版本更新和context loss／恢复。固定120帧真实WebGL绘制120→1、纹理上传1→1；全部阶段绘制152→16、纹理上传10→10。通过实际GPU函数计数与像素读回验证，不是替身，也不是编辑器原生RHI调用数／FPS。tmp/docs-artifacts/editor-performance-risk/gpu-projection-check保存HTML、前后编译源码、完整结果、截图及摘要；prepare-gpu-projection-check.mjs生成源码。测试页和本地HTTP服务已关闭。

B001/arbitrary-map-1792846818895以实际DotA匹配缓存加载14437实体，2.598秒；进度、三次地图选取、返回、Stop及项目关闭重开通过，0控制台错误断言在关闭重开前，正常退出。Game59.99／Scene58.58FPS，前次59.66／57.25；Scene最近240间隔均值17.070ms、P95 26.2ms、原生渲染均值16.266ms（前次16.345）。浏览器paint桶均值5.999→5.633ms、覆盖345次绘制的加权均值5.633ms；UI 2.518→2.141ms、世界准备2.293→2.315ms。其他段为请求0.447、世界合成0.649、操作0.056、最终合成0.025ms。仍5376总对象／5342可见／4675网格调用，没有新增LOD或削减几何。短窗口不足以证明稳定60或单项因果。

DotA 3次动作及选取RPC为185.878／180.409／163.535ms，不是物理输入延迟。进程树PrivateBytes为6430.21／2125.21／3386.07MiB（关闭前／欢迎页／重开），完整长期驻留仍未证实。Scene、Game及暂停后Profiler CPU页图像与连续采样分开检查。

B001/map-session-1792846908698完成7434实体的原有六项：三窗口重开与修订追赶、Pause／Step／快捷键、Stop恢复、作者编辑undo／redo及停靠。其五秒采样与这些检查发生在新增重启检查之前，均保留为有效局部证据。Scene57.77／Game55.66FPS，前次58.09／55.64；原生渲染8.557／10.127ms、浏览器paint桶3.549／1.958ms。Scene覆盖280次、世界准备2.034ms、UI 1.093→0.852ms；Game覆盖282次。逐桶六段合计、覆盖及加权断言通过。进程树PrivateBytes为5320.32／7200.48／7883.43／6196.53MiB（detach前／三窗口／重载／Stop停靠）；前次起点5138.23、结束6520.68MiB。本次结束仍高于起点，不能据此宣称Stop全进程驻留已解决。

该报告整体保留失败状态：尾部新增重启用例漏了地图列表翻页，选择内置MOBA，随后map为null的Amazonia断言失败；诊断中的mode=playing、mapChoice=1及Ancients地图对应此选择。QA脚本补齐与初次选择相同的翻页操作，进入前断言Map name=Amazonia，并新增--restart-only定向入口。未重复已通过的六项和连续采样。相同固定程序的B001/map-session-1792847109619定向重测通过：初次加载地图并Stop、重新Play显示新菜单、再选Amazonia并获得新的Game图像、第二次Stop恢复完整作者内容且dirty=false。两次Stop后PrivateBytes 5319.93／5238.88MiB；这是独立短流程，不与多窗口结束值混作连续测量。重测0控制台错误、正常退出；多窗口首轮同样无错误级日志且正常退出。

原始失败报告没有修改或重标通过。局部采样校验assert-ui-mirror-batch-completed-profiles.py明确保留overallReportPassed=false，只接受上述已完成六项与指定尾部夹具失败；整份DotA及重启重测仍各自要求passed=true。构建／QA日志ui-mirror-batch-*及ui-mirror-batch-runtime-summary.json位于tmp/docs-artifacts/editor-performance-risk，截图和JSON只在tmp/docs-artifacts/testing-batches。复现实际DotA沿用缓存／profile／pick／project-reopen／profiler-ui；多窗口为qa-frost-map-session --detached-profile-only --restart-after-stop，失败尾部可单独--restart-only。未受影响的空间／Spine检查复用上一批。所有所属QA编辑器正常退出，EPERM的WebView缓存保留，用户编辑器64664未重启。

本批所需范围验证完成，下一批0/3。继续定位浏览器UI和原生16ms整帧瓶颈、Stop后的其他驻留资源；稳定60FPS、多窗口、LOD、姿态聚焦范围／alpha选取、完整JASS／DotA玩法及War3保真继续待办。


第一百一十一阶段补充：source-over且无滤镜／阴影范围扩展时，Scene投影只合成实际Float32齐次顶点的保守像素范围，四边留1像素并裁到输出尺寸；要求权重为正且有限。完全离屏／空几何可省略无效合成。目标敏感的合成模式、滤镜／阴影及不安全权重保留整幅合成，画布清理、GPU缓存、当前裁剪与透明度语义保留。此项属于投影优化的补充，不计独立任务，下一批独立任务计数仍0/3。

8项定向检查、TypeScript和实际AMD／ANGLE D3D11对照通过：27组场景、172对完整RGBA一致；GPU绘制23／23、纹理上传11／11未变。120个固定输入夹具每帧合成面积196608→73326像素；全部阶段总面积60948480→27492442，离屏／空几何使合成调用172→168。覆盖亚像素与越界位置、DPR／resize、相机、纹理更新、部分globalAlpha、滤镜／阴影回退、负权重、空几何、copy／source-in／destination-in／xor及context恢复。面积／调用数不是实际CPU或FPS收益。复现prepare-gpu-projection-crop-check.mjs及gpu-projection-crop-check的源码、HTML、结果和截图均在tmp/docs-artifacts/editor-performance-risk；页面及HTTP服务已关闭。日志cropped-ui-projection-{tests,typecheck}.log。原生DotA／多窗口集成和UI计时待下一批合并，不复跑未受影响的原生与地图全检。


### 第一百一十三阶段／编辑器新批次任务1/3：原生绘制bundle构建与命中取证

变更RHI的FrameSubmissionProfile、editor-host视口计数、editorProfiler.ts和Profiler面板。将原本仅cfg(test)的world_bundle_builds／world_bundle_hits计数用于生产构建，按当前提交累计实际构建和复用次数（含嵌套视图）；首次只登记候选而未构建仍为0／0。JSON以worldBundleBuilds／worldBundleHits提供，Profiler Overview显示当前值，受限的nativeTimings逐帧响应也携带它们。旧采样没有字段时保持缺失，界面显示—，不按0计。

18项前端Profiler检查及TypeScript通过。新增实际editor-host／RHI GPU集成检查用128个固定对象依次验证候选0／0、构建1／0、命中0／1，三个阶段完整RGBA一致，serde输出字段与提交统计对应；不是只在RHI cfg(test)中运行计数。日志world-bundle-profile-{tests,typecheck,host-test}.log位于tmp/docs-artifacts/editor-performance-risk。

当前独立批次1/3，常规原生回归仍待三项合并。上一已验收实际DotA的单个最近样本世界编码3.853ms，但此前生产输出缺少bundle命中证据，无法判定缓存是否有效。为确定下一项优化方向，需要一次带计数的实际DotA最小诊断（统一正确Release后仅缓存进入／profile，不执行项目重开、多窗口或全资产覆盖）；属于继续定位必需的即时检查，结果单独登记，不将整个待测批次提前标绿。Canvas局部合成补充随同一程序观察，尚不代表完整原生回归。


第一百一十三阶段即时定位：为确定后续缓存改进方向，构建bb11f29正确Release（前端3.19秒、原生1分22秒），固定程序build-bb11f29/mengine-editor-tauri.exe的SHA256为25064a2e16a35babfee7b4fd54f65c04a5aed5270b6a4e7d326189fc58233b8d。实际DotA缓存进入后的Game与Scene各取得240个连续完成帧，逐帧计数均为非负整数。Scene的(builds,hits)分布为(0,0)195帧、(1,0)41帧、(0,1)4帧；Game分别72／62／106帧。复用发生于Scene的4/240和Game的106/240帧；这是所有采样帧分布，不当作未知准入次数的命中率。

B001/arbitrary-map-1792848530368整体报告保留失败：两个连续采样已完成，后续新增界面断言未能从语义快照读取静态指标卡片名称，未完成返回／Stop等后续断言。finally正常关闭所属编辑器，未把该诊断当作整份地图QA通过。完整采样单独保存在bundle-evidence-summary.json，显式记录overallReportPassed=false及采样范围。Scene短窗口56.91／Game59.55FPS、原生均值16.543／12.428ms；浏览器Scene paint5.796ms、UI2.160ms。前次UI2.141ms，此次没有测出局部合成补充的实际UI改善；不能将复制面积变化外推FPS，后续继续观察。

指标卡片增加group语义和包含当前数值的可读名称。仅对该界面问题重建前端3.01秒／原生1分11秒，没有重复实际地图采样；build-bb11f29-readout的SHA256为395b10a824889502830cb2701852df5d229dde336eeb4968b1647050c4518a4f，收据另记录Profiler源文件及前端摘要。新增scripts/qa-profiler-bundles.mjs使用128个固定对象的小型独立工程，B001/profiler-bundles-1792849169077通过生产计数／逐帧响应和真实Profiler名称数值读取，界面显示World Bundle Builds: 0、World Bundle Hits: 1，截图已检查；0控制台错误、正常退出。--bundle-ui用于以后地图诊断时读取这两项，并要求--profiler-ui。日志bundle-{evidence,readout}-*与JSON／截图均在tmp/docs-artifacts，用户编辑器64664保持运行。

后续先区分整份绘制列表、GPU资源句柄及共享绑定变化导致的失效，再决定分段复用方案。常规原生回归仍留待三项合并；本补充及界面修复同属113，独立任务计数仍1/3，未提前完成整个新批次。

### 第一百一十四阶段／编辑器新批次任务2/3：按连续范围复用世界绘制指令

变更RHI的world_bundles.rs／renderer.rs、editor-host视口计数、editorProfiler.ts和Profiler面板，以及相关GPU检查与QA脚本。相邻实例合并后按至少256条绘制指令划分连续范围，大列表自适应扩大范围以限制至64段；保持当前透明排序、对象参数槽和全部绘制顺序。每段仍逐项核对pipeline、纹理、顶点／索引缓冲、索引数、对象槽和实例数，以及全局／阴影／环境绑定、采样数和stride。首次登记候选，第二次构建，其后复用；变化分段可直接绘制，其余已缓存分段继续执行。缓存总预算仍为32768个逻辑对象，最多64条目，按世界pass推进闲置时间并在超过8次未使用后清理。预算满时优先替换同范围旧版本，避免局部变化淘汰本次尚未遍历的其他静态范围。

生产计数新增worldBundleDraws与worldBundleReusedDraws，分别表示新建／复用bundle覆盖的绘制指令及已有bundle复用的绘制指令，均为相邻实例合并后的命令数，不是实例／实体数。逐帧nativeTimings保留它们，Profiler Overview显示Reused World Draws；旧采样缺失继续显示—。QA的--bundle-ui及128对象夹具增加该指标的后续原生断言。

2项新增实际GPU检查、1项既有资源兼容检查、1项editor-host实际GPU／serde检查，以及2项前端计数检查通过，TypeScript和两个QA脚本语法检查通过。1024条交替网格命令中连续6次替换第370项的GPU缓冲，每次首次只失效对应256条，其余768条继续复用，随后该段构建并全部复用；与禁用bundle的完整RGBA一致。另含8阶段跨段透明重叠／排序、纹理alpha／shader／网格与环境替换、相机／对象参数、对象增减／容量增长及resize完整RGBA对照。17000和32768条指令的自适应范围、64条目／逻辑对象预算压力、局部替换保留其他范围及9个空pass回收通过。既有检查另覆盖阴影、动态顶点内容、粒子回退和资源移除。证据world-chunks-{tests,compatibility,host-test,profiler-tests,typecheck}.log位于tmp/docs-artifacts/editor-performance-risk。

针对本项性能取舍单独执行benchmark_sparse_resource_world_chunks：两个独立预热Renderer、4096条交替网格命令、12轮交替顺序、每样本4帧，逐帧完整RGBA一致。每帧替换一个网格缓冲时，世界编码CPU样本中位数为整份缓存1.934950ms、分段0.623350ms；分段复用3840条，整份缓存0条。完全静态时为0.513313／0.536563ms，分段增加0.023250ms。该固定代理几何基准不包含地图逻辑／IPC，不是实际DotA的GPU时间或FPS；world-chunks-benchmark.log保留实际输出。其手动ignored入口已单独执行通过，不据常规测试中的ignored状态声称未执行。

当前113、114为2/3。实际DotA的完整失效原因比例仍未测定，下一次合并构建后需读取逐帧复用命令覆盖，比较Scene／Game编码及连续FPS，验证真实Profiler读数、相机／resize、透明／shader／姿态资源变化、嵌套视图与多窗口、Stop／重开。继续保留111局部Canvas合成的原生收益待测；本次没有重跑完整地图QA、全量资产遍历或Tauri生产构建，没有新增LOD／减少场景对象，也未宣称稳定60FPS。

### 第一百一十五阶段／编辑器新批次任务3/3：共享未变化的不可变层级结果

变更core的transform_hierarchy.rs／transform_hierarchy_cache.rs及相关检查。TransformHierarchy通过Arc持有只读节点表。渲染器所属缓存逐项比较全部存活实体的作者顺序、代次、稳定层级版本和活动状态，包含未激活祖先；全部相同时返回共享结果，省去递归解析和整份节点表分配。Transform／Parent／活动状态、生成与销毁、遍历顺序、世界身份及计数回绕变化仍经过既有解析器。存在自定义Any动态投影时禁止整帧复用；新结果与已显示旧帧的只读节点独立。输入数组复用容量并在世界缩小时收缩，缓存只保留当前一份结果，已无消费者的旧表释放。

14项层级定向检查通过，4项手动基准在普通检查中忽略；新增的不可变帧基准单独执行通过。覆盖60次只改MeshRenderer仍共享节点、父变换后旧帧不变、弱引用释放、稀疏／未激活祖先、环与作者顺序、代次复用、序列化修改和自定义投影视图；与无状态解析器逐项结果一致。证据immutable-hierarchy-{tests,benchmark}.log位于tmp/docs-artifacts/editor-performance-risk。以保留的DotA导入工程作者快照4374实体运行两个独立预热缓存，9个测量组／每组40帧：不变输入旧入口0.182192ms／共享0.010815ms，仅MeshRenderer材质变更0.174673／0.011055ms；稀疏Transform更新0.169932／0.174810ms，增加0.004878ms。基线入口固定4b63aab，只适配只读结果的Arc包装；计时外逐项比较输出。该4374实体作者快照不是运行中14437实体的全图负载，不能作为实际FPS结论。

113、114、115达到3/3。接下来在同一提交版本统一前端与带custom-protocol的原生Release，合并检查Profiler计数／界面、实际DotA连续Scene／Game及复用命令覆盖、相机／resize／透明与资源更新、嵌套和多窗口、Stop／关闭重开。按影响选择core层级、RHI分段缓存及相关宿主／前端检查；不重复未受影响的地图转换与全量资产遍历。原生验证结果仍待登记，完整War3保真、稳定60FPS、LOD和长期驻留继续未完成。

### 第一百一十三至一百一十五阶段合并验证

5e507b6整合113、114、115。前端生产构建3.15秒、带custom-protocol的原生Release构建1分35秒通过；固定程序build-5e507b6/mengine-editor-tauri.exe，SHA256为f13c885af35b04f3fd3d3748ee2f3b30ad8491aeb94a0fbf04b4e909827382d9。receipt.json保留源码及前端摘要。core库37通过、7项手动基准忽略，前端Profiler18通过；114的GPU／宿主检查和已单独执行的两项基准复用既有结果，不重复未改变的GPU夹具及全量资产遍历。

B001/spatial-picking-1792852216644完成6项原生检查：网格热更、父级替换、原点在视野后的可见几何、姿态／锁定选取、透明切换、空节点首次选取。B001/profiler-bundles-1792852694991完成128对象夹具的生产计数及实际语义读数，World Bundle Builds=0、Hits=1、Reused World Draws=1；实际DotA的读数为0／19／4675。两份报告通过，无错误日志、正常退出。场景／姿态、游戏、多窗口与Profiler图像已检查，原始PNG／JSON仅存tmp。

B001/arbitrary-map-1792852278723完整流程通过：实际DotA缓存进入2.302秒、14437实体，连续Scene／Game采样、三次全图选取、进度与返回、Stop及项目关闭重开。Game59.98／Scene58.02FPS，Scene平均原生15.893ms、浏览器paint5.540ms、UI2.171ms；上次完整验收90c5501为Game59.99／Scene58.58FPS、原生16.266ms、UI2.141ms，未证明稳定满帧或UI收益。仍5376对象／5342可见／4675网格指令／1123实例组内对象，无LOD削减。三次动作与选取RPC为173.566／164.092／160.143ms，不是物理输入延迟。错误日志断言在关闭重开前；后续重开场景及新Game图像单独通过。

240个Scene完成帧中182帧复用分段，逐帧复用命令均值1079.458、范围0–4675；Game为99帧、均值40.654。113的整份缓存诊断Scene仅4帧复用，但两种粒度不同，不能把帧数差当成同一种命中率。当前Scene覆盖均值仍不高。最新一个Scene样本的层级／世界编码为0.139／2.745ms，Game层级为1.136ms；均为单帧，不代表这些阶段的持续均值。

B001/map-session-1792852382058的7项多窗口／Stop后重启检查通过，Scene57.43／Game56.06FPS、平均原生8.495／10.065ms；前次57.77／55.66FPS。Scene浏览器paint3.730ms、UI0.8505ms（前次0.8518），仍未稳定60。Scene／Game分别覆盖301／273次浏览器绘制，各240个原生间隔；分段复用发生于18／236帧。相同程序的四份原生报告均正常退出，QA编辑器与发现文件已关闭，WebView的EPERM缓存保留，用户64664未重启。assert-ranges-hierarchy-batch.py逐项核对帧计数、分段覆盖与paint六段之和／加权；ranges-hierarchy-batch-runtime-summary.json保留结果与限制。

本轮发现旧内存采样的PID父链可混入PID复用前的系统进程：DotA报告中csrss45480／winlogon20360于10月23日创建，却沿已复用的父PID32984进入10月24日的QA进程树。原始数字保留，但本批不用于驻留比较；采用旧采样器的历史数据也需按新口径复测。sample-native-qa-memory.ps1改为校验根与每级父子创建时间，并在读取内存后再次核对进程身份，输出samplingSchemaVersion=2及创建时间；只统计可验证的存活父链，孤儿进程排除，working set仍可能重复计算共享页。5个定向场景通过，覆盖父PID复用、逆序清单、根身份失效和CIM时间精度；现有64664的只读实机采样仅包含编辑器与6个WebView进程。没有重跑已通过的地图／多窗口流程，新口径的Stop与长期驻留比较保留待测。

本批功能与连续帧采样范围完成，新独立任务计数0/3；内存比较仍在待测队列。复现日志ranges-hierarchy-batch-*及memory-identity-*均位于tmp/docs-artifacts/editor-performance-risk。下一步继续定位实际分段失效与网格源校验尖峰、Game层级变化及Scene整帧成本；稳定60FPS、长期驻留、LOD、姿态聚焦／alpha选取、完整JASS／DotA玩法及War3保真尚未完成。

第一百一十五阶段补充：致密世界的局部层级更新使用紧凑父子索引，只重新解析数值变化节点及其活动后代；原生版本变化但Transform位模式及Parent未变时继续共享只读结果。逐项检查全部存活实体的顺序、代次、活动状态和稳定版本。父级／活动／代次／顺序／世界变化、自定义Any、稀疏槽、小于256实体或变化范围超过ceil(实体数/8)时保留完整解析。局部变化导致的大子树回退可继续复用已验证的拓扑与子树规模，结构变化清理索引；空世界释放索引。仍需扫描输入，真实数值变化时复制只读节点表，不宣称总复杂度降为仅与变化量相关。变更core的hierarchy cache及两个增量实现／检查文件，Scene的snapshot_world增加实际消费者检查，既有基准只适配解析器的retained参数。

17项core层级检查及1项真实SharedSnapshotWorld消费检查通过，普通检查忽略5项手动基准；新增基准另行执行通过。覆盖64轮局部／父子重叠更新、移除／恢复Transform、无效浮点、旧帧独立、失活／环／代次／顺序／世界切换、自定义动态投影、大子树与多个小分支合计越限、重复大子树更新不重建拓扑，以及镜像只改网格姿态仍共享结果、真实Transform变化正确更新。镜像apply_record会重新安装变化实体的组件，因此其未变化Transform也可能提升版本；本项在消费端核对实际原生值，不改变镜像写入或普通实体版本语义。

以缓存DotA的14437实体地图Scenes/Main.mscene为输入，固定f68f6ce入口对照、独立预热缓存、9组每组40帧，计时外逐项核对完整结果。旧／新CPU中位数：无变化0.039442／0.046270ms，64个Transform只变版本1.005273／0.050630ms，单节点数值变化0.967712／0.486862ms，小分支0.945395／0.467913ms，大分支1.157375／1.165285ms，密集更新2.078507／1.959693ms。单节点及小分支含预热各440次使用增量解析；大分支和密集更新均走完整路径。该固定地图输入不是持续播放FPS或GPU测量，密集路径的样本差不外推收益。命令：设置MENGINE_HIERARCHY_PROJECT及MENGINE_HIERARCHY_SCENE后运行cargo test -p mengine-core --release benchmark_sparse_hierarchy_frames -- --ignored --nocapture；日志sparse-hierarchy-{tests,map-benchmark,mirror-test}.log与输入／源码摘要在tmp/docs-artifacts/editor-performance-risk。

本补充同属115，不新增独立任务，计数仍0/3。实际Game／Scene、多窗口、相机／父子活动切换与动画热更的原生集成随下一批合并；最近完整原生结果仍为5e507b6的DotA58.02／59.98FPS，未把该结果归给补充实现。新口径内存驻留比较继续待测。

### 第一百一十六阶段／编辑器新批次任务1/3：播放镜像按组件更新

变更mengine-scene的snapshot_world.rs／entity_reference.rs及新增snapshot_world_component_tests.rs。普通内建组件的唯一源记录比较前后组件JSON，只移除已删除的组件、替换变化值，保留未变化的Transform和其他数据；名字、活动／兄弟顺序、标签及层仍正确更新。替换无效值前移除旧typed组件，保留既有序列化数据行为。带实体引用、TimelineDirector、引用字段注解、别名、未知组件或显式Name／Parent／Children的记录沿用完整应用，保留引用重映射和整份记录错误处理。重复源ID记录完整应用，并跟踪其组件基线是否可靠；后续唯一记录完整重建后恢复组件增量，删除源ID时清理该状态。实体／源ID映射、遍历顺序、父子维护与时间／选择元数据路径保持完整。

12项镜像定向检查通过，普通入口忽略2项手动基准；新基准单独执行通过。包含新增4项与固定9f352cb实现的逐项对照，覆盖组件增删、无效typed替换／恢复、名字来源、别名／未知数据、父子／活动／顺序／代次／反向更新、相同JSON的新Arc无世界写入、重复ID转回唯一记录及状态释放。13种独立相机／UI回调字段各自验证目标删除与恢复，另核对Timeline和动态注解错误恢复；比较完整规范化世界、缓存名字及native到源ID的映射。既有115镜像消费检查仍通过，未变化Transform保持只读层级结果共享。证据component-delta-world-tests.log；初始重复记录差异与基准缺省position夹具的诊断日志单独保留，未修改失败日志冒充通过。

14437实体地图输入、固定9f352cb入口、独立预热镜像、9组每组40次交替更新，计时外核对全部值与源ID映射。旧／新同步CPU中位数：无记录变化0.275298／0.286840ms，64条网格变化0.475627／0.331977ms，64条Transform变化0.456593／0.322547ms，512条网格变化2.586083／0.963520ms，64条名字／标签／层变化0.454575／0.321267ms。测量不含脚本、IPC、层级构建和GPU，不是实际FPS；静态样本增加0.011542ms。设置MENGINE_HIERARCHY_PROJECT及MENGINE_HIERARCHY_SCENE后运行cargo test -p mengine-scene --release --lib benchmark_snapshot_component_deltas -- --ignored --nocapture，日志及输入／源码摘要component-delta-world-*位于tmp/docs-artifacts/editor-performance-risk。

当前独立批次1/3，115稀疏层级补充一并待原生集成。第三项后统一构建，验证实际DotA／多窗口连续帧、姿态／材质／组件增删、实体引用和UI事件／Timeline、选择／父子切换、Pause／Step／Stop及项目关闭重开；使用版本2采样器继续Stop／长期驻留比较。本次未重跑整库测试、完整地图QA或Tauri构建，最新完整原生验收仍为5e507b6。稳定60FPS、LOD与完整War3保真继续未完成。

### 第一百一十七阶段／编辑器新批次任务2/3：播放Scene复用覆盖层Canvas

变更Viewport.tsx、uiLayout.ts及3份相关检查。原生3D Scene在播放时也使用既有单覆盖层Canvas的布局与整张纹理投影缓存；保留每帧相机／视口投影、独立逐Graphic命中几何、选择框和Canvas名称。UI记录、逻辑分辨率、选择、资源事件或250ms异步资源刷新使相应缓存失效。Spine／Effekseer、展开下拉、Canvas遮罩、多Canvas及Camera／WorldSpace继续沿用逐图元路径。ColorTint尚未到达目标色时通知缓存逐帧重绘，结束后恢复像素复用；SpriteSwap的Scene命中数据直接解析当前Normal／Disabled纹理，不依赖逐图元绘制写回。

新增检查先在旧代码复现播放状态没有surface。42项针对性前端检查、4项既有投影兼容检查及TypeScript通过。覆盖真实生产准备分支、40次无关播放记录变化、相机／尺寸立即重新投影、选择／分辨率／资源刷新、编辑／播放与非原生模式转换、7类回退及恢复、禁用SpriteSwap命中源，以及ColorTint连续采样和结束后复用。命令：node --test packages/editor/tests/{nativePlaySceneUi,nativeSceneUiReuse,canvasRenderer,sceneCanvasProjection,uiMultiCanvasLayout}.test.mjs（PowerShell逐项传入文件名）；兼容检查用canvasRenderModes.test.mjs的single overlay Canvas surfaces、large offscreen text、Canvas masks retain、projected Canvas selection名称筛选。日志play-scene-ui-{before,tests,typecheck,layout-compatibility}.log位于tmp/docs-artifacts/editor-performance-risk。

独立Chrome夹具执行生产准备／光栅代码及实际AMD RX6800XT／ANGLE D3D11 WebGL。50次缓存与强制重新光栅化的完整RGBA对照通过，逐项核对命中几何和实际选取；包含相机、resize、选择、文字、分辨率、250ms刷新、资源清理和近面裁切。最初41个UI未变的播放帧只准备一次覆盖层、上传一次纹理并执行一次GPU投影，画面仍每帧合成；全部50个状态共9次GPU投影／7次上传，强制重新光栅化参考为50／50。该夹具不是完整编辑器地图、CPU耗时或FPS测量。截图已检查，报告、PNG、源码摘要及复现脚本保存在tmp/docs-artifacts/editor-performance-risk/play-scene-ui-gpu-1792859134602及verify-play-scene-ui-gpu.mjs；两次早期夹具路由／比较元数据诊断保留原始失败证据。

本项修复播放路径的缓存缺口，作为独立任务117；当前116、117为2/3。第三项后统一正确Release，测量实际DotA的Scene UI／paint／原生连续帧及Game、多窗口，并复验按钮变化／自定义动画／遮罩、resize／旋转／选择、Pause／Step／Stop／重开；与115稀疏补充、116组件增量及版本2驻留采样一起集成。本次未重跑完整地图QA、Tauri构建或全量资产；最新完整原生结果仍为5e507b6，尚不能证明本项提高地图FPS。

### 第一百一十八阶段／编辑器新批次任务3/3：相邻帧节点查询结果复用

变更mengine-script的asset_nodes.rs及新增asset_nodes_cache_tests.rs。连续帧查询同一来源、姿态、采样率及完整options时复用已序列化结果；每次请求仍规范化项目和文件路径，每帧首次使用来源仍验证main／buffer依赖，失效时移除来源及全部结果后重新加载。相机与attachmentsOnly参与原有精确键，不复用不同请求；项目切换清空缓存。未在相邻帧使用的结果于第二次begin_frame清理，仍受每来源128条／512KiB结果字符串及既有来源数量／文件字节预算约束。返回值仍独立复制，未取消VM解析或文件检查。

V8与QuickJS各7项定向检查通过，普通入口各忽略1项手动基准；基准另行执行通过。覆盖连续40帧复用、闲置释放、epoch回绕、main／外部buffer修改及删除恢复、项目切换、同帧主文件删除仍拒绝、姿态／采样率／相机／options隔离、条目数及大于512KiB结果不入缓存；既有ScriptHost计数、路径边界及API封装继续通过。命令：cargo test -p mengine-script --release --lib asset_nodes -- --nocapture，另以--no-default-features --features quickjs-runtime执行同一筛选；手动入口benchmark_adjacent_node_query_results -- --ignored --nocapture。日志node-result-cache-{tests,quickjs-tests,benchmark}.log在tmp/docs-artifacts/editor-performance-risk。

基准使用Frostbound两份human模型目录的7个不同模型首部件，包含建筑、狮鹫／龙鹰及肖像；独立预热缓存、48帧、9组交错CPU样本，完整输出逐项相等。对照保留b14cc1d每帧清空结果的策略，其余查询路径相同。旧／新每帧查询CPU中位数：姿态不变0.925219／0.855321ms，两个渲染帧共用姿态0.969825／0.916344ms，姿态持续变化0.898900／0.905762ms，相机持续变化0.839429／0.842096ms。前两项48帧的采样／序列化从336次降为0／168次，后两项仍336次；持续变化的增加分别为0.006863／0.002667ms。含路径与依赖校验和缓存维护，不含VM、脚本玩法、渲染或FPS。早期仅建筑部件的输入及修正对照清空策略前的诊断日志独立保留，不作为最终结果。

116、117、118达到3/3，开始同版本Release合并验证，115稀疏层级补充一并纳入。待实际DotA的UI／paint／原生连续帧、Game、多窗口、动态UI与空间选取、Pause／Step／Stop／项目重开及版本2内存采样；本项CPU结果不代替地图或长期驻留验收。

### 第一百一十六至一百一十八阶段合并原生结论

统一ec31723的前端与custom-protocol Release，前端构建总计8.78秒（Vite阶段3.19秒）、原生95.15秒；冻结程序SHA256为b4607e7fd76c70ab25e492d2c287e2e6c07e857e9bf3e873c2f09a6bbcd289b6。B001/spatial-picking-1792860232725的6项选取／热更／姿态检查、arbitrary-map-1792860276960的实际DotA导入／连续采样／选取／进度／返回／关闭重开、map-session-1792860355107的7项多窗口／Pause／Step／Stop后编辑及重启、profiler-bundles-1792860445764的小型计数界面检查均通过。四份报告使用同一程序，错误断言为0，正常关闭所属编辑器；DotA错误断言仍在项目关闭重开前，后续重开图像另行检查。Profiler实际地图显示0次构建／19次命中／4675条复用指令。场景、游戏、姿态、多窗口、重新进入和Profiler图像已检查。用户编辑器64664保持运行，QA的WebView缓存EPERM保留，不删除锁定目录。

实际DotA为14437实体，缓存进入2.322秒，仍5376对象／5342可见／4675条世界网格指令／1123实例组内对象，无LOD削减。相较上一完整验收5e507b6，Scene为58.02→59.65FPS、原生平均15.893→15.196ms、浏览器paint5.540→3.525ms、UI2.171→0.347ms；Game为60.00FPS、原生11.693ms。两视图各240个完成间隔，Scene／Game的p95间隔为25.1／22.4ms，仍不能证明稳定满帧。Scene有166帧复用bundle，平均1195.546条指令；Game为98帧、平均40.238条，不能把bundle覆盖当成帧率收益。最新单个Scene样本仍有网格同步7.812ms，其中来源校验5.156ms、文件metadata1.342ms；它们是单帧取证，不是持续均值。

多窗口为7434实体，Scene59.86／Game56.67FPS（上次57.43／56.06），原生平均7.863／9.557ms；Scene paint2.717ms、UI0.296ms（上次UI0.8505ms）。Scene／Game的p95间隔24.4／26.4ms，Game仍未稳定60。逐帧计数、paint分段总和及加权样本由assert-ranges-hierarchy-batch.py校验，两份新profile摘要保留全部字段；component-ui-node-batch-runtime-summary.json另核对四份报告、程序摘要、正常退出和内存口径。没有将单次样本或减少采样次数的CPU基准外推为持续FPS。

版本2内存采样已完成同进程的短流程取证：DotA进程树私有内存关闭前6922.62MiB、关闭工程2288.21MiB、重新打开2868.11MiB，均7个进程。多窗口为起点5258.24MiB／7个进程、三面板7200.43MiB／10个、重载地图7628.28MiB／10个、Stop并停靠6624.68MiB／7个、第二次Stop6382.27MiB／7个（约6.23GiB）。采样逐项核对创建时间、成员类型及私有字节总和；旧PID-only结果不参与比较。两次Stop后仍高于本次起点，尚未证明长期稳定或解决驻留问题；working set不用于求独占内存，孤儿进程不在统计范围。

本批功能／连续帧及版本2短期采样范围完成，下一批独立任务计数0/3。前述115／116的层级、组件／引用／Timeline定向结果及117的动态UI／回退／GPU像素结果按无相关改动复用，本次没有把它们改写为新增原生交互覆盖。原始日志component-ui-node-batch-*、冻结程序与收据build-ec31723、所有PNG／JSON均在tmp/docs-artifacts；docs仅保留结论。后续优先来源校验尖峰与多窗口整帧、Stop后驻留；长期内存、LOD、姿态聚焦／alpha选取及完整JASS／War3保真继续未完成。

### 第一百一十九阶段／编辑器新批次任务1/3：过滤Scene镜像归属播放会话

变更editor-host的play_runtime.rs／scene_snapshot_world.rs及新增play_filtered_scene_tests.rs，Tauri的lib.rs／native_viewport_lifetime.rs同步接入。按隐藏列表与祖先活动状态过滤发布快照，再直接更新播放会话拥有的同一份Scene世界；原始发布快照仍交给回调，Game／Camera Preview保留各自世界。源ID选取映射在Scene镜像锁内完成，包含隐藏／恢复后实体槽代次变化。Stop／重启沿用会话的镜像退役与代次检查，移除项目级FILTERED_PLAY_SCENE_WORLD及重复的完整世界物化；不在Stop重建GPU设备。

37项针对性检查通过：新增3项（含1项真实GPU）、既有3项过滤／编辑镜像、29项播放生命周期及Tauri的2项项目视口释放。普通播放检查另忽略4项既有手动基准，新模块忽略1项新增基准；新增基准已单独执行通过。验证闲置Stop释放记录的Weak引用、忙帧与Stop／重启交错及旧Stop不清除新会话、Game／Preview隔离，以及6阶段隐藏／恢复、Transform／父级／活动修改、反向请求旧revision的完整RGBA和384次选取对照。Tauri测试同时完成当前接入代码的编译；未重跑完整地图QA或打包构建。日志owned-filtered-world-{tests,runtime-compatibility,tauri-compatibility}.log位于tmp/docs-artifacts/editor-performance-risk。

以摘要匹配的14437实体DotA地图快照、独立预热镜像、9组每组40次交错更新作CPU对照，计时后比较完整WorldSnapshot。541d0c2的完整镜像后再过滤策略与当前实现均包含镜像锁、快照释放及回调路径。旧／新中位数：无过滤0.327828／0.311750ms，静态过滤2.516355／2.144865ms，过滤并交替修改64个Transform为2.670120／2.196878ms。过滤场景中渲染镜像实体合计从25188降到10751，消除一份14437实体的完整渲染镜像；这不是进程私有内存字节或实际FPS测量。命令：设置MENGINE_FILTERED_SCENE后运行cargo test -p mengine-editor-host --release --lib benchmark_owned_filtered_scene_world -- --ignored --nocapture；输入与源码摘要为owned-filtered-world-summary.json。调整两路径计时范围前的诊断日志独立保留，不用作最终结论。

当前新批次1/3。第三项后统一原生验证隐藏／恢复、变更父级与活动、普通／过滤Scene及相机预览切换、选取源ID、Pause／Step／Stop与项目关闭重开，并以版本2采样重复Stop驻留。最近完整原生程序仍为ec31723，本项尚未证明其可回收多少进程内存；长期驻留、来源校验尖峰、多窗口稳定60、LOD和完整War3保真继续待办。

### 第一百二十阶段／编辑器新批次任务2/3：区间计算世界包围盒

变更RHI的spatial.rs及新增spatial_bounds_tests.rs。仿射矩阵按各输出分量的系数符号选择局部边界端点，以两组向量计算世界最小／最大值，沿用glam transform_point3的乘法与加法顺序。保留旋转、父级剪切、非均匀与负缩放；退化／反向局部边界、非有限值和溢出的处理与八角点参照一致。非仿射矩阵继续沿用角点路径及其断言行为。每次仍读取当前网格边界和最终model，不新增跨帧缓存、不改变八叉树或相机／阴影查询规则。

默认向量后端10项空间检查、标量后端4项兼容检查通过；普通入口分别忽略2／1项手动基准，新区间基准单独执行通过。覆盖100000组确定性有限浮点输入（含输出溢出）、旋转／剪切／镜像／零尺度、反向与零尺寸边界、subnormal／极值／NaN／Infinity及抵消、非仿射回退，并比较八叉树查询和移动／未知边界变化。命令：cargo test -p mengine-rhi --release --lib spatial:: -- --nocapture；标量兼容用--features glam/scalar-math筛选spatial::bounds_tests。日志interval-bounds-{tests,scalar-tests}.log在tmp/docs-artifacts/editor-performance-risk。

10000对象的固定CPU微基准，两个预热步骤后9组交错样本、每组100次，完整输出与原八角点计算逐项相等。轴对齐旧／新为0.348030／0.146317ms，旋转／剪切／镜像为0.343235／0.144550ms。包括输出数组写入，不是实际地图、GPU或FPS测量；输入是固定代理边界和矩阵，没有重新遍历地图资产。手动入口benchmark_interval_bounds -- --ignored --nocapture，结果及源码摘要interval-bounds-*均保存在tmp。

当前119、120为2/3。第三项后统一原生构建，验证实际DotA／多窗口连续帧、动态姿态和网格替换、相机／阴影裁剪、负缩放／父级变化、选取及Stop／重开；119的驻留验证一并执行。最近完整原生验收仍为ec31723，尚不能据微基准声称实际满帧或长期内存已解决。

### 第一百二十一阶段／编辑器新批次任务3/3：对象缓冲复用与局部上传

变更RHI的renderer.rs，新增object_packets.rs和object_packet_tests.rs。每次仍按当前模型、材质和阴影参数计算完整uniform，复用最近排队上传的字节镜像，逐槽比较后合并上传范围；相邻间隔最多256字节、最多8段，变化超过一半或分散过多时完整上传。每个Renderer最多保留8MiB逻辑字节镜像，不保存场景或材质所有者；空列表和超预算释放镜像，超预算沿用完整打包路径。对象GPU缓冲替换和未完成准备使下次完整上传，缩小／增长及嵌入Scene视图按当前内容同步。

3项定向检查通过，普通入口忽略1项手动基准，基准另行执行通过。包含字节镜像、padding、局部与乱序范围、容量／清空／超预算、准备中断；真实GPU在indexed storage与dynamic uniform两种布局完成11阶段各3帧，共66帧完整RGBA对照，涵盖材质／阴影、旋转／剪切／负缩放、可见性与槽顺序、resize、增减对象、网格替换、清空恢复及独立嵌入Scene图像，GPU错误作用域无错误。命令：cargo test -p mengine-rhi --release --lib object_packet_tests -- --nocapture；手动入口benchmark_object_packets -- --ignored --nocapture。日志object-packet-{tests,benchmark}.log保存在tmp/docs-artifacts/editor-performance-risk。

基准使用5376个全部可见的代理对象、64×64离屏目标、两个独立预热Renderer，9组交错有效样本、每组8帧；计时为生产object_uniform_ms阶段，包含实际queue.write_buffer，每帧GPU排空和完整像素比较放在计时之外。旧完整打包／新路径中位数：不变0.659475／0.187038ms、64个模型交替0.668663／0.182663ms、64份材质交替0.652538／0.165525ms、全部模型交替0.618513／0.195613ms。每帧上传从2666496字节分别降到0／31744／31744／2666496字节，保留镜像2666496字节。这是代理几何提交阶段测量，不是实际地图FPS或进程内存结果。

119、120、121达到3/3，提交后统一custom-protocol Release验证：真实DotA及多窗口连续帧、普通／隐藏Scene与源ID选取、材质／姿态／父级负缩放／相机阴影、resize、Pause／Step／Stop／重启、项目关闭重开及版本2内存采样。最近完整原生验收仍ec31723；待本批实际结果后更新结论，稳定60、长期驻留、LOD和完整War3保真继续待办。

### 第一百一十九至一百二十一阶段合并原生结论

统一13ef6a4前端与custom-protocol Release，前端构建8.77秒（Vite3.16秒）、原生80.85秒；冻结程序SHA256为8f716d168dc18f705936671c9cd3e049462202a3d2d79dab0e8ff56880311dc4。B001/spatial-picking-1792866406162的7项空间／播放选取检查、arbitrary-map-1792866460175的实际DotA流程、map-session-1792866532074的7项多窗口与重启检查、profiler-bundles-1792866601668均通过，使用同一程序并正常退出。原生错误断言为0；DotA错误断言位于关闭重开前，重开图像另行检查。新增--play-filter-cases在Stop之间配置子节点／父分支隐藏，验证新播放会话的过滤、恢复完整像素、源ID选取和Game像素隔离，以及编辑父级负缩放后再次Play的选取。播放中的同会话过滤变化由119的GPU定向结果覆盖，不将它改写为本次原生UI覆盖。前期夹具／命令模式诊断报告保留失败状态，仅上述最终报告用于验收。用户编辑器64664保持运行；本批结束仅该编辑器存活。

实际DotA14437实体，缓存进入2.334秒，Scene60.06／Game59.97FPS、原生平均14.861／11.678ms；上一完整ec31723为59.65／60.00FPS、15.196／11.693ms。相同5376对象／5342可见／4675条世界网格调用／1123实例组内对象，无LOD削减。Scene浏览器paint4.080ms、UI0.401ms，上次3.525／0.347ms，未证明浏览器阶段改善。两视图各240个完成间隔，p95为24.4／22.1ms，仍不能证明稳定60。最新单个Scene的对象参数0.384ms、来源校验5.526ms、metadata1.247ms、网格同步8.061ms，均为单样本而非阶段均值。实际Profiler仍显示0构建／19命中／4675条复用指令。

多窗口7434实体，Scene59.20／Game55.56FPS、原生8.106／9.667ms；上次59.86／56.67FPS、7.863／9.557ms，本次没有证明多窗口整帧改善。p95间隔26.5／29.0ms，Scene paint2.881ms、UI0.296ms。assert-ranges-hierarchy-batch.py核对实际逐帧bundle计数、paint分段总和与加权样本；summarize-object-packet-batch.py核对四份报告、EXE摘要、正常退出与版本2内存身份和求和，输出object-packet-batch-runtime-summary.json。对象参数局部上传的收益以121的交错代理几何对照为依据，不能用单次地图采样代替因果对照。

版本2短期内存：DotA进程树私有内存关闭前6409.36MiB、关闭工程2293.11MiB、重开2833.03MiB，均7进程；多窗口起点5265.91MiB／7进程、三面板6874.74MiB／10进程、地图重载7682.64MiB／10进程、Stop停靠6218.13MiB／7进程、第二次Stop6122.23MiB／7进程（约5.98GiB）。多窗口根进程从4396.14到5184.49MiB，仍高于起点；上批两次Stop为6382.27MiB，但不同运行的短样本不能独立归因或证明长期回收。旧PID-only结果不参与比较，共享working set不当作独占字节，孤儿进程不在采样范围。

本批功能／连续帧和版本2短流程验收完成，下一批独立计数0/3。已检查隐藏恢复、负缩放、实际Scene／Game、相机预览、Profiler和多窗口重启图像；119／120／121无后续产品代码变化，复用其定向结果。冻结程序、收据、原始日志、PNG／JSON均在tmp/docs-artifacts；docs只保留结论。后续继续来源校验尖峰、多窗口整帧与长期驻留，稳定60、LOD、姿态聚焦／alpha选取及完整JASS／War3保真保持待办。

### 第一百二十二阶段／编辑器新批次任务1/3：并行轮询网格来源

变更runtime的meshes.rs，新增mesh_source_poll.rs和mesh_parallel_validation_tests.rs。轮询帧中至少32个被引用的已缓存姿态来源，通过既有JobSystem拆为最多4个校验任务；每个任务串行检查本段文件，全部完成后把有效stamp和prepared状态交给既有单次sync检查表。main和嵌入视图共用结果。Shared与render-only来源继续调用原validate_at，保留请求路径身份、主文件及外部依赖的修改检测；无效来源进入原串行加载、错误和恢复路径。250ms轮询条件、小列表、冷加载和非轮询帧新姿态检测保持原规则，不增加依赖或跨帧校验缓存。source_check_ms记录批次实际墙钟时间，source_checks记录检查来源次数，无效来源可能再次进入串行检查。

20项相关网格检查通过，普通入口忽略4项手动基准；新增手动基准另行执行通过。新增GPU对照用64个来源（各半Shared／render-only），main与嵌入视图有重叠及独立来源，9阶段共18个主视图完整RGBA与原顺序校验一致；同步比较失败列表、attempted、来源集合、采样顶点、上传／淘汰与缓存字节。覆盖正常轮询、不轮询、外部buffer修改、主文件删除恢复、buffer删除恢复及非轮询帧请求新姿态；完成任务后Weak来源引用可释放。其他兼容检查覆盖billboard相机、轮询／热更新、路径和既有资源恢复。命令：cargo test -p mengine-runtime --release --lib meshes:: -- --nocapture --test-threads=1。日志parallel-source-compatibility-tests.log在tmp/docs-artifacts/editor-performance-risk；初版单来源类型检查的日志另行保留。

CPU对照使用已保留的196份DotA自包含GLB文件清单，5376条循环引用、预热后9组交错样本，每组20次。测量当前生产billboard预备路径，包含新增并行预检的对象扫描／去重、stamp表、共同的对象复制及相机key改写；对照只跳过预检，保留原顺序validate_at路径。旧／新每次中位数9.122745／6.088905ms，196个校验stamp与5376个最终mesh key逐项一致。不是实际地图帧率、GPU或进程内存测量，没有重跑全量资产遍历。命令：设置MENGINE_METADATA_PATHS为metadata-probe-paths.txt、MENGINE_METADATA_PROJECT为对应保留工程，运行cargo test -p mengine-runtime --release --lib benchmark_parallel_source_validation -- --ignored --nocapture；最终日志parallel-source-benchmark.log。仅比较底层校验调用的早期原型日志不用于此生产预备路径结论。

当前新批次1/3。第三项后统一custom-protocol Release验证实际DotA／Amazonia及多窗口来源校验尖峰、整帧间隔、模型与外部buffer热更新、选取／相机／预览、Stop／重开及版本2驻留采样；当前原生验收程序仍13ef6a4，本项尚未证明实际满帧改善。JobSystem为既有全局执行器，最多4个任务指每次sync批次，不是全进程线程上限；后续原生验收需关注多窗口并发下的开销。长期内存、LOD及完整War3目标保持待办。

### 第一百二十三阶段／编辑器新批次任务2/3：按播放代次退役Scene选取快照

变更Tauri的lib.rs／native_scene_picking.rs，新增native_scene_picking_lifetime_tests.rs。工程替换、开始Play和Stop后，用当前播放代次更新选取注册表的单调下限，在同一互斥锁内移除更早快照并拒绝旧代次发布；晚到的旧帧不会移除同窗口的新快照，晚到的旧Stop不会倒退下限。token继续递增，项目／窗口归属及既有帧数／字节预算不变。正在读取的Arc快照可完成自身工作，调用者仍按原代次检查拒绝失效查询结果；完成读取后自然释放。工程关闭继续通过既有视口生命周期排空和注册表清空，不重置Renderer或GPU设备。

5项定向检查通过：选取注册表3项（2新增，含1项真实GPU几何），工程关闭／镜像兼容2项。GPU测试从实际离屏提交捕获实体73的三角形，移除Renderer的该网格后由注册表／在途读者持有；退役使注册表测试载荷320→0字节，在途读者仍准确选中73，释放读者后Weak几何及Weak帧失效。新会话的真实几何选中91，旧发布和旧退役不破坏新快照，最终退役释放新几何。线程屏障检查旧发布晚于退役、三个窗口的新快照保留、代次不倒退；既有检查保留窗口／项目隔离、12帧／每窗口3帧／256MiB保守预算及关闭后旧请求失效。命令：cargo test -p mengine-editor-tauri --release --lib native_scene_picking -- --nocapture，以及筛选native_viewport_lifetime。日志pick-generation-{tests,project-compatibility}.log在tmp/docs-artifacts/editor-performance-risk；早期离屏夹具的失败日志保留，不作通过证据。

这是已失效选取快照的所有权修复。注册表预算按帧保守累计几何，释放的唯一几何字节取决于其他所有者；320字节是定向夹具的逻辑计数，不是实际地图内存收益，256MiB预算也不能解释全部约5.98GiB驻留。当前122、123为2/3，第三项后统一原生验证实际Scene选取、隐藏恢复／项目切换、Stop／再次Play及多窗口长驻留，122的来源校验和并发路径一并合并。最近原生验收仍为13ef6a4，长期内存、稳定60、LOD和完整War3保真继续待办。

### 第一百二十四阶段／编辑器新批次任务3/3：普通UI文件纹理驻留预算

变更runtime的textures.rs，新增ui_texture_retention.rs和ui_texture_retention_tests.rs。普通UI文件纹理记录最近使用帧及成功上传的RGBA8逻辑字节；超过120个渲染帧闲置，或缓存超过128项／64MiB时，优先移除闲置最久的GPU纹理及其attempt记录，再次出现按既有路径加载。当前帧引用始终保留，当前资源本身超过预算时允许超出，预算约束可回收闲置项。工程根变化把旧拥有项排队，在下次sync开始时移除；invalidate后仍保留GPU所有权记录，闲置淘汰不遗漏。字体、相机视图和white保留既有独立路径，3D材质与UI材质变体继续各自管理。文件stamp检查及加载失败时保留现有纹理的行为不变，不改变alpha命中缓存。

6项针对性检查通过：3新增（2项GPU）及3项材质／Sprite／UI材质兼容。覆盖帧龄边界、epoch回绕、数量／字节压力与当前帧超预算保护；GPU验证闲置淘汰后返回的完整RGBA一致、invalidate后淘汰、同mtime但长度变化热更新、删除错误去重与恢复、工程切换／清空，以及字体／相机／3D材质隔离。130份1×2纹理当前全需时保留130份，下一帧仅引用1份后保留128份，两项闲置GPU资源确认已移除，剩余RGBA8逻辑载荷1024字节。这是夹具资源检查，不是进程或驱动分配字节。命令：cargo test -p mengine-runtime --release --lib ui_texture_retention -- --nocapture --test-threads=1；兼容筛选material_sync_preserves_variants_hot_reload_removal_and_project_ownership、sprite_subresources_compose_uvs_and_share_the_base_texture_batch_key、sparse_ui_material_textures_stay_warm_but_the_cache_is_bounded。日志ui-texture-retention-{tests,material-compatibility,sprite-compatibility,custom-compatibility}.log均在tmp/docs-artifacts/editor-performance-risk。

122、123、124达到3/3，提交后统一custom-protocol Release验证实际DotA、Amazonia、多窗口、Scene选取／Stop重启、来源校验并发及帧间隔、菜单／地图纹理返回与热更新，并增加同进程多轮Stop驻留采样。当前最近原生程序仍13ef6a4，尚未据预算或夹具声称实际内存下降；隐藏视图不产生渲染帧时不推进120帧闲置计数，长期驻留、稳定60、LOD和完整War3目标继续待办。

### 第一百二十二至一百二十四阶段合并原生结论

统一036f284前端与custom-protocol Release，前端构建8.64秒（Vite3.21秒）、原生78.72秒；冻结程序SHA256为071f5825b9ae7ccae48747e6ce447e07516548965fd739bf02fa2286fc5707d7。B001/spatial-picking-1792868773656的7项选取／隐藏恢复／跨Play代次检查、arbitrary-map-1792868810072的实际DotA流程、map-session-1792868881400的7项多窗口及3轮延伸流程、profiler-bundles-1792869083299均通过并正常退出，使用同一程序、错误断言为0。DotA错误断言仍位于关闭重开前，重开图像另行检查。已检查真实Scene／Game／相机预览、Profiler、菜单重开、多窗口、各轮Amazonia和负缩放重启图像。用户编辑器64664保持运行；验证结束仅该编辑器存活。

DotA14437实体，缓存进入3.312秒，上次同流程2.334秒，本次没有证明进入速度改善。Scene59.84／Game60.01FPS、原生平均14.771／11.415ms，上次13ef6a4为60.06／59.97FPS、14.861／11.678ms。相同5376对象／5342可见／4675调用／1123实例组内对象，无LOD削减。Scene paint3.836ms、UI0.384ms；两视图各240个完成间隔，p95为25.6／23.2ms，上次24.4／22.1ms，仍未稳定60。最新单个Game有7次来源校验／0.509ms；最新Scene未发生来源校验，不能把它写成校验平均0ms或尖峰已消失。122的CPU对照按其定向结果保留，不由本次单样本推断阶段收益。实际Profiler仍0构建／19命中／4675复用指令。

多窗口7434实体，Scene59.19／Game56.24FPS、原生8.081／9.343ms，上次59.20／55.56FPS、8.106／9.667ms；p95间隔25.6／27.1ms，仍未稳定满帧。Scene paint2.956ms、UI0.300ms。assert-ranges-hierarchy-batch.py核对逐帧计数与paint分段／加权样本；summarize-source-pick-ui-batch.py核对四份报告、程序摘要、正常退出、版本2进程身份／求和及延伸采样阶段，输出source-pick-ui-batch-runtime-summary.json。没有将本次小幅整帧差异归因于单个改动。

新增qa-frost-map-session.mjs --residency-cycles 3，在同一进程内额外三次进入Amazonia，每次运行15秒、Stop恢复作者内容、空闲20秒后采样。每轮约43.95／44.47／44.28秒，整个多窗口流程201.91秒；该参数允许0到5，需搭配--detached-profile-only --restart-after-stop。14份版本2采样的根PID及创建时间一致，三个空闲点均7进程。根进程私有内存依次5247.38／5492.90／5769.68MiB，同等空闲阶段从第一轮到第三轮增加522.30MiB；进程树对应5824.59／6063.64／6392.68MiB，增加568.09MiB。Game各轮live样本姿态缓存均约31.36MiB、4059项，当前已统计逻辑估算约115MiB；它不覆盖全部原生对象和驱动分配，不能据此归因。重复驻留仍增长，长期内存验收未通过，不能把123／124所有权修复写成完整解决。

同次多窗口起点5229.46MiB／7进程、三面板6983.55MiB／10进程、地图重载7804.50MiB／10进程、Stop停靠6706.99MiB／7进程、第二次Stop6486.88MiB／7进程。各延伸轮Stop后再等20秒时部分内存回落，因此使用三个同等空闲点作重复趋势比较。DotA关闭前6788.89MiB、关闭工程2688.39MiB、重开3324.23MiB，均7进程。不同运行的私有内存差异不作单项改动因果对照；旧PID-only结果不参与比较，working set不当独占字节，孤儿进程不在范围。

本批功能／连续帧及延伸采样已执行完，下一批独立计数0/3；重复驻留增长保留在失败／待修队列，优先继续定位其原生所有者或分配保留路径。原始PNG／JSON／日志及build-036f284收据都在tmp/docs-artifacts，docs只保存结论。稳定60、多窗口整帧、来源校验尖峰、长期内存、LOD、姿态聚焦／alpha选取和完整JASS／War3保真继续待办。


### 第一百二十五阶段／编辑器新批次任务1/3：原生渲染包资源退役

工作区通过 Cargo.toml／Cargo.lock 固定使用 third_party/wgpu 的 24.0.5 副本。上游 gfx-rs/wgpu 的 99e6524b2b03cc35733f199bb5cb28787e8d42de 提交、crates.io 包校验值、179份原始文件哈希及双许可证均保留，维护入口 README-MENGINE.md。上游原生 CoreRenderBundle 只保存ID，没有释放实现；API句柄消失后，core表仍持有渲染包及其材质纹理。补丁仅让该包装保存context，在最后一个API句柄释放时调用 render_bundle_drop。已提交命令的core跟踪器保留正常所有权，不提前销毁纹理，不增加GPU等待，不改变缓存容量／淘汰规则。

新增RHI的 material_texture_lifetime_tests.rs 及模块入口。2项真实GPU回归通过：上传／提交后不先等待GPU即移除纹理，12个空帧及完成等待后，连续4轮分配均归零；另验证两个克隆句柄、跨线程最终释放，以及同路径线性／sRGB变体分别退役。修复前最小复现失败：引擎包缓存已为空，仍保留1份384KiB材质分配；关闭包缓存的4轮对照均归零。既有 cached_world_bundles_preserve_dynamic_pixels_and_resource_replacements 也通过，覆盖动态uniform／相机／材质、纹理／网格／环境热更新、粒子及完整RGBA对照。命令：cargo test -p mengine-rhi --release --lib material_texture_lifetime -- --nocapture；兼容检查按上述完整函数名筛选。日志 material-texture-lifetime-{before,tests}.log、material-texture-no-bundles-before.log、material-texture-pixel-compatibility.log 均在 tmp/docs-artifacts/editor-performance-risk。

保留的Amazonia工程用于同条件单视口诊断：每轮60个VM步、Stop后121个作者场景帧及20秒空闲，共3轮，不含WebView或IPC。修复前材质GPU分配40／57／74份、107.1875／207.375／307.5625MiB；修复后均31份／67.25MiB，所有GPU分配项数均2132，当前材质缓存均30彩色／1数据／20绑定。活跃GPU总分配467.3125／469.125／469.0625MiB，剩余差异来自其他标签。修复前后进程首末空闲私有内存仍分别增加276.1914／277.7422MiB，没有据纹理释放声称整个进程驻留改善。它与旧930步探针不是同负载；本地 native-gpu-texture-lifetime{,-after}.log、material-texture-probe-summary.json 保留具体数据。临时allocator诊断接口已从产品移除，诊断补丁及独立探针源码只保存在tmp。

前端构建及custom-protocol原生Release已完成，原生81秒；已知失败的原生多窗口／3轮Stop驻留范围已复核，见下段。全批其他地图／选取／Profiler检查待累计3项后合并执行，当前1/3。风险为所有原生渲染包的退役链路，待批次覆盖实际DotA、Scene／Game／相机预览、隐藏恢复、热更新、项目关闭／重开及多窗口；完整长期内存、稳定60、LOD和War3保真仍待办。


原生map-session-1792872217387报告通过，10项功能记录包含分离Game重开／追帧、三面板帧、暂停／单步、快捷键、Stop完整作者世界恢复、作者编辑／undo／redo及4次再次Play；错误日志0，进程42340正常退出。冻结程序build-task125/mengine-editor-tauri.exe的SHA256为44e1bd85f13fed4934f786da74e64db07904b68e2f140b46ff370247f9419b37。已核对Scene及第三轮Game真实图像，用户编辑器64664保持运行。临时QA runtime目录存在权限残留，原始报告及目录留在tmp，程序退出与发现文件移除均已确认。

版本2的14份私有内存采样均核对相同根进程PID／创建时间、各子进程创建先后和求和；三个等时空闲点均7进程，每轮实际运行15秒、Stop后空闲20秒。根进程4551.2383／4665.3125／4691.3594MiB，首末仍增加140.1211MiB；进程树5143.8359／5195.3594／5229.0547MiB，首末增加85.2188MiB。此前036f284记录分别增长522.3008／568.0938MiB，但两次运行的私有字节不可直接用于单项因果归因；本次仍未达到长期稳定验收。三面板时6580.5664MiB、重载7499.9375MiB、Stop停靠5885.7930MiB、第二次Stop5855.6680MiB均为本次进程树。material-texture-native-summary.json保留程序摘要、身份核对、功能结果、各阶段及周期；本轮修复完成并登记新批次1/3，剩余驻留增长及稳定60继续跟进。


### 第一百二十六阶段／编辑器新批次任务2/3：材质绑定失效时退役渲染包

变更RHI的renderer.rs／world_bundles.rs，新增material_bundle_retirement_tests.rs。材质纹理成功上传、移除或移除变体时，统一清空材质绑定表和它对应的渲染包。缓存命中要求精确GPU绑定句柄相等；原绑定表清空后，旧包已无法再命中，及时退役可释放其资源所有权。普通帧继续复用现有包，非法上传及移除不存在键保留缓存。已提交命令通过既有core跟踪器持有资源并按原提交生命周期完成。

1项新增GPU回归、125阶段2项GPU生命周期兼容及既有完整RGBA兼容均通过。新增回归在修复前失败：热替换后保留2份材质GPU分配，实际只需要1份；修复后替换、移除变体及移除全部均在0个额外视口帧时释放旧资源，实际命中包、非法上传／空移除保留、红蓝替换及重新加载完整像素相等均已检查。125回归继续覆盖尚未等待GPU的提交退役、4轮分配归零、克隆及跨线程最终释放；完整RGBA回归覆盖动态相机／uniform、网格、纹理、环境与粒子。命令：cargo test -p mengine-rhi --release --lib，分别筛选material_changes_release_obsolete_bundle_textures_before_another_frame、material_texture_lifetime、cached_world_bundles_preserve_dynamic_pixels_and_resource_replacements；日志material-bundle-retirement-{before,after,lifetime-compatibility,pixel-compatibility}.log均在tmp/docs-artifacts/editor-performance-risk。

对同一保留Amazonia工程做修复前后各8轮单视口对照，每轮60个VM步、Stop屏障、121个作者场景帧及20秒空闲，两个独立进程均完成。125版本第2到第8轮私有内存净变化0.5078MiB、范围2052.3906–2068.3477MiB，表明该短负载主要在第二轮预热到平台；它不能证明真实多窗口长期稳定。126版本8轮GPU保留空间均640MiB，125版本为首轮640、后7轮896MiB；两侧每轮活跃材质均31份／67.25MiB、GPU分配项均2132。第2–8轮进程私有均值2059.2160→1798.3488MiB，减少260.8672MiB；新范围1791.4414–1802.8047MiB、首末变化6.0195MiB。该结果是带临时allocator只读诊断的独立进程／单Renderer对照，未覆盖WebView、IPC、多窗口或真实编辑器FPS；不能写成实际编辑器总内存下降260MiB。native-eight-cycle-residency{,-summary}、native-eight-cycle-retirement-after.log及material-bundle-retirement-probe-summary.json保留明细，临时诊断接口已移除。

本轮实现及针对性检查完成，当前125、126为2/3。第三项提交后合并构建同一原生版本，检查实际DotA／Amazonia、Scene／Game／相机预览、热更新、隐藏恢复、Stop／再次Play、关闭工程与多窗口长驻留；剩余完整JASS、War3保真、LOD及稳定60继续待办。


### 第一百二十七阶段／编辑器新批次任务3/3：显示帧浏览器消费者索引

新增viewportBrowserConsumers.ts，在NativeViewportPresentation的已拥有显示帧上惰性建立Light2D、ParticleEmitter2D／3D、TrailRenderer2D及SpineSkeleton的有序实体组。按前一帧相同位置的记录身份复用一字节分类掩码，来源数组只保存WeakRef，记录替换或位置变化即时重新分类。Viewport的Scene准备阶段复用这些组，保留当前帧的激活／变换／模拟／绘制路径；普通可变编辑及Game路径沿用原来源。旧显示帧保持自己拥有的记录与分组，空列表释放分类载荷，缓存不按实体ID跨版本复用。

新增viewportBrowserConsumers.test.mjs的5项检查与原有NativePresentation／flags共22项通过、0跳过，覆盖16种组合、重复ID／顺序、失活记录、多组件、记录替换／旧帧恢复、可变编辑与显示快照隔离、惰性构建、3000个不变记录跨30帧的分类读取复用、GC后旧记录释放。命令：node --expose-gc --test packages/editor/tests/viewportBrowserConsumers.test.mjs packages/editor/tests/nativeViewportPresentation.test.mjs packages/editor/tests/nativeViewportPresentationFlags.test.mjs。前端TypeScript／Vite构建通过。日志browser-consumer-tests.log、browser-consumer-frontend-build.log位于tmp/docs-artifacts/editor-performance-risk。

新增benchmark-frost-browser-consumers.mjs，命令node scripts/benchmark-frost-browser-consumers.mjs；同进程交替对照4次类型筛选与生产索引，每种输入120帧／20帧预热，每帧只测一次首次集合构建并逐项核对相同记录。4374实体作者场景静态0.1121→0.0123ms、1%记录替换0.1236→0.0141ms、全替换0.1075→0.0672ms；7433实体Amazonia对应0.3035→0.0226、0.3063→0.0260、0.2531→0.1352ms。原始browser-consumer-benchmark.json保留来源摘要及全部样本。这是Node集合扫描范围，未覆盖React、激活／变换、特效模拟、IPC或GPU，不能换算为实际2ms世界准备的完整收益或FPS。

125、126、127达到3/3，提交后统一custom-protocol Release执行原生Scene隐藏／恢复／选择、实际DotA、Amazonia多窗口／重启、材质热更新与Profiler包统计，并将同进程Stop驻留延长为5轮。沿用版本2进程身份与等时空闲采样，未完成的长期稳定、满帧、LOD及完整War3保真保留；本批原生结果另记。


### 第一百二十五至一百二十七阶段合并原生结论

统一40be271前端及custom-protocol Release，前端构建8.84秒、原生83秒；冻结程序SHA256为5f544e4ed9244438948039fbba4370cc60f6160888325846f2b8dca0de3f2f40，收据在build-40be271。spatial-picking-1792874358895的7项姿态／热更新／透明切换／跨Play隐藏恢复及源ID选取、arbitrary-map-1792874394955的实际DotA加载／选取／关闭重开、map-session-1792874466542的多窗口／Stop重启及5轮延伸、profiler-bundles-1792874757223四份报告通过，错误断言均0，四个自有测试进程正常退出。DotA的错误断言仍在关闭重开前；重开图像另行核对。已查看DotA Scene／相机预览、重开菜单、Profiler、Amazonia Scene及第五轮Game图像。临时runtime目录权限残留仅保留在tmp，发现文件均已移除；当前用户编辑器64664继续运行。

DotA14437实体，缓存进入2.302秒。Scene59.68／Game59.85FPS，原生平均14.618／11.322ms，p95呈现间隔24.1／21.9ms，仍未稳定60。相同5376对象／5342可见／4675调用／1123实例组内对象，无LOD削减。Scene前端paint3.8358→3.2903ms、world准备2.3049→1.7111ms；Game paint2.7415→2.8611ms、world1.1971→1.2391ms，比较对象为上次036f284同流程，观察值不作单项改动的完整因果归因。原生Profiler界面仍显示0包构建／19命中，小型128对象夹具为0构建／1命中。最新单个Scene来源校验0.182ms，只是单样本，未据此排除校验尖峰。

多窗口7434实体，Scene59.41／Game55.97FPS、原生8.018／9.565ms，p95间隔22.9／26.7ms；上次59.19／56.24FPS、p95为25.6／27.1ms。Scene paint2.9563→2.7185ms、world准备2.0131→1.7201ms；Game paint1.8969→1.9920ms。改善了观察到的Scene准备成本，多窗口Game仍未满帧，不能将局部扫描微基准写成整帧提速。assert-ranges-hierarchy-batch.py核对DotA／多窗口全部呈现计数、paint分段及加权样本，输出ranges-hierarchy-batch-profile-*。

延伸为同一进程5轮Amazonia，每轮运行15秒、Stop后空闲20秒，完整多窗口流程290.71秒。20份版本2采样均核对根PID／创建时间、子进程创建先后、唯一PID及私有字节求和，五个等时空闲点均7进程。根私有内存4600.2344／4678.6836／4696.6250／4715.5117／4699.9805MiB，全程首末增加99.7461MiB；进程树5155.6680／5191.4180／5224.7813／5262.5977／5235.0938MiB，增加79.4258MiB。后三轮根首末增加3.3555MiB、树增加10.3125MiB，呈现预热后平台趋势；这是约5分钟的有界流程，长期稳定尚未证明。较旧版本的重复增长有所收敛，但不同运行／轮数的私有字节不作单项因果对照，旧PID-only数据不参与比较。

同次进程树起点5134.6875MiB／7进程、三面板6754.5938MiB／10进程、重载7231.7422MiB／10进程、Stop停靠5847.2266MiB／7进程、第二次Stop6132.2305MiB／7进程。DotA关闭工程前6062.2500MiB、关闭1996.2148MiB、重开3291.9141MiB，均7进程；对应根进程4744.8477→711.0000→2060.6680MiB。working set不作为独占字节。summarize-bundle-consumer-batch.py核对四份报告、冻结程序、正常退出、版本2身份与求和及5轮场景，输出bundle-consumer-batch-runtime-summary.json；所有PNG／JSON／日志和脚本均保存在tmp/docs-artifacts。

本批功能及上述驻留范围已验证，下一批独立计数0/3。125的活跃纹理泄漏修复、126单视口保留空间对照及127类型扫描微基准按各自证据保留，不扩写为实际多窗口内存或帧率的单项收益。长期驻留、稳定60、来源校验尖峰、LOD、姿态聚焦／alpha选取及完整JASS／War3保真继续待办。


### 第一百二十八阶段／编辑器新批次任务1/3：按材质资源相位分散轮询

变更runtime的materials.rs／material_resolution_tests.rs，新增material_poll_tests.rs。材质、材质实例和Surface Shader保存预计算检查截止时间，按路径散列确定250ms周期中的固定相位，检查完成后设置下一个相位截止时间。缓存命中仅比较当前时间与截止时间。首次加载、显式invalidate和长暂停后的过期检查沿用即时路径；相位只分散连续运行时的文件检查，原有修改时间／加载／错误去重与恢复规则保留。首次常规复查可早于250ms，随后按固定周期执行，避免随帧边界不断漂移；热更新仍在下一次到期访问处理。不同路径／继承父项分别保留来源和截止时间，未引入异步旧结果。

22项材质相关检查通过，3个手动基准默认忽略。新增3项覆盖256个相位在60Hz／2秒内2048次检查、与集中轮询相同总数及单帧18对256的分布，长暂停全部到期、下一截止时间严格在未来且不超过250ms、4000组时钟边界，以及真实材质父项／实例／Shader失效、删除和恢复。已有反射、UI材质、循环／深度、继承与实例隔离及共享可编辑副本检查继续通过；测试直接设置私有截止时间以控制冷／热缓存。命令：cargo test -p mengine-runtime --release --lib materials:: -- --nocapture；日志material-phased-poll-tests.log在tmp/docs-artifacts/editor-performance-risk。

针对保留Amazonia场景286条有效材质路径，3次独立进程、每次同进程交替比较原有按读取年龄检查与固定相位截止时间；60Hz共180帧，前30帧预热，150帧计量，真实文件查询，初末渲染材质载荷逐项相等且无诊断错误。命令：cargo test -p mengine-runtime --release --lib benchmark_phased_material_checks -- --ignored --nocapture --test-threads=1。三次统计的中位数：解析阶段p95 1.7487→0.6325ms、最大值2.3507→0.7739ms、单帧文件检查峰值180→33；平均耗时0.4397→0.5056ms，中位耗时0.2815→0.4932ms，计量窗口内总检查2772→2880。固定周期比受帧边界延后的年龄轮询略多检查，并将检查工作分散到普通帧；该取舍用于降低尖峰，不声称平均CPU或原生FPS已改善。数据、来源SHA及全部样本见material-phased-poll-benchmarks.json／material-phased-poll-summary.json。

本轮实现／针对性检查完成，当前新批次1/3；最近完整原生验收仍为40be271的125–127批次。满3项后验证实际DotA／Amazonia的材质与Shader热更新／错误恢复、连续帧均值及p95、暂停／恢复与跨工程来源隔离。网格来源校验约3ms的独立轮询尖峰、实际多窗口满帧及长时间内存继续待办；不得把局部文件轮询结果写成其已解决。

### 第一百二十九阶段／编辑器新批次任务2/3：已驻留网格引用直接命中

修改runtime的meshes.rs，新增mesh_cached_key_tests.rs。非轮询帧在GPU键去重后，对已尝试且具有使用记录的网格直接更新当前帧龄，省去姿态／公告板引用、扩展名及类别的重复解析。缺少使用记录时走完整路径补建；首次加载、新采样键、失效、来源／外部缓冲变化、每250ms轮询和失败重试沿用既有检查。粒子仍在此路径前排除，不增加跨帧来源快照或放宽路径身份校验。对Windows元数据API的既有对照没有发现收益，本项没有修改该校验链。

新增2项GPU检查通过：10个阶段的主／嵌入视图完整RGBA、上传／检查次数、使用记录与错误恢复逐项相等，覆盖普通网格、姿态、公告板、地形、拼接、空／无效引用、显式失效、工程切换和删除恢复；预算检查确认当前网格保持驻留、未使用网格退役。既有main_and_nested_views_keep_used_sources_while_evicting_stale_meshes复测通过，确认缺少使用记录时补建；另外19项既有网格检查通过。日志cached-mesh-key-tests.log、cached-mesh-residency-regression.log及cached-mesh-compatibility-tests.log保存在tmp/docs-artifacts/editor-performance-risk，后者保留边界修复前的失败记录，最终复测见单独日志。命令：cargo test -p mengine-runtime --release --lib meshes::cached_key_tests -- --nocapture --test-threads=1；既有回归按完整名称单独执行。

手动benchmark_cached_mesh_key_traversal通过，同一生产函数仅在测试中切换提前命中分支，基线不执行新增查找，9组计量／2组预热，每组200帧且交替顺序。只预置合法类别的已尝试键和零字节使用记录，不加载地图几何。作者Amazonia2747对象／246键中位数0.136739→0.110548ms，作者场景219对象／156键0.038187→0.021282ms；保留实际DotA导入场景5376对象／177键0.176102→0.161644ms。不是实际Game运行、GPU或FPS测量，来源校验约3ms的尖峰仍待解决。cached-mesh-key-summary.json记录输入场景与源码SHA和全部样本，cached-mesh-key-benchmark.log保存原始结果。复现命令cargo test -p mengine-runtime --release --lib benchmark_cached_mesh_key_traversal -- --ignored --nocapture --test-threads=1；MENGINE_CACHED_KEY_PROJECT与MENGINE_CACHED_KEY_SCENE可指定保留项目及场景，本次DotA为arbitrary-map-1792808418421/sample下user-v2-4491bb39adc21485c832cb95648faf352261e2df0242862bc82a17830b60d001/Scenes/Main.mscene。

当前128、129为2/3；第三项后统一原生验证实际地图连续帧、热更新／失效、多视图公告板、缓存预算／Stop重启，以及材质相位与此命中路径的集成。最近完整原生版本仍40be271，保持来源尖峰、多窗口稳定60、长时间驻留、LOD与完整War3保真待办。

### 第一百三十阶段／编辑器新批次任务3/3：网格来源四组常规复查

修改runtime的meshes.rs／mesh_source_poll.rs，新增mesh_source_poll_tests.rs。已缓存来源在同步记录后设置首次250ms截止时间，此后按路径散列分为四组固定相位；每次完成后设置未来不超过250ms的截止时间。大批检查仍使用最多4个既有JobSystem任务并同步等待。每250ms从当前对象更新请求路径列表，新加载来源补入列表；期间检查最近使用的来源，下一次更新移除未再使用的路径。列表只持有路径，不持有模型／GPU所有者，项目切换、显式失效和来源淘汰同步清理相关状态。失效来源先清除旧采样／相机键，再走既有加载和错误恢复。新姿态继续即时验证全部依赖，过期暂停恢复仍当帧检查全部到期来源，不延后以隐藏开销；路径身份和文件元数据查询规则不变。

cargo test -p mengine-runtime --release --lib meshes:: -- --nocapture --test-threads=1最终24通过、0失败、6个手动基准忽略，日志phased-pose-source-compatibility-tests.log。新增检查覆盖4000组截止边界、四相位分配、主／嵌入视图9阶段完整RGBA、Shared／render-only来源、非全局轮询时的主文件变化与删除恢复、新姿态立即验证、全部过期来源、显式失效、项目切换、近期来源列表更新及Weak释放；既有缓存预算、外部缓冲、公告板、重复键与129相关网格边界继续通过。新增qa-runtime-resource-poll.mjs，node --check通过；该原生夹具将验证父材质／实例／自定义Shader编辑与恢复、父文件删除后恢复的真实像素，结果待本批执行。

手动benchmark_phased_pose_source_checks使用保留DotA项目196份GLB／5376循环引用，三个独立进程、每个同进程交替比较原有集中轮询与四相位生产路径；60Hz共180帧、30帧预热、150帧计量，实际文件查询及公告板准备，所有准备键一致且无来源加载／重用。三次统计中位数：p95 4.0424→1.8615ms，平均0.939429→1.027189ms，单帧来源检查峰值196→52；最大值中位数17.2152→18.1641ms，未改善。集中轮询总检查为1764／1960／1960，四相位均1960；固定相位与受帧延迟影响的年龄轮询存在次数差异。平均增加约0.088ms，属于平滑常规尖峰的取舍，不能据此声称平均CPU、实际FPS或全部最大延迟已改善。原始三份phased-pose-source-benchmark-{1,2,3}.log、全部样本、源码和196份输入SHA记录在phased-pose-source-benchmarks.json／phased-pose-source-summary.json，均在tmp/docs-artifacts/editor-performance-risk。未编号单份benchmark.log为探索输入，不作为最终数据。命令cargo test -p mengine-runtime --release --lib benchmark_phased_pose_source_checks -- --ignored --nocapture --test-threads=1，MENGINE_METADATA_PROJECT／MENGINE_METADATA_PATHS使用既有保留项目与metadata-probe-paths.txt。

128、129、130达到3/3，提交后统一构建custom-protocol Release并执行来源／材质热更新夹具、Scene空间选取与隐藏恢复、实际DotA加载／选取／关闭重开、多窗口／Stop重启及5轮驻留、Profiler界面。连续帧均值／p95及原生来源检查以该集成版本报告为准；五轮为有界流程，长期内存、稳定60、LOD与完整JASS／War3保真仍待完成。

### 第一百二十八至一百三十阶段合并原生结论

统一ee33d5f前端与custom-protocol Release，Vite构建3.15秒、原生81秒；冻结程序SHA256为72423c5966ff911a2d578a228c12ae15696901a7d65b05a2e31c2fa593aeaa64，收据在build-ee33d5f。resource-poll-1792880316572的4组材质／实例／Shader／父项删除恢复与10次像素转换，spatial-picking-1792880330154的7项空间／姿态／透明切换／跨Play隐藏恢复，arbitrary-map-1792880366417的实际DotA，map-session-1792880437748的多窗口／Stop重启及5轮延伸，profiler-bundles-1792880729639共五份报告通过，五个自有测试进程均正常退出。首份资源报告1792880199838在完成4组像素检查后因console日志数量超过接口上限而失败；QA脚本已按上限300修正并推送db38930，仅重跑失败资源用例后继续未执行项，复用同一冻结程序。最终资源报告及其他错误断言均0；DotA错误断言仍在关闭重开前，重开图像另行核对。临时runtime权限残留仅保留在tmp，发现文件均已移除；用户编辑器64664保持运行。

DotA14437实体，缓存进入2.393秒；上次2.302秒，不据此宣称加载改善。Scene59.74／Game60.01FPS，原生平均14.664／11.526ms，p95呈现间隔24.6／20.3ms；上一批为59.68／59.85FPS、14.618／11.322ms、24.1／21.9ms。Scene相同5376对象／5342可见／4675调用，Game5376对象／116可见／99调用，没有LOD削减。Scene前端world准备1.890ms、Game1.345ms；最新单个Scene来源校验36次／1.372ms，不代表完整分布或最坏值。多窗口7434实体，Scene59.35／Game56.58FPS，原生8.096／9.984ms，p95为22.4／27.0ms；上次59.41／55.97FPS、8.018／9.565ms、22.9／26.7ms。实际多窗口Game仍未满帧，平均原生渲染成本未见下降，微基准p95平滑不扩写为整体CPU／FPS收益；不同运行的变化不单独归因于某项修改。assert-ranges-hierarchy-batch.py核对本次DotA和多窗口的全部呈现计数、分段及加权样本，输出对应ranges-hierarchy-batch-profile-*。

多窗口完整流程291.92秒，5轮均运行15秒、Stop后空闲20秒。20份版本2样本核对同一根PID／创建时间、子进程创建时间、唯一PID及私有字节求和，五个等时空闲点均7进程。根私有内存4610.5703／4722.9453／4725.0664／4730.1250／4705.7891MiB，全程首末增加95.2188MiB，后三轮净减少19.2773MiB；进程树5196.7813／5264.0313／5282.2891／5276.9102／5276.5117MiB，首末增加79.7305MiB、后三轮减少5.7773MiB。表现为预热后平台趋势，仍不是小时级稳定或所有内存风险均解决的证据，不把跨次进程的字节变化归因于本批来源路径列表。

已查看Shader绿色夹具、DotA Scene及相机预览、重开菜单、第五轮Amazonia Game图像；完整材质恢复图像另以10份PNG摘要逐项核对。summarize-phased-source-batch.py验证五份报告、冻结程序、正常退出、10次像素摘要、版本2身份／求和和5轮场景，产物phased-source-batch-runtime-summary.json及所有日志、JSON、PNG均保存在tmp/docs-artifacts。该批功能与上述驻留范围完成，下一批0/3；多窗口稳定60、长期驻留、LOD、姿态聚焦／alpha选取的完整验收及全量JASS／War3保真继续待办。

### 第一百三十一阶段／编辑器新批次任务1/3：传输完成后回收CPU像素容量

新增RHI的readback_cpu.rs，readback.rs提供finish_reusing_rgba；既有finish仍返回普通新分配Vec。EditorViewportSubmission选择复用路径，Tauri FramePayload最后一个Arc所有者释放时将独立RGBA Vec交还闲置池，消息复制和在途图像生命周期不变。进程级池最多保留3块、容量总计16MiB，取最小足够容量；返回时清除长度，后续完整覆盖像素，淘汰最早闲置块以适应尺寸变化。超大或空容量不缓存，淘汰分配在互斥锁外释放。该池可跨项目保留CPU容量，不持有项目、模型、纹理或GPU回读槽；因此最多增加16MiB闲置逻辑容量，不作为内存减少的结论。GPU等待、行对齐、通道转换、回读槽上限和旧API不变。

cargo test -p mengine-rhi --release --lib readback -- --nocapture --test-threads=1为9通过、0失败、1手动基准忽略；新增GPU保留帧检查补充Renderer释放后GPU回读池Weak失效并单独复测通过。覆盖RGBA／sRGB／BGRA四格式、6种对齐与非对齐尺寸、2份不同颜色／alpha数据，共48组完整像素，保留帧、反序完成、重用其他容量、尺寸变化、映射错误、取消、GPU查询及Renderer生命周期。2项纯容量检查验证独占取出、最小足够匹配、3块／16MiB预算、超大拒绝与闲置淘汰。cargo test -p mengine-editor-tauri --release --features custom-protocol --lib native_viewport_transport::tests为9通过、0失败，覆盖共享／IPC原始字节、消费确认／发布返回、页对齐、尺寸变化、透明检查和池预算。相关日志cpu-readback-gpu-tests.log、cpu-readback-retained-test.log、cpu-readback-transport-tests.log均在tmp/docs-artifacts/editor-performance-risk；本项不重复整库或完整原生QA。

真实GPU的benchmark_reusable_cpu_readback通过。每种RGBA／BGRA格式按920×518、1280×720、1920×1080三种尺寸比较原有新分配与生产复用API，同进程交替顺序、2组预热／9组计量，每组20帧，每帧完整像素核对。RGBA行转换中位数依次0.311705→0.096895、0.583455→0.172325、1.326065→0.389265ms；含GPU映射等待的finish依次0.548515→0.324630、0.945500→0.518805、2.000375→1.028000ms。BGRA行转换依次0.494625→0.198610、1.006660→0.387690、2.403340→0.977935ms，finish依次0.728025→0.425905、1.378035→0.731380、3.109990→1.646500ms。这里使用已写入纹理的实际GPU映射，不含场景绘制、模拟、IPC和实际地图FPS；不能将其换算成帧率改善。原始cpu-readback-benchmark.log／json保存全部样本。复现命令cargo test -p mengine-rhi --release --lib benchmark_reusable_cpu_readback -- --ignored --nocapture --test-threads=1。早期rgba-reuse-prototype.log只用驻留CPU数据，不作为GPU数据替代。

当前新批次1/3，最近完整原生程序仍ee33d5f。第三项后统一验证实际DotA／Amazonia、多窗口两请求与相机预览、截图／过期请求、隐藏恢复／尺寸变化，以及Stop／工程切换后的版本2驻留。保留最多16MiB全局CPU容量的代价须与实际驻留一起检查；用户现有编辑器保持运行，实际多窗口满帧、长期驻留、LOD与完整War3保真继续待办。

### 第一百三十二阶段／编辑器新批次任务2/3：Scene透明度分块检查

native_viewport_transport.rs每次读取16字节，用小端u128掩码同时检查4份alpha，末尾1–3像素沿用逐像素检查。空图像、不完整RGBA、超过16MiB均不判为不透明；任意alpha不是255立即返回。检查仍基于当前帧，无跨帧缓存、unsafe或新依赖。调用链确认仅普通Scene raw帧启用，Game及Camera Preview禁用，PNG路径不执行；因此本项收益仅适用于Scene透明度判定，不扩大到Game。

cargo test -p mengine-editor-tauri --release --features custom-protocol --lib native_viewport_transport::tests -- --nocapture --test-threads=1为10通过、0失败、1手动基准忽略。覆盖16种切片偏移、1–70像素的所有block／tail位置、0–255全部alpha、RGB独立性、16MiB边界及原共享／IPC字节与消费确认。生产函数benchmark_opacity_blocks另行通过：同进程交替顺序，2组预热、9组计量，常规每组100次、首像素透明每组100000次，完整记录判定一致。全不透明920×518／1280×720／1920×1080／2048×2048的CPU中位数分别0.151429→0.039754、0.273657→0.083024、0.643312→0.215600、2.229768→0.801930ms。首像素透明约0.8→1.1ns，保留即时退出；末尾／中间透明另有原始样本。这是驻留CPU数据扫描，不含GPU、IPC或实际编辑器FPS，不能据此宣称满帧。

证据opacity-transport-tests.log、opacity-benchmark.log／json及仅供探索的opacity-prototype.*均在tmp/docs-artifacts/editor-performance-risk。手动命令cargo test -p mengine-editor-tauri --release --features custom-protocol --lib benchmark_opacity_blocks -- --ignored --nocapture --test-threads=1。131、132为2/3，第三项后合并构建原生验证Scene透明切换／alpha选取／尺寸变化、Game及相机预览、实际地图与多窗口及Stop驻留；未执行本项完整原生QA，最近原生程序仍ee33d5f。

### 第一百三十三阶段／编辑器新批次任务3/3：视口UI父子索引复用

新增ui_traversal_cache.rs／ui_traversal_cache_tests.rs。EditorViewportRenderer与独立运行器各自持有UiTraversalCache，经FrameCompiler可选传入；公共UI收集接口仍可使用即时索引。每帧按世界原有迭代顺序比较实体与稳定revision，只对变动输入重读Parent／sibling／active，拓扑变化时重建并稳定排序。无稳定revision的自定义Any投影逐帧重读。索引只存实体ID、revision和父子／排序数据；矩形、字体、布局测量、控件与交互始终重新收集。无可绘制Canvas、关闭UI或替换World会释放旧索引；删除节点后，容量超过当前数量4倍且超过64时收缩。新增缓存不持有模型、纹理、GPU或World所有者。frame_mesh_cache_tests、texture_sync_tests和既有UI手动基准只适配可选参数；benchmark_frame_compile支持--uncached-ui-traversal对照。

cargo test -p mengine-runtime --release --lib ui::traversal -- --nocapture --test-threads=1为10通过、0失败、5个手动基准忽略。每个变更阶段同时逐项比较完整父子索引与完整RuntimeUiFrame，覆盖视口尺寸／RectTransform变化、原始快照同级顺序、激活、重挂父级、直接Parent修改／移除／插入、祖先隐藏、实体槽复用、禁用Canvas／空World／换World、998节点删除与容量回收、极大父实体编号，以及通过AtomicBool切换的自定义Any父级投影。原有循环布局保护、宽度敏感文本、Mask／深度／顺序、Tab显示及布局子树测量兼容检查通过。

benchmark_ui_traversal_cache生产UI收集对照通过：同进程交替原即时索引／缓存索引，2组预热、9组计量，每组25次，全字段输出一致。保留项目原始Main.mscene的4374实体，中位数0.611588→0.495004ms；2002实体布局夹具3.893012→3.495920ms，逐次编辑RectTransform的夹具2.931876→2.904528ms。布局夹具收益小且有波动，不据此推广实际地图或FPS收益。节点记录容量分别393216／98304／98304字节，不含HashMap和子列表分配，不是进程驻留测量。该基准使用原始保存场景和默认文字解析，不包含脚本运行、GPU或IPC，实际DotA运行时14437实体的结论以批次报告为准。日志ui-index-tests.log、ui-index-benchmark.log及提取JSON在tmp/docs-artifacts/editor-performance-risk。手动命令cargo test -p mengine-runtime --release --lib benchmark_ui_traversal_cache -- --ignored --nocapture --test-threads=1，MENGINE_UI_PROJECT指向上述保留项目。

131、132、133达到3/3。提交后统一原生Release验证共享像素／透明切换／空间选取、实际DotA加载与相机预览／关闭重开、Amazonia多窗口与Stop重启、五轮等时驻留和Profiler。前端src／public／依赖自ee33d5f未变，复用已验收dist，index摘要09c50720c810ad6530184bca07599d10be10a182c145dedc606a32d786ebee8a已核对；本次不重复前端构建。独立运行器补做受接口影响的编译检查。当前仅实现与定向验证完成，完整批次结果待记录，稳定60、长期驻留、LOD及完整War3目标继续进行中。

### 第一百三十一至一百三十三阶段合并原生结论

统一847e5af custom-protocol Release，独立运行器Release编译检查7.81秒通过、原生构建80秒通过；复用未改动且摘要一致的前端。冻结程序在tmp/docs-artifacts/editor-performance-risk/build-847e5af，SHA256为181640b6b685b129b006f0520751d0e6114109b9fb08f4c8c86e9a4895cd335a。五份功能报告均通过：resource-poll-1792885073288的4组资源热更新／10次像素转换、spatial-picking-1792885086972的7项空间／姿态／透明与跨Play隐藏恢复、arbitrary-map-1792885123045的实际DotA、map-session-1792885194376的多窗口／Stop重启及5轮驻留、profiler-bundles-1792885485430。五个自有测试进程正常退出，发现文件移除。运行时目录存在的权限残留只保留在tmp；用户编辑器64664保持运行。各报告记录的console错误为0；DotA错误断言仍位于关闭重开之前，重开图像另行检查，不扩写错误覆盖范围。

DotA14437实体，缓存进入2.357秒；Scene59.58／Game59.63FPS，原生平均14.756／9.584ms，p95呈现间隔23.4／25.2ms。上一批59.74／60.01FPS、14.664／11.526ms、24.6／20.3ms；本次Game原生平均耗时下降，Scene未下降，帧率和p95没有一致改善。相同5376对象，Scene5342可见／4675调用、Game116可见／99调用，未做LOD削减。Scene／Game前端world准备1.613／1.310ms；最新单帧RGBA行转换0.1353／0.1553ms、UI收集0.0012／0.3048ms，仅是单个样本，不能代替阶段分布或据此归因各项收益。多窗口7434实体，Scene59.66／Game56.39FPS，原生7.821／8.344ms、p95间隔21.3／29.2ms；上一批59.35／56.58FPS、8.096／9.984ms、22.4／27.0ms。虽然原生平均成本下降，多窗口Game仍未满帧，p95反而增加，稳定60继续未达标，不以CPU微基准替代呈现结果。

多窗口流程291.07秒，5轮均运行15秒、Stop后空闲20秒。20份版本2样本核对同根PID／创建时间、子进程身份、唯一PID及私有字节求和，五个等时空闲点均7进程。根进程私有内存4648.6914／4767.2031／4738.7227／4751.8789／4741.7422MiB，首末增加93.0508MiB、后三轮增加3.0195MiB；进程树5222.3359／5302.0039／5287.6484／5287.6523／5302.0352MiB，首末增加79.6992MiB、后三轮增加14.3867MiB。有限流程中后段呈平台附近波动，不能作为小时级稳定或所有保留风险均解决的依据，也不把跨运行字节差异归因于本批缓存。CPU像素池最多16MiB闲置容量及UI索引的逻辑持有规则仍是明确取舍。

已查看绿色Shader夹具、DotA Game、重开后的War3菜单及第五轮Amazonia Game图像。10次资源像素转换另以PNG摘要核对；assert-ranges-hierarchy-batch.py验证本次DotA与多窗口的全部采样、分段及绘制计数，summarize-readback-ui-batch.py验证五份报告、冻结程序、正常退出、20份内存身份／求和及五轮时间。证据readback-ui-batch-*.log／json、ui-index-runtime-check.log与对应PNG均在tmp/docs-artifacts，程序收据在build-847e5af。该批功能与上述驻留范围验证完成，下一批0/3。后续继续定位呈现间隔尖峰与多窗口稳定60，长期驻留、LOD及完整JASS／War3对局保真仍未完成。

### 第一百三十四阶段／编辑器新批次任务1/3：播放帧完成时发布分离视口增量

App.tsx的模拟完成回调使用broadcastScene(false, true)：主窗口处于Play且有5秒内活跃的Scene／Game分离面板时，直接发布该完成帧并清除旧的合并计时器；消息继续使用既有增量序列、状态ID与会话所有权，未将完成标记改成强制完整快照。普通编辑、Pause、无活跃视口、过期面板以及分离窗口自身的发布仍走原有合并路径。已排队的选择／内容随最新状态一并发布，旧计时器不能重复发送；旧代次与卸载后的模拟回调仍在原有检查处拒绝。Inspector／层级的React刷新保持原有10Hz。

依据为上一批统一847e5af的map-session-1792885194376：240份Game完成样本的239个间隔中，223次版本差1、16次差2，版本推进约60.224次/秒而完成帧率56.39；Scene另有18次重复版本。Game平均请求12.417ms，平均worker排队0.017ms、renderer锁等待0.000195ms，不能据此认定线程池或渲染锁瓶颈。由timestamp减transportMs估算的部分下一请求起点距上次完成16–29ms；这是已发布完成样本的近似推导，不含全部提交／丢弃请求，不能单独证明全部尖峰成因。实际调用链确认模拟完成后仍进入16ms合并计时器，本项消除该额外等待，不改变模拟／渲染的固定截止时间逻辑。可复现分析脚本analyze-completed-frame-sync.py及结果completed-frame-sync-baseline.json在tmp/docs-artifacts/editor-performance-risk，保留原报告摘要和程序SHA。

node --test packages/editor/tests/workspaceSelectionSync.test.mjs packages/editor/tests/playbackCompletionScheduling.test.mjs首次35项中34通过，1项新夹具在微任务通知前统计回调而失败；夹具改为每次消息后等待微任务，仅用--test-name-pattern='completed Play frames reach detached stores immediately'重跑该项通过，最终35项相关检查均通过，未重复其余34项。覆盖120个非匀速完成版本立即到达真实独立store、全部按上个stateId继续增量、每版本一次帧通知、排队选择随最新状态到达、旧计时器清除、Pause／过期视口／分离作者模式合并、旧代次／卸载拒绝，以及原有跨窗口选择、不可变快照、Stop与播放节拍兼容。App.tsx整文件TypeScript转译0错误，diff检查通过。日志completed-frame-sync-tests.log保存首轮结果，completed-frame-sync-retest.log保存失败项复测；未把初次失败日志写成全通过。

本项可使此前被计时器合并的完成帧增加实际消息数，主窗口发布成本与分离视口帧间隔须在批次中共同评估。当前仅实现及定向检查完成，尚未对本项重新构建前端／原生或测量实际FPS。当前新批次1/3，第三项后统一验证真实Amazonia／DotA多窗口、输入与选择同步、Pause／Step／Stop及重启、隐藏恢复和性能分布。最近完整原生程序仍847e5af，稳定60、长期驻留、LOD和完整War3目标继续进行中。

### 第一百三十五阶段／编辑器新批次任务2/3：跨窗口发布复用原生稀疏实体变化

playWorldSync.ts提供注册世界身份与retainedPresentation：必须是工厂创建的不可变世界、与当前捕获的实体和颜色索引完全相同，并重新通过可编辑数据的结构比较，才能交给发布器。store.ts在既有native会话有效性检查之后使用该引用，不再为此路径复制完整实体指针列表。sessionSceneSerialization.ts的发布器接收可选owned提示，仅在相同作用域／长度和已验证相邻补丁时使用变化索引；空变化复用私有片段列表，最多半数变化时复制片段列表并只处理变化位置，输出按位置升序。密集变化、非相邻版本、不同数组、拓扑／作用域变化、检查点、失效身份或可编辑数据均完整比较。原消息形状、base／stateId、header和逐项JSON保持一致。上一世界只存WeakRef，回收后完整比较，不用发布器延长整个World的生命周期。

新增sessionSparsePublication.test.mjs。publication／serialization／Play结构校验的31项逻辑检查与workspaceSelectionSync的21项合计52项通过，覆盖原型／自定义序列化、直接编辑、稀疏索引乱序／重复位置、跳过版本、重排／增删／空世界、强制检查点、伪造世界／相同内容不同数组、捕获基线变化、弱引用失效以及真实createNativePlayRuntime mock到两个独立store的完整状态对照。首次新增原生夹具内容断言通过，但恢复window mock早于异步stop完成而触发文件级清理失败；延后清理并单项复测通过。WeakRef和索引排序完善后4项新路径再次通过；其余已通过且路径未变的结果复用，不将文件级失败计为一个额外逻辑测试。三个修改源文件TypeScript转译0错误，diff检查通过。原始sparse-session-tests.log／retest.log／final-tests.log、sparse-session-workspace-tests.log均在tmp/docs-artifacts/editor-performance-risk。

生产发布器手动CPU对照benchmark-sparse-session.mjs通过：输入为保留原始Main.mscene的4374实体，先经实际Host→World转换，再比较不传owned提示的完整比较与传提示的当前生产路径；同进程交替顺序，2轮预热／9轮计量，每轮25个相邻帧，每帧核对完整消息。每帧另起事件任务，避免WeakRef的任务内保活将整个基准串成一个帧生命周期。无实体变化中位数0.101564→0.001696ms，合成64实体变化0.185488→0.090696ms，全部4374变化走完整比较为9.462052→9.353388ms，密集变化未宣称有收益。此范围仅含发送端发布，不含World资格校验／构建补丁、模拟、IPC、接收端或实际FPS。最终日志和全部样本为sparse-session-benchmark.log／json，脚本与输入／探索记录均保留在tmp；同步单任务探索数据不用于实际帧生命周期结论。

134、135为2/3，当前只完成实现和定向检查，没有重跑完整前端／原生QA。下一独立任务后统一构建并验证实际Amazonia／DotA多窗口的版本推进、增量／完整检查点恢复、选择与输入、Pause／Step／Stop与重启、隐藏恢复、消息负担和FPS／p95分布。最近完整原生程序仍847e5af，稳定60、长期驻留、LOD与完整War3目标继续进行中。

### 第一百三十六阶段／编辑器新批次任务3/3：分离视口接收端复用完整不可变基线

sessionSceneSerialization.ts的receiver保留最新Fragment及已解析实体列表。仅在相同已接受base时复用已证明完整的前缀；检查点仍验证所有位置，增长仍验证每个新增位置。Fragment和实体列表均按需复制，未变时复用；实体列表按长度逐项复制，稀疏更新只解析变化位置，单项JSON深度冻结后再冻结引用列表及header。旧文档保持不可变。原始字符串、旧格式或自定义解析转为原有字符串路径并取消列表资格，下次结构化读取重新建立基线；reset和完整sceneJson清理资格。所有基线、stateId及检查点状态只在解析／冻结成功后提交，错误元组、缺项和错误JSON不污染先前已接受状态。

node --test packages/editor/tests/sessionSparseReception.test.mjs packages/editor/tests/sessionSceneReception.test.mjs packages/editor/tests/sessionSceneDelta.test.mjs packages/editor/tests/sessionSceneSerialization.test.mjs packages/editor/tests/sessionSparsePublication.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs为44通过、0失败；引用列表复制完善后，仅重跑受影响的新接收路径5项全部通过。覆盖数组身份复用与深度冻结、乱序／重复／越界元组、同内容JSON、增长缺项与倒序新增、截断／空列表、强制检查点缺项、错误片段及header回滚、丢帧恢复、raw／旧格式／自定义parser切换、特殊键和JSON原始值、原生mock与独立store以及已有跨窗口选择／播放／Stop语义。修改源文件转译0错误、diff检查通过；完整TypeScript构建归入本批执行。日志sparse-receiver-tests.log／final-tests.log在tmp/docs-artifacts/editor-performance-risk。

手动benchmark-sparse-receiver.mjs对照修改前保存的接收器源码与当前生产接收器，4374实体原始保存场景、合成相邻变化；同进程交替顺序，2轮预热／9轮计量，每轮25帧，帧间另起事件任务，每帧完整文档一致。无变化CPU中位数0.097716→0.009772ms，64变化0.207892→0.139216ms，全部4374变化9.865936→9.749108ms，不宣称密集收益；不含发送端、IPC、脚本、store规范化和实际FPS。最终源码基线session-receiver-baseline.ts、脚本与sparse-receiver-benchmark.log／json在tmp/docs-artifacts/editor-performance-risk，源码输入与样本随本地收据保留。

134、135、136达到3/3。统一构建前端（含tsc）和custom-protocol Release，验证实际DotA加载／选取／工程关闭重开、Amazonia多窗口／Pause／Step／Stop／重启与五轮等时驻留，检查版本推进、平均耗时、呈现FPS和p95。自847e5af起crates、src-tauri和Viewport.tsx没有变化，本批不重跑无关资源热更新、空间透明选取和Profiler界面夹具，复用上一批对应结果。真实跨窗口收益和消息开销以本批同版本报告为准；稳定60、长期驻留、LOD与完整War3目标继续进行中。

### 第一百三十四至一百三十六阶段合并原生结论

统一d6aa964前端／custom-protocol Release，tsc及Vite通过（Vite3.19秒），原生构建72秒通过。冻结程序build-d6aa964/mengine-editor-tauri.exe的SHA256为c5b81c541daf4cef3fada1da8435d815d4dc62886e053b552449ff4fccf407e9，前端index摘要7d2e94898d714148254ae9ad84934d1929683dc26494693561c3f158a0dac1a7；已检查程序包含新版index-CjyD2PFj.js／App-Cf6sC-I7.js资源键，资源摘要在本地receipt.json。两份相关原生报告arbitrary-map-1792887806369、map-session-1792887877205通过，自有进程正常退出，发现文件移除；console错误记录为0。DotA的错误断言仍在关闭重开之前，重开菜单图像单独核对。用户编辑器64664保持运行。未受影响的资源热更新、空间透明选取和独立Profiler夹具复用上一批结果，本批没有将其计为新通过项。

DotA14437实体，缓存进入2.279秒；Scene60.31／Game59.96FPS，原生14.579／9.445ms、p95呈现间隔25.4／23.6ms。上一批59.58／59.63FPS、14.756／9.584ms、23.4／25.2ms；单窗口p95未一致改善，缓存加载跨次差异不归因于本批同步代码。相同5376对象，Scene5342可见／4675调用，Game116可见／99调用，没有内容或LOD削减。前端world准备分别1.593／1.216ms。本次DotA仍覆盖真实地图缓存加载／进度条、全图选取、工程关闭重开及Profiler／bundle界面。

多窗口7434实体，Scene59.77／Game59.11FPS，原生平均7.740／8.379ms、p95呈现间隔20.9／22.6ms。上一批59.66／56.39FPS、7.821／8.344ms、21.3／29.2ms；Game完成帧率增加约2.72FPS，p95缩短6.6ms，但原生Game平均成本没有下降，不将其写成GPU／原生渲染优化。240份Game完成样本的239个间隔中，238次版本差1、1次差2；上一批223次差1、16次差2。本次完成样本所见版本推进约59.248次/秒，上一批60.224；Game更接近模拟版本节奏，但模拟和呈现仍未稳定60。Scene有169次差1、34次差2、36次重复版本，均保留原始样本；只比较已完成记录，不扩写为全部提交／丢弃请求统计。前端world准备Scene1.529／Game0.613ms。综合结果验证本批同步方向有改善，不单独归因于某一项微基准。

多窗口流程292.11秒，五轮均运行15秒、Stop后空闲20秒；20份版本2样本通过根PID／创建时间、子进程身份、唯一PID和私有字节求和检查，各空闲点均7进程。根私有内存4575.8281／4697.7461／4661.8828／4669.3906／4673.1953MiB，首末增加97.3672MiB、后三轮增加11.3125MiB；进程树5162.9414／5242.3828／5209.1328／5218.5039／5247.4258MiB，首末增加84.4844MiB、后三轮增加38.2930MiB。五轮有预热和波动，首末仍上升，不据此宣称长期驻留通过、全部内存风险解决或跨进程内存下降由本批引起。

已查看DotA Game、重开War3菜单、第五轮Amazonia Game。assert-ranges-hierarchy-batch.py已分别验证两份报告的采样／计数／分段，summarize-session-sync-batch.py核对同一冻结程序、两报告正常退出和20份内存数据；session-sync-batch-revisions.json保留版本差分。所有日志、JSON、PNG及收据均在tmp/docs-artifacts/editor-performance-risk／testing-batches/B001，本次未提交原始产物。该批范围验证完成，下一批0/3；后续继续定位模拟与呈现尾部延迟，稳定60、长期驻留、LOD和完整JASS／War3对局仍未完成。

### 第一百三十七阶段／新批次任务1/3：原地图单位移动参数贯穿导入和运行绑定

warcraft_unit_bindings.py读取原UnitData／UnitBalance的移动类型、基础移速、转速与碰撞字段，保存原单位和源表摘要；对象修改沿用UnitMetaData解析，覆盖后的定义再打包。warcraft-map-units.js在全部绑定成功后发布共享不可变movement对象，旧包缺失字段为null，非法字段不产生部分绑定或场景写入。内置Amazonia的96单位／37定义、数据／地图脚本／manifest／主脚本同步更新，模型、地形和选择网格字节未变。任意地图导入的包身份已包含该转换器，公共转换资源缓存继续复用。

使用REA 6.5.0对原Game.dll执行注册和组件分派探针，两组通过，前后SHA一致且artifact_changed=false；可复现命令node scripts/probe-frost-rea-map-formats.mjs --unit-movement，官方源站与固定版本仍在third_party/rea/README-MENGINE.md。7项Python源解析、7项对象继承／四字段覆盖检查通过，node scripts/test-frost-map-units.mjs、test-frost-unit-initialization-package.mjs、test-frost-map-session.mjs三项定向脚本通过。覆盖96单位、类型共享和深度冻结、旧包、字段源对象后续修改隔离、无效参数原子拒绝及600空闲帧无新增查询／写入。实际37份定义逐一与原MPQ表匹配，96放置身份及最终数据／脚本字节数、manifest、生成器与嵌入实现摘要一致；修改JS及打包主脚本语法检查通过。日志、REA原始JSON及表摘要在tmp/docs-artifacts/frost-original-maps/unit-movement-evidence，未运行完整资产遍历或原生QA。

范围为原始参数接入。当前只执行CreateAllUnits，Melee完整开局、动态玩家单位、寻路、右键命令、加成／钳制／转速算法与原客户端一致性仍未完成；不把静态注册证据写成原版运动验收。本批1/3，后续两项后合并验证新增单位数据、选择／重载／返回、旧包／自定义单位、任意地图新缓存转换及实际工具包消费路径、初始化失败边界及原生流程；编辑器稳定60、长期驻留、LOD和完整War3目标继续进行中。最新编辑器原生结果仍为134–136的d6aa964。

### 第一百三十八阶段／新批次任务2/3：JASS库链接、句柄继承与回调执行预算

`game/warcraft-jass.js` 新增最多64个模块的链接接口，合计8 Mi字符与250,000 token，拒绝重复函数／全局名。内置common.j常用句柄父链，可显式登记最多128个附加类型；校验未知父类型、循环、内置／基本类型覆盖，参数／赋值／返回仅允许向父类型转换。函数表和父链使用无原型对象；原生同步回调共享指令预算和深度，外部调用重新获得预算并保留全局状态。主脚本与Amazonia实现摘要同步，地图运行脚本、数据、模型、地形和选择网格字节未变。

`node --test scripts/test-frost-jass-modules.mjs` 的9组检查通过，覆盖跨模块函数／全局状态、源长度与token合计、继承和无效图、特殊名称、同步回调预算／深度及失败后恢复。原 `War3Patch.mpq/Scripts/Blizzard.j` 的MeleeStartingResources与五个常量保存为带摘要的固定夹具，6种ROC／TFT和玩家槽位组合通过独立native模拟；原件提取和类型关系已对照common.j。`node scripts/test-frost-jass.mjs` 保持Amazonia96单位／26触发器、1,800指令；来源打包定向检查通过。细节与复现入口见[JASS说明](designs/frostbound-realms/original-map-import.md#jass-库链接与句柄类型)，本地日志和收据在`tmp/docs-artifacts/frost-original-maps/jass-library-evidence/`。

本批计数2/3，尚未运行新的原生QA或整库测试。原资源函数仅为解释器参考验证，没有改变实际CreateAllUnits入口；完整Melee开局、玩家军队、寻路／移动、编辑器稳定60、长期驻留和LOD仍未完成。下一独立任务后，合并137–139的相关原生范围，在同版本验证单位数据、加载／重载／返回、失败边界与实际新缓存／工具消费路径；不重复未受影响的完整资源或Profiler夹具。

### 第一百三十九阶段／新批次任务3/3：首次绘制使用分块渲染包

`crates/mengine-rhi/src/world_bundles.rs` 在合格分块首次出现时编码并提交渲染包，后续按精确管线／资源／索引／对象槽匹配复用。64项、32,768逻辑对象和8次闲置提交的预算、资源替换与在途所有权沿用既有机制；对象uniform继续逐帧更新，绘制顺序、几何和材质内容不变。测试中的延后准入开关只用于同进程对照，不进入生产构建。即时建包会让仅出现一次的合格块也持有GPU命令；保留成本受同一缓存预算约束，不由CPU基准推断实际内存或FPS。

`cargo check -p mengine-rhi --lib`、world_chunks的3项GPU检查和既有完整材质／资源替换GPU检查通过。新增8组每两帧更换网格的对照，首帧4块建包、次帧复用1,024绘制，完整RGBA与直接绘制一致；预算检查覆盖17,000／32,768对象、替换后其他分块继续复用及9次闲置淘汰。既有检查继续覆盖稀疏替换、透明顺序、相机／uniform／纹理／Shader／环境更新、扩缩容、粒子回退和资源释放。

手动命令`cargo test -p mengine-rhi --release --lib benchmark_immediate_world_bundle_encoding -- --ignored --nocapture --test-threads=1`使用4,096对象，双Renderer按轮交替先后顺序，2轮预热／11轮计量，每样本8帧，全部完整像素一致。世界编码CPU中位数：每帧替换1.866713→1.215137ms，每两帧替换1.445713→0.862800ms，静态0.546300→0.539662ms；静态不宣称明确收益。这是合成资源变化负载，未含实际地图模拟、IPC或呈现。最终日志为`tmp/docs-artifacts/editor-performance-risk/bundle-immediate-{check,tests,compatibility,benchmark}.log`。

`scripts/qa-frost-map-session.mjs --unit-selection-only --unit-data`新增可选观察：在真实脚本引擎读取96单位／37类型移动数据，检查共享和冻结，并调用已链接函数进行unit→handle转换；重载重新检查，返回清除引用。只在该开关启用时添加观察，默认性能场景保持原采样负载。生成源码语法、默认路径隔离及参考数据的定向检查通过，真实原生验收待下述合并执行。

137–139达到3/3，提交后统一构建custom-protocol Release，前端源码自d6aa964未变，复用其已验证dist。合并执行DotA新包冷转换／缓存进入／Scene与Game连续采样／全景选取／关闭重开、Amazonia单位数据与两种分辨率选择／重载／返回、分离多窗口／Pause／Step／Stop／重启及5轮等时驻留。转换器包身份已变化，不能将复制旧包当作新缓存命中；本批从实际contentImporter触发新转换。完整资源热更新、独立Profiler和空间小夹具没有新增受影响路径，复用既有结果。稳定60、长期驻留、LOD和完整War3仍未完成。

### 第一百三十七至一百三十九阶段合并原生结论

统一60ac662 custom-protocol Release，构建82秒通过；程序SHA256为`26363ab8e6affddb07f24c7a0f4ffd5f859872d34655075f8b0f35b2a20891b8`。前端源码与d6aa964相同，复用已验证dist并核对index／App摘要及程序内资源键，没有重跑前端构建。最终`map-session-1792891542348`、`arbitrary-map-1792891577552`、`map-session-1792891666892`三份原生报告通过，自有进程正常退出，发现文件已移除。单位与多窗口报告错误为0；DotA错误断言在关闭重开之前，重开菜单图像单独检查。首轮单位报告`map-session-1792891467633`因旧金矿名称断言乱码失败，断言改为Unicode转义后仅重跑该失败用例；失败报告保留，生产代码与冻结程序没有变化。既有纹理生命周期／最后克隆释放2项、即时材质退役1项和相邻实例1项GPU检查随后通过；首次建包断言同步更新，连同前述4项共8项针对性GPU检查。没有重复构建或已通过的GPU范围。

Amazonia在真实脚本引擎中核对96单位／37种移动参数、按类型共享与冻结，执行已链接函数的unit→handle转换；1280×720和960×900的金矿选择、选择圈、重载后数据与返回清理通过。DotA从项目配置的Python contentImporter执行实际冷转换，再进入相同ID缓存；新包`user-v2-0262c2e4a9945137af7a0bf2828395a2d192a01308953b847829b06e6eff8c20`的身份重算、JASS／绑定模块及生成器摘要、清单实现与绑定数据摘要一致。DotA原文件没有编辑器单位放置，包内定义／放置均为0，不能把这份结果写成DotA军队或移动数据验收。实际消费路径是仓库配置的导入器；独立Player／SDK分发仍未验证。CreateAllUnits入口、fullMapScript=false及gameplay=false保持当前能力边界。

DotA14,437实体，Scene59.24／Game59.83FPS、原生平均14.304／10.309ms、p95呈现间隔24.7／21.4ms；相同5,376对象、Scene5,342可见／4,675绘制、Game116可见／99绘制，无LOD削减。Scene每帧全部4,675绘制经渲染包，240帧中234帧有复用，平均10.204次建包／8.796次命中。上一批Scene60.31／Game59.96FPS、14.579／9.445ms，Scene平均略降、Game平均增加；不据命中数或合成CPU收益宣称整帧改善。多窗口7,434实体，Scene59.76／Game58.15FPS、原生7.872／8.491ms、p9522.7／29.6ms；上一批59.77／59.11FPS、7.740／8.379ms、20.9／22.6ms。Game的FPS与尾间隔本次更差，稳定60目标未达成，继续保留模拟／呈现尾延迟定位。

多窗口流程293.28秒，5轮均运行15秒、Stop后空闲20秒；20份版本2内存样本通过同根PID／创建时间、子进程身份、唯一PID和私有字节求和检查，各空闲点均7进程。根私有内存4,686.8086／4,688.6914／4,695.0117／4,678.6992／4,690.6523MiB，首末+3.8438MiB、后三轮-4.3594MiB；进程树首末-19.6094MiB、后三轮+10.5MiB。这是短流程平台趋势，不证明小时级驻留稳定，也不把跨次内存差归因于本批建包策略。

已查看DotA Game、Amazonia高窗口金矿选择、第五轮Game和重开菜单。原地图仍显示对局规则未接入，完整开局、动态玩家军队、原地图HUD、寻路／命令、LOD和长期稳定继续待实现。`assert-ranges-hierarchy-batch.py`分别验证两份性能报告的分段与计数，`summarize-bundle-immediate-batch.py`核对同一冻结程序、三份报告与20份内存样本，`bundle-immediate-fresh-map-proof.json`保留新转换来源证明；所有日志、截图、JSON和收据在`tmp/docs-artifacts/editor-performance-risk/`与`testing-batches/B001/`，未提交原始产物。该批功能／来源范围验证完成，下一批0/3；用户编辑器64664未重启，稳定60与完整War3目标继续进行中。

### 第一百四十阶段／新批次任务1/3：分离视口保留模拟来源耗时

主窗口`App.tsx`的scene-state随已接受世界发送`playStepTiming`，分离窗口`store.ts`按相同session／revision保留独立冻结副本，供Scene／Game的既有Profiler记录消费。`playStepTiming.ts`仅复制已知的有限非负时长及会话／版本，丢弃未知字段；错会话／错版本、非法数据和缺失字段不发布测量。初始化、Stop／重新Play及旧格式消息缺失耗时时保持未知，有效的0值保留；主窗口收到辅助窗口的场景编辑时清除测量，下一次本地模拟重新建立，辅助窗口不发布模拟所有者耗时。时间字段均为源窗口内计算的duration，不跨窗口相减时钟。

此前分离窗口没有收到这份元数据，store的模拟请求耗时初值0一直未被更新，因此旧报告的`averageSimulationRequestMs=0`不能解释为真实零开销。该字段修复不改Rust模拟计时、场景JSON／增量格式、播放节奏、渲染范围或输入归属；每次已有广播附加固定数量的小型时长字段，没有新增IPC查询或定时器。

`node --test packages/editor/tests/playStepTiming.test.mjs packages/editor/tests/workspaceSelectionSync.test.mjs`的26项通过；随后新增Profiler未知值断言，运行workspaceSelectionSync、remoteRuntimeReuse、playRuntime和editorProfiler四文件57项通过。两轮覆盖存在重叠，不重复累计。耗时复制按每个已知字段读取一次后校验，完善访问器隔离后仅复测受影响的5项全部通过；最终helper单文件语义检查及前述接口检查`pnpm --filter @mengine/editor exec tsc --noEmit`通过，QA脚本语法与差异检查通过。覆盖实际App广播／接收函数、原生mock生命周期、有序增量、缺失检查点、冻结副本与后续修改隔离、旧消息／缺失值、错会话／版本、非法数字、0值、主窗口编辑归属、Stop／重启及Profiler null展示。日志为`tmp/docs-artifacts/editor-performance-risk/remote-play-timing-{tests,integration,final-tests,typecheck,helper-typecheck}.log`。

`qa-frost-map-session.mjs`新增可选`--detached-simulation-timing`，与`--detached-profile-only`同时使用；在既有5秒采样中检查Scene／Game至少15个不同模拟版本、请求会话／版本、分项duration、总请求时长与Profiler平均值一致，不改变默认QA负载。本批1/3，未构建新原生程序或重跑完整QA。第三项后统一前端／原生构建，执行该断言并复核Pause／Step／Stop、分离窗口重建和真实FPS／尾间隔；最新完整原生证据仍是137–139的60ac662，稳定60、长期驻留、LOD和完整War3继续进行中。

### 第一百四十一阶段／新批次任务2/3：主窗口JavaScript CPU定向采样

`scripts/frost-native-qa-cpu.mjs`通过Windows WebView2本地调试端口获取QA主窗口CPU profile。先检查qa-owner、后台编辑器身份、唯一无分离参数的Tauri主页和同端口环回WebSocket，只发送Profiler指令，不执行页面脚本。`qa-frost-map-session.mjs --detached-profile-only --main-thread-cpu-profile`按需开启，普通运行不开放调试端口或启动采样；Profiler围绕既有5秒窗口启动／停止，关闭连接与重复stop均处理，原始`main-thread.cpuprofile`和汇总只写入QA目录。`test-frost-native-qa-cpu.mjs`的5项检查通过，覆盖采样权重、重复／未知节点、截断／负数、主页面／环回隔离、所有权、协议序列、原件保存、失败与重复停止清理；最终5项复测通过，两个入口语法与差异检查通过。

为继续定位已复现的多窗口掉帧，执行必要的5秒定向复现，没有运行完整地图矩阵或驻留循环。313a8ca前端构建（含tsc，Vite3.12秒）和custom-protocol原生构建74秒通过；冻结程序SHA256为`b4eaa52f99793afa443a3d827254d00fcc106ac61dc9a909a8c3b1d8a9a47133`，确认内嵌`index-CoOJVaB-.js`／`App-B8AxD5rl.js`及对应dist摘要。`map-session-1792893578122`通过，Scene／Game均有240份带有效来源的请求样本，会话／版本与完整duration断言通过；合并去重得到242个模拟请求。总请求均值6.4657ms、p9512.1ms；IPC编码／交付／解码区间均值3.2663、p956.5485ms，模拟与快照差分2.2793、p953.8648ms，应用／保留差分0.5244ms、接受世界0.1293ms，模拟工作线程排队0.0105ms。该区间包括交付和调用方调度，不能据此确认JSON编码为瓶颈；本机Tauri2.11.5已使用fetch／response.json，未修改返回格式。140的来源耗时同步已由此验证，完整批次状态仍按本节范围保留。

复用同一冻结程序启用CPU采样，`map-session-1792894356592`通过；进程24768正常退出，发现文件已移除，用户编辑器64664保持运行。采样目标`http://tauri.localhost/`，请求间隔1,000微秒，实际窗口5,315.878ms／2,873样本，timeDeltas合计5,315.663ms，idle归属3,566.901ms。按样本权重汇总的self归属：BehaviourRunner.tick107.830ms、SceneChangeTracker.observe107.436ms、跨窗口publish86.753ms、GC142.782ms；bundle位置片段与`packages/behaviour/src/runner.ts`的每帧Object.keys组件发现循环相符。这些不是完整函数inclusive耗时，也不是进程CPU用量，含Profiler开销，不能将采样时FPS用于普通性能对照。下一项优先验证行为组件发现的重复扫描与兼容边界。

工具／原生日志为`tmp/docs-artifacts/editor-performance-risk/main-thread-cpu-{tests,final-tests,native}.log`与`owner-timing-{frontend-build,native-build,native-repro,summary,analysis}`；原件、片段和冻结收据均在tmp。最终校验补充后重放同一CPU原件，汇总一致，没有重复原生采样。本批计数2/3，下一独立修复后合并验证受影响的播放、原地图和分离窗口路径；不把这次必要复现写成完整批次或长期稳定通过，完整War3／LOD／稳定60继续进行中。

### 第一百四十二阶段／新批次任务3/3：私有原生世界复用空行为发现

`packages/behaviour/src/{registry,index,runner}.ts`提供注册身份token与只读实例状态；注册、替换和测试重置均更新token。`packages/editor/src/playBehaviourDiscovery.ts`只认证playWorldSync工厂拥有的不可变世界和记录，按实际注册键判断组件；同一实体数组复用空结果，相邻稀疏补丁只检查变化记录，记录缓存随注册token失效，上一个世界仅保留WeakRef。超过半数记录替换时交回既有扫描，避免每帧填充完整记录缓存。`store.ts`仅在没有已有实例、当前实体数组全部私有且未暴露、没有待比较的暴露记录时使用该证明；Tick／Step共享入口。普通输入、迟注册、可变编辑、已有实例移除、枚举函数或数组迭代器变化均保留完整协调路径。

新增`playBehaviourDiscovery.test.mjs`的9项与既有behaviourLifecycle／behaviourSparseWorld的4项定向逻辑检查最终通过，覆盖扫描次数、相邻／跳过版本、拓扑、密集回退与恢复、注册键与可变entry元数据、注册替换／重置、伪造冻结世界／getter／Proxy、枚举变化与恢复后保留的可变别名、WeakRef失效、非激活实例、真实createNativePlayRuntime mock、多数私有但含暴露记录、同值编辑、迟注册、删除onDisable、非枚举转枚举、Pause／Step／Tick和Stop。首轮3项夹具失败分别源于SSR与Node注册器实例不同和首个完整reset生成新记录；后续夹具属性描述符及map回调入参修正分别定向复测，失败日志保留，未重复其余通过项。行为包实际dist构建、编辑器TypeScript接口和差异检查通过。

真实保存地图输入4374实体，同进程交替顺序、2轮预热／9轮计量、每轮25帧并逐帧核对完整数据，空行为发现CPU中位数：无实体变化0.383020→0.012508ms，64记录变化0.378656→0.064756ms。密集4374记录变化走既有扫描，最终0.336604→0.351468ms，不宣称密集收益。此范围不含世界创建／克隆／接受、模拟、IPC、跨窗口呈现或实际FPS；脚本`benchmark-behaviour-discovery.mjs`、原始与最终密集样本及定向日志均在`tmp/docs-artifacts/editor-performance-risk/`。本项按三任务规则先提交，140–142达到3/3；接下来统一前端／原生构建，在同一冻结程序验证Amazonia／DotA、分离窗口耗时、播放与隐藏恢复，CPU采样与普通FPS分开解读。稳定60、LOD、长期驻留及完整War3仍待完成。

### 第一百四十至一百四十二阶段合并验证结论

统一`729876c`前端构建（含tsc，Vite3.27秒）及custom-protocol Release构建72秒通过；冻结程序SHA256为`b743137d1218140803f7afb3545467dbefc1c13be77c512136779a0f64e46ac9`，核对12个源码／实际behaviour dist摘要与内嵌`index-Dr9oUWzv.js`、`App-C1WSm7zI.js`、`agent-schemas-DZwafEfU.js`。9个相关测试文件合计91项通过、0失败，141工具此前最终5项通过结果复用。没有重复执行全库、资产遍历或五轮驻留。

原生`map-session-1792896042264`、`arbitrary-map-1792896122283`、`map-session-1792896203361`、`map-session-1792896265259`全部通过，错误日志均为空，自有进程正常退出且发现文件移除；WebView临时缓存有EPERM，保留在各自已验证的tmp目录。Amazonia7434实体的三分离窗口、Game重开、耗时来源、Pause／Step／快捷键、地图重载、Stop作者内容与Undo／Redo、重新Play通过；Scene／Game各240份耗时样本，分别238／240个不同模拟版本。DotA14437实体复用当前有效转换缓存，加载进度、Scene／Game连续运行、全景选取、工程关闭重开与新Game像素通过；未重复冷转换或扩大脚本能力验收。Scene连续旋转19个原生帧，隐藏时原生帧与浏览器paint均0，恢复51帧，分隔条调整与960×900／1280×720切换、Stop后场景恢复通过。

普通采样的多窗口Scene59.26／Game59.84FPS，p95呈现间隔22.5／27.5ms，原生平均7.876／8.372ms；上一批对应59.76／58.15FPS、22.7／29.6ms、7.872／8.491ms，不能由单次波动归因于本项。DotA Scene59.65／Game59.78FPS，p9525.4／26.0ms，原生平均14.355／9.551ms；同样保留5376渲染对象、Scene4675／Game99个世界绘制，没有LOD削减。满帧尾延迟仍未达成。

独立CPU窗口5320.659ms／2860样本；完整原件中BehaviourRunner.tick的采样self从上一窗口107.830ms变为未采到（0），结合定向扫描次数断言确认重复组件发现快路径已生效，不解释为真实执行成本为零，也不将含Profiler开销的FPS当普通性能结果。当前SceneChangeTracker.observe采样self162.719ms、保留记录107.261ms、publish89.880ms，仍需继续分析主线程工作。汇总脚本曾把空URL视作assets目录而失败，改为只读文件后重放同一原件成功，未重跑原生采样。

已查看Amazonia分离Game和DotA实际Game图像；玩法、完整开局军队／HUD／寻路、LOD及小时级驻留仍未完成。`behaviour-batch-{summary,cpu-comparison,cpu-code-context}.json`、构建／测试／原生日志、原始截图和冻结收据全部保存在`tmp/docs-artifacts/editor-performance-risk/`与`testing-batches/B001/`；文档只提交本结论。本批相关验证结束，下一批0/3；用户编辑器64664保持运行。新反馈的启动Game首帧长等待单独跟进，不计作已修复。

### 第一百四十三阶段／新批次任务1/3：启动视口按需编译内置材质

用户反馈的4374实体工程在独立729876c Release进程复现Game首帧等待10420.539ms；探针报告`viewport-startup-1792896631527/report.json`保留有效Game计时，随后Scene截图误用了仅Game支持的profile参数而使整份探针标记失败，未将其写成完整通过。`crates/mengine-rhi/src/renderer.rs`原先每次初始化视口均同步编译36种内置材质管线；现在保留该设备自己的ShaderModule，只为实际材质键创建管线，随后复用。混合、深度写入／相等和单双面键保持完整；自定义／错误材质路径沿用既有逻辑。

`nativeViewportRequests.ts`保存当前错误，切换请求归属和成功返回时清除；`panels/Viewport.tsx`区分首帧准备与真实Game／相机预览失败，Game失败原因同时写入Console。避免原生失败仍显示永久渲染占位。`scripts/qa-viewport-startup.mjs`复制同一游戏工程，在独立配置中只测Edit模式首次Game／Scene，不启动Play；记录第一帧、输入／EXE摘要、原生profile和截图，可用`--first-frame-timeout-ms`指定本机预算，默认15000ms，正常关闭仅限自有QA进程。

针对性GPU检查：初始化内置管线为0，全部36种首次创建／第二次复用与GPU Validation通过；本机初始化2162.097ms，另外编译全部36种用时6600.044ms。既有透明／cutout／混合像素检查通过。四个相关前端文件43项逻辑检查最终通过，覆盖请求失败／恢复与状态文案、瞬时错误、归属切换、资产刷新及首帧期间不重复加载浏览器模型；首次4项失败为旧源提取夹具缺少后续新增的Scene变量与空间查询，补齐后仅复测对应两文件5项全部通过，失败记录保留。前端构建（含tsc，Vite3.17秒）、QA语法及差异检查通过。

当前1/3，按已复现故障执行必要首帧定向验证：构建新原生程序，运行`node scripts/qa-viewport-startup.mjs --first-frame-timeout-ms 8000`并对照上述相同输入；确认首帧实际出现、相机预览与Scene正常、错误日志为空。这里不触发完整地图矩阵、全库测试或驻留循环；其他地图／跨窗口集成登记在后续累计批次。原始产物统一位于`tmp/docs-artifacts/editor-performance-risk/`，稳定60和完整War3继续待完成。

143必要定向原生结论：统一`df7f1cd`custom-protocol Release构建83秒通过，冻结程序SHA256为`9f0fb764ed886e291dde8f20c7d9383d37b98f7d7c614d81eaa2bcdc07d8a3be`，确认内嵌当前index／App／Viewport键。`viewport-startup-1792897166495/report.json`通过8000ms首帧预算，Console错误0，自有进程59600正常退出且发现文件移除；WebView临时缓存因EPERM留在自有tmp目录。核对前后Main.mscene摘要同为`882258f7ac4a660635dc6d2d4008e1014d139f8d155f1871d8e93fe51f0dde61`。首次已接受Game原生采样从10420.539降为4164.863ms，约减少60%；该计时从聚焦Game并清理Profiler后开始，不含启动进程和工程打开，也不是稳态FPS。新版工程打开1931.545ms单独记录，不拿两种时间口径混算。

实际Game仅创建5种内置管线、Scene1种；已查看游戏菜单完整画面与Strategy camera预览，均有真实内容。Scene在Game等待期间已经后台准备，因此切换后31.976ms获得样本不能解释为Scene冷初始化耗时。`startup-native-comparison.json`保存相同输入、EXE与计时口径；构建／GPU／前端日志及冻结收据均在同一tmp任务目录。首轮探针失败及旧夹具失败记录保留。新QA脚本换行为LF后差异检查通过；生产源码与已构建程序一致，没有重复构建或原生复测。当前任务实现与必要复现验证完成并提交推送，批次仍为1/3，其他集成范围按累计规则待测；用户编辑器64664保持原进程。

### 第一百四十四阶段／新批次任务2/3：原生场景观察复用可信增量

`agent/eventJournal.ts`的SceneChangeTracker接收可选工厂世界证明，严格要求playWorldSync已认证的世界、相同实体数组和普通JSON序列化／数组迭代环境。初次完整观察仍验证全部ID并生成签名；相同数组直接复用，相邻稀疏补丁读取变化位置；跨多个模拟版本时，对照一份冻结指针列表验证相同ID顺序并定位变化项，再于场景状态序列化成功后更新签名表。密集变化、拓扑变化、伪造／复制数组、JSON原型hook或缺少可信基线时回到完整逻辑。上个世界仅保留WeakRef，额外保存一份冻结实体列表；WeakRef回收后仍可校验列表，不保留世界历史链。场景状态getter引入hook时取消下一次资格；getter重入／reset跟踪器时，使用原观察完成的签名恢复完整表，保留原有回调顺序与异常重试行为。revision、delta排序、历史容量、diff载荷与修改隔离不变。

`store.ts`新增sceneObservationSnapshot，只有可编辑运行数据重新通过既有retainedPresentation结构校验时才返回完整不可变工厂世界，否则使用普通presentationSnapshot。`AgentBridge.ts`消费该入口并传递认证，`App.tsx`仅在Edit继续复用已有preparedSnapshot；运行态让观察器按原100ms节流取可信世界，避免把复制的指针列表冒充不可变索引。普通Edit／脚本直接编辑仍完整检测，输入与乐观revision检查不变。

新增`sceneSparseObservation.test.mjs`8项，加上既有agentEventJournal／presentationSnapshot的17项及agentPlaybackCost的1项，最终26项去重逻辑检查通过。覆盖与完整跟踪器逐项delta／全部revision的diff对照、无变化0次Map比较、两记录变化仅2次比较、密集／跳过版本／重排／增删／空世界／切场景／reset、复制与伪造证明、getter和JSON hook、异常回滚／重入恢复、WeakRef失效，以及真实store→AgentBridge的直接编辑回退与乐观输入保护。首轮两个新夹具分别把构建补丁的Map访问计入观察器、漏设桥接boot-ready而失败；修正后仅复测两项通过，新增重入项单独通过。TypeScript接口最终通过，未重复已通过逻辑或扩大范围。

同进程原版Amazonia场景7433实体的局部CPU对照，2轮预热／7轮计量、每轮12帧、交替顺序并逐帧核对delta和完整diff：无实体变化中位数1.087675→0.013267ms，64记录变化1.100358→0.135233ms，全部7433记录变化走完整比较15.757475→15.654883ms，密集路径不宣称收益。此范围只含observe，不含工厂构建、store校验、整个AgentBridge、模拟、IPC或实际FPS。脚本`benchmark-sparse-observation.mjs`及`sparse-observation-{benchmark,tests,new-tests,retest,reentrant-tests,final-typecheck}.log/json`均保留在`tmp/docs-artifacts/editor-performance-risk/`。

本项实现及定向检查完成，批次2/3；没有重新构建前端／原生程序或运行地图矩阵。下一独立任务完成后统一构建，合并143–145的Amazonia／DotA加载与各材质状态、首帧、Play／Pause／Step／Stop与重启、多窗口revision与scene.diff／乐观写入、暴露编辑／隐藏恢复及普通FPS／CPU采样验证。最近原生程序仍df7f1cd，稳定60、LOD和完整War3继续待完成。

### 第一百四十五阶段／批次补充任务：原生Play私有JSON解析与保留

`src-tauri/src/native_play_response.rs`供start／step_editor_play使用：可选raw参数返回同一JSON内容的二进制响应，默认仍返回原JSON对象契约。`playRuntime.ts`请求该格式，旧后端／对象响应保持原有复制路径。纯HostWorldSnapshot与形状转换提取至`worldSnapshotView.ts`，`editorTransport.ts`保留原导出。`playWorldSync.ts`的parseRetainedNativePlayResponse只接受字节，使用内置解析器建立私有树，转换／归一化后冻结并认证实体根；已拥有的组件无需再次逐实体JSON stringify／parse。可变对象不会进入采用路径，普通保留API不变；自定义映射／归一化、JSON原型hook等仍执行复制，非有限数与负零保持JSON往返语义，非法字节和快照拒绝发布。返回容器中的组件别名也已冻结，组件子对象不单独取得实体资格。

`playStepTiming.ts`的可选responseTransport明确binary-json／json来源，复制时只读取一次，未知值不认证。二进制响应的解析和保留计入applyMs，Profiler对应标为“IPC encode and delivery”与“Decode, apply and retain delta”；对象路径沿用原阶段口径，不能把解析移动解释为IPC总收益。QA可选`--binary-play-response`在两个分离视口逐份核对实际所有者来源，`--scene-observation`检查真实scene.diff重建Step后的完整世界、静止空diff及过期／当前revision乐观写入。

运行态观察每100ms一次，通常跨多个模拟版本。144的同ID顺序指针对照覆盖这一实际节奏；额外只保留一份冻结实体列表，reset／无资格观察时清除，不持有世界链。每次跨6个模拟版本、64记录变化的7433实体对照中，observe中位数1.166342→0.193742ms，逐份delta和完整diff一致；重排和重复ID仍完整校验。此为144同一功能的补充，不增加任务计数。

必要定向检查：既有playRuntime／playWorldSync／观察路径33项、新增原生响应7项、既有计时3项及跳帧1项最终通过，共44项去重逻辑检查；覆盖大ID／中文／特殊键、冻结与外部修改隔离、子对象资格、负零／溢出、非法UTF8／结构、原型hook／映射／归一化覆写、真实driver的二进制启动／reset／稀疏／重排／旧对象混合／quit／stop、来源元数据及阶段口径。Rust `native_play_response`的1项确认二进制和JSON解码载荷完全相同，默认契约与字段值保留；原生测试构建39.73秒通过。TypeScript最终接口、QA语法与差异检查通过。

同一Amazonia输入的相同JSON字节，2轮预热／7轮计量、每轮12次并交替顺序，完整核对结果：0实体解析／转换／保留中位数0.004025→0.004458ms，64实体0.181392→0.093850ms，7433实体／3003930字节27.328067→15.875867ms。包含首次JSON解码及保留，排除Rust序列化、IPC交付、后续元数据发布／store与实际FPS；空包没有收益，不以此声称整帧改善。脚本`benchmark-owned-play-response.mjs`、原件／样本和`owned-response-*`日志，及跳帧对照均在`tmp/docs-artifacts/editor-performance-risk/`。

本批实际包括143、144、并发提交的地图导入依赖修复01102d4和145，共4项；合并验证使用包含全部变更的cab5035。统一构建后以同一冻结程序检查启动8秒预算、DotA当前导入器冷转换／缓存加载／全景选取／工程重开、Amazonia多窗口来源与scene.diff／乐观写入／Pause／Step／Stop／重启、隐藏／旋转／尺寸切换及独立CPU采样。私有解析改变组件树寿命，因此合并执行5轮等时Play／Stop驻留；复用143未改变RHI代码的36种管线和透明混合GPU检查，不重复资产遍历。结果见本批结论。


### 地图导入依赖自动准备：远程 Git 拉取故障修复

变更路径：`scripts/prepare-frost-map-import.py`、`scripts/runtime-import-frost-map.py`、`scripts/convert-warcraft-assets.py`、`scripts/test-frost-import-tools.py`、`docs/designs/frostbound-realms/original-map-import.md`。首次导入自动准备 MdxExport、NodeMetadata 和 PKWARE blast，源码指纹及完整运行文件摘要决定复用／重建，工具在独立目录完成后原子发布。并行准备采用进程锁；下载中断、残缺 ZIP 和损坏 DEFLATE 可重新下载。Python 依赖检查移到作业异常处理内，失败可写入 result.json。基础环境仍需 Python/NumPy/Pillow、Node.js、.NET 10 SDK、微软 C++ x64 工具及 Windows SDK；完整工具复用只需 .NET 10 运行时。原版 MPQ 路径须符合目标机器，工具不会安装系统软件。

本次按已知故障执行最小复现与定向验证：`python scripts/test-frost-import-tools.py` 10 项、`python scripts/test-frost-map-cache.py` 7 项、使用新构建 blast 的 `python scripts/test-warcraft-mpq.py` 6 项通过。覆盖首次准备、离线复用、运行配置缺失、DLL 损坏、源码升级、构建失败／部分产物、外部 blast 覆盖、进程被终止后锁释放、缺少 NumPy 的实际 CLI 错误收据、下载中断与压缩数据损坏恢复。

真实验证在 `tmp/docs-artifacts/map-import-dependencies/cold-checkout/` 复制受 Git 管理的脚本与第三方源码，资产库和样例只读复用当前工程，输出写独立 project。首次手动准备及 DotA 转换通过后，将其工具和下载源码移到证据目录，再由实际导入入口从空工具／源码缓存自动下载构建并转换 `DotA_v6.83d.w3x`；原图 SHA256 为 `c06547206849f7931ad61509e21b76d22d63ae38d05fe7f35dab48c3dff56ddf`，461 个输出文件校验完成，cached=false。自动入口第二次使用了首轮 MPQ 成员缓存，模型派生产物重新生成；不将其写成所有资源缓存均为空。随后禁止下载和构建函数，实际入口仍成功复用 cached=true。补充 DEFLATE 异常恢复后仅重跑受影响的工具测试，不重复全图转换。结果在 `verification.json`、`auto-job/{result,progress}.json`、`auto-job/converter.log`、`tools-tests.log`、`mpq-tests.log`。

本项实现及故障定向验证完成。承接前两项已提交任务，本项提交后该批达 3/3；前两项登记的统一原生视口／多窗口／Play 生命周期集成及本项远程电脑重试仍待执行，保留原队列，不开始下一批或标记整批通过。本项没有修改编辑器代码，也未重建编辑器；DotA 验证范围为地图转换与缓存，完整对局规则及远程本机运行不在已通过结论中。

### 第一百四十三至一百四十五阶段及地图导入修复：合并验证结论

统一cab5035（包含01102d4）前端构建含tsc通过，Vite3.26秒；custom-protocol Release构建73秒通过。119项相关JavaScript检查全部通过、0失败；Rust响应契约1项通过，143的2项GPU检查因RHI源码未变直接复用。冻结程序SHA256为`f4457eb31274e5ade35c9f1b9c9146b426d6914162d551f4761d37d10ae7fe4f`，18份源码／脚本及58份前端文件摘要与当前文件一致，核对内嵌index-DApOw4OS、App-JFgrg38u、Viewport-BXhlENF_及agent-schemas-DZwafEfU。没有逐任务重跑完整地图矩阵。

5份原生报告全部通过、错误日志0，自有进程正常退出且发现文件移除：`viewport-startup-1792900009477`、`arbitrary-map-1792900034708`、`map-session-1792900137550`、`map-session-1792900426831`、`map-session-1792900461657`。WebView缓存仍可能因EPERM留在各自tmp目录。相同4374实体／Main.mscene摘要的Game首个已接受原生帧3965.720ms，通过8秒预算；此前旧版10420.539ms。计时从聚焦Game和清理Profiler后开始，不含进程启动／工程打开，工程打开2373.451ms单记；Scene11.407ms已在Game初始化期间预热，不作为冷Scene耗时。已查看启动场景与Strategy camera预览、DotA Game及Amazonia重启Game，画面有真实内容。

DotA使用当前导入器实际冷转换37.187秒、相同包缓存加载3.630秒，选择／取消、持续进度、全景选取与关闭重开通过。新包`user-v2-706842d1b8edf6050903938f6c385fe96ed489fd72cc2a7fb0a66af4e76ad810`重新核对身份、原图摘要、32项当前packageInputs、JASS实现与单位绑定生成器；缓存入口已校验461个输出文件。源码和转换器指纹变化后未复制旧包充当新缓存。DotA无编辑器单位放置，绑定定义／放置均0，CreateAllUnits入口及fullMapScript=false、gameplay=false保持能力边界。当前本机的原生消费已验证，远程电脑重试和独立Player／SDK分发仍待确认。

Amazonia7434实体多窗口报告逐份验证Scene／Game耗时的binary-json来源；真实scene.diff可重建暂停Step后的世界，静止diff为空，过期revision写入被拒绝、当前写入被接受。Game重开、Pause／Step／快捷键、地图重载、Stop作者恢复与Undo／Redo、重启通过。隐藏Scene原生帧与浏览器paint均0，恢复、连续旋转、分隔条及960×900／1280×720尺寸切换通过。

普通多窗口Scene59.789／Game59.613FPS，p95呈现间隔21.8／26.6ms，原生平均7.775／8.235ms；上一批59.26／59.84FPS、22.5／27.5ms，不能用单次差异确认整帧收益。DotA Scene60.016／Game59.248FPS，p9523.5／21.3ms，原生14.310／10.568ms；仍有5376对象及Scene4675／Game99绘制，没有LOD削减，稳定满帧尚未达成。

独立主WebView CPU窗口5279.169ms／2844样本，SceneChangeTracker.observe加权采样self从旧窗口167.731降到9.444ms。旧值合计同一callFrame的多个调用节点，历史162.719ms仅为其中单节点。retainPlayRecord本次未采到，旧值107.261ms，不解释为实际零成本；新私有解析器self41.947ms。解析阶段归属已移动，不能直接相减作为总CPU收益，也不把采样运行FPS当普通基线。

驻留报告289秒，5轮各运行15秒、Stop后空闲20秒；20份内存样本核对相同根PID／创建时间、唯一子PID、私有字节求和和5轮持续时间，空闲均7进程。根私有内存依次4593.688／4721.277／4686.602／4703.551／4701.879MiB，首末+108.191、后三轮+15.277MiB；进程树首末+91.582、后三轮+45.633MiB。走势非单调，不能判定泄漏，也不能证明长期稳定；原因尚未确定，不归因于私有解析或分配器预热。长期驻留风险继续保留。

构建收据、5份原生原件、CPU对照、来源核对和汇总位于`tmp/docs-artifacts/editor-performance-risk/build-cab5035/receipt.json`、`owned-response-batch-{driver,summary,cpu-comparison}.json`、`owned-response-fresh-map-proof.json`；地图／多窗口截图与原始报告在`tmp/docs-artifacts/testing-batches/B001/`。本批4项的本机相关集成结束，下一批0/3；用户编辑器64664保持运行。尾延迟、长期驻留、LOD、完整开局军队／HUD／寻路与命令、完整原图脚本及War3保真继续待办，未标记完整游戏目标完成。

### 第一百四十六阶段／新批次任务1/3：原生多视口共享GPU设备

变更路径：`crates/mengine-rhi/src/{renderer,headless_context,headless_context_tests}.rs`、`crates/mengine-rhi/examples/benchmark_headless_viewports.rs`、`crates/mengine-editor-host/src/viewport.rs`。EditorViewportRenderer的原生headless入口按backend和对象布局复用同一Adapter／Device／Queue，并发冷初始化合并为一次；各视口的渲染目标、shader／材质／网格缓存、对象缓冲及回读仍独立。进程池仅持有Weak，最后一个视口释放后不保留上下文；创建失败可重试，收到device-lost通知后新视口建立新上下文，既有使用者自行释放。原有异步独立headless和surface入口保留，surface仍按自身兼容性选择设备。

7项去重定向检查通过：3项纯池逻辑、3项新增GPU及既有1项alpha GPU。覆盖并发一次初始化、弱引用释放／重建、backend与uniform／indexed布局隔离、失败重试、失效上下文替换、同名资源／不同颜色的并发完整像素与独立设备对照、关闭一个视口后另一视口继续绘制，以及真实device.destroy后新上下文成功绘制且GPU Validation无错误。最终`cargo check -p mengine-editor-host --release`通过；没有前端改动，未重建完整Editor或运行地图矩阵。

必要定向基准：同一冻结example分别以`isolated`／`shared`启动独立进程，3组反转顺序对照，每进程同时保留3个1280×720空视口。初始化总时长中位数6035.395→4059.539ms，第三个视口存活时的进程私有内存1317.480→738.992MiB，减少578.488MiB。采样PowerShell进程不计入根进程私有字节，采样耗时排除在构造计时外；不是VRAM、地图加载、首个Game画面、FPS或长期驻留结果，也不能据此认定上一批108.191MiB波动的原因已经解决。冻结example SHA256为`921ac0cdf525e8df68ebd0e145eed1e4f1a76cd61195273d69a199a5d2f3bd3a`。

复现：`cargo test -p mengine-rhi --release --lib headless_context -- --nocapture --test-threads=1`及`material_alpha_preserves_opaque`筛选；`cargo run -p mengine-rhi --release --example benchmark_headless_viewports -- isolated`／`-- shared`。分段测试、最终接口检查、基准原件／汇总与源码摘要均在`tmp/docs-artifacts/editor-performance-risk/headless-context-*`。当前1/3，待另外两项合并构建后验证真实启动、Scene／Game／相机预览并发、材质／纹理热更新与GPU计时、旋转／尺寸／隐藏、项目关闭重开和5轮Stop／Play内存；普通FPS与CPU采样继续分开。用户编辑器未重启，稳定60、长期驻留、LOD和完整War3保持待办。

### 第一百四十七阶段／新批次任务2/3：内置UI管线按批次状态创建

变更路径：`crates/mengine-rhi/src/ui.rs`。分段采样确认共享设备后的三个视口，UI初始化分别723.516／702.010／695.157ms；272e65b中的UiRenderer在构造时创建20种混合／深度／模板状态管线。现在保留设备自己的内置ShaderModule，初始缓存为空，仅在prepare遇到对应普通UI批次时创建，后续复用同一GPU管线。Push／Pop仍规范化为Alpha，状态范围仍20种；空UI不创建内置管线，模板引用、格式／采样数、自定义与错误材质路径保持原语义。首次状态编译计入既有pipeline_prepare_ms，首次使用新状态仍需编译，不能把构造阶段减少的时间当成全部消失。

4项去重GPU检查通过：新增BGRA单采样20状态首次创建／第二次复用与空计划检查，既有软裁剪像素、模板／自定义／错误管线及采样特效参数检查。软裁剪用例修改前后各运行一次，12种输入×32／48尺寸的159744字节完整RGBA逐字节相同，涵盖模板、深度投影和自定义／错误材质；不是全地图视觉验收。最终Editor Host Release接口检查通过，前端及完整Editor未重建。测试命令为`cargo test -p mengine-rhi --release --lib`分别筛选`builtin_ui_pipelines_are_created`、`soft_clip_transitions_match_explicit_full_viewport_clips_on_gpu`、`stencil_pipelines_encode_on_an_available`、`sampled_effect_parameters_match_custom_hooks_pixels`，均带`-- --nocapture --test-threads=1`。

定向构造对照复用146冻结程序与本项冻结example，3组反转顺序、每次独立进程，各保留3个共享设备的1280×720空视口，均未绘制UI。总构造中位数4050.630→1945.799ms；根进程私有内存738.820／735.828MiB，没有证明实质内存收益。这是空视口准备时间，不是Game首帧、地图加载、FPS或长期驻留结果。新增example SHA256为`8d6b7b262c2fbfb531b9bfa68c4f383620cd75d74ef6e23a90988269e3f4c4ae`。`headless-init-trace.log`、`ui-pipeline-{benchmark,benchmark-summary,pixel-proof}.json`、分段测试和原始RGBA均在`tmp/docs-artifacts/editor-performance-risk/`。

当前2/3，先提交实现与待测记录；第三项后统一构建，承接146的真实启动／并发视口／热更新／隐藏尺寸／关闭重开及驻留场景，并检查UI首帧与首次出现模板／混合状态、错误材质恢复和普通FPS。用户编辑器保持原进程；稳定60、长期驻留、LOD、完整原图脚本与War3保真继续待办。

### 第一百四十八阶段／新批次任务3/3：复用固定BRDF积分编码

变更路径：`crates/mengine-rhi/src/ibl.rs`。128×128、每像素256次积分的固定BRDF查找表，以进程内OnceLock保留只读u16编码数据；首次调用计算，后续视口直接读取相同65536字节载荷。每个视口仍创建自己的纹理与sampler，GPU上传和格式保持，缓存不持有项目或GPU设备；关闭项目后只保留这份固定CPU数据。积分公式、尺寸、采样数及f16转换不变，首次计算成本仍存在。

3项定向CPU／Shader契约检查通过，含3个并发调用的同一只读数据、全部32768个编码值与逐次计算对照、固定逻辑字节数、原有有限性／范围和环境预滤波WGSL校验。手动基准在修改前单独运行通过，2轮预热后7轮完整积分／编码耗时中位数78.4483ms，校验和372753845；该成本现在只在进程首次发生，不把省去的重复计算直接外推并发启动墙钟或FPS。复现：`cargo test -p mengine-rhi --release --lib ibl::tests -- --nocapture --test-threads=1`；手动筛选`benchmark_brdf_lut_encoding -- --ignored --nocapture --test-threads=1`。日志为`tmp/docs-artifacts/editor-performance-risk/brdf-encoding-{before-benchmark,tests,final-test}.log`。

146–148达到3/3，提交后统一构建custom-protocol Release；前端源码／dist未变且摘要匹配时复用已验证前端。合并验证实际首次Game画面、材质／纹理热更新与错误恢复、姿态／透明选取、DotA有效缓存与关闭重开、Amazonia多窗口／scene.diff／暂停步进停止重启、5轮等时驻留、隐藏旋转尺寸及Profiler。普通FPS与硬件计时单独采样，复用未受影响的导入转换、前端逻辑和已通过GPU范围；当前仍是实现与定向检查完成，实际程序收益另记，不宣称稳定60、长期驻留或完整War3完成。

#### 146–148批次补充：共享设备回读等待

ff02e3b的启动、资源热更新、空间选取及DotA缓存／重开检查通过；实际多窗口在Game重开后停止原生出帧，Scene和Game均报告shared frame timed out。最小复现以两个共享设备的1280×720视口并发渲染／回读，120次预期只完成13次即超时。当前wgpu 24 DX12设备的fence等待复用同一event；并发阻塞poll可消耗其他等待者的信号。此故障属于本批共享设备实现的补充修复，不增加任务计数。

变更路径：`crates/mengine-rhi/src/{headless_context.rs,renderer.rs,readback.rs,headless_context_tests.rs}`、`scripts/qa-frost-map-session.mjs`。每个GpuContext创建独立poll门闩，Renderer与回读ticket共享其Arc，仅在阻塞device.poll期间持锁；渲染提交、RGBA整理、每视图资源和回读池继续独立。ticket保留门闩所有权，设备布局／独立设备仍使用不同门闩。QA记录两个视口的GPU状态、阶段及逻辑内存，开启硬件计时时检查实际Forward HDR和Texture readback copy结果。

同一最小复现修复后120次完整像素对照通过；纳入常规GPU回归。4项共享设备与5项回读定向检查通过，覆盖最后所有者释放、设备丢失、独立布局、取消与反序完成、尺寸／格式／映射失败恢复及GPU查询。命令：`cargo test -p mengine-rhi --release --lib headless_context_tests -- --nocapture --test-threads=1`与同参数`offscreen_readback_`筛选。日志在`tmp/docs-artifacts/editor-performance-risk/shared-poll-{before-stress,after-stress,context-tests,readback-tests}.log`。

统一原生验证完成：146–148及补充5a25c50在同一custom-protocol Release上通过8个用例。构建81秒，58个前端产物摘要未变并复用；冻结程序`tmp/docs-artifacts/editor-performance-risk/build-5a25c50/mengine-editor-tauri.exe`，SHA256为`1b5b78b518e9d2c228b3c2829e710698c32c29878a25a09a290be858c66766a2`。因修改公共回读路径，同步覆盖实际资源恢复、选取和DotA缓存，复用未变化的导入转换、前端逻辑及不相关CPU检查。8个测试进程均正常退出、发现文件移除，记录中无控制台error；WebView隔离缓存因EPERM保留。用户编辑器PID64664保持原进程，未重启。旧多窗口失败保留诊断记录，修复后的本机集成通过。

- 启动`viewport-startup-1792907609807`：打开工程1882.664ms；随后Game首次接受原生帧2693.850ms，不含进程启动／工程打开。Scene已预热，切换后30.594ms，不能视为冷启动。主菜单及相机预览截图已检查。
- 资源热更新`resource-poll-1792907925560`、空间选取`spatial-picking-1792907932984`通过；覆盖材质／实例／Shader／父资源恢复、姿态／透明／父级／可见性／Play重启选取。DotA有效缓存／选取／关闭重开`arbitrary-map-1792907955225`通过，14437实体；导入器未变，未重复冷转换。
- Amazonia多窗口`map-session-1792907633375`通过7434实体、Game关闭重开、精确版本关联、稀疏scene.diff、Pause／Step／快捷键、Stop作者恢复和undo／redo、再次运行及5轮驻留。隐藏／尺寸／旋转`map-session-1792908015446`通过，隐藏Scene停止原生与浏览器绘制，恢复后继续出帧。Game与第五轮再次运行截图已检查。
- GPU多窗口`map-session-1792908051954`和Profiler界面`profiler-bundles-1792908110787`通过；Scene／Game均启用硬件计时，timestamp period为10ns，各自产生有限Forward HDR及Texture readback copy等6个阶段。普通FPS用例关闭GPU计时，不能混用采样比较。

普通多窗口最近240间隔：Scene59.429／Game59.924FPS，p95间隔23.8／21.7ms，平均原生render7.897／8.397ms。DotA Scene59.979／Game59.381FPS，p9524.0／22.7ms，render14.580／9.591ms。单次数据未证明稳定60或整帧收益；本批确认首帧准备优化与并发回读故障修复，不新增LOD削减。

5轮各运行15秒／Stop空闲20秒，20份内存样本的进程身份、创建时间及求和已核对，空闲均7进程。根私有内存3204.688／3437.773／3487.355／3470.293／3464.289MiB，首末+259.602MiB、后三轮-23.066MiB；进程树首末+330.957MiB、后三轮+5.383MiB。较旧版本绝对占用降低，当前增长非单调且原因未确定，不能据此判定长期稳定或排除泄漏。

执行入口`tmp/docs-artifacts/editor-performance-risk/run-shared-poll-batch.ps1`，汇总`shared-poll-batch-{driver,summary}.json`，逐项日志`shared-poll-batch-native-*.log`；实际地图／窗口报告与截图在`tmp/docs-artifacts/testing-batches/B001/`。相关本机批次结束，下一批0/3；尾延迟、长期驻留、LOD及完整War3规则继续待办。

### 第一百四十九阶段／新批次任务1/3：按需核对GPU分配器占用

已有每视图约78／82MiB的逻辑统计不覆盖完整设备分配、驱动私有堆及流水线，不能解释根进程3GiB以上占用或反复运行后的增长。新增`profiler.get_samples`参数`includeGpuAllocator`（默认false），按需读取现有原生视口所属GPU设备的分配字节、内存块预留字节、分配数、块数、耗时和最多64组资源标签汇总。每个进程的GpuContext分配单调设备标识，共享视图返回相同deviceId；这些总量只能按设备计一次，不能再加到逐视图逻辑估算。没有视口返回null，后端不支持时available=false且计数字节为null；不将缺失值写成0。后端报告不代表系统GPU驻留、驱动私有堆或进程CPU内存。

变更路径：`crates/mengine-rhi/src/{headless_context.rs,renderer.rs,lib.rs,headless_context_tests.rs}`、`crates/mengine-editor-host/src/{lib.rs,viewport.rs,viewport_gpu_memory.rs}`、`packages/editor/src-tauri/src/{lib.rs,native_gpu_memory.rs}`、AgentBridge／querySchemas及MCP server、`scripts/qa-frost-map-session.mjs`。不在逐帧路径采集分配器，也不为查询创建renderer；原生命令在工作线程读取现有视口，显式查询期间持该视口锁，耗时单独返回。QA的`--gpu-memory-diagnostics`在既有进程内存采样阶段同时留存Scene／Game设备数据。

3项定向检查通过：后端不支持与有效空报告的区分、标签合并／稳定排序／64组上限，以及真实GPU共享／独立设备标识和新增8MiB缓冲区归属。该GPU夹具实测已分配85983232字节、预留335544320字节，说明预留与有效分配不能混用；不是实际地图或进程内存结论。TypeScript、Tauri Release接口检查、两份JS语法检查通过。日志`tmp/docs-artifacts/editor-performance-risk/gpu-memory-diagnostics-{tests,gpu-test,typescript,tauri-check}.log`；筛选`viewport::gpu_memory::tests`（editor-host）与`gpu_allocator_diagnostics_`（rhi）。

9471003定向诊断完成：前端生产构建通过，原生custom-protocol Release构建83秒；冻结程序`tmp/docs-artifacts/editor-performance-risk/build-9471003/mengine-editor-tauri.exe`，SHA256为`6504ff4491d876ae31e9d3bdd97047ca5a03222f46f270d2f99f14b482c807df`。33项来源摘要、61个前端文件摘要及4个内嵌入口已核对。为定位上一批已知增长，仅执行带采样的3轮Amazonia运行／停止复现，不作为整批性能验收。

`map-session-1792909115555`通过7434实体的多窗口、暂停步进、停止及3轮各运行15秒／空闲20秒。14个阶段的进程身份、创建时间、求和、GPU数据和同设备标识已核对；所有Scene／Game读取均为deviceId=1，均有有效后端报告，单次后端查询最高3.2301ms。3次等时空闲GPU分配1100.250／1104.250／1102.812MiB，预留均1408MiB；根进程私有内存3217.578／3213.824／3244.965MiB，首末+27.387MiB。本次未重现上一批约260MiB增量，不能据此排除长期增长或将预留容量认定为其原因。

最终设备标签中mesh_vb为7940份、509.938MiB，material_texture为93份、201.750MiB；这是后端分配数据，含多个视口，不能与某个视图的当前可见逻辑字节直接相减。下一步优先核对顶点缓冲的分配粒度与跨视图重复几何，针对实际资源成本优化。进程正常退出、发现文件移除，WebView隔离缓存因EPERM保留，用户原编辑器未重启。日志`gpu-memory-diagnostics-native.log`、汇总`gpu-memory-diagnostics-summary.json`均在上述临时证据目录，原始地图报告在`tmp/docs-artifacts/testing-batches/B001/`。

完整默认关闭／按需采样、空工程、共享视图、项目关闭／重开和其他工具兼容场景，留待本批累计3项后的合并验证。当前1/3，尚未宣称内存增长已修复。

### 第一百五十阶段／新批次任务2/3：同设备复用完整相同的顶点数据

变更路径：`crates/mengine-rhi/src/{headless_context.rs,mesh.rs,renderer.rs,shared_mesh_vertices.rs,shared_mesh_vertex_tests.rs}`、`crates/mengine-rhi/examples/shared_mesh_memory.rs`及host的内存来源说明。GpuContext内以完整顶点字节查找不可变GPU缓冲：先哈希，再逐字节确认，覆盖位置／法线／UV和长度；相同字节可以跨网格键及视图复用，索引拓扑、变换、包围盒、选取数据和材质保持各自语义。哈希在设备缓存锁之外计算，查找和首次上传合并；上传准备计时包含该成本，已有顶点不再重复上传。

索引只持Weak，实际网格持Arc；仍有其他所有者时不进入可写空闲池，最后所有者以Arc::try_unwrap原子转移后才允许复用写入，防止并发Weak升级与释放竞争。每设备保留的CPU比对载荷上限64MiB，最多16384个哈希键、每键4个Weak候选；元数据按FIFO替换，不延长GPU所有者寿命，超过载荷预算走原私有缓冲路径。该CPU载荷和元数据有额外成本，不能视为零成本GPU去重；现有逐视图逻辑字节可能重复计数，host来源说明已同步更新。

7项定向GPU检查及最终Editor Host Release接口检查通过，覆盖强制哈希碰撞、法线／UV不同、载荷预算／Weak元数据上限、并发上传合并、完整RGBA与独立renderer对照、热更新／不同拓扑／关闭另一个视图、外部注册缓冲完整字节保持、前一提交的像素保留、空间包围盒更新和120次并发回读。筛选为`shared_vertex_uploads`、`exact_bytes_resolve_collisions`、`recycled_vertices_preserve`、`registered_vertex_aliases`、`shared_device_preserves_concurrent`、`spatial_culling_submits_camera_shadow_union`、`concurrent_shared_device_readbacks_complete`，命令均为`cargo test -p mengine-rhi --release --lib <筛选> -- --nocapture --test-threads=1`。日志`tmp/docs-artifacts/editor-performance-risk/shared-vertices-*.log`。

修改前后各1个独立进程，两个共享设备视图各上传2048份不同小网格、两个视图内容相同但键名不同。设备mesh_vb从4098份／256.125MiB降至2050份／128.125MiB，减少128MiB；第二视图2048次命中。设备全部分配328.625→200.625MiB，分配器预留576→320MiB。单次夹具首视图墙钟49.5478→58.9744ms、第二视图75.4158→2.0864ms，包含队列flush和GPU完成等待，不能作为纯CPU或稳定性能结论。不是实际地图FPS、进程私有内存、系统GPU驻留或长期收益证明。

夹具`cargo run -p mengine-rhi --release --example shared_mesh_memory`，原始`shared-vertices-{before,after}.jsonl`、冻结EXE及`shared-vertices-memory-summary.json`均在上述临时目录；基线生产来源ce5f016，前后夹具代码相同。当前149–150为2/3，第三项后统一原生构建并验证Amazonia／DotA的实际分配、FPS、Pose／材质／几何热更新、选取／阴影／视图隔离、项目关闭重开及Stop驻留；本项未重建完整Editor或重复地图转换，当前用户进程保持原版本。

### 第一百五十一阶段／新批次任务3/3：同设备复用不可变材质纹理

变更路径：`crates/mengine-rhi/src/{headless_context.rs,renderer.rs,shared_material_textures.rs,shared_material_texture_tests.rs}`、`crates/mengine-rhi/examples/shared_texture_memory.rs`、host纹理内存来源说明及`scripts/qa-viewport-startup.mjs`。GpuContext以尺寸、sRGB／线性格式和完整RGBA8字节查找不可变材质纹理，哈希后逐字节确认；网格材质槽和sampler保持独立。先查询已有纹理，未命中时在共享锁外计算原有Mip链，再次检查并合并GPU创建。各视图持Arc，查找仅Weak；替换只改本视图的材质映射，原有绑定和bundle失效逻辑保持，其他视图继续使用各自内容。字体、动态UI及其他纹理路径保持原有实现。

CPU比对载荷上限64MiB／设备，最多2048个哈希键、每键4个Weak候选，超预算使用私有纹理，不延长已释放资源的GPU寿命。该载荷有额外CPU内存成本；与150的顶点载荷分别计量。逐视图逻辑纹理估算可能重复计数，物理分配使用149的设备报告去重核对。

9项定向检查通过：2项Mip过滤／非二次幂边界、2项新GPU完整像素／并发合并／不同尺寸与格式／热更新／无效数据／最后所有者及碰撞／预算／Weak元数据检查，另有2项纹理生命周期、1项材质bundle即时释放、1项角色参数及1项缺失纹理错误回退。筛选`material_mips_`、`shared_material_texture`、`material_texture_lifetime_tests`、`material_changes_release_obsolete_bundle`、`material_texture_roles_and_map_parameters_remain_distinct`、`only_non_empty_unavailable_material_textures`，命令为`cargo test -p mengine-rhi --release --lib <筛选> -- --nocapture --test-threads=1`；启动QA新增`--allocator-lifecycle`核对默认不采样、共享设备、项目关闭空值及重开新设备，JS语法检查通过。

修改前后各1个独立进程，两视图各上传16种512×512 RGBA8纹理，视图内容相同、键名不同。material_texture分配32份／44MiB→16份／22MiB，设备全部分配减少22MiB，预留均320MiB。首视图单次墙钟232.2939→238.5665ms，第二视图232.7657→4.9652ms，含队列flush和GPU等待；夹具新增CPU比对载荷16MiB，不能把GPU节省直接当成进程私有内存或FPS收益。原始`shared-textures-{before,after}.jsonl`、冻结EXE及`shared-textures-memory-summary.json`在`tmp/docs-artifacts/editor-performance-risk/`，夹具命令`cargo run -p mengine-rhi --release --example shared_texture_memory`，基线135b7ab。

149–151已达3/3，提交后统一构建并验证：真实启动／相机预览和分配器生命周期；资源／材质／几何／姿态／透明选取及视图隔离；DotA有效缓存／关闭重开；Amazonia多窗口、暂停步进、Stop恢复、5轮等时驻留与设备分配；隐藏旋转尺寸；双视口硬件GPU计时和Profiler。统一使用新冻结程序；前端61文件摘要未变则复用，不重复无关检查或冷地图转换。地图资源设置补充d4bc3b3已保留，诊断程序采用进程级游戏目录配置验证其消费链。当前为实现与定向检查完成，实际地图收益与长期内存结论待该批结果。


### 地图导入故障补充：机器级公共资源目录与 sample setup

变更：`scripts/runtime-import-frost-map.py`、`samples/frostbound-realms/{project.json,setup.cmd,setup.ps1,README.md}`、`scripts/test-frost-game-directory.py` 及既有依赖测试夹具。公共资源位置按显式 `--game`、进程 `MENGINE_WARCRAFT_ROOT`、Windows 当前用户环境变量依次解析；缺失配置或四个 MPQ 不齐时在准备工具之前提示 setup。sample 移除机器路径和固定选图起始目录，构建器继续沿用项目配置。setup 校验输入、允许无效目录重试、保存用户环境变量；`-SessionOnly` 仅设置当前 PowerShell 进程。运行 setup 不写工程配置文件，已继承旧环境值的编辑器需完全退出重开。

针对当前远程缺资源路径故障执行必要定向检查：环境目录测试10项和工具准备测试10项去重通过，包含优先级、用户注册表读取、缺失资源列表、构建前拦截、实际CLI错误收据、Windows PowerShell 5.1参数和交互流程、中文／空格／方括号／带引号路径、Python子进程继承及工程配置字节不变。交互和子进程夹具分别修正输入管道编码及PowerShell原生命令引号传递后仅补测失败项。用真实游戏目录执行 `setup.ps1 -SessionOnly`，同一进程启动 Python，经实际目录解析打开四个 MPQ，并从 War3Patch.mpq 读取 Units/UnitData.slk 共309954字节；验证前后用户环境变量和 project.json 均未变化。校验摘要与日志在 `tmp/docs-artifacts/map-import-environment/`，不提交原始产物。

复现：`python scripts/test-frost-game-directory.py`、`python scripts/test-frost-import-tools.py`；用户入口为 sample 的 `setup.cmd`，或从仓库根目录执行 `powershell -NoProfile -ExecutionPolicy Bypass -File samples/frostbound-realms/setup.ps1`。本项为既有地图导入故障修复补充，不新增独立任务计数；远程用户默认持久化设置和原生选择／导入验收仍待现场或批次执行。本次未重新构建编辑器、未重跑完整地图转换或全库测试；复用已有转换验证，新增验证聚焦环境配置消费链路。


### 地图导入故障补充：进度文件占用不终止转换

远程日志在转换第72类装饰模型后，由 `ImportProgress.report` 的 `os.replace(progress.tmp, progress.json)` 抛出 `PermissionError [WinError 5]`，使整个转换退出。日志不能识别占用进程；本机使用不共享删除权限的真实 Windows 读句柄，已复现相同错误。修改 `scripts/runtime-import-frost-map.py`：进度写入／替换的 OSError 保留旧快照，按后续进度调用重试，失败尝试也参与数量节流，同一作业只警告一次；地图转换和资源校验异常继续正常失败。无重试等待，也不修改引擎读取协议。

`python scripts/test-frost-map-cache.py` 10项通过，新增覆盖真实 Windows 句柄占用／释放恢复、WinError 5 注入后的原子快照与节流、临时文件写入拒绝不打断缓存资源验证；既有损坏资产和路径越界拒绝检查继续通过。实际转换复用隔离工具与资源缓存，在独立目标工程运行 DotA_v6.83d，整个转换期间持续持有 progress.json 读句柄：退出码0、cached=false、461个资源校验成功、旧进度快照未被破坏、进度警告恰好1条。未将结果写成远程机器验收。

证据位于 `tmp/docs-artifacts/map-import-progress-lock/`：`baseline-lock.log`、`progress-tests.log`、`verification.json` 和 `locked-job/converter.log`；实际锁定导入复现入口为该目录的 `verify-locked-import.py`。同一地图导入故障补充不增加独立任务计数。远程拉取后的实际导入仍待重试；未重编译编辑器或扩大到全库测试，其他批次队列保持原状态。
