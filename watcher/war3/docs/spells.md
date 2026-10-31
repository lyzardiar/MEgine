# 英雄学习与主动技能

七种单位目标能力的学习、订单、施法阶段、魔法、冷却与实际效果已接入独立客户端；另有[十种范围与召唤能力](area-spells.md)接入点/无目标流程，另有[六种持续施法与Channel](channels.md)，加上[十种施法单位与自动施放能力](caster-spells.md)，当前共三十三种主动/持续原型，另有十四种光环/攻击被动。当前为集中实现增量，产品和专项消费者已编译；专项程序、真实窗口、三图和原版精度保持待阶段验证。

## 实际消费

| 能力原型 | 订单 | 实际效果 |
| --- | --- | --- |
| AHhb 圣光 | holybolt / 852092 | 治疗友方活体，半量伤害敌方亡灵 |
| AHtb 风暴之锤 | thunderbolt / 852095 | 飞行、伤害、限时眩晕 |
| AUdc 死亡缠绕 | deathcoil / 852222 | 飞行、治疗友方亡灵，半量伤害敌方活体 |
| AUfn 霜冻新星 | frostnova / 852226 | 目标附加伤害、周围伤害、移动及攻击减速 |
| AEer 纠缠根须 | entanglingroots / 852171 | 禁止移动、按秒持续伤害，保留攻击和施法能力 |
| AOcl 闪电链 | chainlightning / 852119 | 飞行、有限目标跳跃、逐次衰减、不重复命中 |
| AOhw 治疗波 | healingwave / 852501 | 友方治疗、有限目标跳跃、逐次衰减、不重复命中 |

能力原型从 AbilityData/code 选择，w3a 自定义克隆复用同一消费者。按等级读取 Cost/Cool/Rng/Area/Data/Duration/Buff，按 UnitWeapons/castpt 与 castbsw 驱动接近、前摇、效果和后摇。订单、魔法不足、冷却、目标分类、魔免、英雄持续时间参与实际判断。命中使用共有伤害/生命/死亡/经验入口，飞行状态保存在会话内，不生成派生资产。

治疗波派生能力的源订单为空时使用 `healingwave`，源订单非空时按其内容解析。原版 `AChv` 经目标订单对友军施法的治疗及魔法消耗已通过隔离检查；地图覆盖订单、跳跃边界、原版施法时序和实际画面仍待阶段验证。

英雄命令区使用原 CmdSelectSkill、能力图标/坐标/说明/热键、学习菜单与返回；技能点及等级门槛消费既有英雄状态。主动按钮连接同一施法入口，提供目标模式、Esc/右键取消、冷却提示与魔法信息。未有实际消费者的技能显示禁用，脚本直接施放未实现能力保持明确失败。

CHANNEL/CAST/EFFECT/FINISH/ENDCAST 连接真实单位及玩家单位事件，提供能力、单位、目标和坐标上下文。GetSpellAbility 返回具有单位/能力归属的实际句柄，移除能力/单位时释放，并接入 typed hashtable。中断先撤销旧施法，再调用 ENDCAST，后续通过票据、单位存活、所有权与订单修订检查回调重入。

眩晕中止移动/攻击/施法/采集工作；缠绕限制移动；霜冻进入移动速度与攻击速度计算。状态按实际剩余时间更新，暂停单位冻结状态时间，死亡清理状态。UnitRemoveAbility、UnitRemoveBuffs/Ex、UnitHasBuffsEx、UnitCountBuffsEx 消费实际状态；UnitResetCooldown 清理单位技能冷却，保留物品共享冷却。扩展查询/移除包含已有定时生命，当前状态均为非光环魔法效果。

## 原件依据

- 原版 1.27.0.52240 Game.dll SHA256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，只用于 REA/开发分析。
- REA 确认订单注册入口 `0x6f1c9820`；经 x86 PE 映射与调用目标筛选提取344条明确注册，src/order_ids.inc 同时供脚本 OrderId/OrderId2String 和目标订单使用。该表覆盖已识别注册，不宣称全部隐藏/动态订单已覆盖。
- scripts/generate-order-ids.py 固定原件摘要和调用目标，可重建注册表；运行产品不读取或加载 Game.dll。
- 公共 MPQ 的 AbilityData、能力 Profile、AbilityMetaData、UnitWeapons、MiscData/MiscGame，和地图 w3a 覆盖。
- 原 WorldEditStrings 的 UFN1 为范围伤害、UFN2 为特定目标伤害；新星主目标同时接收两项，周围单位接收范围项。
- 原始分析、静态检查和构建日志在 `tmp/docs-artifacts/war3/spells/`，不纳入版本。

## 尚未完成

