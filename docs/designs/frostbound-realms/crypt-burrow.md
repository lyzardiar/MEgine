# 穴居恶魔钻地

协议 111，新遭遇战使用 `cryptBurrowVersion=1`。源地穴研究 `Rubu` 后，穴居恶魔可通过 B 键或卡位 11 的原版按钮钻地、出地。研究位于源地穴卡位 5，同样使用 B 键，要求坟场和亡者大厅，花费 75 金币、75 木材、45 秒。它与生产共用付费队列，排队等待期间保留完整研究时间，取消退还已支付资源；敌方不能查看队列及研究状态。

钻地与出地采用源能力 `Abur` 的 1.45 秒变形时间，按现有 0.1 秒固定步长推进。变形期间不接受其他命令。地下形态 `ucrm` 使用原模型的 Morph / Stand Alternate / Morph Alternate 动画，保持原生命、护甲及装备，移动速度为 0，不能攻击，每秒回复 5 点生命。出地恢复源身体的移动和武器。钻地前已发出的弹道保持原伤害与飞行结果。

地下形态属于隐形单位，友方可见；敌方需要现有真视、魔法岗哨、照明弹等探测效果。公共状态过滤不可见单位，变形只公开显示所需的剩余时间。存档保留研究队列、地下身份、源变形起始帧及剩余时间，拒绝伪造版本、种族研究、形态、计时、移动速度及额外字段。死亡清除未完成变形；死亡骑士复活其尸体时恢复可见的源身体，不保留地下形态或研究能力。

缺少版本字段的旧存档使用版本 0，保留原有行为。MOBA、塔防和 RPG 不启用该规则，外族兵营不提供这项研究。

## 来源与维护

- REA 源站：<https://github.com/morluto/rea>，固定版本 6.5.0；源码提交、归档摘要、许可证和引擎 MCP 工作流见 [REA 维护说明](../../../third_party/rea/README-MENGINE.md)。
- 原游戏路径：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。受检 Game.dll SHA-256：`e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。
- `SourceAssets/CryptBurrow/` 保存原版技能、升级、单位及元数据表、命令纹理；`crypt-burrow.json` 保存 `Abur`、`Rubu`、`ucrm` 原行与运行参数；`crypt-burrow-sources.json` 保存 MPQ 路径、原件和输出摘要。身体和头像沿用 `crypt-unit-models.json` 的源转换资产。
- REA 定位到 `CAbilityBurrow` 的 RTTI、`Abur` 类型标识、构造与父类变形实现、独立虚表及状态位写入/清理方法。构造地址为 `0x6f4b4ad0`，虚表为 `0x6f9c802c`；方法包括 `0x6f4aad40`、`0x6f4aae70`、`0x6f4aaf20`。这些静态记录不等同于逐指令还原原游戏全部调度顺序。
- 原游戏数据与图像遵守 Blizzard 原有条款；来源声明不授予免费再分发许可。

```powershell
node scripts/probe-frost-rea-rewards.mjs --crypt-burrow
$env:PYTHONUTF8='1'
python scripts/import-frost-crypt-burrow.py
python scripts/import-frost-crypt-burrow.py --game Z:/not-installed --output tmp/docs-artifacts/frost-crypt-burrow/reproduction
node scripts/build-frostbound.mjs
node scripts/test-frost-crypt-burrow.mjs
node scripts/test-frost-crypt-units-network.mjs
node scripts/test-frost-crypt-units-generated.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-crypt-burrow.mjs
```

导入器支持 `--game`、`--source-sample` 和 `--output`，拒绝覆盖编辑过的已签名输出。使用保留原件时，30 个输出和来源回执共 31 个文件可在无游戏安装路径下逐字节复现。运行报告、截图、REA 证据和原始日志统一写入 `tmp/docs-artifacts/frost-crypt-burrow/`。

主回归记录 697 条 PASS，退出码 0。收尾新增的探测状态清理、公共显示字段拒绝和真实魔法岗哨 9 单位边界通过专项检查。最终生成客户端和真实 TCP 再验通过。原生三项验收通过完整研究、钻地与出地时钟，以及三种过程中存取、原卡位/B 键、启用的地下专用网格、每秒 5 点回复和正常身体恢复；控制台错误 0，Editor 正常退出。原生报告 `native-crypt-burrow.json` 的 Main.js SHA-256 与暂存字节一致：`a57eead7f22dc681f9cfeb8c63986ec5b7e8eb1351389dce567f0576c68fd87f`。Windows 拒绝删除的隔离 QA runtime 缓存保留，位置与原因记录在该报告中。源输出摘要、无安装复现及编辑后拒绝覆盖均已验证。

蛛网、石像形态、完整队列限制、原版 AI 研究计划和全部更新顺序继续还原。整体 1:1 复刻目标保持进行中。
