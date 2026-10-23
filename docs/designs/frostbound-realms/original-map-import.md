# 原版地图读取与来源维护

Author: MiYu。

`scripts/import-frost-original-map.py` 从本机原版 `.w3m` / `.w3x` 生成可验证的 `map.json`，保留源地图、提取成员和 SHA-256。输入地图只读；输出要求新目录，完整写入临时目录后再发布。默认产物位于 `tmp/docs-artifacts/frost-original-maps/<地图文件名>/`。

导入器提供离线格式读取。`coverage.runtimePlayable` 为 `false`：现有 Frostbound 模拟仍使用 32×32 地形、双队状态和 160 单位上限；地形已有独立原生场景，完整原地图尚未接入遭遇战、寻路、存档或联机。装饰与单位／物品放置记录已解码，对象覆盖和 JASS 保留原件，尚未执行。导入结果尚未加入现有地图菜单。

## 支持的布局

| 数据 | 已读取字段 |
|---|---|
| 地图容器 | 直接 MPQ，或 512 字节 `HM3W` 包装头后的 MPQ；复用 `scripts/warcraft_mpq.py` |
| W3E 11 | 原始矩形尺寸、原点、地表／悬崖材质 ID、每个顶点的高度、水位、边界、坡道、腐地、纹理与变体、悬崖层级 |
| WPM 0 | 原始尺寸和全部路径字节，包括当前未解释的位；每个地形格对应 4×4 路径格 |
| W3I 18/25 | 地图信息、相机边界、可玩范围、玩家槽和起点、势力、科技及升级限制、随机单位／物品表、资料片环境参数 |
| WTS | UTF-8／BOM、多行文本、记录间和记录头注释；保留 `TRIGSTR` 原字段并提供字符串表 |
| DOO 7/8 | `war3map.doo` 中的对象ID、变体、位置、角度、缩放、状态、生命比例、掉落集合、编辑器ID及地形装饰，详见[装饰数据说明](original-doodads-import.md) |
| Units DOO 7/9、8/11 | `war3mapUnits.doo` 中的单位／物品ID、变换、玩家、生命／魔法、金矿资源、英雄属性、掉落、背包、能力、自定义颜色、传送门及随机单位配置 |

`map.json` 使用 `schema=mengine.warcraft-map`、`schemaVersion=1`。`terrain.corners` 按源文件行序排列，每项为 `[i16地面高度,u16水位,u8纹理标志,u8变体,u8悬崖层级]`，包括保留位。`terrain.vertexSize` 是顶点数，`tileSize` 为顶点数减一。`pathing.cells[y*width+x]` 保存源字节。

坐标保持 Warcraft XY，不转换为引擎 XZ。左下原点来自 W3E，地形格边长 128，路径格边长 32；路径查询使用左闭右开范围，地图外返回 `None`。`corner_at` 的高度值采用格式参考的归一化值 `(raw-8192)/512`，并单独保留悬崖层级；它不代表已经完成原版地形表面的采样、坡道或悬崖网格生成。

未知版本、截断、无效计数、非有限坐标、尺寸不一致、额外二进制尾部均拒绝。无法完整解析的可选 WTS 原件仍保留，`diagnostics` 记录问题，`coverage.strings=preserved-unparsed`，字符串引用不替换。缺失可选成员标为 `absent`。

## REA 与独立格式参考

### 单位与物品放置

`warcraft_units.py` 读取经典版本7／子版本9和版本8／子版本11；`map.json.units` 保留字段、源坐标与顺序，`coverage.units=decoded-editor-placements`。随机标志支持-1（无附加记录）、0（原始24位level字节与物品类别）、1（无符号全局表索引）、2（自定义ID／概率表）。不把默认值-1、保留位或未知对象ID替换为样例默认值。未知版本／随机模式、截断、非法计数、非有限浮点数和尾部数据明确拒绝。

`war3map.w3u`、`.w3t`、`.w3a` 原件及摘要一并保存，coverage分别标为 `preserved-unparsed`；尚未应用单位、物品和能力覆盖。导出收据含 `unitReaderSha256`。`load-frost-warcraft-map.py` 输出 `editorUnitPlacements`（源记录）及 `renderedUnitPlacements`（生成视觉对象），两者都不表示已经执行单位玩法。

