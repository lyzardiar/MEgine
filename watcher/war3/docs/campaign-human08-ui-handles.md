# Human08 胜利时的界面句柄

Human08 的最后一艘船死亡时，地图先销毁排行榜和计时窗口；后续死亡触发器仍会查询／更新排行榜，胜利过场再次销毁排行榜和计时窗口。`LeaderboardGetPlayerIndex` 对失效排行榜返回 -1，`LeaderboardSetItemValue` 对失效排行榜无操作；`DestroyLeaderboard` 和 `DestroyTimerDialog` 对已失效句柄无操作。有效对象仍沿用原有读取、更新及销毁路径。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示 `LeaderboardGetPlayerIndex` 入口 `0x6f1efe40` 在对象解析失败时返回 -1；`LeaderboardSetItemValue` `0x6f1f0040`、`DestroyLeaderboard` `0x6f1df6a0`、`DestroyTimerDialog` `0x6f1df7b0` 对解析失败直接返回。原始指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/human08-ui-destroy-rizin.txt`。

隔离 Win32 x86 探针对原图五艘目标船依次调用 `KillUnit`，计数从 5 降至 0；胜利过场执行到约 175 秒进入胜利对话，下一关变量为 `Maps\Campaign\Human09.w3m`。日志 `tmp/docs-artifacts/war3/human03-continuation-1031/human08-ending-after3.log`。探针绕过玩家攻击及寻路，不代表完整对局。

待阶段验证：有效和空／已销毁排行榜的读取、更新、重复销毁与玩家解绑，以及计时窗口重复销毁；在客户端实际摧毁五船、检查排行榜／计时窗口和过场并进入 Human09。
