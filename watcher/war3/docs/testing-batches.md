# 独立客户端测试队列

## 地图漂浮文字阶段待验证

路径：session_text_tag、session／script_state／session_tick、game_text_tag／game_view 与 CMake。texttag 创建／销毁、文字／单位或坐标定位、颜色／速度、可见／暂停／永久、年龄／寿命／淡出连接会话状态和 GameView 绘制，支持内联颜色与换行。Win32 Release 产品增量编译通过。

集中验证 DotA 与其他真实地图的文字显示、坐标／单位定位、颜色／字体尺寸／速度／淡出、暂停／隐藏／过期／重复销毁、地图切换释放及大量文字性能；原版单位换算、时钟、文本遮挡、战争迷雾与本地可见性仍待对照。实际画面、交互及原版一致性未验收。

## 战役镜头、字幕与装饰物阶段待验证

路径：camera_control／session_camera_setup／session_world、world／game_view 相机，session_text／game_cinematic_panel／GlueScreen 原 FDF 与阵营皮肤，world／scene_objects 动画请求，music／session_music 主题音乐。支持实际相机配置／单位跟随／震动、过场界面／肖像和字幕、矩形／圆形装饰物动画遮挡物空间块淡化／独立边界雾，以及主题音乐、原版声道音量组、区域／单位附着空间音。源 FDF 和原图启动证据位于 tmp/docs-artifacts/war3/campaign/。

序章 Prologue01 的静音最小检查已通过原图 main 初始化和前 2 秒模拟，未加载 Game.dll；界面隐藏窗口检查绘制四种皮肤。大范围对局／可见画面／肖像和听感尚未验收。功能阶段合并验证源镜头字段／时长／跟随／震动和用户控制、HUD 淡入淡出／字幕换行／声音／肖像／四族皮肤、装饰物过滤／随机相位／直接操作次序、主题音乐与游戏音乐恢复、八组一秒渐变／切换声道／多区域注册注销／镜头进出及暂停／3D 声像、退出／性能／资源释放；精确相机波形、界面渐变、空间声像／声锥、遮挡轮廓／几何与雾边界精度及其他脚本仍开放。

## MRF 披风、战役转场与脚本相机阶段待验证

路径：morph_mesh、model 事件、model_cinematic、session_campaign／main 和 world／session_world／game_view。原版六个 Morf 文件的纹理、索引、UV、帧顶点与法线按事件读入内存、线性插值并绘制；脚本独立影片／模型槽在结束转场按模型优先顺序消费。相机位置、定时平移、距离／角度／旋转／滚转／高度字段接入实际视图。原版资源格式、转场反汇编和相机字段依据在 tmp/docs-artifacts/war3/campaign/。

Win32 Release 产品编译通过；真实模型静音隐藏窗口检查加载六份 MRF，运行 19,031 ms／570 帧，首个披风在 14,031 ms 触发并绘制 90 次，正常退出。此检查不证明可见画面、材质或其余五段。

集中验证六段披风事件与坐标／纹理／灯光／透明／深度、相机角度单位／平移／输入覆盖、模型后影片及胜利／切关、退出类型、声音／GPU／窗口／资源释放、完整原版画面与性能。相机跟随控制器、CameraSetup、镜头抖动、其他模型事件及原版精确时序仍待实现或对照。

## 模型过场与地图滤镜阶段待验证

路径：model／model_pose 多相机及滚转，model_cinematic 的连续序列／源 Scene 声音，sound 标签匹配，campaign 与 main 入口；session_match、script_state、game_view／game_cine_filter 和 renderer 的脚本滤镜状态／纹理／UV／颜色／混合。原版结局模型十段与对应相机、第二段原音轨已接入；MRF 披风网格已接入，其他模型事件仍未完成；脚本 PlayModelCinematic／PlayCinematic 转场时先模型后影片。原件 REA 序列回调与 Scene 配置、模型清单保存在 tmp/docs-artifacts/war3/campaign/。

Win32 Release 编译通过；真实原模型静音最小运行 6,219 ms／185 帧，跨过首段到第二段，音频标签解析问题修复后通过。可见画面、声音听感、全场次、原版精度及滤镜玩法均待功能阶段验证。集中验证原版相机／序列边界／音轨连续性、地图脚本电影／模型排队及胜利切关／播放期间声音，滤镜九个 native／纹理／颜色及 UV 动画／六类混合与边界、覆盖层顺序、暂停／切换／异常和资源释放；合并 MRF 与其他事件验收。

## 战役影片阶段待验证

路径：cinematic、campaign_browser、main 和 CMake；从原版 Movies 的 AVI 文件直接构建 DirectShow 图、通过 blizzard.ax 解码 BLZ0、播放 MP3 并支持跳过／返回。影片与资料片模型过场属于不同流程，后者的完整表现仍待验收。Win32 产品编译通过；TutorialIn 隐藏窗口最小检查中静音和非静音均构图成功、播放时间推进，2 秒分别收到 50／49 个解码后帧，正常销毁；可见画面、声音听感及原版一致性待功能阶段验证。REA 依据和临时检查位于 tmp/docs-artifacts/war3/campaign/。

集中验证九部影片的完整播放／音画同步／可视比例、静音、跳过、窗口缩放／最小化／设备恢复、错误提示／资源释放／重复播放及只读资源目录；完成模型过场后合并对照其时序、相机、动画、事件和声音。

## 战役流程与跨地图缓存阶段待验证

路径：campaign_browser、campaign_profile、session_campaign、session_cache、map_preparation、main及相关接口。菜单、章节和难度、进度、ChangeLevel、重新开始及独立 gamecache 与单位快照已接入；完整战役、视频过场、原版 .w3v／存档／回放／局域网未完成。Win32 Release 产品编译通过；功能验证与原版一致性待阶段合并执行。

集中验证原版 ROC／TFT 菜单和章节解锁／难度、直接地图及自定义地图的切换／返回／重开、战役进度持久化、英雄及物品跨关恢复、缓存异常与写入边界、多进程和资源释放；同时验证完整剧情、UI／声音、性能及无解包增长。细节和未实现边界见[战役流程](campaign-flow.md)与[游戏缓存](campaign-gamecache.md)。旧 MEngine 待测批次保持延期。

按用户2026-10-26的要求，先按[集中实现清单](implementation-roadmap.md)覆盖可运行流程，再在功能阶段集中测试修正，源码与待测记录持续提交。必要编译和阻塞问题最小复现及时执行；原件逐项精度检查与回归后置，不运行旧MEngine全量检查。此前三项合并批次保留为历史记录。证据保存在仓库根目录 `tmp/docs-artifacts/war3/`。

| 任务 | 路径 | 验证内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W001 原生程序与归档 | CMake、platform、archive、renderer、main | x86 独立构建、MPQ 覆盖、有界缓存与引用生命周期、无 Game.dll、D3D9/9Ex 绘制与窗口恢复 | 归档错误传播、设备恢复和资源生命周期 | 基础范围通过，批次关闭 |
| W002 图像、字体和音频边界 | image、media、main、rea-boundaries | BLP1/JPEG/palette、BLP2/BC、TGA、原版中文字体、Miles 内存 MP3 | IJL 调用约定、透明平面、codec 路径与 sample 生命周期 | 基础范围通过，批次关闭；音效与听感仍待验收 |
| W003 原版 MDX 菜单场景 | model、model_pose、binary、archive、renderer、main、fdf、glue、tests | MDX800 基础场景、纹理来源、FDF 模板与字符串、真实帧、退出输入 | 不可信记录边界、FDF 预算、菜单按钮输入边界 | 基础范围通过，批次关闭；完整还原留在功能矩阵 |

## 战棍与角鹰兽骑乘阶段待验证

路径：session_war_club/session_coupling、源能力／目标／施法／命令／按钮／取消，树木占用／死亡、武器选择／攻击发射／状态tick／单位死亡移除与变身，真实新单位／人口／选择／物品／分组，持树效果骨骼／尺度／替换贴图及后台资源。Agra、Acoi/Aco2/Aco3、Acoa/Acoh、Adec和w3a派生有实际消费者。

状态：实现接入；Win32 Release产品增量编译通过、无警告，差异审查通过，新增专项、三图、原版精度、UI/GPU/声音/AI及性能统一留功能阶段验证。源表、归档摘要和REA创建／生命／战棍调用证据、构建日志在tmp/docs-artifacts/war3/warclub-coupling/。

集中验证：拔树距离／独占／中断／树死亡与占地、延迟起点／刷新／15次实际攻击／命中和弹道快照／移除／武器恢复／源树类型与贴图／骨骼和Alternate姿态；原按钮／热键／研究／命令／双向寻伴／辅助移动／竞争与取消、三单位类型／新实体／比例生命／库存／buff／定时生命／冷却接续／原事件顺序、海岸／水面／WPM／碰撞／无合法下骑点、人口／选择／所有权／死亡复活／异常回调与资源释放；三图长局、原UI/GPU/音效/AI、CPU／内存／持续切图无解包增长。英雄／建筑合成未实现，精度与搜索边界见[实现说明](warclub-coupling.md)。旧MEngine队列保持延期。

## 仙女龙与暗夜防御阶段待验证

路径：session_faerie_dragon、原能力注册／命令／按钮／施法阶段／付费事件，真实攻击／伤害／隐去／移动／视野／弹道／通道清理；session_defense_passives、原被动定义／科技和可用状态、装备夜视、武器与伤害、带符号状态汇总。Apsh／Amfl、Ault、AIdd／Aegr、Assk／Ansk、Arsk及源派生已有实际消费者。

状态：实现接入；必要Win32 Release产品编译通过、无警告，差异审查通过；新增玩法专项、三图、原版精度、UI/GPU/声音/AI和性能留在阶段集中验证。源表／Profile／摘要、REA类型证据及编译日志在tmp/docs-artifacts/war3/faerie-dragon/。

集中范围：手动／自动相位、攻击开始／在途武器／伤害、1.5秒隐去／原命令恢复与生命周期；魔力之焰30秒通道／正反按钮／停止与其他命令／12护甲、付费技能与库存／零费用区别、范围／原弹道／费用及上限／主次目标、来源／目标死亡轮次和事件重入；夜视研究／转让／昼夜／启停与共享视野，艾露恩之优雅／硬化／抗性／被动物品、概率／最低值／魔法与物理分类／叠加、负护甲与实际HUD；原版反应／DataF／减伤次序、全等级／w3a、UI/GPU/AI/声音及三图长局／性能／资源释放／无解包增长。非零被动防御速度／反弹等开放边界见[实现说明](faerie-dragon.md)。旧MEngine队列保持延期。

## 守卫、吼叫与范围净化阶段待验证

路径：session_wards_roar、spell_info/spells/area_spells/summons、陷阱登记/tick/移除、实际Buff数值/盗取/恢复及库存目标/支付/六槽/符文；caster_spells的范围驱散与自爆、派生源命令。包含治疗／岗哨／观察者／静止陷阱、吼叫／嚎叫／卷轴和自爆／消魔的连续流程。

状态：实现已接入，执行必要Win32 Release产品编译及差异检查；新增玩法专项、三图、原版精度、UI/GPU/声音/AI及性能统一留在功能阶段，不逐能力运行测试。源表、归档摘要、原行和构建日志在tmp/docs-artifacts/war3/{wards-roar,dispel-casters}/。

集中验证：原能力/研究/按钮/命令/热键与库存目标/次数/冷却/拾取符文；真实单位/寿命/恢复/侦测/共享视野，陷阱激活/范围/原时间与目标分类/空间性能，吼叫正负数值/偏好/数量/互斥/驱散/盗取，敌我驱散/魔法损失/召唤与幻象/抗性/自爆牺牲及保留玩家来源；死亡/移除/归属/暂停/复活/召唤与物品事件重入、三图长局/资源释放/无解包增长。原版精度与完整表现保持开放，见[实现与边界](wards-roar.md)。旧MEngine队列保持延期。

## 破法者与龙鹰阶段待验证

路径：session_spell_steal/human_channels/feedback，源spell_info/passive_info/spells/channel/attack/projectiles、buff出处/成员与实际状态、structures分类、自动施法/库存选目标与支付。消费Asps/Amls/Aclf、Afbk及原派生。必要产品编译无警告，差异检查通过。

状态：实现接入；只执行开发必需Win32 Release产品编译、差异和源消费者审查。新增专项、三图、原版精度、UI/GPU/声音/AI及性能待阶段集中验证。源表/Profile/优先级/单位/归档摘要、REA类依据及构建日志在tmp/docs-artifacts/war3/human-casters/。

阶段合并盗取源优先级/正负状态/实际迁移/接收者/魔免/剩余时间/模型/源/自动与候选缓存，反馈真实魔法/英雄与召唤/同次伤害/全部攻击组合，锁镣目标/控制/多来源/伤害/光束/打断/驱散/死亡重入，乌云范围/结构目标/远程攻击/重叠/退出/结束/移除和物品目标/次数/费用/冷却/六槽/事件；三图长局、完整原UI/GPU/声音/AI、CPU/内存/连续切图无解包增长。精确规则及库存Cloud独立寿命等开放边界见[破法者与龙鹰](human-casters.md)，旧MEngine队列继续延期。

## 单位护盾、链接、削弱与灵魂行者阶段待验证

路径：session_unit_casters、spell_info/spells/caster_spells/autocast、实际buff替换/释放/tick，damage的真实分摊与递归/倍率隔离，fog/visibility，entities/unit_forms的原类型和虚无，以及item_use的目标/六槽/次数/冷却/事件。消费Alsh/Aspl/Afae/Acri、Acpf和源野外/库存派生。必要Win32 Release产品编译无警告，差异检查通过。

状态：实现接入；只做开发必需Win32 Release产品编译、差异和源消费者检查。新增专项、三图、原版精度、UI/GPU/声音/AI及性能保持阶段待验证。源表/归档/字段/摘要、REA类证据及编译日志在tmp/docs-artifacts/war3/unit-casters/。

阶段合并闪电护盾源目标/范围/友伤/双buff/叠加/周期/来源消失/载体/驱散与空间边界；链接集合/选取/护甲和护盾/真实分摊/归属/失效成员/死亡重入与事件；精灵之火负甲/自动开关/昼夜和共享视野/隐形与清理；残废三类实际削弱/叠加/分类；灵魂行者源类型/虚无/过渡/取消/研究/库存、法杖目标/费用/次数/冷却/六槽和使用事件，以及三图长局/UI/GPU/AI/音效/CPU/内存/切图无解包增长。双buff、原分摊/视野/形态语义和Aspp拾取符文仍开放，详见[施法单位补齐](unit-casters.md)。旧MEngine队列继续延期。

## 地精修补匠阶段待验证

路径：tinker状态、session_engineering/tinker与源spell_info/passive_info、equipment/hero学习/原生能力级别/research/unit_forms、原Channel/施法/自动开关/攻击/集结/死亡/tick及真实模型/资源。ANsy/ANcs/ANeg/ANrg、工程派生、ANde拆毁家族与Asds自爆家族有实际消费者。必要产品编译无警告，差异检查通过。原24英雄/96能力登记核对补齐AOsw实际AOwd蛇棒原型，仅作静态入口证据，未宣称完整玩法通过。

状态：实现接入；仅执行开发必需Win32 Release产品编译和差异检查。新增行为、三图、原版精度、GPU/UI/声音/AI和性能保持待阶段验证。原表/元数据/Profile/单位/模型路径/摘要和REA类型依据、构建日志在tmp/docs-artifacts/war3/tinker/。

阶段合并四项能力完整学习/命令/按钮/冷却，工程替换的升级/降级/移除/后加能力/科技/等级/句柄与事件重入，机器人原类型/力量/护甲/拆毁/库存和变回，工厂投掷/生产/原子单位/时限/集结/约束/转让，卡布恩手动/自动/实际死亡/爆炸范围/连锁/来源消失/重生，火箭群波次/随机分布/范围伤害/上限/眩晕/建筑/取消和在途释放；三图长局/完整UI/GPU/AI/音效/CPU/内存/切图无解包增长。精确规则与表现的开放边界见[地精修补匠](tinker.md)，旧MEngine队列继续延期。

## 炼金术士与击杀奖励阶段待验证

路径：alchemist状态与session_alchemist、原spell_info/spells/channels/spell_effects/neutral状态tick、unit_forms、callbacks及玩家资源事件。ANhs/ANab/ANcr/ANtm和w3a覆盖有实际消费者；共享死亡奖励读取原玩家开关及单位奖励骰子。必要产品编译无警告，差异检查通过。

状态：真实消费者已接入；仅执行开发必需Win32 Release产品编译和差异检查。新增专项、三图、原版精度、GPU/声音/AI和性能未验收。源表/归档/字段/摘要、common.j常量及构建日志在tmp/docs-artifacts/war3/alchemist/。

集中验证医疗气雾波次/瓶轨迹/中心投递/敌我治疗/上限/取消和来源消失，酸性炸弹追踪/主次伤害/负护甲/周期/叠加刷新/驱散，化学狂暴原句柄/成长/库存/类型/武器/到期与死亡，炼金术目标/价格/击杀/普通奖励开关/尸体/重生和回调重入，真实资源事件/原随机序列及三图长局/UI/GPU/声音/AI/资源释放/性能。精确规则、时序与完整表现保持开放，见[炼金术士](alchemist.md)。旧MEngine队列继续延期。

## 火焰领主阶段待验证

路径：firelord状态、session_firelord/lava_spawn/volcano与spell_info/spells/area_spells/channels/spell_effects/orb_attacks/projectiles/passives/伤害/死亡/移除/召唤/tick消费者。ANso/ANlm/ANic/ANia/ANvc原表和w3a覆盖共用。

状态：真实消费者已接入；开发必需Win32 Release产品编译和差异检查通过。未执行新增专项、三图、GPU、原版精度或性能回归。源表/模型/摘要、REA火山登记与分派、构建日志在tmp/docs-artifacts/war3/firelord/。

集中验证灵魂燃烧持续伤害/禁法/减免/驱散，炎魔出生期间操作/分裂攻击计数/旧弹道票据/生命阈值/代数/寿命/归属及回调重入，燃灰手动/自动/被动/法球/叠层/致死爆炸/尸体/来源消失，火山波次/本体和占地/取消/自然结束/在途岩石/地形对象/眩晕；原UI/GPU/AI/声音、三图长局/资源释放/性能和无解包增长。完整原版公式/分类/择取/视觉与音效仍开放，详见[火焰领主](firelord.md)。旧MEngine队列继续延期。

## 元素分身与龙卷风阶段待验证

路径：spirit_split状态与真实成员、session_spirit_split及主施法/Channel/tick/隐藏/伤害/死亡/移除/归属/经验，ambient_passives常驻登记/附近索引/时钟/状态/视觉，passive_info/auras/attack_passives、控制/驱散/魔法消费/吞噬和Resistant native。消费ANef/Acef、ANto、Apig、Awar/ACpv、Atau/ANta、Atdg/Atsp/Atwa、Aasl和Arsk/ACrk及源覆盖。

状态：真实消费者已接入；开发必需Win32 Release产品编译和差异检查通过，初次编译缺参/局部遮蔽已修正。没有执行新增行为专项、三图、GPU或性能回归。源表/归档/MDX路径/common.j常量、REA类型入口、构建日志与产品摘要位于tmp/docs-artifacts/war3/spirit-split-tornado/。

阶段合并原英雄句柄/成长/库存/HP/MP/人口/经验、三分身出生/原技能/死亡/到期/原位置与选择、全部死亡或移除的英雄死亡及祭坛、成员与英雄的归属/删除/形态/重生/事件重入；龙卷风创建/选择/实际控制/手动与游走/取消/结束、建筑分区伤害/卷起/减速/来源消失，常驻献祭/粉碎/嘲讽、抗性native与持续时间/变形/控制/吞噬/驱散额外伤害；三图长局/完整AI/UI/GPU/声音/CPU/内存/切图无解包增长。

原件出生/回收与返回规则、Atsp的Dur=12/Btsp-Btsa双状态与DataA=22、游走RNG/路线、粉碎部分区/伤害分类、Taunt默认DataA/Prefer/Maximum及非零参数、抗性完整规则、声音与AI保持开放，详见[元素分身与龙卷风](spirit-split-tornado.md)。旧MEngine队列继续延期。

## 中立英雄法术、联动与末日阶段待验证

路径：session_neutral_spells、spell_info/area_spells/wave与原施法输入，passive_info/attack_passives的醉拳与减攻，spell_effects的独立状态/周期/死亡轮次，channels/Lightning、callbacks/尸体/召唤、item_use/teleport与真实禁用，damage可选的保留玩家来源和effects离屏兜底。消费ANbf/ANcf/ACbc、ANdh/Acdh、ANdb/Acdb、ANht/Acht、ANrf/ACrf/ACrg、ANdo、ANfl/ACfl及w3a覆盖。

状态：实现接入；只做开发必需Win32 Release产品编译、差异和源字段/消费者审查。新增玩法、原版精度、完整UI/GPU/AI/声音和性能未验收；不执行每技能专项/全库测试。来源、构建日志与产品摘要位于tmp/docs-artifacts/war3/neutral-heroes/。

集中验证云雾弹道/范围/命中/失误/移速与火焰扇域/总伤害/点燃，醉拳暴击/闪避/装备与法球、嚎叫实际减攻/时限/互斥，火焰雨波次/建筑/友伤/残留与刷新时钟，末日目标/禁法/库存/永久不可驱散/持续伤害和真实死亡/尸体消费/守卫/时限/召唤事件，叉状闪电原主次目标/扇域/并列/三光束；共用生命/归属/移除/暂停/运输/变身/重生/同步复活及事件重入，三图长局/资源释放/内存/无解包增长/原版操作与GPU/声音。

末日源DataD隐含等级、通用伤害/免疫/护盾、光束择取优先级、嚎叫Roar互斥/驱散与完整自定义字段、燃烧倍率/叠加、完整音效/技能AI待继续实现或对照，详见[中立英雄](neutral-heroes.md)。旧MEngine验证队列保持原状态。

## 兽王召唤、惊吓兽群与闪电攻击阶段待验证

路径：session_spell_info/area_spells/summons、共享学习/原订单/单位与生命周期、Afzy无目标狂热及自动施法、session_stampede/stampede空间索引/扫掠/爆炸/Channel、动画循环与特效兜底、passive_info/projectiles/session_lightning_attack/lightning真实第一武器和定时光束。消费ANsg/ANsq/ANsw/ANst/Arsq/Arsp、Afzy、Alit及w3a派生。

实现接入；本次只执行开发必需Win32 Release产品编译和差异检查。源参数/MDX序列、原行、读取脚本、构建日志及产品摘要位于tmp/docs-artifacts/war3/beastmaster/。玩法、画面和原版一致性保持待验收，没有执行专项/三图/GPU/性能回归。