REA命令 `node scripts/probe-frost-rea-map-formats.mjs --units` 使用本机WorldEdit.exe，SHA-256 `811130e637b4885c08c3c8cb707d0e02a7692ddcddc4c1d57c783c3379ef4b90`。`0x0059f940` 返回 `Units.doo` 字符串；`0x0062ad05` 起引用 `CreateAllUnits`、`CreateNeutralHostileBuildings`、`CreateNeutralPassiveBuildings`。这是编辑器文件名入口与脚本生成引用证据，不能证明运行时直接从放置文件创建单位。正式2组探针通过，报告位于 `tmp/docs-artifacts/frost-original-maps/unit-evidence/`；早期Game.dll精确字符串查询无命中，不据此断言文件未使用。

2026-10-23定向验证：

- 5组Python检查通过（4组布局／畸形输入与1组导出集成），覆盖两版本、四随机模式、所有截断点、原始位、嵌套记录、覆盖原件及收据；受影响导入器原有9组检查通过。
- 固定上游读取器对8个夹具和Booty Bay／Amazonia逐字段比较、独立重建字节全部通过。两图分别61／98条记录，各包含2个`sloc`起点，金矿分别6／4个。
- `test-frost-unit-placement-jass.py` 对两图JASS字面量分别匹配59／96条CreateUnit：ID、玩家、位置（源文本0.1单位精度）与朝向（0.001度精度）一致；10处SetResourceAmount与金矿数据一致，4个起点与W3I一致。此工具只审计指定字面量模式；不执行函数、触发器或随机表，不作为通用JASS解释器，也不证明运行顺序。

证据目录 `tmp/docs-artifacts/warcraft-map-tests/unit-placements/` 包含8个夹具、两图独立导出、`reference/report.json`、两份`map-*/unit-jass-audit.json`。未重新生成地形／装饰或运行全地图、全库、原生QA。主样例仍需原尺寸坐标／寻路、对象覆盖、脚本创建和运行验收。

```powershell
python scripts/test-warcraft-units.py --output <新的临时证据目录> --maps '<BootyBay.w3m>' '<Amazonia.w3x>'
node scripts/test-warcraft-units-reference.mjs <临时证据目录>
python scripts/test-frost-unit-placement-jass.py <临时证据目录>/map-0 <临时证据目录>/map-1
node scripts/probe-frost-rea-map-formats.mjs --units
```

### 单位视觉场景

`build-frost-original-units.py` 在同一地图的既有地形／装饰项目上添加单位视觉对象，输出要求新目录。它核对原地图与基础地形网格摘要，保留已有实体、资源和脚本，再合入单位动画分组；不重新生成地形或既有装饰。`load-frost-warcraft-map.py` 默认串联地图导出、装饰项目和单位项目；可通过 `--base-project <项目>` 复用已生成的同图项目，输出仍是 `<output>/project/`。中间装饰项目保留在 `doodad-project/`，用于复现及失败后接续。

模型路径、`modelScale`、RGB来自源UnitUI，移动高度来自UnitData；按`(X,Z,-Y)/128`保留编辑器放置位置，纵轴加源移动高度，轴向缩放再乘modelScale。队伍纹理取放置自定义颜色、源行teamColor或玩家颜色，经典中立玩家使用颜色12；此解析尚未通过原DLL同视角对照。`sloc`保留为起点记录，不创建游戏单位。固定ID记录中的randomFlag元数据不触发随机生成；随机占位ID、未知单位／物品定义及W3U／W3T／W3A覆盖需解析后才允许生成，不能静默跳过。

模型与状态轨道复用经摘要校验的转换库；基础纹理和TeamColor／TeamGlow按源归档优先级读取。单位资产位于`Assets/OriginalUnits/`，许可位于`Assets/Licenses/OriginalUnits/`，放置映射与来源分别写入`unit-placements.json`、`unit-scene-sources.json`。同模型、材质颜色和动画状态共享更新组，静止部件不更新；12Hz采样帧未变化时不发布命令。单位待机预览使用源clip循环属性，不声称已经实现原版单位动画命令与随机调度。

PREM模型粒子使用原始模型及独立年龄推进，保留模型动画、纹理与材质状态。当前Amazonia飞羊需要`SharedModels/Feather1.MDX`；源KPEV在Stand／Walk为0，仅Death的18300–18467ms发射。必须使用支持PREM模型路径和可见性轨道的采样器；本阶段复用`tmp/warcraft-effects/farseer-bin/MdxExport.dll`，摘要记录在收据中。模型粒子子模型如有嵌套发射器则明确拒绝；源粒子求解器一致性仍待验证。

