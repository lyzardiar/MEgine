# 亡灵首关的空单位动画

Undead01 同一个计时器会直接执行侍僧动画触发器；直接执行时没有枚举单位。`QueueUnitAnimation` 对空或已失效单位无操作，存在的单位仍沿用现有动画队列和长度限制。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示注册入口 `0x6f1f26f0` 调用 `0x6f1f7280`，后者解析单位失败后直接返回；指令见 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-animation-rizin.txt`。

隔离 Win32 x86 探针越过原来的动画队列空句柄异常，继续到开场较后位置；下一处 `PauseUnit` 空单位异常仍在跟进。记录 `tmp/docs-artifacts/war3/human03-continuation-1031/undead01-after-animation.log`。

待阶段验证：空、已移除和有效单位的动画队列、原版动画顺序与效果，以及客户端首关完整开场；本次未验证画面或实机操作。
