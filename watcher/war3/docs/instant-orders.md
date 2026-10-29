# 即时目标订单

`IssueInstantPointOrder`、`IssueInstantPointOrderById`、`IssueInstantTargetOrder` 和 `IssueInstantTargetOrderById` 已接入 `dropitem`／852001 物品移动：即时目标必须为实际物品，点目标使用已有地面丢弃流程，单位目标使用已有转交流程，空目标使用发令单位当前坐标。物品所有权、可丢弃性、路径、命令及事件由既有物品移动消费者处理。无法识别的字符串订单及无效句柄返回失败；其他有效订单以及非单位的非空目标明确报未实现，避免丢弃即时目标后执行其他命令。

本机 1.27 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 确认 `UnitDropItemPoint` 在 `0x6f1fac55` 将物品、坐标和 `0xd0021` 传给 `IssueInstantPointOrderById`；`UnitDropItemTarget` 在 `0x6f1fad33` 将物品、目标和同一订单传给 `IssueInstantTargetOrderById`。证据 `ev_49daebb5d65ce2f8b524b8ef93f3d0c434d97475dfb0b3b28bbf7a47ee633903`、`ev_6b8c64b6df344da95e05b28baf57fba11cd7d78fe91a5a2f74b20cde2c1124ce`。原版即时订单保留第二个目标并参与技能检验和订单构造，见 `ev_7f28e37121d2561e1b9ac1ce8935b1bd7af8f95c1dce72d4287e354d33a350cb`、`ev_5f02667a497e6698b4119e66e6bb07096b67b090bb20005059838b303bd61094`、`ev_2cfb9244fa083b846fdb1d439761ef5736d69b5a15a58bed956bf7f36198ccbf`。

其他即时目标订单、非单位目标及原版目标失败后转为点目标的完整规则尚未实现。物品条件、即时／延迟效果、命令取消与事件顺序、空或失效目标、所有者与共享控制、地图脚本、联机和原版一致性待阶段验证；不能将该子路径视作四个 native 的完整兼容。
