# 资料片第五章预载脚本

`Preloader` 对空字符串、空句柄或资源归档中不存在的脚本直接返回；存在的脚本仍按现有大小、嵌套与 JASS 规则执行。资源从挂载归档读取，不创建解包目录。

固定版 1.27 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`Preloader` 入口 `0x6f1f2190` 检查空字符串后调用 `0x6f048c10` 读取脚本；读取失败分支 `0x6f1f21f7` 释放前序资源并返回，不执行预载脚本。指令见 `tmp/docs-artifacts/war3/tft-ne4-next/preloader-asm.txt`。资料片 `NightElfX05.w3x` 调用 `Preloader("NightElfX05.pld")`，该成员在当前资源视图中不存在，此前使原图 main 中断。

独立 Win32 x86 探针以当前修改编译并链接既有核心库快照，原图越过此前 `Preloader` 异常，约 100 秒采样时恢复玩家控制，空闲推进至 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne5-preloader-fixed.log`。该检查未覆盖完整战斗、产品窗口或运行性能。

待阶段验证：原图第五章及实际资源预载效果、空值／空字符串／缺失和存在脚本、文件格式错误、预算及动态切图；原版无效脚本的完整行为仍待对照。
