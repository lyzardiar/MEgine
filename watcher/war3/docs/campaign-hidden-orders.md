# 隐藏单位的脚本移动命令

`IssuePointOrder`、`IssuePointOrderById` 和位置版本允许对 `ShowUnit(false)` 隐藏的单位设置移动路线；运输、消化、暂时移出世界及其他状态隐藏的单位仍拒绝移动。玩家命令维持现有隐藏检查。其他目标订单与特殊状态未因此放宽。

原 Human02Interlude 的 `Trig_Scene1_Actions` 先对隐藏的吉安娜下达前往 `gg_rct_JainaTo_Antonidas` 的移动订单，再经两次短等待显示单位；她进入区域后触发 Scene2，末尾请求 Human03。原版地图脚本及源码见本机 `tmp/docs-artifacts/war3/human02-interlude-1031/map.j`。修复前的固定版原图隔离探针在 25–300 秒吉安娜一直停留在 `(-2141.6,2517.4)`、没有订单，Scene2 不再启动，见 `probe.log`。

待集中验证：隐藏／显示的四种脚本点命令、敌方与共享控制、切换显示／多次下令／取消、事件与等待、在运／吞噬／消失／死亡、寻路障碍和不同玩家输入；完整间章、窗口、声音、自动转 Human03 与原版命令时序均需对照。Win32 Release 同版核心库与 `session_orders.cpp` 的隔离探针中，原间章吉安娜于 25.25 秒进入目标区域并启动 Scene2，75.1875 秒原脚本发出 `Maps\Campaign\Human03.w3m` 的切关请求；日志 `tmp/docs-artifacts/war3/human02-interlude-1031/same-core.log`。探针没有验证真实窗口、声音、Human03 实际载入或完整战役；原版存档及其他隐藏对象命令仍未完成。
