# Human07 的停止指令

Human07 原图的穆拉丁相遇剧情会让中立单位执行 `stop`。脚本的字符串和整数 ID 即时指令先分派 `stop`、`holdposition` 到基础单位行为，避免解析无关技能；两者仍使用已有取消动作和指令事件路径。

定向检查：隔离 Win32 x86 探针将 Arthas 移入原图相遇区域，原剧情越过此前的停止指令异常，约 160 秒恢复控制并推进到 400 秒，记录 `tmp/docs-artifacts/war3/human03-continuation-1031/human07-muradin-after.log`。旧核心快照中引发该问题的单位为 `nwna`、技能为 `Awrs`，见 `human07-stop-source.log`；该检查不覆盖真实移动输入或画面。对该单位分别发出字符串和整数 ID 的停止、原地驻守，四次均返回成功，记录 `human07-stop-orders.log`。

待阶段验证：当前施法／移动取消及触发器事件；校验其他即时技能命令仍正常分派，并在客户端完成穆拉丁相遇流程。
