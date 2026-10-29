# 脚本过滤单位事件

`TriggerRegisterFilterUnitEvent` 为指定单位和单位事件注册过滤表达式，复用现有单位事件派发及触发器生命周期。事件发生时，过滤条件读取当前触发单位及过滤单位；条件通过后执行触发器，条件失败不会执行动作。

已增加死亡事件的允许／拒绝过滤、过滤上下文和无关单位用例；实际运行、事件重入、销毁和全部事件类型的原版行为待功能阶段验证。阶段验证使用 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`。
