# 玩家地面命令入口

移动、攻击移动、巡逻、建筑集结、停止、保持、目标命令、施法、建造与生产采用统一玩家命令结构，保存发令玩家、有序单位句柄、命令类型、目标／订单／技能及坐标浮点原始位。执行时逐单位重新检查控制权限，并使用现有会话订单与事件；单机仍在输入当帧同步执行。原版资源直接从归档读取，运行不加载 Game.dll。

Win32 Release 产品增量编译通过；BootyBay 最小会话检查共享单位保持命令和无权限玩家拒绝通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。地面移动／攻击／巡逻／集结及真实窗口操作待阶段验证。

这是输入入口整理：商店、聊天与联盟命令仍有直接调用；没有网络传输、tick 命令队列、锁步等待、地图摘要握手或跨客户端同步，尚不能运行局域网对局。原版命令顺序与同步精度留后续验证。

目标订单与无目标／单位目标／位置目标施法已连接既有实际行为和单机帧内输入；多单位施法保留原先的顺序和首个成功停止规则。Win32 Release 产品增量编译通过；BootyBay 会话定向检查目标订单、空目标拒绝和共享单位无目标施法通过，未加载 Game.dll。技能与命令目标、权限回收、实际输入、原版事件顺序仍待阶段验证。

局域网协议参考：[GHost++ gameprotocol.cpp](https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp)，提交 d25ec63c67330308d93a4f9912c0072f0c034ebf，Apache-2.0；[wc3_protocol](https://github.com/magynhard/wc3_protocol) 提供 1.27 局域网发现说明。均为第三方资料，尚未与本机 1.27 抓包对照，当前没有引入代码依赖。来源和字段摘要保存在 tmp/docs-artifacts/war3/lan-protocol-research.md。

建造落点、训练／研究／升级、复活、取消、归还资源及英雄技能学习已连接统一即时入口；权限及目标在消费时重新核验，费用仍由单位所属玩家支付。Win32 Release 产品编译通过；BootyBay 最小检查共享单位训练从所属玩家扣款和取消生产通过，未加载 Game.dll，见 tmp/docs-artifacts/war3/transfer-probe/。真实画面、所有队列／退款／事件顺序和原版差异保持阶段待验证。

库存物品无目标／单位／点目标使用、丢弃及运输载具卸载已连接同一即时入口，执行时核验高级库存权限、物品持有人及乘员关系；右键拾取沿用目标订单。普通共享能否拾取与高级库存权限的原版差异仍待对照，JASS 直接物品接口保持原有路径。

Win32 Release 产品增量编译通过；BootyBay 最小会话检查高级共享丢弃物品、普通共享拒绝库存操作通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。