阶段合并：三等级真实召唤与技能、原学习/按钮/订单/热键/自动开关/交战恢复、费用/冷却/寿命/事件/人口与落点；熊重击/闪烁、豪猪狂热与飞鹰真视/隐形/弹道；兽群速率/空间扫掠/碰撞/0.2秒延迟范围伤害、生命/归属/暂停/取消/重生/移除及事件重入；可破坏物无敌切换/死亡/重建与网格释放；即时和实际弹道伤害、独立光束延迟/寿命/高度/死亡轮次、法球/第二武器/闪避/护盾；源模型/循环/音效/离屏和无渲染清理、高密度性能、三图持续对战/切换与无解包增长。原版兽群生成域/随机/相位、闪电优先级、完整声音/AI仍待完成或对照。详情见[兽王与闪电攻击](beastmaster.md)，旧MEngine队列保持原状态。

## 霜冻箭、黑暗箭与沉默阶段待验证

路径：session_arrow_status、攻击修饰/发射等级快照、命中前标记/命中后状态、普通死亡/尸体消费/原玩家召唤、独立Silence状态/武器和施法/原UI、库存点物品/支付/事件，及共享伤害事件死亡轮次隔离。消费AHca/ANfa/ACcw、ANba/ACbk、直接ANbs和ANsi/ACsi/AIse。

必要Win32 Release产品编译无警告、差异检查和源字段/枚举核对通过；没有执行新增专项、原件指令、三图、窗口/GPU或性能回归。日志、source.json/原行、提取脚本及产品receipt位于tmp/docs-artifacts/war3/dark-arrows-silence/。实现接入，运行及原版一致性未验收。

阶段集中操作与范围：

- 原图招募黑暗游侠/娜迦海巫，学习黑暗之箭/沉默/霜冻之箭；核对原按钮、热键、单次/自动和coldarrowstarg/coldarrows/uncoldarrows、blackarrow/on/off、silence订单、魔法/冷却/前置/禁用、空地与原掩码。
- 普通/英雄/建筑/机械/无敌/魔免/虚无/幻象/闪避/护盾/零伤害、发射支付与取消前摇、在途增删/升级/变身/装备转移；霜冻普通/英雄时限、0英雄时限、实际移动/攻速、驱散/刷新和多来源。DataD完整跨法球叠加及Bcsd/Bcsi仍待实现/原件对照。
- 黑箭第一次致死、有效标记中由其他人击杀/脚本死亡、标记超时/驱散/来源死亡或移除/归属变化、源等级与奴仆数量/类型/80秒BNdm、英雄不转换、尸体消费/其他尸体玩法及真实人口/武器/事件；原版死亡/经验/召唤/衰败顺序待对照。
- 伤害/死亡/召唤/人口/取消事件中的移除、变蛋、重生、同步复活、新订单和再施加状态；旧伤害不扣新生命、旧标记/减速不跨死亡轮次，原来源为空时的事件上下文和多玩家归属。
- 标准沉默掩码8的主动/自动施法/持续施法、技能增删/解除/到期、允许普通移动/攻击/库存、现有攻击修饰与开关；自定义Melee/Ranged、失误/移动/攻速字段和在途攻击。Special位4当前明确失败，留后续实现。
- ssil/AIse原库存点输入/单位坐标/六槽脚本订单、接近/超距/取消/权限/无限与有限次数/公共冷却/使用事件、沉默中物品施放、目标圈/头顶/区域模型及完整声音/UI/GPU；直接ANbs被动能力与库存增减，经典AIob外壳仍待完成。
- 灼热箭/毁灭之球、普通武器、尸体和已接入施法/物品的受影响回归，三图长局/完整AI、原版分类/公式、性能/内存/切图释放及无派生磁盘增长。具体当前行为与缺口见[箭矢与沉默](dark-arrows-silence.md)，旧MEngine队列保持原状态。

## 灼热之箭、侦察与复仇之魂阶段待验证

路径：spell_info/spells/attackEnhancement/orb_attacks、真实攻击/武器快照，summons、cappedCorpseSummon/原按钮与自动开关、单位默认自动/真实视野侦测、死亡/移除/时限及召唤事件轮次。消费AHfa/ACsa、AEst、AEsv/Avng及w3a/单位覆盖。

必要Win32 Release产品编译无警告，差异审查及源能力/元数据/单位字段核对通过；没有运行新增专项、三图、原件指令、窗口/GPU或性能回归。日志、source.json/原行与产品receipt位于tmp/docs-artifacts/war3/night-elf-heroes/。实现接入，运行及原版一致性未验收。

阶段集中操作与范围：

- 选原图使用月之女祭司和守望者，学习灼热之箭/侦察/复仇之魂；核对原学习/按钮/位置/热键及费用/冷却/前置/禁用。脚本flamingarrowstarg、flamingarrows/unflamingarrows、scout、spiritofvengeance和vengeance/on/off/instant进入实际消费者。
- 灼热之箭10/20/30奖励、8MP、1500弹速与目标掩码；单次/自动/缺蓝/追击/取消前摇/命中、装备/科技/暴击/吸血/法球叠加、建筑/飞行/护甲/魔免/虚无/闪避/无敌/致死事件、在途增删/升级/形态及投射物快照。
- 猫头鹰nowl/now2/now3的60/90/120秒、飞行/高度/移动、1000/1500/2200昼夜视野和Adtg的900范围/掩码3，实际隐形/地下/共享视野与迷雾；无敌/魔免、暂停/到期/替换/移除/切图和完整出生/模型/声音/UI/GPU。
- AEsv真实espv和180秒/替换、原1200生命/400MP/武器/魔免、默认Avng自动与源开关；尸体独占/空间/费用/冷却、每次1个/最多6个even/50秒/无敌、天神普通死亡/到期/移除的连带、名额和索引回收。
- 共享SpiritWolf/普通召唤/亡者复生/腐尸甲虫的受影响回归；召唤/死亡/人口等回调中的删除/归属变化/新订单/变蛋/重生/同步复活、不同来源/多个施法者/派生等级、依赖召唤物自定义重生/转让、Raiu计数类型和全部原件顺序。
- Asp1原球体、Arsk完整抗性、出生弹道/过渡、AI主动策略及完整音效仍待完成；三图长局、窗口/GPU、原版数值时序/操作、高密度性能/内存/持续切图与无派生资产增长统一在功能阶段执行。来源及边界见[暗夜英雄补齐](night-elf-heroes.md)，旧MEngine队列保持原状态。

## 穿刺与蝗虫群阶段待验证

路径：session_impale/session_locust/swarm、原型/源命令/SpellWave、Impale状态/时钟/落地伤害、角色源模型承载、真实单位/武器弹道/伤害回流、Aloc目标与选择/小地图边界、会话/成员移除及共享多附件读取。消费AUim/ACmp、AUls/AOls和地图覆盖。

必要Win32 Release产品编译无警告、差异审查通过，并读取两份源MDX的附件记录；玩法、原版对照、三图、窗口/GPU和性能均待阶段执行。必要编译日志、source.json、提取脚本与产品receipt位于tmp/docs-artifacts/war3/impale-locust/。实现接入，运行和原版一致性未验收。

阶段合并以下实际操作与范围：

- 选原地图，亡灵训练地穴领主并学习穿刺/蝗虫群；核对原按钮/位置/热键、单位及地面订单、魔法/冷却/取消。脚本原impale/locustswarm订单及creep/洛克汗派生走同一消费者。
- 穿刺各级/覆盖、0.3秒600距离/宽度/碰撞边缘/无重复、50/80/110伤害、1秒空中及普通/英雄后续眩晕、零伤害/零空中时限。对照原件核定伤害时刻、总控制时长和各阶段目标/无敌/免疫/驱散/叠加语义。
- ImpaleHitTarget原Sprite First附件/按源时限播放、地刺间距/方向、头顶状态、暂停/直接删除/死亡/重生/变蛋/同步复活/伤害与取消回调、落地清理。共享Cyclone承载与BUts四编号挂点、单模型多附件及其他原技能附件纳入受影响回归。
- 蝗虫20只/每0.2秒释放、单目标最多7只、30秒800范围；AOls二级35只/每目标12只及建筑目标，w3a数量/单位类型/目标覆盖。检查原400速度/150高度/13–14伤害/1秒间隔和真实弹道、闪避/护盾/护甲/魔免/虚无/致死伤害后实际回流。
- 数据D/E的返还公式/携带上限、真实飞行返航/接触回血/多次出击/移动施法者/到期返航、无目标盘旋/单只删除/每目标分配更新；原版RNG、轨迹、攻击前摇和尾段精度待对照。
- Aloc与蜂群成员鼠标/框选/脚本选择/小地图/受击排除、原模型持续绘制、脚本单位枚举及其他Aloc特殊行为；施法者换单/暂停/运输/变形/能力增删/归属变化/死亡重启/移除/重施放和所有事件重入。
- 三图长局、完整UI/GPU/音效/AI、高密度群体的帧耗时/内存、持续切图/成员与归档释放/无派生磁盘增长。来源、当前算法和限制见[穿刺与蝗虫](impale-locust.md)。旧MEngine队列保持原状态。

## 腐尸甲虫与尖刺外壳阶段待验证

路径：session_crypt_lord、spell_info/corpse_spells、原按钮/自动开关/订单、passive_info/auras、普通伤害/武器命中和死亡/移除流程。消费AUcb、AUts/ANth/ANt2与w3a派生。原DataC类型字段按字符串读取，原Profile命令映射到已核对注册。

必要Win32 Release产品编译和差异检查通过；没有运行新增专项、三图、原件指令、窗口/GPU或性能回归。实现接入，运行及原版一致性待阶段验证。证据位于tmp/docs-artifacts/war3/carrion-spiked/implementation-build.log、source.json和implementation-receipt.json。

阶段集中执行：

- AUcb全等级/源学习按钮/原热键/手动与即时订单/右键自动、6秒冷却/30MP/前置/禁用、空闲与战斗订单恢复、超距/取消/无尸体及无空间；不得错误扣费或消耗尸体。
- 真实尸体竞争/运输/保鲜/食尸/亡者复生、双类型数量和地图覆盖、上限5/死亡补员/升级保留/多施法者、归属转换/复活重生/移除、源零时限和自定义正时限、DataF死亡连带与召唤事件重入。
- AUts/ANth/ANt2的3/5/7防御和15/25/35%返还、DataB自定义承伤、装备/科技/光环/形态叠加、伤害基数/分类与减伤精度；普通近战/远程/溅射/零伤害/闪避/魔免/虚无/护盾/幻象、致死反伤及伤害回调删除/转让/变蛋/重生/同步复活。
- 原四处附件/图标/自动指示器、技能增删/等级/变羊/隐藏/运输/死亡/移除、完整声音/UI/GPU/AI，以及三图长局、高密度性能/内存/切图释放/无解包增长。当前算法及精度边界见[甲虫与外壳](carrion-spiked.md)，旧MEngine队列保持原状态。

## 霜冻护甲、暗影突袭与透视阶段待验证

路径：session_frost_poison、源原型/caster消费者、UnitBuff/时钟/队列、普通命中/死亡轮次、自动选择与原开关、RevealArea/效果寿命及game_view小地图。消费AUfa/AUfu/ACfa/ACf2/ACfu、AEsh/ACss及AOfs和地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过；独立只读审核指出的排队毒伤跨死亡轮次边界已增加复查，运行复现留本阶段。未运行新专项、三图、原件指令、GPU或性能回归；实现接入，运行及原版一致性待阶段验证。证据为tmp/docs-artifacts/war3/frost-poison-farsight/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并全级/覆盖/原学习按钮/费用/冷却/原开关，护甲45秒与受寒5秒/英雄时限、实际防御/原比例/驱散/叠加、命中快照/近战远程/闪避/0伤害/致死/重入/攻击者新生命，自动威胁/阈值/排序/范围/订单恢复；暗影突袭1200弹道、75初伤/每3秒10的一级代表值、英雄时限/15.1秒尾段、移动/攻击衰退/再施放/多源/驱散/魔免/虚无/护盾/分类、同帧多毒/Roots致死变蛋或同步复活；透视全级范围/侦测掩码/迷雾/隐形地下/联盟共享、小地图选点/超距/区域重叠/到期/原Xbdt模型和释放。完整音效/状态图标/附件/窗口/GPU/AI、原版公式/时序与三图长局/性能/内存/切图仍在集中队列，来源及当前算法见[护甲、中毒与透视](frost-poison-farsight.md)。旧MEngine队列保持原状态。

## 凤凰火焰阶段待验证

路径：phoenix_fire/session_phoenix_fire、passive_info/SpellMissile消费、装备/能力/库存/类型注册、单位创建/死亡轮次与移除、tick及原图标/模型。消费Apxf及派生参数，源0.5秒/600范围、20初伤/每秒2、10秒与英雄7秒。

必要Win32 Release产品编译无警告、差异检查通过；独立只读审核识别的命中后死亡重启边界已加死亡轮次复查，运行复现留本阶段。未运行新专项、三图、原件指令、GPU或性能回归；实现接入，运行和原版一致性待验证，证据为tmp/docs-artifacts/war3/phoenix-fire/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并原被动图标/说明、能力/库存/权限/等级/科技/类型增减和自定义覆盖、变蛋停火/孵化恢复、源计时/暂停/隐藏/变形/死亡与幻象、可见敌方地面/空中/范围/碰撞/类别/免疫、目标随机和RNG消费/在途保留/已有燃烧/叠加、真实弹道/初伤/按秒及尾段燃烧/英雄时限/伤害分类/护盾/虚无/减伤、死亡变蛋/重生/同步复活轮次、伤害回调删除/转让/重入替换、来源删除和切图、声音/UI/GPU/AI、三图长局与高密度性能/内存/无派生磁盘增长。具体算法与原版精度边界见[凤凰火焰](phoenix-fire.md)，旧MEngine队列保持原状态。

## 重生与凤凰生命周期阶段待验证

路径：rebirth/session_rebirth、UnitState与passive_info、unitLife/food/corpses/revival、统一创建/添加能力、AI复活、spell_info/area_spells/tick和game_commands被动冷却。消费AOre/ACrn/派生、AIrc/ankh、AHpx和Aphx及地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过；独立只读生命周期审核未发现可证实问题，未运行新专项、三图、原件指令、GPU或性能回归。实现接入，原版死亡事件/统计和运行一致性待阶段验证；证据为tmp/docs-artifacts/war3/rebirth-phoenix/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并学习/被动冷却/自定义等级/优先级、致死伤害与KillUnit/直接生命、冷却与Ankh次数/最后删除/使用事件重入、7秒恢复/生命和魔法-1/完整容量、英雄成长/库存/句柄/人口/归属/暂停/移除/直接设置生命/ReviveHero、死亡/英雄可复活/经验/击杀统计/掉落原版顺序、食尸/复活/占尸/衰减与祭坛/AI隔离；凤凰源召唤/替换/召唤事件、负恢复及普通伤害耗尽/同句柄变蛋、直接创建蛋/蛋受伤和击杀/10秒孵化/合法落点/地面飞行/占地/视野/形态事件重入、特殊类型/运输/爆炸/幻象/定时生命及长期反复循环。Apxf已进入凤凰火焰独立阶段队列；全部变形旗帜/高度和出生过渡/进度指示/音效/窗口/GPU/AI以及三图长局/性能/资源释放继续后续实现或验收，边界见[重生与凤凰](rebirth-phoenix.md)。旧MEngine队列保持原状态。

## 剑刃风暴、地震与巫毒阶段待验证

路径：session_hero_ultimates、spell_info/spells/area_spells/channels、CastOrder标记及UnitBuff来源、entities序列/动作、ability_commands按钮、combat_orders/weapons禁攻、damage和tick。消费AOww、AOeq/SNeq、AOvd及地图覆盖。

必要Win32 Release产品编译无警告、差异检查通过，生命周期独立只读审核未发现可证实问题；没有执行新专项、三图、原件指令、GPU或性能回归。实现接入，运行及原版一致性待阶段验证；证据为tmp/docs-artifacts/war3/hero-ultimates/implementation-build.log、implementation-receipt.json和lifecycle-review.md。

阶段合并英雄学习/源按钮/快捷键/费用/冷却与地图覆盖、剑刃风暴7秒/尾帧/旋转/移动/追随/攻击移动/禁攻禁施法/物品、原伤害分类/英雄建筑与魔免/虚无/外壳/护盾、暂停/变形/运输/隐藏/能力增删/转让/死亡/复活；地震延迟/面积插值/建筑及树木碎片/单位减速、原关系与类别/友伤/魔免/周期；巫毒自身排除/其他施法者保护/进出范围/无敌与伤害、多个来源/票据/重施放/驱散/直接删除；两种Channel的控制/停止/替换/完成/删除/事件重入与附件清理。循环音效/全部模型尺度/状态图标/窗口/GPU/AI、三图长局与性能/内存/切图留阶段完成/验收；未列出的终极技能仍待实现，边界见[英雄终极技能](hero-ultimates.md)。旧MEngine队列保持原状态。

## 群体传送与传送物品阶段待验证

路径：session_teleport、spell_info/spells/area_spells/channels、CastOrder库存来源/支付、item_use/库存输入、game_view小地图目标和weapons保护。消费AHmt/AImt、AItp/stwp、AIrt/amrc与地图覆盖，保留源按钮/模型及六槽命令。

必要Win32 Release产品编译无警告、差异检查通过；未执行新专项、三图、GPU或性能回归。实现接入，运行和原版一致性待阶段验证；证据为tmp/docs-artifacts/war3/teleport/implementation-build.log及implementation-receipt.json。

阶段合并源等级/人数/延迟/冷却/聚集与地图覆盖，英雄学习/目标/库存六键及六槽脚本命令、单位/地点/小地图/主城定位、本人/盟友/中立/建筑/魔免/无敌/视野/特殊类别、消耗/公共冷却/最后删除/施法与使用事件重入、开始/支付/持续/停止/控制/死亡/移除/转让/能力变化/隐藏/暂停，源目标移动/死亡/失去联盟，传送与召回方向/人数/自身名额/距离/顺序、路线/战斗/工作/库存/人口保留、地形/空位/飞行分层/聚集/相对偏移/空间事件/占地/迷雾、回城无敌的开始结束及伤害/脚本组合、源附件/窗口/指示/音效/相机、AI和三图长局/性能/内存/切图。特殊权杖/复合物品等缺口与当前规则见[传送](teleport.md)，旧MEngine队列保持原状态。

## 恢复、保护、加速和驱散消耗品阶段待验证

路径：consumables/session_consumables、item_use目标/库存入口、UnitBuff/tick/附件、damageUnit最终伤害和moveUnits实际速度。消费AIrg/AIvu/AIsp/AIsa/AIha/AImr/AIra/AIdi及源别名与地图覆盖。

必要Win32 Release产品编译及差异检查通过；没有执行新专项、三图、GPU或性能回归。实现接入，运行与原版一致性待阶段验证，证据为tmp/docs-artifacts/war3/consumables/implementation-build.log。

阶段合并hslv/plcl/sreg/pnvu/pnvl/pspd/shas/shea/sman/sres/wneg/sneg/rdis及AP*符文、单位/地点/自身输入、源掩码/魔免/无敌/建筑/满资源标志、费用/共享冷却/次数/最后删除/拾取和使用事件重入、持续总量/英雄时限/暂停/受伤/零伤害/外壳/护盾/友伤/死亡/转让/驱散/替换、源buff及能力查询、加速/减速/光环/装备/形态/速度上限、范围驱散/召唤/幻象/空区域和符文自动生效。恢复与中断/叠加公式、所有物品/树木驱散/音效/AI、完整UI/GPU、三图长局/性能/内存/切图仍在阶段队列，见[消耗品](consumables.md)。旧MEngine队列保持原状态。

## 装备属性、永久物品与复合使用阶段待验证

路径：equipment/session_equipment、物品清单/主动选择/库存权限、拾取/交换/丢弃/移除/死亡、英雄查询/成长/学习、单位能力/科技/形态/幻象快照、武器/攻速/防御/减伤/吸血/移动/恢复/迷雾及原被动按钮。消费AIab/AIat/AIde/AIas/AIml/AImm/AIms/Arel/AIrm/AIsr/AIva/Amim/Ault及派生，永久AIam/AIim/AIsm/AIxm/AImi/AIem/AIlm与单主动+已支持被动的复合物品。

必要Win32 Release产品编译无警告，原表字段和差异检查通过；没有执行新专项、三图、GPU或性能回归。实现接入，运行和原版一致性均待阶段验证，日志为tmp/docs-artifacts/war3/equipment/implementation-build.log。

阶段合并各装备/副本/多个能力/来源/覆盖、增减与拾取/丢弃/使用事件重入、英雄基础/脚本奖金/装备/永久成长的隔离及查询、容量/资源比例/死亡、武器/光环/暴击/吸血/减伤、速度/负值/原叠加开关、恢复/昼夜/荒芜、魔免/夜视、形态/归属/科技/复活、幻象开关及原物品图标/HUD/完整窗口/GPU。gvsm主动控制+智力及书籍的资源/次数/冷却/等级/事件加入本阶段，完整物品/法球/火焰/AI/界面/原版精度/三图长局/性能/内存/切图继续对应队列。来源、当前算法与限制见[装备与永久物品](equipment.md)，旧MEngine队列保持原状态。

## 归属转换与占据阶段待验证

路径：session_ownership、共享SetUnitOwner/人口/科技/光环/视野/AI分组、源原型/目标/动态费用、独占声明/施法票据/保护/承伤/Channel、单位动作及原查询/按钮、item_use选敌/消耗。消费Apos/Aps2/ACps、ANch/ACch、Acmg、AIco/ccmd及w3a派生。

本轮只执行必要Win32 Release产品编译和差异审查，没有运行新专项、三图、GPU或性能回归；实现接入，运行和原版一致性均待阶段验证。证据为tmp/docs-artifacts/war3/control-ownership/implementation-build.log。

阶段合并源等级/目标/前置/费用、独占与保护/承伤/取消、共享native与真实捕获、全部来源/守卫/召唤/幻象、句柄/人口/预留/旧命令/库存/科技/光环/颜色/视野/AI、持续占据与女妖死亡/移除/选择、捕获/人口/死亡/施法事件的删除/再次转让/重入、物品三次/最后消耗/目标输入，以及运输/建筑/生产/复活组合、源附件/按钮/UI/声音/GPU与三图长局/性能/内存/切图。控制费用和Bcmg/寿命语义仍需原件核对，旧式占据弹道、复合物品gvsm已接入装备阶段队列，黑暗转换/灵魂流程待实现。来源、当前公式与具体边界见[控制权转换](ownership-spells.md)，旧MEngine队列保持原状态。

