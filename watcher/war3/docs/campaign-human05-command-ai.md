# Human05 的 AI 命令

Human05 的橙色 AI 在商队剧情后启动，但独立计时器可能在此之前调用 `CommandAI`。没有运行策略时忽略命令；已有策略使用 12 项后进先出命令栈，完整行为与人族第六章证据见 [AI 命令](ai.md)。

固定原版 1.27 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。Rizin 0.8.1 只读反汇编显示注册入口 `0x6f1db550` 调用 `0x6f893ff0`；后者检查目标 AI 句柄，无效或无法解析时直接返回，有效时调用 `0x6f89c990`。原始指令记录 `tmp/docs-artifacts/war3/human03-continuation-1031/command-ai-rizin.txt`。

定向检查：独立 Win32 x86 探针在 Human05 原图中、橙色 AI 未启动时执行原图攻击波触发器，未再抛异常，并推进至 120 秒；运行日志 `tmp/docs-artifacts/war3/human03-continuation-1031/human05-command-ai.log`。该探针同时包含物品与路径修复。

待阶段验证：完成原图正常商队与计时流程，覆盖 AI 启动前后命令、队列顺序、攻击波与胜负；静态反汇编不代表运行时行为或完整对局验收。
