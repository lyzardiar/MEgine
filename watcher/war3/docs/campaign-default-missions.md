# 战役章节默认解锁

章节列表读取原版 CampaignStrings 的 Mission 第四字段。字段按十进制解析为非零时，进入该战役的章节列表或从关卡返回章节列表时，将对应章节设为可用并保存到独立战役进度；已经可用的章节不重复写入。该默认开放会覆盖脚本先前写入的不可用状态；空、零或无法转换的字段不改变进度。战役整体开放条件仍独立检查。

本机 1.27 原资源的 `UI/CampaignStrings_exp.txt` 中，额外战役 `OrcX02.w3x` 的 Mission1 第四字段为 `1`。固定版 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 的 `ev_7bd246c1064b074adf3e72441ad542bb7fc36a0b0bdb3a7627496687078a613f` 和 `ev_c9023762840f64279f9ff0786ea48469fdad7bddb215d160abe9fdf6f5a5fe1e` 显示原版章节列表读取第四项并调用 `atoi`，非零且当前章节未开放时以当前战役和章节编号调用 `0x6f22b930` 并传入 true；`ev_ad8f55c2d4b6aa3938f75067c2dcd0d8f9b760d3c7a19214587149231a6ae604`、`ev_f958bedfd8923e94ba764577947b27a2254ade7a624cc123ea4db7932ca4914c` 确认脚本 `SetMissionAvailable` 调用同一状态更新函数。原版档案的磁盘保存时机尚未确认；独立客户端沿用现有 `CampaignProfile::setMission` 即时持久化。

Win32 x86 Release 隔离目标编译通过；尚未运行 UI 与档案专项。集中验证源第四字段为零／非零、脚本关闭后重新进入、已开放状态、切换战役、写入失败和跨进程刷新，并对照 1.27 显示与持久化。原版未开放章节的列表呈现和完整兽族额外战役仍需实现或验证。
