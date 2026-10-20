# 蛛网原件与 REA 证据

Author: MiYu

此阶段保留地穴恶魔蛛网 `Aweb`、研究 `Ruwb`、两种效果及其二进制调用链，供游戏行为实现使用。运行时施放、自动施放、弹道、落地状态、存档和联网接入尚未完成；这些原件与静态检查不代表游戏内蛛网已可用。

## 原始数据

`scripts/import-frost-crypt-web.py` 按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 顺序读取原件。输出 `crypt-web.json`，并在 `crypt-web-sources.json` 保存每项源 MPQ、内部路径、字节数、SHA-256、生成器摘要和 REA 来源。

来源记录的 `archivePath` 保留 MPQ 请求路径；`path` 使用一致的本地目录大小写，模型纹理依赖引用同一名称。测试逐层核对实际目录名，暂存内容还需逐项与摘要比对，以便在区分大小写的检出环境中复现。

| 数据 | 原版值 |
|---|---|
| 研究 | 150 金、150 木、30 秒；需要坟场及亡者大厅 |
| 研究按钮 | 槽位 9，W |
| 技能按钮 | 槽位 8，W；`web`、`webon`、`weboff` |
| 单位默认自动技能 | `UnitAbilities.ucry.auto=Aweb` |
| 持续时间 | 普通单位 12 秒、英雄 7 秒 |
| 冷却、消耗、距离 | 12 秒、0 法力、400 原版距离单位 |
| 施法前摇、后摇 | `castpt=0`、`castbsw=0.51` |
| 导弹 | `Webmissile.mdl`，速度 1500，跟踪开启 |
| 数据 A/B/C | 0.6 / 200 / 128 |
| 魔法开关 | `Misc.WebIsMagic=0` |

原版编辑器字段名来自保留的 `UI/WorldEditStrings.txt`：A 为“空军单位坠落持续时间”，B 为“空中单位高度”，C 为“近战攻击范围”。目录以 100 原版单位对应 1 世界单位换算距离、速度和高度；原始行保留未换算值。

保留 `Bwea`、`Bweb`，三份原始 MDX（Webmissile、WebTarget、Web_AirTarget）及全部四份纹理依赖。八张命令/状态 PNG 直接从原 BLP 转换，并附固定 GUID 的纹理元数据。模型转换见下文。原资产版权说明位于 `Assets/Licenses/Classic-Crypt-Web.txt`。

## 二进制证据

分析目标为本机 Warcraft III `Game.dll`，SHA-256：

`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`

使用固定 REA 6.5.0，上游为 <https://github.com/morluto/rea>，固定提交为 `3b79af28e80785afce9f5998d8f03289402a1847`；维护方法见 [REA 接入说明](../../../third_party/rea/README-MENGINE.md)。

| 地址/调用链 | 静态观察 |
|---|---|
| `0x6f5c2fc0` → `0x6fa1ddec` | `CAbilityWeb` 构造及虚表写入 |
| 虚表 `+0x1d8` → `0x6f5cca10` | 从 `Misc` 读取 `WebIsMagic`，缺省值为 0 |
| `0x6f5ccc80` | 调用上述虚函数并返回其逻辑非 |
| `0x6f5c0570` / `0x6f5c05e0` | `CBuffWeb` / `CBuffWebAir` 共用基础构造 `0x6f59cac0`，各自写入虚表 |
| 导弹虚表 `0x6fa1dd04` → `0x6f5a9180` → `0x6f5aa080` | 命中处理传递保存在导弹上的参数；已有效果通过 `+0x358` 更新，新效果通过 `+0x35c` 初始化后挂入单位 |
| `0x6f5ca8d0` | 设置移动限制、处理两个武器槽位的距离修正，再计算高度变化参数 |
| `0x6f66a080` | 对单位计数器 `+0x200` 加一；首次进入时清除分类位 4、设置位 2，再调用高度更新 |
| `0x6f67f100` | 对同一计数器减一；最后退出时恢复原分类并更新高度 |
| `0x6f5dd040` / `0x6f5dcf60` | 移动组件 `+0x7c` 的成对计数增减与状态刷新 |
| `0x6f5d2950` / `0x6f5bbab0` | 武器距离修正及退出时的对应撤销；退出还调用恢复分类/高度函数 |

分类切换发生于高度更新之前，因此实现不能等模型落地后才改变武器目标分类。`WebIsMagic` 的读取和当前值已确认，实际原版魔免、驱散及其他状态交互仍需行为核验。

### 高度初始化与变化速度

单位 `+0x204` 是带上下限的浮点属性：`+0x208` 为期望高度，`+0x20c` 为下限，`+0x210` 为上限。构造函数 `0x6f6439c0` 将它们设为 0、负最大浮点数、正最大浮点数；虚函数 `0x6f412340` 把写入值钳制在上下限之间。`+0x210` 不表示当前可见高度。

初始化链路如下：

| 链路 | 映射 |
|---|---|
| `0x6f69328a` / `0x6f69329e` | `moveHeight` / `moveFloor` → 数据描述符 `+0xec` / `+0xf8` |
| `0x6f695ee0` / `0x6f695ec0` → `0x6f64fad6` | 读取描述符并保存至单位类型缓存 `+0x1f8` / `+0x1fc` |
| `0x6f65b350` / `0x6f65b2e0` → `0x6f65b009` | 类型缓存 → 创建参数 `+0x70` / `+0x74` |
| `0x6f66cd35` | 创建参数 `+0x74` → 高度下限；`+0x70` → 高度上限及期望值 |
| `0x6f67f7e0` | 被网住时选下限，释放后选期望值；通过单位 `+0x214` 的时间属性读取实际高度并过渡 |