原版表字段经REA `--unit-appearance`确认字符串位置，报告`tmp/docs-artifacts/frost-original-maps/unit-appearance-evidence/`；字符串不证明变换公式。坐标、移动高度、RGB与modelScale的独立预览参考为固定上游`src/viewer/handlers/w3x/unit.ts`，源站与许可见[格式维护](../../../third_party/warcraft-map-format/README.md)。

2026-10-23生成项目`tmp/docs-artifacts/warcraft-map-tests/amazonia-units/project/`：98条记录中96个视觉对象、2个起点，新增561实体；连同复用的28个地形实体共589实体，33个源模型（含羽毛）、148个动画组、338个单位资产。2组变换／边界检查、资源摘要及原地形网格／实体不变检查通过。主样例未切换；本项目只有地形与单位，既有装饰项目未重复生成。

原生报告`B001/original-units-1792732411819.json`中，全部变换／父子关系、动画、暂停、Stop恢复及金矿／石头人／飞羊像素贡献与重开一致已通过，最后的“待机羽毛可见”断言失败。根据源可见性轨道改为Death采样后，仅重测该项，`B001/original-units-1792732541325.json`通过：死亡0.5秒模型粒子有像素贡献、重开一致、控制台0 error。该检查手动设置SampledEffect，不代表死亡玩法已接入。两次Editor正常退出，复用本批EXE；打开加快照约0.72秒，仅为这次589实体场景的观察值，不作为性能提升结论。

```powershell
python scripts/build-frost-original-units.py <地图导出> --base-project <同图地形或装饰项目> --output <新项目目录>
python scripts/test-frost-original-units.py --project <单位项目>
node scripts/qa-frost-original-units.mjs <单位项目>
# 只重测飞羊源Death模型粒子：附加 --effects-only
```

尚未完成：单位对象覆盖与物品视觉、运行时地形贴合、完整单位出生／死亡／资源／战斗、随机与掉落、动态阴影、碰撞／寻路、JASS、保存及联机；编辑器放置视觉不能代替原版实际对局验收。

### 合并原地图测试项目

2026-10-23已用完整加载入口生成 Amazonia：`tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project/`。在 MEngine 打开此目录即可查看原尺寸地形、水面、2,452个装饰放置及96个单位视觉对象，共7,403个实体；另有2条起点记录。原地图位于游戏安装目录 `Maps/FrozenThrone/(2)Amazonia.w3x`，SHA-256为`211c74b708f0caa9774741aab8f761de66fb9ea68271ff10cdef72b0da7adf60`。项目保留来源与工具摘要、原件及资源许可，中间装饰项目位于相邻`doodad-project/`。主样例未切换，完整对局仍待接入。

`qa-frost-original-map-composition.mjs` 专门检查各层合并后的引用、共享回调、暂停、停止与重开。原生报告`tmp/docs-artifacts/testing-batches/B001/original-map-composition-1792733463253.json`通过：164个装饰实体、328个单位实体及9个地形实体在同次推进中改变；暂停像素稳定，Stop恢复全部实体，重新Play的状态与像素一致，控制台0 error。单位资源完整性检查确认基础6,842实体与地形网格保持一致。全景和金矿周边截图在报告同目录，以同名为前缀。

本次复用现有EXE，只验收首次合并输入，没有重跑两图旧用例、完整原生QA、全库测试或引擎构建。打开加快照约5.01秒，五次截图总耗时29.47–55.06ms；冷暖状态与视角不同，仅用于后续定位，不证明性能改善或稳定帧率。编辑器正常退出；WebView缓存锁导致临时缓存保留。

```powershell
python scripts/load-frost-warcraft-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/FrozenThrone/(2)Amazonia.w3x' --output <新的输出目录>
$env:MENGINE_EDITOR_EXECUTABLE='G:/work/github/MEgine/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-original-map-composition.mjs <输出目录>/project
```

加载入口针对包含装饰的项目返回该组合检查命令；复用纯地形基础项目时仍返回单位检查命令。组合测试覆盖编辑器加载与播放，不能作为原版同视角、JASS、寻路、战斗或联机验收。

