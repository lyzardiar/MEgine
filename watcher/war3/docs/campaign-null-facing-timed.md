# 战役定时转向空单位

`SetUnitFacingTimed` 对空或失效单位不执行转向，避免地图脚本在恢复不到单位时中止；有效单位仍按现有定时转向逻辑处理。

固定版 Warcraft III 1.27.0.52240 的 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。注册处 `0x6f1eba26` 指向入口 `0x6f1f7520`；短时长路径调用 `SetUnitFacing`，该函数在单位解析失败时返回；其余路径在 `0x6f1f7555` 检查解析结果，失败则跳至返回处 `0x6f1f7627`。反汇编记录于 `tmp/docs-artifacts/war3/orc-late-probe/facing-timed-asm.txt`。原版短时长阈值及转向曲线与当前实现的差异仍待对照。

独立静音探针直接加载 `OrcX03a.w3x`，未恢复前章 gamecache；修复前在 `Blizzard.j` 的 `SetUnitFacingTimed` 中因无效单位中止，修复后完成 main 并推进 60 秒，未加载 `Game.dll`。日志分别为 `tmp/docs-artifacts/war3/orc-late-probe/OrcX03a.log` 和 `OrcX03a-after.log`。这不代表跨关存档、画面或完整关卡已验收。