`0x6f5ca9d0` 在上限大于 0 且大于 DataB 时，计算 `(上限 - DataB) / DataA`；否则速度为 0。`0x6f67f91a` 根据方向设置速度符号，非零速度创建高度过渡，零速度直接设置目标高度。速度保存在效果属性 `+0xe8` 的值字段 `+0xec`，`0x6f5bbb7a` 释放时把同一速度交给 `0x6f67f100`，恢复原期望高度。

按未修改的石像鬼数据推导：上限/期望高度 240、下限 90，DataA=0.6、DataB=200，速度为 `(240-200)/0.6 ≈ 66.667` 原版单位/秒，完整下降 150 单位约需 **2.25 秒**，完整上升同理。这是静态调用链和数据的推导，尚无原版运行时计时验证。分类在命中时立即改变，不能等下降结束再允许地面攻击。DataB 不作为最终落地高度。

`0x6f67af50`、`0x6f67af00`、`0x6f67b030` 还会调整高度属性或边界；自定义飞行高度和多个高度修改效果的组合不能仅按上述默认值判断。

## 原版模型转换

`scripts/import-frost-crypt-web-models.py` 将保留原件与 `asset-library/warcraft-iii/remaining-ready` 的 MDX/BLP 摘要逐项匹配，复用既有 GLB 转换和原始节点轨道注入工具，输出：

- `crypt-web-models.json`：`ClassicCryptWebMissile`、`ClassicCryptWebTarget`、`ClassicCryptWebAirTarget`。
- `Assets/CryptWeb/`：GLB、原始节点与材质动画、纹理、配套粒子 MFX 和许可证。
- `crypt-web-model-sources.json`：原件、转换输入、生成器、工具二进制及全部输出摘要。

三套模型均有一个原版粒子发射器；渲染时需同时加载模型的 `parts` 和 `effect`，使用相同动画索引。共保留 15 条序列，其中空中目标的普通、Medium、Large 三组各有 Birth/Stand/Death。几何与粒子均按原版单位 `/128` 转换，与游戏数据 `/100` 对接时使用 **1.28** 基准缩放，再应用目标原有的模型/挂点缩放。

目录保留空中目标 `chest,mount` 与地面目标 `origin` 的原始挂点定义。运行时需根据目标原版挂点动画属性选择尺寸序列；动画 Birth 的 0.5 秒与高度过渡时长分别处理。MFX 为现有转换器采样结果，不代表与原游戏粒子求解器逐帧一致。

## 复现与验证

在仓库根目录执行：

```powershell
$env:PYTHONUTF8='1'
python scripts/import-frost-crypt-web.py
python scripts/test-frost-crypt-web-source.py
node scripts/probe-frost-rea-web.mjs
python scripts/import-frost-crypt-web-models.py
python scripts/verify-frost-crypt-web-models.py
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-crypt-web-models.mjs
```

离线重建：

```powershell
python scripts/import-frost-crypt-web.py --game Z:/not-installed --source-sample samples/frostbound-realms --output tmp/docs-artifacts/frost-crypt-web/reproduction
```

原件导入验证覆盖 44 项输出及来源摘要、原始规则与中文字段、八张 RGBA 图标、三套完整模型依赖、45 个文件（含 receipt）逐字节离线重建、重复生成、已编辑输出保护和损坏原件拒绝。REA 探针对 15 组证据检查 DLL 身份、完整输出、成功退出、调用标记及调用前后文件摘要。

模型验证覆盖 47 项输出和 7 份原件、全部动画与粒子依赖、28 个原生姿态解析、48 个文件（含 receipt）的逐字节离线重建，以及输入/输出改动保护。模型离线重建需要签名的本地资源库和转换工具；`--library`、`--source-sample`、`--sampler`、`--metadata-reader`、`--pose-probe` 可覆盖路径。工具构建命令与版本见既有 `scripts/warcraft-assets/`、`scripts/warcraft-node-metadata/` 及来源 receipt。原始汇编、JSON 和报告仅写入 `tmp/docs-artifacts/frost-crypt-web/`。

本机工具重建使用固定 W3ModelViewer 源码目录，两个项目共享上游中间产物，按顺序构建：

```powershell
$wc3Core='G:/work/github/MEgine/tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/upstream/src/Wc3ModelViewer.Core'
dotnet build scripts/warcraft-assets/MdxExport.csproj "-p:Wc3Core=$wc3Core" -o tmp/docs-artifacts/frost-crypt-web/tools/sampler --nologo --verbosity quiet
dotnet build scripts/warcraft-node-metadata/NodeMetadata.csproj "-p:Wc3Core=$wc3Core" -o tmp/docs-artifacts/frost-crypt-web/tools/node-metadata --nologo --verbosity quiet
```

独立原生预览验证了 15 个序列样本的网面、粒子组件、材质状态和 1.28 缩放，控制台无错误；截图 `tmp/docs-artifacts/frost-crypt-web/web-models-native.png` 已人工检查。预览复用游戏的 `FrostVisual.parts`。它验证资源在本引擎中可加载和显示，不覆盖实战施放、目标挂点、存档或联网。

后续行为实现需要覆盖：研究队列及退款、手动与默认自动施放、独立导弹寿命、地面目标分类和武器切换、被捕获单位继续攻击、下降及恢复、原版物理/魔法条件、死亡与复活清理、严格存档、对手快照隐私、TCP 重连和原生可视验证。地面法术的存档校验必须允许“蛛网已到期而后施加的持续效果尚未到期”的合法状态。
