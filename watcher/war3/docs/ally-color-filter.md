# 盟友颜色过滤

`SetAllyColorFilterState` 和 `GetAllyColorFilterState` 操作当前会话的本地显示状态。状态 0 保留玩家颜色，状态 1 按自身／盟友／敌人／中立显示小地图颜色，状态 2 同时替换场景单位的队伍颜色；Alt+A 在三个状态间切换。关系与玩家颜色每帧读取，易主、联盟和脚本单位颜色变化可直接反映在画面中。小地图选中高亮及替代图标沿用现有绘制行为，伪装单位先按中立玩家处理。该状态不修改玩家、单位或联网模拟数据。

颜色来自原始 `UI/MiscData.txt` 的 `FogOfWar/FogColorPlayer`、`FogColorAlly`、`FogColorEnemy`、`FogColorCreepAllied` 和 `TeamColorFilter/ColorIndexPlayer`、`ColorIndexAlly`、`ColorIndexEnemy`、`ColorIndexCreep`，支持地图 `war3mapMisc.txt` 覆盖。观战视角下，对双方互相结盟的玩家取最前面的对应玩家颜色；未找到关系时使用当前视角的普通关系规则。`Set` 保留任意整数供 `Get` 读取；除 1、2 以外的状态按状态 0 显示。

原版 1.27 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA 观察注册及入口 `0x6f1f3e80`／`0x6f1e1680` 将整数保存及读取设置 0x38，见 `ev_266aaf99f436ee0f950886ad119da13c68a49c8619a455fdfd7983f424d5286c`、`ev_291d7794acc483aea9887727ab7d92a6a28cd65cb67e0eb35a2cc9ffda6e2a9b`；`0x6f34d480` 对 0、1、2 分别设置小地图和场景颜色过滤，见 `ev_68e7ac6217507f246f69834f970a6101ef32e35fb2244d37de86bdbfbf41bee2`；`0x6f31f0d0` 显示自身、盟友、敌人、中立及观战者分支，源值来自 `TeamColorFilter`，见 `ev_7591aae6cb301d3ca08f620a67f140c716f2f8a4caa6376f7b8d0062aaecf757`、`ev_db7fa562c0817ad06428b39b7693d3e6a3ce6663a013e8a5e0b25e0222a468b0`、`ev_dae7e352b76e9d2c8298ee1e5d1b2aaaac2cab8648b699b1ad97dcdb68a36494`。小地图颜色来源及状态分支见 `ev_6d1f3c8b0c30c57230ae2aa09708cdd901ea3ea8fd520fced56e649aa2038c35`、`ev_e8720fcf57ac359bd98422f140290664bac9f688b3e9b5560db4d61e06bb5f18`；原 `GlobalStrings.fdf` 说明 Alt+A 与三种模式。

原版小地图按钮及其启用控制尚未接入。运行时窗口、按键与地图局部调用、观战／非对称联盟、伪装、单位颜色覆盖、原版颜色和多人本地状态均待集中验证。新增游戏流程消费者断言尚未执行，不能以静态证据替代运行验收。
