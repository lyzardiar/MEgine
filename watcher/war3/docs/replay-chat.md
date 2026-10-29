# W3G 聊天记录

回放记录消费者按记录顺序解码聊天：`0x10` 启动消息只在首个时间片前接受，不显示；`0x20` 的频道 0、1、2 分别映射全体、盟友、观察者，频道 `3 + N` 根据回放槽位 N 寻址私聊。发送者和私聊目标必须能映射到会话玩家，私聊的文本受众限定为双方。聊天沿用会话的文本和聊天触发器派发。

格式依据：[gowarcraft3 W3G 记录实现（固定版本）](https://github.com/nielsAD/gowarcraft3/tree/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g) 与本机 `tmp/docs-artifacts/war3/replay-format/w3g_format.txt` 第 902 行。频道、显示和触发器行为仍须与 1.27 原版实测核对。

原版回放入口仍未开放：经典对象编号、对象创建与复用映射尚未恢复；离开和校验记录的语义也尚未接入。此项不代表原版回放可以完整播放。

Win32 Release 的 `war3` 与 `war3_session_tests` 已合并编译。待功能阶段运行 `war3_session_tests.exe <tmp/docs-artifacts/war3/jass/session-enums-native.json>`；使用包含全体、盟友及私聊的真实 W3G 验证时间片顺序、受众、文本编码、聊天触发器和启动消息，另核对无效／截断记录及真实原版回放的入口限制。当前尚未执行新增专项。
