# 骑乘阶段实测耗时

Author: MiYu

| 步骤 | 用时 | 结果 |
|---|---:|---|
| 最终完整游戏回归 | 178.469s | 176 组 PASS |
| 桥接协议与契约 | 0.518s | 29 项 PASS |
| 完整原生生命周期：project open and ready | 85.303s | PASS |
| 完整原生生命周期：I original Hippogryph Taming research | 428.933s | PASS |
| 完整原生生命周期：Hippogryph U approach and selected transformation | 83.909s | PASS |
| 最终快捷键专项：project open and ready | 81.826s | PASS |
| 最终快捷键专项：Final U routing, portraits and F5/dismount | 262.522s | PASS |
| 最终快捷键专项：Hippogryph U approach and selected transformation | 86.155s | PASS |

完整原生流程实跑 30 秒研究和冷却。最终快捷键专项采用已研究夹具与 0.1 秒剩余冷却，验证修正后的 U 路由、头像、选择和 F5；两份证据分别保留。阶段计时包含桥接、原生脚本推进及状态检查，不代表纯游戏计算耗时，也不包含全部分析/编辑/提交时间。

前两次启动的 panel.focus 请求超时，原生编辑器均正常退出。诊断确认面板已经激活；为本次 QA 设置单次 60 秒等待后完成。失败命令与耗时见 native-coupling-startup-failures.json。

| 完整原生流程的命令 | 次数 | 累计等待 |
|---|---:|---:|
| playback.step | 51 | 364.011s |
| playback.input | 46 | 80.729s |
| entity.get | 34 | 63.424s |
| panel.focus | 1 | 34.779s |
| project.open | 1 | 16.426s |
| panel.get_layout | 2 | 10.430s |
| view.screenshot | 3 | 10.423s |
| project.state | 2 | 9.923s |

下一步优化应优先评估原生输入与帧推进的批处理，减少重复桥接和整场景观察；同时分别测量脚本推进与快照开销。不能用缩短研究/冷却的夹具替代完整计时验收。现有测试先运行生成客户端预检，独立规则/客户端/网络使用同一个夹具，完整回归集中执行。

原版生命/身份/效果/冷却传递尚未取得运行测量，原生 MEngine 验收不证明原版等价。
