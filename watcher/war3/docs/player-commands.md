# 玩家地面命令入口

移动、攻击移动、巡逻、建筑集结、停止、保持、目标命令和施法采用统一玩家命令结构，保存发令玩家、有序单位句柄、命令类型、目标／订单／技能及坐标浮点原始位。执行时逐单位重新检查控制权限，并使用现有会话订单与事件；单机仍在输入当帧同步执行。原版资源直接从归档读取，运行不加载 Game.dll。

Win32 Release 产品增量编译通过；BootyBay 最小会话检查共享单位保持命令和无权限玩家拒绝通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。地面移动／攻击／巡逻／集结及真实窗口操作待阶段验证。

这是输入入口整理：物品、建造生产、聊天与联盟命令仍有直接调用；没有网络传输、tick 命令队列、锁步等待、地图摘要握手或跨客户端同步，尚不能运行局域网对局。原版命令顺序与同步精度留后续验证。

目标订单与无目标／单位目标／位置目标施法已连接既有实际行为和单机帧内输入；多单位施法保留原先的顺序和首个成功停止规则。Win32 Release 产品增量编译通过；BootyBay 会话定向检查目标订单、空目标拒绝和共享单位无目标施法通过，未加载 Game.dll。技能与命令目标、权限回收、实际输入、原版事件顺序仍待阶段验证。

局域网协议参考：[GHost++ gameprotocol.cpp](https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp)，提交 d25ec63c67330308d93a4f9912c0072f0c034ebf，Apache-2.0；[wc3_protocol](https://github.com/magynhard/wc3_protocol) 提供 1.27 局域网发现说明。均为第三方资料，尚未与本机 1.27 抓包对照，当前没有引入代码依赖。来源和字段摘要保存在 tmp/docs-artifacts/war3/lan-protocol-research.md。
