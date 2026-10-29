# 战役存档的脚本执行状态

JASS 运行时的操作数、调用帧、局部变量与当前 native 参数由运行时按线程和嵌套层级持有；诊断接口返回副本，可观察等待、回调和取消时的执行状态。命名函数和 code 启动使用可识别的结构化线程入口，诊断可读取入口、参数和状态；匿名任务及部分触发器闭包仍保留。游戏实际执行仍使用现有 Fiber 与 native 回调，运行时编号仅在进程内有效。

此状态尚不能恢复：Fiber 和 native 调用栈、调度器等待关系、触发器回调、句柄引用及 codeOwner 指针都需要稳定的可恢复表示。完整存档还需保存世界和玩家状态、随机数、事件、计时器、活动命令及地图身份，接入保存／载入事件和用户界面，并实现原版格式兼容。兽族战役切区涉及多区域存档，单独保存英雄或 gamecache 无法代替完整世界保存。

原版 OrcX01 的 `war3map.j` 在区域切换流程中调用 `GetSaveBasicFilename`、`SaveGameExists`，并通过 Blizzard.j 包装调用 `CopySaveGame`、`RemoveSaveDirectory`、`SaveGame` 和 `LoadGame`。当前缺少普通存档及上述 native 的实际会话恢复，因而该战役的连续切区尚未打通；不能用 gamecache 或空返回代替。静态源图脚本 SHA-256 为 `02f8d230e68dcda29fdfbe0d59aea6d842fb8340d9706ee006f32fbd2d661ae0`，首次触发时刻和实际运行效果待验证。
