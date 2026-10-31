# DotA 英雄经验目标

`AddHeroXP` 对空、已失效或非英雄单位直接返回；有效英雄按脚本指定值及暂停经验状态更新经验；击杀经验分配使用玩家倍率。

固定版 Warcraft III 1.27 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 证据 `ev_b833f23d0f7f4542efd91918508df47b94f97475e45d6210f7f8a6711fc5abd5` 显示注册入口指向 `0x6f1d9da0`，单位解析失败或相应经验状态解析失败时返回；原始指令见 `tmp/docs-artifacts/war3/dota-combat-flow/original-add-hero-xp.txt`。完整经验倍率、特效和等级事件的原版语义仍需核对。

DotA_v6.83d 隔离会话以 `-sd` 购买英雄 U006 并下达攻击移动；修复前在原脚本 `Scripts\war3map.j:12753` 的 `AddHeroXP` 中断。修复后推进至 360 秒并正常退出，观察到英雄到达地图中央、死亡和在基地复活，日志 `tmp/docs-artifacts/war3/dota-combat-flow/after-xp-movement.log`。该探针直接调用会话命令，不覆盖实际窗口、完整技能或多人。定向检查和待测项见[测试队列](testing-batches.md)。

英雄经验、等级和技能点接口对无效目标按原版返回：`GetHeroXP`、`GetHeroLevel`、`GetHeroSkillPoints` 返回零，`IsSuspendedXP` 返回真；经验／等级设置及暂停无操作，等级剥离和技能点修改返回假。REA/Rizin 证据 `ev_890b80d8ec6aa7060d194b9568955ffae6178e71eb0a9dbd802afa387e02c1c0`、`ev_99358b0dbed61d6bcf38edc83c971eeea508d04c4818b8e83bced7d50913ad6e`、`ev_8c7e35d7b9c2fb6370b2a3feb40ad96f3886029b580a8e4464e2dd2b2f516276` 记录入口检查和返回值；本地指令在 `tmp/docs-artifacts/war3/dota-brood-attack/hero-*-original.txt` 及 `hero-level-family-returns.txt`。

玩家经验倍率的查询与设置处理失效玩家句柄：`GetPlayerHandicapXP` 返回 1.0，`SetPlayerHandicapXP` 直接返回；有效玩家继续使用会话倍率。Warcraft III 1.27 `Game.dll` 的注册入口 `0x6f1e3d00`／`0x6f1f61e0` 在玩家解析失败时分别读取默认 1.0／直接返回，只读反汇编证据 `ev_e2d1dbb0db96181f96fff3a74af9b31e5afda838583edb6708bee091fa5b3d07`、`ev_3479c37fda961dae54aa69998ffa4fec7ce214dabfe87cb51b508554a7692948`，SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。Win32 Release 客户端及 clock 目标编译通过，clock 33/33；隔离检查空及错误类型句柄、倍率 1.25 时脚本指定 100 点仍增加 100 点，以及击杀经验随倍率变化。原版客户端动态行为、真实地图与联机行为仍待验证。

`SetPlayerHandicapXP` 对有限值限制在 0.01 至 100：原版入口使用 0.01 常量与运行时初始化为 100 的上限，失效玩家查询的默认值初始化为 1.0；只读证据 `ev_3479c37fda961dae54aa69998ffa4fec7ce214dabfe87cb51b508554a7692948`、`ev_2193850920fd982cadd65fc6af3db4cc1f41041e151110ed1714978bb00d7af6` 与 `ev_d4215bbe68a627fda1d41c3fe45499e545112ae62682ab763afe7bfc214b1722`。有限负值、零、边界与超限在隔离测试中核对，非有限值仍受实现限制。

`AddHeroXP` 入口向原版经验结算传入关闭玩家倍率的标志；结算在该标志开启时才读取玩家经验倍率。静态调用链证据 `ev_316bd6e6d03fe2e3fef12cacfc59eaa3f5db5375f1693697f9b195580abe3bb6`、`ev_54993f08a8055797e2861e67b99e8ef93b3a62cbd23bd8a6a9ab90ed6ca1aab0`、`ev_94ab06904c645b4247545da107ba92310e7946980cd17c946922b4354d1ae28f`。隔离会话检查倍率 1.25 的脚本加经验，以及倍率从 1 改为 2 后同类型目标的击杀经验加倍。实际原版运行、负数／溢出、经验分享和事件时序仍待验证。

