# 亡灵第五关失效计时窗口

计时窗口的显示、标题、标题颜色、时间颜色、速度和剩余时间操作对空或已失效的计时窗口直接返回；显示状态查询对该句柄返回 false。有效窗口继续使用原有状态与显示流程。此处理也适用于地图脚本在窗口销毁后再次访问该句柄。

原版 1.27 `Game.dll` SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA/Rizin 的注册检查 `ev_9f504a349afb5df284acbd224a9fd2f668aa02760bb7078cff15bbf8eab272bc` 与 `ev_effd30068076985ad790a893984e5dbc305a163bf5b25ab4207cea22c1f37ac7` 将七个接口对应至 `0x6f1f8de0`、`0x6f1e8470`、`0x6f1f8ec0`、`0x6f1f8ef0`、`0x6f1f8e60`、`0x6f1f8e30` 和 `0x6f1f8e00`。入口在对象解析失败时不执行后续操作；`IsTimerDialogDisplayed` 返回零，见 `ev_156c0147a68cc0ff13af440ef1e7f2a08de0e4679b3cc73965ef7124a6cfcdfe` 和 `ev_fbfea723be04188b1c11e23358458fe6d3bc429e2f91f0b8b2eb265ad4dddfe0`。

亡灵第五关出口过场对尚未创建的计时窗口调用 `TimerDialogDisplay`。独立 x86 探针在原图开场结束后直接击杀四名守卫并将阿尔萨斯移至太阳井区域；修复前在该调用报错，修复后进入胜利对话，玩家结果为胜利且下一关为 `Maps\\Campaign\\Undead05Interlude.w3m`。探针覆盖空、有效及已销毁窗口的显示查询和各设置入口，结果通过；构建和日志位于 `tmp/docs-artifacts/war3/undead05-work/`。该路径跳过实际战斗及自然寻路，不能代表完整战役通过。

待集中验证：有效窗口的所有显示属性、重复创建／销毁、不同玩家可见性、真实产品窗口及跨关缓存；原版窗口布局和计时细节仍需对照。