## 汲取、法力燃烧与牺牲阶段待验证

路径：session_resource_spells、原型/目标/施法/Channel/延迟载荷、CastOrder闪电及来源票据、共享伤害/虚无开关、buff奖励容量/衰减/释放、原按钮/附件及人口/尸体/死亡事件。消费AHdr/ANdr/ACdr/ACsm、AEmb及别名、AUdr/AUdp与w3a覆盖。

本轮只执行必要Win32 Release产品编译和差异审查，最终无警告；新增专项、三图、GPU和性能回归未运行。实现接入，运行和原版一致性均待阶段验证；证据为tmp/docs-artifacts/war3/drains/implementation-build.log。

阶段合并等级/覆盖/目标、费用/冷却/事件、逐周期资源守恒/回流/友军输送、超额上限/衰减/容量及查询、牺牲当前/最大生命与百分比/保留目标基准、死亡/人口/尸体/恢复和回调重入、烧蓝延迟/实际魔法/免疫/护盾组合、施法距离/断开距离/多人来源/驱散/隐形/运输/死亡移除/转让/能力增删/暂停，以及源图标/挂点/循环声音/窗口/GPU、AI和三图长局/性能/内存/释放。新公式尚需原件核对，物品AIdp目标流程已接入、交互与次数/冷却待测，完整AI/音效仍待实现；边界及入口见[汲取与牺牲](drains-sacrifices.md)，旧MEngine队列保持原状态。

## 自身强化与防御阶段待验证

路径：session_self_spells、源原型/施法/订单/事件/tick、UnitBuff/生命回收、共享伤害/固定攻击载荷/真实弹道、能力查询/移除、源按钮/工具提示/模型序列及item_use。消费AHav/Absk/Adef/AHds/AEim/ANms及派生w3a；物品AHds/Absk共用真实效果。

本轮只做必要Win32 Release产品编译和差异审查，不运行新增专项、三图、原件精度、GPU或性能回归。新玩法实现已接入，运行与原版一致性保持待验证；证据为tmp/docs-artifacts/war3/self-abilities/implementation-build.log。

阶段合并源等级/覆盖/费用/缓冲/开关冷却、事件和回调重入、行进/攻击中即时开关、额外生命与英雄成长/变身/死亡/复活、能力增删/转让/禁用、无敌/魔免与各种武器/脚本伤害、狂暴承伤/攻速/移速、反弹/减伤/输出、献祭周期/类别/范围/耗蓝/暂停/运输、护盾部分吸收/缺蓝/外壳组合，以及物品次数/冷却/事件。完整音效/模型/附件/按钮/窗口/GPU、AI、三图长局/性能/内存/切图仍在阶段队列；普通missile以外反弹及连续反弹规则待完成或核对。操作入口与来源见[自身强化与防御](self-abilities.md)，旧MEngine队列保持原状态。

## 吞树与毁灭者消费能力阶段待验证

路径：session_eat_tree/magic_consumption/orb_attacks、原型/施法/目标/事件/tick、树木占用/生命/路径、buff/源恢复/回流弹道、普通攻击/前摇/支付/CombatProjectile、原按钮/排序/占位/自动开关、游戏树木选择/携树挂点及consumption消费者。消费Aeat/Advm/Aabs/Afak、原订单、撕裂/吞食/恢复、驱散/友军开关/收益、资源扣除/上限和源法球范围。

必要Release产品/新消费者编译无诊断，差异检查通过；eat/devour/absorb/orb四模式最终4通过/0失败、无Game.dll。覆盖真实树木/占用取消/挂点状态/延迟恢复，驱散/友军正面例外/召唤伤害/回流与空区域，本人目标/扣除与上限，实际法球攻击/手动与自动/一次支付/快照/比例/友军排除/空魔法回退和按钮不重叠。仅重测夹具前置失败及本批变更影响的模式；没有运行旧全套/三图/GPU/性能。来源、命令及限制见[消费能力](consumption.md)，证据为tmp/docs-artifacts/war3/eat-magic/。

阶段合并全部等级/w3a/字段边界/buff与目标分类、树木竞争/取消/距离/暂停/死亡转让/移除/原生写入/回调重入，原件资源/恢复/回流/攻击时点/手动事件、法球阈值/取消/其他攻击效果/免疫/护盾/虚无/召唤与特殊范围，超过12指令/技能书/热键/提示文本/排序、原素材/动画/携树附件/声音/窗口/GPU、完整AI与三图长局/CPU/内存/切图释放。其他能力与完整客户端继续实现，原版一致性未验收；旧MEngine队列保持原状态。

## 古树扎根与拔根阶段待验证

路径：session_roots/原型/施法/tick、RootState/转换/初始化/占地、移动/追击/武器/伤害/查询、生产/研究/升级/资源返还/缠绕矿、原按钮/动态目标/建筑预览、Model序列和新roots消费者。消费Aro1/Aro2源掩码、2.5秒转换、转向/防御分类、root/unroot订单及原动画姿态。

必要Release产品/新消费者编译无诊断，差异检查通过；flow三组/models一组最终4通过/0失败、无Game.dll，覆盖真实WPM移动/占地/预留取消/原句柄/按钮与生产，守护者远近武器/防御伤害、生命之树缠绕矿释放/储量，以及原古树和雕像的CPU动画选择。命令/来源/限制见[古树扎根](ancient-roots.md)，证据为tmp/docs-artifacts/war3/ancient-roots/。

阶段合并全部古树/中立/w3a/武器/转向、原版建筑分类/碰撞/路线/角度/计时及生产限制、缺失WPM/边界/多人抢位/脚本移位/暂停/取消/死亡移除/转让/能力增删/回调重入、完整矿工返还/经济/AI，模型选择变化影响的所有原动作/模式/变体/过渡/挂点/音效/源按钮网格/GPU，以及三图长局/CPU/内存/切图释放。吞树已接入对应阶段队列，完整客户端继续实现，原版一致性未验收；旧MEngine队列保持原状态。

## 亡灵形态阶段待验证

路径：session_unit_forms/原型/施法/tick、UnitState/类型初始化/生命魔法/人口费用、visibility/detection/regeneration、原按钮/模型序列与新undead_forms消费者/复制夹具。实际消费Aave/Astn/Abur及同原型覆盖、原订单/前置/造价差/额外人口、永久及即时转换、8额外恢复与钻地侦测位2。

必要Win32 Release产品/消费者编译无诊断，Python AST及差异检查通过；本批3组与共享框架受影响的熊/鸦/恶魔3组有限回归均通过/0失败，无Game.dll。证据为tmp/docs-artifacts/war3/advanced-forms/；来源、命令与边界见[亡灵形态](undead-forms.md)。没有运行三图/旧全套/完整GPU/性能。

阶段合并全部等级/w3a/标志组合/不同种类的付费转换、源计时/石像冷却/魔法及恢复精度、资源/人口/取消/转让/能力增删/死亡移除/脚本回调重入、WPM落地/半径/路径类型、隐形/侦测/控制/运输/复活组合、原模型/按钮/音效/窗口/GPU、AI与三图长局/CPU/内存/切图释放。吞树与毁灭者能力已接入对应阶段队列，完整客户端继续实现；原件RTTI/订单观察不作为完整行为验证，旧MEngine队列保持原状态。

## 单位变身阶段待验证

路径：session_unit_forms/原型/施法/事件/tick、UnitState/死亡移除/科技/人口、源命令/反向按钮/模型序列及附件、新unit_forms消费者/复制夹具与CMake。实际消费Abrf/Arav/AEme普通和交替类型、morphFlags、源魔法/冷却/时长、飞行高度/着陆延迟和500生命奖励。

必要Win32 Release产品/新消费者编译及差异/Python AST检查通过；最小流程最终3通过/0失败，无Game.dll，覆盖熊往返/比例/人口/无魔法免费返回、乌鸦起飞/高度/速度/落地，以及恶魔成长/库存/额外生命/到期/死亡恢复。源参数与复现命令见[单位变身](unit-forms.md)，原始记录为tmp/docs-artifacts/war3/unit-forms/。

阶段合并源等级/w3a/标志组合/永久与计时/科技和原生属性写入、取消/暂停/控制/所有权/死亡移除/回调重入、落地障碍/路径类型/脚本移位/运输、英雄复活/幻象/能力增删/脚本buff移除及完整叠加、原模型动画/附件/按钮/声音/GPU、AI与三图长局/性能/内存/切图释放。付费转换和亡灵变身已接入对应阶段队列，其他变身原型继续实现；原版公式/时序/还原度未验收，完整客户端与旧MEngine队列保持开放。

## 变形与飓风阶段待验证

路径：session_morph_spells/原型/控制/施法/动作/native、UnitBuff/MorphAppearance/原单位状态、伤害/驱散/库存/被动/光环/移动/采集建造生产、game_morph/GameView/game_effects原模型与命令/图标/选取/附件、CMake及新morph消费者/复制夹具。实际消费AOhx/Aply四类源形式/最大野怪等级/100速度、Acyc的cyc1/英雄普通时长、原Bcy2载体与Sprite First Ref。

必要Win32 Release产品/新消费者编译、Python AST及差异检查通过。morph/cyclone/models三组最小模式最终3通过/0失败、无Game.dll，覆盖原句柄/类型/库存/属性写入/移动/能力/光环与飞羊、真实无敌/气旋载体/驱散/真实w3a不可驱散覆盖/到期，7个代表形态和原旋风附件CPU轨迹。lifecycle仅编译、未执行；GPU未执行。来源、命令和证据见[变形与飓风](morph-cyclone.md)，原始记录为tmp/docs-artifacts/war3/morph-cyclone/。

阶段合并四类/候选/随机次序/野怪英雄/w3a、免疫/重叠/刷新/暂停/转让/死亡移除/施法者消失/原生属性/回调重入、完整库存/能力/运输/采集生产/光环/侦测组合、飓风分类与CycloneStasis/计时/落地/可驱散语义，原模型/选取/图标/附件/过渡/声音及三图长局/CPU/GPU/内存/切图释放。其余变身、能力/native、战役/存档回放/局域网和完整客户端继续实现；旧MEngine队列保持原状态。

## 控制技能阶段待验证

路径：session_control_spells/原型/施法/弹道/自动施放、UnitBuff/动作/移动/分类/native、伤害/恢复/武器/光环/高度表现、GameView/game_effects/原按钮与树木目标、CMake及新control消费者/复制夹具。实际消费Aens/Aweb/AUsl/Aprg/AHbn、原等级/前置/物理控制/落地/睡眠保护/暂停恢复/魔法损失/虚无系数及树木生命周期/事件。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过；flow/purge/lifecycle最小模式最终3通过/0失败、无Game.dll，覆盖网的地面武器/高度、睡眠保护与伤害唤醒、净化/虚无/召唤/树木/治疗、施法者移除/显式唤醒/零高度差恢复及原移动意图。夹具真实冷却/移动距离前置修正后只重测对应失败模式。autocast仅编译、未执行；已发射攻击保护边界经静态审查/必要编译，相关专项仍待执行。来源、命令、缺口与本地产物入口见[控制技能](control-spells.md)，证据为tmp/docs-artifacts/war3/control-spells/。

阶段合并w3a/等级/前置/免疫/联盟/物理网开关、重叠/暂停/驱散/死亡转让/移除/重入、网双重分类/原近战范围/净化档位与时序、睡眠/法术及物品恢复/虚无伤害/已有和反弹溅射攻击、树木可见性/取消/失败资源、原按钮/目标/动画/透明材质/声音、AI与三图长局/CPU/GPU/内存/切图释放。妖术/变羊/飓风进入对应阶段队列；中立夜间睡眠及完整原版规则继续实现；完整客户端与旧MEngine队列保持开放。

## 绞肉车尸体货舱与挖掘阶段待验证

路径：session_corpse_cargo/transport/corpses、UnitState/死亡恢复/移除、原型/被动/命令/自动施放/右键目标、game_transport/GameView原按钮/尸体肖像、CMake与新消费者/复制夹具。实际消费Sch2/Amtc的8格/0.5秒/区域范围、Amel/Amed原装卸流程和Aexh的15秒/ugho/5具上限及Ruex前置。

必要Win32 Release产品/消费者编译、Python AST/差异检查通过。cargo/exhume两组最小检查最终2通过/0失败、无Game.dll；首次exhume夹具超出单次60秒推进上限，拆分后同模式通过。旧decay夹具的91秒调用同步拆分，旧模式未重跑。lifecycle/autocast模式仅编译、未执行；来源/限制/命令见[尸体货舱](corpse-cargo.md)，证据为tmp/docs-artifacts/war3/corpse-cargo/。

阶段合并满舱/竞争/尸体类型/装载事件与回调重入、死亡移除/舱内复活/暂停/转让/能力覆盖增删/容量研究改变、自动收集/卸载取消/合法落点、与食尸/复生/复活组合，以及原按钮/肖像/动画/声音、AI、三图长局/CPU/GPU/内存/切图释放。源邻接开关订单、精确生成/卸载时序和完整原版行为待验；完整客户端及旧MEngine队列保持开放。

## 尸体、食尸与复活阶段待验证

路径：corpses/session_corpses/corpse_spells、UnitState/死亡/恢复/祭坛/自然移除/只读查询、spells/channel/自动施法/物品与powerup拾取、原按钮/死者点选/game_corpses、CMake、新corpse消费者与复制夹具。实际消费deathType/death及源衰败时长、CreateCorpse/UnitSuspendDecay/SetUnitExploded/GetDecayingUnit、食尸占用/回复、Arai骷髅、AHre原句柄复活、AUan定时单位、Aast恢复及复活物品。

必要Win32 Release产品/消费者编译、Python AST/差异检查通过。flow/freeze两组最小检查合计2通过/0失败、无Game.dll，覆盖占用/竞争/打断/回复、真实骷髅/原句柄人口复活，晚期暂停年龄/姿态及恢复。spirit/items/decay/autocast模式仅编译，进入阶段合并队列；先祖之魂/操纵死尸/符文与库存/自然衰败事件/英雄消散/完整自动施法没有运行通过结论。源字段/死亡枚举/native声明、原件摘要与有限类名观察位于tmp/docs-artifacts/war3/corpses/，入口见[尸体玩法](corpses.md)。

合并食尸完成/剩余量/暂停/驱散/死亡/所有权/回调重入、源等级/w3a/科技/魔法人口/目标优先级/资源拒绝、召唤与原句柄/库存/物品触发及衰败后查询、原画面/选择/动画/声音和三图长局/CPU/GPU/内存/切图释放；尸体运输/挖掘进入对应阶段队列；完整亡灵AI及完整客户端继续实现，原版公式/时序/事件/视觉精度保持待验收。

## 地洞驻军与吞噬阶段待验证

路径：session_orc_cargo/transport、原型/spells/命令/武器/研究/伤害/tick、UnitBuff/真实生命周期、game_transport/原按钮、CMake、新orc_cargo消费者与复制夹具。实际消费Abun/Abtl/Sbtl/Astd、Advc/Adev/ACdv、源UnitID/临时开关、矿内/外工人和返工、驻军武器、Bdig/Bdvv及实际消化/死亡/击杀者。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过。flow最小流程1组通过/0失败、无Game.dll，覆盖4格驻军/实际开火/Stand Down、吞噬目标拒绝/货舱/双标记/消化伤害/默认不可卸载/死亡清理与击杀者。矿内征召和隐式load增量未复用为运行通过；work/release/manual模式仅编译，进入阶段合并队列。证据为tmp/docs-artifacts/war3/orc-cargo/，来源与命令见[兽族货舱玩法](orc-cargo.md)。合并临时返工/矿内/混乱农民/并发/满舱、死亡移除/状态清理/暂停/恢复/转让/重入、原冷却/伤害/魔免/等级/w3a，以及窗口/源声音特效/肖像和三图长局/CPU/GPU/内存/切图释放；完整四族/战役AI、原版规则与精度仍开放。

## 单位运输阶段待验证

路径：transport/session_transport、entities/combat/script_state、spells/原订单/目标/命令/伤害/死亡移除/恢复/tick、game_transport/GameView原命令与乘员栏、CMake、新transport消费者及复制夹具。实际消费Sch3/Acar容量、UnitData.cargoSize、Aloa/Adro/Adri、load/smart/unload/unloadall/unloadallinstant、真实清单/隐藏/坐标/事件与逐员卸载。

必要Win32 Release产品/新消费者编译、Python AST/差异检查通过。flow最小流程1组通过/0失败，无Game.dll：1+1+2格装载/搭乘、真实事件/native、移动承载、舱内命令/伤害拒绝及单独/即时全部卸载。证据为tmp/docs-artifacts/war3/transport/，来源/命令见[运输流程](transport.md)。capacity/lifecycle/orders模式仅编译、留阶段执行；合并满舱/覆盖/禁用/队列取消、载具/乘员死亡移除/转让/重入/暂停、合法落点/阻挡/联盟/原声音、真实窗口/肖像/热键与三图长局/CPU/GPU/内存/切图释放。完整原版坠毁、海军路径/其他货舱/AI仍待实现；原件仅有RTTI及局部指令观察，不作为完整行为或精度验收。

## 风步、闪烁与镜像阶段待验证

路径：session_mobility/spells/visibility/效果/tick、combat/projectiles/真实伤害、illusion/entities、CMake、新mobility消费者。实际消费源AOwk/ANwk、AEbl/ANbl、AOmi、原订单/按钮/学习/魔法/冷却，风步攻击票据与伤害、有界合法瞬移和原两端特效、延迟镜像/替换/倍率/寿命/事件及重入边界。

必要Win32 Release产品/新消费者编译与差异检查通过；windwalk/blink/mirror三个专项模式尚未执行，直接进入阶段合并队列。证据位于tmp/docs-artifacts/war3/mobility/，来源和复现入口见[机动与镜像](mobility.md)。合并现有隐形/战斗/技能/物品/幻象消费者、源等级/w3a/暂停/死亡/所有权/取消/回调重入，闪烁障碍/边界/最小最大/失败，镜像成长/替换/真实窗口/声音特效，及三图长局/CPU/GPU/内存/切图释放；动态碰撞、精确伤害/时序/随机/视觉与完整原版仍待实现或验证。REA当前缺少可用深度后端，原表/既有消费者依据照常保留，没有以查询失败代替行为证据。

## 影遁、Ghost与主动显形阶段待验证

路径：session_stealth_reveal/visibility/fog/spells/passive/item_use/inventory/tick、entities/spells、GameView原命令/物品目标、CMake、新stealth消费者与生成器。真实消费昼夜/行动淡入、Ghost、临时范围/全图视野/侦测和随单位移动的多玩家显形状态；原crys无限使用、dust次数、点物品与小地图连接同一流程。

必要Win32 Release产品/消费者编译、Python AST及差异检查通过；flow最小流程最终1组通过/0失败、无Game.dll，覆盖昼夜影遁/移动与恢复、Ghost、水晶球目标/视野/侦测/无限使用/冷却与到期；首个夹具前置断言已按未探索遮罩语义修正后复测同流程；证据位于tmp/docs-artifacts/war3/stealth-reveal/，详见[影遁与主动显形](stealth-reveal.md)。dust/meld/tower模式保留阶段执行，合并原玩家共享/暂停/死亡转让/重入、可用性/覆盖/驱散、全图/地形迷雾、真实按钮/点选/取消/特效声音及三图长局/CPU/GPU/内存/切图释放。订单映射、淡入/行动/侦测边界和原版精度未验收；完整客户端及旧MEngine队列保持开放。

## 隐形、侦测与目标可见性阶段待验证

路径：session_visibility/fog/spells/caster/被动/物品/库存/生命周期/AI、状态/原native、攻击/目标、GameView/附件/选取/小地图、order_ids、CMake及visibility消费者/生成器。实际消费Aivs/AIvi/Apiv、真实视域源范围/类型、共享视野/侦测网格、玩家与AI查询、破隐/淡入/驱散与真实操作/画面可见性。

必要Win32 Release产品和新消费者编译通过，Python语法/差异/346项订单排序和唯一性检查通过。spell模式最小流程最终1组通过/0失败，覆盖真实施法与玩家/AI查询、不可攻击、侦测进出/同帧更新、共享/撤销、移动和攻击出手破隐，无Game.dll。检查发现JASS字符串attack缺少注册，已核对REA并补齐attack/smart，只复测同条流程。证据位于tmp/docs-artifacts/war3/invisibility/，详见[隐形与侦测](visibility.md)。

passive/potion模式已编译但未执行。阶段合并旧战斗/技能/物品/AI消费者，验证源等级/持续/淡入/w3a/英雄/被动物品、驱散/死亡/所有权/重入、检测类型/范围/可用性/多玩家/共享/地形迷雾、攻击/目标丢失/在途弹道/范围伤害、状态/选择/原图标/半透明材质/附件及三图长局/CPU/GPU/内存/切图释放。Ghost/Shadow Meld/主动显形增量见本页新增队列，风步增量见本页机动队列，潜地/完整UI声音仍待实现，原版破隐/淡入/侦测边界与计数/视觉精度未记为通过；完整客户端及旧MEngine队列保持开放。

## 建筑反召唤阶段待验证

路径：session_unsummon、Auns/spells/源命令、AI指令与GetBuilding、entities/队列/经济/矿井/战斗/修理/所有权/死亡/移除、Birth及进度界面、CMake、新unsummon消费者与夹具。实际消费源Auns、已有工人施法、持续生命消退/分批退款、实际队列/人口/矿井与生命周期。

必要Win32 Release产品及新消费者编译通过，Python AST/差异检查通过。只执行新资源/生命周期最小检查1组通过、0失败，覆盖源按钮/U键、远程订单、敌方/重复拒绝、持续消退/返款、工人死亡后继续、75金/25木、10人口供给释放、非采集统计及无Game.dll。证据位于tmp/docs-artifacts/war3/unsummon/，详见[反召唤](unsummon.md)。

ai/boundaries模式已编译但尚未执行。阶段合并原UnsummonAll/缺少工人/多建筑、暂停/转让/死亡/移除/回调重入、现有生产/研究/复活/升级返还、施工取消、受损/受攻/治疗/零速率/费用及w3a、覆盖矿储量/工人清退和资源返还、真实按钮/热键/原Birth/声音/特效，及三图长局/GPU/CPU/内存/切图释放。DataB原件调度、返还舍入/损伤公式、完整目标/范围/不可取消规则与死亡事件/消失方式保持原版精度待测，不关闭完整客户端及旧MEngine队列。

## 战役AI采集与部队阶段待验证

路径：ai/session_ai_armies/control/natives/economy/guards/lumber/session、CMake、新campaign消费者及夹具生成器。实际消费5个新增AI native、原CampaignAI开局、下一心跳配额保留/补足/下降/返还、互斥编组与后续自动补员、实际队长传送及已有单位的持续出击。原件位开关/慢速数值/分派入口已有REA依据，完整规则仍待对照。

