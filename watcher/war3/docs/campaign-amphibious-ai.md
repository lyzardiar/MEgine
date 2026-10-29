# 战役两栖 AI 路径

资料片 `NightElfX02.w3x` 启动的 `n02x01.ai` 调用无参数 native `SetAmphibious`；当前客户端尚未绑定此函数。修复船坞初始化后，隔离探针在模拟 60.1562 秒进入该调用并停止，见 `tmp/docs-artifacts/war3/tft-opening-1031/nightelfX02-stockfixed.log`。该探针未覆盖真实窗口或完整战役。

固定版 `Game.dll` 的 `0x6f894200` 对当前 AI 状态置位 `0x8000`；消费点 `0x6f8a9436` 在指定条件下将移动类型 `0x20` 传入 `0x6f8abd70`，后者配置 AI 的共享路径对象。入口与消费点指令保存在 `tmp/docs-artifacts/war3/tft-opening-1031/setamphibious-native.txt` 和 `setamphibious-consumer.txt`。

当前客户端的 AI 直接向各单位发送攻击移动，没有等价的队长共享寻路对象。需实现该对象的两栖移动类型及路径消费，再接入 `SetAmphibious`；应验证队长目标与成员状态、混合地面／水上部队、无法到达的目标、取消和销毁、不同玩家以及与原版的路线行为。不能用仅记录标志或空返回冒充完整行为。
