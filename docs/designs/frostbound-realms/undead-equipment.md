# 不死族坟场装备研究

协议 108。新遭遇战默认 `undeadEquipmentVersion=1`；缺字段旧存档恢复为 0。研究入口为坟场，源单位身份 `ugrv`。每队的 `undeadEquipment` 保存四条科技等级，源骷髅与在飞弹道的 `undeadEquipmentLevels` 保存已经应用的等级。

| 科技 | 卡位 / 热键 | 一级金/木 | 二级金/木 | 三级金/木 |
| --- | --- | --- | --- | --- |
| 邪恶力量 Rume | 0 / S | 125/50 | 200/150 | 275/250 |
| 邪恶装甲 Ruar | 4 / U | 125/50 | 200/150 | 275/250 |
| 生物攻击 Rura | 1 / A | 150/50 | 200/125 | 250/200 |
| 生物甲壳 Rucr | 5 / C | 150/75 | 200/200 | 250/325 |

四条科技均为三级，研究时间依次为 60、75、90 秒；二级要求亡者大厅 `unp1`，三级要求黑色城堡 `unp2`。不同科技可在现有付费队列中等待，同一科技不能跨坟场重复研究。取消按实际等级价格全额退款；等待项保留完整时钟。已付费研究在前置基地被摧毁后继续完成，已完成等级保留。

本阶段实际属性绑定为已经还原的骷髅战士 `uske` 与骷髅魔法师 `uskm`。两者均受 Rume 和 Ruar 影响。Rume 每级增加一个原版攻击骰子，三级分别成为 `13+4d2`、`10+4d2`；Ruar 每级按单位表 `defUp=2` 增加护甲。完成研究立即更新现有单位，新召唤单位继承当前等级；生命、速度、法力及到期帧保持原规则。Rura/Rucr 的完整适用单位清单已留源，后续随其他原版兵种档案接通属性绑定。

弹道发射时冻结骰子结果和装备等级，研究完成不重算已经发射的伤害。法术控制保留夺取时的等级和属性；原阵营后续研究不会修改被夺取单位。存档验证版本、阵营、等级、属性、队列唯一性、等待项时钟及弹道等级上界。敌方公共状态隐藏科技等级、研究队列和单位内部装备记录。

源命令卡使用十二个原版等级图标。坟场研究卡位和热键独立处理；排队后显示取消退款按钮和源研究名称。现有 AI 有坟场时可通过新入口合法研究，并停止使用原型兵营通用升级。

## 来源与复现

- REA 上游：<https://github.com/morluto/rea>，固定 6.5.0。上游提交、源码归档摘要、许可证及 MCP 维护入口见 `third_party/rea/README-MENGINE.md`。
- 原游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。Game.dll SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `undead-equipment.json` 保留四条研究的十二级费用、时钟、前置、命令卡、源行、效果元数据及完整适用单位清单。`SourceAssets/UndeadEquipment/` 保存 MPQ 原件，`undead-equipment-sources.json` 保存原件、生成器与输出摘要。Blizzard 数据与美术遵守原始游戏条款。
- REA 静态证据保存在 `tmp/docs-artifacts/frost-undead-equipment/`：`rarm`、`ratd` 分别在 `0x6f697240`、`0x6f6972c0` 注册，身份方法为 `0x6f691b00`、`0x6f691b40`。参数与适用范围来自 MPQ。静态证据不证明原游戏全部逐帧更新顺序。

在仓库根目录复现：

```powershell
node scripts/probe-frost-rea-rewards.mjs --undead-equipment
$env:PYTHONUTF8='1'
python scripts/import-frost-undead-equipment.py
node scripts/build-frostbound.mjs
node scripts/test-frost-undead-equipment-network.mjs
node scripts/test-frost-undead-equipment-generated.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-undead-equipment.mjs
```

导入器支持 `--source-sample`、`--output`；签名输出被用户编辑后拒绝覆盖。在无游戏安装目录下，57 个输出及回执共 58 个文件已逐字节复现。

规则、真实 TCP 和生成客户端检查覆盖十二级费用与全时钟、取消退款、重复与阵营拒绝、源卡位与热键、排队保存、前置基地丢失、现有及未来骷髅、在飞弹道冻结、真实法术控制、来源死亡与旧存档迁移。主回归记录 637 条 PASS 并以 exit 0 结束，24,000 帧 AI 单独通过；新增不死族 AI 研究入口也已独立验证。原生四项检查通过，控制台错误 0，Editor 正常退出；Main.js 与验收版本 SHA-256 一致。截图、运行报告和原始日志统一保存在上述临时目录。

完整不死族兵种基础档案与装备绑定、完整科技树、原版队列容量与取消快捷键、原版 AI 计划和全部更新顺序仍需继续对照。整体 1:1 复刻目标保持进行中。
