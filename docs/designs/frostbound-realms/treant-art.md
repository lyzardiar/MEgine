# 树人美术与动作

Wildwood 的 Treant 使用 `RealTreant` 根须树人，包含木质面具、木纹颜色/法线/粗糙度贴图，以及作者的待机、行走、挥爪和死亡动作。场景单位、地图布置、训练按钮、选中头像、存档恢复与尸体表现使用同一模型；血条高度按树人实际尺寸计算。

模型和纹理由 [piacenti](https://opengameart.org/content/entangled-roots) 创作，动画来自 [mysterymagination](https://opengameart.org/content/entangled-roots-with-animations)，原始概念为 [Misha 的 Alraune Rootling](https://opengameart.org/content/alraune-rootling)。三者均按 [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) 署名。原始 Blender 文件保存在 `SourceAssets/treant/`；来源 URL、文件长度、SHA-256 和派生文件哈希见 `treant-sources.json`，署名随 Player 位于 `Assets/Licenses/Entangled-Roots.txt`。

导入器从原作者文件恢复动画文件缺少的颜色贴图，将身体与面具合并为一套 2048×1024 纹理。源模型中三个未绑定顶点继承最近表面的权重，然后限制并归一化至每顶点最多四个骨骼影响。模型为 11,152 三角形 / 15 根骨骼，高 4.2 世界单位；原生采样覆盖 70 个动作帧。攻击姿态随战斗冷却推进，死亡定格后按现有规则消退。

Blender 4.5.9 重建：

```text
blender --background --disable-autoexec --python-exit-code 1 --python scripts/import-frost-treant.py
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs
node scripts/render-frost-unit-icons.mjs --treant-sheet
```

验证证据：

- `scripts/test-frost-treant-import.py`：源文件/生成文件哈希、材质纹理、UV、归一化皮肤权重、四组有效加权骨骼运动、70 个原生姿态的尺寸与落地范围通过，见 `treant-import-qa.json`。
- 两次生成的 5 个文件哈希一致，见 `treant-repro-qa.json`。
- 完整 `scripts/test-frostbound.mjs` 规则与真实 TCP 测试通过；新增覆盖树人地图布置、二级兵营训练、模型/头像、冷却驱动动作、存档/公开状态和死亡定格。原生 QuickJS `frost_sample`：3 passed / 0 failed。
- `scripts/qa-frostbound.mjs --treant-only`：原生 Release 编辑器和 Agent 输入，通过选择、移动、挥爪伤害、选中头像、战斗存档恢复及作者死亡动画；材质管线拒绝数 0，见 `native-treant-qa.json`。验收场景为自然族可控树人、静止的 80 HP 对手和被动英雄。
- `treant-poses.png` 为 12 格原生动作图；`treant-clearing.png`、`treant-combat.png`、`treant-death.png` 为实际交互截图。单位头像图集仍为 28 个模型。
- Windows 包 557 文件 / 248,657,580 字节，内容哈希 `fdb57cb4157f6e96acd61b31b9eb067d0421ff30512f721586c382080d63ee86`。资源校验与 30 秒启动检查见 `player-smoke.json`。

本阶段未验证物理输入、音频试听、跨机器联机或新的渲染 FPS。兽人、亡灵和部分自然族美术仍待统一，完整复刻目标尚未完成。
