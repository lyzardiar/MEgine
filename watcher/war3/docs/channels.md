# 持续施法与地面效果

暴风雪、烈焰风暴、宁静、群星坠落、死亡凋零和Channel已连接实际会话状态、原命令、脚本事件与源模型消费者。在原十七种技能基础上，连同[施法单位增量](caster-spells.md)，当前共三十三种主动/持续原型；自定义w3a克隆读取同一原型及逐等级覆盖。产品、原技能专项及新持续技能消费者已编译；专项行为、模型导入、GPU和原版一致性保持待阶段验证。

## 实际消费者

| 原型 | 源等级1字段 | 实际行为 |
| --- | --- | --- |
| AHbz 暴风雪 | 6波、1秒间隔、每波30、6碎片、上限150、建筑系数0.5 | 维持施法、逐波目标查询/伤害、按波源模型、停止后取消后续波 |
| AHfs 烈焰风暴 | 延迟1.33秒、全伤阶段2.67秒/15每0.33秒、余火4每秒、总9秒、上限90、建筑系数0.75 | 独立地面效果，释放后移动/停止及施法者死亡不取消；主爆发模型按技能等级选择，余火使用XHfs |
| AEtq 宁静 | 30秒、20每秒 | 范围友方治疗、正面状态及源目标特效，结束停止后续治疗 |
| AEsf 群星坠落 | 45秒、50每1.5秒、建筑系数0.35 | 周期敌方伤害、建筑倍率、源施法/目标模型 |
| AUdd 死亡凋零 | 35秒、最大生命4%每秒 | 敌我范围百分比伤害、Universal分类、源地面/目标效果和真实树木生命 |
| ANcl Channel | 跟随时间、目标类型、选项、Art Duration、禁用其他技能、基本订单ID | 无目标/单位/位置/双模式、真实CHANNEL/CAST/EFFECT/FINISH/ENDCAST；本体不产生伤害 |

物品携带的 Channel 复用源目标类型、物品次数与费用、施法生命周期及地图事件。双目标模式可选择世界单位、英雄快捷头像或地面位置。DotA_v6.83d 的侦察守卫在隔离会话中对地点放置生成 `o004`，对友方英雄使用由地图脚本给予单份守卫；两次均消耗一项次数。探针与记录位于 `tmp/docs-artifacts/war3/dota-item-flow/ward-point.log`、`ward-ally.log`；实际窗口和原版一致性待验证。

数值来自AbilityData/AbilityMetaData、能力和效果Profile、WorldEditStrings及地图覆盖。暴风雪源targs为空时采用地面、建筑、敌我、自身、neutral、树木和debris集合；死亡凋零按源说明补充树木。每次脉冲重新查询范围、生命、关系、免疫和可破坏物；单位按距离/句柄排序，伤害上限按该顺序分配，建筑系数直接相乘。此处为当前实现，目标默认、边缘、上限分配及原版公式仍需集中对照。

## 生命周期与命令

维持施法期间保留订单和动画。停止/移动/攻击、眩晕、死亡、移除、所有权改变或移除施放能力取消后续脉冲并释放持续视觉，只发ENDCAST；自然完成发FINISH，再清理施法和发ENDCAST。事件回调后复核施法票据，EFFECT中停止不会重新启动持续效果，FINISH中暂停不会保留已完成施法而重复FINISH。暂停单位冻结持续施法时间。

烈焰风暴具有独立计时/归属/位置；地图会话保留地面效果，源句柄移除后取消并释放视觉，死亡而保留句柄时继续。树木/可破坏物走真实生命/死亡事件/计数阻挡路径。切图由会话释放状态，运行不写解包资源。

Channel读取Ncl1–Ncl6及逐等级DataF订单。选项Visible控制按钮，Targeting Image使用源SpellAreaOfEffect.blp并贴合地形；Physical/Universal允许通过魔免目标筛选，完整物理/虚无/免疫分类仍待补齐。禁用其他技能进入实际施法拒绝与按钮禁用。Unique Cast在当前选择组只发起一份被接受命令，未勾选时同能力单位均发起；其原版精确群组规则待验证。Art Duration驱动持续视觉刷新，全部选项、动画和特效时序尚未与原版运行对照。

暴风雪碎片使用独立视觉随机序列，不消耗游戏模拟随机数。周期数量、地面实例及特效数量有预算限制。法术图像直接从归档读取，命令和脚本共用施法状态；不加载Game.dll。

## 待阶段验证

`war3_channel_tests`与生成器已加入并编译，尚未运行。覆盖源字段、波次/敌我/打断、宁静治疗/正面状态、群星建筑倍率、死亡凋零百分比/魔免，w3a Channel目标与基础订单/Visible/禁其他技能、EFFECT停止与FINISH暂停重入，以及烈焰风暴延迟/停止/死亡/总时长。UI范围图、选择组/快捷键/取消、施法者转让/移除、目标失效、暂停/长帧、驱散/叠加、完整资源退休、三图/冷首次施法/切图/性能继续合并到阶段验证。

```powershell
cmake --build --preset release --target war3 war3_spell_tests war3_channel_tests --parallel 8
python tests/generate-channel-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'
build/windows-x86/bin/Release/war3_channel_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/channels/fixture.w3m'
```

原始源字段/模型盘点与编译记录在根目录tmp/docs-artifacts/war3/channels/{source.json,source-models.json,build-final.log}，不提交原件或诊断输出。此次仅执行必要编译、Python AST和差异审查，没有执行专项程序或重复旧测试。全部技能/被动/光环、完整免疫/反弹/驱散/自动施放、技能声音、PREM/事件型效果/子附件与AI继续实现；完整客户端保持未完成。

Channel 读取当前等级 DataF 的基础命令后再进行订单校验，地图不提供 Profile 订单时仍可按实际基础命令学习和施法。DotA_v6.83d 的 A1AO、A1AT、A1AA、A06R 已在隔离会话学习并发起施法，进入冷却；脚本完整效果、不同目标类型、事件和实际窗口待阶段验证。
