# 攻城坦克原件、资产与规则证据

Author: MiYu

`siege-engine.json` 保留本机《冰封王座》普通攻城坦克 `hmtt`、研究后的 `hrtt`、`Rhrt` 弹幕攻击研究及 `Srtt`／`Aroc` 能力。原件保留、确定性转换、车间生产、研究换型、双武器与弹幕战斗均已接入现有游戏架构，联机协议118。

## 来源与维护

游戏目录：`E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne`。导入按 `War3Patch.mpq`、`War3xLocal.mpq`、`War3x.mpq`、`war3.mpq` 的覆盖顺序读取，原表、MDX、BLP、转换节点信息与许可保存在 `SourceAssets/SiegeEngine/` 和 `SourceAssets/SiegeEngineEffects/`。两份 `*-sources.json` 记录每项原件的档案、大小、SHA-256及转换器摘要。

机身采用 `War3Patch.mpq` 的 `Units/Human/WarWagon/WarWagon_V1.mdx`，SHA-256为 `777a345298f07b1e5b853fc2dcd3397b38a46f039201e672fd09a4e31b2ac02f`；同目录头像 `WarWagon_V1_portrait.mdx` 的摘要为 `814d5380e87e58a78db1edf9adf1c37a253908f8b44b1c1b8f13f32b3990648a`。导入前与固定素材库核验模型及纹理摘要。