击杀经验最终转整数使用正数四舍五入。固定版经验结算 `0x6f50ac2a` 调用 `0x6f054060`，该函数加 0.5 后取整，之后转为整数；只读指令证据 `ev_12e7e6cb4e501153c63979c1b6e32d7984472931733cf77c9ab7819f2abda39e`、`ev_c1e75d42c0914a3f72ae7398c0bbbb67edfbbfd16ecce08951f71928a6ccb1bf`、`ev_7b8117969fe6250810eb66a5360cde84112ba282faebdc6a68bf29c99dd0ad8c`。Win32 Release 客户端和 clock 目标编译通过，clock 33/33；真实伤害击杀隔离夹具验证倍率产生的半点经验向上取整。首次夹具因基础经验为偶数无法构造半点而失败，调整精确倍率后通过；日志 `tmp/docs-artifacts/war3/kill-xp-rounding/clock-final.log`。多英雄分配的中间计算精度、原版动态数值及事件时序仍待验证。

共享击杀经验使用现有原版 32 位实数层计算除以英雄数量、玩家倍率及加 0.5 后转整数。固定版分配入口在 `0x6f660681` 调用实数除法，再逐个英雄传递结果；经验结算在倍率标志开启时调用原版乘法，最终使用原版取整。只读指令证据 `ev_be92bab8a7d1f377c152def9c4b870f087e43e41e1305c826fc07a67f6c160ce`、`ev_19a10a74e74efe96824bf4136ec177f57c29dd05d7739ce7c93552716dea335a`、`ev_94ab06904c645b4247545da107ba92310e7946980cd17c946922b4354d1ae28f`；实数层的固定版对照见 [JASS](jass.md)。隔离夹具中 40 点基础经验由三名英雄分享，倍率 0.1875 时每人得到 2 点；Win32 Release 客户端与 clock 目标编译通过，clock 33/33。源经验表公式、野怪倍率中间过程、原版动态对局及大数饱和仍待验证。

野怪经验跨等级时按每一级的 `HeroFactorXP` 分段计算：达到升级阈值后，剩余基础经验按新等级系数继续结算；系数为零时停止。玩家编号 12 至 15 的中立单位使用该规则。原版静态代码在 `0x6f02b090` 将整数系数除以 100，在 `0x6f50ab70` 按等级逐段计算并在跨阈值后重新求剩余量；分配入口 `0x6f6606c1` 对编号 12 及以上设置该路径标志。只读证据 `ev_7055e9fc8eb8022a970c6fbe9ce04ff6bf5e33ae3e0a5b1bbe20d423dfdfa137`、`ev_12e7e6cb4e501153c63979c1b6e32d7984472931733cf77c9ab7819f2abda39e`、`ev_19a10a74e74efe96824bf4136ec177f57c29dd05d7739ce7c93552716dea335a`。

Win32 Release 客户端及 clock 目标编译通过，clock 33/33。隔离实际伤害击杀验证同级 0→32、跨级 190→219、连续跨级后在零系数处停于 1400，以及中立玩家 12–15；日志 `tmp/docs-artifacts/war3/creep-xp-levels/clock-saturation.log`。原版动态数值、经验奖励加成、极大值、自然地图与联机仍待验证。

`SetHeroXP` 仅在目标高于当前经验且未暂停时生效；`SetHeroLevel` 同样尊重经验暂停，满级经验不超过最高等级阈值。原版 `SetHeroXP` 入口 `0x6f1f58f0` 计算目标与现有经验的差值，差值非正时返回；`SetHeroLevel`、经验结算和暂停状态分别见只读证据 `ev_28b35ff190339a5439f66840d0b0f25bfce427a94aebf28641471f170e34903a`、`ev_38e623e6c99f92f8be239bcdc886a77020335fd439f444fefcb9522404557f37`、`ev_8c51f2075925b291d35c98907ecb77dfb93f58fa0f812934c4bf73879d61db7e`；经验阈值索引见 `ev_0d9682a827d1f677c3224bf2a16c19cff61c256ef6cfb89015d20c8d963779a6`。Win32 Release 客户端和 clock 目标编译通过，clock 33/33；隔离检查降低目标、暂停设置、满级 5400 经验及野怪跨级。真实地图、原版动态、等级事件与自定义上限待验证。
