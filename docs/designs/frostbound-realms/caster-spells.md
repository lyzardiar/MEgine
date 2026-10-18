# 死灵法师与萨满的原版施法流程

协议 106。新遭遇战默认 `casterSpellVersion=1`，要求 `sourceCasterVersion=1`。原版单位同时保留 `casterSpellRules=1`，用于存档验证和动画分支。缺少版本字段的存档恢复为 0，继续使用即时施法及旧动画规则；其他游戏模式保留原行为。

| 法术 | 原始 ID | 热键 / 卡位 | 耗蓝 / 冷却秒数 |
| --- | --- | --- | --- |
| 复活死尸 | Arai | R / 8 | 75 / 8 |
| 邪恶狂热 | Auhf | U / 9 | 50 / 1 |
| 残废 | Acri | C / 10 | 175 / 10 |
| 净化 | Apg2 | G / 8 | 75 / 1 |
| 闪电护盾 | Alsh | L / 9 | 100 / 3 |
| 嗜血术 | Ablo | B / 10 | 40 / 1 |

单位表中的死灵法师施法前摇/后摇为 .5/.5 秒，萨满为 .6/1.4 秒。新流程先接收目标并移动到施法范围，开始前摇；结束前摇时再次检查目标、训练、法力与冷却，然后扣蓝并生效。停止或移动取消当前前摇；失效目标、死亡、眩晕和变形会清除施法状态。手动施法和自动复活死尸、自动嗜血术共用同一路径。命令卡右键或 Shift+对应热键切换自动施法。

`casterCast` 保存法术、目标、剩余前摇、开始帧和自动施法标记；`casterBackswing` 保存后摇。公共状态只投影施法相位，不公开内部施法记录。原版复活死尸在后摇结束时直接结束施法动画；旧版存档继续使用旧的冷却相位推断。

净化使用源表的 3 秒普通单位暂停、1 秒英雄暂停，以及 15/5 秒恢复周期。移动恢复按五档除数计算：1/5、1/4、1/3、1/2、1。`sourcePurgeDuration` 随效果保留，公共状态也保留它以保证客户端与服务器计算一致。法术窃取会转移此信息并按接收者截断英雄时长和暂停；牧师驱散等清理路径删除此信息。旧版净化与闪电之球保留各自规则。

## 来源和更新

- REA 上游：<https://github.com/morluto/rea>，固定 6.5.0；上游提交、归档摘要、许可证及 MCP 配置见 `third_party/rea/README-MENGINE.md`。
- 原游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `caster-spells.json` 保存六个法术的 AbilityData、单位施法行、文字、图标和编辑器字段含义。`SourceAssets/CasterSpells/` 保留完整 MPQ 原件；`caster-spells-sources.json` 保存原件、生成文件和生成器摘要。Blizzard 原始游戏条款适用于这些数据与图标。
- REA MCP 静态证据在 `tmp/docs-artifacts/frost-caster-spells/`。单位加载器 `0x6f693b00`、`0x6f693b14` 分别读取 `castpt`、`castbsw` 至单位资料偏移 `0x5fc`、`0x608`；同时保留 Raise Dead/Purge 类身份的证据。目录数值来自源表，静态加载证据不等于原游戏逐帧运行验收。

在仓库根目录复现：

```powershell
node scripts/probe-frost-rea-rewards.mjs --caster-spells
$env:PYTHONUTF8='1'
python scripts/import-frost-caster-spells.py
node scripts/build-frostbound.mjs
node scripts/test-frost-caster-spells-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-caster-spells.mjs
```

通过 `--source-sample` 读取已保留原件，使用 `--output` 写入独立目录，可不依赖游戏安装复现。导入器先检查签名输出，拒绝覆盖用户编辑。38 个输出及回执共 39 个文件已经逐字节复现。

验证覆盖六个法术的前摇、扣蓝、生效、后摇与存档续跑，停止/移动/眩晕/死亡/失效目标，源命令卡、原生快捷键和自动施法切换，真实 TCP 权限与途中重连，净化的法术窃取和牧师驱散。主回归记录 602 条 PASS 并以 exit 0 结束；24,000 帧 AI 单独运行通过。原生 9 项检查通过，控制台错误 0，Editor 正常退出；验收 Main.js 与暂存文件 SHA-256 一致。主回归、AI 与原生报告统一保存在上述临时产物目录；截图与运行 JSON 不进入 `docs/`。

完整 1:1 仍需继续验证原游戏的更新顺序、法术目标类别与魔免叠加、召唤单位自身的完整属性，以及完整种族科技树和 AI；本阶段不代表整款游戏复刻完成。
