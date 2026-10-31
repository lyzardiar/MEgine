# 影子权杖

原版影子权杖 `wshs` 的 `Ashs` 连接单位目标物品施法、移动接近、施法事件、次数及消耗。能力读取目标类别、距离和 `Bshs` 状态；零时长状态保持到驱散或目标死亡，正时长按目标英雄类型使用源时长。目标移动时，施法方及共享视野玩家可通过目标获取视野；移除状态会使缓存的迷雾视野失效。施法者死亡及物品耗尽不清除已施加的状态。目标选择、魔免、法术抵挡和界面命中复用现有施法路径。

源字段来自本机 Warcraft III 1.27.0.52240 的 `Units/AbilityData.slk` 与 `Units/ItemData.slk`：`Ashs` 目标为 `air,ground,enemy,neutral`，施法距离 800，普通和英雄时长为 0，Buff 为 `Bshs`；`wshs` 有 2 次、用尽消耗。源字段摘录位于 `tmp/docs-artifacts/war3/equipment/source.json`。

Win32 Release 产品及控制测试目标编译通过；`war3_control_tests.exe <data-root> <fixture> shadow-sight` 1 通过、0 失败，无 Game.dll。检查友军目标拒绝、敌方施法及次数、目标移动后视野、驱散、最后一次消耗、施法者死亡及法术护盾拦截。原版对隐身／魔免／无敌、敌对或友军改变、多玩家重复施法、正时长覆盖、驱散与事件次序，以及实际窗口、音效和联机表现仍待阶段对照。
