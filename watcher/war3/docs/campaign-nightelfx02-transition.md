# 资料片第二章到第三章

`NightElfX02.w3x` 的胜利条件由墓穴守卫组死亡事件触发。隔离探针在开场控制恢复后，将玛维设为 5 级，并对守卫组的 8 个单位调用 `KillUnit`；原地图脚本进入胜利过场，显示对话框，选择继续后请求 `Maps\FrozenThrone\Campaign\NightElfX03.w3x`。日志为 `tmp/docs-artifacts/war3/tft-opening-1031/nightelfX02-chain.log`。

在同一隔离用户目录下手动启动第三章原归档后，原图开场脚本恢复了 5 级玛维，并在约 100 秒恢复玩家控制，见 `nightelfX03-chain.log`。第三章另一静音空闲探针推进至 400 秒，见 `nightelfX03-start.log`。

上述探针直接击杀了胜利目标，手动创建下一会话，没有覆盖实际玩家战斗、产品自动切关、装备与其他英雄状态、完整任务和真实窗口／音画。上述内容仍需按战役功能阶段集中验证。
