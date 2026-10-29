# 资料片第六章空单位位置

`SetUnitPosition`、`SetUnitPositionLoc` 和 `SetUnitFacing` 对空或失效单位无操作，`SetUnitPositionLoc` 对空或失效位置无操作；有效单位和位置沿用现有位置、路径占地与朝向更新。

资料片 `NightElfX06.w3x` 将两名商队法师初始化为空，开场仍对空单位执行 `SetUnitPositionLocFacingBJ`，先前会在约 111 秒中止。固定版 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；`SetUnitPositionLoc` 入口 `0x6f1f7990` 在位置解析失败时返回，随后调用 `SetUnitPosition` 入口 `0x6f1f7930`，该入口在单位解析失败时返回；`SetUnitFacing` 入口 `0x6f1f74e0` 在单位解析失败时返回。指令记录于 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-position-asm.txt`，原图空变量与异常见 `ne6-caravan.log`。

独立 Win32 x86 探针直接编译本次修改并链接既有核心快照；原图越过此前异常，约 120 秒恢复玩家控制并推进至 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne6-position-fixed.log`。该检查未验证真实商队操作、实际窗口或完整关卡。

待集中验证：空／失效和有效单位、空／失效位置、正常移动与朝向、路径占地和脚本事件；真实第六章剧情、商队和原版窗口尚待验证。
