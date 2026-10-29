# 无效可破坏物的最大生命查询

`GetDestructableMaxLife` 对无效、空或已销毁的可破坏物句柄返回零，对有效句柄读取当前最大生命。固定版 `Game.dll` 的入口 `0x6f1e1fb0` 调用 `0x6f1cefd0` 解析对象，解析结果为零时直接返回零；相关指令记录于 `tmp/docs-artifacts/war3/tft-opening-1031/destructable-getters-native.txt`。

资料片战役 `nightelfX01.w3x` 的开场清理动作枚举可破坏物时使用 `GetDestructableMaxLife(GetLastCreatedDestructable())`，当前没有上次创建的句柄，原先导致异常。待集中验证有效／空／已销毁句柄及生命周期、原图开场的可破坏物状态和窗口表现。
