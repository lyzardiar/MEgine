# 人族建筑昼夜视野

人族源建筑使用保留在 `human-masonry.json` 的 `sourceBalance.sight/nsight` 计算视野。数据来自本机 Warcraft III 的 `Units/UnitBalance.slk`，原件位于 `SourceAssets/HumanMasonry/Units/UnitBalance.slk`；`human-masonry-sources.json` 保留来源、原件和输出摘要。REA 工具源站为 [morluto/rea](https://github.com/morluto/rea)，固定版本、源码提交、许可及更新步骤见[工具维护说明](../../../third_party/rea/README-MENGINE.md)。

| 建筑源 ID | 白天／夜间（原游戏单位） |
|---|---|
| htow、hkee、hcas、hbar、hbla、hlum、hars、harm、hhou、halt | 900／600 |
| hvlt（神秘藏宝室） | 1000／750 |
| hwtw（侦察塔） | 1600／1000 |
| hgtw（防御塔，含 tower 别名） | 1600／800 |

原游戏100单位对应1世界单位，现有迷雾每格为2世界单位，因此源值除以200得到栅格半径。共享 `visibility` 结果用于迷雾、敌人渲染、公开快照和攻击目标检查。黄昏收缩当前可见范围，已探索记录保留；天亮或临时夜晚结束时恢复白天范围。主城读取当前等级对应的源档案；侦察塔完成防御塔升级时立即刷新，应用新的夜间范围。无源建筑标记的旧档和其他阵营沿用各自已有规则，协议保持114。

## REA 复核

`node scripts/probe-frost-rea-human-sight.mjs` 连接项目内 REA MCP，固定 Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，校验每次调用前后摘要、退出状态和输出完整性。

- `sight-loader`：`0x6f693622` 起分别读取 `sight`、`nsight` 到源行 `+0x314`、`+0x320`，调用 `0x6f689500`。
- `sight-getters`：`0x6f697ff0`、`0x6f696080` 分别访问上述字段，经 `0x6f68fb30` 返回值。
- `sight-cache`：`0x6f64f368`、`0x6f64f37f` 调用两个 getter，分别写入缓存 `+0x18c`、`+0x190`。

这些证据确认原版读取和缓存两种视野值。当前实现仍使用引擎既有32×32圆形迷雾栅格；原版栅格算法、地形遮挡、施工期间视野和运行时逐帧对照尚未验证，不能据此声称整个迷雾系统已1:1复刻。

## 验证与维护

```powershell
node scripts/probe-frost-rea-human-sight.mjs
node scripts/test-frost-human-sight.mjs
node scripts/test-frost-human-sight-client.mjs
node scripts/test-frost-human-sight-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-human-sight.mjs
node scripts/test-frostbound.mjs
```

针对性规则4组通过：33份原件和规则输出摘要、13个源ID的14个建筑／等级用例、完整1024格昼夜遮罩、保存后的黄昏和黎明、临时夜晚到期、探索记忆、不可见目标拒绝、塔升级完成当帧刷新及旧档／阵营隔离。生成客户端2组、真实TCP2组、原生2组和REA3组通过。原生测试确认敌人模型在读档跨越黄昏时隐藏、黎明时重新显示，控制台错误0。

原生 Main.js SHA-256：`eb97916c0ca053c136b044881c02a645233f11be12d26a0d52964077d998fcaf`，与源文件及测试副本一致。测试进程正常退出；runtime缓存因EPERM保留。原始结果和临时构建在 `tmp/docs-artifacts/frost-human-sight/`。

更新源数据时沿用 `import-frost-human-masonry.py` 及其来源收据，并重跑上述验证。本阶段复用已保留规则，无需重新导入美术资源。

最终源码完整主回归退出码0，726条PASS记录，包含24,000帧AI场景；日志见 `tmp/docs-artifacts/frost-human-sight/regression.log`。