必要Win32 Release产品及新消费者编译通过，差异/Python语法检查通过。仅原CampaignAI开局最小检查1项通过/0失败：4秒时1城镇/2常驻线程/6名采集工人/2项真实生产队列，无Game.dll。首次2秒观察未覆盖下一采集/生产心跳，消费者观察窗口调整为4秒；原始日志保留于tmp/docs-artifacts/war3/campaign-ai/，详见[战役AI](campaign-ai.md)。

armies/harvest专项尚未执行。阶段合并既有AI/守卫/采集/战斗消费者，验证编组开关/补员/暂停/施法/定时生命、传送/裁界/落点与队籍、出击数量/类型/阵营/目标失效、配额下降/跨镇/-1/资源返还/矿内/忙碌/所有权/回调重入、四族慢速采集/正常恢复，以及真实战役/三图长局/GPU/CPU/内存/切图释放。原版编组优先级/精确数值顺序/阵形/时序未记为通过；完整AI/战役及旧MEngine延期队列保持开放。

## 祭坛英雄复活阶段待验证

路径：session_revival及英雄/食物/死亡/移除/转让、production/commerce/订单/状态、GameData源取消控件/命令/输入/特效、AI旧英雄分派和SetNewHeroes、CMake及复活fixture/消费者。真实费用/时间/退款、同句柄成长/技能/库存、票据/事件/人口及AI/UI都有消费者。

开发必要产品/消费者编译通过。新机制最小生命周期最终4组通过/0失败：付费复活及原对象/源状态/事件，取消/祭坛移除退款，转让/脚本复活/getter隔离，以及AI禁止新增仍复活旧英雄/开启后真实付费训练。原始证据为tmp/docs-artifacts/war3/hero-revival/，详见[英雄复活](hero-revival.md)。没有运行旧全套、三图/全族完整回归、GPU、性能或原件差分。

酒馆/英雄令牌/完整尸体/声音/英雄栏继续实现；原版人口/数值舍入/事件时序/恢复组合、并发队列/前置/阻塞/暂停、死亡移除转让/回调重入、库存/技能、真实窗口/取消/热键/特效/三图长局及资源释放按阶段合并验证。完整英雄/客户端和旧MEngine队列保持开放。

## AI暂停、守卫与部队控制阶段待验证

路径：jass_threads/runtime所属VM与暂停排队、session_ai_control/guards及状态、单位/战斗返回、实际生产/采集/选址、CMake与新增AI控制fixture/消费者。新增5个common.j和9个common.ai入口连接实际状态；未知native继续明确失败。

必要Win32 Release产品/消费者编译通过。新增2项暂停调度和3组真实会话检查通过、0失败，覆盖两个AI独立推进、嵌套/回绕暂停、剩余等待/新线程/取消、岗位/定时生命保留/跨玩家清除，以及实际扣费补员队列。亡灵原AI由BootyBay原main启动并推进2秒通过：1城镇/1生产队列/2待建施工/5线程，无Game.dll。证据为tmp/docs-artifacts/war3/ai-control/；原件计数/判断/守卫位与native调用关系见[AI控制](ai-control.md)。

阶段合并原版暂停时机/等待计时、守卫初始登记/选择/补员完成/默认次数/追击/返回、句柄销毁/转让/回调重入、定时生命筛选与部队控制、三图长局/GPU/CPU/内存/切图释放。完整四族/战役/运输/变形/全部native仍待实现；本次没有全套或性能通过结论，旧MEngine延期状态保持。

## 原AI脚本与基础对局控制阶段待验证

路径：ai/session_ai/economy/natives、Runtime共享域/代码VM所属/继承边界、ExecuteFunc、源unitClasses及分类消费者、CMake和AI原图驱动。实际消费：每玩家私有源脚本/变量、公共句柄/调度、真实付费生产/研究/建造、城镇/矿井/采集、扩张/队长/英雄/敌情/盟友目标与命令FIFO。未知native继续明确失败。

必要产品/消费者编译通过；共享域修改后VM11项、会话5组通过、0失败。BootyBay原main真实电脑槽1启动human.ai并推进2秒通过：1城镇、5订单、2队列、3采集、2待建/施工、5线程，无Game.dll。首次-1采集参数阻塞和源分类大小写问题已修正，只复测同条开局。证据为tmp/docs-artifacts/war3/ai/，见[AI说明](ai.md)。

后续阶段合并完整四族/战役脚本、持续建造/科技/采集/人口/扩张、队长和英雄策略、跨VM事件/上下文/异常与取消、分类对修理/古树/目标/被动伤害的影响、三图长局/GPU/CPU/内存和原版精度。守卫/运输/暂停/变形/全部native仍待实现；本项只关闭开发最小阻塞，完整功能和旧MEngine队列保持开放。

## 脚本等待与协作线程阶段待验证

路径：jass_threads/runtime、session_threads/callbacks/tick、main/game_view与两个新消费者/fixture。实际消费：TriggerSleepAction、ExecuteFunc、独立trigger/timer、动作串/并行、TriggerExecuteWait、每线程预算/上下文、main等待状态及取消栈展开。

开发必要产品及消费者编译通过。VM最终10项通过：首次8通过/2失败；校正检查的实际Real时间边界后仅重跑失败2项，2通过/0失败，生产调度未改。真实会话5组通过/0失败；BootyBay原main和250ms集成退出0，main_completed=true、script_threads=0、bj_gameStarted=true，无Game.dll。证据为tmp/docs-artifacts/war3/script-threads/，详见[脚本线程](script-threads.md)。

原版最小等待/量化、getter跨wait、复杂重入/销毁/事件顺序、暂停/倍率、完整AI/Sound wait、LAN确定性、持续切图/CPU/内存保留阶段验证；本次未运行三图、GPU或性能，不关闭功能阶段和旧MEngine队列。

## 施法单位状态、驱散与自动施法阶段待验证

路径：spells/entities/session_spell_info/spells/caster_spells/autocast、实际状态/战斗/移动/伤害/恢复/缩放/驱散/能力筛选、源训练前置/学习/命令/原自动施法图标与PRE2界面模型、CMake及caster生成器/消费者、effects新增单资源模式。

实际消费：医疗/减速/心灵之火/嗜血/回春/邪恶狂热/诅咒/两种驱散/反魔法外壳十种原型，Aams完全魔免与Aam2吸收300，实际源数值/状态/生命周期/召唤/伤害/科技条件；六种自动施法的字符串/ID/默认开关、空间候选/排序、自然完成后的原命令恢复、右键/Art/Unart/说明与源四PRE2 UI指示器。现有33种主动/持续加14种光环/被动。必要产品及spell/channel/passive/caster/effects编译通过，Python AST与差异审查通过。仅执行新启动资源必要CPU导入，UI-ModalButtonOn四源发射器成功消费，无Game.dll/GPU。证据为tmp/docs-artifacts/war3/caster-spells/{source.json,autocast-model.json,autocast-import*.log,build-final.log,static-checks.json}。

专项行为程序尚未执行。阶段合并caster与已有技能/被动/战斗消费者，覆盖训练前置/升级/禁用、目标/资源/冷却/事件/重入、状态叠加/时序/恢复/取消、普通与英雄/魔免/无敌/结构/外壳完整分类/溢出/驱散、召唤/幻象与魔法损失、诅咒与暴击/弹跳/范围武器、六种自动施法阈值/优先/交战/范围/移动工作命令优先/恢复/取消、满级学习菜单、原图标/右键/粒子界面深度/缩放/混合/多实例、三图/持续切图/CPU/GPU/内存。当前默认/数值顺序/行为不记为原版精度结论；完整选项/非单位状态/状态栏/声音/控制与变形/技能AI仍待实现。详见[施法单位与自动施放](caster-spells.md)，旧MEngine队列继续延期。

## 光环、被动与实际战斗修正阶段待验证

路径：passives/session_passive_info/auras/attack_passives、单位/战斗/武器命中/伤害/恢复/移动/生命周期、能力学习/命令/预加载、真实buff查询/移除、库存被动来源、CMake及passive夹具/专项程序。

实际消费：七种英雄光环、命令/战鼓/治疗守卫，共十种光环；重击/致命一击/闪避/分裂四种攻击被动。空间刷新、当前同buff最强来源/源等级/残留、自定义/持有物品来源，真实移速/攻速/护甲/伤害/恢复/命中/眩晕/吸血/反伤/次级伤害、原被动学习/按钮/说明、共享GeneralAuraTarget、实际光环查询/移除/再应用及死亡/移除清理已接通。必要Win32 Release产品、spell/channel及新passive消费者编译通过，Python AST与差异审查通过；专项程序、模型导入和GPU没有执行。证据在tmp/docs-artifacts/war3/auras-passives/，包含源字段/标签、buff资料和build-final.log。

阶段合并passive_tests与原spell/channel/相关战斗消费者，覆盖最强/降级/范围/残留/等级/覆盖/所有权/幻象/暂停、百分比/原始数值/武器掩码、物品拾取/转移/丢弃/移除、buff分类/驱散/再应用、0/100%及实际随机、Critical/Bash/Evasion/Never Miss顺序、分裂几何/护甲/敌我、吸血/反伤/过量伤害/死亡重入、源视觉共享/退役、被动学习/快捷键/按钮与三图/冷施法/切图/CPU/GPU/内存。刷新间隔/默认2秒残留、跨原型叠加、完整目标/百分比基数/伤害顺序/原版随机/物理分类尚未证明一致。浮字、完整状态栏/声音/其他被动/光环/自动施放/AI继续实现。详见[光环与攻击被动](auras-passives.md)，旧MEngine队列继续延期。

## 持续施法、地面效果与Channel阶段待验证

路径：spells/session_spell_info/spells/channels、范围/伤害/生命/buff消费者、game_spells/commands/view/loading、CMake、新channel夹具与专项程序。

实际消费：暴风雪/烈焰风暴/宁静/群星坠落/死亡凋零及Channel六种原型，持续脉冲/目标关系/百分比/建筑系数/树木生命、独立地面延迟/全伤/余火、打断/完成/重入和源效果；Channel四种目标/基本订单/Visible/范围源图/禁其他技能/选择组与视觉刷新。当前共23种原型。必要Win32 Release产品、原spell及新channel消费者编译无诊断，生成器Python AST和差异审查通过。原始证据为tmp/docs-artifacts/war3/channels/{source.json,source-models.json,build-final.log}；没有执行专项行为或GPU检查。

阶段合并channel_tests与原spell消费者，验证波数/周期/上限/敌我/免疫/建筑/树木/恢复，停止/移动/攻击/眩晕/死亡/移除/转让/能力失效、EFFECT重入停止/FINISH暂停、烈焰风暴独立存续/总时长、Channel覆盖/四种目标/选项/群组/快捷键/范围图/取消，以及源模型导入/冷首次施法/GPU/三图/暂停/长帧/驱散/叠加/切图/内存/性能。目标默认、伤害分配、Art Duration、Physical/Universal及Unique Cast的完整原版语义仍待对照；声音/全部技能/被动/光环/AI继续实现。入口及限制见[持续施法](channels.md)，旧MEngine批次保持延期。

## 条带、闪电与共享高度阶段待验证

路径：model/data/particles的RIBB记录/实例/材质、effects/session_lightning及真实句柄/hashtable、链式技能、game_lightning/view的源纹理/分段/颜色/可见性、World高度表面/terrain_layout/GetLocationZ与扩展effects/spell消费者、固定来源摘要。

实际消费：条带源字段/轨道/采样/寿命/图集/材质，15种源LightningData、十个闪电native/typed storage与主次技能闪电，渲染/查询共享坡道高度。必要产品/扩展消费者编译通过，新增11个native声明核对通过。只执行新增源格式必要导入：三份RIBB模型（3/16/4发射器）、四种闪电配置/两份纹理，以及插值/坡道两组期望高度检查通过，无Game.dll/GPU；未重复旧PRE2检查。证据为tmp/docs-artifacts/war3/ribbons-lightning/{build-final.log,source-import.log,source-import-result.log,static-checks.json}。

扩展spell的闪电端点/字段/typed storage/颜色/移动/可见性/销毁断言尚未执行。阶段合并条带多实例/轨道/图集/材质/重力/停止排空/跨类型排序，闪电原纹理/宽度/分段/扰动/滚动/寿命/跟随、脚本颜色/移动/失效句柄/可见性，高度/坡道/悬崖/边界与三图/17技能画面、持续切图/内存/CPU/GPU。当前分段扰动、滚动及持续时间等使用仍需原件证据，不记为原版精度完成。PREM/事件型效果/子附件/完整声音继续实现，旧MEngine队列保持延期。详见[条带与闪电](ribbons-lightning.md)。

## 源粒子、脚本特效与技能画面阶段待验证

路径：model/model_data/model_pose/model_particles、模型实例与骨骼附件、effects/session_effects与真实句柄/hashtable、spell/buff视觉生命周期、game_effects/view/scene_objects及后台模型准备、effect/扩展spell消费者，固定上游来源摘要及许可说明。

实际消费：PRE2字段/轨道/纯粒子、分实例发射/寿命/颜色/图集/过滤/头尾、ATTACH名字/变换/可见性；四个effect native、Caster/Target/EffectArt和buff挂点、法术MissileArt/弧度/时间/高度及波形模型，DestroyEffect/驱散/到期的销毁/排空。必要产品和两项专项程序编译通过，四个新增native签名核对通过。为接通此前被拒绝的纯粒子路径，仅执行两份纯PRE2和一份混合源模型CPU导入，3通过/0失败，无Game.dll；GPU未执行。证据在tmp/docs-artifacts/war3/effects/{build-final.log,source-import.log,source-import-result.log,static-checks.json}。

阶段合并squirt/轨道/头尾/模型空间/图集/过滤/尺寸/排序、共享模型多实例隔离、挂点/可见性/缩放、立即销毁/Death/粒子排空、buff刷新/驱散/死亡、冷首次施法/后台上传、视野/离屏重入/暂停/长帧、17技能和三图画面/切图/CPU/GPU/内存。扩展spell effect状态/typed storage/退休断言尚未执行。PREM/RIBB/闪电/事件型效果/子附件/完整灯光/环境雾/替换纹理/声音继续实现，当前原版精度未验收。详见[源粒子与特效实例](effects.md)，旧MEngine队列保持延期。

## 点目标、范围技能与召唤阶段待验证

路径：spell_info/spells/area_spells/summons、单位召唤归属、状态/弹道/生命/树木消费者、字符串及ID订单、game_commands/view与扩展spell夹具。

实际消费：点/无目标施法与输入；十种原型的范围伤害/状态、波形扫掠/上限、刀阵单独飞行，以及水元素/狼魂/蛇棒/地狱火/树人的源类型/数量、放置、SUMMON上下文、重召替换、落地延迟、树木死亡/解阻挡和定时生命。必要产品/扩展消费者编译通过；源数据/订单及Python语法/差异检查通过。REA复核四个原订单注册入口。证据在tmp/docs-artifacts/war3/area-spells/，专项程序尚未执行。

阶段合并点/无目标字符串/ID/Loc命令、类型/坐标事件、范围敌我/英雄持续时间、波形扫掠/边缘/目标排序/上限、刀阵数量/分配/速度、召唤数量/类型/落点/替换/归属/事件/重入/死亡、地狱火延迟/buff、树木选择/取消/阻塞，及真实输入/图标/模态窗口/三图/持续切图/性能。完整技能/通道/AI、源特效/粒子/声音继续实现；规则精度仍需原版对照，不能把当前分配/排序视为原件结论。入口和限制见[范围与召唤](area-spells.md)。旧MEngine队列保持延期。

## 英雄学习、主动技能与状态阶段待验证

路径：spells、session_spells/spell_effects/spell_natives/ability_commands、order_ids及生成器，单位/能力句柄与hashtable、命令/移动/战斗/采集/施工/生命周期，game_commands/view/loading、spell消费者与隔离夹具。

实际消费：原学习命令/能力数据/图标/坐标/热键、目标订单、接近/前后摇/扣蓝/冷却、单位/玩家施法事件和真实能力上下文；七种代表能力的治疗/伤害/飞行/链式选择、眩晕/缠绕/霜冻及实际查询/驱散。必要Win32 Release产品和war3_spell_tests编译通过；16项新增native签名、生成器语法、344条订单表重建和差异检查通过。原始证据为tmp/docs-artifacts/war3/spells/。专项行为程序未执行，不记录为运行通过。

阶段合并学习点/等级/覆盖、目标/射程/魔法/冷却、前后摇/取消、上下文/重入/移除/转让、弹道与多目标/衰减、英雄状态时间/暂停/驱散、工作/战斗交互、真实鼠标/热键/Esc/模态窗口、三图及持续切图/内存。全部技能/被动/光环/持续施法、源粒子/音效/弹道画面、完整免疫/反弹与原件精确时序仍待实现或对照。入口和边界见[英雄主动技能](spells.md)。保持先集中实现再阶段验证，旧MEngine队列继续延期。

## 对局结束、原菜单与脚本对话框阶段待验证

路径：game_state、session_match/script_dialogs、session/object_data、玩家/单位统计消费者、game_flow_ui/view、main重开/退出路由、音频时长与专项目标/隔离夹具。

实际消费：原Blizzard.j胜负判断、玩家结果/事件、Dialog/按钮/失败条件与真实句柄、原FDF菜单/对话框/结算模型、暂停/输入/UI/选择、继续/退出/同图重开、单位/英雄/资源观测计数。必要产品及消费者编译通过，26个字面量native声明及生成器语法检查通过。BootyBay原main与2,100ms开发最小推进退出0，实际2.09375秒、bj_gameStarted=true，玩家0胜利/1对话框/2按钮、无Game.dll。源QuestCompleted.wav有效PCM时长5,155ms和截断拒绝的最小检查通过。证据：tmp/docs-artifacts/war3/game-flow/{build-final.log,consumer-final-build.log,bootybay-before.log,bootybay-after.log,victory-wave-before.log,victory-wave.log}。

完整game_flow消费者未执行。阶段合并对话框句柄/事件/重入/多玩家/快捷键、原BJ结局与离开、类型计数/科技等价、暂停/音频逻辑/输入控制、Esc菜单/确认/重开、结算模型/页签/值及切图释放；三图完整流程、GPU/原版布局/实际操作和性能继续排队。完整总分与所有分项、选项、存档/载入、回放、战役跨关、LAN/断线及作弊状态仍待实现。命令、原件入口与限制见[对局流程](game-flow.md)，旧MEngine队列保持延期。

## 基地升级、修理与荒芜能力阶段待验证

路径：session_building_upgrades、session_repair、session_blight_growth，单位类型初始化、升级/修理状态、生命周期/人口/科技/训练/命令、game_commands/view与construction消费者/夹具。

实际消费：源Upgrade与累计造价差、句柄不变的类型/模型/属性/生产清单更新、进度/取消/事件/人口/科技等价；源修理目标/扣费/生命/自动施放、人族协作进度/费用；源荒芜扩张/驱散及World路径与渲染脏区域。必要Win32 Release产品/扩展消费者编译无警告，生成器语法与新native声明核对通过；DotA原main/250ms最小检查退出0、123单位/3,871可破坏物、bj_gameStarted=true、无Game.dll。证据为tmp/docs-artifacts/war3/construction/development-{build,consumer-build,dota-250}.log。

专项行为尚未执行，扩展现有construction消费者，按阶段合并训练/科技/采集/战斗与三图输入，核对升级价格/前置/取消/人口/句柄/状态、修理付费/自动施放/目标/重入、协作进度和荒芜生长。完整原件生命/时间/退款/舍入、升级中间模型、桥/海军修复、自动选择、荒芜交叠/移动/能力增删、GPU/性能与连续切图仍待完成或验收。命令和边界见[基地发展](base-development.md)。保持待阶段验证，不关闭旧队列。

## 建造、放置与矿井转换阶段待验证

路径：session_construction/mines/footprints、commerce/entities/script_state/session、建筑生命周期/人口/命令/采集/战斗/视野/恢复消费者、world_path、game_building/commands/view/loading、CMake和construction专项消费者/隔离夹具。

实际消费：源Builds/B菜单/图标/热键、同源放置/模型预览、四族单工人施工/隐藏/释放/取消、施工进度/Birth、事件与人口、计数占地与更新、受诅咒/缠绕矿及共享金币。必要Win32 Release产品和新消费者编译通过，无编译警告；生成器语法与5个源native声明核对通过。DotA原main/首250ms模拟通过，123单位/3,871可破坏物、bj_gameStarted=true、无Game.dll；仅为占地接入初始化的开发检查。证据：tmp/docs-artifacts/war3/construction/{build-final.log,dota-250.log}。

generate-construction-fixture.py / war3_construction_tests 已加入，行为尚未执行。阶段合并harvest/destructable/research/commerce及受影响战斗场景，覆盖放置/到达/停工/恢复、取消/退款/事件、四族工人、人口/转让、死亡/移除/重入、占地变更、矿井关联/释放/耗尽、源B菜单/快捷键/预览/进度/GPU与三图实际对局。基础repair/人族协作/升级及荒芜能力已接入；完整变形/拔起、施法冷却/魔法/特效/声音和原件生命/退款/时序仍待完成或对照。命令和边界见[建造与矿井转换](construction.md)。本项保持待阶段验证，不触发旧全套或性能遍历。

## 可破坏物与基础伐木阶段待验证

路径：`placed_definition.*`、`session_destructables.cpp`、`session_lumber.cpp`、`world_path.cpp/world.h`、`session_harvest.cpp`、`session_production.cpp`、事件/计时器列表、`scene_objects.*`、`game_view.*`、Widget/目标/hashtable/名称消费、状态头、图像TGA入口与专项消费者/夹具生成器。

必要Win32 Release产品/war3_destructable_tests编译通过；DotA加载3,871个可破坏物、原main及250ms模拟退出0，bj_gameStarted=true、无Game.dll。证据 `tmp/docs-artifacts/war3/destructables/{build-final.log,dota-final-250.log}`。本次没有专项行为、GPU、帧耗时或三图全流程通过结论。

阶段执行 generate-destructable-fixture.py / war3_destructable_tests，核对重叠阻挡和WPM保留、死亡/恢复/移除、Widget回调重入、矩形枚举/过滤、句柄存储、当前路线遇新增阻挡、工人/食尸鬼木材返还、小精灵直接收入及自动换树。合并受影响harvest/research/commerce和真实地图输入，不重复无关旧引擎/全资产检查。路径旋转/窄口/无WPM、视线遮挡、桥/门/掉落、脚本创建/移除时的GPU资源、动画/声音、小精灵附着及原版数值/时序仍待实现或验收。命令见 [可破坏物与伐木](destructables.md)。本项保持待阶段验证。

