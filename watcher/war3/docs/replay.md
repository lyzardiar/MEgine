# Warcraft III 回放读取基础

`Replay::read` 从内存字节或文件读取经典 W3G 文件，检查版本 0／1 头、长度、CRC32 和各 zlib 压缩块的头／数据校验，保留游戏版本、地图路径、设置、玩家、槽位与随机种子；记录流保留离开、聊天、校验、时间片和开始／结束等事件。未知记录、损坏数据、超出预算或不支持的新版压缩块明确失败。每条时间片保留原始玩家动作字节，不因为某个动作尚无消费者而将它替换成空动作。

`ReplayCursor` 要求调用方依次取出事件，针对时间片调用 `consume`；连续片段在最终时间片合并，再交给现有 `LanSimulation` 按序校验、派发和推进模拟。调用方需要先依据回放槽位、随机种子、地图和原版对象 ID 初始化对应会话，并自行处理非时间片事件；源引用须在游标销毁前保持有效。当前没有对局记录、回放选择／载入界面、完整玩家离开／聊天/镜头播放、原版对象映射或原版行为一致性，不能从读取接口推断完整回放可播放。已有模拟器只支持部分动作，无法识别的动作会明确拒绝。第三方 `.nwg` 不是本接口支持的 W3G 容器。

格式依据：Niels A.D. 的 [gowarcraft3 `file/w3g`](https://github.com/nielsAD/gowarcraft3/tree/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g)，固定提交 `f13251b6caed199c3347214f4591e7ccaa96c7c7`，Mozilla Public License 2.0；回放格式说明 [w3g_format.txt](https://github.com/nielsAD/gowarcraft3/blob/f13251b6caed199c3347214f4591e7ccaa96c7c7/file/w3g/w3g_format.txt) 作者 blue、nagger，按原文保留来源和使用条件。仅独立实现格式，不将该项目作为运行时依赖。zlib 使用已固定版本 StormLib 内置代码，其来源和许可证沿用工程第三方清单。

已对公开来源的 `test_126.w3g` 独立检查文件头、七个压缩块的 CRC 和结构记录，确认其数据含 946 条时间片；该检查不涉及本 C++ 实现，也不能证明 1.27 或原版播放兼容。样本和分析输出位于 `tmp/docs-artifacts/war3/replay-format/`，不提交用户回放或原游戏资源。Win32 Release 产品增量编译通过；C++ 对照样本、损坏边界和实际回放均待后续验证。
