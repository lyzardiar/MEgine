# 战役存档的脚本执行状态

JASS 运行时的操作数、调用帧、局部变量与当前 native 参数由运行时按线程和嵌套层级持有；诊断接口返回副本，可观察等待、回调和取消时的执行状态。命名函数和 code 启动使用可识别的结构化线程入口，诊断可读取入口、参数和状态；匿名任务及部分触发器闭包仍保留。游戏实际执行仍使用现有 Fiber 与 native 回调，运行时编号仅在进程内有效。

独立 JASS 运行时可将单个结构化线程在已登记的简单睡眠 native 中暂停时的剩余时间、调用帧、操作数和局部槽复制到另一运行时并继续执行。恢复前校验源码、调试编译选项、调用关系和槽类型；活动句柄或代码引用、嵌套 native、多个线程、线程上下文和共享调度域均拒绝。基础类型全局值允许在运行时已让出执行时单独采集；调用方须先恢复全局值再恢复线程。该快照是内存表示，不是文件格式；客户端会话依赖触发器上下文且目前被明确拒绝。Win32 Release 客户端编译通过，线程检查覆盖两次睡眠、嵌套调用、表达式栈、剩余时间小于一个调度周期、无效源码／调用帧、未登记 native、活动句柄和上下文／多线程拒绝。

完整恢复仍需解决 Fiber 中其他 native 调用栈、调度器等待关系、触发器回调与上下文、句柄引用及 codeOwner 指针，并将全局、世界和玩家状态、随机数、事件、计时器、活动命令及地图身份组成统一事务；还需接入保存／载入事件、用户界面及原版格式。兽族战役切区涉及多区域存档，单独保存英雄或 gamecache 无法代替完整世界保存。

原版 OrcX01 的 `war3map.j` 在区域切换流程中调用 `GetSaveBasicFilename`、`SaveGameExists`，并通过 Blizzard.j 包装调用 `CopySaveGame`、`RemoveSaveDirectory`、`SaveGame` 和 `LoadGame`。`SaveGameExists`、`CopySaveGame` 和 `RemoveSaveDirectory` 操作独立用户目录 `Saves` 下的实际文件，拒绝绝对路径、上级目录及重解析点；复制通过同目录临时文件发布，允许覆盖目标。目录清理先检查整个目录树，持有各目录句柄后逐项移除；清理遇到文件占用或其他错误可能只完成一部分。它们不验证存档内容或实现加载。当前缺少普通存档及其余 native 的实际会话恢复，因而该战役的连续切区尚未打通；不能用 gamecache 或空返回代替。静态源图脚本 SHA-256 为 `02f8d230e68dcda29fdfbe0d59aea6d842fb8340d9706ee006f32fbd2d661ae0`。

`RenameSaveDirectory` 和 Blizzard.j 包装接入独立用户目录的实际目录重命名：源必须是已有普通目录，目标不能存在，可创建目标父目录；固定源／目标父目录句柄、拒绝路径穿越与重解析点，并通过文件句柄提交重命名。此操作不解析或生成存档，也不实现世界恢复。固定版 `Game.dll` 的 native 注册入口为 `0x6f1f3010`，其内部目录覆盖规则未完成语义核对；当前不覆盖已有目标。Win32 Release 客户端和 `war3_save_exists_tests` 编译通过，隔离目录检查 1 通过、0 失败，覆盖嵌套内容、已有目标、目录自身子路径和越界路径；测试环境无法创建符号链接，链接场景跳过。跨进程竞争、接合点、异常中断、原版目录规则与完整保存加载仍待验证。

Win32 Release 客户端及 `war3_save_exists_tests` 编译通过；以原版 `OrcX01.w3x` 运行 `war3_save_exists_tests <data-root> <map> <scratch-root>`，1 通过、0 失败。检查通过 `CopySaveGameBJ` 实际复制和覆盖文件，通过 `RemoveSaveDirectoryBJ` 移除嵌套区域目录并保留旁侧备份；缺失源不改变目标，目录与越界路径被拒绝。当前环境未能创建测试目录链接，该分支未执行；原版扩展名、文件格式、并发、保存事件和跨区恢复仍待完成或对照。

OrcX01 首次切换到未访问区域时，原脚本通过 `SaveAndChangeLevelBJ` 先保存当前区域再切地图；重访已保存区域时通过 `SaveAndLoadGameBJ` 保存当前区域并载入目标。用户保存／载入事件还将最多五个区域快照在对应存档目录和 `Blizzard\Zones` 之间复制。该流程需要同一世界和脚本线程的实际恢复，必须完整实现存档和两种切换入口；原始地图脚本及分析保存在 `tmp/docs-artifacts/war3/orcx-saves-1031/`。

原图隔离会话推进至 150 秒后，将雷克萨直接移入 `gg_rct_Zone_Goblin_Tripwire`；地图原定时触发器进入跨区过程，并在 `Blizzard.j:7546` 调用未绑定的 `SaveGame` 时停止。运行记录和临时探针位于 `tmp/docs-artifacts/war3/tft-ne4-next/orcx01-zone.log` 与 `orcx01-zone.cpp`。该检查直接移动英雄，未覆盖自然寻路、窗口交互或后续区域恢复。

原图初始化会对尚未设置的复活石单位执行 `SetUnitAnimation(null, "stand")`。固定版 Game.dll 入口 `0x6f1f7230` 调用 `0x6f1f7280`，单位解析失败直接返回；客户端已按此忽略无效单位。隔离探针越过 main、创建 252 个单位并推进约 30 秒后，在另一单位命令的召唤技能参数解析处停止，见 `tmp/docs-artifacts/war3/orcx-saves-1031/animfixed.log`；零时长召唤处理补齐后，原图空闲推进至 400 秒、约 125 秒恢复玩家控制，见 `tmp/docs-artifacts/war3/orcx-saves-1031/zerolife.log`。没有验证区域切换、完整战役或原版存档兼容。
