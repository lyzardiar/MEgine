# 拾取与通行计算的帧耗

Author: MiYu

地形射线只在地面命令、绘制等需要世界坐标的操作中计算，同一轮输入复用计算结果。空闲帧、键盘操作和按屏幕位置选择单位无需扫描地形。地图编辑器的连续绘制和放置预览仍按当前鼠标位置求交。

通行搜索保留水域栅格，水域数组变化后重建；每个玩家的建筑障碍仍在当前 tick 独立计算。附近单位的分层判断复用移动者的地表高度。身体间隙、路径选择、碰撞、空地分层和联机协议沿用既有规则。

独立 Release Player 在 2560×1440 下预热 5 秒，再采样三个 5 秒窗口。窗口 FPS 的中位数：遭遇战 29.6→30.6，Dota 场景 17.2→24.3，塔防 28.2→31.3。前后使用同一原生二进制、场景及地表资产。此处测量 `onTick dt` 的帧循环间隔，未测量物理显示器呈现，短采样也不代表长期大规模对战帧耗已达标。

脚本探针定位 Dota 输入处理约 8.9 ms/帧的重复拾取开销；按需求交后该阶段约 0.15 ms/帧。探针只注入独立验证项目，未进入运行包。三个模式各 1200 tick，以及水道变化场景，与提交 `553c6ee109cab2bde7309bbf70159839d8f788f6` 的完整状态和双方公共状态进行精确比对。验证见 `frame-cost-replay.json` 与 `frame-cost-validation.json`。

复测入口为 `scripts/qa-frost-player.mjs skirmish|moba|td`。`MENGINE_QA_SOURCE_REV` 可选择对照提交，`MENGINE_QA_CAPTURE_PREFIX` 保留独立结果文件，`MENGINE_PLAYER_EXECUTABLE` 指向经过校验的 Release 运行时。`scripts/test-frostbound.mjs` 检查规则／TCP、空闲帧无拾取、实际地面命令有拾取，以及缓存水道改变后的绕行。原生点击、群体移动、保持位置、高度画刷与地图存读档由 `frame-input-native-terrain-qa.json`、`frame-input-native-avoidance-qa.json` 验证。

运行包为 `samples/frostbound-realms/Builds/windows-x64/Frostbound Realms.exe`。完整原版地形、植被、游戏内容及长期性能验收仍未完成。
