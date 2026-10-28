# 局域网房间发现

主菜单接入原版 `LocalAreaNetworkButton` 和 `LocalMultiplayerJoin.fdf`；进入后按 Warcraft III 1.27 TFT 版本发送 W3GS 搜索，非阻塞接收房间响应，显示名称、主机、地图和空槽／总槽，支持选择、滚动、玩家名输入、F5 重试与返回。界面关闭释放 socket；原安装只读、运行不加载 Game.dll。选择房间可发起加入，创建／读取按钮仍不可用，尚不能开展局域网对局。

搜索使用 UDP 6112，消息头和 GAMEINFO 解析有长度及数量上限；仅显示地址和地图字符串，不依据远程内容访问本地文件。显示的占用估计由总槽减空槽得出，可能含关闭槽与电脑。搜索接收使用系统分配的本地端口，公开参考实现向搜索源地址及端口回复，原版 1.27 的回复方式仍待实机确认。多网卡、无响应、端口冲突、房间变更与过期行为待阶段验证。

协议参考与维护来源：

- [GHost++ gameprotocol.cpp](https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp)，提交 `d25ec63c67330308d93a4f9912c0072f0c034ebf`，Apache-2.0。
- [GoWarcraft3](https://github.com/nielsAD/gowarcraft3/tree/f13251b6caed199c3347214f4591e7ccaa96c7c7)，提交 `f13251b6caed199c3347214f4591e7ccaa96c7c7`，MPL-2.0。
- [wc3_protocol](https://github.com/magynhard/wc3_protocol/tree/4cde24346a8be25d12d8d711e76789a6012f9d32)，提交 `4cde24346a8be25d12d8d711e76789a6012f9d32`，MIT。

代码根据公开资料独立实现，未复制或引入上述项目作为运行依赖；这些资料未证明与本机 1.27 实机互通。来源和协议字段分析见本地 `tmp/docs-artifacts/war3/lan-protocol-research.md`。

Win32 Release 产品编译通过；本机 UDP 模拟主机验证搜索及房间响应，合成 GAMEINFO 和截断包边界检查通过，主菜单局域网按钮和原版 FDF 隐藏窗口构造绘制通过，未加载 Game.dll。证据在 `tmp/docs-artifacts/war3/lan-probe/`。这些检查未覆盖真实原版主机、跨机广播、完整菜单交互或加入游戏。

待实现：创建房间、槽位编辑与协商、地图下载和就绪、命令同步、网络时钟／状态校验与断线重连；仍需 1.27 抓包和双客户端完整对局证据。

## 加入房间和地图声明

选中有空槽的房间后，客户端以非阻塞 TCP 发送 REQJOIN，处理分片／合包、主机 PING、加入拒绝、玩家加入／离开、槽位更新与地图声明；原版 GameChatroom 与 PlayerSlot 显示服务器返回的槽位和玩家，取消关闭连接并返回搜索。连接、接收和排队有界；收到下载或开始消息时明确报告尚未实现。

主机 MAPCHECK 到达后，后台任务读取本机 Maps 范围内的现有地图，计算文件大小、整文件 CRC32、成员 XORRotate 与 SHA-1，并和主机的四个字段比较；远端路径不得逃出 Maps，原安装只读，不解包至本地。任务取消或退出界面不等待磁盘读取，整个进程限制一个在途校验；单次 StormLib 成员读取无法中途取消，进程退出会等待线程收尾。大小和时间检查不能抵抗同权限进程的并发替换。

这些是大厅与地图核对流程，尚未发送地图就绪消息、下载地图或启用开始；校验一致也不代表已可进行对局。W3GS 握手和地图算法根据上述固定来源独立实现，1.27 原版方向、默认数据和互通仍需对照。

Win32 Release 编译通过；本机临时 TCP 主机覆盖 REQJOIN、分片 SLOTINFOJOIN、合包 PLAYERINFO／PING／MAPCHECK、PONG 和退出，原版大厅及槽位 FDF 隐藏窗口绘制通过。BootyBay 文件大小和 CRC32 经 Python 独立核对，非法路径拒绝和后台结果检查通过；XORRotate／SHA-1 尚未与独立原版实现核对。证据 `tmp/docs-artifacts/war3/lan-join-probe/result.log`。真实主机、大厅完整交互、跨客户端同步未验收。

`W3GS_MAPSIZE` 的公开参考为 `0x42`、13 字节（常量 1、状态字节和地图大小）；部分主机要求短时间内收到就绪，否则会踢出。由于当前尚未实现对局同步，本客户端不发送就绪以免主机误启动；本机 1.27 报文仍待实测。

## 大厅聊天

加入房间后，原版 GameChatroom 的聊天输入与消息区域连接实际 W3GS `CHAT_TO_HOST`（0x28）／`CHAT_FROM_HOST`（0x0F）；使用主机分配的玩家 ID 和当前人类槽位，消息与发送缓冲有界，显示时处理控制字符和格式标记。断线或离开释放会话聊天状态。

Win32 Release 产品编译通过；本机模拟 TCP 主机检查 UTF-8 消息、发送者／接收者、254 字节边界、非法输入、接收过滤和畸形包；原版聊天 FDF 隐藏窗口绘制通过，未加载 Game.dll。证据 `tmp/docs-artifacts/war3/lan-join-probe/chat-result.log`。原版 1.27 主机互通、真实窗口输入和外观仍待验证；地图 ready、创建及对局同步尚未实现。
