# 工人武器与攻击动作

新建遭遇战的农民、苦工和侍僧使用原版第一武器数据，客户端、权威服务器和生成包共用定义。协议 98，`workerCombatVersion=1`；旧存档缺少该字段时保持版本 0，不改变旧攻击规则。此版本要求原版工人基础平衡启用。

| 单位 | 伤害骰子 | 伤害范围 | 射程 | 攻击间隔 | 前摇 / 后摇 | 碰撞半径 | 索敌范围 |
|---|---|---|---|---|---|---|---|
| 农民 hpea | 4 + 1d2 | 5–6 | 90 | 2 秒 | .433 / .567 秒 | 16 | 500 |
| 苦工 opeo | 6 + 1d2 | 7–8 | 90 | 3 秒 | .5 / .5 秒 | 16 | 500 |
| 侍僧 uaco | 8 + 1d2 | 9–10 | 90 | 2.5 秒 | .4 / .5 秒 | 16 | 500 |

距离表为原版单位，100 原版单位对应 1 世界单位。普通伤害对中甲 150%、城甲 70%；不叠加通用阵营伤害倍率或通用军队研究伤害。HUD 和提示显示骰子范围。

攻击复用既有前摇、命中与随机数路径；命中时才消耗骰子。前摇停止追击，成功改令和 Stop 清除未完成命中与攻击动作，Shift 追加在当前 attackMove 后保留当前攻击。控制状态、死亡和目标失效会中断攻击。原版 Attack 动作按攻击经过时间采样，后摇结束回到 Stand，剩余冷却继续计时。存档保留前摇、随机数和可观察动作状态，拒绝异常伤害、冷却和武器身份；敌方公开状态隐藏前摇目标和内部计时。

## 原版来源和 REA 维护

安装目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。导入器按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 查找；当前三份原件均来自 `War3Patch.mpq`。导入前逐字节比对仓库保留原件：`SourceAssets/WarcraftIII/Units/UnitWeapons.slk`、`SourceAssets/CombatRewards/Units/MiscGame.txt`、`SourceAssets/CombatRewards/Units/UnitBalance.slk`。前者 SHA-256 为 `03c9cbc02d703cf5f8b5b1ed4da789ffcf733aff44f8e2f70b7937e4de613b33`。

`worker-weapons.json` 保留源行和运行值；`worker-weapons-sources.json` 记录归档、大小、摘要、安装位置、生成器和 REA 证据位置。原版数据适用 Blizzard 原有条款。

[REA GitHub 源站](https://github.com/morluto/rea)固定版本 6.5.0，Rizin 0.8.1；来源、固定提交、许可证和更新步骤见 `third_party/rea/README-MENGINE.md`。真实 REA MCP 检查只读分析 Game.dll，SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。`dmgpt1`、`backSw1` 位于 `0x6fa51a58`、`0x6fa51a80`，`0x6fa51090` 指针表包含这些地址。此证据确认字段和引用存在，未证明完整攻击执行函数等价。更新原版 DLL 后应重新定位，不能复用旧地址。

```powershell
node scripts/probe-frost-rea-rewards.mjs --worker-weapons
python scripts/import-frost-worker-weapons.py
node scripts/build-frostbound.mjs
node scripts/test-frost-worker-weapons-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-worker-balance.mjs --combat
```

## 验证与边界

三族规则和真实 TCP 检查覆盖骰子上下限、首次命中、完整攻击间隔、护甲倍率、研究隔离、存档逐帧续接、改令/控制/死亡中断、目标类型、索敌、碰撞追击、敌方隐私和前摇中断线重连。原生 Editor 六个场景覆盖三族完整付费训练，以及真实攻击命令、HUD、Attack 动作、前摇中保存加载和后摇转 Stand；控制台错误为 0。46 个真实 TCP 入口与 24,000 帧长程 AI 经济通过。最终包摘要记录在本地验收报告。

证据统一保留在 `tmp/docs-artifacts/frost-worker-weapons/`，不提交运行 JSON、日志或截图。Editor 正常退出；WebView runtime 清理出现 EPERM 时保留缓存并记录结果。

模拟仍使用 .1 秒固定步，.433 秒等前摇向上离散；尚未在原版游戏实际运行测量攻击。`RngBuff1=250` 运动缓冲、取消前摇后的再攻击节奏和双方碰撞对原版攻击距离的组合仍需实测。武器 2 采木、物品/可破坏物攻击、完整工人索敌/逃跑、采集、建造、维修和视野仍未完成。本阶段不代表完整 1:1 复刻完成。

主入口分段回归通过：先完成避障测试前的导入，再从修正后的避障测试运行全部剩余导入与完整主入口正文；长程 AI 另行通过。共 471 条去重 PASS 记录，后段退出码 0。汇总为 `tmp/docs-artifacts/frost-worker-weapons/regression-summary.json`。
