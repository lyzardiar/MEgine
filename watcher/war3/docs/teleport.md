# 群体传送与传送物品

2026-10-28。AHmt/AImt、AItp与AIrt已接入实际施法、资源、群体搬移和库存生命周期。必要Win32 Release产品编译无警告，运行、原版一致性及UI/GPU仍待阶段集中验证。

| 源能力 | 实际消费 | 原表代表值 |
| --- | --- | --- |
| AHmt群体传送 | 以施法者为出发中心，目标单位作为目的地；自身优先、附近本人单位按距离/句柄排序，延迟后搬移 | 24个名额，半径700，延迟3秒，100MP，冷却20秒 |
| AImt传送权杖，code=AHmt | 使用同一传送消费者，自身占一个名额；库存组冷却与物品施法独立于英雄已学能力 | 1个名额，延迟3秒，冷却90秒，物品stel |
| AItp回城卷轴 | 目标为友军建筑，出发半径内本人单位向目标搬移；Channel期间进入共享无敌能力判定，完成/取消立即解除 | 90个名额，半径1100，Cast1=5秒，物品stwp |
| AIrt召回护符 | 目标区域内本人单位传送到施法者旁；施法者不加入搬移名额 | 12个名额，半径700，Cast1=0，物品amrc |

`session_teleport.cpp`读取源DataA人数、AHmt的DataB延迟、DataC聚集，以及AItp/AIrt的Cast1与DataB。源等级和地图w3a覆盖共用spellInfo缓存。人数支持1–4096，超出范围明确报错；默认名额是否包含施法者、AIrt的DataB和精确人数/聚集规则仍需原件对照。

原英雄按钮/学习/命令/目标模式与已有施法流程相接。物品点击和六个数字键沿用库存目标入口，接受单位或地点；地点在周围合法目标中选择最近目标，小地图坐标共用此定位。原生UnitUseItem/Point/Target和IssueImmediate/Point/TargetOrderById的852008–852013库存槽命令进入实际使用流程。无目标调用传送物品时搜索本人最近的townhall建筑；进入目标模式后双击同一库存格可发出无目标物品命令，由现有传送消费者选择目的地。

库存来源保存在CastOrder，不要求英雄已学习物品能力。开始前及支付前检查持有、使用权限、次数、魔法和公共冷却；效果阶段扣费/次数并发出物品使用事件，最后一次可删除原物品，已支付的持续施法继续持有必要能力参数。支付和施法事件的删除/重入/归属变化通过源句柄及施法票据中断；取消不会退还已支付资源。准确支付/冷却起点和事件顺序仍待原版核对。

停止/替换命令、死亡、移除、隐藏、控制、变形、归属变化和目标失效复用现有cancelCast/finishCast。暂停会中断施法并释放持续施法状态。回城保护由当前Channel推导，不覆盖脚本无敌或其他buff；取消和完成释放CasterArt/Areaeffectart，搬移出发/到达使用源Specialart。完整使用声音、时间进度指示、相机跟随及所有原视觉细节仍待实现/验收。

搬移保留单位原句柄、归属、库存、能力和生命资源，清除旧路线/战斗/采集/工作状态并更新当前位置、返航中心、占地和迷雾版本。队友单位、建筑、隐藏/运输、暂停/定身、变形过渡及ward当前不加入搬移；召回再应用源nonancient等掩码。这些类别与联盟/共享控制的精确规则待对照。非聚集时保留相对偏移，聚集时从目的地按环选择合法位置。一个局部128单位空间网格记录实际碰撞及已落位单位，移动后移除旧占用，避免对每个候选重复全场扫描。地形合法性复用World路径查询，按地面/飞行分层；32环/1024范围仍找不到位置则该单位留在原处，若自身无法落地不搬移随行单位。搜索范围/排列优先、碰撞和完整移动类别精度仍待原版验证。

## 来源、证据与缺口

只读原安装 `E:\Program Files (x86)\dzclient\Game\Warcraft III Frozen Throne`，版本1.27.0.52240。以下成员来自War3Patch.mpq，保留既有公共归档覆盖顺序；数据直接读取到内存，未增加地图派生目录。

| 成员 | SHA256 |
| --- | --- |
| Units/AbilityData.slk | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/ItemData.slk | ceb4bf6cfdc4ae1fdb4957027ffc00dc72cd8bdba7c9acc3a6742b1e86c0f481 |
| Units/HumanAbilityFunc.txt | 30339592565e7415441a18b23b9f5ec90fe3304393a26b1ea88c61871a509af6 |
| Units/ItemAbilityFunc.txt | 22752f520ac000f64c60da602d8abee3ffd4c7119418454acb40ac2c9712e55b |

AbilityMetaData的Hmt1/Hmt2/Hmt3、Irec、Itpm/Itp2说明单位数量、施放延迟和使用传送群。HumanAbilityFunc/ItemAbilityFunc保留目的地Areaeffectart、施法者Casterart与搬移Specialart的原用途。来源提取脚本/JSON、编译日志及产品摘要在 `tmp/docs-artifacts/war3/teleport/`；本次依据源表，没有新的REA指令级行为对照。

完整保存/避难权杖、复杂复合物品dtsb、运输/附身/矿内/古树与所有特殊单位、AI策略自动使用及原版时序、UI/GPU/音效、三图长局和性能仍待完成或集中验证。此次只执行开发必需编译与差异检查，没有运行专项玩法、三图、GPU或性能回归；场景与风险见[测试队列](testing-batches.md)。
