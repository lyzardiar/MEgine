# DotA 英雄经验目标

`AddHeroXP` 对空、已失效或非英雄单位直接返回；有效英雄仍按玩家经验倍率和暂停经验状态更新实际经验。

固定版 Warcraft III 1.27 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 证据 `ev_b833f23d0f7f4542efd91918508df47b94f97475e45d6210f7f8a6711fc5abd5` 显示注册入口指向 `0x6f1d9da0`，单位解析失败或相应经验状态解析失败时返回；原始指令见 `tmp/docs-artifacts/war3/dota-combat-flow/original-add-hero-xp.txt`。完整经验倍率、特效和等级事件的原版语义仍需核对。

DotA_v6.83d 隔离会话以 `-sd` 购买英雄 U006 并下达攻击移动；修复前在原脚本 `Scripts\war3map.j:12753` 的 `AddHeroXP` 中断。修复后推进至 360 秒并正常退出，观察到英雄到达地图中央、死亡和在基地复活，日志 `tmp/docs-artifacts/war3/dota-combat-flow/after-xp-movement.log`。该探针直接调用会话命令，不覆盖实际窗口、完整技能或多人。定向检查和待测项见[测试队列](testing-batches.md)。

英雄经验、等级和技能点接口对无效目标按原版返回：`GetHeroXP`、`GetHeroLevel`、`GetHeroSkillPoints` 返回零，`IsSuspendedXP` 返回真；经验／等级设置及暂停无操作，等级剥离和技能点修改返回假。REA/Rizin 证据 `ev_890b80d8ec6aa7060d194b9568955ffae6178e71eb0a9dbd802afa387e02c1c0`、`ev_99358b0dbed61d6bcf38edc83c971eeea508d04c4818b8e83bced7d50913ad6e`、`ev_8c7e35d7b9c2fb6370b2a3feb40ad96f3886029b580a8e4464e2dd2b2f516276` 记录入口检查和返回值；本地指令在 `tmp/docs-artifacts/war3/dota-brood-attack/hero-*-original.txt` 及 `hero-level-family-returns.txt`。
