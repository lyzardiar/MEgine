# 写实火枪手

火枪手使用链甲、长裤、胡须、兜帽和披风，持木质枪托与金属枪管的燧发长枪。头像、训练按钮、地图放置和实际战斗共用 RealRifleman。当前形象为人类火枪步兵，尚未实现魔兽矮人的体型与完整装填动作。

枪械来自 OpenGameArt 的 DREAM_SEARCH_REPEAT，原始 Blender 文件采用 CC0；人物来自固定版本 `61a3b9507d974084e6badb88a0826bd89a6d5b8b` 的 0 A.D.，采用 CC-BY-SA-3.0。组合角色按 CC-BY-SA-3.0 分发，Player 内附 `Assets/Licenses/rifleman.txt`。`rifleman-sources.json` 记录来源与哈希。

原始枪械的程序化木材与金属材质分别烘焙为 base、normal、ARM 贴图，再与人物合并。102 根骨骼保留披风、待机和行走动画；射击使用原弩手动作的 65%–100% 区间，包含抬枪、射击和回落。射击点为该区间的 4/7，动作随模拟冷却恢复。该片段没有表现历史火枪的完整装药、压弹过程。

枪口位置由导入器从射击姿势计算，按角色朝向与缩放转换到战场。射击保留即时命中，增加短暂火光与上升烟雾；网络事件沿用双方可见性过滤。粒子复用现有 24 个特效槽。

## 复现

使用 Blender 4.5.9，打开外部 blend 时禁用自动脚本：

```powershell
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/prepare-frost-musket.py
blender --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest rifleman-sources.json
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs --rifleman-sheet
node scripts/render-frost-unit-icons.mjs
python scripts/test-frost-rifleman-import.py
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --rifleman-only
```

`MENGINE_QA_ROOT` 可指定测试副本目录；默认仍为仓库的 tmp。截图脚本等待项目与 Editor 均就绪再设置视口。

两次枪械烘焙和角色导入产生相同哈希；19 个输入文件与 5 个最终资产已核验。48 个原生采样姿势验证有限几何、UV、索引、蒙皮和双手握持位置。运行记录见 `rifleman-import-qa.json` 与 `native-rifleman-qa.json`。

规则与 TCP 回归通过；原生 Agent 检查覆盖移动、朝向、即时伤害、头像、训练图标、枪口火光转烟雾和存档恢复。533 文件的 Release 包通过哈希检查与 30 秒启动检查，无错误日志。物理鼠标、听音与跨机器局域网尚未验收。

- [角色姿势](rifleman-poses.png)
- [实际开火](rifleman-flash.png)、[枪口烟雾](rifleman-smoke.png)
- [阶段记录](rifleman-art-qa.json)

Free3D 的直接 HTTP 请求曾返回 403，本次浏览器工具两次建立页面超时，尚未从该站成功下载；本阶段实际使用上述已下载且有许可记录的资产。
