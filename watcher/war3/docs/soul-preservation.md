# 灵魂保存

人族第六章的玛尔加尼斯可学习 `ANsl`。该单位目标技能读取原技能的目标类型、施法前摇、持续时间、Buff、命令、距离、消耗和冷却；当前接入施法订单、施法事件、目标校验、状态图标和单位生命周期。目标在状态持续期间不能行动，到期由单位移除路径移出会话，不派发击杀事件；状态在到期前被移除时取消后续移除。

本机 Warcraft III 1.27.0.52240 中的源技能目标类型为 `nzom`、施法前摇为 0.5 秒、普通／英雄状态时长为 3 秒、Buff 为 `BNsl`、命令为 `soulpreservation`。`Game.dll` 的能力目标分支 `0x6f4a2230` 比较能力保存的类型字段与目标字段，`0x6f4adcf0` 创建 `BNsl` 状态；取证脚本位于 `tmp/docs-artifacts/war3/ui-report-current/soul-targetbranch.py`、`soul-ability-create.py`。这部分为静态证据，不证明完整事件及帧时序。[社区能力研究](https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md) 对 1.28.5 的记录也描述了目标从游戏中移除；具体行为仍需与本机 1.27 实际运行对照。

Win32 Release 客户端及 `war3_control_tests` 编译通过；`soul-preservation` 隔离模式 1 通过、0 失败，检查目标类型、状态、施法者被移除后的持续与到期移除，不加载 Game.dll。

仍需核对原版施法／移除时序、目标分类与自定义单位、魔免和无敌、驱散／暂停／死亡／归属变更、多人与脚本事件、消失动画和音效，以及玛尔加尼斯 AI 的原版决策与人族第六章自然对局。

电脑持有该技能且可施法时，从射程内可见、非敌对且符合源目标规则的单位中选择最近目标，并通过既有施法流程执行；距离相同时按句柄稳定排序，已有状态的目标不重复选取。Win32 Release 客户端及 CampaignAI 测试程序编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> ai-soul-preservation` 1 通过、0 失败，覆盖友方目标、错误类型、敌方及已有状态，未加载 Game.dll。当前距离优先为客户端策略，原版是否优先接近目标、是否存在血量或威胁阈值、与转换和战斗命令的竞争及自然战役行为待对照。

原版 Human06 地图的静音隔离会话按地图脚本与当前 AI 自然推进，`human06-ai-soul-preservation` 在 333.5 秒观察到玛尔加尼斯为僵尸施加 BNsl，随后该单位从会话移除；`human06-ai-conversion` 在 356.5 秒观察到黑暗转换与计数增长，两项各 1 通过、0 失败。该检查没有人为移动或创建单位，未覆盖完整胜负、画面或原版 AI 决策一致性。
