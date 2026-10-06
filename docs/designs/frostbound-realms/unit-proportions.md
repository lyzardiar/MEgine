# 单位与建筑的源模型比例

作者：MiYu

49 个经典角色条目与建筑共用资产显示尺度 `2`，并乘以原版 `Units/unitUI.slk` 的 `modelScale`。士兵、工人、英雄、骑兵、攻城单位、怪物和飞行单位保留各自源网格尺寸；动画姿态边界变化不改变对象比例。工人动作与尸体沿用同一源比例。自定义战役及塔防 Boss 保留现有 `1.5` 体型倍率。

| 源对象 | 对象 ID | modelScale | 最终比例 |
| --- | --- | ---: | ---: |
| 步兵 | hfoo | 1 | 2 |
| 兽人步兵 | ogru | 1.1 | 2.2 |
| 憎恶 | uabo | 0.9 | 1.8 |
| 狮鹫骑士 | hgry | 1.2 | 2.4 |
| 北极熊 | nplb | 0.95 | 1.9 |

血条与旗帜使用源模型在对象局部空间中的最高点 `maxY × 对象比例 + 0.5`，加上单位当前地面或飞行位置。该位置不计入地下基座和翼下空间。尺寸表中的完整包围盒高度仍包括这些空间。枪口现有局部偏移使用相同对象比例；精确动画枪口挂点仍需接入。

角色与建筑选中圈使用原版对象的 `scale` 字段，以及原始单位/英雄选中圈 MDX 的几何宽度。选中圈图案与颜色仍沿用当前着色器。两种圈的原始 MDX、源 UnitUI 依赖、49 个完整模型路径与对象 ID、生成器和输出 SHA-256 记录在 `unit-scale-sources.json`。源游戏数据沿用 Blizzard 来源及署名记录。

```powershell
python scripts/import-frost-unit-scales.py
node scripts/build-frostbound.mjs
node scripts/test-frost-unit-scales.mjs
node scripts/test-frost-visuals.mjs
node scripts/test-frost-effects.mjs
node scripts/test-frost-spell-art.mjs
node scripts/test-frost-construction.mjs
node scripts/qa-frost-building-scale.mjs --unit-scales
```

独立源数据测试验证 49 个条目及 116 个兵种/阵营显示映射，包含原版对象比例、选中圈、模型边界变化时的比例稳定性、枪口偏移与步兵相对主城的高度。独立重生成字节一致，拒绝覆盖手工修改的输出后其他文件不变。状态、技能和建造附件回归通过。

四族共 80 个角色和建筑的原生绘制验证通过，包含地面、飞行及英雄对象。验证实际可见网格、对象比例、源模型最高点对应的血条位置，以及四个选中圈。材质管线拒绝数为 0。报告见 [原生验收](native-unit-scale-qa.json)，画面见 [人族](unit-scale-human.png)、[兽族](unit-scale-orc.png)、[暗夜精灵](unit-scale-night-elf.png)、[亡灵](unit-scale-undead.png)。夹具使用暂停的稳定姿态；物理鼠标和音频未在此项中验收。

当前比例下的原生单机、游戏暂停、两个真实 TCP 客户端及断线重连回归通过。单机与两端建造附件的完整矩阵最大误差为 `8.21e-7`，两端材质管线拒绝数均为 0；重连后建造状态与附件继续正确显示。证据见 [建造与联机验收](native-construction-art-qa.json)。

原版镜头、选中圈图案、精确动画枪口与飞行高度等仍需继续完善。当前角色与建筑的对象比例已统一使用源数据。
