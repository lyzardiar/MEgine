# 战役单位自动索敌距离

独立 gamecache v8 记录单位的运行时自动索敌距离；`StoreUnit` 读取 `SetUnitAcquireRange` 设置后的 32 位实数，`RestoreUnit` 在新会话恢复该值，实际自动索敌、工人自动修理和 `GetUnitAcquireRange` 共用该字段。旧版本 v1–v7 无该字段，恢复时保留目标地图创建单位的默认索敌距离；实验单位同步支持 v4–v8。加载对字段的有限性及非负性做校验，异常输入拒绝恢复。

这只是单位缓存，不是完整存档或原版 w3v 互通。原版 `StoreUnit` 是否保留该值尚待对照，英雄跨关、已有建筑和自定义地图行为尚未验收。

待集中验证：运行时修改／零值／默认值、保存后源单位变化、跨会话自动索敌与修理、v1–v7 读取与重新保存、缺失／非有限／负值／截断拒绝、实验同步和回调重入，以及原版 StoreUnit 行为。新增 `war3_game_flow_tests.exe <data-root> tmp/docs-artifacts/war3/game-flow/fixture.w3m cache-damage` 断言未编译或运行。
