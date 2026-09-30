# 写实法师英雄

寒霜守望者使用蓝白长袍、兜帽和披风；烈焰贤者使用暖色长袍、缠头和披风。两者持法杖，具有待机、行走、攻击与施法动画。普通奥术法师使用烈焰贤者模型。英雄选择、单位头像与地图编辑器沿用统一模型映射。

素材来自 Wildfire Games 的 0 A.D.，固定版本 `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，采用 CC-BY-SA-3.0。`mage-sources.json` 记录 31 个源文件（5,810,305 字节）的下载 URL、大小与 SHA256，以及 10 个派生文件的哈希。署名随 Player 打包到 `Assets/Licenses/0ad-mages.txt`，派生模型、纹理、材质和合并头像图集按相同许可分发。

寒霜模型 1,529 三角面，烈焰模型 1,512 三角面，均保留 102 骨骼。披风共用 cape1–3 蒙皮；法杖绑定原始 prop-weapon_R 插槽。长袍与披风使用蓝/红颜色蒙版；兜帽、缠头与法杖保留原始贴图颜色。

普通攻击依照单位攻击冷却推进动画，在动作进度 25% 对应弹道发射。英雄施法复用技能冷却驱动的 0.8 秒动作，移动和眩晕优先。存档和公开网络状态保留所需冷却信息，协议仍为 10。

## 复现与检查

```powershell
& tmp/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/import-frost-humans.py -- --manifest mage-sources.json
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs --mage-sheet
node scripts/render-frost-unit-icons.mjs
python scripts/test-frost-mage-import.py
node scripts/test-frost-visuals.mjs
node scripts/test-frostbound.mjs
node scripts/qa-frostbound.mjs --mages-only
```

两次独立导入的 10 个派生文件逐字节一致。300 个原生采样姿势通过几何、UV、索引、蒙皮权重、披风运动和法杖握持距离检查。两位英雄共 8 个技能的施法动作、移动/眩晕优先级、存档与公开状态恢复通过规则检查。

原生 Release/QuickJS 检查通过英雄选择、头像、行走、法杖攻击、冰霜/火焰弹道、实际伤害、技能学习、法力消耗及施法中途存档恢复；材质管线拒绝数为 0。整套规则/TCP 回归通过。Player 包含 511 个文件，209,087,616 字节，逐文件哈希核验和 30 秒启动响应检查通过。

- [原生姿势图](mage-poses.png)
- [寒霜施法](mage-0-cast.png)、[烈焰施法](mage-1-cast.png)
- [导入检查](mage-import-qa.json)、[原生检查](native-mages-qa.json)、[阶段结果](mage-art-qa.json)

这是历史风格素材组装的原创法师外观；其余部分角色仍使用不同风格资产，尚未达到完整魔兽英雄美术还原。原生 Agent 输入检查不代表物理鼠标、听音、跨机器局域网或独立 Player 帧率验收。
