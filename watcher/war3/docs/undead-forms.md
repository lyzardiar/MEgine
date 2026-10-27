# 毁灭者、石像形态与钻地

2026-10-28。本批复用真实单位变身框架，接入三个亡灵形态原型；完整客户端和原版一致性尚未验收。

| 能力 | 源类型 | 已接入的实际消费者 |
| --- | --- | --- |
| Aave 毁灭者形态 | uobs → ubsp | avengerform/unavengerform原订单、Rusp前置、造价差100金/50木、额外2人口预留/提交、同句柄/生命比例、飞行/240高度/武器和能力、源初始0魔法与-3魔法恢复、永久形态禁止返回并隐藏变身按钮 |
| Astn 石像形态 | ugar ↔ ugrm | stoneform/unstoneform、Rusf前置、30秒源冷却、即时落地/起飞和高度调整、地面目标/15基础护甲、禁攻/零基础速度、ACmi魔免、每秒8额外恢复和源Alternate序列 |
| Abur 钻地 | ucry ↔ ucrm | burrow/unburrow、Rubu前置、1.45秒转换、零基础速度/禁攻、源每秒5生命恢复、Alternate序列、钻地隐形及独立侦测位、出地恢复 |

付费转换按源普通/交替单位的金木差额计价，人口只预留额外部分；费用、人口和类型提交均连接实际玩家状态。尚未提交类型的取消释放预留并退回费用，已提交类型的转换保留其费用和新人口。库存、用户数据、同句柄和原生改写沿用共享框架。永久变身不提供返回按钮；付费按钮展示源目标名称、说明和价格。

石像形态使用Source DataE的持续恢复，独立于荒芜基础恢复；基础地面/护甲/武器/魔免取交替单位定义。石像和钻地的源UnitFunc未声明Animprops，因此依能力交替类型选择MDX的Stand Alternate/Morph Alternate；直接创建交替类型也具有对应外观、恢复或钻地状态。

钻地隐形使用侦测位2，普通隐形仍使用位1；阴影Atru等源mask=3可侦测两类。可见性native、敌方目标、绘制与己方选择共用实际状态。隐形不等于隐藏/移除，单位仍参与世界和生命周期。

来源为本机Warcraft III 1.27.0.52240的AbilityData/AbilityMetaData、UndeadAbilityFunc/Strings、UnitAbilities/Balance/Data/UI/Weapons、UndeadUnitFunc及morphFlags。源成员归档与SHA-256记录于本地source.json。REA/Rizin读取Game.dll，观察到CAbilityAvengerForm、CAbilityStoneForm、CAbilityBurrow及原avengerform/unavengerform字符串；实际订单使用852531/852532。该观察仅确认原型/订单存在，不证明完整类行为或时序。Game.dll摘要e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，静态读取前后未变，产品未加载该DLL。

必要Win32 Release产品/新消费者编译无诊断，Python AST及差异检查通过。本批3组最小流程通过/0失败，覆盖资源/人口拒绝与扣费、永久形态与0魔法、石像地面/禁攻/魔免/恢复/冷却/返回、钻地隐形/阴影侦测/恢复/出地。共享转换框架改变后，仅补跑受影响的熊/鸦/恶魔3组流程，3通过/0失败；两程序均确认无Game.dll。完整原版精度、UI/GPU、三图与性能仍进入阶段合并验证。

```powershell
# cwd: G:/work/github/MEgine/watcher/war3
cmake --build --preset release --target war3 war3_undead_forms_tests --parallel 8
python tests/generate-undead-forms-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_undead_forms_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/advanced-forms/fixture.w3m"
```

待实现/阶段验证：古树扎根拔根、毁灭者吞噬魔法/吸收魔法/毁灭之球，其他原型与完整AI；全部等级/w3a/付费标志组合/永久语义、原版魔法与恢复/石像冷却起止精度、侦测分类/隐形组合、取消/脚本资源事件/人口关闭/转让/死亡移除/回调重入、特殊路径/合法落地、源动画/附件/音效/按钮画面、三图长局/帧耗时/内存/切图释放。测试夹具为便于隔离禁用了路径阻挡，不能作为WPM落地验证。

原始证据位于仓库根tmp/docs-artifacts/war3/advanced-forms/：source.json、source-rows.log、rea-forms.json、rea-orders.json、model-sequences.log、detection-source.log、build.log、check-build.log、flow.log、shared-forms.log、fixture.w3m及读取脚本；均不提交。
