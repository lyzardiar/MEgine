# 月之女祭司步骤耗时报表

Author: MiYu

以下是已落盘的原生验收计时，不包含未记录的代码分析和独立任务消耗。不同验收范围不能直接用于计算加速比。

| 范围 | 步骤 | 用时（秒） |
|---|---|---:|
| 初次完整验收 | project open and ready | 66.463 |
| 初次完整验收 | native Priestess original body, source Scout and Owl portrait | 231.327 |
| 初次完整验收 | native Searing Arrows manual target and autocast button | 198.190 |
| 初次完整验收 | native Starfall source channel, all geometry and F5 continuation | 134.944 |
| 技能集成验收 | project open and ready | 74.165 |
| 技能集成验收 | final product source hero, Owl, aura/autocast HUD, Starfall and F5 | 397.695 |
| 最终地形验收 | project open and ready | 81.213 |
| 最终地形验收 | final terrain cold start, source Priestess/Owl HUD and F5 | 166.860 |

技能集成验收中累计耗时最多的命令：

| 命令 | 累计用时（秒） |
|---|---:|
| execute:playback.step | 215.001 |
| execute:playback.input | 102.162 |
| query:entity.get | 65.604 |
| execute:panel.focus | 21.903 |
| query:view.screenshot | 20.378 |

已实施：UI 名称只索引一次；地形装饰每帧最多八个候选；相同内容的联机地图快照复用进度；签名和 Git blob 批量校验。最终地形变化采用针对性原生验收，已通过的技能操作不重复执行。

后续优化重点是原生桥接的逐步执行和输入命令延迟；这些计时包含场景处理及通信等待，不能直接认定为纯 JavaScript 计算时间。
