# 景物呈现更新开销

Author: MiYu

客户端记录景物、资源与地图装饰最近一次成功提交的呈现输入。部件数、位置、旋转、比例及各部件的模型、材质、显隐、颜色相同时，跳过重复的节点准备和组件处理。位置、旋转和颜色保存独立副本，调用方原地修改数组仍触发更新。状态只在所有节点准备完成后记录；对象池每帧独立重试生成、父节点、显隐和组件命令。倒树旋转、下沉、矿山动画以及迷雾变化仍正常更新。

当前三个调用循环共使用最多 368 个槽位：景物 140、资源 100、地图装饰 128。缓存仅持有描述值和数组副本，不持有地图或资源对象。

## Release 对照

同一大场景、同一 Release EXE，基线包含已确认的组件序列化与小地图优化。第一组按旧版、新版执行，第二组交换顺序。仅替换隔离 QA 工程的脚本，结束后恢复原始字节并核对 SHA-256。

| 指标 | 第一组旧版 | 第一组新版 | 第二组旧版 | 第二组新版 |
| --- | ---: | ---: | ---: | ---: |
| 模拟推进（次/秒） | 36.67 | 39.75 | 37.44 | 39.61 |
| 不同世界版本绘制（次/秒） | 35.79 | 38.90 | 36.70 | 38.46 |
| 不同状态绘制间隔 P95（ms） | 52.00 | 44.80 | 49.70 | 48.60 |
| Scene 空画面次数 | 0 | 0 | 0 | 0 |

相对本轮基线，模拟推进提高约 5.8%～8.4%，不同世界版本绘制提高约 4.8%～8.7%。这是本机 12 秒稳定采样结果，尚未达到稳定 60 FPS，也不代表物理显示器呈现频率。

四次验收通过实际 WebView GPU 像素、模型选择、层级展开滚动、暂停时钟、精确单步及停止重启检查，无 console error，拥有的 QA 编辑器全部退出。连续移动 Scene 的主画布没有空画面，已查看移动阶段截图。Scene 持续显示的引擎与编辑器代码已同步到 master；本阶段修改属于游戏脚本。

## 回归与复现

生成 Main.js 与上一版本的原生节点对照 45 次，全部一致。覆盖丢弃生成、父节点、组件和隐藏命令后的恢复，新分组归属，隐藏再显示，部件增减，位置、颜色和旋转数组原地修改，动画模型姿态、材质与独立槽位。未变景物不再调用组件处理。倒树、小地图和对象池回归通过，独立只读审核无阻断问题。

测试：`node scripts/test-frost-environment-client.mjs`、`node scripts/test-frost-tree-felling-client.mjs`、`node scripts/test-frost-minimap-client.mjs`、`node scripts/test-frost-effect-pool-client.mjs`。

生成：设置 `MENGINE_FROST_BUILD_OUTPUT` 指向隔离输出目录，再运行 `node scripts/build-frostbound.mjs`；仅同步生成 Main.js，并核对字节一致。Release 测量使用 `D:/MEngineNativeQA/profile-game-completion.mjs`，启用 `MENGINE_PROFILE_GAME=1` 和 `MENGINE_PROFILE_REQUIRE_CONTINUITY=1`，每次使用独立调试端口。

测量摘要、源文件与 EXE 哈希、原始报告路径见 [验收记录](environment-state-performance.json)。后续继续优化单位更新和呈现开销；完整 Warcraft III 单机、联机及地图编辑器复刻仍未完成。
