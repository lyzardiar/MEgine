# 已确认组件的序列化开销

Author: MiYu

对象池先比较已确认的原生组件值。没有待确认写入、且组件值相同时，直接返回；改变的值和待确认写入继续序列化、隔离调用方数据并提交命令。原生 f32、默认字段、异步创建及被丢弃命令的重试保持原有行为。

## Release 对照

同一大场景和同一 Release EXE，第二组交换运行顺序。只替换隔离 QA 工程的脚本，测量结束后已恢复其原始文件并核对 SHA-256。

| 指标 | 第一组旧版 | 第一组新版 | 第二组旧版 | 第二组新版 |
| --- | ---: | ---: | ---: | ---: |
| 模拟推进（次/秒） | 36.74 | 38.26 | 36.25 | 37.59 |
| 不同世界版本绘制（次/秒） | 36.09 | 37.16 | 35.38 | 36.71 |
| 不同状态绘制间隔 P95（ms） | 54.00 | 48.50 | 51.60 | 50.30 |
| Scene 空画面次数 | 0 | 0 | 0 | 0 |

模拟推进提高约 3.7%～4.1%，不同世界版本绘制提高约 2.9%～3.8%。这是本机样本结果，尚未达到稳定 60 FPS。绘制频率不代表物理显示器呈现频率。

四次验收的 GPU 像素、选择、层级展开滚动、暂停时钟、精确单步及停止重启均通过，无 console error，拥有的 QA 编辑器全部退出。

## 回归与复现

6 项对象池单元测试、16 项生成客户端检查通过；迫击炮、地形、英雄死亡、倒树动画和场景资源引用回归通过。单元测试覆盖确认后的组件无需序列化、f32 与原生默认字段、待确认重复抑制、丢弃命令重试、调用方数组变更隔离及确认后继续修改。

生成源码：`node scripts/build-frostbound.mjs`；本轮使用 `MENGINE_FROST_BUILD_OUTPUT` 输出到隔离目录，仅同步生成的 `Assets/Scripts/Main.js`，并核对生成文件字节一致。

测试：`node --test scripts/test-frost-effect-pool.mjs`，`node scripts/test-frost-effect-pool-client.mjs`，以及 `scripts/test-frost-human-mortar-client.mjs`、`scripts/test-frost-terrain.mjs`、`scripts/test-frost-hero-death-generated.mjs`、`scripts/test-frost-tree-felling-client.mjs`、`scripts/test-frost-effect-pool-scene.mjs`。

测量摘要、源码与 EXE 哈希、原始报告路径见 验收记录 (`component-serialization-performance.json`)。下一阶段继续测量单位更新、地形与小地图、景物及 HUD 更新；完整游戏复刻仍未完成。
