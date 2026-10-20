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

保留 `Bwea`、`Bweb`，三份原始 MDX（Webmissile、WebTarget、Web_AirTarget）及全部四份纹理依赖。八张命令/状态 PNG 直接从原 BLP 转换，并附固定 GUID 的纹理元数据。模型原件尚未转换为运行时 GLB。原资产版权说明位于 `Assets/Licenses/Classic-Crypt-Web.txt`。

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

`0x6f5ca9d0` 读取单位 `+0x210`，与传入高度参数比较，差值通过 `0x6f052af0` 除以时间参数，再交给 `0x6f66a080`。后者调用 `0x6f67f7e0`，根据计数器选择单位 `+0x20c` 或 `+0x208` 的目标高度。因此不能把 A 的 0.6 简化为每个目标的固定落地总时间，也不能把 B 的 200 直接当作最终地面高度。两个目标高度字段的初始化映射和完整运行时曲线尚待核实。

## 复现与验证

在仓库根目录执行：

```powershell
$env:PYTHONUTF8='1'
python scripts/import-frost-crypt-web.py
python scripts/test-frost-crypt-web-source.py
node scripts/probe-frost-rea-web.mjs
```

离线重建：

```powershell
python scripts/import-frost-crypt-web.py --game Z:/not-installed --source-sample samples/frostbound-realms --output tmp/docs-artifacts/frost-crypt-web/reproduction
```

导入验证覆盖 44 项输出及来源摘要、原始规则与中文字段、八张 RGBA 图标、三套完整模型依赖、45 个文件（含 receipt）逐字节离线重建、重复生成、已编辑输出保护和损坏原件拒绝。REA 探针对十组证据检查 DLL 身份、完整输出、成功退出、调用标记及调用前后文件摘要。原始汇编、JSON 和报告仅写入 `tmp/docs-artifacts/frost-crypt-web/`。

后续行为实现需要覆盖：研究队列及退款、手动与默认自动施放、独立导弹寿命、地面目标分类和武器切换、被捕获单位继续攻击、下降及恢复、原版物理/魔法条件、死亡与复活清理、严格存档、对手快照隐私、TCP 重连和原生可视验证。地面法术的存档校验必须允许“蛛网已到期而后施加的持续效果尚未到期”的合法状态。
