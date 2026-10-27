# 英雄学习与主动技能

七种单位目标能力的学习、订单、施法阶段、魔法、冷却与实际效果已接入独立客户端；另有[十种范围与召唤能力](area-spells.md)接入点/无目标流程，当前共十七种原型。当前为集中实现增量，产品和专项消费者已编译；专项程序、真实窗口、三图和原版精度保持待阶段验证。

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

英雄命令区使用原 CmdSelectSkill、能力图标/坐标/说明/热键、学习菜单与返回；技能点及等级门槛消费既有英雄状态。主动按钮连接同一施法入口，提供目标模式、Esc/右键取消、冷却提示与魔法信息。未有实际消费者的技能显示禁用，脚本直接施放未实现能力保持明确失败。

CHANNEL/CAST/EFFECT/FINISH/ENDCAST 连接真实单位及玩家单位事件，提供能力、单位、目标和坐标上下文。GetSpellAbility 返回具有单位/能力归属的实际句柄，移除能力/单位时释放，并接入 typed hashtable。中断先撤销旧施法，再调用 ENDCAST，后续通过票据、单位存活、所有权与订单修订检查回调重入。

眩晕中止移动/攻击/施法/采集工作；缠绕限制移动；霜冻进入移动速度与攻击速度计算。状态按实际剩余时间更新，暂停单位冻结状态时间，死亡清理状态。UnitRemoveAbility、UnitRemoveBuffs/Ex、UnitHasBuffsEx、UnitCountBuffsEx 消费实际状态；UnitResetCooldown 清理真实单位/物品冷却。扩展查询/移除包含已有定时生命，当前状态均为非光环魔法效果。

## 原件依据

- 原版 1.27.0.52240 Game.dll SHA256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，只用于 REA/开发分析。
- REA 确认订单注册入口 `0x6f1c9820`；经 x86 PE 映射与调用目标筛选提取344条明确注册，src/order_ids.inc 同时供脚本 OrderId/OrderId2String 和目标订单使用。该表覆盖已识别注册，不宣称全部隐藏/动态订单已覆盖。
- scripts/generate-order-ids.py 固定原件摘要和调用目标，可重建注册表；运行产品不读取或加载 Game.dll。
- 公共 MPQ 的 AbilityData、能力 Profile、AbilityMetaData、UnitWeapons、MiscData/MiscGame，和地图 w3a 覆盖。
- 原 WorldEditStrings 的 UFN1 为范围伤害、UFN2 为特定目标伤害；新星主目标同时接收两项，周围单位接收范围项。
- 原始分析、静态检查和构建日志在 `tmp/docs-artifacts/war3/spells/`，不纳入版本。

## 尚未完成

全部技能/被动/光环/完整召唤规则和持续施法、完整免疫/驱散类别、魔法护盾/闪避/反弹、技能自动施放、完整物品技能和AI仍需后续实现。[PRE2、基础附件和技能源特效/弹道画面](effects.md)已接入；[RIBB与原闪电](ribbons-lightning.md)已接入消费者，PREM、子附件模型及施法音效继续实现，GPU和原版精度仍未验收。原版事件/前后摇/转身/命中精度、跳跃选择与间隔、状态叠加/刷新/归属变化及施法者移除后的弹道语义待集中对照修正。

## 阶段执行入口

在 watcher/war3 目录编译 `cmake --build --preset release --target war3 war3_spell_tests --parallel 8`。本次只执行必要编译；下面的行为检查保持排队：

```powershell
python tests/generate-spell-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
build/windows-x86/bin/Release/war3_spell_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/spells/fixture.w3m'
```

专项消费者覆盖学习/订单、七种主效果、事件上下文、前摇/扣蓝/冷却、限制/驱散及 CAST 中停止/删除。阶段继续加入自定义覆盖、多目标/英雄持续时间、BUFF叠加、暂停/切图/内存与真实键鼠输入，合并 BootyBay、Amazonia 和 DotA_v6.83d 的游戏回归。生成的地图和日志仅保存在 tmp/docs-artifacts/war3/spells。
