# 剑刃风暴、地震与巫毒

2026-10-28。AOww、AOeq/SNeq和AOvd已连接实际状态和消费者；必要Win32 Release产品编译无警告，新增运行、原版精度、UI/GPU与性能保留阶段集中验证。

| 原能力 | 实际接入 | 源代表值 |
| --- | --- | --- |
| AOww剑刃风暴 | 限时、可移动的独立状态；附近地面单位/建筑与源debris受伤，正常攻击/其他施法与物品使用受限，魔法保护进入能力/目标/伤害消费者 | Dur1=7秒、HeroDur1=5、范围200、DataA=110每秒、DataB=0、200MP、冷却180秒、BOww |
| AOeq/SNeq地震 | 可取消的持续施法；源延迟后按当前区域对建筑和源tree/debris积分伤害，并对合法单位应用移动减速；区域从Area插值到DataD | Dur1=25秒、DataA=0.5秒、DataB=50每秒、DataC=0.75、Area/DataD=250、150MP、冷却90秒、BOeq/BOea、XOeq |
| AOvd巫毒 | 持续保护范围内友军，施法者自己不受本来源保护；可由其他施法者保护，进出范围与取消更新真实无敌判定 | Dur1=30秒、范围800、200MP、冷却180秒、BOvd/BOvc |

`session_hero_ultimates.cpp`消费源等级、目标掩码、资源、时限、减速和效果别名。原学习/命令/图标/热键/提示/冷却沿用spellInfo及abilityCommands；旋转期间技能按钮同步禁用，保留移动/追随/攻击移动与停止。普通攻击由weaponTarget/attackUnit阻止，已经发出的投射物继续结算。原模型包含的 `Attack Walk Stand Spin` 直接作为站立/行走/攻击时的旋转序列，结束恢复普通序列。

剑刃风暴在效果阶段完成施法事件，独立BOww状态继续计时。持续时间采用源Dur1，与原技能说明一致；技能参数保存施放等级和归属，移除能力/状态、死亡、变形或归属变化释放效果，暂停停止时间推进。每步按min(delta, remaining)积分伤害，再由统一buff时钟到期移除，避免漏掉尾帧。当前将DataB解释为魔法伤害乘数，0进入魔免；伤害走Spells/Enhanced分类，排除虚无目标。该分类、魔免/减伤/护盾/建筑与英雄系数仍需原件行为对照。

地震和巫毒使用现有Channel生命周期，停止/替换命令、控制、死亡、删除、隐藏、变形、能力移除或归属变化按已有调用链取消。受影响单位的状态保存每个施法者及施法票据；离开区域/取消仅移除对应来源，最后来源退出才销毁状态和附件。多个地震来源取剩余来源的最大减速；多个巫毒来源共享无敌状态。范围状态当前物理且不可普通驱散，脚本直接移除后在下一次有效范围更新时重新附加。

地震按1/32秒模拟步进计算延迟后的实际伤害，非建筑单位只减速；树木/碎片按源掩码受伤。当前直接消费源掩码未限定的关系，因此友伤/中立、魔免、建筑类别、减速/驱散、效果延迟与伤害事件间隔均保留原件精度待核对。巫毒固定排除本施法者，目标筛选共享范围法术逻辑并允许魔免友军。持续判定使用同一技能定义，避免逐个目标复制完整定义；伤害回调后按来源/票据重查，失效则停止后续效果。

地震XOeq的Effectart读取原 `Abilities\Spells\Orc\EarthQuake\EarthQuakeTarget.mdl`；巫毒BOvc施法者模型与BOvd目标附件、地震BOeq减速附件进入共享特效生命周期。循环声音、全部特效尺度/地面显示、状态图标和实际窗口还原仍待完成/验证。本次没有实现AUls/AOls蜂群、重生及其他未列出的终极技能。

## 来源与验证

只读安装 `E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne`，版本1.27.0.52240。元数据Oww1/Oww2与Oeq1–4说明每秒伤害、魔法伤害减少、效果延迟、建筑伤害、单位降速及最终区域；原技能说明明确巫毒不保护自身，持续秒数引用Dur1。

| 原成员 | 归档 | SHA256 |
| --- | --- | --- |
| Units/AbilityData.slk | War3Patch.mpq | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | War3Patch.mpq | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/OrcAbilityFunc.txt | War3Patch.mpq | 9480b5fe482c3df2e966db5203b37899bf5a3771c2c241fb2c77abe51615623b |
| Units/OrcAbilityStrings.txt | War3Patch.mpq | c5b56eedb803bafcb69ca3126a2d4ac114dc63542f7599cc513d599b96f5d4cb |
| Units/Orc/HeroBladeMaster/HeroBladeMaster.mdx | war3.mpq | b5a2700e41c30a8dc6428d1d2ee5e4b20e890234af2843d4c7b7c3a03643d7e7 |

提取脚本/源行与模型序列证据、编译日志、差异审核记录和产品摘要放 `tmp/docs-artifacts/war3/hero-ultimates/`。本次做必要产品编译、差异检查及限定生命周期的独立只读审核，没有运行新专项、三图、原件指令、GPU或性能测试。以上来源与实现不代表二进制行为已完成核对；完整场景和缺口在[测试队列](testing-batches.md)。
