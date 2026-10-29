# 脚本联盟查询

`IsPlayerAlly`、`IsPlayerEnemy` 读取指定玩家对目标玩家的被动联盟状态；`IsUnitAlly`、`IsUnitEnemy` 从传入玩家的视角查询目标单位所有者。单向联盟可独立设置，查询始终读取当前会话状态；同一玩家视为盟友。失效玩家在玩家查询中返回 false；单位查询中的敌对结果按盟友结果取反。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 的 `IsUnitAlly` 注册入口 `0x6f1e8520` 读取传入玩家的联盟掩码并测试单位所有者位；`IsUnitEnemy` 入口 `0x6f1e85c0` 将其结果取反。`IsPlayerAlly`／`IsPlayerEnemy` 入口分别为 `0x6f1e8040`／`0x6f1e8090`；REA 记录为 `ev_efca4a6d67782ef93d25854a347586311127ec9b5a348ee3b11a72fe82adf4cc`。这覆盖固定版查询方向和无效对象分支的静态证据；不同联盟类型、自己玩家掩码初始化及原版实际运行仍需阶段对照。

本机 WarChasers 地图脚本及 DotA 开局脚本均包含单位联盟查询。阶段验证应覆盖双向与单向联盟、同玩家、空／移除单位、调用时联盟切换和真实地图触发器，结合 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行。
