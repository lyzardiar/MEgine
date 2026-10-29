# 资料片第六章失效单位显示

`ShowUnit` 对空或已移除单位无操作，有效单位继续按现有逻辑修改可见性和视野。资料片 `NightElfX06.w3x` 的胜利过场先移除泰兰德，随后对同一失效句柄调用 `ShowUnitHide`，此前引发会话异常。

固定版 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 的 `ShowUnit` 入口 `0x6f1f7e70` 在单位解析失败时跳到函数退出；指令见 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-show-asm.txt`。隔离探针中人工移动英雄与商队并直接击杀敌方袭击单位，原胜利脚本继续到该异常，见 `ne6-xp-fixed.log`；这不代表自然护送和战斗。

独立 Win32 x86 探针直接编译本次修改并链接已有核心快照，相同人工驱动场景越过该异常并在模拟 573.688 秒出现原图胜利对话，日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-show-fixed.log`。探针通过传送、无敌和直接击杀缩短过程，未覆盖真实操作或完整战斗。

待集中验证：空／移除／有效单位的显示与隐藏、路径与视野、过场顺序和原版窗口，以及完整商队任务。
