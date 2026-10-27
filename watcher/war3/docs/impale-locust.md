# 穿刺与蝗虫群

2026-10-28。AUim/ACmp穿刺、AUls/AOls蝗虫群及w3a派生已连接实际施法、单位状态与伤害；原版数值/时序、完整UI/GPU、AI、声音及性能留功能阶段集中验证。

| 能力 | 实际消费 | 本机1.27源参数 |
| --- | --- | --- |
| 穿刺 | 原学习/按钮与单位或地面订单、定向波形/单次命中、击飞/落地伤害/眩晕、源地刺与角色承载附件 | 波距离600、传播0.3秒、伤害50/80/110、击飞1秒；一级普通/英雄眩晕2/1秒，100MP、9秒冷却 |
| 蝗虫群 | 原学习/按钮/即时订单、逐只创建真实单位、每目标配额、原武器弹道/实际伤害、携带伤害返航回血、结束返航和清理 | 20只uloc、0.2秒间隔、每目标最多7只、800范围、30秒；返还因素0.75、返还极限20，150MP、180秒冷却 |
| 洛克汗AOls | 复用AUls原型和各级覆盖，允许源建筑目标 | 二级35只、每目标12只、返还因素1 |

## 穿刺

session_impale复用SpellWave和BUim。单位或地点订单在释放时确定方向，以DataA/DataB计算传播速度，DataC作为伤害、DataD作为空中时限；每个波记录已命中单位。原地刺Specialart按96单位间隔创建并沿传播方向旋转，距离、宽度/碰撞边缘及视觉间隔仍需对照原件。

击飞使用独立Impale状态，保存空中剩余时间，统一阻止动作、施法、受击和目标选择。落地后走真实伤害/护盾/事件/死亡流程，继续源Dur/HeroDur眩晕。当前按“空中时间+落地后眩晕”计算总控制时长，伤害发生于落地；这两个时序选择尚未取得原版运行对照。零伤害仍产生控制，零空中时限直接结算伤害。死亡/重生、脚本移除、直接删除状态和施法取消事件的生命周期检查避免旧命中连接新生命。

角色抬升直接使用BUim的ImpaleHitTarget模型及Effectattach=sprite,first，已确认源MDX包含Sprite First Ref。共享角色变换读取原附件动画，按空中时限缩放播放；落地释放承载效果并恢复普通角色变换，源眩晕图标/头顶效果延续到状态结束。没有使用额外磁盘转换资产。

## 蝗虫群

session_locust为每个施法者/能力建立有界会话，按源间隔创建UnitID定义的真实单位。uloc沿用源模型、400移动速度、150初始飞行高度、Spells攻击、1秒间隔及12+1d2伤害和500速度弹道。DataA/B/C/D/E分别控制数量、释放间隔、每目标上限、伤害返还因素及携带极限；原Profile的Locustswarm使用既有852556订单注册。

每个会话每0.25秒建立一份可见有效目标清单，各蝗虫复用清单、按分配数/距离/句柄选目标，保证单目标配额；逐只飞行、接近/俯冲、原武器前摇和攻击间隔由实际状态驱动。没有目标时围绕施法者飞行。共享武器弹道命中后把实际结算伤害计入该蝗虫的携带量，达到DataE时返航，抵达施法者后按DataD回血并重新出击；时限到达后全部返航并移除。当前携带量截断于DataE，目标优先级、飞行轨迹、回流公式/尾段及原件RNG消费尚未达到原版一致性验收。

蝗虫不会进入普通战斗/寻路驱动，拥有独立的移动/攻击消费者，保留召唤者/能力和召唤事件。Aloc与实际蜂群成员进入统一不可选择/不可受击判断，鼠标目标、框选、脚本选择和小地图排除，原模型仍正常绘制。完整Aloc枚举、碰撞、自动技能及所有特殊规则继续后续完成/验证。

施法者换单或眩晕不要求维持Channel；暂停冻结本会话。每个会话及每只蝗虫保留死亡轮次，旧弹道不能向新生命补记伤害。施法者死亡重启、移除、转让、能力移除、重复施法或会话失效会清理群体；成员单独移除释放索引。普通到期返航清空成员后释放会话，源资源共享且不创建派生地图目录。运输、形态、所有权和原版特殊死亡/到期时序仍待阶段对照。

共享spellVisual同时按Targetattachcount及Targetattach/Targetattach1等源编号字段配对模型，正确处理Caster/Target/Special/Effect挂点。尖刺外壳的四个胸部附件由此分别使用其原位置，单模型多附件也有实际实例；所有受影响附件组合/GPU统一列入阶段队列。

## 来源与验证

只读安装E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne，1.27.0.52240。以下成员摘要用于维护与后续核对；源码不分发原版资源，运行不依赖Game.dll。

| 成员 | 归档 | SHA256 |
| --- | --- | --- |
| Units/AbilityData.slk | War3Patch.mpq | ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec |
| Units/AbilityMetaData.slk | War3Patch.mpq | 42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6 |
| Units/UndeadAbilityFunc.txt | War3Patch.mpq | 515103e7540e3c6718e69d20d591b0a9132ba798326a142139863764083df8dc |
| Units/UnitWeapons.slk | War3Patch.mpq | 03c9cbc02d703cf5f8b5b1ed4da789ffcf733aff44f8e2f70b7937e4de613b33 |
| Units/UndeadUnitFunc.txt | War3Patch.mpq | 9e4e56d389ad3cf280cb7f8b1a93f840517ae38555c659bac38a94443e533d91 |
| Abilities/Spells/Undead/Impale/ImpaleHitTarget.mdx | War3x.mpq | 871e51f85c3877f8560011cd88041022b99a317184f238244338a333f64a3b57 |

原件读取脚本、所选源行/模型附件记录与必要Win32 Release产品编译通过，无警告；日志保存于tmp/docs-artifacts/war3/impale-locust/；产品receipt标注构建结果和全部运行待测状态。构建命令为cmake --build watcher/war3/build/windows-x86 --config Release --target war3 -- /m:1 /nologo /v:minimal。新增玩法、三图、原版指令、窗口/GPU和性能没有在实现阶段执行，见[阶段测试队列](testing-batches.md)。
