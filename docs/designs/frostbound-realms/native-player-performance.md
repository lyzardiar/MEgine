# 独立 Player 帧循环测量

2026-10-02。Release Player 在隔离的源项目副本中运行立体森林、坡地、建筑和逐帧单位移动及 30 Hz 场景单位姿态，预热 5 秒后采集三个 5 秒窗口。窗口为 1280×720 逻辑像素，本机 200% DPI 下实际渲染尺寸是 2560×1440；相机缩放为 12。测试通过现有 `onTick(dt)` 与存储接口记录原始帧间隔，不修改引擎、游戏规则或素材。

| 模式 | 三个窗口 FPS | FPS 中位数 | 各窗口 p95 帧间隔 |
|---|---|---|---|
| 遭遇战 | 52.17 / 46.84 / 51.26 | 51.26 | 31.21 / 35.86 / 30.35 ms |
| MOBA | 43.73 / 37.50 / 44.10 | 43.73 | 45.11 / 63.18 / 44.00 ms |
| 塔防 | 56.82 / 54.15 / 52.59 | 54.15 | 28.87 / 31.60 / 33.26 ms |

三种模式均进入游戏、模拟持续推进，三个窗口内日志错误和材质管线拒绝均为 0。脚本使用隔离的存档标识，并在结束时关闭自己启动的 Player。每种模式的报告单独保存，包含运行程序、场景、原始脚本、测量脚本和地表材质来源的 SHA-256、实际视口、逐窗口统计和游戏状态。原始帧间隔及日志保存在报告所列的隔离目录。

这是短时启动场景的帧循环间隔，不是物理屏幕呈现测量，也不能代表大规模战斗或整局稳定帧率。运行环境未独占机器。5 ms 目标未达到；物理输入、声音听感与跨机器网络本次未验收；发布包另有 715 文件哈希校验及 30 秒启动检查。编辑器此前的 1280×720 数据和本页 Player 的 2560×1440 数据不可直接作同分辨率性能对比。

```powershell
$env:MENGINE_QA_ROOT='D:/MEngineNativeQA'
node scripts/qa-frost-player.mjs skirmish
node scripts/qa-frost-player.mjs moba
node scripts/qa-frost-player.mjs td
```

结果：[遭遇战](native-player-performance-skirmish.json)、[MOBA](native-player-performance-moba.json)、[塔防](native-player-performance-td.json)。
