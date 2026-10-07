# 自然的祝福研究

作者：MiYu

近战暗夜精灵的生命之树、远古之树与永恒之树可以研究 Nature's Blessing。原版 `Renb` 提供 150 金、200 木、60 秒、一级研究上限及 40 源单位的移动速度增量；`NightElfUpgradeFunc.txt` 提供远古之树前置、原版图标和命令位置 `(2,0)`，`NightElfUpgradeStrings.txt` 提供 N 快捷键。当前游戏使用 100 源单位对应一个世界单位。

护甲增量读取各单位 `UnitBalance.slk` 的 `defUp`，原版主树、战争古树、奇迹古树与树人增加 5，远古守护者增加 2。`natures-blessing.json` 保留全部受 Renb 影响的源单位列表、当前模型绑定、研究原始行与命令定义；`natures-blessing-sources.json` 签名七个原始文件及全部输出，原始 BLP 和 SLK/TXT 原样保存在 SourceAssets。原版素材沿用 Blizzard Entertainment 的游戏资产许可。

| 当前模型绑定 | 源单位 | 护甲增量 |
|---|---|---:|
| 三级主树 | etol / etoa / etoe | 5 |
| 战争古树 | eaom | 5 |
| 远古守护者 | etrp | 2 |
| 奇迹古树 | eden | 5 |
| 树人 | efon | 5 |

协议 43、新存档 `natureVersion=1`。研究与小精灵训练共用现有生产队列，提交时支付费用，按排队次序执行。研究不占人口，不依赖空闲单位槽或出生位置；同一玩家只能存在一次未完成研究。取消退回研究全额费用，研究建筑被摧毁时丢失投入；已完成的效果保留并应用于之后生成的受益单位。拔根与变形暂停队列，扎根后继续。存档严格检查版本、阵营、等级、重复研究、队列字段和受益标记；旧存档保持此前规则。敌方公开状态隐藏研究队列及玩家研究等级，可见单位保留实际护甲和移动数据。

HUD 使用原版启用／禁用图标、N 快捷键和 `(2,0)` 位置，提示实际费用、工期与加成。单位护甲显示实际数值及类型；主树的生产队列使用独立两行区域，并在队列结束后恢复移动信息。

```text
python scripts/import-frost-natures-blessing.py
node scripts/build-frostbound.mjs
node scripts/test-frost-natures-blessing.mjs
node scripts/test-frost-natures-blessing-client.mjs
node scripts/test-frost-natures-blessing-network.mjs
python scripts/test-frost-natures-blessing-assets.py
node scripts/test-frostbound.mjs
node scripts/qa-frost-natures-blessing.mjs
python scripts/verify-frost-natures-blessing-bundles.py
```

规则测试推进完整的 14 秒小精灵与 60 秒研究工期，覆盖支付、混合排队、暂停／形态切换、退款、死亡、单位上限、现有／未来单位、等级升级、伤害护甲、严格存档和敌方隐私。客户端测试执行生成脚本中的真实按钮、N、取消和游戏菜单存读档。TCP 测试覆盖重复序号、越权、研究中与完成后的重连；TCP 单项测试使用受控的剩余计时，完整工期由规则和原生验收单独推进。

素材报告见 `natures-blessing-art-validation.json`；原生独立双工程的实际命令、完整工期、存读档、HUD 数值与联机报告入口是 `native-natures-blessing-qa.json`，产品文件一致性报告入口是 `natures-blessing-native-bundle-validation.json`。原生步进分为每批最多 20 帧，保留完整的实际推进帧数。

完整规则／客户端／真实 TCP 回归退出 0，共 83 条 PASS；素材的 11 个签名文件、7 个原始源文件、无需游戏安装的重生成和修改保护通过。原生 Release QuickJS 双独立工程通过原版启用／禁用图标、实际点击和 N、完整 14 秒训练与 60 秒研究、取消退款、暂停和精确存读档、实际护甲／移动数值及大厅创建／加入／准备／开局。联机研究接受于 frame 254、完成于 frame 854，完整推进 600 tick；敌方队列保持私有，双方可见护甲一致，客机重连后升级保留。两端材质拒绝和控制台错误均为 0。

两份原生工程各 6,654 个产品文件逐文件一致，仅允许工程标识、临时 TCP 地址与 qaUnits 观察字段。最终生成脚本 SHA-256 为 882b10cb421b535f2bf0479ec62ddf7f445a6f5e9161bb72e6955ca8b729a41f；场景仍为 28,383 实体／243 模型条目。已查看最终命令、完成和联机研究截图。建筑源比例和四族控制台、多宽高比布局沿用此前通过的实现。

当前三种主树支持拔根后的 0.4→0.8 移动速度；战争古树、远古守护者与奇迹古树的源形态见 [生产古树](production-ancients.md)；风之古树／知识古树独立兵种树及全部单位基础数值仍需完善。树人沿用当前基础属性并施加原版 Renb 增量。现有生产队列容量为三项，全部原版研究／生产排队细节和建筑捕获规则尚未复刻。原版客户端对暂停／前置关系的独立测量、物理键鼠、听感及跨机器 LAN 尚未验收。完整四族、战役、Dota／经典塔防与编辑器目标保持 active。
