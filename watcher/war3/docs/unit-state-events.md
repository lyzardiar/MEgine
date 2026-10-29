# 单位状态阈值事件

`TriggerRegisterUnitStateEvent` 为指定单位的生命、生命上限、魔法或魔法上限注册比较条件；条件从不满足变为满足时，触发单位状态事件并提供 `GetTriggerUnit`、`GetTriggerEventId` 和 `GetEventUnitState` 上下文。状态观察按单位索引，销毁的触发器或移除的单位在检查时清理，不需要扫描所有单位与事件的组合。

脚本 `SetUnitState` 和非致死生命变化在写入时检查；直接由技能、恢复、装备及其他内部消费者写入的状态在固定模拟步末补查。致死生命变化先完成现有死亡处理后检查；死亡回调提前移除单位时不会继续派发。内部状态在同一模拟步中多次越过并返回阈值时可能漏报，原版阈值检测、死亡先后与所有消费者的即时通知仍待完善与对照。

阶段验证先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`；覆盖非致死阈值跨越与重置、触发动作内恢复、上限及魔法变化、条件持续满足、单位与触发器销毁，以及技能伤害、恢复和死亡回调重入。当前未执行专项或原版运行验证。
