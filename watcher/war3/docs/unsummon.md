# 建筑反召唤与原AI指令

Auns已作为实际能力接入原命令区：源图标、U键、按钮位置、目标选择、施法阶段和脚本事件共用现有能力流程。能力从公共MPQ及地图w3a覆盖读取；运行不加载Game.dll，也不解包地图。

## 消费与生命周期

- 自有建筑经目标检查后进入持续反召唤；敌方、重复目标、幻象、失效和未允许的无敌目标拒绝施放。当前采用远程目标方式，不要求工人走到建筑旁；作用释放后独立于工人死亡或后续命令。
- 未完工建筑进入既有施工取消/返款/事件路径。完整建筑记录费用、归属、能力数值和稳定票据，取消并退款已有生产/研究/复活和升级队列；队列新任务、攻击、技能、修理、矿井采集与资源返还入口消费反召唤状态。
- DataA1=0.5作为返还系数；DataB1=50作为当前每秒生命消退量。逐步返还按实际消退生命/开始最大生命及源建筑费用累计取整，最多返还开始生命对应份额，不能通过反复治疗增加返还。返还触发实际资源事件，不计为采矿/伐木收入；相关精确步进和原版公式仍需阶段对照。
- 原Birth动画按剩余生命反向取样，命令区隐藏不可用建筑操作并显示实际进度。矿井停止服务并清退采集/返还工人，携带资源寻找其他可用基地；拆除结束经死亡/人口/脚印/矿井释放和单位移除路径清理。暂停/眩晕停止消退，所有权变化、提前死亡及移除清理原票据；退款/取消回调后重新核对句柄、归属和票据。
- common.ai的Unsummon连接本玩家已有Auns工人的真实施法；不创建免费工人，不直接删除目标。GetBuilding按目标玩家查实际建筑并排除正在反召唤的对象，可供原UnsummonAll继续迭代；完整原AI循环运行仍待阶段验证。

## 原件依据和必要检查

源字段、元数据、原按钮和归档摘要保存在根tmp/docs-artifacts/war3/unsummon/source.json。REA/Rizin确认原Unsummon注册0x6f893130→0x6f895b20→0x6f8a26d0，枚举本玩家已有单位、查Auns并发出实际目标订单；原能力释放0x6f5926e0读取等级字段并建立独立CBuffUnsummon。Game.dll分析前后SHA256保持e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a。原件只读。

必要Win32 Release产品及war3_unsummon_tests编译通过，Python AST及差异检查通过。只运行新资源/生命周期最小检查1组，1通过/0失败：原按钮/快捷键、敌方与重复拒绝、远程订单、实际消退/分批返还、工人死亡后继续、最终75金/25木、10人口供给移除、无采集统计及无Game.dll。该范围不代表真实窗口或原版一致性验收。

证据：根tmp/docs-artifacts/war3/unsummon/下source.json、metadata-labels.json、rea-evidence.json、fixture.w3m、build.log、consumer-build.log、delivery-build.log、ui-build-final.log及lifecycle.log。进度条局部数值转换的编译错误已修正，最终产品编译通过；原始日志保留。原件资源和临时夹具均不提交。

~~~powershell
cmake --build --preset release --target war3 war3_unsummon_tests --parallel 8
python tests/generate-unsummon-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_unsummon_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/unsummon/fixture.w3m" lifecycle
~~~

ai和boundaries模式已编译但尚未执行。阶段合并原UnsummonAll/无人可施法/多建筑，队列和升级返还/人口/事件顺序/回调重入，受损/受攻/治疗/零速率/自定义w3a/费用边界，暂停/转让/移除/死亡/复活、覆盖矿储量/工人清退、原Birth/UI/原件声音特效、长局/三图/GPU/资源释放。DataB的原件调度、返还舍入和损伤计算、完整目标分类/范围与不可取消规则、原死亡事件和消失方式尚未证明一致；完整客户端验收保持开放。
