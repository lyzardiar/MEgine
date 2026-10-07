# 暗夜精灵原版科技数据与图标

Author: MiYu。`night-elf-technology.json` 保存战争古树 `eaom` 和猎手大厅 `edob` 的全部原版研究列表：11 个研究 ID、19 个等级、38 张原版可用／禁用图标。导入器同时保留原始费用、时间、前置数量、指令槽位、热键、中文文字、升级效果代码、实际单位绑定和相关单位／能力／武器原始行。

这一阶段交付原版数据与素材。研究队列、联机状态、存档和客户端指令接入仍待完成，`night-elf-technology-art-validation.json` 的 `runtimeResearchAcceptance` 明确为 `false`。原生产品 `Main.js`／`Main.mscene` 没有改动，因此没有以素材检查代替可玩科技树验收。

## 覆盖范围

费用格式为金币／木材／秒；等级前置对应远古之树 `etoa`、永恒之树 `etoe`、猎手大厅 `edob`。原版 `Requires` 的顺序和数量保存在每一级记录中。

| 建筑 | 研究 ID | 原版文字 | 等级费用 | 前置 |
|---|---|---|---|---|
| 战争古树 | Resc | 哨兵 | 100／100／20 | edob、etoa |
| 战争古树 | Reib | 硬弓 | 50／100／35 | etoa |
| 战争古树 | Remk | 射击术 | 100／175／40 | edob、etoe |
| 战争古树 | Remg | 升级月刃 | 100／150／35 | edob、etoe |
| 战争古树 | Repb | 穿刺剑刃 | 125／100／60 | etoa、edob |
| 猎手大厅 | Resm | 月之力量 | 125／75／60；175／175／75；225／275／90 | 无；etoa；etoe |
| 猎手大厅 | Rema | 月之护甲 | 150／75／60；200／150／75；250／225／90 | 无；etoa；etoe |
| 猎手大厅 | Resw | 野性力量 | 100／75／60；175／175／75；250／275／90 | 无；etoa；etoe |
| 猎手大厅 | Rerh | 加强隐藏 | 150／50／60；200／150／75；250／250／90 | 无；etoa；etoe |
| 猎手大厅 | Reuv | 夜视能力 | 50／50／45 | 无 |
| 猎手大厅 | Rews | 月井之春 | 75／150／30 | etoe |

`Rerh` 的“加强隐藏”是本机原安装包的中文名称；实际效果为加强硬皮／护甲升级。保存原文可追溯本地化来源。`NightElfUpgradeStrings.txt` 为 6,077 字节，SHA-256 `a6d283969819ab35e4b8c380d2da4ca5cf151e373e95a01ad2425728cd568e2c`，严格 UTF-8 解码，无 U+FFFD；与本机 `War3Patch.mpq`、`War3xLocal.mpq` 同路径字节一致。

## 效果依据

- 单位绑定来自 `UnitBalance.upgrades`。`Resm` 的 `class=melee` 和 `Resw` 的 `class=ranged` 不能用作单位分类。月之力量绑定弓箭手／女猎手／投刃车等，月之护甲不包含投刃车；野性系列绑定熊形态和风暴之鸦形态，不包含德鲁伊人形。
- `ratd` 每级增加一个攻击骰。弓箭手／女猎手骰面为 3，平均增加 2；投刃车骰面为 18，平均增加 9.5。保留两个武器的骰数、骰面与固定伤害，供真实随机伤害实现使用。护甲升级使用单位自己的 `defUp`，实际绑定单位均为每级 2。
- 硬弓增加 200 源单位射程；射击术增加 3 点攻击；女猎手初始共 2 个弹射目标，研究后共 3 个，每跳损伤衰减 50%。源长度仍使用原值，换算系数为每 100 源单位对应一个世界单位。
- 哨兵 `Aesn` 针对树，施法距离 800、零魔法、零持续时间代表不限时；飞行视野 100、盘旋视野 900、高度 275、数量 1。字段由 `AbilityMetaData` 的 `Esn1–4` 与编辑器字符串确认。[Blizzard 女猎手说明](https://classic.battle.net/war3/nightelf/units/huntress.shtml)补充每名女猎手只有一次使用、可看隐形、锚定树受伤移除和可驱散。原始 `Cool1=120` 保留在源行，不能作为无限重复施放的依据。
- 穿刺剑刃增加 200 源单位穿透距离、启用第二武器；穿透半径 50、最小射程 250，第二武器原始目标包含树。[Blizzard 投刃车说明](https://classic.battle.net/war3/nightelf/units/glaivethrower.shtml)补充 Attack Ground 不穿透、穿透不伤树、Attack Ground 可伤多棵树。补充规则均带独立 `ruleReference`，与原始表行分别记录。
- 夜视能力使实际绑定单位的夜间视野达到其白天视野。月井之春的 `rmnr` 是百分比回复奖励：300 最大魔法增加到 425，1.25／秒乘以 1.52 得到 1.9／秒。夜间回复限制来自月井 `Ambt.DataE1`，不是单位的生命回复类型；原始 `regenType=none` 指生命回复。月井初始魔法 100、每井魔法恢复 2 生命或 0.5 目标魔法的字段也已保留。

## 复现与检查

```powershell
python scripts/import-frost-night-elf-technology.py
python scripts/test-frost-night-elf-technology-assets.py
# 在本阶段文件已加入暂存区后，同时验证 Git blob 的签名。
python scripts/test-frost-night-elf-technology-assets.py --index
```

首次导入从本机游戏档案按 `War3Patch → War3xLocal → War3x → war3` 优先级提取缺失源文件，既有共享原始表必须匹配已登记的签名。后续只用签名源文件即可脱离游戏安装复现。素材修改保护在任何写入前检查全部候选输出；预检拒绝时不补写其他缺失文件、不修改任何输出。

验证结果为 50 个原始源文件、90 个签名输出逐字节匹配；覆盖全部 11 项／19 级费用、前置、绑定、中文、槽位和 38 张 64×64 RGBA 图标。隔离目录复现的输出和来源回执逐字节一致。另验证已修改图标会阻止整个导入写入，损坏原始升级表会在任何输出写入前被拒绝。结果记录在 [night-elf-technology-art-validation.json](night-elf-technology-art-validation.json)。原始图标来自 Blizzard 游戏档案，适用原游戏资产条款；提取和下载不代表取得免费再分发许可。

提交前另验证暂存区生成器、回执及全部签名输出共 92 项，使用一次 `git cat-file --batch` 读取，并核对 blob 的实际字节哈希。Git 属性固定生成器／目录 JSON 的 LF 换行、保留 WorldEditStrings 原始字节，确保检出后仍可复现。独立只读审核额外从 38 个原始 BLP 在内存重新解码，与交付 PNG 逐字节比较，通过。

下一步按这份目录实现队列、全队升级状态、原版效果、保存／恢复与联机隐私，完成客户端原版槽位／热键／提示以及原生运行验收。完整游戏复刻目标仍在进行中。
