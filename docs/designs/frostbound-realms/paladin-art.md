# 圣骑士模型与施法动作

王国圣骑士使用蓝色链甲、头盔、圆盾、钉锤和有骨骼动画的披风；黎明圣骑士英雄使用金色胸甲、护胫、披风和独立外观。模型由 Wildfire Games 的 0 A.D. 角色与装备组装，源版本固定为 `61a3b9507d974084e6badb88a0826bd89a6d5b8b`。37 个源文件的 URL、大小和 SHA256，以及 10 个派生文件的哈希见 `paladin-sources.json`。

原件、派生模型、纹理、材质和包含这些角色的头像图集遵循 CC-BY-SA-3.0。署名随 Player 位于 `Assets/Licenses/0ad-paladins.txt`。两种模型共用 102 骨骼的人物结构，披风保留 cape1–3 的原始蒙皮与动作，英雄护胫绑定到原始 `prop_leg_L/R` 插槽。

英雄使用原始 promotion 动作作为举锤施法手势，覆盖四个已学技能成功释放后的前 0.8 秒。动作进度来自已有技能冷却；存档、公开状态和重连继续使用同一份时间数据。移动和眩晕优先呈现相应状态，未学会或未成功释放的技能不触发施法动作。普通攻击和技能的模拟效果保持现有规则。同一输入帧同时切换英雄并开始游戏时，先更新英雄选择，再创建对局；界面选择与出场英雄保持一致。英雄主菜单预览、选中头像和普通圣骑士训练图标使用原生模型渲染图集。

## 重建与验收

```powershell
& tmp/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest paladin-sources.json
python scripts/test-frost-paladin-import.py
node scripts/render-frost-unit-icons.mjs --paladin-sheet
node scripts/render-frost-unit-icons.mjs
node scripts/build-frostbound.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --paladin-only
node scripts/qa-frostbound.mjs --heroes-only
```

导入验证检查全部源文件和派生哈希、索引、UV、四个归一化蒙皮权重、披风动作，以及 144 个原生姿态的边界、武器到右手的距离和护胫到腿部的距离。10 个派生文件重复导入后字节一致。规则验证覆盖四个技能的施法进度、失败释放、移动/眩晕优先级、保存和公开状态下的姿态一致性。

专项原生 QuickJS/Agent 输入验证普通圣骑士的头像、训练图标、移动、攻击朝向、伤害和保存恢复；英雄验证同帧切换并开局、实际学习圣光、释放治疗、扣除法力、进入施法姿态，并在施法中保存和恢复。英雄专项验证继续覆盖四种英雄选择、学习、释放、保存以及地图编辑器放置英雄。

- [模型与动作](paladin-poses.png)：上排普通圣骑士，中排黎明圣骑士，下排举锤施法；中列的行走姿态展示背部披风。
- [实际施法](paladin-cast.png)、[施法存档恢复](paladin-cast-restored.png)、[普通圣骑士战斗](paladin-combat.png)。
- [导入检查](paladin-import-qa.json)、[原生检查](native-paladin-qa.json)、[阶段结果](paladin-art-qa.json)。

模型来源为历史题材角色，当前是写实风格的组合外观，尚未达到原作英雄造型的完整还原；其他未替换角色仍有风格差异。截图为原生渲染，专项场景使用固定高生命靶和无 AI。物理键鼠、音频听感、跨机器 LAN 与独立 Player 帧率尚未验收。
