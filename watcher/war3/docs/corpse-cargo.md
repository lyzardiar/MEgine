# 绞肉车尸体货舱与挖掘

原Sch2/Amtc尸体货舱、Amel装载/自动收集、Amed卸载及Aexh挖掘已连接实际单位、命令、科技、尸体时钟与原命令区。完整亡灵玩法、四族AI、原版精度、UI/GPU与长局仍待完成或阶段验证。

## 实际流程

- Sch2/Amtc读取源容量8、范围160、释放区域250及0.5秒间隔；每具尸体占1格。使用真实cargo/transport双向清单，源尸体保持句柄、类型、归属及剩余衰败/恢复量。活动食尸占用的尸体不能被装载，存活单位不能进入尸体货舱。
- Amel读取ground/dead/nonhero、600搜索区域与100施法范围。按钮/C热键、loadcorpse目标/无目标订单、loadcorpseinstant及右键尸体连接同一接近/验证/装载流程。自动收集使用现有自动施放调度、原Art/Unart和PRE2指示；开关当前使用原订单邻接值852051/852052，精确映射与事件时序仍待原件对照。
- Amed使用源图标/D热键及unloadallcorpses订单，逐具按货舱间隔卸下；信息栏显示真实尸体数量/原单位肖像，点击可单独释放。舱内尸体不对外部技能可用、不推进衰败或姿态；卸下后恢复原时钟，可由食尸、亡者复生等实际消费者使用。完整原版模型骨骼/装载附加动画和窗口还原待阶段验收。
- Aexh读取源15秒间隔、生成类型ugho和5具上限；实际Ruex研究/能力可用性决定是否生成。生成直接创建死亡对象并装入真实清单，不产生虚构训练、活单位死亡或人口；满额时重置本轮计时，暂停或隐藏时冻结。当前上限按全部已存尸体计数，满额/暂停/移动/转让后的精确原版时钟语义待对照。
- 载具死亡/移除、尸体移除、脚本恢复生命及能力/容量改变复用运输/单位生命周期；原IsUnitLoaded/IsUnitInTransport和装载事件读取真实关系。恢复生命会先拆离尸体货舱。普通单位右键绞肉车仍可跟随。源货舱原型按能力ID缓存，持续调度不反复读取同一原型定义；动态增删/等级及地图自定义Amtc能力按当前能力表判断。

## 来源与运行边界

本机1.27.0.52240公共归档中的AbilityData/AbilityMetaData、UnitAbilities/UnitBalance/UnitData/UnitUI、UndeadAbilityFunc/Strings、UndeadUnitFunc、UpgradeData和WorldEditStrings已保留成员来源与SHA256，位于根tmp/docs-artifacts/war3/corpse-cargo/source.json。容量元数据Car1与挖掘上限exh1分别保留；运行只读MPQ，资源不落地解包。

REA核对Game.dll为x86 PE，SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，身份记录为同目录rea-identity.json。当前深度后端未配置，字符串查询不可用，记录于rea-provider.json；不将查询失败当作行为证明。开发依据为上述实际源字段、原订单表及现有消费者，完整原件行为仍待阶段对照。产品及检查程序不加载Game.dll。

## 检查与阶段队列

必要Win32 Release产品与新消费者编译通过。cargo/exhume两组最小检查最终2通过/0失败、无Game.dll：cargo覆盖真实句柄装载、舱内保鲜/隐藏/外部技能排除、卸载/继续衰败；exhume覆盖未研究拒绝、15秒生成、真实ugho尸体/无虚构人口及5具上限。首次exhume夹具将61秒一次交给上限60秒的模拟API，拆分后复测通过；旧corpse decay夹具同类91秒调用一并拆分，旧模式未重跑。

~~~powershell
cmake --build --preset release --target war3 war3_corpse_cargo_tests --parallel 8
python tests/generate-corpse-cargo-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_corpse_cargo_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/corpse-cargo/fixture.w3m" cargo
./build/windows-x86/bin/Release/war3_corpse_cargo_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/corpse-cargo/fixture.w3m" exhume
~~~

lifecycle/autocast模式仅编译、未执行。阶段合并验证载具/尸体死亡移除、装载事件回调重入、舱内脚本复活、满8格/第9具拒绝、混合尸体/占用/覆盖/能力增删/容量改变/研究禁用/所有权/暂停，完整目标规则/时序/原物品与能力组合、原按钮/肖像/动画/声音、AI及三图长局/CPU/GPU/内存/切图释放。不扩大本次检查为旧全套、三图或完整原版通过结论。

本地产物为根tmp/docs-artifacts/war3/corpse-cargo/中的source.json、rea-identity.json、rea-provider.json、fixture.w3m、build.log、check-build.log、final-build.log、fixture-build.log、delivery-build.log、cargo.log、exhume-first.log、exhume.log及exhume-final.log；不提交原资源、地图、原始JSON或日志。完整客户端及旧MEngine延期队列保持开放。