## 基础经济阶段待验证

路径：`session_harvest.cpp`、`session_combat_orders.cpp`、`session_orders.cpp`、`session_tick.cpp`、`session_entities.cpp`、`session_food.cpp`、`session_fog.cpp`、`session_weapons.cpp`、`session_commerce.cpp`、`game_commands.cpp`、`game_view.*`、状态头及采金专项消费者/夹具生成器。

必要 Win32 Release 产品与 war3_harvest_tests 编译通过，无本项行为/GPU/性能通过结论。原能力属性与模型动作已读取，证据 `tmp/docs-artifacts/war3/economy/source-abilities.json`、`build.log`。没有重复三图、全资产或旧引擎测试。

待阶段执行 generate-harvest-fixture.py / war3_harvest_tests，检查携带/停止保留/返还与累计资源、矿内占用及容量、最后一包与耗尽、亡灵/精灵采金、暂停、矿/工人删除、命令/资源事件重入及画面。原版精确速率、维护费/税收、可达性/出入口、矿内UI、建造与缠绕转换/伐木的完整规则及原版一致性仍待实现或对照。命令见 [基础经济](economy.md)。本项保持待阶段验证。

## 科技研究阶段待验证

路径：`object_data.*`、`session_research.cpp`、`session_game.cpp`、`session_production.cpp`、`session_entities.cpp`、`session_commerce.cpp`、`session_weapons.cpp`、`session_combat*`、`session_projectiles.cpp`、`session_damage.cpp`、`session_regeneration.cpp`、`game_commands.cpp`、`game_view.cpp`、状态头文件及研究消费者/夹具生成器。

必要 Win32 Release 产品/commerce/research 目标编译通过。原件静态入口确认 Set 科技只补足等级，Add 只处理正增量；未执行数值精度夹具。DotA 原 main 和首250ms模拟退出0、bj_gameStarted=true、无Game.dll，证据 `tmp/docs-artifacts/war3/research/dota-final-250.log`。本次没有GUI、实际研究或对战通过结论。

待执行 `generate-research-fixture.py` + `war3_research_tests`，检查自定义升级/等级前置、命令模型、重复研究、队列扣费退款、事件重入、当前/新建单位消费、Set较小目标不降级；再合并受影响commerce/战斗/三图检查。风险包括所有权转移、科技等价和继承、技能依赖、弹道武器快照、生命/魔法变化精度以及升级 effects 的完整覆盖。命令见 [科技研究](research.md)。本项保持待阶段验证。

## 基础战斗阶段待验证

路径：`src/combat.h`、`session_combat*`、`session_weapons.cpp`、`session_projectiles.cpp`、`session_rewards.cpp`、`session_orders.cpp`、`session_tick.cpp`、`session_entities.cpp`、`session_callbacks.cpp`、`session_damage.cpp`、`game_view.*`、`game_loading.*`、`game_commands.cpp`。

待集中验证：近战/远程/溅射/弹射/穿透、目标筛选、伤害与护甲、攻击前摇及命令重入、停止/保持/跟随/拾取/巡逻、建筑和中立守卫、经验/掉落及死亡回调、HUD与弹道显示；对照原版进行三图持续对局、资源释放及性能检查。重点风险为事件分发扫描历史句柄、弹道寿命与发射者删除后的归因、目标关系和魔免分类、随机顺序、技能和死亡时序。

本次必要 Win32 Release 产品及 commerce 测试目标编译通过；DotA 原 main 和 250ms 模拟退出 0，`bj_gameStarted=true`，`game_dll_loaded=false`，记录为 `tmp/docs-artifacts/war3/combat-final-dota-250.log`。该检查只覆盖开局阻塞路径，战斗行为、GUI、性能及原版一致性均待验证。

## W001–W003 批次结果（2026-10-25）

源版本为 `d158fc1` 加本次菜单、设备和音频实现。Win32 Release 构建通过，13 项 CPU 检查通过、0 失败：地图覆盖与共享引用生命周期、纹理别名来源优先级、归档路径与失败挂载、palette 透明度、JPEG 四原始分量、JPEG 三原始分量、BC1/2/3 固定像素、TGA 方向/RLE、图像截断与预算、二进制记录边界、原版 FDF 模板与字符串、UTF-8/UTF-16 BOM、FDF include/继承循环边界。JPEG 常量参考图每通道误差不超过 2。证据为 `foundation-final-build.log`、`foundation-final-tests.log`。

Amazonia、BootyBay、DotA_v6.83d 的归档 probe 均退出 0，无 Game.dll。它们只读取归档成员，不执行地图 JASS、地形构建或对局，不能作为玩法和地图加载性能验收。证据为 `{amazonia,bootybay,dota}-probe.log`、`map-probes.json`。PE 检查为 0x14c x86，仅导入系统 DLL；原版 IJL/Miles 按摘要动态载入。

D3D9Ex HAL 与 reference 实际绘制通过；缩放、最小化恢复、Q 退出通过，最终 1264×921 帧与固定帧逐像素一致。证据为 `foundation-{fixed,window,reference}.{log,png}`、`foundation-runtime.json`。原版菜单读取 18 个 geoset、211 个 node、49 个 texture，解码纹理 11,292,672 字节。字体来自原版 `MasterFont=Fonts\dfst-m3u.ttf`，按钮模板、中文、位置和边框来自原版 FDF；完整视觉还原尚未通过。

Miles 运行状态为 `SMP_PLAYING=4`，采样位置由 12 推进至 1237ms；产品构造/析构探针退出 0，sample、driver、Miles 及 codec 均释放，无 Game.dll。证据为 `audio/music-product-probe.log`、`audio/probe-init1-redist1.log`。尚未对音效和听感作验收。

提交前补充修复按钮按下起点与捕获取消边界，只重建并复测受影响窗口路径，沿用未受影响的 13 项 CPU 结果。此次标准 D3D9 实际运行 92 帧后由 Q 退出，缩放、最小化恢复、从按钮外拖入、取消捕获均通过；未加载 Game.dll。最终帧与同版本固定帧均为 1264×921、逐像素一致，像素 SHA-256 为 `c8a9d3684ebb9b2eb1692c51f389959de33a37a86bfdb615d9b30a1f2d09ca6a`。证据为 `delivery-build.log`、`delivery-{fixed,window}.{log,png}`、`delivery-runtime.json`。

批次仅关闭已实现的基础设施范围。完整 UI、地图会话、音效、持续切图和性能保持 [功能矩阵](acceptance.md) 中的待实现/待验收状态；旧 MEngine 161–163 GPU 批次继续延期，旧转换缓存尚不满足清理条件。

## 复现命令

在 `watcher/war3` 执行：

```powershell
cmake --preset windows-x86 -DWAR3_BUILD_TESTS=ON
cmake --build --preset release --parallel 8
./build/windows-x86/bin/Release/war3_native_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/native-tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --hidden --frames 120 --time-ms 0 --window-check --log "../../tmp/docs-artifacts/war3/delivery-window.log" --capture "../../tmp/docs-artifacts/war3/delivery-window.png"
```

CPU 测试只生成临时夹具 MPQ，游戏运行不生成解包资产。无输入或相关源码变化时不重复执行已通过的检查。

## 下一批队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W004 原生地图定义 | map.h/map.cpp、map_tests.cpp、CMake、map-loading.md | W3I18/25、WTS、W3E11、WPM0，代表地图与畸形输入；当前层地图目录排序 | 源记录边界、缺省编辑器尾表、地图间串资源、路径尺寸 | 基础范围通过，批次关闭 |
| W005 动态 FDF 控件与文本 | glue、media、fdf、player_setup_ui | 原版控件挂接、可见性、运行时文字/图像、文本尺寸、换行/颜色/裁剪、玩家草稿与弹层 | 控件名与锚点、长地图文字、D3D 状态恢复 | 基础绘制/交互通过，批次关闭；完整还原留在功能矩阵 |
| W006 单人模式与地图目录 | main、map_browser、platform、glue、renderer、CMake、setup | S/G/A/Escape 导航，任意 w3m/w3x，选择信息/预览、滚轮、目录与错误恢复、无解包 | 菜单资源不受地图覆盖、失效目录、重复切选释放、超长描述、设备创建回退 | 基础范围通过，批次关闭；实际开局待实现 |

W004 定向命令：`build/windows-x86/bin/Release/war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>`。原版格式参考与来源见 `map-loading.md`；CPU 测试不表示原版地图会话已能运行。

本批达到三项，提交后先运行原生地图定向检查、受影响的 FDF 检查及 `--menu-check` 原版路径。导航检查使用实际窗口按键和地图行点击，要求进入选图、读取指定地图并逐级返回；`--window-check` 覆盖窗口恢复与取消捕获。原始证据统一写 `tmp/docs-artifacts/war3/map-menu/`，不执行旧 MEngine 全量验证。

## W004–W006 批次结果（2026-10-26，未关闭）

集成范围 `eeeb747`、`643f0b7`、`c98f45d` 及本次补充修复。Win32 Release 编译通过。原有 CPU 13 项通过、0 失败；地图 CPU 10 项通过、0 失败，包含完整经典尾表、省略尾表、WTS、源角点/路径位、截断/版本、目录排序、单人/选图 FDF 定义以及三张真实地图。证据为 `map-menu/native-tests.log`、`map-tests.log`、`batch-final-build.log`。

三图元数据由独立 Python 读取器交叉核对：Amazonia 为 W3I25、97×97 角点、2 玩家、1 势力；Booty Bay 为 W3I18、193×97、2 玩家、1 势力；DotA v6.83d 中文版为 W3I25、129×129、10 玩家、2 势力，显式省略编辑器尾表。独立结果见 `independent-map-records.json`。产品三图 `--probe` 均退出 0、无 Game.dll，见 `{amazonia,bootybay,dota}-probe.log`。这些结果仅证明原生源记录读取，不表示地图初始化或对局通过。

新导航运行在创建设备时失败，未进入本批新增界面。当前执行进程属于 Windows 会话 1，`query session` 显示为 Disc；标准 D3D9 查询返回 D3DERR_INVALIDCALL，D3D9Ex 与 On12Ex 不可用。已将回退扩展到完整的能力、显示模式、深度和创建设备过程，编译通过；环境仍没有可用设备，不能沿用上一批旧帧证明新 UI 通过。证据为 `initial-device-error.log`、`amazonia-menu.log`、`display-session.log`。

已静态补齐 Maps 内指定地图的父目录导航，以及切选文件夹/错误地图时释放旧预览引用；相关交互仍随 GPU 导航等待实际验收。本批保持未关闭，恢复可用显示会话后先执行下列定向命令，再开展下一批：

```powershell
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/FrozenThrone/(2)Amazonia.w3x" --hidden --frames 240 --time-ms 0 --menu-check --log "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.log" --capture "../../tmp/docs-artifacts/war3/map-menu/amazonia-menu.png"
```

对 BootyBay、DotA_v6.83d 重复同一导航路径；检查单人/选图帧、目录双击/返回、滚轮和坏地图恢复，并复测 `--window-check`。不重复已通过且输入未变化的 CPU 项，不关闭/重启现有编辑器，不清理旧地图转换缓存。

## W005／W006 原版展示补充（2026-10-26）

本次补充保持原批次计数。按 REA 和原件配置接入运行时信息锚点、标题偏移、尺寸分类、中文地形名、列表字体、HM3W 头部名称/人数/分类，以及已接入按钮的键盘焦点。修正单行区域计算成两行导致的文字裁剪，菜单动作在完整绘制后处理。

Win32 Release 编译通过。地图专项现在 14 项通过、0 失败；新覆盖头部边界、INI 分段/引号/注释、原版展示配置、源焦点链，以及三图头部与 W3I/WTS、完整尺寸与 W3E 的一致性。原有 13 项 CPU 结果沿用。证据为 `source-ui-final-build.log`、`source-ui-tests.log`，均在 `tmp/docs-artifacts/war3/map-menu/`。

原版 CPU 对照通过 5 条锚点、40 组标题位置、64 组尺寸类别，证据为 `source-ui-cpu.json`、`source-ui-cpu.log`。配置成员和 C++ 夹具摘要写入该 JSON。原件只在 PE 读取器和 Unicorn 中作为指令数据使用；GUI/配置边界由探针提供，此检查不代替 GPU、字形测量或实际输入验收。

复现：先运行 `war3_map_tests.exe <原安装目录> <仓库根目录/tmp/docs-artifacts/war3/map-tests>` 生成原生夹具，再在仓库根目录执行 `python watcher/war3/tools/verify_map_ui_cpu.py`。其他输出目录需通过 `--fixture <map-ui-native.json>` 指定；原版和输出路径可用 `--data-root`、`--output` 覆盖，默认输出在仓库根目录 tmp。

本轮重验仍显示执行会话 1 为 Disc，设备不可用，见 `continuation-menu.log`；没有新增 GPU 通过结论。增强后的 `--menu-check` 要求通过实际窗口 Enter／Space 进入单人/选图、Tab 切换列表/按钮、确认地图列表 Enter 不触发取消，再检查 S/G/A/Escape/Q 返回。恢复显示会话后完成这些检查，并人工检查 Shift+Tab、目录双击、坏地图恢复和像素；此前保持本批未关闭。

## W005／W006 玩家槽与显示恢复验证（2026-10-26）

本次仍是原批次的补充任务，不增加待测计数。路径为 `src/setup.*`、`player_setup_ui.*`、`fdf.*`、`glue.*`、`map_browser.*`、`main.cpp`、`platform.cpp`、`tests/map_tests.cpp` 和 CMake。实现源玩家 ID/势力的配置草稿、复用 PlayerSlot 实例、重复 MenuItem、上下文锚点、名称/种族/队伍/颜色/障碍下拉、固定设置约束、统一焦点与弹层输入；同图重复选择保留编辑，解析或布局失败清空部分状态。

Win32 Release 构建通过，见 `player-setup-build.log`。地图专项 **19 通过、0 失败**，新增源 popup 选项、两个独立上下文、源 ID/记录、本地槽移动、计算机控制、非法编辑、颜色交换、障碍边界、固定设置、force 掩码和文字内联颜色；三图分别核对草稿槽数与本地 ID，DotA 特别核对缺少 0/6 的稀疏 ID 和两队固定设置。基础 CPU **13 通过、0 失败**，本次因 FDF 解析/继承变更而复测，未执行旧 MEngine 全量测试。证据为 `player-setup-tests.log`、`player-setup-native-tests.log`。

原生地图 UI 规则夹具 SHA-256 仍为 `64bd263b499277b3a86cf63438c264dfde8cea886a3ff79ffba2894d722e128c`，布局/类别代码及配置未变，复用此前 5/40/64 条原版 CPU 对照；不重复执行 Unicorn。

会话 1 恢复为 console/admin/Active 后，标准 D3D9 的三图 `--menu-check` 均退出 0：Amazonia **104 帧**、BootyBay **104 帧**、DotA **108 帧**，均报告无 Game.dll。本地 ID 分别为 0、0、1。检查使用真实 HWND 消息：Enter/Space 进入单人和选图、地图行点击、滚轮、列表 Enter、Tab 到本地障碍、修改为 90%、重复选中地图保留草稿、再次展开与 Esc 关闭弹层、Tab/Space 取消以及 S/G/A/Escape/Q 返回。窗口恢复检查 **92 帧**退出 0，覆盖两次缩放、最小化恢复、从按钮外拖入与取消捕获；未停止或重启编辑器。

证据统一在 `tmp/docs-artifacts/war3/map-menu/`：`player-setup-{amazonia,bootybay,dota}.log`、同前缀的 `-single.png`／`-browser.png`／`-popup.png`，以及 `player-setup-window.{log,png}`。已查看三图选图帧和弹层输出，能确认源控件、预览和分组被绘制，不能据此宣称与原版逐像素一致。所有检查进程均已正常退出。

DotA 的 `|c00` 标题和说明色按原版 `0x6f0d8780`、`0x6f0d8948`、`0x6f029c80` 固定文字 alpha 为 255，修复后红/绿势力标题与说明颜色可见。`tools/verify_text_color_cpu.py` 的 **32 组合法颜色**与 C++ 全部一致，证据为 `text-color-parser-rea.json`、`text-color-cpu.json`／`.log`；ASCII 与 CRT strtol 为受控探针边界。文字修复后只重跑受影响的 DotA 导航，仍为 108 帧退出 0；沿用未受影响的另外两图、窗口恢复和基础 CPU 结果。

复现命令沿用上一节的三图入口，`--menu-check` 现在至少需要 `--frames 240`；步骤未完成而帧数耗尽会失败。增加 `--mute` 可跳过本批未改动的音频路径。选图、弹层和地图草稿不运行 JASS，不产生解包工程。

本批剩余待测：目录双击/Enter/Backspace 返回、坏地图与失效目录恢复、反向 Tab、玩家长列表滚动、颜色/队伍/名称的完整鼠标操作与切图释放。完整 UI 的组布局、颜色网格、字体/过渡和对局默认 AI/JASS 顺序保持待实现或对照；开始游戏仍禁用。W004–W006 保持未关闭，完成这些与已实现路径有关的检查后再开启下一批。

## W004–W006 基础批次关闭（2026-10-26）

在 `e1889bf` 上补充只读界面查询和 `tests/browser_tests.cpp`，Win32 Release 编译通过；原生 D3D9 界面检查 **11 通过、0 失败**，无 Game.dll。覆盖目录双击、Enter 与 Backspace 返回；坏归档、缺少/截断 W3I 的状态清空和选择恢复；同一失效文件替换后重试；删除/重建测试文件夹后的目录恢复；坏图选择直接释放旧预览节点的 COM 引用；弹层外部点击不进入地图列表；名称、种族、队伍、颜色交换、障碍值及本地槽移动；Tab/Shift+Tab 正反遍历；静止鼠标不覆盖键盘、滚轮切换；16 槽滚动及底部弹层向上展开；固定设置与空草稿/重绑。

夹具仅在 `tmp/docs-artifacts/war3/browser-tests/<PID>-<ticks>/` 新建目录、复制一张原地图并生成畸形 MPQ，不改动原安装。测试直接向产品 GlueScreen/MapBrowser 输入 UiInput 并实际绘制 D3D9 帧；此前 `e1889bf` 的三图产品 HWND 导航、窗口恢复、19 项地图/13 项基础 CPU 和 32 组原版颜色对照沿用，没有相关输入或行为变化时不重复执行。

