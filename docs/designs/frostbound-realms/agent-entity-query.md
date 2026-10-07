# 单实体查询与原生验收流程

作者：MiYu。目标场景为 Frostbound Realms，28,895 个实体。

`entity.get` 从当前活动世界定位目标，只复制快照投影的八个字段；名称保持首匹配，返回数据与 store 隔离，错误码／文案保持一致。Edit 模式的动画和时间轴预览使用完整场景计算，保留按层级路径解析的结果。

针对性检查 33 项通过，新增检查覆盖复制数量、返回值隔离、重复名称、未找到实体、Play 活动世界及两类预览；MCP 协议／合约 29 项通过。TypeScript、Vite 与原生 Release 构建通过。原生桥接验收在 Edit 与暂停 Play 世界对比相同目标实体，返回值完全一致；控制台错误 0，专属 Editor 正常关闭，临时工程和测试存档清理完成。

| 测量范围 | 完整快照读取中位数 | 单实体读取中位数 | 返回数据 |
|---|---:|---:|---|
| 原生 Edit RPC | 5340.68 ms | 4380.54 ms | 13,104,117 → 879 字节 |
| 原生暂停 Play RPC | 759.65 ms | 34.50 ms | 13,326,514 → 7,472 字节 |

原生 Play 的两个读取路径相差约 22.02 倍。各模式交替测量，预热 1 次、采样 3 次；这比较的是完整快照与单实体接口，不能解释为旧版／新版 entity.get 二进制对照、游戏帧率或完整交付流程的提速。Edit 的剩余往返耗时明显更高，需继续定位视口、桥接与编辑器处理。

[原生记录](native-agent-entity-query-qa.json)包含逐次耗时、返回数据量、命令耗时与 Editor／store／产品哈希。[Node 记录](agent-entity-query-benchmark.json)在同一场景对比快照查找与单实体函数，分别预热 3 次、采样 9 次；仅测量 store 查询，不含桥接、原生渲染、启动或完整 QA。

验收脚本先验证夹具，再启动编辑器；逐阶段写入当前报告并输出训练步数。原生查询脚本记录各个命令耗时，先设置 Game 分辨率并聚焦 Game View，再启动暂停 Play、完成两个微步的首帧预热；读取对照期间暂停世界。playback.play 等待 Native runtime 初始化，使用 5 分钟的有界等待预算，保留请求取消与幂等请求 ID。

本次原生查询验收：打开／就绪 20.667 秒、Edit 对照 33.761 秒、Play 准备与对照 63.277 秒。panel.focus 占 39.666 秒，是下一步应分段测量的明确耗时；Play 的查询采样时间不包含该准备步骤。

固定构建与复现入口：

```powershell
node --test packages/editor/tests/agentEntitySnapshot.test.mjs packages/editor/tests/agentBridge.test.mjs packages/editor/tests/agentSceneSnapshotSemantics.test.mjs packages/editor/tests/animationPreview.test.mjs packages/editor/tests/timelineScenePreview.test.mjs
node --test packages/editor/tests/agentMcpProtocol.test.mjs packages/editor/tests/agentMcpContract.test.mjs
node scripts/benchmark-agent-entity-query.mjs
npm.cmd --prefix packages/editor run build
cargo build --manifest-path packages/editor/src-tauri/Cargo.toml --release --features tauri/custom-protocol --target-dir D:/MEngineNativeQA/construction-build
node scripts/qa-agent-entity-query.mjs
```

上述增量 Native 构建复用当前未变的 SDK。API／SDK 或安装包发布使用仓库 scripts/build-editor-exe.cmd 的完整构建入口。完整游戏复刻目标仍未完成；这些记录验证查询与流程改善，不覆盖战役、所有兵种、全部经典地图、完整编辑器、物理输入或跨机器 LAN。
