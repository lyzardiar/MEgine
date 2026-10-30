# 恢复、保护、加速与驱散消耗品

2026-10-28。八类原型已连接真实使用流程；必要产品编译及差异检查完成，玩法、原版一致性和窗口表现留阶段验证。

| 原型 | 实际行为 | 代表物品 |
| --- | --- | --- |
| AIrg | 按源总量/时限持续恢复HP/MP，按源标志选择自身、友军或范围；BIrg/BIrl/BIrm分别保留双资源/生命/魔法状态 | 治疗药膏hslv、小净化plcl、恢复卷轴sreg及AIp1–6派生 |
| AIvu | Bvul限时无敌进入共享能力/伤害/目标判定，源英雄/普通时限，禁止普通驱散 | 无敌药水pnvu、较小无敌pnvl |
| AIsp/AIsa | Bspe限时移速修正，自身或源范围目标，读取源最大速度约束实际移动 | 速度药水pspd、加速卷轴shas和加速符文 |
| AIha/AImr/AIra | 源范围友军实际HP/MP恢复、碰撞半径与类别过滤；地图覆盖和符文派生共用消费者 | 治疗/魔法/恢复卷轴shea/sman/sres、APh1–3/APmr/APmg/APra符文 |
| AIdi | 地点范围驱散可驱散魔法状态，敌方扣蓝、幻象消除和召唤伤害；符文拾取以使用者为中心立即执行 | 否定权杖wneg、驱魔权杖sneg和rdis符文 |

`session_consumables.cpp`缓存每种能力定义并连接源费用、冷却组、次数、最后一次删除和真实使用事件。`session_item_use.cpp`共用原库存按钮与单位/地点目标入口；目标不可用或恢复资源全满时先拒绝，再决定消耗，拾取符文允许在满资源时触发。多个主动效果仍明确拒绝，单主动加已支持被动沿用装备阶段流程。

恢复、保护、加速和驱散物品使用时提供 CHANNEL、CAST、EFFECT、FINISH、ENDCAST 事件及能力与目标上下文；支付前的回调若移除物品或使施法者失效，后续支付和效果停止。当前事件在使用调用内同步发布，与原版时序仍需对照。DotA_v6.83d 隔离会话附加事件观察脚本：净化药水的 EFFECT 带有实际英雄目标，魔瓶三次使用各产生五个阶段事件并完成空瓶／泉水补充；CAST 回调移除药水时未发布 EFFECT。记录位于 `tmp/docs-artifacts/war3/dota-item-flow/clarity-observed-events.log`、`bottle-observed-events.log` 和 `clarity-cancel-events.log`。探针直接调整单位状态和位置，不代表完整对局验收。

持续状态进入现有buff时钟：暂停停止推进，死亡/移除/驱散/同源替换销毁附件。恢复按DataA/B总量除源时限推进，DataC的生命/魔法位分别控制允许满资源使用。DataE当前实现为受到敌方正数最终伤害时移除，位于免疫/外壳/减伤/魔法护盾之后、伤害事件之前；零伤害和完全吸收不移除。**“Dispel on Attack”的攻击分类、免疫/友伤及事件顺序尚需原版对照**，不能据本实现声称已还原。

加速DataA作为移动百分比，Bspe同ID重新使用刷新，使用共享buff最强值聚合与减速消费者；有加速状态时读取MaxUnitSpeed/MaxBldgSpeed限制最终移动。源MiscGame当前为400，地图Misc覆盖沿用会话读取。该限制仅作用于本次加速状态；全局速度最小值、形态、不同增益叠加公式和GetUnitMoveSpeed查询精度仍待统一对照。

范围过滤复用spellTarget/spellTargets；消耗品允许魔免目标，按原air/ground/organic/friend/self/invu等掩码筛选。自用、没有单位类别掩码的药水使用自身路径。驱散复用dispelSpell，不因目标掩码含tree而销毁普通树木；可驱散树木/特殊装饰物语义仍待实现。零恢复量的恢复类物品允许正常使用并走声音与使用事件；`stpg` 企鹅玩具的 `AIpz` 从源配置读取 `PenguinSqueek`，不消耗物品。完整使用音效/AI自动使用、所有物品及复杂复合效果尚未完成。

## 来源与验证

只读安装 `E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne`，1.27.0.52240。源成员均按固定公共归档覆盖顺序读取，原始提取脚本/JSON在仓库忽略路径 `tmp/docs-artifacts/war3/consumables/`，不生成运行时地图解包资产。

| War3Patch.mpq成员 | SHA256 |
| --- | --- |
| Units/AbilityData.slk | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/MiscGame.txt | 2228cf869991d6ec5133e6115c3457903c2f0da9f0d70acc3d2518fe91e5f5bf |
| UI/UnitEditorData.txt | 7297c5a4462c1aa419c0a23b02aa9daf4a54b5394b8e6510da1d7b6cf5004061 |

AbilityMetaData说明恢复总量、fullFlags、无需目标和Dispel on Attack；UnitEditorData说明fullFlags的0/1/2/3取值。药膏400HP/45秒、小净化100MP/30秒、恢复卷轴225HP/45秒，普通无敌15秒/较小无敌7秒，速度药水+0.6/45秒、加速卷轴+2/10秒，驱散召唤伤害200来自源表，未用这些值替代地图覆盖。

本次仅做开发必需 `cmake --build --preset release --target war3 --parallel 8` 和 `git diff --check`，日志为 `tmp/docs-artifacts/war3/consumables/implementation-build.log`。没有执行专项玩法、三图、原件指令、GPU或性能回归。阶段入口及完整待测场景见[测试队列](testing-batches.md)。REA深层分析服务仍缺少Ghidra/IDA配置，此次依据源表，不将其当作二进制行为核对。

## 企鹅玩具

`stpg` 的源 `ItemData.slk` 配置为可使用、不可消耗，`AIpz` 继承 `AIha`，生命恢复量为 0，`ItemAbilityFunc.txt` 指定 `Effectsound=PenguinSqueek`。使用仍走现有背包权限、冷却、音效队列及物品事件，实际听感、事件次序、自定义零量恢复和原版规则待阶段验证。源 `War3Patch.mpq` 中 `Units/ItemAbilityFunc.txt` SHA-256 为 `22752f520ac000f64c60da602d8abee3ffd4c7119418454acb40ac2c9712e55b`；源数据查询记录在 `tmp/docs-artifacts/war3/consumables/penguin-source.json`。