### 原始寻路网格运行时

`samples/frostbound-realms/game/warcraft-pathing.js`保留WPM全部8位基础标志、矩形尺寸与W3E原点。地图入口在单位项目完成后调用`install-frost-original-pathing.py`，读取并校验保留的原地图归档，向生成项目加入`Assets/Data/OriginalPathing.json`、`pathing-sources.json`和脚本全局`originalMapPathing`。现有项目可单独安装，不需重建地形、模型或贴图；重复安装、不同地图基础项目和修改过的源归档会被拒绝。

源32单位路径格对应引擎0.25单位，使用`sourceCell(x,y)`或`engineCell(x,z)`定位，后者按`(x*128,-z*128)`回到源坐标；不缩放到32格或把越界点夹到边缘。`getSource/getEngine/getCell`返回完整标志字节，越界返回`null`，非有限坐标拒绝。源坐标采用左下包含、右上不包含的半开区间；引擎Z轴反向后，相应包含边也反向。`cellCenter`返回引擎XZ，支持非方形地图。

`typeMask`按原版类型0–7映射到`255,2,4,8,16,32,64,128`，其余int32为0。`setCell/setEngine`的`pathable=true`清除所选基础标志，false置位，其他位保持；实际变化才增加revision。`snapshot()`保留当前基础网格，可创建独立实例；新Play重新构造原始数据。运行时不修改原地图，也不把此基础位判断冒充完整`IsTerrainPathable`：原版查询还涉及动态阻挡和引擎世界状态。

原DLL SHA见下节。REA `--pathing`确认`IsTerrainPathable`注册到`0x6f1e8440`、`SetTerrainPathable`到`0x6f1f6c60`；掩码函数`0x6f1e3be0`与表`0x6f1e3c18`、单格修改`0x6f036e20`已定位。`probe-frost-pathing-cpu.py`无外部调用替身地执行259组掩码与4,608组修改，原生32位格子的低24位保持不变。低24位语义尚未核对，JS运行时仅持有WPM基础字节。

定向验证通过：所有8位组合、矩形边界／轴反向、实例隔离、重复写入revision、快照恢复、畸形RLE及尺寸；原始Amazonia的384×384共147,456格与Booty Bay的768×384共294,912格在引擎坐标下逐格匹配原WPM，生成脚本在Node VM重建后恢复原值。RLE数据分别28,013和40,904字节，每次脚本实例创建只解码一次。没有重复原生QA、整图资源生成、全库或引擎构建。

Amazonia组合项目现已安装此模块；之前原生组合截图的脚本版本早于本模块。Booty Bay验证使用`tmp/docs-artifacts/warcraft-map-tests/pathing-runtime/booty-bay/`的脚本／收据夹具，不是完整可打开场景。REA／CPU证据位于`tmp/docs-artifacts/frost-original-maps/pathing-evidence/`。安装器保留原脚本字节与换行，并记录其SHA-256；新增大图容量拒绝与收据字段不改变网格。已有生成收据保留当时安装器摘要，最终安装器另以CRLF／LF脚本夹具验证来源摘要与字节保留。

```powershell
node scripts/probe-frost-rea-map-formats.mjs --pathing
python scripts/probe-frost-pathing-cpu.py
python scripts/install-frost-original-pathing.py <地图导出目录> <尚未安装寻路模块的同图项目>
node scripts/test-frost-original-pathing.mjs <项目目录>
```

主模拟仍有固定32格的移动、视野、建造、技能与存档校验，当前尚未接到本运行时；原单位／装饰动态路径纹理、移动类型、碰撞半径、路径搜索和JASS执行仍待完成。后续须让各子系统共同使用源坐标接口，不能只修改`SIZE`就声明原尺寸地图可对局。新的原生运行验证与绘制状态优化合并在B001执行。

### 地形与信息来源

