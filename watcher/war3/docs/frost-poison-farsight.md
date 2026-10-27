# 霜冻护甲、暗影突袭与透视

2026-10-28。AUfa/AUfu及派生、AEsh/ACss和AOfs已接入实际属性、命中、持续状态与视野；必要Win32 Release产品编译无警告，运行、原版精度、完整UI/GPU、AI及性能留阶段集中验证。

| 原能力 | 实际接入 | 源一级代表值 |
| --- | --- | --- |
| AUfa/AUfu霜冻护甲 | 原目标/施法与自动开关、正面护甲状态、被普通近战命中时让攻击者受寒，独立两段时限 | DataA=45秒护甲、DataB=+3防御；Dur/HeroDur=5秒受寒，40MP、2秒冷却、800范围 |
| AEsh暗影突袭 | 原有机/空地/敌方掩码、1200速度弹道、初伤、BEsh持续中毒及移动/攻速恢复 | DataE=75初伤、DataA=10每次周期伤害、Cast=3秒周期、Dur=15.1秒、移动因素0.5、DataD=3、75MP/8秒冷却 |
| AOfs透视 | 原学习/按钮/命令与费用，场景或小地图选点，局部视野与侦测及源区域模型 | 75MP、600区域、8秒、DataA=3侦测掩码、99999施放范围，区域效果Xbdt |

`session_frost_poison.cpp`读取源能力和等级参数，地图覆盖沿用共享ObjectData。霜冻护甲直接进入防御点数消费者；收到攻击前保存有效护甲定义，普通近战命中后按原Dur/HeroDur给攻击者附加Bfro。默认受寒比例来自既有Misc的FrostMoveSpeedDecrease/FrostAttackSpeedDecrease；明确不把护甲加给攻击者。远程、闪避和无效目标不触发受寒；普通命中即使最终伤害为0也可触发。致死命中可使用命中前护甲快照，攻击者自身经历死亡重启时不附加旧受寒。物理/魔免/无敌与致死时序的精确规则仍待原件对照。

AUfu及带源开关的派生进入既有自动施放选择和原图标/右键开关。候选需要尚未有有效护甲且正被敌方攻击命令指向，再按受伤程度、距离和句柄排序；攻击目标集合与现有空间扫描一起建立，避免为每个候选重复遍历全场。手动AUfa仍沿用同一真实消费者。自动施放的原阈值、距离、刷新和订单恢复精度待验证。

暗影突袭在弹道命中时先结算初伤，只有目标仍在同一死亡轮次且存活，才附加BEsh。初伤当前使用Spells/Enhanced，虚无目标不受初伤；周期伤害走既有Spells/Magic及真实免疫/护盾/减伤/事件。源数据固定Cast为伤害周期，保留原施法前摇，未将3秒误作施法等待。状态保存施放等级与定义来源，不依赖目标持有该技能；同ID更新替换状态/周期，死亡、驱散、到期和移除沿用共享清理。

当前把DataD作为速度恢复的时间步长，在每个步长按剩余总时限线性减小源移动/攻速降低量；这是待原件核对的恢复公式，不能声称已达到1.27精度。负伤害/负速度等非原版正值配置明确拒绝。Buff时钟按源周期生成伤害，不对不足一个周期的尾段额外补伤害。共享状态伤害队列保存目标死亡轮次，前一项伤害触发变蛋、重生或死亡事件同步复活后，后续旧状态伤害不继续命中新生命。

透视复用RevealArea：读入源侦测掩码，影响实际战争迷雾/隐形与地下侦测，共享既有联盟视野规则；施法者离开或死亡不取消已经创建的区域。AOfs的Xbdt读取原 `Abilities\Spells\Other\Andt\Andt.mdl`，模型实例与区域到期一起释放。小地图坐标和场景点进入同一施法入口，原资源直接从归档读取，未生成派生地图目录。

## 来源与验证

只读安装 `E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne`，1.27.0.52240。AbilityMetaData的Ufa1/Ufa2明确护甲时限/奖励，Ofs1说明侦测类型，Esh1–5提供周期伤害、速度因素、衰退能量与初始伤害。原ACfa/ACf2/ACfu的第二BuffID为Bfro；AUfa/AUfu默认只有BUfa，复用同家族的标准受寒ID。

| War3Patch.mpq成员 | SHA256 |
| --- | --- |
| Units/AbilityData.slk | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/OrcAbilityFunc.txt | 9480b5fe482c3df2e966db5203b37899bf5a3771c2c241fb2c77abe51615623b |
| Units/UndeadAbilityFunc.txt | 515103e7540e3c6718e69d20d591b0a9132ba798326a142139863764083df8dc |
| Units/NightElfAbilityFunc.txt | 20e3bf670536d1a17cfbac0f40fb0cf28d4fcd69a6805f036c2845723e8cf87a |
| Units/CommonAbilityFunc.txt | 4cc1af07a127e4609a854f65ccf6870c7895f4a073419dc843957a0d9d575e50 |

暴雪[原守望者说明](https://classic.battle.net/war3/nightelf/units/warden.shtml)给出暗影突袭的独立初伤及每3秒伤害；[ScrewTheTrees的字段观察记录](https://github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md)也把Cast字段与周期联系起来，但该观察的版本为1.28.5，不能替代本项目的1.27对照。未复制该研究文档或第三方实现代码，速度恢复公式与伤害分类仍保持待验证。

本地原始提取脚本/行、编译日志、产品摘要及独立只读生命周期审核记录在 `tmp/docs-artifacts/war3/frost-poison-farsight/`。本次只做开发必需编译/差异检查与只读审核，没有执行新专项、三图、原件指令、GPU或性能测试。独立审核指出的排队毒伤跨死亡轮次边界已加入复查，运行复现保留在[测试队列](testing-batches.md)。完整音效、冷却/图标/附件/区域画面、原版状态叠加/驱散/虚无与特殊对象、长期AI和性能继续待完成/验收。
