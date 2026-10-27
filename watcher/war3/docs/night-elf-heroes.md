# 灼热之箭、侦察与复仇之魂

2026-10-28。AHfa/ACsa、AEst、AEsv与Avng及地图派生已连接原按钮/命令、实际攻击、可操控飞行单位、视野/侦测和尸体召唤。运行、原版一致性、完整UI/GPU/AI/音效与性能留功能阶段集中验证。

| 原能力 | 实际消费 | 本机1.27源参数 |
| --- | --- | --- |
| AHfa灼热之箭 | 单次目标攻击、自动开关、实际攻击发射支付/冷却、伤害和原弹道 | 三级+10/+20/+30伤害，8MP，600范围，1500弹速 |
| AEst侦察 | 创建真实可操控猫头鹰、替换旧召唤、定时生命、普通飞行移动、昼夜视野和真视 | nowl/now2/now3，60/90/120秒；视野1000/1500/2200，100MP、20秒冷却；Adtg范围900、侦测掩码3 |
| AEsv复仇之魂 | 创建真实复仇天神、替换/生命周期、原单位武器/魔法免疫/自动尸体召唤 | espv，180秒，150MP、180秒冷却；1200生命、400魔法 |
| Avng复仇 | 复用真实尸体、数量索引/自动开关、实际小精灵/事件、上限与天神死亡连带 | 每尸体1个even，最多6个，50秒、25MP、2秒冷却、900区域；even源Avul，DataF=1 |

## 攻击与命令

attackEnhancement将灼热之箭接到既有Orb of Annihilation实际攻击入口。原注册852173为flamingarrowstarg单次目标攻击，852174/852175为flamingarrows/unflamingarrows自动开关。命令区、右键切换、脚本订单及自动攻击共用同一消费。

普通攻击追击/前摇完成且目标有效时，launchAttack再次检查能力、魔法、冷却、科技和可用状态，支付8MP并把本次武器定义和伤害写入CombatProjectile。灼热之箭加到实际武器伤害，沿用伤害类型、护甲、命中/闪避、击杀和事件；使用原SearingArrow模型/速度/跟踪设置，并保留当前武器形态。已经发射的攻击保留快照，后续技能增删/等级或自动开关不改变该弹道；取消前摇不扣费。缺蓝的自动攻击沿用现有普通攻击回退。

当前伤害奖励在攻击准备/暴击等既有加成之前合入武器；原版奖励的分类/暴击、与其他法球/吸血/装备的叠加优先级及手动订单失败语义仍待对照。新增AHfa消费者不代表已完成全部攻击特效和法球。

## 侦察和复仇

AEst和AEsv复用summonSpell，按源UnitID创建真实单位，沿用合法落点、原句柄/库存/人口、召唤事件、模型/武器与定时生命。当前同施法者同能力的新召唤替换旧召唤；替换上限/时序仍需原件验收。共享召唤流程增加施法票据、死亡轮次和归属轮次复查，避免旧召唤死亡事件或创建回调使新生命/新归属继续消费旧施法。

猫头鹰的飞行、高度、移动速度和昼夜视野来自实际nowl/now2/now3定义。Avul/ACmi分别进入原无敌/魔免能力查询；Adtg原型为已支持的Atru，因此直接进入现有空间侦测和战争迷雾/联盟共享消费。到期/死亡/移除沿用统一单位/视野清理。原出生弹道、完整出生过渡/声音和画面仍待完成或验收。

复仇天神espv的UnitAbilities.auto=Avng在初始化时启用实际自动施放。Avng与腐尸甲虫共用cappedCorpseSummon及每施法者/能力的有界索引，源DataC/DataD保持单位类型，DataA/DataB为数量、DataE为上限、DataF为死亡连带。最大数量、尸体可用性/独占、空间、费用和冷却均有实际消费者。Raiu/UnitID是召唤数量限制检查的类型字段，原Avng为空；非空计数类型及完整限制语义仍待完成。原852521/852522/852523/852524对应vengeance/vengeanceon/vengeanceoff/vengeanceinstant。

小精灵沿用even的真实无敌、武器、移动与50秒定时生命。天神普通死亡、到期或移除通过killDependentSummons结束已登记的小精灵；小精灵移除释放索引，死亡释放存活名额。自定义重生、所有权变更、多层依赖、尸体搜索/施法范围和事件顺序仍留阶段对照。espv的Asp1球体表现、Arsk抗性皮肤的全部规则、AI主动选择、完整声音/UI/GPU及三图长期玩法继续待实现或验收。

## 来源与验证

只读安装E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne，1.27.0.52240。以下成员摘要用于维护；未提交原游戏资源，运行不依赖Game.dll。

| 成员 | 归档 | SHA256 |
| --- | --- | --- |
| Units/AbilityData.slk | War3Patch.mpq | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | War3Patch.mpq | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/NightElfAbilityFunc.txt | War3Patch.mpq | 20e3bf670536d1a17cfbac0f40fb0cf28d4fcd69a6805f036c2845723e8cf87a |
| Units/UnitAbilities.slk | War3Patch.mpq | 156052e0f5c7d8b69c2e299a8d975d94bffd64731b65fbac194a712a706e9410 |
| Units/UnitBalance.slk | War3Patch.mpq | ab1a8cfbebcb2abe68535b170117730726249c5fafef15c13695400d4b0a3327 |

必要Win32 Release产品编译通过，无警告，差异检查通过。本地源读取脚本、选中原表行、编译日志及产品receipt位于tmp/docs-artifacts/war3/night-elf-heroes/。构建命令为cmake --build watcher/war3/build/windows-x86 --config Release --target war3 -- /m:1 /nologo /v:minimal，仅构建当前产品及必要依赖。没有在实现阶段执行新专项、三图、原版运行对照、UI/GPU或性能回归；见[阶段待测队列](testing-batches.md)。
