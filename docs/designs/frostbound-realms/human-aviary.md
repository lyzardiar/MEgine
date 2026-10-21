# 狮鹫笼生产、战斗、技能与来源维护

Author: MiYu

本阶段保留人族狮鹫笼 `hgra`、狮鹫骑士 `hgry`、龙鹰骑士 `hdhw`，以及风暴战锤 `Rhhb/Asth`、乌云 `Rhcd/Aclf`、空中锁镣 `Amls` 的原件、规则、动画、头像和效果。生产、研究、双武器、风暴战锤、乌云及空中锁镣已接入主游戏；三份资产收据标记 `runtimeIntegrated=true`、`originalRuntimeVerified=false`。当前联机协议为120。

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

狮鹫笼、狮鹫和龙鹰分别保留6、7、10个源动作；建筑头像使用机身内Portrait和原Camera01，两飞行单位使用各自独立头像及源摄影机。模型键为 `KingdomGryphonAviary`、`ClassicGryphon`、`ClassicDragonHawk`，主游戏使用这些源模型及头像。

战锤弹丸保留几何与粒子，命中效果、龙鹰弹丸和乌云为源模型中的纯粒子效果。锁镣目标特效保留9个几何动画序列；光束另保留 `LightningData.slk` 的 `LEAS` 行和原 `lariatCaught.blp` 纹理。`Bclf/Xclf/Bmlc/Bmlt` 的源Buff与音效引用均保留。

建筑、狮鹫和龙鹰的内嵌粒子与身体动画同步。龙鹰死亡还引用 `SharedModels/Feather2`、`Bones1`、`Gutz1`、`Feather1` 四个模型，独立导入并绑定到原PREM节点。两独立头像没有源粒子节点。采样转换保留源数据与依赖，不代表原Warcraft粒子求解器完全一致。

## REA证据

原 `Game.dll` SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。REA静态反汇编确认：

- `Rhhb.effect1=rasd` 对应 `CUpgradeAttackSpillDistance`，类标识 `0x6f6906c0`；处理器 `0x6f698980` 计算等级差并以mask=-1调用 `0x6f478b50` 更新穿透距离。`Asth` 对应 `CAbilityStormHammers`，源要求为Rhhb，技能自身无Data参数。
- mline分派 `0x6f47762f` 经 `0x6f479f50` 构造B-Ml，类为 `CMissileLine`（`0x6f6b4910`）。地面使用此路径，空中武器为普通missile。
- art、arc、speed的getter分别为 `0x6f3246d0`、`0x6f325670`、`0x6f3256f0`，将槽索引限制在列表末项；homing getter `0x6f3256c0` 对空列表返回0。攻击虚方法 `0x6f47b4a0/0x6f47b4f0/0x6f47b4d0` 使用 `CAbilityAttack+0x2b8` 中的当前武器槽。
- 主目标伤害独立处理，secondary filter排除同一主目标。碰撞回调 `0x6f6af320` 先将当前伤害乘以 `(1-damageLoss)`，再检查目标有效性；不能直接实现为仅成功命中才衰减。

7组可重复REA探针通过，均验证原DLL摘要、正常完成和输出未截断。原DLL x86 CPU另通过3组研究等级变化、3个单项列表索引（0/1/7）和实际第二武器arc/speed/homing调用链。解析后的列表、模型指针和升级对象由测试提供；单位UI解析器与属性setter使用明确回调，原getter、等级运算和双槽更新循环执行原机器码。

新增56份有界REA证据及原DLL CPU探针确认：非跟踪弹道采用二次方程较大根，穿透终点在提前量计算前缓存；主目标先受伤，延伸监听首次及后续查询间隔均为0.2秒。相切不算进入，候选半径最小为1源单位；所有新接触先衰减，再筛选目标。网格每格256源单位，按Y/X递增遍历，同格最近进入者在前，新接触通知反序；持续重叠不重复通知。引擎保存网格进入序号及实际移动速度，并校验读档顺序；这些私有字段不发给敌方。

