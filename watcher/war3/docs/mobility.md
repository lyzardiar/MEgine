# 风步、闪烁与镜像

AOwk/ANwk、AEbl/ANbl和AOmi已接入现有原订单、源按钮/热键/英雄学习、魔法/冷却及施法事件。能力具有实际状态和玩法消费者；原版精度、GPU及专项运行验证仍开放。

## 已接入

- 风步读取源BOwk、普通/英雄持续、DataA淡入、DataB移速增量、DataC破隐伤害和DataD布尔开关。实际移动消费速度增量并保留隐形，玩家视野/侦测/模型复用统一隐形判定，风步期间不自动索敌。明确攻击在前摇开始破隐，并把本次伤害/开关写入可取消攻击票据；移动、取消或换目标不会把伤害留给后续普通攻击。施法/使用物品按已有破隐流程清理状态，超时/死亡/移除复用buff生命周期。
- 风步状态有效期间，移动单位与其他非建筑单位互相忽略动态碰撞；地形和建筑仍使用原有阻挡。普通隐形不改变碰撞；结束风步后立即恢复正常碰撞，既有重叠单位可沿使间距增大的方向脱离。当前穿越从状态施加起生效，淡入、技能终止时重叠和原版行为需阶段对照。
- 风步DataD开启时，额外伤害作为本次主要命中的独立universal伤害交给现有真实伤害/事件消费者；关闭时加入普通武器伤害。额外伤害独立于普通持久攻击属性，不重复计入，不传递给弹射或溅射目标。伤害分类、暴击/闪避/护盾交互及事件顺序仍需原版对照，当前不是精度结论。
- 闪烁使用源最大/最小距离，在地图边界内查找合法落点；检查目标地形、飞行层与现有单位占位，不要求起终点存在步行连通路径。零距离、无合法落点、建筑/缠绕等当前不满足条件的情况在施法前拒绝。实际位置/路径/守卫原点、占地与视野失效一起更新，原Specialart和Areaeffectart分别在出发/落地位置实例化。
- 镜像消费源数量、输出/承伤倍率、普通/英雄寿命及DataD动画延迟。原单位在转换期暂时隐藏并拒绝伤害/普通操作，转换结束恢复；暂停冻结转换。转换清理负面状态和上次同源镜像，按原类型/成长创建真实幻象，连接BOmi、summoner/能力来源、定时生命和召唤事件。原单位与一个镜像的位置由现有会话随机源选择交换；颜色/动画/选择和后续操作沿用现有幻象/单位绘制。
- 镜像来源在召唤回调前建立。创建及回调后核对源单位/所有者/施法票据和有效句柄，防止回调删除、转让或改派命令后继续使用旧状态。死亡、移除、技能失效或施法取消结束转换状态，既有物品幻象共用的创建流程也保留这些边界检查。

## 来源和边界

源AbilityData、AbilityMetaData、原Orc/NightElf/Neutral Profile及字段中文标签、归档来源/SHA256保存在根tmp/docs-artifacts/war3/mobility/source.json。Wind Walk、Blink、Mirror Image的订单分别沿用已有windwalk=852129、blink=852525、mirrorimage=852123。

一级原字段：AOwk为0.6秒淡入、10%移速、40伤害、20秒持续/5秒冷却/75魔法；AEbl为1000最大/200最小、10秒冷却/50魔法；AOmi为1个镜像、0输出/2倍承伤、0.5秒动画延迟、60秒寿命/3秒冷却/125魔法。ANwk/ANbl及w3a别名继续按其源字段读取。

本次REA打开原Game.dll摘要核对成功，深度查询未执行成功：当前工具只提供ghidra/hopper/ida，缺少可用的本机深度分析后端；已有rizin后端不在当前工具版本内。诊断精简记录为同目录rea-provider-status.json。实现继续使用上述原归档字段和已有工程消费者，没有把查询失败记作原版行为依据；Game.dll仍不参与产品链接和运行。

完整动态碰撞、闪烁最小距离/受限地形/遮罩/缠绕及原Dur字段时序、镜像分散半径/寻位顺序/清理范围/随机/无敌与事件语义、完整声音/原图标排版/粒子和全部原版一致性保持待完成或待验证。原安装只读、归档直接读取，不生成解包工程。

## 必要检查与合并待测

Win32 Release产品和新增war3_mobility_tests消费者编译通过，静态差异检查通过。windwalk/blink/mirror模式仅随实现编译，尚未执行；没有新增运行、GPU、三图或性能通过结论。原始编译日志位于根tmp/docs-artifacts/war3/mobility/build.log、delivery-build.log、final-build.log及clean-build.log。

阶段复用现有generate-stealth-fixture.py产出的原地形夹具，合并既有攻击/隐形/物品/幻象/技能消费者：

~~~powershell
cmake --build --preset release --target war3 war3_mobility_tests --parallel 8
python tests/generate-stealth-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_mobility_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m" windwalk
./build/windows-x86/bin/Release/war3_mobility_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m" blink
./build/windows-x86/bin/Release/war3_mobility_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/stealth-reveal/fixture.w3m" mirror
~~~

合并验证淡入/移动/破隐伤害/取消与在途攻击、侦测/驱散/魔免/全等级覆盖、闪烁距离/边界/障碍/失败/冷却、镜像延迟/替换/倍率/成长/事件/暂停/死亡/转让/回调重入，以及原窗口/特效声音、三图长局/CPU/GPU/内存/切图释放。完整客户端与旧MEngine延期队列继续保持原状态。
