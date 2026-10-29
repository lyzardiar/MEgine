# 亡灵第二关淡入淡出计时器

亡灵第二关的结束剧情调用 `CinematicFadeBJ`。原版 `Blizzard.j` 的 `AbortCinematicFadeBJ` 会对仍保留在全局变量中的失效计时器再次调用 `DestroyTimer`；客户端对空、已销毁及类型不兼容的计时器句柄无操作，对有效计时器沿用原有销毁路径。

固定版 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 的 Rizin 0.8.1 只读指令显示 `DestroyTimer` 注册入口为 `0x6f1df790`：调用 `0x6f1d0dd0` 解析失败后直接返回。指令记录位于 `tmp/docs-artifacts/war3/undead-goal-1031/destroy-timer-native.txt`。

隔离 Win32 x86 探针在原图中直接击杀布赞及三名圣骑士、让阿尔萨斯拾取原图骨灰盒，并手动完成五项基地任务；原脚本越过此前的重复销毁异常，于 344.562 秒暂停显示胜利对话，下一关为 `Maps\Campaign\Undead02Interlude.w3m`，见 `tmp/docs-artifacts/war3/undead-goal-1031/undead02-timer-final.log`。探针还调用了有效、重复销毁、空和不兼容句柄。该过程跳过正常战斗和建造，未验证产品窗口、音画或实际通关。

待阶段验证：有效计时器销毁后的回调停止、重复和失效句柄、计时器对话框／事件引用、同帧销毁与回调重入，以及原图自然建造和结束剧情。
