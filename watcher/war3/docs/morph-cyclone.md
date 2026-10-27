# 妖术、变羊与飓风

AOhx/Aply/Acyc三种原型及地图能力覆盖已连接实际形态、移动与能力消费、原资源和单位生命周期。实现与原版一致性验收分别记录；完整四族/战役/客户端、变身能力、原版精度、UI/GPU/音频、AI和长局仍未完成。

## 真实形态与原单位

- AOhx读取源四类候选列表：地面/空中/两栖/水中；Aply读取nshe/nshf/nsha/nshw。按原移动类别选择，同类多候选使用现有会话随机数；源最大野生生物等级、英雄/普通时长、魔法、冷却和原订单/按钮/热键/学习、Rhst/Redt前置沿用实际施法消费者。妖术默认15秒/英雄4秒，变羊60秒且源目标禁止英雄。
- 临时Morph记录保存源生物的模型、图标、模型缩放与100移动速度，原句柄/类型/归属、生命/魔法/成长/科技/库存/人口及原生基础属性不被替换。原生基础速度在形态期间改写后，形态仍使用100，解除时显现最新基础值。地图覆盖和四类形式列表实际消费，未知形态/模型/非法字段明确失败。
- 变形期间移动与跟随保留；攻击、施法、物品使用、自动施放及相关建造/采集/修理/生产消费者被真实状态抑制。原命令区和模型/图标收集使用当前形态，旧技能/物品/建造目标模式取消。PolymorphedUnitsBestowAuras=0控制光环发出，变形期间其他攻击/侦测/隐形被动也不参与现有消费者；保留的物品、永久能力与属性仍可查询。
- 不同形态buff并存时按实际应用顺序选择表现；同buff刷新、驱散、到期、死亡/移除沿用原单位和特效清理。解除使用原BOhx/Bply Effectart；后续恢复不覆盖期间发生的所有权或原生属性改写。原始碰撞/视野与完整物品/能力组合、候选随机数消费顺序和原版精确规则仍待对照。

## 飓风与原模型承载

- Acyc读取20秒/英雄6秒、600施法范围、150魔法/5秒冷却、Redt等级2及cyc1“可以被驱散”。真实Cyclone状态阻止命令/攻击/施法和伤害，基础Pause标志不被改写。驱散/净化与通用buff移除消费可驱散标志；w3a的C000/cyc1=0已通过真实地图覆盖读取，不可驱散但仍正常到期。
- 源Bcy2 Effectart创建独立的地面载体并跟随原单位位置，单位连接Bcyc的sprite,first附件；不会把整个旋风递归附着到被抬升的单位。单位、选取与附着特效使用同一世界矩阵；资源仍通过现有内存归档/后台读取与分帧GPU交付。
- 原CycloneTarget.mdx提供Birth/Stand/Death序列和Sprite First Ref。使用原模型附件动画计算旋转/抬升，不用固定高度代替轨迹。原Stand附件CPU样本0/500/1500ms的Z分别为423.120/522.867/451.388。状态结束立即恢复普通单位矩阵，旋风按原Death序列退场；完整落地过渡、CycloneStasis地图常量、气旋内其他buff/计时与精确事件/分类语义仍待实现或原件对照。

## 来源与证据边界

25个原MPQ成员的origin/SHA256、能力/Profile/元数据、形态UnitData/Balance/UI/Weapons、common.j及MiscGame/中文字段保存在根tmp/docs-artifacts/war3/morph-cyclone/source.json。CycloneTarget.mdx来自war3.mpq，SHA256为ec05768aff2b0befedb9f8bbcf4e10c97fc519533fabdae37e811e0674acc2d1；Birth为2233–3333、Stand为6867–10133、Death为13467–18467。

复用REA已有Game.dll x86 PE身份观察，并重新核对原件SHA256为e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a，同目录rea-identity.json保留复用记录与当前摘要。深度后端的既有交接限制参见corpse-cargo/rea-provider.json；本轮未做逐函数原件行为对照。实现依据是原表、原MDX及已有消费者，当前检查不能替代原版一致性验收。

产品及检查程序不加载Game.dll，不依赖MEngine/Rust/Tauri/Node运行时，原安装只读，资源内存直读，不生成运行地图解包工程。

## 必要检查与阶段队列

Win32 Release产品/新消费者最终编译通过，Python AST及差异检查通过。三个新最小模式最终3通过/0失败、无Game.dll：

- morph：源妖术临时模型/类型与句柄、100速度、移动、禁攻/禁法/禁物品、光环消退、基础速度改写/库存保留、净化恢复、空中绵羊与变羊拒绝英雄。
- cyclone：真实控制/无敌/地面载体、Purge驱散、w3a不可驱散覆盖与通用移除拒绝、自然到期及原单位恢复。
- models：7个代表形态模型CPU导入，以及原旋风sprite,first的有限附件轨迹。GPU未执行。

~~~powershell
cmake --build --preset release --target war3 war3_morph_tests --parallel 8
python tests/generate-morph-fixture.py --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne"
./build/windows-x86/bin/Release/war3_morph_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/morph-cyclone/fixture.w3m" morph
./build/windows-x86/bin/Release/war3_morph_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/morph-cyclone/fixture.w3m" cyclone
./build/windows-x86/bin/Release/war3_morph_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/morph-cyclone/fixture.w3m" models
~~~

lifecycle模式仅编译、未执行。阶段合并所有权/施法者移除/原生属性/死亡/隐藏/暂停/重入、重叠/刷新/驱散/免疫/英雄及野怪上限、四类形态/随机候选/w3a/光环开关/物品/运输/采集生产、原选取/图标/附件/Birth/Stand/Death过渡/声音及三图长局/CPU/GPU/内存/切图释放。变形/气旋与其余能力、AI/native/存档回放/局域网和完整客户端继续推进，原版公式/时序/分类/规则精度保持开放。

原始记录位于根tmp/docs-artifacts/war3/morph-cyclone/：source.json、rea-identity.json、fixture.w3m、core-build.log、render-build.log、check-build.log、fixture-build.log、final-build.log、delivery-build.log、morph.log、cyclone.log、models.log和models-import.log。原资源、地图、JSON、日志均不提交；旧MEngine延期队列保持原状态。
