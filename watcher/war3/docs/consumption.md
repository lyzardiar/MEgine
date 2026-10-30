# 吞树、吞噬魔法、吸收魔法与毁灭之球

2026-10-28。Aeat、Advm、Aabs和Afak已接入独立客户端的真实状态、原订单与命令区。完整客户端及原版一致性仍未验收。

| 原型 | 实际消费者 |
| --- | --- |
| Aeat 吞树 | eattree=852146、真实树木目标/接近/独占、0.8秒撕裂后死亡与路径释放、eattree挂点携树特效、2.5秒吞食后Beat持续30秒恢复500生命、取消/竞争/到期与原动画 |
| Advm 吞噬魔法 | devourmagic=852536、范围200/距离600/冷却7秒、实际可驱散魔法buff清除、DataF忽略友军增益、敌方幻象/计时召唤物与180伤害、每个受影响单位50生命/75魔法及DataC/D每buff收益、回流弹道/上限 |
| Aabs 吸收魔法 | absorb=852529、本人其他单位/距离900、最多99999魔法与DataA生命吸收、实际扣除供给方资源、回流弹道到达时补充受益方、生命/魔法上限与死亡/归属检查 |
| Afak 毁灭之球 | flamingattacktarg=852539、flamingattack=852540/unflamingattack=852541、单次手动或普通攻击自动附加、释放时25魔法、20奖励伤害、源1500速度弹道、1全额/75范围0.45/150范围0.25、敌方范围目标与魔法不足基础攻击回退 |

吞树使用施法票据和树木占用表，实际撕裂调用共享可破坏物死亡流程；取消在撕裂前保留树木，结束时释放占用和携树特效。活动吞食单位进入更新集合，暂停/控制/转让/能力移除和既有施法取消使用同一生命周期。Beat为正面物理恢复效果；吞食完成后的恢复随单位持续，不要求留在原位置。Specialart按源Specialattach选择挂点，附件姿态与单位使用同一动画回退。

物品携带的 Aeat 按目标掩码选择树木或单位，并进入物品费用、施法事件和原图脚本流程。支持地图将吞食时间覆盖为零。DotA_v6.83d 的 I05C 通过 Aeat 目标树木触发地图恢复脚本，目标友方英雄时由脚本创建单份 I0Q6；两条隔离会话记录位于 `tmp/docs-artifacts/war3/dota-item-flow/tango-tree.log` 和 `tango-ally.log`。探针直接创建目标并设置英雄位置，不代表实际窗口或原版一致性验收。

吞噬魔法只对实际清除魔法效果或实际影响召唤物/幻象的单位产生收益，空白区域不生成魔法；默认保留友军正面效果并清除其负面效果。源每单位及每buff字段分别消费。生命/魔法作为有界载荷沿源回流模型返回；吸收魔法直接扣供给方资源，避免复制，受益方只在载荷到达且仍有效时接收。正常树木不被吞噬魔法砍倒；树上哨兵等附着魔法能力尚待实现。

毁灭之球沿用普通武器的前摇、攻击间隔、攻击事件与目标逻辑；手动订单只强制下一发，自动开关由实际攻击选择消费，不另起持续施法。攻击释放时校验并扣魔法，将能力、奖励、范围、目标和模型参数保存在CombatProjectile中；后续开关/魔法变化不改写已发射载荷。完整原版攻击/法球叠加、手动施法事件及阈值时序仍待核对。

命令区优先按UnitAbilities原能力清单排列，保留原图标、位置、热键和自动指示器。毁灭者源Advm和Aabs位置冲突时，同排空位承接后续按钮，避免覆盖和点击错位；实际窗口与原件布局仍待验收。技能书、超过12个按钮及复杂自定义命令组合继续完善。

来源为本机Warcraft III 1.27.0.52240的AbilityData/AbilityMetaData、NightElf/Undead AbilityFunc/Strings、UnitAbilities/Weapons及原单位/树木/特效。源成员归档与SHA-256见本地source.json。REA/Rizin观察到CAbilityEatTree/CBuffEatTree、CAbilityDevourMagic/CMissileDevourMagic、CAbilityAbsorb/CMissileAbsorb、CAbilityFlamingAttack及相关原订单字符串；该观察不证明完整实现或时序。Game.dll摘要e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，静态读取前后未变；产品未加载该DLL。

必要Win32 Release产品/新消费者编译无诊断，差异检查通过。eat/devour/absorb/orb四个最小模式最终4通过/0失败、无Game.dll，覆盖占用/取消/真实树木与路径释放/挂点状态/延迟恢复、驱散与友军例外/召唤伤害/回流及空区域、本人目标限制/供给扣除/上限、手动和自动法球/一次支付/弹道快照/伤害比例/友军排除/无魔法回退及按钮不重叠。召唤伤害检查暂停目标以隔离自然恢复。没有运行旧全套、三图、完整GPU或性能基准。

```powershell
# cwd: G:/work/github/MEgine/watcher/war3
cmake --build --preset release --target war3 war3_consumption_tests --parallel 8
python tests/generate-construction-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --output "../../tmp/docs-artifacts/war3/eat-magic/fixture.w3m"
# mode: eat / devour / absorb / orb
./build/windows-x86/bin/Release/war3_consumption_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/eat-magic/fixture.w3m" eat
```

阶段合并：源等级/w3a/字段边界、树木竞争/距离/取消/暂停/转让/移除/回调重入、buff分类/不可驱散/魔免/虚无/护盾/友军与原件收益精度、载荷中途死亡/捕获/目标移除/计数预算、法球阈值/前摇支付/取消/其他攻击被动和攻击效果/范围分类与手动事件、指令排序/按钮溢出/热键/提示文本/原素材/动画/携树附件/音效/GPU，以及完整AI、三图长局/CPU/内存/切图释放。其他能力/native及完整客户端继续实现。

本地证据：仓库根tmp/docs-artifacts/war3/eat-magic/{source.json,source-rows.log,read-source.py,rea-consumption.json,rea-orb-orders.json,build.log,check-build.log,eat.log,devour.log,absorb.log,orb.log,fixture.w3m}。原图、截图及诊断产物不提交。
