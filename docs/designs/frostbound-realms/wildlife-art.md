# 写实野外守卫

普通中立守卫与 RPG 侦察守卫使用 `RealWolf` 灰狼，RPG 终点的 Frostbound sovereign 使用 `RealBear` 棕熊。两者保留待机、行走、攻击、死亡动画，并接入实际模型头像、战斗朝向、攻击冷却动画、存档和尸体表现。数值、掉落与任务推进继续使用现有规则。

原作者 [Wildfire Games](https://www.wildfiregames.com/)，素材来自 [0 A.D.](https://github.com/0ad/0ad) 固定 revision `61a3b9507d974084e6badb88a0826bd89a6d5b8b`，遵循 [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)。`wildlife-sources.json` 记录 20 个来源文件、7,487,752 字节，以及 10 个派生文件的 URL/哈希。原件位于 `SourceAssets/0ad`，Player 包含 `Assets/Licenses/0ad-wildlife.txt`；派生模型、材质、纹理和头像沿用 CC-BY-SA 3.0。

Blender 4.5.9 重建：

```text
blender --background --disable-autoexec --python scripts/import-frost-humans.py -- --manifest wildlife-sources.json
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs
node scripts/render-frost-unit-icons.mjs --wildlife-sheet
```

导入器将动画骨架的对象变换纳入骨骼姿态重定向。狼动画的对象缩放为 0.6、根骨骼缩放约为 1.6667，组合后恢复正确尺寸；静态尺寸与原生姿态包围盒一致。灰狼 696 三角形 / 32 骨骼，棕熊 2,530 三角形 / 75 骨骼。两者的皮肤权重归一化，原生采样分别覆盖 196、72 个动画帧。

验证证据：

- `scripts/test-frost-wildlife-import.py`：源文件与生成文件哈希、权重、UV、四种动画的加权骨骼运动、实际姿态尺寸与落地范围通过，详见 `wildlife-import-qa.json`。
- 重复生成 10 个文件哈希一致；重建现有 cavalry、human、mage、paladin、ranger、rifleman、siege 七组清单，123 个文件哈希均不变，见 `wildlife-repro-qa.json`。
- `scripts/test-frostbound.mjs`：资源、模型选择、头像、存档、尸体、完整 RPG 任务与真实 TCP 测试通过；原生 QuickJS `frost_sample` 为 3 passed / 0 failed。
- `scripts/qa-frostbound.mjs --wildlife-only`：原生 Release 编辑器和 Agent 逐帧输入，验证狼的选择、移动、追击、攻击伤害、战斗存档恢复以及棕熊死亡。验收场景为平地、可控狼、静止的 150 HP 熊和被动英雄，材质管线拒绝数为 0，见 `native-wildlife-qa.json`。
- `wildlife-poses.png` 是原生渲染的 12 格动作图，`wildlife-clearing.png`、`wildlife-combat.png`、`wildlife-death.png` 是原生验收截图。单位头像图集包含 28 个实际模型。
- Windows 包 551 文件 / 239,250,731 字节，内容哈希 `3e8c338b382e12620eba7fd819909deea581217d278559e0a1a422d155a3f53c`。清单和资源校验通过；实际启动 30 秒可响应，日志错误为 0，见 `player-smoke.json`。

本阶段未验证物理鼠标/键盘、音频试听、跨机器局域网或新 FPS 指标。其他阵营仍有旧风格素材，完整游戏复刻尚未完成。
