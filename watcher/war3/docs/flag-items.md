# 旗帜物品

`flag`、`nflg`、`oflg`、`uflg` 和 `btst` 在物品创建时读取原 `ItemData/drop`，携带者死亡时通过既有死亡及物品掉落事件流程释放。地图物品覆盖经对象数据读取；脚本 `SetItemDropOnDeath` 可在创建后修改行为，其他库存能力的死亡掉落规则继续生效。

旗帜能力 `AIfm`、`AIfn`、`AIfo`、`AIfe` 和 `AIfl` 使用自身源 `Targetart` 与 `Targetattach`，由持有者附件模型显示。拾取、移交、丢弃、能力禁用和单位移除沿用装备刷新与特效生命周期；死亡时隐藏保留在尸体库存中的附件。

本机 Warcraft III 1.27.0.52240 的 `Units/ItemData.slk` 为上述五项设置 `drop=1`；`Units/UnitMetaData.slk` 将 `idrp` 映射到该字段，原 `UI/WorldEditStrings.txt` 将其标为“当携带者死亡时掉落”。模型与附件字段来自 `Units/ItemAbilityFunc.txt`，`AIfx` 战旗通过原型 `AIfl` 读取自身胸部附件。原表摘录位于 `tmp/docs-artifacts/war3/equipment/source.json`，字段核对记录位于 `tmp/docs-artifacts/war3/item-ability-scan/meta.txt`。

实际夺旗地图的胜负触发、不同单位模型附件、死亡与复活、幻象、多玩家及 GPU 画面仍需阶段验证。

Win32 Release 客户端与 passive 测试程序编译通过；`war3_passive_tests.exe <data-root> <fixture> flag-item` 1 通过、0 失败，无 Game.dll。检查五种旗帜的源附件与默认掉落、地图 `idrp` 覆盖、转移、死亡以及 `SetItemDropOnDeath` 修改；相邻 `orb-purge` 回归 1 通过、0 失败。