REA上游为 [morluto/rea](https://github.com/morluto/rea)，版本6.5.0，提交 `3b79af28e80785afce9f5998d8f03289402a1847`。安装与更新流程见 [引擎集成说明](../../../third_party/rea/README-MENGINE.md)。游戏原件遵循Blizzard原游戏条款，转换工具的许可独立保留。

## 原版规则

| 项目 | 源数据 |
|---|---|
| 训练 | 195金、60木、3人口、55秒；要求城堡；车间第三格 |
| 机体 | 700生命、2加强护甲、220移速、48碰撞半径；机械单位，无自然回血 |
| 视野 | 昼1400、夜800 |
| 对建筑武器 | 45–55攻城；192射程、2.1秒间隔、0.5秒前摇；instant；目标structure、debris |
| 升级后对空武器 | 13–14穿刺；500射程、2秒间隔、0.125秒前摇；900速度、0.15弧度、跟踪火箭 |
| Rhrt研究 | 50金、150木、40秒；要求城堡；快捷键G，位置(2,2) |
| Srtt换型 | 源code为Acha，UnitID1为hrtt，Requires为Rhrt |
| Aroc源字段 | Area1=500、DataA1=25、DataB1=630、DataC1=9；air、enemy |

距离按100源单位对应1世界单位换算。两形态分别保留完整武器行、发射偏移、模型属性和升级列表；未配置的普通形态第二武器弹道不填造默认值。`Rhrt` 的两个 `rtma` 效果分别指定 `hmtt/+1` 与 `hrtt/-1`，必须结合原版科技数量上限逻辑处理。`Srtt` 的Requires实际位于 `HumanAbilityStrings.txt`；导入保留该位置。

`Aroc.maximumTargets` 等归一字段保存编辑器配置值，不能直接作为已验证的运行上限；实际选敌、主目标排除和预算语义由下述原DLL证据约束。

## 模型、头像与特效

机身保留15个源序列。普通形态Stand/Walk/Attack/Death索引为0/2/4/6；alternate的Stand/Walk/Attack Two/Attack One/Death索引为7/9/11/12/14。原模型序列名称及粒子状态保持完整。原DLL的0x6f47fd80将武器索引0/1映射为动画属性44/45（one/two）；0x6f480ece选择和0x6f47bc38切换路径确认建筑武器使用索引12，对空武器使用索引11。原始MDX炮击事件与粒子轨迹独立印证该映射。

头像保留Portrait与Portrait Alternate两种序列及原透视摄影机（源FOV60度、near8、far1000）。几何和内嵌粒子使用同一序列及采样时间。`SiegeEngineImpact` 为纯粒子炮击；`SiegeEngineRocket` 保留火箭几何、2个粒子和1条拖尾；机身与头像分别保留14和3个内嵌粒子。

## REA证据

静态探针要求原 `Game.dll` SHA-256为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`，每次核对执行前后摘要、完成状态与截断状态，并保存完整Evidence。

- `0x6f57bcd0`／`0x6f57e550` 绑定 `CAbilityBarrage`／`Aroc`；`0x6f4b9480`／`0x6f4bbb10` 绑定 `CAbilityChaos`／`Acha`；`0x6f690620`／`0x6f691ae0` 绑定 `CUpgradeAddTechMaxAllowed`／`rtma`。
- `0x6f4ac3b0` 通过 `0x6f3fad70` 读取等级数据中的目标单位ID，并调用 `0x6f653220` 执行单位变更。`0x6f4ae840` 检查能力禁用计数及可用性，注册延后事件；完整状态保存与外层事件时序尚未执行验证。
- `0x6f6985d0` 读取旧科技数量上限、计算研究等级差并处理无限值 `0x7fffffff`。无限值与+1对应0；当前0与-1恢复无限值，随后调用 `0x6f24d360` 写回。不能把两个rtma值当作单位属性增减。
- `0x6f571fa0` 将触发武器上下文、范围、总预算和数量字段传给 `0x6f6b91d0`。后者收集并排序候选，调用 `0x6f6b6770` 生成弹丸；`0x6f66e820` 对枚举上下文指定的排除目标返回0。

独立复核以构造函数 `0x6f576e47` 确认真实虚表起点 `0x6fa16ab4`。普通missile路径通过 `0x6f6624a0` 调用虚表+0x150，进入弹幕；instant路径通过 `0x6f6620e0` 调用+0x154，其槽为无操作函数。因此坦克攻击建筑不触发对空弹幕。弹幕返回0后，外层攻击仍在 `0x6f477395`／`0x6f4773a6` 创建正常主弹丸。

16组原DLL CPU用例执行真实武器分派、虚表、弹幕处理、字段getter、排除谓词和数量／预算运算，确认：

- DataC=9时，循环从0开始且大于9才停止，允许10枚额外火箭；主目标明确排除。配置0不限制数量，候选不足会提前结束。
- 额外火箭沿用本次武器攻击伤害，不重新读取DataA或重新掷骰；13／14伤害分别产生130／140额外原始伤害。修改DataA25为999不改变结果，修改源攻击伤害为42则每枚都是42。
- DataB630按完整每发伤害扣减。每发100时允许7发、合计700；每发90时为7发、合计630；预算0不限制总伤害。最后一发不截成剩余预算。

CPU工具提供空间候选及其顺序、对象句柄、能力可用状态和发射回调，记录发射请求及伤害载荷；未执行原游戏完整战斗、实际弹道、碰撞、护甲、研究增益或完整目标掩码／免疫组合。来源字段、静态证据与这些用例共同约束接入实现，不能把测试替身覆盖的部分描述为原版运行结果。

## 重建与验证

```powershell
python scripts/import-frost-siege-engine.py --pose-probe D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/import-frost-siege-engine-effects.py --sampler E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/sentinel-bin/MdxExport.dll --metadata-reader E:/work/codex/worktrees/1339/MEgine/tmp/warcraft-effects/node-metadata/NodeMetadata.dll
python scripts/test-frost-siege-engine-source.py
node scripts/probe-frost-rea-siege-engine.mjs
python -m pip install --target tmp/docs-artifacts/frost-siege-engine/dependencies pefile==2024.8.26 unicorn==2.1.4
python scripts/probe-frost-siege-engine-binary.py --binary "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll" --dependencies tmp/docs-artifacts/frost-siege-engine/dependencies
$env:MENGINE_QA_ROOT='G:/work/github/MEgine/tmp/docs-artifacts/frost-siege-engine/native-qa'
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-siege-engine-assets.mjs
```

机身导入支持 `--source-sample`，特效导入支持 `--source-root`；两者使用保留原件即可在无游戏安装时重建，仍需固定转换器与素材库。先在独立 `--output` 目录验证再更新样例；已有产物摘要不符时拒绝覆盖。

236项机身／头像源输出、93项特效源输出通过摘要核验；两组来源检查验证无游戏安装时逐字节重建及两个导入器的修改输出保护。11组REA探针、16组CPU用例通过。原生独立预览18项通过，覆盖15个机身动作、两种源摄影机头像及攻击效果。255项复制资产与样例摘要一致，控制台／材质管线错误0。专用编辑器正常退出；WebView缓存因EPERM保留在专用QA目录。

证据、CPU报告和截图仅保存在 `tmp/docs-artifacts/frost-siege-engine/`。上述资产预览不证明主游戏玩法、原版完整战斗或完整复刻已完成。

## 主游戏接入与维护

车间第三格按E训练坦克，价格195金／60木／3人口／55秒；城堡建成后第11格按G研究弹幕（50金／150木／40秒）。研究与训练共用三格付费队列，支持取消退款、出口阻塞及存档继续。Rhrt完成后，现存单位及随后完成训练的单位使用hrtt形态，保留ID、生命、位置和指令；普通与升级形态共用一个运行kind，以研究状态选择原件。

普通武器只攻击建筑，按0.5秒前摇造成45–55瞬发攻城伤害。升级后对空武器按0.125秒前摇发射13–14穿刺火箭，并向其他候选目标追加弹幕；额外火箭沿用触发攻击掷骰，主目标排除、数量与预算遵循上述原DLL证据。弹幕空间查询以坦克中心排序；0x6f03ca6f加入源碰撞半径，0x6f03fc07加入目标半径，随后平方比较且相等时包含。源半径与目标半径的边界测试通过；样例沿用现有距离容差，尚未证明所有float32相切值一致。Rhar每级增加2护甲，Rhra每级给两武器各加一颗原骰子（d11／d2）。原DLL CUpgradeAttackDice处理器0x6f698800通过0x6f47aa00取得双武器掩码，再由0x6f478a70修改两组骰子；2个动画选择及5个升级CPU用例通过。

两形态身体、原摄影机头像、内嵌粒子、建筑炮击和火箭几何已接入主游戏。死亡形态按尸体保留的hmtt/hrtt原ID选择；deathType2的机械残骸不能复活。敌方联机快照隐藏研究、生产队列和武器内部状态，仅保留可见形态、攻击动画和弹丸显示字段。旧存档缺失siegeEngineVersion时保留旧生产列表；协议117客户端被118服务器拒绝。

```powershell
node scripts/build-frostbound.mjs
node scripts/test-frost-siege-engine.mjs
node scripts/test-frost-siege-engine-client.mjs
node scripts/test-frost-siege-engine-network.mjs
python scripts/probe-frost-siege-engine-animation.py
node scripts/qa-frost-siege-engine.mjs
node scripts/test-frostbound.mjs
```

本次来源验证2组、玩法7组、生成客户端及真实TCP通过。原生主游戏3组验收覆盖E/G城堡条件、完整40／55秒生产研究、F5恢复、两形态机身与头像、双武器动画、原件炮击／火箭及飞行存档命中；控制台错误0。原生编辑器正常退出，专用G盘WebView缓存因EPERM保留。运行报告为 `tmp/docs-artifacts/frost-siege-engine/native-siege-engine.json`，原DLL动画／升级证据为同目录 `rea/animation-source-cpu.json`。

原版完整研究事件时序、所有单位状态的Chaos转换、完整空间候选／免疫掩码、粒子求解器和全部玩法仍需继续对照；本阶段验证不代表完整1:1复刻完成。

完整主回归 `node scripts/test-frostbound.mjs` 退出码0，共785条PASS记录，包含24,000帧AI验证；日志为 `tmp/docs-artifacts/frost-siege-engine/regression-final.log`。
