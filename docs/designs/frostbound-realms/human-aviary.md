# 狮鹫笼原件、模型与规则证据

Author: MiYu

本阶段保留人族狮鹫笼 `hgra`、狮鹫骑士 `hgry`、龙鹰骑士 `hdhw`，以及风暴战锤 `Rhhb/Asth`、乌云 `Rhcd/Aclf`、空中锁镣 `Amls` 的原件、规则、动画、头像和效果。生产、研究、技能与战斗接入属于后续阶段；本阶段资产收据标记 `runtimeIntegrated=false`。

## 来源与维护

游戏安装位于 `E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。原件按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 的优先级读取；保留原始字节、档案名称、SHA-256、转换器摘要及许可证。`SourceAssets/HumanAviary/` 保存规则、模型、纹理及节点信息；效果和模型粒子分别位于 `SourceAssets/HumanAviaryEffects/`、`SourceAssets/HumanAviaryParticles/`。对应的三份 `human-aviary*-sources.json` 用于核对与离线重建，导入器在写入前拒绝覆盖修改后的生成产物。

REA上游为 [morluto/rea](https://github.com/morluto/rea)，6.5.0，固定提交 `3b79af28e80785afce9f5998d8f03289402a1847`；引擎安装、更新与MCP入口见 [集成说明](../../../third_party/rea/README-MENGINE.md)。模型转换器上游为 [Darithos/W3ModelViewer](https://github.com/Darithos/W3ModelViewer)，固定提交 `4fe46a0772520fc7b55078bf32cda1237d1b5f2e`。游戏原件遵循原游戏条款，转换器MIT许可随输出保留。

## 源规则

| 内容 | 原始配置 |
|---|---|
| 狮鹫笼 | 140金、150木、75秒，1200生命、5加强护甲；要求主城及伐木场；G建造 |
| 狮鹫骑士 | 280金、70木、4人口、45秒；要求城堡；825生命、0轻甲、320移速；G训练 |
| 狮鹫地面武器 | 45–55魔法伤害，450射程，2.2秒间隔、0.8秒前摇；mline穿透弹道 |
| 狮鹫空中武器 | 45–55魔法伤害，450射程，2.4秒间隔、0.8秒前摇；missile |
| 龙鹰骑士 | 200金、30木、3人口、28秒；要求神秘藏宝室；575生命、1轻甲、350移速；D训练 |
| 龙鹰武器 | 18–20穿刺伤害，300射程，1.75秒间隔、0.43秒前摇；1100速度、0.15弧度、跟踪弹道 |
| 风暴战锤研究 | 125金、225木、45秒，要求城堡；H；rasd效果、base1=200 |
| 乌云研究 | 50金、100木、35秒，要求神秘藏宝室；C |
| 乌云 | 100魔法、20秒冷却、30秒持续、1000施法距离、300半径；目标structure/vuln/invu |
| 空中锁镣 | 75魔法、30秒冷却、550施法距离、30每秒伤害；普通40秒、英雄10秒；目标air/enemy/organic |

距离以100源单位对应1世界单位转换。原始列、缺值和Func/Strings均保留。狮鹫的Missileart、Missilearc、Missilespeed仅有一项，未配置MissileHoming；第二武器归一字段为null表示没有独立配置。原DLL的getter将索引限制到count-1，因此空中武器复用首项模型、速度和弧度；空homing列表返回0。归一数据保留源缺值，接入时按该运行规则处理。

## 模型与效果

狮鹫笼、狮鹫和龙鹰分别保留6、7、10个源动作；建筑头像使用机身内Portrait和原Camera01，两飞行单位使用各自独立头像及源摄影机。模型键为 `KingdomGryphonAviary`、`ClassicGryphon`、`ClassicDragonHawk`；独立目录避免修改现有主游戏绑定。

战锤弹丸保留几何与粒子，命中效果、龙鹰弹丸和乌云为源模型中的纯粒子效果。锁镣目标特效保留9个几何动画序列；光束另保留 `LightningData.slk` 的 `LEAS` 行和原 `lariatCaught.blp` 纹理。`Bclf/Xclf/Bmlc/Bmlt` 的源Buff与音效引用均保留。

建筑、狮鹫和龙鹰的内嵌粒子与身体动画同步。龙鹰死亡还引用 `SharedModels/Feather2`、`Bones1`、`Gutz1`、`Feather1` 四个模型，独立导入并绑定到原PREM节点。两独立头像没有源粒子节点。采样转换保留源数据与依赖，不代表原Warcraft粒子求解器完全一致。

## REA证据

原 `Game.dll` SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA静态反汇编确认：

- `Rhhb.effect1=rasd` 对应 `CUpgradeAttackSpillDistance`，类标识 `0x6f6906c0`；处理器 `0x6f698980` 计算等级差并以mask=-1调用 `0x6f478b50` 更新穿透距离。`Asth` 对应 `CAbilityStormHammers`，源要求为Rhhb，技能自身无Data参数。
- mline分派 `0x6f47762f` 经 `0x6f479f50` 构造B-Ml，类为 `CMissileLine`（`0x6f6b4910`）。地面使用此路径，空中武器为普通missile。
- art、arc、speed的getter分别为 `0x6f3246d0`、`0x6f325670`、`0x6f3256f0`，将槽索引限制在列表末项；homing getter `0x6f3256c0` 对空列表返回0。攻击虚方法 `0x6f47b4a0/0x6f47b4f0/0x6f47b4d0` 使用 `CAbilityAttack+0x2b8` 中的当前武器槽。
- 主目标伤害独立处理，secondary filter排除同一主目标。碰撞回调 `0x6f6af320` 先将当前伤害乘以 `(1-damageLoss)`，再检查目标有效性；不能直接实现为仅成功命中才衰减。

7组可重复REA探针通过，均验证原DLL摘要、正常完成和输出未截断。原DLL x86 CPU另通过3组研究等级变化、3个单项列表索引（0/1/7）和实际第二武器arc/speed/homing调用链。解析后的列表、模型指针和升级对象由测试提供；单位UI解析器与属性setter使用明确回调，原getter、等级运算和双槽更新循环执行原机器码。

碰撞事件顺序、重叠目标、非法候选、护甲及完整技能通道尚需原运行行为对照。上述证据用于约束后续实现，不表示已运行原游戏完整战斗。

## 重建

```powershell
python scripts/import-frost-human-aviary.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-human-aviary-particles.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/farseer-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-human-aviary-effects.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/farseer-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-human-aviary-source.py
node scripts/qa-frost-human-aviary-assets.mjs
node scripts/probe-frost-rea-human-aviary.mjs
python scripts/probe-frost-human-aviary-cpu.py
```

CPU检查使用pefile和Unicorn，沿用 `tmp/docs-artifacts/frost-siege-engine/dependencies` 中的依赖；可通过 `python -m pip install --target tmp/docs-artifacts/frost-siege-engine/dependencies pefile unicorn` 准备。CPU结果为 `rea/cpu-results.json`，静态证据索引为 `rea/rea-summary.json`。

二进制路径可通过参数替换，必须支持原PREM模型粒子；收据记录实际二进制摘要。离线重建先恢复身体、再模型粒子、最后特效。完整Evidence、原生截图与临时测试产物统一位于 `tmp/docs-artifacts/frost-human-aviary/`。

## 验证结论

来源检查覆盖638项签名输出、三组离线逐字节重建、三个导入器的修改保护及原件篡改拒绝。原生独立预览46项通过：23个主体动作、4个头像姿态（3套源摄影机）、19个独立效果动作；508项运行资产复制摘要与收据一致。已目视检查建筑、头像、龙鹰攻击／死亡模型粒子、乌云和锁镣截图，控制台错误及材质拒绝均为0。

专用原生编辑器正常退出；G盘WebView运行缓存因EPERM保留。报告为 `tmp/docs-artifacts/frost-human-aviary/native-assets.json`，来源结论为同目录 `source-verification.json`。本阶段没有修改或验收主游戏生产、战斗与技能接入，不以资产预览代替完整游戏回归。
