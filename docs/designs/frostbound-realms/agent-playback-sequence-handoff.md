# 原生交互批次

Author: MiYu

`playback.sequence` 在暂停播放中按顺序设置输入并推进帧。每个阶段包含可选的 `input`、`steps` 和 `deltaTime`，默认推进一帧、时间为 1/60 秒。单次请求最多 120 个阶段、总计 600 帧。整批参数先由桥接校验，总帧数在输入前校验；每一帧仍等待原生运行时完成。场景刷新、版本观察及显式截图在请求完成后执行。

按下、保持和释放使用独立阶段，输入边沿与指针位移仍在对应帧消费。播放代次改变、退出暂停模式或运行时错误会中断序列，不继续操作新的播放会话；已执行帧不会回滚。调用方应在断言边界读取状态，遇到结果未知时先核对实际状态，不自动重发序列。

`scripts/frost-native-input.mjs` 提供按键与点击阶段，死亡骑士验收脚本已接入。`qa-agent-playback-sequence.mjs` 的默认模式检查原生输入逐帧记录；`--warcraft` 使用当前完整发布场景，对照串行与批次的暂停/恢复操作，并检查选中、保持位置、F5 保存和菜单读取。`--warcraft --integration-only` 从交互集成续跑，不重新采集已完成的成对计时。性能报告只统计成对交互，启动和状态查询单独记录；小场景与大场景不作速度比较。

静态 Agent 参数定义单独输出为 `agent-schemas`，序列执行代码按需加载，保留 500 kB JavaScript 分块上限。源码、构建和验收证据见 `agent-playback-sequence-validation.json`，原生逐帧和完整客户端报告分别为 `native-agent-sequence-qa.json` 与 `native-agent-sequence-warcraft-qa.json`。

MCP 同时公开现有的 Scene 隐藏及可选中设置，命令目录与 MCP 参数契约保持一致。

完整 Warcraft III 复刻仍在进行。巫妖的原版素材与字段已准备，四技能及存档、联机和完整客户端接入仍待完成。本阶段改进原生交互及验收基础，不代表原版游戏行为已经完整实现。
