# 单位状态阈值事件

`TriggerRegisterUnitStateEvent` 为指定单位的生命、生命上限、魔法或魔法上限注册比较条件；条件从不满足变为满足时，触发单位状态事件并提供 `GetTriggerUnit`、`GetTriggerEventId` 和 `GetEventUnitState` 上下文。状态观察按单位索引，销毁的触发器或移除的单位在检查时清理，不需要扫描所有单位与事件的组合。

脚本 `SetUnitState`、`SetHeroStr` 的生命变化、`SetHeroInt` 的魔法变化、非致死生命变化、普通技能和即时自身技能扣魔、魔法盾吸收以及自然魔法恢复在安全的写入阶段检查；其他技能、物品、装备及内部消费者写入的状态在固定模拟步末补查。触发器可重入，施法、伤害和恢复路径在回调后重新检查相关单位及操作是否仍有效。致死生命变化先完成现有死亡处理后检查；死亡回调提前移除单位时不会继续派发。其他内部状态在同一模拟步中多次越过并返回阈值时仍可能漏报，原版动作调度、最大状态注册、死亡先后与所有消费者的即时通知仍待完善与对照。

固定版 `SetHeroStr` 的生命增减均经属性更新同步通知并比较阈值；只读探针及指令输出位于 `tmp/docs-artifacts/war3/hero-state/inspect-hero-state.py`、`inspect-hero-state.txt`。观察者匹配后到 JASS 动作的最终调度、动态回调重入和最大状态注册仍需原版运行验证。

阶段验证先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`；覆盖非致死阈值跨越与重置、触发动作内恢复、上限及魔法变化、条件持续满足、单位与触发器销毁，以及技能伤害、恢复和死亡回调重入。当前未执行专项或原版运行验证。