证据为 `map-menu/browser-build.log`、`map-menu/browser-tests.log` 和 `browser-tests/browser-results.json`；恢复后的地图与长玩家列表帧为 `browser-recovered.png`、`setup-scrolled.png`，已查看。原始 JSON/日志/PNG 不提交。复现（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_browser_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "G:/work/github/MEgine/tmp/docs-artifacts/war3/browser-tests"
```

本批关闭已实现的地图定义、基础动态控件与选图交互。完整 UI 像素、组间距、颜色网格、过渡、对局配置覆盖、地图初始化和实际玩法保持总矩阵待完成状态，不据此缩小独立客户端目标。下一批从原生脚本和地图会话展开。

## 原生脚本批次队列

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W007 JASS 源与语法树 | jass.*、archive.*、main/platform、CMake、jass_tests | 原公共库、三图脚本成员与来源、语法/位置/预算、入口、后续 VM 对 AST 的消费 | token 与字符串混淆、CR 源位置、公共来源覆盖、表达式绑定与语义 | 语法基础与三图装配通过，本批关闭；执行能力待实现 |
| W008 原版数值转换 | jass_numeric.*、numeric_tests、verify_jass_numeric_cpu、CMake | VM 实数位型、I2R/R2I 边界、原版 CPU 差分、后续 native 绑定消费 | 尾数截断、符号、越界、NaN/无穷、宿主浮点转换差异 | 转换与当前数值层集成通过，本批关闭 |
| W009 实数算术与字面量编译 | jass_numeric.*、jass_reciprocal.inc、jass/main、生成/验证工具 | 原版四则与倒数插值、十进制 token、AST 实数位型、三图脚本装配 | 移位/截断、系数来源、长小数回绕、零除函数与 VM 策略边界 | 数值差分、AST 实数位型与三图装配通过，本批关闭；VM 边界待实现 |

W007 为后续执行开发所需立即编译和最小集成验证，未运行旧引擎全量测试或重跑无变化的 GUI/纹理检查。Win32 Release 构建通过，`war3_jass_tests` **8 通过、0 失败**；产品 `--hidden --script-check` 直接挂载原公共 MPQ 与 DotA，退出 0、无 Game.dll，语法树含 91 类型、3,369 全局、1,160 native 声明、5,599 函数体、281,324 表达式、65,968 语句。独立文本声明计数的类型/native/函数分别为 91/1,160/5,599，与原生输出一致。

证据在 `tmp/docs-artifacts/war3/jass/`：`build.log`、`tests.log`、`dota-script.log`、`independent-declarations.json`、`source-paths-rea.json`。公共库和原地图保持只读；测试夹具另写 tests 子目录。本次只构建语法树，没有执行 global initializer、config/main 或任何 native；单次解析时间不表示冷地图载入或对局性能。

定向命令（`watcher/war3`）：

```powershell
./build/windows-x86/bin/Release/war3_jass_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/tests"
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/dota-script.log"
```

累计三个功能任务后合并验证三图脚本/VM接口及原生函数边界；原版表达式优先级、结合性、短路、数值/字符串语义及完整执行能力均未由本次语法树测试证明，实施 VM 时先按原件核对。未接入的 UI/世界/AI/战役等继续按完整矩阵推进。

W008 原生 Release 构建与转换边界检查通过。I2R **695 组**、R2I **3,072 组** C++ 输出与原版 native 包装/转换指令逐位一致，原件只在 Unicorn 中作为 PE 指令数据执行，没有任何代码边界替身，产品与原生检查均不加载 Game.dll。此最小差分是数值层继续开发的必要依据，未扩展到旧引擎或重复已通过的 UI/语法检查。证据在 `tmp/docs-artifacts/war3/jass/numeric-{build.log,tests.log,native.json,cpu.json,cpu.log}`，原始 REA 文件见 `jass.md`。

复现（仓库根目录）：

```powershell
./watcher/war3/build/windows-x86/bin/Release/war3_jass_numeric_tests.exe "G:/work/github/MEgine/tmp/docs-artifacts/war3/jass/numeric-native.json"
python watcher/war3/tools/verify_jass_numeric_cpu.py
```

W009 补齐 Real 四则、固定倒数系数和十进制 token，并把实数位型接入 AST。`jass/arithmetic-build.log`、`arithmetic-tests.log`、`arithmetic-native.json`、`arithmetic-cpu.json`／`.log` 记录 **55,296 次四则运算、2,061 个十进制 token** 与原版一致，无替代函数代码；旧 695/3,072 组转换证据保持原文件，未重复执行。生成器核对 Game.dll 固定摘要，运行时使用已提交的 4,100 字节系数，不加载原件。语法/字面量消费在后续三图集成中验证；完整 tokenizer、VM 零除/线程语义与其他执行行为未被本次差分覆盖。

本批达到 3/3。提交后合并执行受影响的 JASS 自编夹具和三张代表地图 `--script-check`，核对根/Scripts 成员、原版实数位型已在 AST 生成、声明数与无 Game.dll；复用已通过的数值函数原版差分和未变的 UI/地图源记录结果。语法/数值批次通过也不表示 VM、config/main、对局或完整 UI 一致；相应项目继续保留在总矩阵。

## W007–W009 语法与数值批次结果（2026-10-26）

集成版本 `47a1324`，原生 Release 构建通过。JASS 自编夹具 **9 通过、0 失败**，新增验证实数 AST 位型来自原版数值层、保留精度边界、相邻 then 和非法实数诊断。产品三图 `--script-check` 均退出 0、无 Game.dll：

| 地图 | native 声明 | 函数体 | 全局变量 | 预编译实数 | 位型序列校验值 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Amazonia | 1,160 | 960 | 898 | 569 | 2,208,139,060 |
| Booty Bay | 1,160 | 952 | 898 | 428 | 1,822,572,789 |
| DotA_v6.83d | 1,160 | 5,599 | 3,369 | 4,687 | 626,114,605 |

三图均含 91 个扩展类型，类型/native/函数/全局数量与固定源文本的独立计数一致；前两图读取根 war3map.j，DotA 读取 Scripts\war3map.j。位型序列校验值用于定位同一脚本输入下的编译结果，不代替原版 VM 执行比较。I2R/R2I 的 695/3,072 组、四则的 55,296 次及 2,061 token 原版差分输入/实现未变，沿用已保存结果，不重复运行；不扩大到旧引擎、GPU、纹理或全库检查。

证据为 `jass/arithmetic-frontend-build.log`、`batch-jass-tests.log`、`batch-{amazonia,bootybay,dota}.log`、`batch-w007-w009.json`。数值差分和系数来源文件继续保留。该批关闭语法树、数值函数和字面量预编译范围；没有执行 globals initializer、config/main、触发器或任何地图 native。下一批为表达式绑定/类型与执行栈，随后实现 native 和地图会话；完整玩法与 UI 仍按总矩阵推进。

## W010–W012 原生链接与执行批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W010 类型与符号解析 | jass_module.*、main、CMake、jass_module_tests | 三图公共/地图符号与槽位、源位置诊断、后续执行层消费直接绑定与隐式数值转换 | handle 兼容、遮蔽、数组形状、继承环、原版类型规则与静态检查边界 | 类型/槽位基础验证通过，本批关闭 |
| W011 原版表达式与整数 token | jass.*、jass_literal.*、CMake、frontend/jass_tests、verify_jass_frontend_cpu | 三图布尔表达式、整数字面量、执行层对 AST 位型/组合的消费 | or/and 优先级与右结合、32 位回绕、语法/类型/执行的验证边界 | 原版定向对照与本批消费通过，本批关闭 |
| W012 执行栈与 native 边界 | jass_runtime.*、jass_literal/jass、main、CMake、runtime_tests、verify_jass_literals_cpu | 三图指令编译、初始化/槽位/流程/短路/code/native 的执行、失败位置与预算释放、前批消费 | 调用帧/跳转、I2R、字节与转义、未绑定函数、重入预算、原版异常策略尚未完整对照 | 13项执行检查、字面量对照及三图指令编译通过，本批关闭 |

W010 为收尾未提交源码及后续执行开发进行必要编译和最小集成：MSVC Win32 Release 的产品和 `war3_jass_module_tests` 编译通过，**9 通过、0 失败**。覆盖 handle/null 与数值赋值、非法类型图、参数/局部/全局槽位及 set 目标、前向函数和 code、数组形状与下标、初始化和常量、条件/返回/运算符、20,000 次左结合运算、移动后 AST 所有权与绑定完整性。

产品 `--hidden --script-check` 对 DotA 直接挂载原归档，类型和符号解析退出 0；91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式、65,968 语句，实数位型序列与既有输入一致，无 Game.dll。证据为 `tmp/docs-artifacts/war3/jass/module-{build.log,tests.log,dota.log}`。该最小产品检查用于确认新模块被真实入口消费；没有重跑旧引擎、GUI、数值差分、全量资产或性能基准。

后续累计三个功能任务后，在同一集成版本合并执行三图检查、源位置与绑定消费的相关用例。确定赋值、全部路径返回、constant 纯度及原版完整类型语义尚未核验；未执行全局初始化、config/main 或 native，未将地图标记为可玩。W010 保持待批次验证，旧 MEngine 161–163 批次继续延期。

定向命令（`watcher/war3`）：

```powershell
cmake --build --preset release --target war3 war3_jass_module_tests --parallel 8
./build/windows-x86/bin/Release/war3_jass_module_tests.exe
./build/windows-x86/bin/Release/war3.exe --data-root "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" --map "Maps/Download/DotA_v6.83d.w3x" --hidden --script-check --log "../../tmp/docs-artifacts/war3/jass/module-dota.log"
```

W011 为执行层开发核对原件表达式组合并修正已确认偏差。Win32 Release 编译通过，5 项 frontend 检查及受影响的9项语法检查通过、0失败。245 组表达式结构通过原版解析状态机指令对照；591 个整数 token（199 十进制／196 八进制／196 十六进制）通过原版回调及 lexer 分类、长度和位型对照。原版解析只执行移进/归约指令，语义动作记录为符号树，到 return 表达式归约停止；lexer 的 CRT memmove 由受控内存复制替代。完整类型、源文件验收、短路、编译和 VM 不在此对照范围，见 `jass.md`。

DotA 最小产品集成退出 0、无 Game.dll，仍为 91 类型、3,369 全局、1,160 native、5,599 函数体、281,324 表达式与65,968语句；此次检查未执行地图脚本。证据为 `tmp/docs-artifacts/war3/jass/frontend-{build.log,tests.log,native.json,cpu.json,cpu.log,parser-tests.log,dota.log}` 与 `frontend-{integers,parser,identifiers}-rea.json`。当前批次 **2/3**，W012 后合并三图及实际执行层消费；已通过且未变化的数值差分、GUI与旧引擎不重复运行。

W012 接入原生执行指令与显式脚本帧，产品 `--script-check` 新增指令编译，保持 `initialized=false`。开发所需 Win32 Release 构建及12项自编脚本执行检查通过；字符串构造器解码循环5组、完整Rawcode回调268组与原版指令一致。DotA 370,552 条指令编译通过，无 Game.dll；地图 native 尚未实现，不执行原图全局初始化或 config/main。原版短路/实参顺序已有发射器及参数布局路径依据，执行完整一致性仍待差分，见 `jass.md`。

证据在 `tmp/docs-artifacts/war3/jass/runtime-{build.log,tests.log,native.json,literals-cpu.json,literals-cpu.log,dota.log}` 与 `runtime-{shortcircuit,strings,call-grammar,parameters}-rea.json`。本批达到 **3/3**；提交后合并构建并执行受影响的语法、Module、frontend、Runtime 检查及三图产品编译，覆盖新增嵌套loop与共享native预算用例。无实现变化的 DotA 最小结果及数值/解析状态机差分按输入与产物摘要复用；不扩大到旧引擎、UI或全量资产。

## W010–W012 脚本基础批次结果（2026-10-26）

集成版本 `d1afdb3`（W010 `c03da05`、W011 `2e9b6de`、W012 `d1afdb3`）。MSVC Win32 Release 构建通过，无编译警告；语法9／Module9／frontend5／Runtime13，**36通过、0失败**。Runtime检查实际执行自编脚本，包含参数/槽位/数组、全局初始化次序、分支/循环/嵌套exitwhen、短路、code同步重入、整数回绕与Real转换、字符串/Rawcode、native错误位置与类型、初始化失败、共享预算和20,000次左结合表达式。

| 地图 | 表达式 | 语句 | 执行指令 | 原图初始化 |
| --- | ---: | ---: | ---: | --- |
| Amazonia | 14,864 | 3,687 | 21,086 | 未执行 |
| Booty Bay | 13,904 | 3,400 | 19,785 | 未执行 |
| DotA_v6.83d | 281,324 | 65,968 | 370,552 | 未执行 |

三图产品 `--hidden --script-check` 均退出0、无Game.dll，直接挂载原公共MPQ与地图，未创建解包工程。当前构建的产品二进制摘要与快速检查版本不同，三图在同一集成二进制重新检查；结果保留 `initialized=false`。本批frontend、Runtime字面量夹具分别与既有原件对照的摘要 `07dc0758df41c6e66a352d3ff6bb6f9e29c5cdce5f593a55fe74497571e9aa70`、`a4b1d9418681924acb17b9a5c51d2bcfb74dcf096757002e4bea2d0d2efc61f3` 一致，复用245组表达式/591个整数和5组字符串/268组Rawcode对照。此前Real数值实现及差分输入未变化，不重跑；未扩大到UI、旧引擎、纹理或全量资产。

证据为 `tmp/docs-artifacts/war3/jass/batch-runtime-{build.log,build-receipt.json,syntax.log,module.log,frontend.log,execution.log,amazonia.log,bootybay.log,dota.log}`、`batch-{frontend,runtime}-native.json`、`batch-w010-w012.json`。本批关闭已实现的类型/绑定、字面量和执行层基础；原版完整类型/VM一致性、游戏native、句柄/计时器调度、原图全局初始化与config/main、实际对局继续在总矩阵待实现。旧MEngine 161–163批次继续延期。下一批从原版公共常量、真实native状态与地图配置/会话开始。

## W013–W015 地图配置与会话批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W013 原图全局初始化/config | session.*、jass_enums.inc、main/platform、CMake、session_tests、verify_jass_enums_cpu | 三图globals/config、配置与玩家草稿/选图的消费、坏图与native失败恢复、切图释放、后续main对状态的消费 | 原版句柄分配/重用、玩家初始状态、菜单占槽与配置次序、未绑定native、范围/销毁诊断边界 | 配置基础范围合并验证通过；完整main消费及原版一致性继续待完成 |
| W014 后台选图与配置草稿 | map_preparation.*、map_browser.*、setup.*、player_setup_ui.*、session.*、main、CMake、setup_tests、browser_tests | 三图选图/config、玩家修改回写、最新选择/目录取消、配置失败与重试、同图草稿/切图释放；合并原11项界面检查及W013会话检查 | 后台归档独立所有权、旧结果覆盖、脚本耗时/退出、原版开局占槽与本地身份时序、组合种族偏好的界面表现 | 基础联动合并验证通过；持续切图性能/完整UI待验收 |
| W015 原生世界与main入口 | world.*、session_world.cpp、session.*、map_preparation、main/platform、CMake、world_tests、verify_world_cpu | 三图世界/globals/config与选图、位置/矩形生命周期、源CameraMargins、main阶段/失败、归档卸载后的世界所有权，合并W013/W014相关验证 | 完整地形/相机范围、边界数值、globals前挂接、原版异常句柄规则、未实现的世界渲染/native | 世界空间/生命周期合并验证通过；完整原图main失败保留后续队列 |

W013 为原图执行开发进行必要编译和最小产品集成：Win32 Release 构建通过、无警告；7项session检查通过、0失败。覆盖44枚举与GetHandleId位型、对象全局初始化/查询/修改/销毁、会话隔离、WTS/config状态/出生点/优先级、源玩家/势力与游戏类型、配置失败阻断及签名错误。初始化只能成功一次；未知native不会回传默认值。

原版注册签名/地址核对与CPU指令比较：44枚举native加GetHandleId，每个65组，共**2,925次逐位一致**，无替代函数。当前C++夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 未变化，补充源玩家/阶段检查后复用该对照。原版对象分配、默认状态、完整VM和config副作用一致性不由这项数字比较证明，见 `session.md`。

DotA_v6.83d 的产品 `--hidden --config-check` 退出0、无Game.dll：公共库和地图全局初始化/config已实际执行，10名额/10队伍记录，源ID1–5/7–11分别配置为队伍0/1，出生点0–9；Group3/Timer4/Trigger1对象状态保留，main=false。地图与MPQ只读，未解包。另两图和菜单会话联动留在新批次，未重跑已关闭的36项JASS、旧引擎、UI、数值或资产全量检查。

证据为 `tmp/docs-artifacts/war3/jass/session-{build.log,tests-build.log,tests.log,dota.log,enums-native.json,enums-cpu.json,enums-cpu.log,registration-rea.json,enum-conversion-rea.json,handles-rea.json,lookup-rea.json,native-catalog.json,receipt.json}`。原图main/可玩对局与完整原版一致性保持总矩阵待实现状态。

W014开发必需的Win32 Release产品、setup/browser测试目标构建通过，无警告。4项setup定向检查通过、0失败：配置覆盖和稀疏ID、种族/控制限制、UI草稿到native查询、占槽/AI/障碍、势力/组合偏好保留、阶段与会话隔离。3项新增D3D9异步检查通过、0失败：快速选择/目录取消、UI写回/同图保留/切图重建、原config未知native失败清空与恢复。旧11项界面检查已适配有界等待但本项未重跑，留到批次合并；未重跑W013七项、数值、旧引擎或全资产检查。

DotA产品最小集成实际完成原图globals/config后导航110帧退出0、无Game.dll：本地源ID1，10槽及原势力分组，障碍90%、同图保留、弹层取消、返回/再次进入菜单通过。截图已核看，原版完整UI像素、背景模型/粒子等仍属总矩阵待还原；不将导航通过写成完整UI/对局通过。证据为 `jass/setup-{build.log,tests.log,player-natives-rea.json}`、`map-menu/setup-{browser-tests.log,browser-tests/browser-results.json,dota.log,dota*.png}`。尚未执行main或可玩对局；本批当前2/3。

W015最小范围：产品和world目标Win32 Release构建通过，无警告；7项world检查通过，195组坐标夹取及77组SSE相机距离换算与原件指令逐位一致、0失败，不加载Game.dll。SourceSettings和Real原实现未变化，未重跑旧数值或全量资产。Amazonia真实main已完成相机/昼夜模型/水色写入和1个矩形创建，随后明确在AddWeatherEffect失败（退出1，main_completed=false），不记录成原图main通过。证据为 `tmp/docs-artifacts/war3/world/{build.log,product-build.log,tests.log,cpu.log,world-*.json,main-amazonia.log}`。world/CPU实现和输入未变化，合并验证复用该结果。

## W013–W015 合并结果（2026-10-26）

集成提交 `a07fcab`，包括W013 `527ad20`、W014 `f802c63` 与W015 `a07fcab`。产品/相关测试目标MSVC Win32 Release构建通过、无警告。会话7、玩家草稿4、原生D3D9界面14，**本次执行25通过、0失败**；复用同一实现/输入的world7项后，已实现范围合计**32通过、0失败**。14项界面包含原11项和新增3项异步检查，覆盖目录/坏图/重试/预览释放、焦点/弹层、全部玩家字段、长列表/固定设置、最新选择/目录取消、草稿回写/保留及config失败恢复。

同一产品二进制 SHA-256 `30b0d76f73d88277e0165f98888a33feb6761c66f6da558812a96b6714f77ae8`：Amazonia、BootyBay、DotA原图globals/config均退出0，带世界数据的产品菜单导航分别104、104、110帧通过，均无Game.dll。world源码/夹具与272次原版比较的摘要一致；新枚举夹具摘要 `7c2d63f14c5159a09d7bb73b86641314efcadb34da9508dfc2e89a2e8f48e6ee` 及元数据与2,925次原版比较报告一致，复用有效结果。没有重跑W010–W012的36项、旧引擎、全量资产或性能基准。

三次完整原图main尝试均退出1，**未通过**，保留以下实现队列：

| 原图 | 实际停止位置 | 待实现 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 原版天气定义、实例与启停、渲染消费；后续单位/触发器 |
| BootyBay | `war3map.j:789:10` NewSoundEnvironment | 真实声音环境、昼夜环境音/音乐、后续单位/触发器 |
| DotA_v6.83d | `Scripts\war3map.j:90177:6` NewSoundEnvironment | 真实声音环境、地图声音/音乐及后续初始化native |

证据为 `tmp/docs-artifacts/war3/world/batch-{build.log,session.log,setup.log,browser.log,browser-tests/,enums-native.json,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-{amazonia,bootybay,dota}.log,w013-w015.json}`，复用证据见同目录world检查和 `jass/session-enums-cpu.json`。本批只关闭已实现配置/世界空间基础；原版完整客户端矩阵、UI像素、main与可玩对局继续待实现/验收，旧MEngine 161–163保持延期。下一批从W016声音环境及相关实际native开始，不用空回调越过失败项。

## W016–W018 运行资源与声音批次

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W016共享归档视图与世界资源寿命 | archive.*、world.*、CMake、archive_tests | 公共/地图去重与作用域、跨线程读取、地图视图隔离/最后释放、LRU和外部引用；声音/模型实际消费，三图持续切图 | 共享StormLib句柄加锁、地图视图遗留、引用与缓存预算差异、后续声音线程寿命 | 资源基础/声音消费合并验证通过；持续切图性能及模型消费待验收 |
| W017共享Miles与MIDI/DLS后端 | audio.*、media.*、CMake、profile、audio_tests | 数字声音与MIDI/DLS实际播放/控制、设备/源字节/音色库寿命，菜单共用设备，地图声音消费与切图释放 | 原stdcall ABI、转换内存分配器、DLS/XMIDI/数字设备关闭次序、重建与并发、听感/空间效果边界 | 已实现后端合并验证通过；3D/听感与完整音频待验收 |
| W018源声音表与脚本MIDI对象 | slk.*、sound.*、session_sound、session.*、main、map_browser/preparation、CMake、sound_tests | SYLK/原声音字段、地图覆盖、globals创建、实际播放控制/状态、抢占/退役/独立寿命、静音传递、原main停止位置；合并资源/Miles及选图受影响范围 | 变量/源资源/设备寿命、同步读取、未还原的渐变/3D环境/时钟、普通声音与Music尚未绑定 | 源表/MIDI对象合并验证通过；渐变/时间/环境与完整main继续待实现 |

W016开发必需编译通过、无警告；7项新归档检查通过，含8视图各128次并发读取、9MiB双成员的16MiB地图LRU、真实BootyBay世界资源视图。DotA产品导航108帧退出0、无Game.dll。没有重跑旧JASS、图像、UI14项、三图全量或性能基准；合并验证覆盖后续音频消费及必要受影响范围。证据为 `tmp/docs-artifacts/war3/audio/archive-*`，接口与预算见 `archives.md`。

W017开发必需的产品/audio目标构建通过，无警告；7项真实Miles定向检查通过、0失败，含原MP3、原MIDI+DLS双sequence共享库、PCM参考长度/定位、播放状态与时间推进、设备/声音/音色库释放及4线程各4次设备重开。检查输出音量为0，未做听感或3D混响验收。产品原菜单带音乐运行60帧退出0，无Game.dll。尚未绑定原图声音native，main停止位置保持天气/声音环境，待下一项接入后合并。没有重跑旧界面、脚本、地图全量、图像或性能基准；证据为 `tmp/docs-artifacts/war3/audio/miles-*`，ABI/来源与生命周期见 `audio.md`。

W018开发必需编译通过、无警告；6项sound检查通过、0失败，实际调用Miles且输出音量0。BootyBay/DotA原main均完成Default源环境登记和1个MIDI/DLS声音创建，随后在 `Scripts\Blizzard.j:1224:12` 的GetFloatGameState失败，退出1、main未完成，无Game.dll。非零渐变及源Pitch非1保持显式错误，3D环境属性仅登记源请求，未做效果一致性验收。证据为 `tmp/docs-artifacts/war3/audio/sound-*`，合并验证复用同一sound二进制/输入的有效结果。

## W016–W018 合并结果（2026-10-26）

集成提交 `6557119`，包含W016 `98197bd`、W017 `a3bc2f7` 和W018 `6557119`。MSVC Win32 Release产品及相关检查目标构建通过，无警告。归档7、Miles7、D3D9界面14，**本次执行28通过、0失败**；复用当前未变化的sound6项，合计**34通过、0失败**。复用前核对了sound二进制/相关源码与最后执行日志的时间及摘要。覆盖资源共享/读写边界、源资源/声音/设备寿命、实际播放/控制及受影响选图/玩家输入；声音检查音量为0，听感/3D混响和完整性能仍待验收。

同一产品二进制 SHA-256 `b15fcbe0550c357710515ff34e480429bd8e9dd73e2bae2a12e7a40520b1fb92`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧通过，无Game.dll。BootyBay/DotA的main证据来自同一产品二进制的W018最小集成，未重复；Amazonia本批补查。三图完整main均退出1，**未通过**：

| 原图 | 实际停止位置 | 后续实现队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气定义/实例/启停与渲染；后续单位/触发器 |
| BootyBay、DotA | `Scripts\Blizzard.j:1224:12` GetFloatGameState | 原版时间初值/变量求值/推进与事件；随后声音渐变、环境效果、Music与单位初始化 |

BootyBay/DotA在停止前各持有1个真实MIDI声音、1个DLS库和Default环境请求；尚未进入后续StartSound，不能视为原图声音播放/完整main通过。额外的非零声音渐变、3D环境应用、普通CreateSound、Music、开局/完整UI与性能保持待实现/验收。下一批W019从时间变量和声音渐变的实际原件调用继续，不填推测状态。

证据为 `tmp/docs-artifacts/war3/audio/batch-{build.log,archives.log,archive-tests/,miles.log,browser.log,browser-tests/,config-{amazonia,bootybay,dota}.log,menu-{amazonia,bootybay,dota}.log,main-amazonia.log,w016-w018.json}`，复用证据为 `sound-{tests.log,main-bootybay.log,main-dota.log}`。没有重跑旧JASS/数值/图像、全资产、旧引擎或性能基准；旧MEngine161–163批次仍延期。本批仅关闭已实现资源/声音基础，完整客户端目标继续进行。

## W019–W021：时间、MIDI与音乐初始化批次（3/3）

| 任务 | 路径 | 待测内容 | 风险 | 状态 |
| --- | --- | --- | --- | --- |
| W019同步初始化时间状态 | game_clock.*、world.*、session_world.cpp、CMake、clock_tests、verify_clock_cpu | 三图globals/config/main、源昼夜规则覆盖/切图隔离、与后续声音和选图的消费；后续调度需补跨日/反向/时间事件 | 当前没有模拟tick/回绕/事件派发，变量层上界只夹取；数值CPU对照替换3个系统边界且没有订阅者，不证明完整昼夜 | 已实现范围合并验证通过；完整时间模拟继续待实现 |
| W020非空间MIDI渐变 | sound_fade.*、sound.*、audio.*、session_sound/session.h、map_browser、CMake、sound_tests、verify_sound_fade_cpu | 合并Miles/选图受影响检查、三图globals/config/main、正反渐变/静音/淡出释放/跨会话资源；源定时器相位/3D保持后续范围 | 无符号步长与回绕、减到零后下一次才停止、脚本句柄退役后的播放所有权；对照替换6个链表/硬件/诊断边界 | 已实现范围合并验证通过；完整音频/玩法待完成 |
| W021脚本音乐配置/播放 | music.*、audio_random.*、session_music.cpp、session.*、map_ui.*、main、CMake、music_tests、verify_music_cpu | 合并时间/MIDI/Miles/选图、三图globals/config/main；地图skin覆盖、选曲、暂停/恢复、定位、渐变、曲终排队与释放 | 声音RNG共享消费时序、最终种族/版本上下文、ThematicMusic与调度相位尚未完成；原件CPU只覆盖RNG及渐变标量/回调边界 | 已实现范围合并验证通过；5,434次原件对照一致；完整main与后续音乐/玩法待完成 |

W019开发必需的Win32 Release产品/clock目标构建通过，无警告。6项定向检查通过、0失败；3,288组变量赋值与7组速率计算和固定原件指令逐位一致。对照范围为零模拟时差、无订阅者的变量层；引用解析、时间取样和时间戳存储共3个边界被替换，跨日/昼夜/脚本事件未验证。

BootyBay最小产品集成退出1，日志显示 `main_completed=false`，已通过GetFloatGameState并创建2个真实MIDI声音/1个DLS库，随后在 `Scripts\Blizzard.j:2482:14` StartSound非零fade-in明确失败，无Game.dll，不能记为完整main通过。产品SHA-256为 `b50a1e579ebeb2f24bb698cc9f58b203657cb83847fc52960d56e0c88d438eb8`。DotA/Amazonia、界面、旧脚本/数值/声音及性能未重复执行，纳入本批受影响范围后去重验证。原始证据为 `tmp/docs-artifacts/war3/clock/{build.log,tests.log,tests/clock-native.json,clock-cpu.json,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。

W020开发必需产品/sound目标Win32 Release构建通过、无警告；10项定向检查通过、0失败。包含真实Miles的非零速率首次播放、重复启动保持播放位置、淡出取消、100ms单脉冲、内部淡入、精确减至0后的延迟结束、kill/独立播放所有权和通道抢占；正音量查询仅在未播放声音上执行，播放时静音。原件对照2,934组步进、8组无符号速率和80组首次/重复启动共3,022组零差异，保留源算术和状态写入，替换6个链表/硬件/诊断边界，不证明物理声音、源定时器或3D分支。

BootyBay真实main已通过StartSound，在 `war3map.j:792:10` 的SetMapMusic明确失败，退出1、main_completed=false，无Game.dll。产品SHA-256为 `0e4fb69db78cbefe6351708ef8d3b4d0b90e44341a28f9178e714c31546a8291`。证据为 `tmp/docs-artifacts/war3/audio/fade-{build.log,tests.log,tests/107988-352511640/fade-native.json,cpu.json,cpu.log,main-bootybay.log,main-process.json,receipt.json,*-rea.json}`。最后的播放状态边界修改后，重新执行10项sound与BootyBay最小集成；新夹具和sound_fade源码摘要均与原件对照输入一致，复用3,022组CPU结果。没有重复旧完整Miles/界面、三图全量、旧引擎或性能基准；下一项完成后先关闭本批受影响验证。

## W019–W021 合并结果（2026-10-26）

集成提交 `e073a7d`，包括W019 `8c2f6af`、W020 `355ceb4`及W021 `e073a7d`。Win32 Release产品及相关测试目标构建通过、无警告。本批执行clock6、sound10、Miles7、world7、browser14共**44通过、0失败**；复用同一实现/输入/测试二进制刚通过的music8项，已实现范围共**52通过、0失败**。这些检查包含源时刻/地图覆盖、真实静音音频/MIDI、曲目表/skin覆盖/渐变/曲终排队、世界/资源所有权与14项选图界面消费。clock/sound的新夹具与受控源码摘要和既有CPU结果一致，分别复用3,295次和3,022次对照；音乐5,434次对照输入/源码摘要亦核对一致，不重复数值执行。

同一产品二进制SHA-256 `94277e14b1f03472babeb0740ff7593d37c0c9b4ca06ee04a320320cc8c5915a`：三图globals/config退出0；Amazonia、BootyBay、DotA菜单导航分别104、104、108帧退出0，无Game.dll。三图完整main均退出1，**未通过**：

| 地图 | 实际停止位置 | 后续队列 |
| --- | --- | --- |
| Amazonia | `war3map.j:1258:14` AddWeatherEffect | 天气与后续单位/触发器 |
| BootyBay | `war3map.j:643:13` CreateUnit | 单位定义/创建与后续初始化 |
| DotA_v6.83d | `Scripts\war3map.j:90181:8` CreateSound | 普通声音创建与后续初始化 |

BootyBay的main复用同一产品二进制的W021最小复现，另两图本批执行。BootyBay/DotA均持有Music、index=−1、tracks=0的配置，未提前播放；音乐实际播放由定向原资源/JASS用例验证。完整音乐上下文/ThematicMusic、模拟tick/事件、世界渲染、实际开局、玩法/完整UI/性能仍待实现或验收。

证据为 `tmp/docs-artifacts/war3/audio/batch-w019-w021-build.log`、`batch-w019-w021.json`、`batch-w019-w021/{clock,sound,audio,world,browser}.log`及夹具/三图日志，复用music证据见 `script-music.md`。未重复旧JASS/数值、图像/资产全量、旧引擎或性能基准；MEngine161–163批次仍延期。本批关闭已实现范围，完整客户端目标保持未完成。

## 阶段A：对象初始化到可操作地图（实现中）

门槛为选图、载入、地图主函数、世界画面、单位操作和返回菜单的连续流程。源码分批提交，完整流程实现后集中验证；W022–W024达到三项不触发中断实现的回归批次。

| 任务 | 路径 | 待测内容 | 边界/风险 | 状态 |
| --- | --- | --- | --- | --- |
| W022源对象与单位/物品 | object_data.*、entities.h、session_entities.cpp、session.*、slk.*、map_ui.*、CMake | 原单位/物品表、w3u/w3t继承及类型/终止标记、Profile大小写、源属性、创建/查询/修改/分组/销毁、切图所有权 | 完整对象家族/放置、碰撞/寻路、渲染、能力/物品库存及死亡事件继续实现；未映射修改保留记录 | 源码已接入，产品编译/静态签名检查通过；功能与原版一致性待阶段验证 |
| W023天气实例状态 | session_weather.cpp、entities.h、session.* | 源Weather.slk、区域/启用状态、生命周期、原图main消费与切图释放 | 天气粒子/渲染消费者尚未接线，源行为细节待核对 | 状态实现已接入；画面与阶段验证待完成 |
| W024普通数字声音 | audio.*、sound.*、session_sound.cpp | 实际WAV/MP3、延迟声音申请、loop/pitch/时长、标签参数、自然结束/释放、源脚本初始化与MIDI兼容 | 监听器/空间混音尚未接线，空间播放明确失败；声音变体、EAX、完整原版音频待实现/核对 | 基础实现已接入，产品编译通过；Miles运行/相关回归待阶段验证 |

本批只执行必要Win32 Release产品编译（无警告）、56个字面量native签名的静态核对与差异检查，没有运行功能测试、三图回归、CPU逐位对照、全量资产或性能检查。编译证据为 `tmp/docs-artifacts/war3/implementation-build.log`。历史52项通过属于e073a7d，不能作为本批新增代码已通过运行验证的依据。详细来源和边界见 `entities.md`。

| 阶段A接续任务 | 路径 | 待阶段验证 | 当前证据/边界 |
| --- | --- | --- | --- |
| W025回调/枚举/事件/时钟核心 | script_state.h、session_callbacks/collections/tick、session.*、game_clock.*、session_world | 嵌套回调、删除/重启/禁用、短/周期计时器、阈值/回绕、事件顺序与切图 | BootyBay原main及250ms早期回调通过；线程等待、全部生产者与原版时序待完成 |
| W026原版开局资源/状态 | session_game/dialogs、session_entities、object_data、entities、sound/session_sound、slk、archive、main/platform、CMake | 源表/能力别名、声音标签、资源枚举、PLD、规则/种族/科技/相机/窗口状态、三图main与持续模拟 | BootyBay65单位/42触发器/8计时器/57事件；完整游戏RNG、规则/渲染消费者和另外两图待完成/复查 |
| W027Miles waveOut输出 | audio.cpp、CMake开发符号图 | Miles/MIDI/MP3、音量/渐变/自然结束/释放、窗口与听感回归 | Miles库内waveOut路径已在静音最小复现创建3声音/1DLS库；未做完整音频回归/听感验收 |

接续只执行开发必需编译、165项字面量native签名静态核对、BootyBay阻塞复现及新增250ms模拟入口；没有运行旧全套测试、三图遍历、逐位CPU、全资产或性能基准。最新Win32 Release产品无警告，SHA-256 `035b4a2c02f786f355fa927481a21b49aa37c815c34e02a8a5aa71793c96bbe4`。原图globals/config/main退出0，推进后bj_gameStarted=true，无Game.dll，预载缺失0。它不证明地图已经显示、单位可操作或完整玩法通过；功能/原版一致性继续在阶段A集中验证。证据与必要边界见 `script-events.md` 和 `tmp/docs-artifacts/war3/stage-a-*`。旧MEngine161–163仍延期。


## 阶段A：原图场景和基础命令（W028–W030）

| 任务 | 主要路径 | 已实现消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W028原地图世界绘制 | scene_assets/math/objects、terrain_scene/layout、model/pose、renderer | 地面混合、源悬崖/坡道/动画水面；DOO及w3b/w3d、单位/物品MDX、队伍色、静态缓冲与空间裁剪 | 三图拓扑/透明材质、动画、路径贴图变换、缩放/设备恢复、预算边界、CPU/GPU内存与帧耗时；光照/迷雾/粒子/LOD继续实现 | 已接入；BootyBay画面开发复现通过，完整待阶段验证 |
| W029开局/载入/返回 | game_loading、loading_screen、map_browser、main、fdf、platform | 源PlayGameButton、现有会话转移、后台main/CPU准备、实数GPU上传进度、源Loading/ConsoleUI、取消/失败/返回和--play | 菜单鼠标/键盘开始，三图、取消/快速切换/失败重试、退出时资源释放、CPU工作取消延迟、连续切图无磁盘增长；完整源游戏内菜单待实现 | 已接入；开局/返回开发复现通过，队列未关闭 |
| W030相机/选择/基础命令 | game_view、world_path、session_orders/tick/entities、script_state | 六档源相机/有界滚轮、平移、选择/框选/Shift/源圈、同一native/UI移动与S/H、WPM八邻A*和固定步进、订单事件 | 实际移动轨迹/终点、不可达/穿角/边界/半径、删除/事件重入、缩放上下限、相机边界、选择/命令时序；动态碰撞/编队和完整类型待实现 | 已接入；选中1单位和接受移动命令、滚轮输入开发复现通过，完整待阶段验证 |

本批必要Win32 Release产品编译无警告、差异检查通过。只运行BootyBay新开局/窗口输入的最小开发复现：最新CPU准备1156ms、192纹理、177区块、2011放置物、65单位，30游戏帧退出0，无Game.dll，随后返回选图；首次地图画面另有20帧证据。未检查移动终点/全缩放边界，不作为完整玩法或性能验收。原始产物为 `tmp/docs-artifacts/war3/scene-{build.log,input.ps1,input.log,bootybay.log,bootybay.png}`。没有运行旧测试全集、三图遍历、逐位CPU对照或全资产基准。阶段A其余功能继续实现；三图及输入/还原/释放/性能集中执行后才关闭本队列。旧MEngine161–163继续延期。

阶段验证入口：使用 `--map <地图> --play` 分别进入Amazonia、BootyBay、DotA_v6.83d，合并验证上表；无GPU的初始化故障先用 `--main-check --map <地图> --simulate-ms <区间>` 缩小。只重测失败及修复影响范围；截图/采样均写 `tmp/docs-artifacts/war3/`。


## 阶段A：运行中世界消费接续

| 任务 | 主要路径 | 实际消费 | 待合并验证 | 状态 |
| --- | --- | --- | --- | --- |
| W031单位呈现和资源队列 | session_visual/entities/orders、scene_assets/streaming、model/pose、game_view | 颜色/alpha/缩放/高度速率/动画、CPU后台解码、依赖复用、GPU交付边界 | 动态GPU实例、透明材质、全部序列/队列、取消/预算/切图、设备恢复；--play返回单人界面补充路径 | 已实现；CPU交付/单位状态定向检查通过，GPU待测 |
| W032区域/聊天/物品栏 | spatial_region、session_spatial_events/inventory/text、game_view/main | 点/区域成员、进入离开/接近/聊天生产者、文字/Unicode输入、槽位/拾取丢弃事件/物品图标 | 量化和事件时序、重入删除、完整库存能力/死亡/使用、频道/布局/文本边界 | 已实现；区域进入和3次物品事件在复制原图中通过；其他待测 |
| W033视野/天空/typed storage | fog_grid/render、session_fog/cache/hashtable、world、terrain_scene | 单位昼夜/共享视野、modifier启停/优先级、模型/地形投影、源天空、基本类型/句柄和键值清理 | 原版迷雾刷新/分辨率/遮挡、shader画面/恢复、hash类型交叉与句柄寿命、字符串边界；持久w3v与同步待实现 | 已实现；CPU视野/存储检查通过，新增GPU待测 |
| W034无输出设备的显式静音 | audio_duration、audio、sound、music | 原WAV/MP3/SMF时长和逻辑voice，播放/循环/暂停/定位/渐变，取消静音回到Miles | 时长/格式错误边界、自然结束/速率/切换；有声Miles/3D/听感继续按原范围验证 | 静音原图初始化/状态通过；未验证有声输出 |

只执行开发必需Win32 Release产品/定向程序编译、源native签名校验、当前开局阻塞定位及1项新增消费者集成检查。夹具在复制BootyBay中延迟创建单位，跨API检查区域进入、3次物品事件、视野覆盖/停止、基本类型/句柄读写与清理、外观/高度状态及CPU后台解码；通过1、失败0，GPU未执行。夹具生成器保留原图只读，所有map/JSON/log仍写 `tmp/docs-artifacts/war3/`。

Amazonia原globals/config/main与250ms推进退出0：102单位、55触发器、83事件，bj_gameStarted=true，无Game.dll；显式静音device voices/DLS均为0。DotA最新到121单位/13触发器/74事件，在 `Scripts/war3map.j:91823` AddUnitToStock失败。当前Windows会话Disconnected，实际D3D9/9Ex/On12设备创建均失败；新增GPU画面/输入/恢复/释放仍排队，未关闭阶段A。已有3fc434c帧不复用为新增GPU消费者通过证据。

原始证据为 `live-world-{build.log,consumers.log,streaming.log,amazonia.log,dota.log,amazonia-render.log}`，均在 `tmp/docs-artifacts/war3/`。未运行旧全套、三图完整回归、性能或逐位原件对照。原件精度、完整交互和性能继续合并验证，旧MEngine161–163继续延期。实现细节与复现命令见live-world.md。


## 阶段A/B：商店、训练与人口（W035–W037）

| 任务 | 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- | --- |
| W035商店库存和购买 | session_commerce、commerce、session_entities | 源售卖清单/价格/补货，库存及中立订单native，真实扣费/单位/物品/事件 | 原件库存/买家选择/前置/出生点/售卖时序、重入、DotA商店；英雄雇佣额度及物品使用/出售另行实现 | 已接入；编译通过，运行待阶段验证 |
| W036单位生产与人口 | session_production/food/orders/tick/callbacks | 7项队列、扣费/退款、队首预留、完成单位/事件/集结点、人口生命周期/转让 | 队列/事件重入删除转让、资源溢出/人口边界、死亡/取消/出口阻塞、完整类型/原件精度 | 已接入；编译通过，专项夹具排队 |
| W037源产品命令区 | game_commands/view、object_data/session_game | 产品图标/位置/热键/价格/库存/禁用、进度/取消，流式图标、GetObjectName及能力名称表 | 真窗口鼠标/键盘/热键冲突/工具提示/源HUD排版、动态GPU、地图切换与三图回归 | 已接入；GPU及输入待测 |

只执行开发必需Win32 Release产品和新消费者程序编译、差异检查与DotA开局阻塞最小复现。编译无警告。DotA已越过AddUnitToStock和GetObjectName，当前121单位/13触发器/74事件，停在Scripts/war3map.j:8416的SetPlayerHandicapXP；main未完成。没有运行专项夹具、旧全套、三图完整回归或性能基准。新消费者生成器和运行命令见commerce.md，原始日志在tmp/docs-artifacts/war3/commerce-{build.log,dota.log}。阶段队列及旧MEngine延期状态保持开放。


## 阶段A/B：英雄成长和地图标记（W038）

| 主要路径 | 实际消费 | 合并待测与风险 | 状态 |
| --- | --- | --- | --- |
| session_hero、entities/session、game_commands、session_world/game_view | 源经验阈值/公式、等级/三属性/HP/MP/技能点、经验倍率/暂停、原版能力学习/事件与HUD；Alt小地图资源/绘制 | 原件倍率适用范围/舍入/属性语义、历史规则集、升级/学习重入、完整效果、图标/输入/GPU；自定义w3a、完整战斗及经验分配未完成 | 已接入；必要编译/开局阻塞定位，专项夹具待阶段执行 |

英雄与商店共用war3_commerce_tests/复制BootyBay夹具，新增经验倍率/暂停、升级/学习上下文、属性及生命上限检查，未执行。DotA越过SetPlayerHandicapXP、SetAltMinimapIcon和GetItemType，最新123单位/1物品/67触发器/700事件，停在UnitAddItem拾取脚本的IsUnitIllusion（Scripts/war3map.j:17014）；main未完成，幻象子系统仍待实现。Win32 Release产品及扩展消费者编译无警告，字面量native签名静态核对通过。源签名与说明见heroes.md。没有扩大为旧全套、三图完整回归、性能或原件逐位检查。


## 阶段A/B：能力、幻象与物品使用（W039–W041）

| 任务 | 路径与实际消费 | 合并待测 | 状态 |
| --- | --- | --- | --- |
| W039能力覆盖 | object_data；w3a元数据/等级/Data槽/继承，能力查询/英雄学习/物品共用 | 复杂覆盖/索引/损坏文件/历史规则；自定义效果仍逐项实现 | 编译/开局读取通过，专项待测 |
| W040物品与幻象 | session_illusion/item_use/inventory、game_view/commands；魔棒实例、药水、次数/魔法/冷却、事件/定时生命/人口、输入/蓝色外观 | 原件复制/倍率/时序、重入删除、输入/目标/失败/GPU、释放/性能 | 已接入，消费者夹具未执行 |
| W041基础脚本伤害 | session_damage/callbacks；源分类/基础护甲/幻象倍率、伤害/来源/死亡/击杀者 | 完整防御/护盾/魔免/自动战斗/经验尚未实现；原件公式/边界/重入 | 已接入，数值/事件夹具未执行 |

开发必需Release产品/扩展消费者编译通过；22个字面量native声明和生成器语法检查通过。DotA原main已完成，123单位/1物品/205触发器/1,303事件，无Game.dll；250ms推进仍在延迟CreateQuest失败，完整开局未通过。专项夹具复用war3_commerce_tests，增加w3a/w3t覆盖、召唤/真假、伤害倍率、药水/冷却和定时生命/人口断言，保持待阶段执行。REA确认原版IsUnitIllusion注册和单位标志，细节见illusions-items.md。新GPU、专项夹具、三图完整玩法和性能未执行。


## 阶段A/C：任务窗口与开局查询（W042–W043）

| 任务 | 实际消费 | 合并待测与缺口 | 状态 |
| --- | --- | --- | --- |
| W042任务状态/窗口 | session_quest、quest_dialog、game_view、glue；真实句柄/目标/发现/完成/失败/通知，原QuestDialog FDF/纹理/字体/勾选/F9/焦点/文字翻页 | GPU/源锚点/皮肤/长文/真实输入/增删/释放；完整滚动条和未发现任务展示、暂停规则待完成/对照 | 已接入；编译通过，窗口/专项夹具待测 |
| W043空槽与源分类 | session_entities/main；空物品槽查询、武器启用位/类型/目标和召唤分类、任务数量日志 | 非零失效句柄/边界、完整类型、原件分类精度及重入；未知状态分类仍明确失败 | 原件空槽依据及DotA阻塞复现通过；完整待测 |

必要Release产品及扩展消费者编译无警告，8个字面量任务native声明核对通过，实际DotA模块绑定/创建任务通过。DotA原main完成：123单位/1物品/205触发器/1,303事件；250ms推进创建6任务后在Scripts/war3map.j:32750的IsPointBlighted失败，无Game.dll，完整开局未通过。任务/目标/通知、空槽和近战源分类断言加入既有消费者，尚未执行。原始证据为tmp/docs-artifacts/war3/quests-{build,dota}.log、quest-item-*-rea.json。没有运行专项夹具、三图完整玩法、GPU或性能；旧MEngine延期状态保持。


## 阶段A/B：荒芜、地表查询和持续恢复（W044–W045）

| 任务 | 实际消费 | 合并待测与缺口 | 状态 |
| --- | --- | --- | --- |
| W044动态荒芜/地表查询 | world_blight/session_blight、terrain_blight/scene/layout；原WPM/顶点、范围写入、同源查询、16×16可见区域失效/掩码/VB更新、源地表/变体 | 原件边界/归属/量化、缺失WPM、初始/动态GPU/切图/预算；金矿和完整地形/路径写入另行实现 | 已接入；编译/开局路径通过，GPU/专项待测 |
| W045持续恢复 | session_regeneration/entities/tick；源HP/MP/类型、昼夜/荒芜和英雄属性、实际生命/魔法/死亡 | 精度/负恢复/暂停/重入、全族/英雄/幻象、性能和资源释放 | 已接入；编译通过，数值夹具待测 |

必要Release产品/扩展消费者编译无警告，7个字面量native声明及生成器语法检查通过。DotA原main及250ms、2,000ms模拟均退出0，bj_gameStarted=true，无Game.dll；只定位开局后的首批定时器路径，不代表完整玩法通过。原始记录在tmp/docs-artifacts/war3/blight-{build,dota,dota-2000ms}.log；REA/源统计及边界见blight-regeneration.md。消费者增加荒芜/幂等/恢复开关断言，尚未执行。新增GPU、专项夹具、三图完整回归和性能仍排队；当前会话1为Disconnected，旧MEngine延期状态保持。MSVC核心/客户端已启用并核对8路编译，不改变运行时结论。

## 攻城兵种攻击能力阶段待验证

路径：session_siege_attacks、passives／combat／spells／session、被动源定义／前置／登记／调度、攻击发射与命中、buff伤害／修理、源资源流。Aflk／Afsh／Abof／Aliq／Aroc及w3a派生有真实消费者。

状态：实现接入；Win32 Release产品增量编译通过、无警告，差异检查通过；不执行新增专项、三图、GPU、原版精度或性能回归。集中验证三档范围／固定伤害／主目标排除／中甲与无甲、原武器载荷／miss／防御／多能力、火场时序／持续／叠加／空间查询／孤立来源、液体炸弹禁修理／恢复／重复刷新／清理，弹幕第二武器／多目标／预算／对地并行／命令与时钟、研究／可用开关／w3a／形态／库存／回调死亡移除易主、UI／GPU／音效／AI／三图长局和内存释放。证据与构建日志在tmp/docs-artifacts/war3/siege-attacks/；原版精度边界见[实现说明](siege-attacks.md)。旧MEngine队列保持延期。

## 疾病云雾与瘟疫投掷阶段待验证

路径：session_plague、passives／entities／spells／session、被动源定义／前置／登记与空间调度、攻击载荷／落弹、死亡／限时生命、buff周期伤害和damageUnit疾病光环魔免分支。Aapl／Aap1–Aap4、Apts及原地图覆盖有真实消费者。

状态：实现接入；必要Win32 Release产品编译通过、无警告，差异审查通过。未执行新增专项、三图／原版精度、UI／GPU／音效／AI和性能回归，均留功能阶段合并。集中验证源感染时限／秒脉冲／多源与重复、离开范围／来源死亡移除易主／归因、亡灵／目标与魔免／驱散／虚无分类、checkDep／研究／开关／变形／幻象、真实云雾死亡和落弹生成／数量／原事件／原模型／不可选取与人口路径、脚本枚举／归属／限时清理／复活重入、地形对象攻击和三图长局／内存／切图释放。证据与构建日志在tmp/docs-artifacts/war3/plague/；原版边界见[实现说明](plague.md)。旧MEngine队列继续延期。

## 不稳定化合物、霜冻攻击与掠夺阶段待验证

路径：session_concoction／session_frost_pillage、spells／passives／entities／session、施法目标／命令／支付／释放、独立tick与死亡／移除／形态、攻击发射／命中、效果呈现／颜色／资源、冻结生产／研究／建造／升级／修理／矿井与资源返还、掠夺余量生命周期。Auco／Afrb／Afrz／Asal及原地图覆盖有真实消费者。

状态：实现接入；必要Win32 Release产品增量编译通过、无警告，差异审查通过。未执行新增专项、三图、原件精度、UI／GPU／音效／AI或性能回归，留功能阶段合并。集中验证原手动输入与自动开关依据、飞行／原载体／目标失效／死亡消耗与人口／回调清理、源主次伤害／分类／免疫与叠加、原弹道与霜冻目标／冻结全部建筑消费者及恢复、掠夺实际伤害／费用／两种小数余量／阈值／原舍入／统计和税收／资源事件／删除易主重入；完整UI／GPU／音效／AI、三图长局和内存／切图释放。证据与构建日志在tmp/docs-artifacts/war3/concoction-frost/；边界见[实现说明](concoction-frost-pillage.md)。旧MEngine队列保持延期。

## 毒素攻击、物品法球与腐蚀喷吐阶段待验证

路径：session_weapon_effects、combat／entities／passives／spells／session、被动定义、装备与库存、能力可用开关、武器启用／发射／命中、周期伤害／非致死回调和单位移除。Apoi／Apo2／Aven／Aspo／Acor／Afra、AIfb／AIob／AIcb／AIpb／AIlb／AIsb及派生有实际消费者。

状态：实现接入，必要Win32 Release产品增量编译通过；未执行玩法、三图／原件精度、UI／GPU／声音／AI或性能回归，保持阶段待验证。集中验证毒剂叠加身份／四位标志／时钟／暂停／驱散与免疫／来源死亡移除易主／归因、非致死与伤害事件／护盾／灵魂链接／复活重入；法球库存优先级／主动箭矢冲突／多件加成／首次减甲／火焰范围／英雄及召唤物概率／净化缓慢和死亡奴仆；科技与可用开关／物品增减／形态／幻象／原附件清理、第二武器对空及完整表现。已知实现缺口：Hpal／Obla等缺少源弹道速度时当前即时结算，原缺省飞行尚未还原；Acor DataA持续伤害尚未接入。原始证据与构建记录在tmp/docs-artifacts/war3/weapon-effects/，边界见[实现说明](weapon-effects.md)。旧MEngine队列继续延期。

## 雕像恢复与月亮井补给阶段待验证

路径：session_restoration、spells／entities／combat／session、原能力定义、手动／自动施法和释放、smart／follow／取消、装备／能力／科技／归属刷新与昼夜再生。Arpl／Arpm／Arpb／Ambt及Amb2的原型／地图覆盖接入真实生命、魔法、费用和源按钮模型。

状态：必要Win32 Release产品增量编译通过、无编译警告，差异检查通过；未执行玩法夹具、三图、UI／GPU／音频／AI或性能回归。集中验证0／1／5／6及更多目标／最低缺损／受影响与计费上限／最低费用／低魔法和空放、多源／同源短状态／幻象／魔免／驱散／虚无与恢复上限、原自动双开／门槛／选择顺序及冷却；月亮井双资源均分／余量／不足与单项系数／原精度、手动远目标／右键多单位／接近／取消／供给忙碌／失效清理、夜间与研究／能力可用开关／类型／归属／地图覆盖、重入修改命令／死亡／复活／资源及费用事件精度。已知表现缺口：DataD水位及实际魔法量联动的原单位动画；当前自动门槛及最大预扣后返还的计费事件顺序待对照。完整原版窗口／音效／AI／三图长局、性能与切图释放保持阶段待验证。原始证据在tmp/docs-artifacts/war3/restoration/，边界见[实现说明](restoration.md)。旧MEngine队列继续延期。

## 法术书与遗忘之书阶段待验证

路径：session_spellbooks、spells／entities／session、定义／原订单表、库存与装备、借用与自身等级、原命令区／输入／层级／取消、普通／即时／相位／箭矢施法与共享冷却、英雄学习／技能点／句柄、脚本增删改级／科技／单位变身／工程替换。Aspb／Aret与原sbok／tret及对应地图覆盖有真实消费者。

状态：必要Win32 Release产品增量编译通过，无编译警告；差异及347项订单名严格排序检查通过；未执行玩法夹具、三图、UI／GPU、AI／音频或性能回归。集中验证原sbok三种子技能实际输入与支付／状态／目标、开关与反复打开／持久选择、共享冷却和普通／即时／相位／箭矢／多本及嵌套／同订单合并、科技／脚本等级／增删／变身／工程／来源回收与重入；遗忘之书普通／终极／被动／工程／额外技能点／库存使用事件／次数／重训期间状态实体与冷却及重新学习；真实命令面板／文本／皮肤／热键／返回／选择切换、完整三图／DotA长局、音效／AI、帧耗时／内存与切图释放。原随机、共享／物品事件精确语义、幻象及完整组合仍待对照，11技能／256候选／256活动书／16层边界与循环失败须合并验证。原始证据在tmp/docs-artifacts/war3/spellbooks/，范围及限制见[书籍玩法](spellbooks-retraining.md)。旧MEngine队列继续延期。

## 召唤道具与迷你建筑阶段待验证

路径：session_item_summons、item_use／spell_info／spells／area_spells／session、玩家种族解析、原建筑物理放置、GameView建筑预览／模型流式加载。AIfs／AIsh／ANwm／AIrd／AUin／AIbl及原版派生与地图覆盖连接真实消费者。

状态：实现接入，必要Win32 Release产品增量编译通过、无编译警告，差异检查通过；未运行新增玩法夹具、三图／原件精度、UI／GPU／AI／声音或性能回归。集中验证两组／重复／数量与预算／落点不足、尸体与地狱火延迟／伤害／事件，六槽／次数／共享冷却／取消／库存及回调清理；玩家种族与英雄种族不同／原列表／单条及5条／源时长／0时限、预览模型／网格／物理放置／远距接近／免费自动施工／人口／受伤／暂停冻结／完成取消／易主销毁。原布局、随机、事件次序、施工及位移精度／完整表现待对照。机械小动物／地雷／诱饵见后续功能记录。证据与构建记录在tmp/docs-artifacts/war3/item-summons/，边界见[实现说明](item-summons-buildings.md)。旧MEngine队列保持延期。

## 地雷与怪物诱饵阶段待验证

路径：spells／passives／spirit_split／combat定义、session_item_summons／item_use／spell_info／spells／area_spells／summons、活跃被动注册与空间检索、隐形／侦测、守卫时钟／引诱命令、战斗目标／返航和Adda死亡爆炸。AIpm／Amin／Adda／AImo及原派生和地图覆盖有真实消费者。

状态：实现接入，必要Win32 Release产品增量编译通过、无编译警告，差异检查通过。未运行新增玩法夹具、三图／原版精度、UI／GPU／AI／声音或性能回归。集中验证原激活／隐形／侦测／暂停／禁用／复活／易主、触发分类／范围边界、击杀与触发死亡后的延迟／双区域／魔免建筑／地形对象／多能力和回调归因，诱饵原数量／周期／目标／多人来源／无视野命令／守卫距离／失效返航与取消，以及库存／UI／音效／三图长局／帧耗时／内存释放。触发精度、伤害类型／多源顺序、诱饵选怪／睡眠和周期语义保持原版待对照；机械小动物见后续功能记录。源表／原字段名／摘要／脚本及构建日志在tmp/docs-artifacts/war3/item-summons/，消费和边界见[实现说明](mines-lure.md)。旧MEngine队列保持延期。

## 机械小动物阶段待验证

路径：object_data单位枚举／地图覆盖、spell_info源动物地形池、库存施法／召唤／状态、自动攻击过滤、敌方中立外观／库存隐藏、现有移动／驱散与反馈。Amec／Bmec及地图派生有实际消费者。

状态：实现接入，必要Win32 Release产品编译与差异检查通过、无编译警告；未运行新增玩法夹具、三图／原件精度、UI／GPU／AI／声音或性能回归。集中验证地形池／通配／回退／源特殊和战役标志／飞行水上／自定义动物／原随机顺序、碰撞落点与多数量；6槽／持续标记／召唤／驱散／反馈／回调／移除／易主／死亡复活、敌我普通自动攻击／自动施法／凤凰火焰与强制攻击／侦测／原中立外观／控制／声音及完整UI，三图长局／帧耗时／内存／切图释放。原候选序、标记移除和敌方伪装精度未对照。原表／摘要／REA和产品构建证据在tmp/docs-artifacts/war3/item-summons/，边界见[实现说明](mechanical-critters.md)。旧MEngine队列保持延期。

## 战役提示、目标朝向与跳过阶段待验证

路径：session_text／session_indicators／game_indicators／session_match、实体／模型姿态、场景与 GameView、小地图资源流。必要 Win32 Release 产品编译与差异检查通过；Prologue01 原 main 初始化通过，静音模拟越过原 PingMinimap 阻塞，随后遇到未绑定的 TriggerWaitForSound，未完成 20 秒模拟。证据：tmp/docs-artifacts/war3/campaign/prologue-next-integrated.log。

集中验证 Ping 动画／大小／颜色／声音／重叠和 GPU 状态；单位／物品／可破坏物指示的叠色／透明度／时序；LookAt 的骨骼轴、目标生命周期／附件／插值；Esc 在不同控制、界面和触发器状态下的事件与原版行为。完整战役画面、声音、性能与三图继续留功能阶段；旧 MEngine 队列保持延期。

## 战役声音等待阶段待验证

路径：session_sound／sound／audio、脚本线程及离线 main-check 时钟。Win32 Release 产品编译通过，序章静音模拟越过 TriggerWaitForSound，随后在 SetUnitFacingTimed 未绑定处停止；日志 tmp/docs-artifacts/war3/campaign/prologue-sound-wait.log。

集中验证原声音自然结束／正负偏移／空与未播放／提前停止／淡出／销毁与独立播放、循环／重复启动／seek／变速／暂停、多个等待线程和上下文；比较真实 Miles 与静音离线时钟的行为以及完整战役声音和画面。原版唤醒条件及空声音／负偏移语义尚未确认。旧 MEngine 队列继续延期。

## 战役单位定时转向阶段待验证

路径：entities／session_entities／session_orders／session_combat／session_spells／session_concoction／session_roots。Win32 Release 产品编译与差异检查通过；Prologue01 原 main 和 20 秒静音模拟通过，1 个脚本线程继续运行，未加载 Game.dll；日志 tmp/docs-artifacts/war3/campaign/prologue-facing.log。

集中验证正负／跨 0 与 180 度、0／极短／长时长、重复和即时覆盖、暂停／死亡／隐藏／移动／战斗／施法与扎根的优先级及原版画面和插值；完整序章、音频与三图性能继续阶段验证。旧 MEngine 队列继续延期。

## 战役教程镜头与选择阶段待验证

路径：session_world／session_collections／session。GetCameraTargetPositionLoc 为镜头目标生成独立 location，SyncSelections 与 GroupEnumUnitsSelected 连接单机选择快照。Win32 Release 产品编译与差异检查通过；之前版本的 Prologue01 原 main 和 60 秒静音模拟通过，未执行本次教程交互或三图回归，证据 tmp/docs-artifacts/war3/campaign/prologue-60-next.log。

集中验证 SmartCameraPanBJ 在静止／手动平移／跟随／镜头过渡时的目标查询与位置句柄生命周期；本地选择／取消／隐藏移除／过滤回调／连续同步、多人选择交换和等待，及教程实际救援／编组完整输入。SetItemDropID 及独立快照见后续物品来源记录；原版画面／声音／性能及旧 MEngine 待测项保持原状态。

## 模型动态光源阶段待验证

路径：model／model_data／model_pose。Win32 Release 产品编译通过；原 ArthasIllidanFight 模型解析 5 个灯光并完成 19 秒隐藏窗口绘制，日志 tmp/docs-artifacts/war3/campaign/model-probe/。

集中验证法线／骨骼／非均匀缩放、点／方向／环境灯、所有源动画／多光混合／Unshaded、材质／滤色／环境光与原版画面，以及跨模型／昼夜光、性能和资源释放。当前仅模型自身灯光，基础环境为近似值；旧 MEngine 队列保持延期。

## 空间声像与声锥阶段待验证

路径：audio／sound／session_sound／session／game_view。普通空间声音按监听方向与声源位置设置原版 Miles sample pan，声锥参数改变实际音量；Win32 Release 产品编译通过，实际听感尚未验证。

集中验证左右／正前／正后／垂直位置、转向／滚转／跟随、音量与范围／声锥内外／淡变、位置与朝向改变、静音／释放／抢占及原版 Miles 混音。当前声像及衰减公式为近似，区域堆叠声像见后续记录；原版精度、音频设备与性能留阶段验证。旧 MEngine 待测队列保持延期。

## 物品掉落来源与缓存版本阶段待验证

路径：entities／script_state／session_entities／session_cache。SetItemDropID 保存物品来源 rawcode，独立 gamecache v2 读写该值并兼容 v1；Win32 Release 产品编译通过，定向检查 v2 保存／读取／恢复与 v1 默认值通过，未加载 Game.dll，产物 tmp/docs-artifacts/war3/drop-cache-probe/。

集中验证空／销毁句柄、原序章死亡掉落及后续商店／拾取、跨关卡和所有物品格、损坏与旧格式迁移、存档／回放字段、原版 StoreUnit 及其他潜在来源字段消费者。原版普通存档保留该字段，但原版 gamecache 是否保留仍待对照；独立缓存格式不是原版格式。旧 MEngine 队列保持延期。

## 战役编组、区域与物品枚举阶段待验证

路径：session_collections／session_world／session_fog／session_inventory／session_research／script_state。Win32 Release 产品编译与差异检查通过；Prologue02 原 main 和 60 秒静音模拟通过，仍有 1 个脚本线程，未加载 Game.dll，日志 tmp/docs-artifacts/war3/campaign/prologue02-next.log；该运行不代表这些玩家交互路径已覆盖。

集中验证编组即时／点／目标命令和 ID 变体、空组／部分失败／回调修改成员、选中玩家和多人同步；移动区域尺寸／边界、地点明暗视野、物品过滤／持有／隐藏／销毁／嵌套上下文及研究开始／取消／完成事件。序章教程计数板见后续记录；三图、GPU／音频和性能留功能阶段。旧 MEngine 队列继续延期。

## 区域堆叠声定位阶段待验证

路径：sound。区域堆叠播放选择当前最大增益区域，以区域内最靠近监听点的位置计算左右声像；同增益时选择最近区域。Win32 Release 产品编译与差异检查通过，未执行实际听感检查。

集中验证进入／退出／重叠区域、相同增益及距离、监听方向旋转／高度、范围与声道抢占／静音，以及多声源和原版听感与性能。区域择选和声像公式仍待原版对照。旧 MEngine 待测队列保持延期。

## 战役计数板阶段待验证

路径：session_leaderboard／session／script_state／session_hashtable／game_leaderboard／game_view。Win32 Release 产品编译通过；Prologue02 环境的脚本创建、玩家关联、增项、显示及销毁与原 FDF／皮肤底板隐藏窗口绘制通过，未加载 Game.dll；探针位于 tmp/docs-artifacts/war3/leaderboard-probe/，未运行完整教程交互。

集中验证多玩家关联／更换／销毁、同玩家多项、增删／索引／空列表／排序、颜色覆盖／显示选项／长文本／透明度／hashtable，Prologue02 真实教学计数与事件、原版屏幕锚点／行距／图标／肤色及窗口比例。当前动态行布局和图标是近似实现；三图、GPU／音效／性能与旧 MEngine 队列保持阶段待验证。

## 多列计分板阶段待验证

路径：session_multiboard／session／script_state／session_hashtable／game_multiboard／game_view。Win32 Release 产品编译和差异检查通过；真实 Prologue02 脚本环境下的状态／尺寸／句柄和原 FDF／默认图标隐藏窗口探针通过，未加载 Game.dll，记录在 tmp/docs-artifacts/war3/multiboard-probe/；未覆盖实际 GameView 点击或 DotA。

集中验证行列扩缩／失效句柄／重复释放／销毁／hashtable、所有批量与单项样式／颜色／宽度／UTF-8 和颜色标记、地图覆盖图标／缺图／异步加载、最小化按钮／输入拦截／遮挡／多板、最大尺寸与裁切、多客户端独立显示和原版视觉。原版屏幕锚点／行距／图标边框、清理与样式语义尚待对照；原版性能、三图、GPU、音频及旧 MEngine 队列继续阶段验证。

## 玩家让分生命值阶段待验证

路径：session／session_entities／session_ownership／session_building_upgrades。Win32 Release 产品编译通过；BootyBay 定向检查新旧单位倍率、生命比例和易主通过，未加载 Game.dll；日志 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/result.log。

集中验证菜单／脚本倍率、极值／精度／取整、英雄生命／力量／装备／研究、建造升级／变形／幻象／易主／复活／跨关恢复、原版数值和事件顺序。完整对战与旧 MEngine 队列按阶段验证。

## 地形雾与计时窗口阶段待验证

路径：world／session_world／terrain_fog_render／session_dialogs／game_timer_dialog／game_view。Win32 Release 产品编译通过；会话定向检查雾设置／重置、计时倍率／覆盖清除及原 TimerDialog.fdf 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/terrain-handicap-timer-probe/result.log 与 timer-dialog-probe/。未覆盖实际 GameView。

集中验证 W3I／地图覆盖／Reset、线性／指数雾／范围／颜色、硬件能力／深度／透明模型／天空／水和玩家视野遮罩；计时器启动／暂停／重置／销毁／周期、实时覆盖／速度／颜色／多个窗口与计分板并存、字号／布局和原版准确性。完整战役、三图、性能及旧 MEngine 队列保持阶段待验证。

## 腐蚀喷吐持续伤害阶段待验证

路径：entities／spells／session_weapon_effects／session_spell_effects。Win32 Release 产品增量编译、差异检查通过，未运行玩法测试。

集中验证 Recb 前置、建筑命中与持续伤害、刷新／多来源叠加、非整秒时限、暂停／死亡／易主／来源移除、免疫和护甲、事件顺序及原版画面；法球缺省飞行速度仍待实现。

## 人口维护费阶段待验证

路径：session／session_food／session_callbacks／game_view。Win32 Release 产品增量编译、差异检查通过，未执行玩法测试。

集中验证 ROC／TFT 阈值边界、地图配置覆盖与短列表、脚本修改维护率、人口预留／取消／易主及状态事件重入、金币／木材入账与取整、原版顶栏文字与布局。跨玩家资源转移及其交易税已接入并另列阶段待测；三图、完整对局与性能按阶段验证。

## 盟友资源转移阶段待验证

路径：session／session_match／game_state／game_view／game_alliance_dialog。Win32 Release 产品编译通过；BootyBay 会话最小检查转账余额、余额不足原子拒绝及税率边界通过；原版 FDF 隐藏窗口构造及绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/、alliance-probe/。

集中验证真实窗口输入／金额多玩家转移、资源不足／取消／关闭、联盟变化与离场、余额上限、转账中的脚本状态事件及重入、金币／木材税率方向／取整、统计和原版行为；联盟关系设置、共享控制及局域网同步仍待实现。

## 联盟与共享视野设置阶段待验证

路径：game_alliance_dialog／game_view／session_match。Win32 Release 产品编译通过；BootyBay 最小会话验证联盟五个状态、共享视野及地图锁标志通过，未加载 Game.dll。

集中验证面板接受／取消与脚本重入、玩家离开、联盟变化事件和共享视野生效、原版强制联盟／地图锁／隐藏规则及视觉一致性；共享单位控制基础消费已接入并另列阶段待测；共同胜利及局域网同步尚待实现。

## 共享单位控制阶段待验证

路径：session_match／session_ability_commands／session_commerce／game_view／game_commands／game_spells／game_transport／game_alliance_dialog。Win32 Release 编译通过；BootyBay 会话最小检查权限方向、撤销、高级控制和按单位拥有者检查建造资金通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实面板勾选／取消、框选／多单位下令、施法／建造／生产／研究／修理／货舱、授权撤销时目标和队列、原版普通／高级共享对英雄／物品／商店的权限和费用，及多客户端同步。
