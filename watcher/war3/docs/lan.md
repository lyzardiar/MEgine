# 局域网房间发现

主菜单接入原版 `LocalAreaNetworkButton` 和 `LocalMultiplayerJoin.fdf`；进入后按 Warcraft III 1.27 TFT 版本发送 W3GS 搜索，非阻塞接收房间响应，显示名称、主机、地图和空槽／总槽，支持选择、滚动、玩家名输入、F5 重试与返回。界面关闭释放 socket；原安装只读、运行不加载 Game.dll。加入／创建／读取按钮暂不可用，尚不能开展局域网对局。

搜索使用 UDP 6112，消息头和 GAMEINFO 解析有长度及数量上限；仅显示地址和地图字符串，不依据远程内容访问本地文件。显示的占用估计由总槽减空槽得出，可能含关闭槽与电脑。搜索接收使用系统分配的本地端口，公开参考实现向搜索源地址及端口回复，原版 1.27 的回复方式仍待实机确认。多网卡、无响应、端口冲突、房间变更与过期行为待阶段验证。

协议参考与维护来源：

- [GHost++ gameprotocol.cpp](https://github.com/dcramer/ghostplusplus/blob/d25ec63c67330308d93a4f9912c0072f0c034ebf/ghost/gameprotocol.cpp)，提交 `d25ec63c67330308d93a4f9912c0072f0c034ebf`，Apache-2.0。
- [GoWarcraft3](https://github.com/nielsAD/gowarcraft3/tree/f13251b6caed199c3347214f4591e7ccaa96c7c7)，提交 `f13251b6caed199c3347214f4591e7ccaa96c7c7`，MPL-2.0。
- [wc3_protocol](https://github.com/magynhard/wc3_protocol/tree/4cde24346a8be25d12d8d711e76789a6012f9d32)，提交 `4cde24346a8be25d12d8d711e76789a6012f9d32`，MIT。

代码根据公开资料独立实现，未复制或引入上述项目作为运行依赖；这些资料未证明与本机 1.27 实机互通。来源和协议字段分析见本地 `tmp/docs-artifacts/war3/lan-protocol-research.md`。

Win32 Release 产品编译通过；本机 UDP 模拟主机验证搜索及房间响应，合成 GAMEINFO 和截断包边界检查通过，主菜单局域网按钮和原版 FDF 隐藏窗口构造绘制通过，未加载 Game.dll。证据在 `tmp/docs-artifacts/war3/lan-probe/`。这些检查未覆盖真实原版主机、跨机广播、完整菜单交互或加入游戏。

待实现：原版加入／创建房间、槽位协商、地图校验／下载、命令同步、网络时钟／状态校验与断线处理；仍需 1.27 抓包和双客户端完整对局证据。
