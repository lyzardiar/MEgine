# 重生神符

拾取原版 `rreb` 时，`AIrb` 读取物品的掉落单位类型；类型有效且附近存在可用落点时，创建拾取者所属的同类型单位。神符通过现有拾取、使用、次数和销毁路径消费。没有来源类型、类型无效或找不到可用落点时不创建单位；新单位使用普通单位生命周期，不设置限时生命。

原版 `Blizzard.j` 的 `UnitDropItem` 在创建掉落物后调用 `SetItemDropID(droppedItem, GetUnitTypeId(inUnit))`。本机 1.27 `Game.dll` 的 `SetItemDropID` 入口 `0x6f1f5bb0` 写入物品 `+0xcc`；`CAbilityRebirth` 的虚函数 `0x6f530eb0` 将目标识别为物品，读取同一字段并传入后续创建路径。Rizin 指令记录在 `tmp/docs-artifacts/war3/rebirth-rune/original-rizin.txt`。静态链未证明落点、归属、事件和全部失败行为；当前实现按源描述和既有单位创建路径处理，仍需原版对照。

Win32 Release 客户端及测试目标编译通过；隔离夹具 `war3_spell_tests <data-root> tmp/docs-artifacts/war3/mind-rot/fixture.w3m rebirth-rune` 1/1，覆盖来源缺失、无效类型、合法类型、拾取方归属和单次创建。测试直接设置来源类型，未覆盖原地图单位死亡生成神符、实际窗口或联机。