- [REA 源站、固定版本与维护](../../../third_party/rea/README-MENGINE.md)：`morluto/rea` 6.5.0。
- Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `node scripts/probe-frost-rea-map-formats.mjs` 使用真实 REA MCP，确认 `.w3e/.wpm/.w3i` 字符串及引用。`0x6f76e9da` 构造地形路径后调用 `0x6f72f180`；`0x6f76eb7c` 构造路径文件名、调用 `0x6f819118` 并存在 `Path.tga` 回退；`0x6f6f0dfc` 把信息后缀传给 `0x6f702d60`。地址仅对上述 DLL 有效。
- 这些指令证明加载引用，不单独证明字段布局或原版运行行为。当前导入器要求 WPM，不实现 `Path.tga` 回退。
- [格式源站、固定提交及 MIT 许可](../../../third_party/warcraft-map-format/README.md)：`flowtsohg/mdx-m3-viewer`，提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc`。

## 复现与验证

```powershell
python scripts/test-warcraft-map.py
python scripts/import-frost-original-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/(2)BootyBay.w3m' --output tmp/docs-artifacts/frost-original-maps/booty-bay
python scripts/import-frost-original-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/FrozenThrone/(2)Amazonia.w3x' --output tmp/docs-artifacts/frost-original-maps/amazonia
node scripts/test-warcraft-map-reference.mjs tmp/docs-artifacts/frost-original-maps/booty-bay tmp/docs-artifacts/frost-original-maps/amazonia
python scripts/test-warcraft-map.py --maps 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps'
```

独立参考检查需要网络及编辑器的 TypeScript 开发依赖。它下载固定提交下的 23 个解析模块到临时证据目录，记录每个模块的摘要，再执行原 TypeScript 读取器，逐字段比较导出内容。参考源码不会成为游戏运行时依赖。

2026-10-23 验证：

- 9 组单元测试通过：完整截断位置遍历、非方形坐标、边界、保留位、两个 W3I 版本、非空随机表、非法计数／版本／浮点数、字符串、两种容器头、来源摘要、原件保留与输出目录保护。
- 298 张本地地图中 296 张完成 W3E/WPM/W3I 读取，包含 W3I 18 的 89 张和 W3I 25 的 207 张；W3E 与 WPM 全部逐字节重建一致。宽 64–480 格，高 64–416 格。
- `Download/DotA v6.77b AI 1.4 CN.w3x` 和 `Download/DotA_v6.83d.w3x` 的 W3I 在读取后续表时截断，明确拒绝。因此全目录验证命令返回 1，不能报告全量通过。
- 3 张地图的 WTS 存在当前语法不接受的内容：`NightElfX01`、`UndeadX03`、`(10)ExtremeCandyWar2004`。几何和信息成功读取，原字符串保留并报告警告。
- 从 JASS 常量找到 1,647 个与 W3I 一致的起点；9 张自定义地图存在不同起点，8 张没有可匹配的常量调用。此比较记录源差异，不能代替脚本执行或动态开局验证。
- 独立解析器检查：Booty Bay 的 18,721 个顶点、294,912 路径字节及 W3I 18 信息全部一致；Amazonia 的 9,409 个顶点、147,456 路径字节及 W3I 25 信息全部一致。
- Booty Bay 为 192×96 地形、768×384 路径格，玩家起点为 `[-8384,1792]`、`[8448,2048]`；源地图摘要 `3180a12a1df1cbacc3c11da9260e35fff2a3fe53314f63155e5f0735b2408b9e`。

证据：`tmp/docs-artifacts/frost-original-maps/{tests.log,corpus.json,rea-summary.json,reference-check/report.json}`，以及两个导出目录。该阶段没有修改游戏逻辑或引擎生产代码，没有新增原生 Editor／Player 运行验收，也不声明帧率改善。

后续接入需同时处理任意地图尺寸、原版路径格、原点和轴向、地形网格与材质、玩家槽、资源与装饰、脚本开局、序列化及网络协议；使用本阶段原件和坐标作为验证依据，避免通过缩小地图获得表面兼容。

原生地形消费入口已实现，见 [原版地形场景](original-terrain-scene.md)：保留地图尺寸、原版地表／悬崖／坡道／水面，生成独立 MEngine 项目；完整对局执行继续推进。

## 游戏内地图包

运行入口统一为 `samples/frostbound-realms` 工程。主菜单“单人游戏 → 自定义游戏 → 下一页 → Amazonia → 加载地图”切换到同工程的地图场景；返回按钮／Esc 回到原选图位置，重载按钮／R 建立全新的地图运行状态。WASD／方向键移动视角，`+/-` 缩放，空格暂停动画。原有地图的遭遇战、MOBA 等入口继续使用现有客户端。

`Assets/Maps/catalog.json` 登记地图 ID、显示信息、能力状态、原地图摘要、场景、运行脚本和缩略图。Amazonia 的资源位于 `Assets/Maps/amazonia/`；场景已加入 `project.json` 的 `buildScenes`，所有模型、材质、着色器和脚本的项目资源引用均迁移到该命名空间。原地图文件与成员保留在 `Source/`，转换来源记录在 `Provenance/`，`manifest.json` 记录安装资产摘要及原始来源。缩略图来自同一 `.w3x` 的 `war3mapMap.blp`，原件、PNG 和摘要一起保存；没有内置图片的地图使用路径格概览。

引擎切换场景后保留脚本 VM，通过 `onSceneLoaded` 通知游戏。`game/map-session.js` 据此创建地图脚本实例；每次重载重新创建动画时钟和 WPM 网格。返回主场景时重新建立客户端、实体缓存、UI 管理器及效果池。重复加载请求被合并，失败请求超时后释放重试入口。地图脚本按工厂隔离全局变量，共用游戏工程的引擎 API。

现有转换结果可直接安装：

```powershell
node scripts/install-frost-map-package.mjs tmp/docs-artifacts/warcraft-map-tests/amazonia-complete-visuals/project amazonia Amazonia samples/frostbound-realms
```

已安装的 `amazonia` 不会被此命令覆盖。更新地图时使用新的版本 ID，例如 `amazonia-v2`，对照新包的 `manifest.json` 后调整目录中的可选项；重编脚本后重新进入 Play。不要修改源游戏目录。整个转换流程也可自动安装：

```powershell
python scripts/load-frost-warcraft-map.py 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Maps/FrozenThrone/(2)Amazonia.w3x' --game-project samples/frostbound-realms --map-id amazonia-v2 --title 'Amazonia v2'
node scripts/sync-frostbound-script.mjs
```

安装器自动更新目录、构建场景和生成脚本；单独更改 `game/` 或目录条目时使用 `sync-frostbound-script.mjs`，无需重生成场景／美术。导入需要现有 Python 转换依赖；运行地图无需 REA 或源游戏安装目录。打包遵循项目 `buildScenes` 和 `assetMode=all`，本阶段未执行独立 Player 打包验收。

当前能力是原地图场景运行：地形、水面、装饰、单位动画和基础 WPM 网格。完整对局仍需把主模拟的固定 32 格空间迁移到原地图坐标，并接入玩家起点、单位与资源、动态阻挡、移动／视野、保存／网络和 JASS。目录以 `runtime=warcraft-scene`、`gameplay=false` 登记，界面不提供无效的种族／英雄设置；这不作为 Amazonia 对局完成的结论。

2026-10-23 定向验证：生成脚本的菜单点击、加载、返回、重载、暂停、旧玩法开局、失败重试、WPM 实例隔离和安装资产／原图摘要通过；安装器完整转换结果安装、缩略图来源、重复与非法 ID 拒绝通过。新构建 Editor 的原生菜单与地图切换通过，164 个装饰、327 个单位部件和 9 个水面实体同时推进；暂停像素一致，Stop 恢复主场景，重新 Play 返回标题，原有遭遇战可继续运行。

首轮原生收尾的 `console.get_logs` 参数上限错误保留在 `tmp/docs-artifacts/testing-batches/B001/map-session-1792743004654.json`，不将整份报告标为成功。修正后仅补日志检查 `map-session-1792743134396.json`；缩略图和选项可见性调整后的界面与加载检查为 `map-session-1792743303829.json`，两次均 0 error。安装证据在 `package-install-1792743377028/verification.json`，截图与原始报告仅存本地。


## 游戏内打开地图文件

进入“单人游戏 → 自定义游戏 → 打开地图文件”，在 Windows 文件选择框中选择任意目录的 `.w3m` 或 `.w3x`。后台转换完成后，在同一次 Play 中加载地图；转换期间仍能切换列表、取消导入或返回。取消后的迟到结果不会加载场景，Stop／退出会等待本次转换进程树结束。当前打开的地图加入本次运行的选图列表；重新启动游戏后，再次打开原文件即可复用缓存。

`project.json.contentImporters.warcraft-map` 配置转换程序、支持扩展名、文件框初始目录、魔兽资源目录和作业目录。样例使用给定的 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`；迁移机器时修改其中 `args` 的 `--game` 参数和 `initialDirectory`。完整场景生成器保留此配置。首次转换需要 Python（现有 NumPy／Pillow 依赖）、Node.js、.NET 10 及原版 MPQ；缺少本地模型转换器时先执行：

