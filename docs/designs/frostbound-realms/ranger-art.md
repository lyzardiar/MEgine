# 写实游侠英雄与施法朝向

林地游侠使用女性弓手身体、绿色短装与披风、棕色长发、背部箭袋和带骨骼动画的弓。待机和跑动时右手持箭；射击时在搭箭、释放与重新装填模型之间切换，弓臂和弓弦同步变形。英雄选择、头像、地图编辑器和实际战斗使用同一外观。

素材来自 Wildfire Games 的 0 A.D.，固定版本 `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，采用 CC-BY-SA-3.0。女性短装来自 `mauryas/infantry_archer_c.xml`，原 actor 明确使用弓手动作；长发头部与中披风同样来自该版本。`ranger-sources.json` 记录 28 个源文件（5,494,751 字节）的 URL、大小和 SHA256，以及 15 个派生文件的哈希。Player 包含 `Assets/Licenses/0ad-ranger.txt` 署名；派生模型、纹理、材质及合并头像图集按相同许可分发。

三种模型共用 106 骨骼，包括 102 根人物骨骼与 4 根弓骨骼。披风保留 cape1–3 蒙皮。普通射击依照攻击冷却推进，使用原动作的 event=0.45 和 load=0.72。技能从箭矢释放时刻开始播放后续动作，在 0.8 秒内完成回收与装填。动作和箭的可见状态使用同一技能进度，移动和眩晕优先。

成功的定向施法记录 `castYaw`，角色在施法动作期间转向实际目标。自目标技能清除旧方向，失败施法保留当前动作方向。这个可选字段随存档和公开网络状态保存，旧存档仍可读取，恢复时验证有限数值和角度范围。协议仍为 10。

## 复现与验收

```powershell
& tmp/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest ranger-sources.json
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs --ranger-sheet
node scripts/render-frost-unit-icons.mjs
python scripts/test-frost-ranger-import.py
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --ranger-only
node scripts/qa-frostbound.mjs --heroes-only
```

两次导入的 15 个派生文件逐字节一致。306 个原生采样姿势通过几何、UV、索引、蒙皮权重、披风/弓弦运动和双手握持距离检查。规则检查覆盖游侠四个技能的箭状态与动作、四位英雄的施法朝向、移动/眩晕优先级、非法存档字段和旧存档兼容。

原生 Release/QuickJS 检查通过游侠选择、头像、移动、普通箭弹道和伤害、搭箭/放箭切换、技能学习和伤害、法力消耗、施法朝向及中途存档恢复；材质管线拒绝数为 0。四英雄选择、技能释放、存档读取和编辑器英雄放置往返通过。TCP 检查实际发送学习/施法指令，验证权威朝向及施法中途重连；整套规则/联机回归通过。

- [原生姿势图](ranger-poses.png)
- [实际射击](ranger-combat.png)、[技能释放](ranger-cast.png)、[恢复施法](ranger-restored.png)
- [导入检查](ranger-import-qa.json)、[原生游侠检查](native-ranger-qa.json)、[四英雄检查](native-heroes-qa.json)、[阶段结果](ranger-art-qa.json)

四位英雄均已有写实模型，但这仍是历史风格素材组装的原创角色；其余部分兵种风格尚未统一，完整魔兽游戏与美术还原仍未完成。原生 Agent 检查不代表物理鼠标、听音、跨机器局域网或独立 Player 帧率验收。
