# 战役空单位状态操作

`SetUnitOwner`、`SetUnitState`、`UnitResetCooldown` 和 `UnitRemoveBuffs` 对空或失效单位无操作；`SetUnitOwner` 对空或失效玩家也无操作。有效句柄沿用原有易主、状态、冷却和效果处理。

固定版 Warcraft III 1.27.0.52240 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。注册及入口反汇编分别见 `tmp/docs-artifacts/war3/orc-late-probe/owner-native-asm.txt`、`state-native-asm.txt`、`cooldown-native-asm.txt` 和 `buffs-native-asm.txt`；四个入口在单位解析失败时返回，易主入口还检查玩家解析结果。

`OrcX02_02.w3x` 无前章 gamecache 的独立静音探针依次遇到上述四个无效单位调用；修复后完成 main 并推进 120 秒，未加载 Game.dll，日志见 `tmp/docs-artifacts/war3/orc-late-probe/OrcX02_02-state-after.log`。该探针不代表跨关存档、画面或完整关卡已验收。
