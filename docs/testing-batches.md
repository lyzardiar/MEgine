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
