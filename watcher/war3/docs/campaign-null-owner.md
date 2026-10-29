# 无效单位的所属玩家查询

`GetOwningPlayer` 对无效、空或已销毁的单位句柄返回空玩家句柄，对有效单位继续返回实际所属玩家。固定版 `Game.dll` 的 native 入口 `0x6f1e3ba0` 调用 `0x6f1d1550` 解析单位，解析结果为零时直接返回零；入口关联与反汇编见 `tmp/docs-artifacts/war3/tft-opening-1031/` 的定位脚本及日志。

资料片 `nightelfX01.w3x` 的 `Trig_Satyr_Prison_Voiceover_Conditions` 在 `ConditionalTriggerExecute` 中读取 `GetEnteringUnit()`，此调用可能处于没有进入区域事件的上下文，之前空单位导致会话抛出句柄异常。需在阶段验证中对照原版事件上下文、空／已销毁句柄、所属玩家变化和真实战役流程。
