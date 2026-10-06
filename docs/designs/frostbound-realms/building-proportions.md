# 建筑模型比例

作者：MiYu

45 个经典建筑条目保留源网格的相对尺寸，并使用原版 `Units/unitUI.slk` 的 `modelScale`。游戏内建筑共用显示尺度 `2`，最终比例为 `2 × modelScale`；建筑高度由当前源模型边界和最终比例计算。碰撞半径和建造占地继续使用现有玩法规则，独立于模型显示尺寸。

大厅、兵营、农场、祭坛、商店与防御塔使用各自源模型的体量。主城升级保留源网格变化；生命之树、远古之树、永恒之树的对象比例分别为 `1`、`1.15`、`1.30`。拔根形态保持对应等级的对象比例。血条与旗帜跟随实际模型高度；建造预览和内置 Birth 附件共用同一宿主比例。

| 人族建筑 | 宽度 | 高度 | 深度 |
| --- | ---: | ---: | ---: |
| 城镇大厅 | 5.62 | 7.76 | 5.72 |
| 城堡 | 6.18 | 8.89 | 5.82 |
| 农场 | 2.58 | 3.65 | 2.39 |
| 防御塔 | 2.31 | 5.10 | 2.05 |

这些值采用各模型当前 Stand 边界。动画自身的变形保留在源网格中。

完整包围盒高度包含地下部分；血条与旗帜使用局部最高点 `maxY` 计算地上位置。角色与建筑共用资产显示尺度，见 [单位与建筑的源模型比例](unit-proportions.md)。

来源按 `war3.mpq`、`War3x.mpq`、`War3xLocal.mpq`、`War3Patch.mpq` 优先级读取，当前有效源为 `War3Patch.mpq`。原始 SLK 字节、完整模型路径、对象 ID、导入器和生成文件 SHA-256 均保留在 `building-scale-sources.json`。这些数据属于原 Warcraft III 游戏资产，沿用项目的 Blizzard 来源及署名记录。

```powershell
python scripts/import-frost-building-scales.py
node scripts/build-frostbound.mjs
node scripts/test-frost-visuals.mjs
node scripts/test-frost-construction.mjs
node scripts/qa-frost-building-scale.mjs
```

资产独立重生成字节一致，修改输出的覆盖保护通过。经典视觉测试覆盖四族、主城三级、建造预览材质、动画与源资产哈希；状态特效、技能特效与建造附件回归通过。

Release 原生编辑器中的四族共 36 个建筑绘制验证通过，核对全部当前可见网格部件的真实 Transform、对应源网格和血条高度，材质管线拒绝数为 0。报告见 [原生验收](native-building-scale-qa.json)，画面见 [人族](building-scale-human.png)、[兽族](building-scale-orc.png)、[暗夜精灵](building-scale-night-elf.png)、[亡灵](building-scale-undead.png)。这组夹具用于并排查看三级主城与普通建筑，物理鼠标和音频未在此项中验收。
