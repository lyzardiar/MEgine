# 原版季节景物与金矿

战场和地图编辑器使用 Winter、Forest、Barrens 三套原版景物。每套包含六种树木、六种岩石；树木资源按位置稳定选型，岩石编辑器保留六个可选变体。冬季树木使用原版 LordaeronSnowTree，森林和荒地使用各自原版贴图。

金矿使用原版 Goldmine 几何、全部五个材质部件和原点。Stand 与 Stand Work 状态各显示四个部件，其余部件按源可见性隐藏。原生骨骼采样使用 30 Hz；工人进入有效采集距离并采矿时播放循环工作动作，满载返回、携带另一种资源和矿源耗尽时结束工作动作。模型最大宽度 5.4、高度 4.9，与资源点击半径 2.8 和采集距离 3 一致。

`scripts/import-frost-classic.py` 导入 114 个经典角色、建筑及景物绑定，共 4,952 个运行时文件。`classic-sources.json` 记录源包、原生 Stand 几何边界、队色映射与逐文件哈希。重导入保护已修改生成文件；来源库保持原字节。

验证入口：

```powershell
node scripts/build-frostbound.mjs
node scripts/test-frost-visuals.mjs
node scripts/qa-frostbound.mjs --classic-scenery-only --deterministic-input
```

原生 QA 检查三套景物、完整部件及贴图绑定、编辑器岩石放置预览、地图保存/载入/试玩、工人右键采矿、携带 10/15 金币时的金矿工作姿态、交库和游戏存档恢复。截图与报告为 `classic-scenery-*.png`、`classic-mine-cargo-*.png` 和 `native-classic-scenery-qa.json`。Agent 输入验收不代表物理鼠标或音频验收。

2026-10-06 验证通过：4,952 个运行时文件哈希、4,672 个姿态与材质采样、季节贴图可复现生成、25 文件原生包加载及三套景物原生 QA。倒树测试覆盖 60 Hz 客户端渲染、三地形四阵营伐木、存档延续和真实 TCP 重连。4,981 项入库资产与工具文件经 Git 检出过滤后哈希一致。

原版 cliff 模块、水动画、粒子和光带仍需引擎适配；完整游戏复刻尚未完成。
