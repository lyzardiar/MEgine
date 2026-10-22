# 步兵、法师与工人昼夜视野

Author: MiYu。

六种人类步兵／法师与三族工人的共享视野使用原版 UnitBalance 数据，应用于迷雾、敌军显示、公开快照和不可见目标拒绝。

| 原版单位 | 白天／夜间（原游戏单位） | 当前网格半径 |
|---|---|---|
| hfoo、hrif、hkni、hmpr、hsor、hspt | 1400／800 | 7／4 |
| hpea、opeo、uaco | 800／600 | 4／3 |

源档案为 human-army.json、human-sanctum.json 和 worker-balance.json，各自的 sources 收据保留 MPQ 来源和 SHA-256。原件来自 War3Patch.mpq 的 Units/UnitBalance.slk，已保存在 SourceAssets/CombatRewards/Units/UnitBalance.slk，SHA-256 为 ab1a8cfbebcb2abe68535b170117730726249c5fafef15c13695400d4b0a3327。

人类档案的 sight/nightSight 已转换为世界单位，再除以每格 2 世界单位；工人读取源行 sight/nsight 后除以 200。视野按单位源身份计算，改变所有权后仍保留源值。死亡单位不提供视野；黄昏仅缩小当前可见区域，保留探索记录。旧工人存档未启用 workerBalance 时沿用既有规则。复活单位、召唤物和英雄优先走各自已有分支，小精灵继续使用暗夜科技和夜视规则。未新增存档字段，当前协议为 122。

## REA 与维护

REA 上游为 [morluto/rea](https://github.com/morluto/rea)，固定 v6.5.0、提交 3b79af28e80785afce9f5998d8f03289402a1847；[工具维护说明](../../../third_party/rea/README-MENGINE.md)保留来源、许可和更新流程。

本阶段重新执行共享视野探针，三个实际 REA/Rizin MCP 调用通过。Game.dll SHA-256 为 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。sight-loader 从 0x6f693622 读取 sight/nsight 到源行 +0x314/+0x320；getter 为 0x6f697ff0 和 0x6f696080；缓存写入 +0x18c/+0x190。详见[建筑视野的共享二进制链路](human-building-sight.md)。

这确认原版读取并缓存昼夜两个源值。当前仍使用 32×32 圆形迷雾网格；原版栅格算法、地形遮挡和原版运行时逐帧对照尚未完成。

## 验证入口

~~~powershell
node scripts/probe-frost-rea-human-sight.mjs
node scripts/build-frostbound.mjs
node scripts/test-frost-unit-sight.mjs
node scripts/test-frost-unit-sight-client.mjs
node scripts/test-frost-unit-sight-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='G:/work/github/MEgine/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-unit-sight.mjs
node scripts/test-frostbound.mjs
~~~

规则测试校验源文件摘要、九种单位的完整 1024 格昼夜遮罩、保存后的黄昏／黎明、临时夜晚、探索记录、不可见攻击拒绝、工人所有权和旧档规则。生成客户端和真实 TCP 验证敌军可见性、私有迷雾和三族工人缩小后的昼间视野。原始诊断与截图保存在 tmp/docs-artifacts/frost-unit-sight/；共享 REA 探针的默认输出目录为 tmp/docs-artifacts/frost-human-sight/。

规则、生成客户端、真实 TCP 各 3 组通过；原生 Editor 的存档黄昏、黎明和三族工人边界共 5 组通过，控制台错误 0。已查看居中镜头的昼夜截图，确认边界敌军模型在黄昏消失。源 Main.js 与原生测试副本 SHA-256 同为 847a3b0128a948b085d8e81b1eb09e36d19e9587d17c9ac6036293f5e2ce2f98。测试进程正常退出，WebView 缓存因 EPERM 保留。

最终完整主回归退出码 0，共 819 条 PASS 记录，包含 24,000 帧 AI 场景和真实 TCP 测试。日志为 tmp/docs-artifacts/frost-unit-sight/full-regression.log。
