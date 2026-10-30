# 技能接口的单位句柄

`GetUnitAbilityLevel`、`SetUnitAbilityLevel`、`IncUnitAbilityLevel`、`DecUnitAbilityLevel` 在单位句柄无效时返回零；`UnitAddAbility`、`UnitRemoveAbility` 和 `UnitMakeAbilityPermanent` 返回失败。有效单位继续进入现有技能、光环、装备和事件流程；这里的无效包括空、已移除或类型不匹配的句柄。

本机 Warcraft III 1.27 的 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。原生函数注册及句柄解析失败分支的只读反汇编记录位于 `tmp/docs-artifacts/war3/dota-hero-1031/ability-unit-natives-asm.txt`。Win32 Release 客户端及 `war3_passive_tests` 编译通过；`invalid-unit` 隔离检查 4/4，覆盖三类失效句柄和有效技能修改，未加载 Game.dll。

不同失效生命周期、回调中删除单位、能力 ID 边界及原版运行态行为待阶段对照；这不代表所有单位 native 的失效句柄语义均已完成。
