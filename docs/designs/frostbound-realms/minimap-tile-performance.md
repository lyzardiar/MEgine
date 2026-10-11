# 小地图格子更新开销

Author: MiYu

客户端记录 256 个小地图格子最近的地形与迷雾编码、高度和地形主题。输入相同时跳过颜色计算和 Image 序列化。格子显隐持续检查，编辑器布局变化仍更新 RectTransform；任何颜色输入变化都会立即更新对应格子。缓存只保存数值，不持有地图对象。

## Release 对照

同一大场景和同一 Release EXE，基线已包含上一阶段确认组件跳过序列化的优化。第二组交换执行顺序。仅替换隔离 QA 工程脚本，测量后恢复原始文件并核对 SHA-256。

| 指标 | 第一组旧版 | 第一组新版 | 第二组旧版 | 第二组新版 |
| --- | ---: | ---: | ---: | ---: |
| 模拟推进（次/秒） | 36.29 | 38.16 | 36.61 | 38.36 |
| 不同世界版本绘制（次/秒） | 35.69 | 37.45 | 35.87 | 37.49 |
| 不同状态绘制间隔 P95（ms） | 49.70 | 47.80 | 50.40 | 49.50 |
| Scene 空画面次数 | 0 | 0 | 0 | 0 |

相对本轮基线，模拟推进提高约 4.8%～5.2%，不同世界版本绘制提高约 4.5%～4.9%。这是本机样本结果，尚未达到稳定 60 FPS，也不代表物理显示器呈现频率。

四次验收的 GPU 像素、选择、层级展开滚动、暂停时钟、精确单步和停止重启均通过，无 console error，拥有的 QA 编辑器均已退出。

## 回归与复现

生成 Main.js 与上一版本真实渲染对照了 21 个场景、每个场景 256 格的 Image、RectTransform 和 active，全部一致。覆盖未变格子、迷雾揭露与隐藏、高度、表面贴图、水面、荒芜、主题、玩家视角、编辑器和菜单切换、地图替换以及塔防路线；未变格子不再进入 Image 更新。迫击炮、地形与对象池回归通过。

测试：`node scripts/test-frost-minimap-client.mjs`，`node scripts/test-frost-human-mortar-client.mjs`，`node scripts/test-frost-terrain.mjs`，`node scripts/test-frost-effect-pool-client.mjs`。

生成脚本：`node scripts/build-frostbound.mjs`。本轮设置 `MENGINE_FROST_BUILD_OUTPUT` 输出至隔离目录，仅同步生成的 Main.js 并核对字节一致。

测量摘要、源码和 EXE 哈希、原始报告路径见 [验收记录](minimap-tile-performance.json)。下一阶段继续测量景物与单位更新；完整 Warcraft III 单机、联机和地图编辑器复刻仍未完成。
