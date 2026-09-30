# 部落兽人步兵

Warclans 的 Raider 使用 `RealOrc`，保留作者的绿色皮肤、獠牙、皮革、尖刺护肩与战锤贴图，包含待机、行走、攻击、死亡四组骨骼动作。实际单位、地图布置、兵营训练、选中头像、存档恢复和尸体使用同一模型。攻击显示按模拟冷却推进，在 11 个采样帧中的第 7 帧对齐落锤伤害。

素材由 Guillaume “GuieA_7” Englert 创作，来源 [Orc (3D)](https://opengameart.org/content/orc-3d)，遵循 [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。原始 Blender 文件、PNG 贴图及可编辑 XCF 位于 `SourceAssets/orc/Orc/`。`orc-sources.json` 保存下载包与五个源文件的 SHA-256，以及三个派生文件的哈希。署名随 Player 位于 `Assets/Licenses/GuieA7-Orc.txt`，模型、纹理和对应头像的派生内容沿用同一许可。

导入器将镜像的身体与战锤统一到骨架坐标系，保留原有硬边并归一化皮肤权重。两个颜色贴图拼成 2048×512 图集，骨骼导出采样原有腿部 IK 和武器挂点约束。模型为 2,278 三角形 / 40 根骨骼；待机包围盒高约 3.13 世界单位，游戏中按步兵比例缩放。原素材没有法线或粗糙度贴图，材质使用统一粗糙度 0.8。

Blender 4.5.9 重建：

```text
blender --background --disable-autoexec --python-exit-code 1 --python scripts/import-frost-orc.py
node scripts/build-frostbound.mjs
node scripts/render-frost-unit-icons.mjs
node scripts/render-frost-unit-icons.mjs --orc-sheet
```

验证：

- `scripts/test-frost-orc-import.py` 验证来源与生成文件哈希、署名、贴图、UV、四关节皮肤权重、四组加权骨骼运动，以及全部 99 个原生姿态的范围与落地情况，见 `orc-import-qa.json`。
- 两次生成的三个派生文件哈希一致，见 `orc-repro-qa.json`。
- 完整 `scripts/test-frostbound.mjs` 规则与真实 TCP 测试通过；新增覆盖兽人地图布置、兵营训练、模型/头像选择、伤害帧姿态、存档/公开状态及死亡定格。原生 QuickJS `frost_sample`：3 passed / 0 failed。
- `scripts/qa-frostbound.mjs --orc-only` 使用原生 Release 编辑器和 Agent 输入，验证选择、移动、战锤伤害、头像、战斗存档恢复及死亡；材质管线拒绝数 0，见 `native-orc-qa.json`。测试场景含部落可控兽人、静止的 80 HP 对手和被动英雄。
- `orc-poses.png` 为 12 格原生动作图；`orc-clearing.png`、`orc-combat.png`、`orc-death.png` 为实际交互截图。头像图集仍含 28 个模型。
- Windows 包 561 文件 / 250,507,112 字节，内容哈希 `ca81f028f32910ec4528124009184a6d1b0ef669bd0c92c52628e52f26adff02`。资源校验与 30 秒启动检查见 `player-smoke.json`。

本阶段未验证物理输入、音频试听、跨机器联机或新的渲染 FPS。其他部落兵种、亡灵和部分自然族美术仍待统一，完整复刻尚未完成。