```powershell
python scripts/prepare-frost-map-import.py
```

准备工具使用 [W3ModelViewer](https://github.com/Darithos/W3ModelViewer) 固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e`，复用 `convert-warcraft-assets.py` 的下载、来源摘要和构建逻辑。运行时入口为 `scripts/runtime-import-frost-map.py`，通用引擎 API 是 `engine.importContent(importer, path?)`、`engine.cancelContentImport()` 和 `onContentImport(event)`；不传路径时显示文件选择框。转换程序从项目配置读取，不接受游戏脚本指定任意命令。回调只登记生成脚本工厂，实际地图实例在 `onSceneLoaded` 后创建。

地图包位于 `Assets/Maps/user-v2-<地图与转换环境摘要>/`，场景、运行脚本、路径格与缩略图保留在包内，公共资源引用 `Assets/WarcraftShared/v1/<内容SHA256>.<扩展名>`。运行时不修改 catalog、应用 Main.js 或项目构建列表。引擎只登记验证过的本次导入场景。原图、源成员、转换来源和安装摘要保留在 `Source/`、`Provenance/` 与 `manifest.json`；清单中的 `storage` 区分包内与共享资源，并记录源路径、源摘要和最终摘要。命中地图缓存时校验原件与所有依赖；损坏或缺失直接报告错误，不覆盖现有内容。地图包身份包含原图、按优先级排列的游戏档案摘要、转换工具与实际生成输入，输入变化会生成新版本。已预装地图和旧 v1 缓存保留兼容，新文件导入采用共享结构；不自动删除或改写旧资产。地图缓存与生成的共享资源均不提交 Git。

作业、失败日志和临时验证输出位于 `tmp/docs-artifacts/`。成功后清理本次独占创建的 `source-map/`、`doodad-project/`、`converted/` 和 `stage/`，保留 `result.json`、`converter.log`、`progress.json` 与文件选择记录；失败作业保留诊断内容。跨盘发布先复制到目标盘的 `.import-*` 临时目录，中途取消可能留下目录，停止导入后可按实际路径清理。持久资源缓存与成功地图包不随作业清理，转换不修改源游戏目录。

文件选择没有地图名称白名单。解析器仍对未支持的格式、对象覆盖、随机放置和模型特性明确报错；加密／保护地图或自定义脚本并非都能运行。JASS 只作为来源数据保留，当前仅执行转换器生成的场景脚本。完整对局、独立 Player 分发环境与非 Windows 文件框继续待验收。

2026-10-23 定向验证：真实生成脚本的打开按钮、长时间转换状态、取消／迟到回调、Esc、失败重试、动态加入地图、返回与缓存去重通过；Rust 内容导入 3 个用例及脚本桥接 1 个用例通过。新增夹具首次因 UI 80ms 刷新时机、PowerShell 扩展路径格式失败，修正夹具后复测通过。原生报告 `tmp/docs-artifacts/testing-batches/B001/arbitrary-map-1792745402307.json`：文件框启动／取消、工程外中文路径的 Echo Isles 冷转换、转换期间菜单操作、同次 Play 加载 7,221 实体、返回选图及第二次缓存加载全部通过，0 error。原生自动化通过同一引擎 API 提交文件路径，未自动操作文件框内的选择／确认控件；截图已检查。测试编辑器正常退出，WebView 锁缓存保留。


## 地图加载进度

选图界面右下方显示加载条与当前步骤。后台转换依次报告缓存检查、地图读取、地形、装饰物、单位、寻路、安装与校验八个步骤；装饰物、单位和文件校验显示真实的已处理／总数量。条形长度表示步骤完成情况与当前步骤内进度，不代表耗时比例或剩余时间。缓存命中直接进入资源校验。选择文件、取消和进入地图时使用等待指示；失败或取消结束后收起加载条，保留错误／取消文字。

引擎为转换器设置 `MENGINE_CONTENT_PROGRESS`，值为该作业的 `progress.json` 路径。转换器以临时文件加原子替换发布快照，数量更新最多每 200ms 一次，步骤变化和最终计数立即发布。引擎在工作线程每 200ms 读取，去重后以 `onContentImport({status:'progress',step,steps,message,completed?,total?})` 通知游戏；`step` 从零开始，`completed/total` 为当前步骤数量。无效或写入中的快照忽略；完成、失败与取消仍由原有终止回调决定。不支持进度的转换器继续显示等待状态。

预装地图与导入地图都先在选图界面显示“正在进入地图”，再发出场景切换请求。进入期间防止重复菜单操作，`onSceneLoaded` 后关闭状态；加载失败超时恢复重试。场景解析和首次资源绘制仍是同步过程，期间等待指示可能停留在最后一帧，尚无可报告的场景／GPU资源百分比。

此功能的源码、Prefab、主场景和生成脚本一起维护。进度转发需要重新构建 Editor／Player；原生界面与冷缓存／热缓存完整链路验收登记在 B001-01，旧 EXE 不作为新功能通过证据。

2026-10-23 已用新 Editor 完成冷转换与缓存加载的进度转发、菜单响应、进入前截图、切图及返回检查；修正状态文字和选中地图信息的刷新时机后，仅复验缓存路径。最终原生报告 `tmp/docs-artifacts/testing-batches/B001/arbitrary-map-1792757510780.json` 通过，7,221实体、0 error。完整冷流程与版本摘要见测试台账；独立Player和不同窗口尺寸仍待验收。

## 跨地图资源缓存

`warcraft_resource_cache.py` 为运行时导入提供持久缓存，默认目录 `G:/work/github/MEgine/tmp/warcraft-resource-cache/v1/`，可通过转换脚本的 `--cache-root` 指定。`files/` 记录档案／工具摘要，依据绝对路径、文件标识、大小与时间戳复用摘要；文件状态变化后重算。`members/` 以 MPQ reader 版本、源档案摘要和规范化成员路径索引 `blobs/`，包含不存在成员的查询结果；命中后直接读取已解包的原始字节。每次查找仍遵守地图 → Patch → Local → Expansion → Base，地图内覆盖资源不会被公共同名文件替换。缺失或损坏的 blob 作为错误处理，不能继续退到下层档案。

`derived/` 记录贴图 PNG、节点元数据、模型特效、标注网格和动画变化分析的结果。键包含转换工具／依赖版本、源字节摘要及实际参数；最终贴图替换和材质绑定仍依据当前地图的来源解析执行。地图包输入与纯资源转换输入分别记录，单纯的包模板变化无需让相同纯转换结果全部失效。缓存文件采用完整临时文件加原子发布，已有内容只校验、不覆盖。运行时结果里的 `resourceCache` 给出解包次数、命中次数和各转换步骤的构建／命中数，便于后续维护。

`frost-shared-map-assets.mjs` 递归解析转换产物依赖，先重写子资源引用，再按最终内容摘要发布资源。贴图变化会改变引用它的材质／模型／特效身份；相同文件名但内容不同的资源保持隔离。GLB 的 JSON 依赖会重写，二进制段和 `#pose` 片段保留；未知引用和依赖循环直接拒绝。新地图包只引用共享文件，不再复制一份公共资源。

2026-10-23 验证：Amazonia 与 Echo Isles 的新包共用 298 个资源文件，避免 56,854,680 字节（约 54.2 MiB）的跨地图重复存储；不包含旧包清理收益。Echo Isles 第二图导入命中 179 次源成员读取、101 次贴图转换、53 次节点元数据和 12 次特效转换，新资源仍按需生成。保留共享缓存、在原生 QA 中重新生成 Echo Isles 包时，225 次源成员读取全命中，贴图／节点／网格／特效处理均命中缓存，没有新的成员解包或派生构建。地图本身的地形、放置与脚本组合仍按图生成。

本次只执行共享缓存相关验证：资源缓存 Python 6 项、地图缓存 Python 5 项、Node 共享依赖测试、实际生成脚本切图检查通过；复用现有 Editor 二进制的 `arbitrary-map-1792746961699.json` 原生检查通过，7,221 实体、0 error，截图已检查。首轮 Amazonia 发现本机旧模型转换器缺少 FlyingSheep 的粒子模型字段，使用 `prepare-frost-map-import.py` 重建后通过；失败日志保留。证据统一位于 `tmp/docs-artifacts/testing-batches/B001/`，统计为 `shared-maps/sharing-summary.json`。共享包独立 Player 分发、跨盘发布及旧缓存迁移仍待批次处理。
