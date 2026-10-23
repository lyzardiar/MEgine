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
