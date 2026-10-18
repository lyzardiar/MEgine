# 骷髅战士与骷髅魔法师的原版规则

协议 107。新遭遇战使用 `skeletonRulesVersion=1`；单位和在飞弹道保留 `skeletonRules=1`。缺字段旧存档恢复为版本 0，保留旧属性、研究费用和即时攻击规则。复活死尸与亡灵巫术法杖生成的骷髅共用源基础档案；法术控制转移后继续保留原属性和到期帧。

| 项目 | 骷髅战士 uske | 骷髅魔法师 uskm |
| --- | --- | --- |
| 生命 / 法力 / 人口 | 180 / 0 / 0 | 230 / 0 / 0 |
| 护甲 / 护甲值 | 重甲 / 1 | 中甲 / 0 |
| 移速 / 碰撞半径 | 2.7 / .31 | 2.7 / .31 |
| 昼 / 夜视野 | 8 / 6 | 14 / 9 |
| 回复 | 荒芜之地 2 生命/秒 | 荒芜之地 2 生命/秒 |
| 普通攻击 | 普通，1d2+13 | 穿刺，1d2+10 |
| 射程 / 间隔 | .9 / 2 秒 | 5 / 1.5 秒 |
| 前摇 / 后摇 | .56 / .44 秒 | .5 / .5 秒 |
| 目标 | 地面 | 地面和空中 |
| 弹道 | 近战 | SkeletalMageMissile，速度 9，弧度 0 |

源单位使用原版骰子、伤害类型、弹道出射点和命中高度，不叠加原型通用武器升级的每级 +6 伤害。攻击前摇与在飞弹道可保存恢复；施法者死亡并被移除后，弹道仍保留源档案并只命中一次。

诅咒神庙的骨质增强术 `Rusl` 为 50 金、75 木、15 秒，热键 S、卡位 10；骷髅法术 `Rusm` 为 125 金、150 木、30 秒，要求三级基地，热键 M、卡位 6。研究与死灵法师训练共用生产队列和退款入口。源研究按固定步长精确完成，消除浮点尾差造成的额外一帧。完成骷髅法术后，复活死尸产生一名战士和一名法师；骨质增强术使这次召唤持续 55 秒。

## 来源与更新

- REA 上游：<https://github.com/morluto/rea>，固定 6.5.0；提交、归档摘要、许可证、MCP 配置见 `third_party/rea/README-MENGINE.md`。
- 原游戏：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `skeleton-rules.json` 保存四张单位表、升级行、复活死尸两级数据及文字字段；`SourceAssets/SkeletonRules/` 保留 MPQ 原件。`skeleton-rules-sources.json` 保存源件、生成器、转换工具及输出摘要。Blizzard 游戏数据、美术遵守原始游戏条款。
- 原版单位模型复用 `RealSkeletonWarrior`、`RealSkeletonMage`。弹道转换目录为 `Assets/SkeletonRules/`，节点回执为 `skeleton-rule-node-sources.json`。
- REA 静态证据位于 `tmp/docs-artifacts/frost-skeleton-rules/`：`rrai` 注册在 `0x6f697580`，身份方法为 `0x6f690230`；`CUpgradeRaiseDead` 名称方法为 `0x6f6907e0`。这些证据与 MPQ 参数互相定位，不证明原游戏全部更新顺序或法杖的升级交互。

在仓库根目录复现：

```powershell
node scripts/probe-frost-rea-rewards.mjs --skeleton-rules
$env:PYTHONUTF8='1'
python scripts/import-frost-skeleton-rules.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
node scripts/build-frostbound.mjs
node scripts/test-frost-skeleton-rules-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-skeleton-rules.mjs
```

转换工具路径按本机配置。使用 `--source-sample` 读取已保留原件，`--output` 写入独立目录；在无游戏安装目录下，42 个输出和回执共 43 个文件逐字节复现。导入器拒绝覆盖用户编辑的签名输出。

验证产物统一保存在上述临时目录，包含实际 TCP 研究计费、退款、敌方拒绝、私有研究钟、途中重连、实际召唤、来源死亡后的弹道和单次命中；规则回归还覆盖真实法术控制和法杖召唤。原生验收覆盖两个研究命令卡与快捷键、全时钟研究、退款、途中保存、实际复活死尸和源弹道渲染。主回归记录 618 条 PASS 并以 exit 0 结束；24,000 帧 AI 单独运行通过。原生 4 项检查通过、控制台错误 0、Editor 正常退出；Main.js 与暂存验收版本 SHA-256 一致。截图、运行 JSON 和原始诊断不进入 `docs/`。

完整不死族科技树、邪恶力量与邪恶装甲升级、全部目标类别和魔免组合、原游戏更新顺序，以及骨质增强术对其他召唤路径的作用仍需继续对照。整体 1:1 复刻目标保持进行中。