乌云DataA=2经 `0x6f4ac650 → 0x6f4bdb50 → 0x6f49c650` 进入Bclf攻击限制，`UI/UnitEditorData.txt` 的silenceFlags枚举确认bit1为远程攻击。已有Bclf增加引用计数，支持重叠乌云。引擎中停止一个施法者不会解除其他乌云仍在维持的限制。

空中锁镣保存施法者与目标配对，禁止目标移动、攻击和执行新指令；施法者停止、死亡、受控或目标死亡／落地会清理通道。原Bmlt初始化请求首次延迟0.01秒，两个伤害事件分支都请求下一次间隔1秒，再发送本次伤害。DataA30经能力等级getter、buff字段和伤害描述构造原值传入目标伤害入口；引擎按源spells护甲系数结算每次30伤害，在0.1秒固定步长中于通道年龄0.1、1.1……39.1秒触发，共40次，保存恢复保持相位。

周期常量 `0x6fbb81d8` 由CRT初始化表 `0x6f94ebcc → 0x6f001b30 → 0x6f053b90` 写为float1。CRT入口 `0x6f7718b4` 将包含该项的表区间交给MSVCR120 `_initterm`，Bmlt虚表 `0x6fa3e3b4+0x35c` 的 `0x6f4c7540` 读取该值。12组REA通道探针及原DLL CPU探针验证首次／重复计时与15／30／60三种原值伤害传递；CPU执行真实构造器、getter、buff初始化、事件和伤害描述构造，源等级数据、单位状态、计时接收端及最终生命／护甲入口由测试提供。原调度器量化、实际对局及完整护甲／免疫路径未验收。

乌云目标筛选补证：原token表将vuln／invu／structure合成 `0x300008`；原归一化器 `0x6f68c7b0` 为缺失的关系位补齐 `0x1f000`，`0x6f68a650` 对该组合直接通过。原effect过滤器 `0x6f4a17d0` 的 `+0xcc` 指向返回0的 `0x6f4bf1f0`，不会额外按联盟直接放行。48组CPU用例执行原effect、单位类别组合与目标校验：给定保留的源掩码，三个owner、可伤害／无敌的存活建筑通过；死亡建筑、ground、air、ward被排除。原数据加载器及最后的能力免疫／事件检查未执行，不能由此宣称完整技能目标流程已经验收。

乌云bit1限制进入攻击对象 `+0x228`；原 `0x6f47c060 → 0x6f47bfc0` 读取当前武器槽的类型码与伤害标志，不读取弹丸速度。双槽180组CPU用例确认：类型码2至8且伤害标志不为1／64／128／256时禁止攻击。该探针直接提供类型码和伤害标志，原字段加载映射尚未闭合；现有引擎使用弹丸速度判断远程限制，完整等价性仍需继续验证。结果在 `tmp/docs-artifacts/frost-human-aviary/cloud-targets/cpu.json`。

原游戏完整对局未运行。乌云源目标表没有enemy项，当前按structure/vuln/invu覆盖双方建筑；原加载器默认阵营位、完整免疫组合、锁镣对既有其他技能的精确中断语义仍需对照。实际移动速度使用引擎位移差分，未复现原速度访问器；float32相切、弹道终点与最后接触同时发生的事件次序也未完全确认。

## 重建

```powershell
python scripts/import-frost-human-aviary.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-human-aviary-particles.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/farseer-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-human-aviary-effects.py --sampler G:/work/github/MEgine/tmp/warcraft-effects/aviary-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-human-aviary-source.py
node scripts/qa-frost-human-aviary-assets.mjs
node scripts/probe-frost-rea-human-aviary.mjs
python scripts/probe-frost-human-aviary-cpu.py
python scripts/probe-frost-rea-human-aviary-cpu.py
node scripts/probe-frost-rea-human-aviary-channels.mjs
python scripts/probe-frost-rea-aviary-channels-cpu.py
python scripts/probe-frost-rea-cloud-targets-cpu.py
node scripts/test-frost-human-aviary.mjs
node scripts/test-frost-human-aviary-client.mjs
node scripts/test-frost-human-aviary-network.mjs
node scripts/test-frostbound.mjs
$env:MENGINE_QA_ROOT='G:/work/github/MEgine/tmp/docs-artifacts/frost-human-aviary/native-qa'
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-human-aviary.mjs
```

