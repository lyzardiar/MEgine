# 亡灵首关的空单位暂停

Undead01 普通难度移除部分食尸鬼，开场仍对按原位置查找得到的空单位执行 `PauseUnit`。该原生函数对空或已失效单位无操作；有效单位仍使用原有暂停状态与视野更新。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示注册入口 `0x6f1f1b20` 在单位解析失败时直接返回；指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-pause-rizin.txt`。

隔离 Win32 x86 探针使用普通难度加载原图，越过此前暂停空单位异常，约 90 秒恢复控制并推进至 400 秒；记录 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-after-pause.log`。该探针同时包含此前的编组与动画空句柄修复。

待阶段验证：空、已移除和有效单位的暂停／恢复，原版时间和动作行为，以及客户端首关完整开场和战斗；该探针未验证实际画面或操作。
