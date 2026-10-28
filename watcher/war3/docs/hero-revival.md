# 祭坛英雄复活

已将英雄死亡、祭坛排队、费用/时间、队首人口预留、取消退款、完成复活与脚本事件连接到同一会话。复活使用原英雄句柄和UnitState，保留经验、等级、属性、技能/技能点、物品栏与名字，不创建替代英雄。

## 原数据与实际消费

四族祭坛halt/oalt/uaod/eate的源Profile均包含Revive=1。revivalInfo读取当前英雄类型的源价格/训练时间、等级和war3mapMisc覆盖：

- 金币：原价乘ReviveBaseFactor + ReviveLevelFactor × (等级-1)，受原价×ReviveMaxFactor和HeroMaxReviveCostGold限制。
- 木材：使用ReviveBaseLumberFactor/ReviveLumberLevelFactor及对应上限。
- 时间：原训练时间×等级×ReviveTimeFactor，受ReviveMaxTimeFactor和HeroMaxReviveTime限制。
- 取消退款消费ReviveRefundRate；恢复生命/魔法消费HeroReviveLifeFactor、HeroReviveManaStart及HeroReviveManaFactor。

源MiscGame默认金币系数.40/.10、最高700，时间系数.65、最高原时间2倍/150秒，取消退款1.0。价格当前截断为整数；组合恢复公式、数值舍入和完整原版精度仍待对照。

队列保存英雄及唯一票据，防止多祭坛重复排队；科技/英雄限额不将同一英雄的复活队列重复计数。开始、取消和完成使用43–46/80–83原事件及GetRevivableUnit/GetRevivingUnit上下文。单位/祭坛死亡、移除、转让和直接脚本复活会解除关联；回调重入后检查存活/所属/票据，不保留过期队列引用。

当前人口规则沿用既有生命周期：死亡释放、队首预留、完成抵扣预留，等待人口时不启动。该机制已有本实现检查，尚未证明与原版英雄死亡/队列人口时机一致。

ReviveHero/Loc保留原接口，恢复指定位置和源状态；doEyecandy连接Arev的种族Targetart，通过现有自动特效实例/骨骼附件及自然退役绘制路径消费。直接设置死亡单位生命为正时解除未完成复活队列。原件入口0x6f1f3300/0x6f1f3380的参数、英雄ID和幻象检查已有REA/Rizin指令记录；完整内部时序仍待对照。

## 产品与AI

祭坛命令区使用原英雄图标/按钮位置/热键、当前英雄名字/等级及源费用；待复活英雄对应类型替换普通训练按钮。原revive订单852039、目标订单和同类型训练请求接入实际复活队列。

原CmdCancelRevive的Art、ButtonPos、Tip/Ubertip及Esc热键进入GameData与产品界面；取消控件优先占用原位置，队列显示复活进度。Esc只在允许控制的游戏界面消费，菜单/对话框保持自己的输入。图标/队列使用既有流式资源与界面消费者；GPU和真实输入仍待阶段验证。

AI的SetProduce优先为已有同类型死亡英雄寻找祭坛。SetNewHeroes(false)继续允许复活旧英雄，阻止新增英雄；true允许经过真实付费训练队列新增。该状态有实际消费者，REA原入口0x6f894880的AI标志位读写已定位。普通训练菜单和AI生产只在英雄类型上扫描死亡英雄，避免为普通单位增加全表查询。

## 开发必要证据

Win32 Release产品与消费者编译通过，无诊断。因为本项同时修改队列票据、人口及死亡/移除/所有权回调，执行了新机制的最小CPU生命周期检查：

1. 三级大法师原金币复活价255、地图短时复活覆盖、真实祭坛按钮/订单、去重、扣费/人口/事件；完成后仍为相同句柄/对象，保留成长/技能/物品与名字，并创建真实复活特效实例。
2. 取消与祭坛移除退款/解除票据/人口，正确取消事件。
3. 英雄转让清除旧玩家队列/费用，ReviveHeroLoc恢复同一英雄，事件getter不污染宿主。
4. AI禁止新增时仍复活旧英雄；无旧英雄时拒绝新增，开启后进入实际付费训练队列。

最终4通过、0失败。初始三组基础流程通过，接入AI分派后按新输入运行最终四组。没有运行旧全套、三图/四族完整回归、GPU、原件数值差分或性能基准。该结果不代表全部英雄玩法和UI一致性完成。

证据在根tmp/docs-artifacts/war3/hero-revival/：source.json、ui-source.json、ability-source.json、native-entries.json、rea-evidence.json、delivery-build.log、lifecycle-final.log。测试生成器读取原BootyBay后，在根tmp写独立的无装饰物/通行网格夹具和短时Misc覆盖；不改原安装、不提交地图/日志/JSON。运行未加载Game.dll。

~~~powershell
cmake --build --preset release --target war3 war3_revival_tests --parallel 8
python tests/generate-revival-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_revival_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/hero-revival/fixture.w3m"
~~~

## 阶段接续

酒馆瞬间唤醒、英雄令牌/总数/中立英雄完整规则、尸体/可复活事件的原版时机、完整死亡惩罚和得分、英雄栏原版视觉／排序、语音/音效及全族画面继续实现。原版人口、数值舍入、恢复组合、取消/完成/转让重入和EyeCandy种族选择仍需对照。

阶段合并四族/中立/自定义英雄、多队列/多祭坛、资源/人口/阻塞、建造/升级/摧毁/隐藏/暂停、命令/死亡/移除/所有权事件重入、直接生命写入/复活、库存/能力/定时生命、实际窗口/取消/热键/图标/粒子、三图长局与资源释放/CPU/GPU。完整客户端验收保持开放。


## 英雄快捷栏

本地英雄的源图标、生命比例与死亡灰态已显示在游戏视图，最多列出七名非幻象英雄；F1–F7 或头像选择会走原有选区事件，连续选择定位镜头，联机沿用选区动作及回显。头像可作为单位目标模式的技能、物品及命令目标；点目标与建筑放置保持等待位置，头像按下拖出不会穿透场景选择。图标复用已有后台资源流，英雄列表每帧只扫描一次。

Win32 Release 产品增量编译通过。栏位排序、数量、尺寸与边框、快捷键、死亡／复活、技能目标与屏幕缩放仍需与原版对照；真实窗口及多人运行尚未验证。