[十种光环与四种攻击被动](auras-passives.md)已接入；全部技能/其他被动/光环/完整召唤和持续施法规则、完整免疫/驱散类别、魔法护盾/闪避/反弹、技能自动施放、完整物品技能和AI仍需后续实现。[PRE2、基础附件和技能源特效/弹道画面](effects.md)已接入；[RIBB与原闪电](ribbons-lightning.md)已接入消费者，PREM、子附件模型及施法音效继续实现，GPU和原版精度仍未验收。原版事件/前后摇/转身/命中精度、跳跃选择与间隔、状态叠加/刷新/归属变化及施法者移除后的弹道语义待集中对照修正。

## 阶段执行入口

在 watcher/war3 目录编译 `cmake --build --preset release --target war3 war3_spell_tests --parallel 8`。本次只执行必要编译；下面的行为检查保持排队：

```powershell
python tests/generate-spell-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
build/windows-x86/bin/Release/war3_spell_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/spells/fixture.w3m'
```

专项消费者覆盖学习/订单、七种主效果、事件上下文、前摇/扣蓝/冷却、限制/驱散及 CAST 中停止/删除。阶段继续加入自定义覆盖、多目标/英雄持续时间、BUFF叠加、暂停/切图/内存与真实键鼠输入，合并 BootyBay、Amazonia 和 DotA_v6.83d 的游戏回归。生成的地图和日志仅保存在 tmp/docs-artifacts/war3/spells。

常规技能进入实际释放、即时自身技能实际生效及开启征召警钟时，将能力类型与施法位置放入最多 256 项的本地呈现队列。GameView 消费时读取能力 Profile 的 `Effectsound`，按源声音标签的空间、音量及距离设置播放；音频资源或设备错误仅记录日志，不进入同步模拟。监听位置在音频系统建立前也被保存，切图销毁队列；无 GameView 消费时队列有界，满时丢弃新事件。技能关闭命令不播放开启音效。

本机原始 HumanAbilityFunc 的 `Amic` 使用 `TownHallCallToArms`，OrcAbilityFunc 的 `AOwk` 使用 `WindWalk`。普通施法、已支持的攻击增强技能发射及直接生效的物品和消耗品共用本地声音队列；召唤、守卫、施法杖、沉默及传送物品通过普通施法释放路径消费音效。当前一次性声音定位为释放时施法者地面位置，技能与模型事件可能同时产生声音；精确位置、释放阶段、重复来源、开关反向及联机听感均待原版对照，原版完整技能音频尚未验收。

GameView 跟踪实际进入持续施法阶段的可见单位，并按能力、效果别名、Buff 的顺序查找首个 `Effectsoundlooped`。声音遵循源标签的空间、音量和距离，在施法者移动时跟随；完成、打断、死亡、移除、不可见及切图时停止并释放。单机菜单或模拟暂停时停止，恢复后重新创建；静音采用现有音频增益。最多同时播放 128 个循环声，跟踪状态仅存在于 GameView，资源或设备错误被记录，不进入同步模拟；无 GameView 不创建音频。1.27 原始资料中 `Bmlc` 使用 `AerialShacklesLoop`、`XErf` 使用 `RainOfFireLoop`。效果别名与 Buff 的选择顺序、开场和结束时序、听感、循环位置、暂停恢复及迷雾规则仍待原版对照；持续但未使用施法通道的增益及地面残留音效尚未覆盖。

技能命令提示按等级分隔源文本时保留 `<对象ID,字段>` 内的逗号；已知引用从地图覆盖后的对象表读取数值，`%` 修饰将数值乘以 100，未识别字段保留原引用。原版暴风雪一、二级的 DataA/DataB 分别为 6／30 和 8／40；原安装资源抽样及实际解析函数最小检查已核对，探针位于 `tmp/docs-artifacts/war3/spawn-table-probe/`。完整引用类型、数值格式、地图覆盖及窗口视觉仍待集中对照。

地图派生的非 Channel 能力未提供命令时读取原型的源命令，非空命令继续由地图指定；Channel 按等级使用其基础命令字段。DotA 原图的 A1SW、A06V、A0G2、A01F、A02A 已在隔离会话学习并对合法目标施法，均进入冷却。A0G6 的无状态变体已进入施法流程，原英雄已能购买并施法，完整脚本效果、窗口与原版行为待验证。

目标表包含英雄／非英雄而未声明空中或地面时，技能按指定类别及敌友、自身等规则筛选。DotA 原图变体精灵复制友方或敌方英雄、生成幻象并回归幻象位置已在隔离会话观察；显式空地限制、其他目标组合、魔免、原版一致性与窗口仍待验证。