CPU检查使用pefile和Unicorn，沿用 `tmp/docs-artifacts/frost-siege-engine/dependencies` 中的依赖；可通过 `python -m pip install --target tmp/docs-artifacts/frost-siege-engine/dependencies pefile unicorn` 准备。CPU结果为 `rea/cpu-results.json`，静态证据索引为 `rea/rea-summary.json`。

乌云使用采样器 `--effects-continuous`，让Stand预热并将存活粒子带入Death；0.333秒Stand不再每次循环清空寿命3／4.5秒的粒子。新采样器可用以下命令构建，默认效果采样行为保持兼容：

```powershell
dotnet build scripts/warcraft-assets/MdxExport.csproj -c Release -o tmp/warcraft-effects/aviary-bin -p:Wc3Core=G:/work/github/MEgine/tmp/warcraft-converter/4fe46a0772520fc7b55078bf32cda1237d1b5f2e/upstream/src/Wc3ModelViewer.Core
```

二进制路径可通过参数替换，必须支持原PREM模型粒子及乌云连续采样；收据记录实际二进制摘要。离线重建先恢复身体、再模型粒子、最后特效。完整Evidence、原生截图与临时测试产物统一位于 `tmp/docs-artifacts/frost-human-aviary/`。

## 验证结论

来源检查覆盖639项签名输出、三组离线逐字节重建、三个导入器的修改保护及原件篡改拒绝。原生独立预览46项通过：23个主体动作、4个头像姿态（3套源摄影机）、19个独立效果动作；508项运行资产复制摘要与收据一致。已目视检查建筑、头像、龙鹰攻击／死亡模型粒子、乌云和锁镣截图，控制台错误及材质拒绝均为0。

专用原生编辑器正常退出；G盘WebView运行缓存因EPERM保留。报告为 `tmp/docs-artifacts/frost-human-aviary/native-assets.json`，来源结论为同目录 `source-verification.json`。资产预览结论保留用于定位源模型问题；主游戏验收另见下文。


## 主游戏接入与验证

G建造狮鹫笼，D/G训练龙鹰／狮鹫，C/H研究乌云／风暴战锤。生产研究共用三格队列，原价、时间、前置条件与取消退款进入权威模拟；驯兽术及三级攻击／护甲升级作用于现存和新生单位。客户端提供E/C技能、魔法与冷却、研究锁定、双武器面板、源动作／头像／弹丸和LEAS光束。场景原3806个实体保持不变，追加6个效果实体。

玩法12组、生成客户端、真实TCP和来源离线重建检查通过；当前协议120，TCP覆盖协议119拒绝、所有权、共享队列、重连、双方弹道、技能开销、通道伤害、停止及可见性隐私。乌云只在可见区域发送效果，敌方不接收锁镣目标ID、冷却及私有碰撞记录。严格存档校验覆盖通道配对、网格唯一序号、状态时钟和未完成弹道。

最终完整回归及原生验收结果记录在工作日志。所有原始日志、图像与报告位于 `tmp/docs-artifacts/frost-human-aviary/`；`integration/source-final.log` 为来源检查，`leash-timing/regression.log` 为当前完整回归，`native-human-aviary.json` 为主游戏原生报告。

共享导入器升级同时更新24份既有资产收据的工具摘要及一处依赖摘要，未修改其资产输出。默认效果路径由攻城坦克离线重建验证，默认模型／粒子路径由先知两组逐字节重建验证。先知完整来源测试另有既存血法师脚本摘要失配，详见工作日志。
