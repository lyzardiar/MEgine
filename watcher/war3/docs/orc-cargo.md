# 地洞驻军与吞噬

Abun/Abtl/Sbtl/Astd、Advc/Adev/ACdv已接入实际货舱、命令、武器、工人任务、buff和伤害。原地洞/科多兽保留原单位、原资源与现有游戏界面消费者；完整种族规则、AI、声音和原版精度仍待完成及阶段验证。

## 地洞流程

- Abun提供源4格/120装载范围/250卸载区域。Abtl按源UnitID选择普通农民，Sbtl选择混乱农民；不是任意友军均可进入。普通右键搭乘、显式load订单、battlestations按钮及原热键连接实际搭乘/装载流程。
- Battle Stations按源2000区域和距离/句柄顺序选择工人，同时计算已经入舱和正在搭乘的预留格数，避免多个命令重复征召同一工人。能征召仍在真实矿井采集阶段的工人，取消采集会释放其矿内占用；施工内部、其他运输、显式隐藏等状态不作为可征召单位。
- 源DataB临时占有开关决定是否保存工作。实际矿井、树木、修理目标、普通目标订单或移动终点在征召前保存，Stand Down/单独卸下/宿主释放后按有效句柄与原所有者恢复；不创建替代工人，不重建单位或免费完成任务。工人收到其他订单取消搭乘时清理等待的返工记录。
- 空地洞没有可用武器；驻军后启用源武器，当前按源冷却除以有效驻军人数调整发射间隔。otrb原武器基础冷却4秒、伤害22加1个5面骰，实际发射/弹道/伤害继续走已有战斗流程。源科技伤害和目标规则继续消费，驻军减少或清空影响后续攻击。原件的冷却进度、射手贡献及动画精确公式尚未验收。
- Stand Down使用源standdown订单/BTNBacktoWork。卸下使用合法地面落点和占位，无法安放的单位保留在舱内；原图标、肖像、生命和容量仍由现有命令/乘员栏显示。恢复工作引发的脚本回调会重新核查载具/乘员与当前卸载队列，避免回调取消后继续使用旧状态。

## 吞噬流程

- Adev与ACdv使用各自原devour/creepdevour订单、范围、目标关系和原按钮。目标必须满足地面/非英雄/有机/敌军或中立等源限制；中立生物按主动能力及Advc的最大野生生物等级约束，源默认均为5。货舱格数、目标可见性、无敌、递归运输、空舱及宿主状态共同决定可否使用。
- 原Advc提供2格货舱和源5生命/秒消化伤害；当前默认单个目标消化完毕前不再次吞噬。目标保留真实句柄、生命、归属及人口，进入实际货舱并停止世界操作；Bdig在宿主、Bdvv在目标使用持久物理状态，装载事件发生前建立好双方标记。状态查询使用真实buff记录，没有用无限数字时长代替生命周期。
- 消化按源货舱间隔累计，以现有伤害消费者实际扣除生命，保留伤害/死亡事件、人口、击杀者和经验路径。普通外来伤害仍不能命中舱内目标；消化宿主可以对自己的吞噬目标施加消化伤害。暂停宿主或目标冻结消化推进。
- 目标死亡/移除、宿主死亡/移除、货舱失效或状态标记被移除会清理消化/货舱/双方buff。需要释放存活目标时查找合法落点，不留下指向失效宿主的隐藏单位。原科多没有普通卸载能力，吞噬目标肖像不会提供主动卸载操作；技能在消化时禁用并显示相应状态。
- 源Devour特效、buff附着与已有资源队列连接。声音、原版吞咽/释放/消化节奏、伤害分类与护盾/魔免/恢复/击杀时机、单目标/格数规则及完整视觉仍需原版对照。

## 来源与边界

源AbilityData/AbilityMetaData、UnitAbilities、UnitData/UnitWeapons、Profile和字段标签的归档来源/SHA256与相关行保存在根tmp/docs-artifacts/war3/orc-cargo/source.json。UnitID才是Battle Stations/Load的允许单位类型字段，已接入该元数据映射。原文件读取保持只读，不生成解包工程。

REA本轮重新核对Game.dll为x86 PE，SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，记录为同目录rea-identity.json。既有固定Rizin 0.8.1原件记录包含CAbilityStandDown、CAbilityDevourCargo、CAbilityDevour和CAbilityCreepDevour，有限观察为rea-observations.json；来源/版本/许可证继续沿用third_party/rea/rizin-source.json。类字符串和源字段不是完整方法行为证明，深度后端缺口及函数/原版运行对照仍开放；产品不加载Game.dll。

## 检查与阶段合并

必要Win32 Release产品及新war3_orc_cargo_tests编译通过。flow最小流程1组通过/0失败，无Game.dll：源4格驻军/实际开火、Stand Down解除/禁用空载武器，吞噬拒绝英雄/友军/机械目标、真实货舱和双方标记、实际消化伤害、默认不可卸载、消化死亡/状态清理及真实科多击杀者。随后补充的矿内征召与隐式load路径只有编译结果，不能把上述流程复用为这两项运行通过。

work/release/manual模式已编译、尚未执行。阶段合并矿内工人征召/返工、显式load/右键/混乱农民、临时开关/满舱/并发命令/原武器冷却、宿主死亡/状态移除/生命恢复/暂停/所有权/回调重入、等级/w3a/魔免/中立等级、真实窗口/声音/附件/肖像及三图长局/CPU/GPU/内存/切图释放。完整战役/四族AI、吞噬魔法、尸体货舱、驾驶员与其他种族能力继续实现；原版完整性和精度不记为通过。

~~~powershell
cmake --build --preset release --target war3 war3_orc_cargo_tests --parallel 8
python tests/generate-orc-cargo-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_orc_cargo_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/orc-cargo/fixture.w3m" flow
~~~

原始证据位于根tmp/docs-artifacts/war3/orc-cargo/：build.log、delivery-build.log、consumer-build.log、final-build.log、miner-build.log、clean-build.log、fixture-build.log及flow.log。没有运行旧全套、三图完整回归、GPU、性能或原件逐函数对照；完整客户端和旧MEngine延期队列保持开放。
