# 独立客户端测试队列

### 视野科技与月之祝福（待阶段验证）

路径：`src/commerce.h`、`src/session_research.cpp`、`src/session_fog.cpp`、`tests/dota_heroes_tests.cpp`；说明见 [科技研究](research.md)。`rsig` 按科技等级累加到单位视野，变更时刷新迷雾；原图月之女祭司的学习事件设置 `R00I`。Win32 Release 客户端与 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 编译通过，隔离检查 3 通过、0 失败；月之女祭司覆盖学习后夜间视野扩大及所有权转移后的失效／恢复。阶段核对多级／负值／多个科技和装备组合、昼夜与夜视、科技转移／撤销、原版视野上限、迷雾边界、多人同步及实际窗口。

### DotA 莉娜与狙击手技能（待阶段验证）

路径：`tests/dota_heroes_tests.cpp`、`CMakeLists.txt`。原图隔离会话通过酒馆购买莉娜和狙击手，验证三个一级主动技能的目标伤害、炽魂三层攻速与移速增益及消退、四级瞄准射程和一级暗杀伤害。Win32 Release 定向程序 `war3_dota_heroes_tests <data-root> <DotA_v6.83d.w3x>` 2 通过、0 失败；测试设定等级、位置和魔法，暂停其他单位，并为连续施法重置冷却。阶段验证自然升级与对战、目标类型、反魔法及伤害类型、技能中断、真实移动／攻击、视觉音频和原版时序；该检查不代表完整 DotA 对局。

### 库存失效句柄（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/undead_finale_tests.cpp`、`docs/campaign-undead08-inventory.md`。库存查询和 `UnitRemoveItem` 对空、已移除与不兼容句柄按接口返回默认值或跳过；有效物品继续执行掉落。Win32 Release 客户端与 `war3_undead_finale_tests <data-root> <Undead08.w3m> <new-absolute-user-dir>` 编译并执行，1 通过、0 失败；覆盖失效句柄、有效查询与掉落，并以缩短计时器推进原图胜利。阶段核对物品转移／移除回调、单位死亡／变形、库存能力变化、联机和原版事件时序。

### 状态提示框高度（待阶段验证）

路径：`src/game_buff_panel.cpp`、`docs/buff-panel.md`。标题和说明按实际换行计算高度，说明上限 30 行；Win32 Release 客户端编译通过。本次启动未能创建 Direct3D 9 设备，日志 `tmp/docs-artifacts/war3/buff-tooltip-auto-current.log`，没有实际画面。阶段通过游戏内 Agent 检查短／多行／超长描述、空标题、不同分辨率及四族与地图覆盖，对照原版布局和裁剪；超过行数上限的滚动尚未实现。

### 存档目录重命名（待阶段验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`RenameSaveDirectoryBJ` 操作独立用户目录中的真实目录，拒绝已有目标、无效源、目录移入自身和越界路径；Win32 Release 客户端与 `war3_save_exists_tests <data-root> <OrcX01.w3x> <scratch-root>` 编译并执行，1 通过、0 失败，符号链接创建失败而跳过对应场景。阶段核对接合点／符号链接、占用与跨进程竞争、失败后的空父目录、原版目标覆盖及名称规则，并在完整世界保存恢复实现后验证实际存档。

### 亡灵最终章物品槽与计时胜利（待阶段验证）

路径：`src/session_inventory.cpp`、`tests/undead_finale_tests.cpp`、`CMakeLists.txt`；说明见 [战役物品槽](campaign-undead08-inventory.md)。Win32 Release 客户端和 `war3_undead_finale_tests <data-root> <Undead08.w3m> <new-absolute-user-dir>` 编译并执行，1 通过、0 失败；使用新用户目录，检查空／失效单位、有效／空／越界槽，并将原图召唤计时器缩短至五秒验证胜利事件。阶段核对前关缓存及六格物品转移、物品掉落事件与回调重入、30 分钟防守、实际窗口和原版行为。

### 兽族第八章灵魂宝石（待阶段验证）

路径：`src/entities.h`、`src/session_soul.cpp`、`src/session_entities.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`、`src/session_inventory.cpp`、`src/session_network_identity.cpp`、`tests/control_tests.cpp`、`tests/orc_soul_campaign_tests.cpp`、`CMakeLists.txt`；说明见 [灵魂宝石](soul-gem.md)。Win32 Release 客户端与两个定向目标编译通过；`war3_control_tests <data-root> <fixture> item-soul` 及 `war3_orc_soul_campaign_tests <data-root> <Orc08.w3m> <new-absolute-user-dir>` 各 1 通过、0 失败。原图检查调整单位与位置并暂停其他单位；阶段检查实际交战、自然目标选择、死亡／复活、事件重入、无脚本地图、联机和原版视觉及能力语义。

### 兽族战役第六至第八章跨关（定向检查通过）

路径：`tests/orc_campaign_chain_tests.cpp`、`CMakeLists.txt`、`docs/campaign-flow.md`。执行 `war3_orc_campaign_chain_tests.exe <data-root> <Orc06.w3m> <Orc07.w3m> <Orc08.w3m> <new-absolute-user-dir>`：直接完成第六章目标，第七章执行揭示剧情、交还地图宝石并进入先知区域，检查两个胜利跳转和两个英雄的等级及自定义数据在第七、八章恢复。Win32 Release 1 通过、0 失败，无 Game.dll；实际移动、战斗、完整剧情／窗口、跨进程启动及原版缓存互通待阶段验证。隔离用户目录位于 `tmp/docs-artifacts/war3/orc-campaign-chain-current/`。

### 兽族第五章矩形移动（待阶段验证）

路径：`src/session_world.cpp`、`tests/spatial_handle_tests.cpp`、`CMakeLists.txt`、`docs/campaign-rect-movement.md`。`MoveRectToLoc` 忽略无效矩形或地点；Win32 Release 构建通过，`war3_spatial_handle_tests.exe <data-root> <Orc05.w3m>` 1 通过、0 失败，原图静音 `--main-check --simulate-ms 400000` 推进至 400 秒。阶段核对有效／无效及跨类型句柄、战役目标组清空与重新建造、真实窗口和原版行为；本次未验证完整关卡。证据位于 `tmp/docs-artifacts/war3/orc05-runtime-400*.log`。

### 影魔灵魂与魂之挽歌连续流程（定向检查通过）

路径：`CMakeLists.txt`、`tests/dota_soul_tests.cpp`。使用用户提供的 DotA_v6.83d 原图，通过酒馆购买影魔并学习支配死灵与魂之挽歌；测试调整等级、魔法、位置和目标并暂停其他单位。五次实际攻击击杀后，灵魂等级由 1 增至 6、攻击加成由 0 增至 10；按自身积累的灵魂施法后，目标生命由 5000 降至 4920。通过伤害 native 令英雄死亡后灵魂等级变为 4，死亡释放使目标生命由 4920 降至 4840；调用 ReviveHero 后等级为 4、攻击加成为 6。`war3_dota_soul_tests.exe <data-root> <dota-map>` 实际 1/1 通过，未加载 Game.dll。检查使用会话命令及 native，未覆盖实际窗口、自然等级成长、不同灵魂数量、目标密集情况、事件重入与完整对局；这些继续留待阶段验证。

### 单位范围治疗与魂之挽歌（待阶段验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`tests/spell_tests.cpp`、`docs/area-spells.md`。单位可按源 AIha 的订单、治疗量、范围和施法时间使用范围治疗；治疗量为零时仍触发实际施法事件。Win32 Release 客户端及专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> unit-area-heal` 1/1 通过，检查 AIha 对自身和友军治疗、敌军不受益，以及治疗卷轴仍可正常使用。DotA_v6.83d 原图隔离会话从酒馆购买影魔、学习 A29J；探针设置十个灵魂、等级、魔法、位置和敌方目标，暂停其他单位。技能按钮可用，施法半秒内无伤害，之后地图脚本使目标生命由 5000 降至 4920 并进入冷却。会话未加载 Game.dll；证据位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-sf-requiem-effect.*`。固定版 Game.dll 摘要 e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a：REA 记录 `ev_f274fa477ad92e558babd7ac6af14557d9f3b70a93a3c46e3153fc79feed84da` 中能力方法表将 AIha 原型与返回 852273 的方法关联；完整按钮和下单路径仍待原版对照。阶段核对治疗目标／范围／满血、施法中断及重入、技能等级、魂数与死亡释放、网络、实际窗口和完整对局。

### 零召唤末日与英雄目标（待阶段验证）

路径：`src/session_neutral_spells.cpp`、`src/session_spells.cpp`、`docs/neutral-heroes.md`。零召唤末日保留状态、事件和配置的正持续时间，不创建召唤物或消耗尸体；其他末日保留原有持续与召唤流程。目标类别由技能标记决定，原版 nonhero 仍排除英雄。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买末日使者并学习 A0MU，调整英雄等级、魔法、位置及目标，暂停其他单位；对敌方英雄施法后五秒生命由 5000 降至 4920，状态存在，到期后状态移除且额外三秒不再受到地图脚本伤害。隔离地图中原版 ANdo 拒绝英雄并使普通敌人死亡后生成一个 120 秒召唤物；探针将召唤数改为零后确认普通敌人死亡不新增召唤物、不消费尸体。未加载 Game.dll；探针与日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-doom-duration.*`、`source-doom-zero-summon.*`。零召唤正时长的原版语义、等级、魔免／驱散、状态重入、召唤生命周期、实际窗口及对局待阶段对照。

### 无图标睡眠与地图连环霜冻（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_spell_effects.cpp`、`docs/control-spells.md`。睡眠技能没有配置 Buff 时，使用无图标的内部睡眠状态承载持续时间、保护与清理，保留施法事件；已配置 Buff 的睡眠继续要求保护 Buff。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买巫妖、学习 A05T，调整等级、魔法、位置及目标并暂停其他单位后，地图脚本使两个目标生命从 10000 分别降至 8320 和 8600；目标未暂停，短暂睡眠正常结束。隔离地图定向检查原版 AUsl 的 Buff 睡眠及移除，随后将技能配置调整为无 Buff、0.5 秒睡眠，确认状态生效并到期清理；会话未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-lich-chain-frost-effect.*` 和 `source-sleep-unmarked.*`。原版无 Buff 状态语义、0.01 秒与固定步进、弹射次数与伤害、友军／魔免、实际窗口和对局待阶段对照。

### 焚灰死亡爆炸半径与腐尸毒（待阶段验证）

路径：`src/session_firelord.cpp`、`docs/firelord.md`。焚灰允许全伤和半伤半径分别配置，死亡爆炸按两者的最大半径查找目标并保留全伤／半伤判断；敌友筛选识别 enemy/enemies 和 friend/allies。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买尸王，生成五个学习按钮并学习 A0FA；调整等级、位置、生命和目标并暂停其他单位后，攻击击杀敌人触发死亡爆炸，使附近中立敌人生命从 5000 降至 4910，范围外敌人与友军保持 5000。隔离地图探针调整技能的两个半径与伤害数值，分别验证全伤半径 400／半伤半径 0 与全伤半径 100／半伤半径 400 时近处敌人受到 90 和 45 点伤害，远处敌人和友军无伤。未加载 Game.dll；探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-undying-incinerate-effect.*` 与 `incinerate-radius-boundary.*`。阶段核对原版半径边缘、类别和免疫、技能叠层与尸体处理、不同等级、事件重入、实际窗口及对局。

### 地图脚本创建的群蛇守卫（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`docs/area-spells.md`。蛇棒技能允许原生数量为零，保留施法与脚本事件，且零原生召唤不要求找到召唤落点。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话从酒馆购买暗影萨满，显示五个技能学习按钮，设置等级、魔法和施法位置后，地图 A00H 脚本创建十个 osp4 蛇棒并赋予定时生命；探针暂停了其他单位。隔离地图原版 AOsw 经过实际施法流程，生成一个具有 40 秒定时生命的 osp1。会话未加载 Game.dll；探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-shadow-shaman-wards.*`、`dota-shadow-shaman-wards-after.log` 和 `source-serpent-ward.*`。阶段核对不同技能等级、原版零数量语义、蛇棒攻击与死亡、技能事件时序、地图地形、实际窗口及完整对局。

### 隐藏单位的脚本无目标施法（待阶段验证）

路径：`src/session.h`、`src/session_entities.cpp`、`src/session_orders.cpp`、`src/session_spells.cpp`、`tests/spell_tests.cpp`。脚本的字符串与整数无目标订单将脚本状态传入技能施法，显式隐藏的施法者可执行原版战争践踏；战争践踏的玩家订单及运输状态下的脚本订单仍受限制。Win32 Release 客户端和专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> hidden-immediate` 1/1 通过，确认两种脚本订单均造成伤害与眩晕，玩家订单及运输状态被拒绝，未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/hidden-immediate-stomp*`。其他无目标能力、自动施法与特殊订单、隐藏变化、事件重入、实际地图和原版行为待阶段验证。

### 隐藏单位的脚本点目标引导（待阶段验证）

路径：`src/session.h`、`src/session_orders.cpp`、`src/session_spells.cpp`、`src/session_channels.cpp`、`docs/area-spells.md`。脚本点目标订单在下单和持续波次中保留显式隐藏单位的施法资格；运输等内部隐藏状态及玩家对隐藏单位的订单仍受限制。只配置 organic 且未指定空地的技能按有机目标筛选。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话中从酒馆购买深渊领主、学习 A01I，设置位置、等级、魔法和目标并暂停其他单位后，火焰风暴令目标生命从 5000 降至 4900。隔离地图验证 IssuePointOrder 和 IssuePointOrderByIdLoc 驱动隐藏施法者产生持续伤害，玩家命令及运输状态被拒绝，友军和设为机械类别的敌人未受伤；探针修改了目标标记用于边界检查。上述会话未加载 Game.dll，证据位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-underlord-firestorm-fixed.log` 和 `hidden-rainfire-boundary.*`。原版空地／有机组合、不同隐藏状态、所有持续施法类型、事件时序、完整波次、画面及实际对局待阶段验证。

### 零效果火焰范围变体（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_neutral_spells.cpp`、`src/session_area_spells.cpp`、`docs/area-spells.md`。无伤害和地面效果的零时长烈焰风暴保留施法事件；零波次火焰雨允许零间隔并正常结束施法，有波次时仍校验间隔。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买深渊领主，生成五个技能学习按钮；设置位置、等级、魔法和目标后，A0RA 由地图脚本使敌人生命从 5000 降至 4900。隔离地图原版 AHfs 和 ANrf 分别使目标生命从 5000 降至 4880 和 4900；均未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-underlord-pit-target.*`、`source-fire-spells.cpp`、`source-flamestrike.log` 和 `source-rainfire.log`。其他零值组合、事件时序、原版视觉及实际窗口待阶段验证。


### 零闪电时长的叉状闪电变体（待阶段验证）

路径：`src/session_neutral_spells.cpp`、`docs/spells.md`。叉状闪电无原生伤害和闪电效果时允许零时长，保留目标施法及地图脚本事件；零伤害不产生原生伤害事件，有伤害或闪电效果仍要求正时长。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买复仇之魂、生成五个技能学习按钮，升至 10 级学习 A0IN；对英雄施法后原图脚本将双方位置从 `(0,0)` 和 `(200,0)` 交换，技能进入冷却。隔离地图原版 ANfl 对敌人造成 85 点伤害；均未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-vengeful-swap.cpp`、`dota-vengeful-swap-after.log`、`source-forked-lightning.cpp` 和 `source-forked-lightning.log`。英雄等级、位置、生命、魔法和目标由探针设置，其他单位被暂停；原版零伤害事件、视觉、自定义数据、魔免、实际窗口及联机待阶段对照。


### 零效果残废与灵魂隔断（待阶段验证）

路径：`src/session_unit_casters.cpp`、`docs/unit-casters.md`。没有原生移动、攻击和伤害减幅的残废变体允许缺少 Buff，保留施法、目标、费用、冷却及地图事件；有原生减幅时仍要求 Buff。Win32 Release 客户端编译通过。DotA_v6.83d 原图隔离会话从酒馆购买灵魂守卫，生成五个技能学习按钮，升至 10 级学习 A07Q 并对英雄施法；设置双方生命和暂停其他单位后，原图脚本令施法者生命由 250 变为约 810、目标由 800 变为约 257，技能进入冷却。隔离地图中原版 Acri 在满足 Rune 二级前置后仍对敌人施加 Bcri；均未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-terrorblade-sunder-isolated.*`、`source-cripple-buff.*`。英雄等级、位置、生命、魔法和目标由探针调整；真实对战、生命百分比精度、免疫、事件重入、视觉与窗口待阶段对照。


### 零距离脚本波形技能（待阶段验证）

路径：`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`docs/area-spells.md`。冲击波／腐臭蜂群原型的距离为零时，仅在伤害为零且没有原生弹道时允许施法，正常触发技能事件且不创建需要距离计算的波形。Win32 Release 客户端编译通过；DotA_v6.83d 原图酒馆购买虚空假面后可生成五个学习按钮，升至 10 级学习 A0LK，发出点目标命令后由地图脚本移动约 566 距离并进入冷却。隔离地图中原版 AOsh 对目标造成 75 点伤害；上述会话未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-void-timewalk.cpp`、`dota-void-timewalk-after.log`、`source-wave-damage.cpp` 和 `source-wave-damage.log`。DotA 野性之斧 A0O1 在调整位置并暂停其他单位的隔离会话中使敌人生命由 5000 降至 4875，完整伤害和视觉尚未确认；英雄等级、魔法与施法目标由探针设置。阶段核对其他零值组合、伤害与弹道边界、回调时序、实际窗口及原版行为。


### 幻象复制与魔法免疫目标（待阶段验证）

路径：`src/session_spells.cpp`、`docs/illusions-items.md`。幻象复制类型允许选择魔法免疫单位，仍执行英雄类别、敌友、自身及其他目标规则；其他魔法技能保留免疫检查。DotA_v6.83d 原图 A0G8 的技能说明注明无视魔法免疫。Win32 Release 客户端编译通过；原图隔离会话从酒馆购买变体精灵并学习 A0G8，分别对设置为敌方和友方的魔免英雄生成幻象，回归后英雄到达幻象位置、回归能力移除且复制能力恢复；同一会话中非英雄、自身和普通风暴之锤对魔免目标均被拒绝。未加载 Game.dll，探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-magic-immunity.cpp`、`dota-morphling-magic-immunity-*.log`。英雄等级、魔法、目标、免疫和友方关系由探针设置；原版幻象魔棒的免疫规则、其他免疫类型、技能事件、伤害倍率与实际窗口待阶段对照。


### 英雄类别目标与变体精灵复制（待阶段验证）

路径：`src/session_spells.cpp`、`docs/spells.md`。技能目标指定英雄／非英雄类别而未指定空中或地面时，不再强加空地限制，仍执行类别、敌友、自身等筛选。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话通过酒馆购买变体精灵，学习 A0G8 后分别对敌方和设置为友方的英雄施法，均创建一个幻象并由地图脚本提供回归技能；施放回归后英雄到达幻象位置，非英雄与自身目标被拒绝。两项检查均未加载 Game.dll，探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-replicate.cpp` 和 `dota-morphling-replicate-return*.log`。英雄等级、魔法、目标和友方关系由探针调整；阶段核对空中／地面显式限制、其他目标掩码、魔免、幻象数值／持续、事件时序、实际窗口和原版行为。


### 地图脚本使用的零恢复能力（待阶段验证）

路径：`src/session_restoration.cpp`、`docs/restoration.md`。恢复量均为零的恢复能力允许不配置 Buff，沿用实际手动施法、自动施法开关和订单事件；有恢复量时仍要求有效 Buff。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话使用 `-ap` 和酒馆购买变体精灵，取得五个技能学习按钮；升至 10 级学习 A0KX 后，自动转换令力量／敏捷由 40／54 变为 34／60，反向转换恢复为 40／54，两次关闭后数值保持，手动转换后变为 38／56。相同会话以原版 Arpl 恢复友军生命 100 至 110；记录见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-restoration.cpp` 和 `dota-morphling-restoration.log`，未加载 Game.dll。测试调整英雄等级与魔法，调用会话命令而非实际鼠标；阶段核对原版零值语义、低魔法／属性边界、技能等级、事件重入、双开关、实际窗口和联机。


### 永久生命上限物品的负值（待阶段验证）

路径：`src/session_item_use.cpp`、`src/session_equipment.cpp`、`docs/equipment.md`。永久生命上限能力接受有界负值，并将同一增量应用于最大生命和当前生命；最大生命下限为 1，当前生命沿用既有死亡和事件流程。Win32 Release 客户端编译通过；DotA_v6.83d 原图输入 `-ap` 并通过实际酒馆购买变体精灵 O00P，地图一次性物品 I00E 生效后英雄生命与上限均为 511；隔离会话将英雄升至 10 级、学习 A0G6，对脚本创建的敌人施法，目标位移约 145、技能进入冷却，未加载 Game.dll。探针与日志见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-morphling-purchase.cpp`、`dota-morphling-purchase.log`。英雄升级、魔法和目标由探针设置；真实窗口、伤害归因、低生命／上限边界、复活、事件顺序及原版数值仍待阶段对照。


### 无状态的酸性炸弹地图变体（待阶段验证）

路径：`src/session_alchemist.cpp`、`docs/alchemist.md`。当移动、攻击、护甲和周期伤害均为零时，允许酸性炸弹没有 Buff；命中不产生原生状态，费用、冷却、事件和地图脚本仍沿用施法链路。Win32 Release 客户端编译通过；DotA_v6.83d 原图会话中将 A0G6 授予圣骑士，对敌方单位发出目标施法并进入冷却，未加载 Game.dll；探针及日志见 `tmp/docs-artifacts/war3/hero-ability-probe/dota-acid-script.cpp`、`dota-acid-script.log`。该检查未证明地图脚本的完整伤害及位移。原英雄 O00P 的一次性生命上限物品已接入，原图酒馆购买与技能施放已在隔离会话检查；负值边界和原版行为仍待核对。阶段验证原版酸性炸弹、非零效果缺失 Buff 的拒绝、命中事件、零伤害／短时长及窗口、联机和原版行为。


### 地图技能的原型命令（待阶段验证）

路径：`src/session_spell_info.cpp`、`docs/spells.md`。非 Channel 技能的命令字段为空时从源能力原型读取命令；非空地图命令继续按原值解析，Channel 使用自身数据字段。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话分别创建英雄并学习 A1SW、A06V、A0G2、A01F、A02A，对合法单位或地点施法，五项均进入冷却，未加载 Game.dll。探针和日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/dota-inherited-orders.cpp`、`dota-inherited-orders.log`；探针直接创建单位并调整等级／魔法，不证明完整技能脚本效果。A0G6 的无状态变体及原英雄初始化已进入实际施法流程；原版精度待核对。阶段核对源表缺值、显式命令覆盖、自定义原型、伤害／事件、实际窗口、联机及原版行为。


### 地图 Channel 技能的基础命令读取（待阶段验证）

路径：`src/session_spell_info.cpp`、`docs/channels.md`。Channel 能力先读取当前等级的源 `DataF` 命令，再校验和构建技能；未知命令仍明确报错。Win32 Release 客户端编译通过；DotA_v6.83d 原图隔离会话分别创建英雄 E002、H00V、O015、U00K，学习 A1AO、A1AT、A1AA、A06R 并发起无目标施法，四项均进入冷却，未加载 Game.dll。探针及日志位于 `tmp/docs-artifacts/war3/hero-ability-probe/`；它直接创建英雄并调整等级／魔法，不证明完整技能效果。阶段核对地图脚本的持续效果、不同目标类型、事件／中断、等级覆盖、界面与联机，并与原版对照。


### 修补匠的电脑战斗施法（待阶段验证）

路径：`src/session_ai_armies.cpp`、`docs/tinker.md`、`docs/ai.md`。电脑战斗决策在有可见敌人时可施放口袋工厂和进入机器人形态，复用真实技能、目标、资源及冷却流程；已有工厂时不重复召唤，机器人形态不自动反向切换。Win32 Release 客户端编译通过；隔离会话分别检查基础技能和一级工程升级后的技能变体，实际产生工厂并保持机器人形态，各 2 通过、0 失败，未加载 Game.dll。临时探针与夹具位于 `tmp/docs-artifacts/war3/hero-ability-probe/`、`tmp/docs-artifacts/war3/auras-passives/fixture.w3m`。阶段核对真实电脑对局、原版决策和目标选择、工厂失效／技能升级、资源与冷却、不同地图及联机。


### 夺旗附件与死亡掉落（待验证）

路径：`src/session_entities.cpp`、`src/passives.h`、`src/session_passive_info.cpp`、`src/session_weapon_effects.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`；来源和行为见[旗帜物品](flag-items.md)。Win32 Release 产品和 passive 测试目标编译通过；`flag-item` 与受影响的 `orb-purge` 各 1 通过、0 失败，未加载 Game.dll。夹具生成命令为 `python tests/generate-passive-fixture.py --data-root <data-root> --output <tmp-fixture>`；阶段核对真实夺旗地图、死亡／复活／移除／转移及事件重入、禁用与幻象、模型附件、GPU、地图覆盖和联机。

### 旧版闪电之球净化（待验证）

路径：`src/passives.h`、`src/combat.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_spell_info.cpp`、`src/session_weapon_effects.cpp`、`tests/passive_tests.cpp`；来源和行为见[毒素攻击与物品法球](weapon-effects.md)。Win32 Release 客户端及 passive 测试程序编译通过；`orb-purge` 定向检查 1 通过、0 失败，无 Game.dll。阶段核对原版触发概率、召唤物伤害、能力独立来源和禁用、发射后丢弃／易主、多个法球／攻击技能、魔免／护盾／事件时序、自定义等级和实际窗口／联机。

### 召唤钻石与黑暗召唤（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_teleport.cpp`、`tests/control_tests.cpp`；源字段和行为见[群体传送](teleport.md)。Win32 Release 客户端及控制测试目标编译通过；`dark-summoning` 定向检查 1 通过、0 失败，无 Game.dll，覆盖原物品的地点、延迟、人数上限、阵营／距离、冷却及召回护符。阶段核对目标及落点顺序、DataC／自定义覆盖、单位类别、支付／打断／事件、实际窗口、小地图、源视觉与音效及联机同步。

### 影子权杖与目标视野（待验证）

路径：`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_unit_casters.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`、`src/session.h`、`src/spells.h`、`tests/control_tests.cpp`；行为及源字段见[影子权杖](shadow-sight.md)。Win32 Release 产品和控制测试程序编译通过；`shadow-sight` 定向检查 1 通过、0 失败，无 Game.dll。阶段对照真实目标、隐身／魔免／无敌、目标及施法者归属变化、多玩家重复施法、时长覆盖、驱散／事件次序、窗口、声音和联机。

### 路径平滑复用通行缓存（待验证）

路径：`src/world_path.cpp`、`docs/water-pathing.md`。路径平滑和普通直线检查共用同一网格穿越与对角规则，平滑阶段复用本次搜索的通行缓存。Win32 Release 客户端及 world 测试目标编译通过；区域／部分路径、动态障碍、目标缓存和阻挡目标相关检查共 8 通过、0 失败。512×512 隔墙绕路夹具按碰撞半径 0／32／64 各执行 40 条不同路径，路径点数量和摘要一致，单次耗时由 637／695／769 毫秒变为 604／605／617 毫秒；探针位于 `tmp/docs-artifacts/war3/path-smoothing-1031/`。阶段核对多地图及移动类型、动态阻挡、路径端点与原版语义、完整战役 CPU 和实际帧时间。

### 黑暗转换最小会话检查（待阶段验证）

路径：`src/session_control_spells.cpp`、`src/session_spell_effects.cpp`、`tests/control_tests.cpp`。生成原地形夹具并编译 Win32 Release 的 `war3_control_tests` 后，执行 `war3_control_tests.exe <data-root> <fixture> conversion`，1 通过、0 失败，未加载 Game.dll；覆盖非村民拒绝、村民进入睡眠／禁令状态及到期后创建施法方僵尸。原版状态结束时序、死亡事件与尸体、驱散／伤害／重入和真实战役仍待阶段对照。

### 英雄经验条纹理裁剪（待验证）

路径：`src/game_commands.cpp`。经验填充按进度裁剪源纹理，零进度不提交填充矩形；保留经验条边框和文字。阶段使用游戏内 Agent 核对零、部分与满经验、不同窗口比例和各族皮肤，并与原版画面对照；本次环境的 D3D9 设备不可用，画面尚未验证。

### 战斗伤害表及地图常量缓存（待验证）

路径：`src/session.h`、`src/session_damage.cpp`、`src/session_hero.cpp`、`docs/combat.md`。攻击／防御、虚无伤害表和非空数字常量按地图会话惰性缓存，空字段继续使用调用方回退值。Win32 Release 客户端编译通过；`war3_fortified_tests` 原版模式 2 通过、重新生成夹具的自定义模式 2 通过，带 `war3mapMisc.txt` 伤害倍率覆盖的夹具自定义模式 2 通过；`war3_passive_tests <data-root> <fixture> ethereal-ability` 1 通过、0 失败。3 万次伤害调用单次隔离采样由 93 ms 降至 45 ms、最终生命一致，记录在 `tmp/docs-artifacts/war3/damage-factor-cache/`。阶段核对错误／空表、不同地图切换与回退值、完整伤害组合、真实对局性能及联机。

### 无过滤器的单位编组枚举（待验证）

路径：`src/session_collections.cpp`、`tests/game_flow_tests.cpp`、`docs/jass.md`。空过滤器直接遍历单位，非空过滤器保留快照与回调语义；Win32 Release 客户端和游戏流程测试通过，检查类型／玩家／范围、零与一数量限制、编组替换和单位创建／移除。2,001 单位、2,000 次范围枚举的单次隔离采样由 219 ms 降至 30 ms，结果数量与首句柄一致，见 `tmp/docs-artifacts/war3/group-enum-fast/`。阶段核对所有编组入口、过滤器嵌套与修改、原版排序、真实地图帧耗时和联网同步。

### 武器研究的被动说明（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_ability_commands.cpp`、`tests/research_tests.cpp`、`docs/research.md`。飞行机器炸弹、穿刺剑刃、月刃和风暴战锤按对应科技前置显示源被动图标；实际武器状态继续由科技生效。Win32 Release 产品及研究测试通过，四种单位的研究前后图标和武器状态均已检查；游戏内 Agent 的飞行机器画面在 `tmp/docs-artifacts/war3/unit-ability-inventory/agent/`。执行 `python tests/generate-research-fixture.py --data-root <data-root> --output <tmp-fixture>` 和 `war3_research_tests.exe <data-root> <tmp-fixture>`。阶段核对原版显示时序、实际攻击、其余图标、自定义前置／禁用与不同窗口布局。

### 影之灵龛自然充能检查（待验证）

路径：`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。DotA 原图 `urn-charge` 检查附近敌方英雄死亡的首次与后续充能、远处敌方及友军排除，以及自然充能后的使用；Win32 Release 1 通过、0 失败。执行 `war3_dota_rune_tests.exe <data-root> <DotA_v6.83d.w3x> urn-charge`。阶段核对多名携带者、英雄幻象、死亡与归属边界、原版及实际对局。

### 动态计数物品的技能事件与扣减（待验证）

路径：`src/session_spells.cpp`、`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。无源使用次数且不可消耗的技能物品，先发布技能生效事件，再扣减使用前已有的正次数；已清零或移除的物品不重复扣减。Win32 Release 产品和测试目标编译通过；DotA 原图 `urn`、`wand`、`wand-charge`、`regen` 各 1 通过、0 失败。执行 `war3_dota_rune_tests.exe <data-root> <DotA_v6.83d.w3x> <模式>`。阶段核对脚本重设正次数、移除／转移及物品事件次序、普通有次数物品、原版动态次数、实际窗口和联机。

### 目标控制类物品与控制技能目标标记（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_control_spells.cpp`、`docs/dota-control-items.md`。物品的风暴之锤、妖术和变形能力进入单位目标施法；控制技能识别 `enemies`／`allies` 目标标记。Win32 Release 客户端编译通过；DotA 原图隔离会话中深渊之刃眩晕目标、邪恶镰刀变形目标，效果结束后恢复；两件物品均拒绝友军目标。记录位于 `tmp/docs-artifacts/war3/dota-i0gj/hex-stun-final.log`。阶段核对真实窗口输入、英雄与中立单位、不同目标标记、魔免／法术抵挡、消耗／冷却／施法打断、地图覆盖和原版时序。

### 暴风雪类点目标物品与纷争面纱（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`docs/dota-veil.md`。地图物品的暴风雪能力通过点目标施法流程触发原脚本，保留法力、冷却与引导过程。Win32 Release 产品编译通过；DotA 原图隔离会话中纷争面纱使目标魔法伤害由 100 提升至 125，到期后恢复为 100，证据位于 `tmp/docs-artifacts/war3/dota-i0gj/veil-runtime.log`。阶段检查点目标操作、不同目标及范围、可中断的引导、物品次数／冷却、效果叠加与驱散、原版对照及实际窗口。

### 物品栏标题与单次物品计数（待验证）

路径：`src/game_loading.*`、`src/game_view.cpp`、`docs/unit-combat-panel.md`。选中具有物品栏的单位时显示源 `INVENTORY` 标题，正次数物品显示数字并限制在格内。Win32 Release 客户端编译通过；游戏内 Agent 选择携带 1 次药水和 4 次权杖的圣骑士，1264×921 画面可见标题及计数，证据位于 `tmp/docs-artifacts/war3/agent-info/layout-inventory-title/`。阶段核对无物品栏／多个选中单位、商店买家、四族皮肤、地图覆盖、长数字、不同窗口比例及原版画面。

### 脚本计数物品与 DotA 魔杖（待验证）

路径：`src/session_teleport.cpp`、`tests/dota_rune_tests.cpp`、`docs/dota-bottle.md`。技能物品的源使用次数为零且不可消耗时，脚本计数不再在技能生效事件前扣减；源定义有限次数或可消耗物品继续扣减。Win32 Release 客户端及测试目标编译通过；`war3_dota_rune_tests <data-root> <DotA_v6.83d.w3x> wand` 1 通过、0 失败，以原图验证 5 点和 1 点能量恢复、清零与冷却；`wand-charge` 1 通过、0 失败，以原图检查附近敌方施法充能、远处敌方和友方施法不充能及随后使用；`regen` 和 `war3_spell_tests <data-root> <fixture> chain-dispel` 各 1 通过、0 失败，覆盖魔瓶回复符和有次数的中和权杖。阶段核对原版动态设置次数、消耗／非消耗物品与事件次序、战争迷雾／能量上限、完整购买及真实窗口、联机与重入。

### 战役区域存档目录清理（待验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`RemoveSaveDirectory` 在独立用户目录内检查目录树与重解析点、持有目录句柄并逐项清理，错误时返回失败，可能已清除部分内容。Win32 Release 客户端和测试目标编译通过；以原版 `OrcX01.w3x` 运行 `war3_save_exists_tests <data-root> <map> <scratch-root>`，1 通过、0 失败，检查 JASS 包装、嵌套目录、旁侧备份保留和越界拒绝。测试环境未能创建符号链接，链接拒绝分支跳过。阶段核对链接／接合点、并发修改、权限与中断、原版目录语义，以及真实保存加载事件和跨区恢复。

### 战役区域存档复制（待验证）

路径：`src/session_campaign.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`CopySaveGame` 在独立用户目录中复制实际文件，创建目标目录并通过临时文件覆盖发布；名称与重解析点检查共用于存档存在性查询。Win32 Release 客户端和测试目标编译通过；`war3_save_exists_tests <data-root> <map> <scratch-root>` 对生成夹具及原版 `OrcX01.w3x` 各 1 通过、0 失败，检查 JASS 包装的实际复制、覆盖、缺失源和越界路径。阶段核对原版扩展名／覆盖规则、重解析点、并发及失败恢复、保存事件与原版文件互通；`SaveGame`、`LoadGame`、目录重命名和跨区恢复仍未实现。

### JASS 存档存在性查询（待验证）

路径：`src/session_campaign.cpp`、`src/platform.cpp`、`tests/save_exists_tests.cpp`、`docs/save-runtime-foundation.md`。`SaveGameExists` 查询独立用户目录 `Saves` 下实际文件，限制路径且拒绝重解析点；不解析文件内容。Win32 Release 客户端和测试目标编译通过，`war3_save_exists_tests <data-root> <map> <scratch-root>` 1 通过、0 失败，检查实际文件、缺失文件、大小写和分隔符、目录及越界路径。阶段核对原版名称／扩展名规则、异常文件及重解析点、多人／不同用户目录和真实存档互通；保存、加载及兽族跨区尚未实现。

### 隐藏关结束与兽族区域切换（待验证）

路径：`docs/campaign-flow.md`、`docs/save-runtime-foundation.md`。人族隐藏关隔离会话直接降低传送门生命后，原触发器请求间章；兽族资料片第一章将雷克萨直接移至地精洞穴入口后，原触发器在未绑定的 `SaveGame` 处停止。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03secret-goal.log` 和 `orcx01-zone.log`。阶段核对自然防守与跨区操作、世界及脚本存档恢复、后续区域重访和实际窗口。

### 资料片人族第六章至终章交接（待验证）

路径：`docs/campaign-flow.md`。第六章隔离会话人工击杀玛瑟里顿后原脚本请求终章，手动启动终章后运行至返回；日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/humanx06-goal.log` 和 `humanx06-finale.log`。阶段核对自然战斗、英雄状态及物品继承、真实窗口自动切关、终章音画和原版缓存格式。

### 派生治疗波订单与资料片人族第五章（待验证）

路径：`src/session_spell_info.cpp`、`tests/spell_tests.cpp`、`docs/spells.md`、`docs/campaign-flow.md`。治疗波派生记录未填写源订单时使用 `healingwave`；有源订单时继续解析源内容。Win32 Release 客户端和测试目标编译通过；`war3_spell_tests <data-root> ../../tmp/docs-artifacts/war3/mind-rot/fixture.w3m healing-wave-alias` 1 通过、0 失败，实际目标命令治疗友军并消耗魔法。原版第五章隔离会话人工移动英雄并缩短四座传送门计时后，胜利对话请求第六章；第六章手动启动后约 120 秒恢复控制，运行至 400 秒。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/`。阶段核对地图显式订单覆盖、跳跃／治疗边界、原版时序、实际战斗、英雄继承、窗口自动切关和音画。

### AI 空自杀进攻请求的重复计算（待验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。没有新成员的自杀进攻请求不再重复处理已有队伍；定期 AI 更新仍负责目标失效和重试。Win32 Release 客户端及 CampaignAI 测试编译通过，`war3_campaign_ai_tests <data-root> <fixture> armies` 2 通过、0 失败。人族资料片第四章隔离 60 秒单次插桩采样中，304 次请求有 289 次为空，调用内处理累计墙钟时间由 19,880 ms 降至 639 ms；详情见 [AI 说明](ai.md)。阶段核对原版请求／重试时序、连续加入／空请求、停顿／目标失效／死亡／易主／回调重入、AI 暂停和多人同步，以及不同地图完整对局、实际帧耗时和内存；当前不代表原版一致性或完整性能验收。

### 资料片人族第三章至第四章交接（待验证）

路径：`docs/campaign-flow.md`。第三章隔离会话直接击杀狱卒守卫及死亡回调新增的守卫，胜利后经手动启动的间章请求第四章；第四章在独立缓存副本下恢复卡尔的等级和用户数据，瓦丝琪存在且玩家控制恢复。日志在 `tmp/docs-artifacts/war3/tft-ne4-next/`。阶段核对自然战斗与任务、瓦丝琪和库存继承、窗口自动切关、两英雄状态、音画以及第四章实际性能；160 秒空闲会话已人为结束，不作为完整对局或性能基准。

### 可行走楼梯占地方向与战役过场（待验证）

路径：`src/session_destructables.cpp`、`tests/map_tests.cpp`、`docs/cliff-level.md`、`docs/campaign-flow.md`。可行走对象的路径占地和悬崖覆盖与模型方向对齐。Win32 Release 客户端和地图测试目标编译通过；`war3_map_tests <data-root> <scratch> campaign_walkable_stairs` 1 通过、0 失败，使用人族资料片第三章原图检查楼梯区域、阻挡边界及无人工移动的原过场恢复控制。相同隔离用户缓存中的原图会话推进至 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03-walkable-fixed.log`。阶段对照原版桥／楼梯的旋转及行走规则，覆盖非零角度、碰撞半径、悬崖层与高度、创建／死亡／复活／移除、叠加、其他地图、窗口画面和性能。

### 缺失自定义单位基础与资料片跨关（待验证）

路径：`src/object_data.*`、`src/session_commerce.cpp`、`tests/map_tests.cpp`、`docs/campaign-flow.md`。缺失基础的自定义单位／物品记录保留 ID 诊断并延迟到读取或创建该对象时报错；其他对象继续加载，技能／科技／状态对象保留原有严格处理。`HumanX03.w3x` 的自定义单位 `n003` 引用源表中不存在的 `nbsh`，地图脚本和预放置单位未引用这两个 ID；Win32 Release 客户端及地图测试编译通过，`war3_map_tests <data-root> <scratch> object_missing_base_in_campaign` 1 通过、0 失败，核对有效对象与缺失对象读取诊断。资料片人族第一、二章隔离会话经人工完成目标后请求后续关卡，第三章恢复 5 级及用户数据；第三章楼梯占地方向已修正，原过场在约 120 秒恢复玩家控制，记录 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03-walkable-fixed.log`。阶段核对原版缺失对象处理、多级继承／重复 ID／实际引用、自定义地图、真实窗口与战役过场移动。

### 无效单位颜色与资料片战役交接（待验证）

路径：`src/session_visual.cpp`、`tests/passive_tests.cpp`、`docs/campaign-flow.md`。`SetUnitColor` 对空、已移除及不兼容单位句柄直接返回；有效单位照常设置颜色。Win32 Release 客户端和 passive 测试目标编译通过；`war3_passive_tests <data-root> <passive-fixture> invalid-unit` 4 通过、0 失败。暗夜精灵第八章直接完成建筑目标后请求终章，终章静音隔离会话运行至返回；人族第一章越过此前空单位颜色异常并推进至 400 秒。阶段核对真实战斗、自动切关、画面、无效颜色与原版边界、玩家队伍颜色和不同单位生命周期。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/`。

### AI 无效科技费用与资料片第八章（待验证）

路径：`src/session_ai_natives.cpp`、`tests/ai_control_tests.cpp`、`docs/ai.md`。不存在的科技 ID 在金币和木材费用查询中返回零；有效科技使用当前等级及源费用。Win32 Release 客户端与 AI 控制测试编译通过；`war3_ai_control_tests <data-root> <ai-control-fixture>` 4 通过、0 失败。`NightElfX08.w3x` 静音隔离会话越过此前 89.78 秒的费用异常，空闲推进到 400 秒，日志 `tmp/docs-artifacts/war3/tft-ne4-next/ne8-cost-fixed.log`。阶段核对原版不同 ID／等级／排队状态的返回值、真实对局、实际窗口和战役完整任务。

### 空间声音播放转移（待验证）

路径：`src/sound.cpp`、`tests/sound_tests.cpp`、`docs/script-sound.md`。空间声音在 `KillSoundWhenDone` 或带淡出的释放后，保留方向、音锥和锥外音量。Win32 Release 客户端和声音测试目标编译通过；`war3_sound_tests.exe <data-root> <scratch-root> sound_detached_spatial_cone` 1 通过、0 失败，以原 WAV 和静默时钟检查两种释放方式及监听者前后移动；初次测试因测试夹具意外打开本机音频设备失败，改为纯内存播放后通过。阶段核对真实音频输出、锥角和距离衰减、附着单位移动／删除、循环与淡出、脚本句柄生命周期和原版行为。

### 亡灵第五章至第八章跨关（待验证）

路径：`docs/campaign-flow.md`。原图隔离会话沿用同一缓存，观察第五章、间章、第六章及第七章的换关请求，第六至八章恢复阿尔萨斯的等级及用户数据，第八章人工缩短召唤计时后记录胜利；日志位于 `tmp/docs-artifacts/war3/undead05-chain/`。阶段验证完整窗口自动切关、自然战斗／寻路、30 分钟防守、两名英雄与物品继承、原版缓存格式及战役音画。

### 回复、双倍伤害及幻象符文（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_wards_roar.cpp`、`src/session_inventory.cpp`、`tests/dota_rune_tests.cpp`、`CMakeLists.txt`；说明见[魔瓶](dota-bottle.md)。自目标恢复与怒吼类一次性物品生效，单位可施放 `AIil`，零施法点且目标在射程内同步处理，脚本型一次性物品在拾取后消耗。Win32 Release 客户端和测试程序编译通过；DotA 原图 `regen`、`damage`、`illusion` 各 1 通过、0 失败，检查真实装瓶／释放、恢复、武器伤害、两个幻象及魔瓶恢复。`battle-roar` 4 通过、0 失败；`mirror`、`powerup` 各 1 通过、0 失败，均不加载 Game.dll。阶段核对自然拾取、施法点／重入／移动目标与事件顺序、原版属性和持续时间、不同英雄与技能、真实窗口和联机。

### JASS 数组边界与无效物品操作（待验证）

路径：`src/jass_runtime.cpp`、`src/session_entities.cpp`、`src/session_inventory.cpp`、`tests/jass_runtime_tests.cpp`、`tests/passive_tests.cpp`；原版入口证据及局限见 [JASS](jass.md) 和 [物品句柄](dota-bkb-item-handles.md)。越界数组读返回零值、写不生效；无效物品创建返回空值，设置函数安全返回。Win32 Release 客户端、两项测试程序编译通过；JASS 运行时 16 通过、0 失败，`invalid-item` 1 通过、0 失败。DotA 原图隔离会话完成符文装瓶与释放并恢复魔瓶；急速和赏金效果可观察，回复、幻象及双倍伤害效果已通过原图专项检查。阶段核对原版数组各类型／边界和物品回调、自然拾取及实际窗口。

### Channel 物品目标与魔瓶装符（部分实现，待验证）

路径：`src/session.h`、`src/session_control_spells.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_teleport.cpp`、`src/game_view.cpp`；说明见[魔瓶与物品目标](dota-bottle.md)。Channel 可选择源配置允许的地面物品，技能效果事件先于物品使用事件；DotA 原图隔离探针将急速符 `I006` 装入空瓶 `I0AM` 并生成 `I0H1`，单位及背包物品目标被拒绝。后续已修复数组越界读取及物品空句柄异常；六种符文在隔离场景均能恢复魔瓶，回复、幻象及双倍伤害效果已通过原图专项检查。客户端及 mobility 程序编译通过；`remove-item`、`reset-cooldown` 各 1 通过、0 失败，臂章和希瓦隔离探针仍观测到预期状态。记录位于 `tmp/docs-artifacts/war3/dota-bottle/`。阶段核对原版事件顺序、物品耗尽与施法回调重入、各类物品／单位目标、六种符文完整周期、图形选择和联机；继续核对自然拾取及原版表现。

### 携带物品移除事件与臂章（待验证）

路径：`src/entities.h`、`src/session_inventory.cpp`、`src/session_item_use.cpp`、`tests/generate-stealth-fixture.py`、`tests/mobility_tests.cpp`；说明见[臂章](dota-armlet.md)。移除携带物品时沿用丢弃事件及物品上下文，阻止移除回调重入；地面物品移除不产生丢弃事件。Win32 Release 客户端与 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <fixture> remove-item` 和 `powerup` 各 1 通过、0 失败。DotA 原图隔离探针在关闭／开启／关闭过程中观察力量 22／47／22、最大生命 518／993／518，日志 `tmp/docs-artifacts/war3/dota-armlet/final.log`。阶段核对原版移除／丢弃／消耗／出售事件时序与递归、不同持有者与拾取物品、实际购买输入、图形界面和联机。

### 主动物品施法事件与隐藏单位目标施法（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_item_use.cpp`、`tests/mobility_tests.cpp`；说明见[希瓦的守护](dota-shiva.md)。非拾取型永久属性物品接入技能事件和实际效果；脚本可令显示隐藏的单位施放目标技能。Win32 Release 客户端与 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <stealth-fixture> hidden-caster` 和 `powerup` 各 1 通过、0 失败。DotA 原图隔离会话 `tmp/docs-artifacts/war3/dota-shiva/after-hidden.log` 显示冰环伤害、减速与恢复；复现：`tmp/docs-artifacts/war3/dota-shiva/build/Release/dota_shiva.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对事件顺序／费用／中断、属性物品与拾取物品、隐藏与运输／死亡、实际购买／输入、范围／多个目标、窗口、原版和联机。


### 风步负淡入时间与相位鞋（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spell_effects.cpp`、`src/session_mobility.cpp`、`src/session_visibility.cpp`；说明见[相位鞋](dota-phase-boots.md)。负淡入风步保留移动及穿行状态，不进入隐形。Win32 Release 客户端及 mobility 测试程序编译通过；DotA 原图隔离会话使用 `I0GJ` 后可见且移速倍率为 1.16，效果到期恢复，记录 `tmp/docs-artifacts/war3/dota-phase/after.log`；普通风步 `war3_mobility_tests.exe <data-root> <stealth-fixture> windwalk` 1 通过、0 失败。阶段核对负值与零值原版语义、隐身叠加、穿行／索敌、使用及到期、窗口和联机。


### 亡灵第三章至第五章隔离链路（待验证）

路径：`docs/campaign-flow.md`。同版核心隔离探针使用第二章缓存，第三章击杀基地后请求第四章；第四章恢复英雄、击杀祭坛、拾取钥匙、移入出口后请求第五章；第五章恢复 5 级和用户数据 24168。日志及本地探针位于 `tmp/docs-artifacts/war3/undead03-end/`。阶段验证正常战斗、寻路、完整目标及过场、产品窗口自动换关、声音、原版存档格式与实际画面。


### 零数量召唤物品能力（待验证）

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_spell_natives.cpp`、`tests/mobility_tests.cpp`；说明见[物品召唤](item-summons-buildings.md)。零数量召唤物品能力可完成施法和发布事件，技能冷却重置保留物品冷却。Win32 Release 客户端和 mobility 测试程序编译通过；`war3_mobility_tests.exe <data-root> <stealth-fixture> reset-cooldown` 1 通过、0 失败，使用真实闪烁技能和物品验证冷却分离。DotA 原图隔离会话使用刷新球后技能冷却清零、物品及刷新球自身冷却保留，日志 `tmp/docs-artifacts/war3/dota-refresher/after-reset.log`；探针复现：`tmp/docs-artifacts/war3/dota-refresher/build/Release/dota_refresher.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对零／单／双组召唤、施法事件与费用、原版 `UnitResetCooldown` 的物品冷却范围及时序、刷新球真实购买与使用、窗口和联机。


### 镜像物品与幻影斧（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_mobility.cpp`；说明见[镜像物品](dota-manta.md)。`AOmi` 物品连接既有镜像转换及施法票据。Win32 Release 客户端和 mobility 测试程序编译通过；DotA 原图隔离会话创建英雄和 `I09F` 后产生两个幻象，记录 `tmp/docs-artifacts/war3/dota-item-probe/I09F-clones.log`；普通单位技能 `war3_mobility_tests.exe <data-root> <stealth-fixture> mirror` 1 通过、0 失败，不加载 Game.dll。阶段核对真实购买／使用、远程英雄、转换失效和事件重入、多个物品／地图覆盖、窗口、原版和联机。


### 刀阵物品与灵魂之戒（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[刀阵物品](dota-soul-ring.md)。`AEfk` 物品连接技能事件与刀阵消费者。Win32 Release 增量编译通过；DotA 原图隔离会话直接创建 `I0LL`，观察生命减少、临时魔法增加和消退、冷却内重复使用被拒绝，记录 `tmp/docs-artifacts/war3/dota-soul-ring/after-checked.log`；复现：`tmp/docs-artifacts/war3/dota-soul-ring/build/Release/dota_soul_ring.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对真实购买／使用、生命不足、魔法使用与到期、目标／伤害、多物品和地图覆盖、事件、窗口及原版和联机。


### 风步物品与洛萨之锋（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[风步物品](dota-lothar.md)。`AOwk` 物品连接已有风步施法、隐身状态和物品冷却。Win32 Release 客户端增量编译通过；DotA 原图隔离会话直接创建英雄和洛萨之锋，观察隐身、移速加成、冷却及冷却内拒绝再次使用，记录 `tmp/docs-artifacts/war3/dota-lothar/after-checked.log`；探针复现：`tmp/docs-artifacts/war3/dota-lothar/build/Release/dota_lothar.exe <data-root> <DotA_v6.83d.w3x>`。阶段核对真实购买／使用、破隐攻击、事件与时序、多物品和地图覆盖、窗口及原版和联机。


### 跨岛进攻的目标小范围移动（待验证）

路径：`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。同一单位目标距原卸载点不超过 128 时，保留现有波次及购买后待续计划；超出范围沿用取消与重选。Win32 Release 客户端及 CampaignAI 目标编译通过。BootyBay 地形隔离检查 `island-target-small-move`、`island-target-change`、`island-flight-target-move`、`island-purchase-pending`、`island-auto-multiwave-script` 各 1 通过、0 失败，无 Game.dll。小范围场景覆盖上船前和舱内两次目标移动、重复下令、登陆和目标攻击；目标暂停／运输期间无敌，阈值不是原版证据。复现：在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_campaign_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/campaign-ai/fixture.w3m" <模式>`。阶段检查持续移动及阈值边界、飞行与登艇阶段、目的地受阻、水陆切换、多单位多载具、目标死亡／易主、脚本／玩家换令、完整对局、联机和原版策略。

### 购买中的跨岛进攻（待验证）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。购买尚未完成时保留进攻目的地，成功获取可用载具后继续既有运输，购买失败且没有本方运输工具，或目标失效时清理状态。Win32 Release 客户端及 CampaignAI 目标编译通过；BootyBay 地形隔离检查 `island-purchase-pending`、`island-purchase-busy`、`island-purchase-cancel`、`island-purchase-target-death`、`island-purchase-attack`、`island-auto-multiwave-script` 各 1 通过、0 失败，无 Game.dll。夹具预置资源、商店库存和部队，忙碌模式额外预置载具，买家／士兵无敌，敌方目标暂停；非完整对局。复现：在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_campaign_ai_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/campaign-ai/fixture.w3m" <模式>`。阶段核对目标移动／替换／退却、资金或库存变化、买家换令／死亡／阻塞、船舶忙碌／不可用、多个波次与载具、四族实际策略、联机和原版行为。

### 飞艇击毁乘员状态（待验证）

路径：`src/spells.h`、`src/session_control_spells.cpp`、`src/session_transport.cpp`、`tests/transport_tests.cpp`；说明见 [运输流程](transport.md)。有 `Achd` 的载具死亡且乘员成功落地后附加 `Bchd`，按普通／英雄源时长和移动／攻击恢复字段影响真实速度；共享恢复曲线为当前近似。Win32 Release 客户端与 transport 目标增量编译通过；在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_transport_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/transport/fixture.w3m" crash`，隔离检查 1 通过、0 失败，覆盖陆地释放、普通／英雄持续时间、减速恢复及不可驱散，无 Game.dll。阶段核对无能力／禁用／移除／正常卸载、陆地／水面／阻挡与无落点、英雄／普通／召唤／魔免／无敌、自定义持续及恢复字段、召唤伤害、重入／转让／复活／状态叠加、原版计时及视听、地图和联机。

### 链式驱散（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_item_use.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [链式驱散](chain-dispel.md)。单位技能和中和权杖进入目标施法、弹道、逐次驱散和物品次数；电脑可选取有可驱散状态的目标。Win32 Release 客户端及 spell 目标编译通过；在 `watcher/war3` 下运行 `build/windows-x86/bin/Release/war3_spell_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/mind-rot/fixture.w3m" chain-dispel`，隔离检查 1 通过、0 失败，覆盖两条入口、友方双目标和次数，不加载 Game.dll。阶段对照原版选点／跳转／上限、敌友／魔免／无敌／幻象／召唤、源覆盖与零值、回调重入／死亡／易主、费用／冷却／护盾、电脑、真实窗口／声音、地图和联机。

### 野生动物游荡（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_ambient_passives.cpp`、`tests/passive_tests.cpp`、`docs/mechanical-critters.md`。源 `Awan` 接入空闲游荡与实际移动；初始区域、间隔与随机流使用当前近似实现。Win32 Release 客户端和 passive 目标编译通过；`build/windows-x86/bin/Release/war3_passive_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m" wander`（在 `watcher/war3` 下执行）隔离检查 1 通过、0 失败，覆盖原鼠单位移动、范围、保持位置和移除能力，无 Game.dll。阶段检查原地图动物／机械小动物、导航／路径障碍、订单事件、玩家命令与保持、暂停／眩晕／禁用／变形／转移／死亡／移除、原版时序与范围、随机调用顺序、多人同步和大地图性能。

### 中立魔法之泉（待验证）

路径：`src/session_passive_info.cpp`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。`Aarm` 原型接入魔法光环及实际恢复，源 `nmoo/ANre` 使用百分比和范围。Win32 Release 客户端及 passive 检查目标增量编译通过；隔离会话 `build/windows-x86/bin/Release/war3_passive_tests.exe "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne" "../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m" fountain`（在 `watcher/war3` 下执行，夹具由 `tests/generate-passive-fixture.py` 生成） 1 通过、0 失败，检查原生命／魔法之泉对两个玩家的恢复、范围外单位及来源移除，不加载 Game.dll。阶段检查泉水地图、源数据覆盖、离开／返回、不同玩家及有机／机械／空地目标、多个来源／辉煌光环叠加、buff／视觉／声音、原版恢复速率与时序、实际窗口及联机。

### 重生神符（待验证）

路径：`src/consumables.h`、`src/session_consumables.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/rebirth-rune.md`。拾取 `rreb` 时消费物品记录的来源类型，创建拾取者所属单位；空／无效类型或无可用落点不创建单位。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/mind-rot/fixture.w3m rebirth-rune`、`shield-rune`、`mind-rot` 各 1/1。补充 `war3_spell_tests <data-root> tmp/docs-artifacts/war3/rebirth-rune/drop-fixture.w3m rebirth-drop` 1/1：死亡回调运行原 `UnitDropItem`，玩家目标命令拾取并创建单位；夹具直接击杀单位。阶段检查原地图自然战斗掉落、来源覆盖、不同玩家／单位类型、无空间、事件重入、资源释放、实际窗口、联机和原版落点／时序／归属。

### 心灵腐烂（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_caster_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_spells.cpp`、`src/session_unit_casters.cpp`、`src/session_item_use.cpp`、`src/session_ai_armies.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`；说明见 [心灵腐烂](mind-rot.md)。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/mind-rot/fixture.w3m mind-rot`、`spell-shield`、`shield-rune` 各 1/1。前者覆盖目标、源时长／耗魔、状态移除、零魔法、派生物品及护盾，夹具关闭目标自动索敌。阶段检查 AI、完整施法事件、地图覆盖、空目标分类、重复施法、魔法恢复／耗尽顺序、暂停／死亡／易主、驱散与法术偷取、实际画面、联机及原版时序。

### 群体护盾神符（待验证）

路径：`src/consumables.h`、`src/spells.h`、`src/session_consumables.cpp`、`src/session_spells.cpp`、`tests/spell_tests.cpp`、`docs/spell-shield.md`。`rsps` 拾取消费 `ANse` 的范围、目标和 `BNss`，对各友军创建可消耗的独立护盾状态；与护身符分别生效。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m shield-rune`、`spell-shield`、`acid-speed` 各 1/1。夹具覆盖神符消耗、友军／无敌友军／敌军／范围外、长时保留、单次拦截、护身符及移除；目标关闭自然生命恢复。阶段检查地图覆盖、持续时间、能力禁用与目标变化、重新拾取、驱散／法术偷取、死亡／复活、事件重入、双护盾优先级、音画、实际地图、联机与原版行为。

### 魔法护盾护身符（待验证）

路径：`src/passives.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`tests/spell_tests.cpp`、`docs/spell-shield.md`。`ANss` 的原物品及单位来源消费源冷却，拦截指定敌方单体技能，施法事件、魔法和施法者冷却保留。Win32 Release 客户端及测试目标编译通过；`war3_spell_tests <data-root> tmp/docs-artifacts/war3/spells/acid-speed-fixture.w3m spell-shield` 1/1，覆盖友方治疗、范围雷霆一击、敌方风暴之锤及冷却／移除；目标关闭自然生命恢复。同夹具 `rain-chaos`、`monsoon` 各 1/1。阶段核对其他技能、技能与物品来源／地图覆盖、事件重入、弹道和范围、死亡／转移／变形、多护盾、冷却显示、AI、真实窗口和联机；原版拦截范围与时序仍待对照。

### 视野范围加成（待验证）

路径：`src/equipment.h`、`src/passives.h`、`src/session_equipment.cpp`、`src/session_passive_info.cpp`、`src/session_fog.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/visibility.md`。`AIsi` 的源数值及地图覆盖经单位／库存状态汇总到昼夜迷雾视野，能力可用性和科技前置参与刷新。Win32 Release 客户端及测试目标编译通过；`war3_passive_tests <data-root> <fixture> sight` 与 `weapon-ui` 各 1/1，前者覆盖两个物品的加成、能力禁用与恢复、物品和单位能力移除，以及迷雾状态变化。夹具在 `tmp/docs-artifacts/war3/sight-bonus/fixture.w3m`。阶段核对昼夜、单位移动与死亡／易主、地图覆盖与科技、幻象、共享视野、极值、多来源叠加、原版规则及实际界面；原件多来源规则尚未确认。

### 亡灵第三章开场后会话（待验证）

路径：`docs/campaign-flow.md`。使用隔离复制的第二章转场缓存、原图和无窗口静音会话推进 600 秒；150 秒检查到英雄等级 5 与用户数据 24168，120–600 秒可操作且未请求退出，日志 `tmp/docs-artifacts/war3/undead02-probe-1031/continue.log`。探针没有玩家命令、未完成任务；自然战斗和胜负、界面、自动切关与原版一致性仍待验证。

### 运输中取消与载具命令归属（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。波次记录载具订单轮次与上船区域；取消后当前位置不可卸载时，仍受波次控制的载具使用实际卸载技能返回上船区域。载具命令轮次变化时释放波次控制并保留新命令。Win32 Release 客户端及 CampaignAI 编译通过；BootyBay 地形 `island-flight-death`、`island-flight-retreat` 修复前复现乘员留在深水上、`island-flight-reorder` 修复前复现载具新命令被覆盖；修复后以上及 `island-flight-target-move`、`island-flight-reorder-live` 各 1/1。原公共 AI 多波、单次坐标多波、双乘员及乘员换令各 1/1。夹具预置单位与飞艇；目标消失后上船区失效、飞行中再次换令／死亡／易主、满舱多船、原版时序、实际窗口和联机待验证。

### 坐标进攻的后续运输波次（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。进攻目标有效时在波次结束后继续接运隔离队员，暂停队员恢复后可续运；目标失效、目的地改变、撤退与编队重置清除续运状态。Win32 Release 客户端及 CampaignAI 编译通过；BootyBay 地形 `island-auto-point` 修复前九人只到八人，修复后 1/1 全部登岛；`island-auto-multiwave`、`island-auto-multiwave-script`、`island-auto-resume`、`island-auto-target-death`、`island-auto-retreat`、`island-target-change`、`island-pickup-cancel` 各 1/1。夹具预置九名无敌步兵与八格飞艇，目标在出发前死亡检查；不代表完整对局或原版行为。阶段检查航行中目标消失／换令、无落点、多船、不同载具、性能、原版时序和联机。

### 隔水营地自动选择与空中运输（待验证）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`、`docs/implementation-roadmap.md`。陆路营地优先；无陆路选择时按空闲载具、容量、乘员及空中通路回退至隔水营地；进攻时仅将隔离的地面队员加入实际运输波次。Win32 Release 客户端和 CampaignAI 编译通过；BootyBay 地形 `island-auto` 与原公共 `MinorCreepAttack` 的 `island-auto-script` 各 1/1，覆盖无／暂停／无法移动的载具、营地选择、同岛队员、组队、登艇和卸载；`reachable` 2/2，`island-wave`、`island-target-change`、`island-pickup-group`、`island-pickup-cancel` 各 1/1。夹具预置飞艇与部队，选营后将目标设为无敌。阶段核对目标变化／死亡、满载多波、多载具、陆空混编、无飞区及动态障碍、真实对局自动购买和原版策略、性能及联机。

### 运输波次与单位攻击目标（待验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。单位攻击目标与已有运输波次的目的地相同时保留波次；目标位置改变时取消旧波次。Win32 Release 客户端与 CampaignAI 测试程序编译通过；BootyBay 地形 `island-target` 修复前复现运输取消，修复后 1/1，检查重复攻击、登艇、卸载和落地后的攻击指令；`island-target-change`、`island-wave`、`island-pickup-cancel` 各 1/1。夹具预置单位、飞艇与静止无敌目标。阶段检查目标移动／死亡、途中撤退和换令、多飞艇／乘员、事件重入、原版行为、真实对局和联机；电脑自动选择跨岛目标仍待实现。

### 隔离区域的部分路径搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。缓存区域可达到目标的最小网格距离，搜索确认落点及排序无法改善后结束；无区域或条件不满足时继续原搜索。Win32 Release 客户端与 world 测试程序编译通过；预建区域与未预建区域逐点对照 4/4，覆盖动态开闭、不同起点／目标／净空、共享缓存和大区域。OrcX03b 隔离静音模拟前 120 秒分别耗时 203.671 和 140.265 秒，对照后段有编译并行，日志在 `tmp/docs-artifacts/war3/orcx03b-path-current/`。阶段检查搜索预算与相同距离的代价／格号排序、动态障碍、多移动类型、密集单位、实际战役帧时间及内存。

### 路径缓存与区域通行复用（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。按有效净空及路径版本复用短成功／部分路径，成功路径保留当前精确终点；区域图为 A* 提供通行结果。Win32 Release 客户端及 world 测试程序编译通过；精确终点、缓存失效、区域变化、部分路径及替代目标等 6 项各 1/1，预建区域与逐格搜索对照 1/1。OrcX03b 无前章 gamecache 静音模拟前 40 秒从 29.219 秒到 25.219 秒，日志在 `tmp/docs-artifacts/war3/orcx03b-path-current/`；结果不是帧率。阶段核对动态阻挡、不同净空与移动类型、搜索预算、长期对局、内存和原版路径语义。

### 英雄经验与物品栏对齐（待验证）

路径：`src/game_inventory_layout.h`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。缩小经验条并在攻击行上方留出间距；物品图标、冷却和命中使用调整后的六格坐标；攻击数值与彩色增减值按完整文字纹理宽度分隔。Win32 Release 客户端增量编译与差异检查通过。游戏内 Agent 选中六物品、100 经验的圣骑士，1264×921 画面显示六个物品位于各自槽位，经验条处于信息框内，攻击基础值与绿色加成分开；证据位于 `tmp/docs-artifacts/war3/agent-info/layout-latest-agent/`。阶段核对点击／拖拽／冷却、不同经验与攻击数值、双武器、四族及不同窗口比例，并与原版画面对照。

### 失效扩张点重新选择（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。坐标、工人、敌人及建造入口使用同一扩张点有效性检查；目标矿井耗尽、隐藏／死亡／移除、归属变化、失去采金能力或被本方城镇占用后，重新选择可达候选。Win32 Release 客户端和 CampaignAI 测试程序编译通过；BootyBay 地形 `reachable` 在修复前保留耗尽矿井，修复后 2/2 通过，检查替代矿井、工人和敌人查询以及城镇占用后的无目标／不建造；`expansion-empty` 2/2 通过。夹具预置矿井、位置和城镇，未覆盖自然开采和建造。阶段验证矿井易主／销毁／隐藏、能力和路径变化、多个工人和城镇、事件回调、原版缓存与选择规则、实际对局、性能和联机。

### 空扩张目标坐标（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。没有可用扩张点时 X／Y 返回 -1，原公共 AI 的 `ExpansionAttack` 不再向坐标 (0,0) 发出进军；有效扩张点返回其坐标。Win32 Release 客户端及 CampaignAI 目标编译通过；`reachable` 在修复前的空目标断言失败，修复后 2/2 通过；`expansion-empty` 在修复前复现原 `ExpansionAttack` 向不存在目标进军，修复后 2/2 通过，检查原脚本线程结束及目标不变。固定版 Game.dll 注册入口 `0x6f88fc90`／`0x6f88fd10`、无结果分支和 -1 常量初始化见 `tmp/docs-artifacts/war3/ai-expansion-sentinel/original-rizin.txt`。夹具直接设空矿藏和部队；扩张点失效／改变、完整电脑对局、原版动态行为及联机仍待阶段验证。

### 飞艇多乘员隔水接应（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。按货舱容量预约隔水乘员，使用原装载订单依次接应；排队期间的新命令按单位订单轮次保留，失效目标释放接应票据并继续队列。Win32 Release 客户端和测试程序编译通过；BootyBay 地形的 `island-pickup-group` 修复前分配失败，修复后 1/1 通过，两个乘员于约 44.25 秒模拟时完成接应及交付；`island-pickup-reorder`、`island-pickup-death`、`island-pickup-capacity` 各 1/1，覆盖排队命令、首名死亡和九人对八格预约上限。既有单人接应／取消／超时及正常、慢速登艇共 5 项通过。夹具预置单位、飞艇和目标并设置无敌；容量检查只覆盖预约，未验证满舱运输。阶段验证多岛、多飞艇、满舱运输、队列移动／易主／暂停、乘员载具死亡、回调重入、原版队列与时序、自动选目标、窗口、性能及联机。

### 飞艇隔水接应（待验证）

路径：`src/ai.h`、`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。地面乘员无法步行登艇时，空闲空载飞艇使用原装载能力接近并装载乘员，再沿既有波次卸载；接应订单按施法票据处理取消和超时，避免取消已替换的命令。Win32 Release 客户端及 CampaignAI 目标编译通过；BootyBay 地形隔离夹具 `island-pickup` 在修复前无法分配，修复后 1/1 通过，模拟至 43.25 秒完成接应与交付；`island-pickup-cancel`、`island-pickup-timeout`、`island-wave`、`island-long` 各 1/1。超时夹具直接暂停载具状态；场景预置目标、部队和飞艇并设置无敌，不代表完整电脑对局。阶段验证多岛多乘员、多飞艇、移动／死亡／易主／暂停、路径和装载容量、回调重入、原版选择／时序、实际窗口、性能及联机。

### 飞艇波次等待远距离登艇（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。为每个成功分配的乘员根据登艇路线长度、移动速度和现有速度修正估算等待时间，取最慢值，限制为 45–600 秒；期限到达、失效和更改目标沿用现有清理。Win32 Release 客户端和 CampaignAI 测试目标编译通过；BootyBay 地形 `island-long` 在修复前无法完成登艇，修复后 1/1 通过，两名快慢乘员分别登艇并在约 76 秒模拟时卸载；`island-wave` 1/1 通过。夹具预置部队、载具和目标，将一名步兵速度设为 5 并设为无敌；并非完整 AI 对局。阶段验证多人拥堵、运输单位移动／死亡／易主、途中减速／暂停、等待上限与命令变化、混编、多载具、自动选目标、实际窗口和联机，并对照原版等待与排序。

### 物品栏说明提示（待验证）

路径：`src/game_view.*`、`src/game_inventory_drag.cpp`、`src/session.h`、`docs/inventory-interactions.md`。悬停实际物品格显示名称及原资源／地图覆盖说明，增强提示关闭时显示名称；长内容分页，拖动或界面遮挡时隐藏。Win32 Release 客户端编译通过；DotA_v6.83d 隔离会话读取到动物信使的地图覆盖中文说明和颜色标记，记录 `tmp/docs-artifacts/war3/courier-journey/tooltip.log`，尚未验证渲染。阶段检查空槽／切换选区／六槽／多选、地图覆盖与颜色和数据引用、长文本分页、增强设置、拖放和目标模式、四族皮肤、窗口比例与原版画面。当前显示环境无法创建 D3D9 设备，尚无实际画面证据。

DotA_v6.83d 隔离配送探针按 2 秒采样，信使先接近英雄、交付物品并返回基地；记录 `tmp/docs-artifacts/war3/courier-journey/before.log`。该探针预置物品并调整单位位置，不代表实际窗口和完整配送验收。

### 暂停打断持续施法（待验证）

路径：`src/session_entities.cpp`、`tests/channel_tests.cpp`、`docs/teleport.md`、`docs/spirit-split-tornado.md`。首次暂停单位时中断其当前施法、释放关联资源并发出 ENDCAST；重复暂停和恢复不重复派发。Win32 Release 客户端及测试目标编译通过；`war3_channel_tests <data-root> <channel-fixture>` 1/1 通过，覆盖持续施法暂停、重复暂停、恢复及施法完成事件内暂停。DotA_v6.83d 隔离会话中回城后英雄到达目的地、施法结束且可接收移动，记录 `tmp/docs-artifacts/war3/dota-item-flow/portal-pause-after.log`。原版 1.27 `PauseUnit` 在首次暂停时进入单位暂停动作路径，反汇编见 `tmp/docs-artifacts/war3/dota-item-flow/pause-original-rizin.txt`；是否对所有施法阶段发出相同事件仍需运行原版核对。阶段检查暂停期间及恢复的其他订单、移动／采集／生产、重复调用、施法回调重入、原版事件时序、实际窗口和联机同步。

### 地图脚本回城与地表特效（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_spirit_split.cpp`、`src/session_effects.cpp`，说明见 [龙卷风](spirit-split-tornado.md) 和 [地表特效](ubersplats.md)。Release 客户端编译通过；原版 ANto 隔离探针创建旋风并以停止命令结束。DotA_v6.83d 隔离会话购买并使用回城卷轴，原图脚本创建 SCTP 并将英雄传送至目标附近，随后移动命令可中断持续施法；记录 `tmp/docs-artifacts/war3/dota-item-flow/portal-move-after.log`。阶段需对照原版结束时机、暂停／恢复、取消、目标建筑／小地图／双击、费用与多次回城、特效画面、地图覆盖和联机同步。

### 消耗品施法事件（待验证）

路径：`src/session_consumables.cpp`，说明见 [消耗品](consumables.md)。Release 客户端及相关测试程序编译通过；`war3_consumption_tests <data-root> <fixture> protection` 1 通过、0 失败。DotA_v6.83d 隔离会话使用附加观察脚本检查魔瓶、净化药水的施法阶段、目标和回调移除物品；魔瓶三次使用及泉水补充记录在 `tmp/docs-artifacts/war3/dota-item-flow/bottle-observed-events.log`。阶段核对八类消耗品和符文的事件时序／目标、物品事件先后、费用／冷却、驱散、目标变更、施法者死亡／易主／新订单、脚本重入、原版及联机同步。

### 失效位置的点订单（待验证）

路径：`src/session_orders.cpp`、`tests/order_queue_tests.cpp`，原件入口与行为见 [点目标、范围伤害与召唤物](area-spells.md)。Release 客户端及订单测试目标编译通过；`war3_order_queue_tests <data-root> <BootyBay.w3m> invalid-location` 1 通过、0 失败，覆盖空、已移除、类型不兼容和未知位置及已有队列，并检查有效位置的两种订单。DotA_v6.83d 隔离场景在原先位置句柄异常处继续推进，记录 `tmp/docs-artifacts/war3/dota-item-flow/dust-invalid-location-apiv-after.log`。阶段检查群组位置订单、脚本重入、其他订单、完整地图及联机同步。

### 显影之尘施法事件（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`tests/stealth_tests.cpp`，说明见 [主动显形](stealth-reveal.md)。Release 客户端及专项目标编译通过；`war3_stealth_tests <data-root> <fixture> dust` 1 通过、0 失败，覆盖侦测跟随、冷却、到期和次数消耗。DotA_v6.83d 隔离会话中显影之尘对敌方隐身英雄应用 `Bdet`，并触发地图脚本添加 `A2SJ`，记录 `tmp/docs-artifacts/war3/dota-item-flow/dust-effects-after.log`。阶段检查原版事件和费用时序、目标／魔免／侦测共享、技能中断、脚本重入、最后一次消耗、实际窗口及联机同步。

### Channel 物品目标与地图事件（待验证）

路径：`src/session_item_use.cpp`、`src/session.h`、`src/session_spells.cpp`、`src/game_view.cpp`、`src/game_hero_bar.cpp`、`src/game_inventory_drag.cpp`，说明见 [持续施法与地面效果](channels.md)。Release 客户端编译通过；DotA_v6.83d 隔离会话购买侦察守卫，对地点使用生成 `o004`，对友方英雄使用产生单份 `I05G`，两条路径均消耗一次，记录位于 `tmp/docs-artifacts/war3/dota-item-flow/ward-point.log` 和 `ward-ally.log`。阶段验证真实窗口的地点／单位／英雄头像／双击、无目标与单位目标 Channel、无效目标、费用与冷却、脚本重入及联机编码；与原版对照。

### 水元素原型物品及信使（待验证）

路径：`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`，说明见 [点目标、范围伤害与召唤物](area-spells.md)。Release 客户端和控制技能测试目标编译通过；`war3_control_tests <data-root> <fixture> purge` 1 通过、0 失败，包含普通水元素召唤。DotA_v6.83d 隔离会话购买、使用动物信使物品后生成玩家信使并消耗物品，回家命令使信使从设定位置移动；记录 `tmp/docs-artifacts/war3/dota-item-flow/courier-return.log`。阶段验证物品费用、召唤事件／零数量、窗口操作、基地地面物品收集、配送／共享控制、信使死亡／升级、脚本重入和联机同步，并与原版对照。

### 吞树物品与地图脚本（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`、`src/session_control_spells.cpp`、`src/session_spell_info.cpp`、`src/session_area_spells.cpp`，说明见 [吞树与魔法消耗](consumption.md)。Release 客户端及吞食测试目标编译通过，`war3_consumption_tests <data-root> <fixture> eat` 1 通过、0 失败。DotA_v6.83d 隔离会话购买 I05C，树木目标后消耗一次、杀死树木并获得地图恢复能力；友方英雄目标后消耗一次并收到 I0Q6。阶段验证实际鼠标选树与分享、被遮挡和不可见目标、距离与寻路、取消／占用、最后次数和冷却、脚本重入及联机；对照零吞食时间和目标规则的原版行为。

### 单位目标物品双击（待验证）

路径：`src/game_inventory_drag.cpp`。物品目标选择期间双击原槽位，将持有者作为单位目标提交，沿用物品命令的目标校验与队列处理。Win32 Release 客户端增量编译通过；DotA_v6.83d 隔离会话购买 `I05D` 净化药水，目标为持有者时命令接受、魔法在 10 秒内从 0 恢复至约 45.2，记录见 `tmp/docs-artifacts/war3/dota-item-flow/clarity-self.log`。阶段通过游戏内 Agent 验证双击、选目标、Shift 排队、不可对自身使用的物品及联机同步；点目标物品双击规则与原版对照。当前环境创建 D3D9 设备失败，尚无本次交互画面证据。

### 中立霜冻吐息（待验证）

路径：`src/session_spell_info.cpp`、`src/session_neutral_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`，说明见 [中立能力](neutral-heroes.md)。Release 客户端和专项程序编译通过；`war3_spell_tests.exe <data-root> <fixture> frost-breath` 1/1 通过，覆盖原蓝龙施法、直接伤害、`BCbf` 持续伤害以及火焰吐息对未醉酒目标不添加燃烧。阶段检查多目标锥形、总伤害上限、施法与死亡回调、地图覆盖、状态叠加／驱散、电脑决策、原版伤害分类、声音与画面。

### 静态与建筑阴影插值（待验证）

路径：`src/game_effects.cpp`、`src/game_view.h`，说明见 [单位地面阴影](unit-shadows.md)。Release 编译通过；原地形、无 SHD 和建筑定时移除的隐藏窗口截图已检查，确认阴影边缘平滑及移除后消失。阶段核对跨分块接缝、灰度／透明贴图、地图边界、静态／建筑叠加、视野及动态变化、坡面／水面、设备恢复和 Amazonia 帧耗时，并与原版像素对照。

### 小地图镜头范围（待验证）

路径：`src/game_view.cpp`；说明见 [小地图](minimap.md)。Release 编译通过；关闭迷雾的原地形夹具在隐藏窗口显示底图及视口轮廓，程序滚轮消息后轮廓尺寸变化。阶段检查实际鼠标、镜头平移／旋转／缩放、地图边缘、悬崖和水面、水平线／远平面、战役镜头、窗口比例／DPI、设备恢复、性能及原版轮廓。

### 娜迦潜水形态（待验证）

路径：`src/session_spell_info.cpp`、`src/session_entities.cpp`、`tests/unit_forms_tests.cpp`，说明见 [单位形态](unit-forms.md)。Win32 Release 客户端和专项程序编译通过；`war3_unit_forms_tests.exe <data-root> <fixture> submerge` 1/1 通过，覆盖三对原始类型的订单、显隐、速度、武器和句柄往返及直接创建潜水形态后浮出。该次未验证地面／水域限制；阶段检查真实水陆地形、科技前置、侦测、打断／死亡／复活、地图覆盖、AI、动画及原版行为。

### 中立生物死亡生成（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_neutral_spells.cpp`、`tests/corpse_tests.cpp`，说明见 [尸体与复活](corpses.md)。Win32 Release 客户端和尸体测试编译通过；`war3_corpse_tests.exe <data-root> <fixture> spawn-on-death` 1/1 通过，覆盖三种原始类型、数量与归属和直接移除。首次在另一落点只生成 1 只，改用开放位置后通过；受阻位置和原版处理仍待验证。阶段检查地图覆盖、能力禁用／移除、幻象／爆炸／复活／死亡回调重入、无位置、无期限和事件，以及实际地图与原版对照。

### 中立操纵死尸和地狱火（待验证）

路径：`src/session_spell_info.cpp`、`src/session_ai_armies.cpp`、`tests/corpse_tests.cpp`。`ACad` 和 `ANin` 接入既有技能、实际订单及电脑决策，数值取各自原始或地图覆盖字段；说明见 [尸体与复活](corpses.md)和[范围与召唤](area-spells.md)。Win32 Release 客户端和尸体测试编译通过；原地形夹具 `creep-spells` 1/1 通过，覆盖尸体消费、非无敌及 120 秒时限、地狱火实体与 360 秒时限。阶段检查中立单位自身与电脑决策、目标／距离／费用／事件／中断、地图覆盖、完整效果、实际地图和原版对照。

DotA_v6.83d 静音无操作隔离会话当前完成 main 并推进 600 秒；BootyBay 人族电脑隔离会话推进 60 秒时有 1 个城镇、5 名采集工人、1 项生产队列、3 项建造／施工。日志及结果仅覆盖这些路径，不代表真实窗口操作或完整对局；DotA 日志为 `tmp/docs-artifacts/war3/dota-600s-current.log`。

### 武器显示字段（待验证）

路径：`src/session_research.cpp`、`src/game_commands.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`，说明见 [单位战斗信息面板](unit-combat-panel.md)。Win32 Release 客户端和专项程序编译通过；生成夹具后运行 `war3_passive_tests.exe <data-root> <fixture> weapon-ui`，1/1 通过。阶段核对原版显示筛选、树木专用武器、两把可见武器、对象覆盖／变形、增益与真实面板；完整攻击和原版视觉未由该检查证明。

### 单位信息与多选位置修正（待验证）

路径：`src/game_view.cpp`、`src/game_selection_panel.cpp`、`src/game_commands.cpp`。单位／物品名称与生命、魔法及单位信息移入底部信息区；多选图标和鼠标命中共用调整后的位置；英雄经验条及其悬停区域移到头像下方。Win32 Release 编译通过；在 1258×904 隐藏窗口，用程序消息分别选中单个农民、单个圣骑士和两个农民，三次截图均显示在面板内，日志确认选中数量及正常退出，证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-{current,hero,multi}-selected.*`。阶段继续检查真实鼠标与命令按钮、货舱／建造／生产、地面物品、长文字、不同窗口／DPI、四族皮肤及原版画面对照；本次截图不代表完整 UI 还原。

### 单人近战默认对手（待验证）

路径：`src/setup.h/.cpp`、`src/map_browser.cpp`、`tests/setup_tests.cpp`，说明见 [地图与选图流程](map-loading.md)。Win32 Release 产品及配置测试编译通过，配置测试 6/6 通过；BootyBay 隐藏窗口 300 帧未出现无对手即时胜利对话框。阶段验证其他近战地图、队伍和电脑槽、用户修改及同图草稿、真实交互和完整对局，并对照原版默认值；自定义、固定设置和自定义势力地图不自动添加对手。

### 隐形单位侦测事件（待验证）

路径：`src/script_state.h`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_tick.cpp`、`src/session_visibility.cpp`、`tests/generate-invisibility-fixture.py`、`tests/visibility_tests.cpp`；说明见 [脚本事件](script-events.md)。Win32 Release 客户端和专项程序编译通过；生成 BootyBay 夹具后运行 `war3_visibility_tests.exe <data-root> <fixture> detected-event`，1/1 通过，覆盖首次发现、持续侦测、离开后再次发现和上下文。侦测事件目前覆盖处于视野中、由真视发现的隐形单位及其事件上下文。阶段集中对照玩家事件注册方、初次注册、普通可见单位、共享视野、检测进出、回调重入、多人及固定版时序；仅有监听时扫描，需检查大地图开销。

### 球体能力附件（待验证）

路径：`src/effects.h`、`src/game_effects.cpp`、`src/passives.h`、`src/session_game.cpp`、`src/session_passive_info.cpp`、`src/session_weapon_effects.cpp`。Win32 Release 客户端编译通过。球体能力的目标特效通过现有模型附件系统显示，能力禁用、移除及单位形态变化时刷新；单位死亡或隐藏时不绘制。原版 1.27 `War3Patch.mpq` 的 `Units\\HumanAbilityFunc.txt` 中 `Asph` 使用 BloodElfBall 模型及 sprite first／second／third 三个挂点。阶段检查实际血法师与幻象、挂点动画、死亡／复活、技能切换及地图覆盖，核对原版攻击时球体行为；当前仅接入持续附件，未实现球体发射和恢复行为。

## 寄生及蜘蛛召唤待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_caster_spells.cpp`、`src/session_spell_effects.cpp`、`src/session_callbacks.cpp`、`src/session_neutral_spells.cpp`；说明见 `parasite.md`。尚未编译或执行玩法检查。阶段检查原版 `ANpa` 和 DotA_v6.83d `A0BH` 的字段覆盖、学习与订单、`B0E7` 查询、毒伤／减速／叠加／驱散、攻击及毒伤致死、召唤类型／数量／归属／时限和 JASS 召唤事件；对照英雄／幻象／尸体及脚本重入边界，重点检查到期 tick 致死顺序。合并验证时构建 `cmake --build --preset release --target war3 --parallel 8`，并运行地图实测及原版对照。

## 企鹅玩具待验证

路径：`src/session_consumables.cpp`；说明见 `consumables.md`。阶段检查 `stpg` 满血与受伤使用、重复使用与背包保留、音效与音量、物品事件、冷却组、自定义零恢复物品、双端和原版规则；暂未执行玩法或听感验证。

## 吸血药水待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_effects.cpp`、`src/session_attack_passives.cpp`、`src/session_item_use.cpp`、`src/session_projectiles.cpp`、`src/session_network_identity.cpp`；说明见 `vampirism-potion.md`。包含本轮信号枪和科技快照的 Win32 Release 客户端编译通过。阶段检查购买／使用／冷却、攻击加成、近远程回血、目标限制、击杀／复活／易主、驱散、光环叠加、脚本重入、联机及原版规则。

## 保存权杖基地优先级待验证

路径：`src/session_teleport.cpp`；说明见 `preservation.md`。包含本轮物品和科技快照改动的 Win32 Release 客户端编译通过。阶段检查四族不同级别、混合种族、同级及自定义 `prio`、基地死亡／施工／转让、目标所有者及原版选择行为。

## 玩家科技快照待验证

路径：`src/session.h`、`src/session_game.cpp`；说明见 `player-tech-persistence.md`。包含本轮物品改动的 Win32 Release 客户端编译通过。阶段检查所有玩家研究等级、科技上限和能力可用性往返，损坏／重复键／非法值事务拒绝、活跃会话及已有单位限制，以及与单位、资源和生产队列的完整恢复；尚未接入存档。

## 信号枪物品待验证

路径：`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`；说明见 `flare.md`。包含本轮吸血药水和科技快照的 Win32 Release 客户端编译通过。阶段检查地图与小地图选点、次数及耗尽、施法事件／取消、延迟／视野／侦测、暂停／施法者死亡、自定义覆盖、联机和原版表现。

## 保存权杖待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_item_use.cpp`、`src/session_area_spells.cpp`、`src/session_teleport.cpp`；说明见 `preservation.md`。包含攻击地面的 Win32 Release 客户端编译通过。阶段检查目标、基地筛选、传送落点、施法事件／冷却、目标或基地易主／死亡／删除、回调重入、自定义掩码、联机、性能及原版对照。

## 攻城单位攻击地面待验证

路径：`src/session_attack_ground.cpp`、`src/combat.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_orders.cpp`、`src/player_commands.h/.cpp`、`src/game_loading.h/.cpp`、`src/game_view.h/.cpp`、`src/game_commands.cpp`、`src/game_waypoints.cpp`、`src/game_hero_bar.cpp`、`src/game_selection_panel.cpp`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`、`src/session_network_identity.cpp`；说明见 `attack-ground.md`。包含保存权杖的 Win32 Release 客户端编译通过。阶段检查 G 按钮、目标与视野、靠近／持续攻击／取消、伤害和燃烧油、排队、双端及原版资格和时序。

## 玩家基础状态快照待验证

路径：`src/session.h`、`src/session_game.cpp`、`tests/clock_tests.cpp`；说明见 `player-state-persistence.md`。Win32 Release 客户端及 `war3_clock_tests` 编译通过，行为检查待运行。阶段检查 16 名玩家资源／人口／状态位及维护费覆盖往返、损坏／重复键／截断的事务性拒绝、执行及联网限制、与单位／生产等完整恢复的一致性；尚未接入存档。

## 地面物品武器攻击待验证

路径：`src/combat.h`、`src/game_view.cpp`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`、`src/session_combat_destructable.cpp`、`src/session_projectiles.cpp`；说明见 `weapon-item-attacks.md`。包含时钟快照的 Win32 Release 客户端编译通过。阶段检查四族武器、目标选择／排队、近战与弹道、范围／直线／弹跳、拾取／丢弃／销毁与回调、迷雾、联机、性能及原版表现。

## 世界昼夜时钟快照待验证

路径：`src/game_clock.h/.cpp`、`tests/clock_tests.cpp`；说明见 `world-clock-persistence.md`。Win32 Release 客户端及 `war3_clock_tests` 编译通过，行为检查待运行。阶段检查暂停／倍速与临时时间效果往返和持续推进、损坏／规则不匹配的事务性拒绝，以及与完整存档及时间事件的组合；未接入实际存档。

## 魔法吸取权杖待验证

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_resource_spells.cpp`、`src/session_item_use.cpp`；说明见 `mana-steal.md`。包含本轮直线穿透及随机流快照的 Win32 Release 客户端编译通过。阶段检查目标选择／接近、魔法不足／上限、目标类型和魔免、次数／冷却、事件与回调、固定／比例数据、地图覆盖、联机及原版行为；部分自定义字段尚不支持。

## 直线穿透伤害待验证

路径：`src/session.h`、`src/session_destructables.cpp`、`src/session_projectiles.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮魔法吸取权杖与随机流快照的 Win32 Release 客户端编译通过。阶段检查刃车及自定义直线武器的零／非零扩散距离、宽度、单位与障碍、对象半径、死亡复活、回调和联机性能，对照原版命中顺序与伤害衰减。

## 会话随机流快照待验证

路径：`src/audio_random.h/.cpp`、`src/session.h`、`src/session_game.cpp`；说明见 `session-random-persistence.md`。包含本轮玩法改动的 Win32 Release 客户端编译通过。阶段检查主流和 45 条辅助流往返、后续序列、损坏／截断／非法状态的事务性拒绝、活动脚本与联机限制，以及和未来完整会话恢复的组合；尚未接入存档。

## 范围及弹跳武器伤害可破坏物待验证

路径：`src/combat.h`、`src/session.h`、`src/session_combat_destructable.cpp`、`src/session_projectiles.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮 JASS 快照及骰面处理的 Win32 Release 客户端编译通过。阶段检查炮击各范围与系数、单位和障碍混合命中、月刃弹跳目标／数量／衰减、死亡复活、伤害回调、地图覆盖、联机、性能及原版规则；直线扩散、武器被动和目标关系仍待完善。

## JASS 基础全局快照待验证

路径：`src/jass_runtime.h/.cpp`、`tests/jass_runtime_tests.cpp`；说明见 `jass-global-persistence.md`。客户端及新增测试目标编译通过；全局快照检查待运行。阶段执行 `war3_jass_runtime_tests`，检查基础类型、稀疏数组及 null／空字符串往返，损坏／截断／声明不匹配的事务性拒绝，非默认句柄报告和活动线程限制；接口尚未接入存档或关卡切换。

## 科技增加零骰面武器的骰子待验证

路径：`src/session_research.cpp`；说明见 `research.md`。包含本轮 JASS 快照和武器范围伤害的 Win32 Release 客户端编译通过。阶段检查零骰面武器研究前后、取消和新建单位，对单位及可破坏物的攻击、面板数值、联机及原版边界；当前一面骰处理是暂定规则。

## 战役英雄快捷栏预留待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_hero_bar.cpp`；说明见 `hero-shortcut-reservation.md`。包含本轮可破坏物攻击和提示滚动的 Win32 Release 客户端编译通过。阶段检查不死族资料片首关、共享控制英雄、空槽、鼠标和 F1–F7、创建／死亡／易主、预留值变化、联机及原版排序和默认值。

## 可破坏物武器攻击待验证

路径：`CMakeLists.txt`、`src/combat.h`、`src/entities.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`、`src/session_combat_destructable.cpp`、`src/session_destructables.cpp`、`src/session_projectiles.cpp`、`src/session_network_identity.cpp`；说明见 `destructable-weapon-attacks.md`。包含本轮英雄栏预留和提示滚动的 Win32 Release 客户端编译通过。阶段检查四族武器、门／障碍／树、前摇与弹道、目标失效及复活、命令取消和排队、联机、地图覆盖、原版伤害及性能；范围、弹跳、护甲及部分武器被动尚待完善。

## 提示文本滚动边界待验证

路径：`src/glue.h/.cpp`、`src/game_flow_ui.cpp`；说明见 `game-tips.md`。包含本轮英雄栏预留和可破坏物攻击的 Win32 Release 客户端编译通过。阶段检查短文本和多行文本的滚轮边界、切换提示、字体尺寸、中文与地图资源覆盖，并核对其他文本测量消费者。

## 主动攻击目标事件待验证

路径：`src/combat.h`、`src/session_combat_orders.cpp`、`src/session_combat.cpp`、`src/session_network_identity.cpp`；说明见 `combat-target-events.md`。包含本轮帮助页和可破坏物预选的 Win32 Release 客户端编译通过。阶段检查主动和自动目标、重复与切换命令、目标失效、回调取消／改派／注册、射程事件、联机及原版事件次序。

## 游戏内帮助页待验证

路径：`src/game_flow_ui.h/.cpp`；说明见 `game-help.md`。包含本轮主动攻击事件和可破坏物预选的 Win32 Release 客户端编译通过。阶段检查原版文本和中文编码、滚轮／滚动条／键盘、边界和变更、地图覆盖、窗口布局及原版对照。

## 可破坏物鼠标预选待验证

路径：`src/game_view.cpp`、`src/scene_objects.h/.cpp`；说明见 `preselection.md`。包含本轮帮助页和主动攻击事件的 Win32 Release 客户端编译通过。阶段检查树木及其他对象的显隐／破坏／移除、迷雾、镜头与鼠标移动、预选开关、大图帧耗时及原版外观。

## 游戏内提示页待验证

路径：`src/game_flow_ui.h/.cpp`；说明见 `game-tips.md`。包含本轮牺牲深渊和地面物品预选的 Win32 Release 客户端编译通过。阶段检查原版提示文本与编码、鼠标和 B／N 快捷键、首尾状态、切换与重新打开、地图资源覆盖、实际窗口及原版画面和行为。

## 地面物品鼠标预选待验证

路径：`src/game_view.cpp`；说明见 `preselection.md`。地面物品参与已有悬停采样与选择圈绘制；包含本轮牺牲深渊与提示页的 Win32 Release 客户端编译通过。阶段检查物品显隐／拾取／移除、迷雾、同时选中和悬停、鼠标／镜头移动、界面开关、大图性能及原版画面。

## 牺牲深渊与阴影待验证

路径：`CMakeLists.txt`、`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_sacrifice_pit.cpp`、`src/commerce.h`、`src/entities.h`、`src/session_production.cpp`、`src/session_food.cpp`、`src/session_callbacks.cpp`、`src/session_ownership.cpp`、`src/session_network_identity.cpp`；说明见 `sacrificial-pit.md`。包含本轮提示页和地面物品预选的 Win32 Release 客户端编译通过。阶段检查双方命令、接近与目标限制、生产及集结、多侍僧竞争、死亡／转让／禁用、人口不足、取消、无可用落点、脚本重入、联机和原版行为；自定义目标规则及原版事件时序尚未完成。

## 战役重开限制待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/game_flow_ui.cpp`；说明见 `restart-mission.md`。地图脚本开关控制 Esc 菜单重开动作；阶段检查开关、动态切换、鼠标／快捷键／焦点、脚本重开、切图、实际战役及原版行为。

## 加强型地洞科技视觉待验证

路径：`src/session_auras.cpp`；说明见 `research.md`。研究 Rorb 后显示源 Arbr 建筑模型，建筑失效及科技／能力变化时释放；阶段检查研究前后、地洞与箭塔、建筑完成／死亡／重生、转移、技能启停、自定义覆盖、实际窗口和原版模型表现。

## 女猎手哨兵待验证

路径：`src/spells.h`、`src/session.h`、`src/session_spell_info.cpp`、`src/session_control_spells.cpp`、`src/session_area_spells.cpp`、`src/session_stealth_reveal.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`、`src/game_view.cpp`、`src/lan_spell_orders.h`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`；说明见 `sentinel.md`。树木目标、飞行／盘旋视野与隐形侦测及树木销毁清理已接入；自研联机动作接入照明弹及哨兵树目标，包含模型镜头的 Win32 Release 客户端编译通过；阶段检查科技、冷却、施法事件、移动与模型、树木存活／摧毁／恢复、多哨兵、共享视野、地图覆盖、切图、联机、性能和原版一致性；数量限制及完整表现仍待实现。

## 地图脚本模型镜头待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/model.h/.cpp`、`src/model_pose.cpp`、`src/scene_streaming.h/.cpp`、`src/game_view.cpp`；说明见 `cinematic-camera-model.md`。脚本指定模型镜头使用后台可选加载和场景相机，重置后恢复；包含哨兵改动的 Win32 Release 客户端编译通过。阶段检查纯镜头模型、缺失／损坏、视锥与锚点、声音监听、重置、镜头脚本查询、切图、联机及原版画面；原版时序和部分脚本查询仍待完善。

## 迫击炮照明弹待验证

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_stealth_reveal.cpp`、`src/session_fog.cpp`、`src/session_visibility.cpp`；说明见 `flare.md`。`Afla` 点目标及科技前置接入现有施法，按源延迟产生视野与侦测；包含哨兵和模型镜头的 Win32 Release 客户端编译通过。阶段检查时间、冷却、地形边缘、重叠、共享视野、暂停、施法者死亡、地图覆盖、双端、实际画面及原版行为；闪烁与飞行画面尚未实现。

## 地图脚本界面按键待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_view.cpp`；说明见 `script-forced-ui.md`。`ForceUIKey` 和 `ForceUICancel` 通过有界队列进入已有界面与命令消费者；包含自动施法映射的 Win32 Release 客户端编译通过。阶段检查所有键值、重入、队列、焦点／暂停／菜单／过场、建造与技能模式、取消、实际教程、自定义地图、双端与回放；当前后续帧处理与原版同步调用时序不同。

## 默认自动施法原型映射待验证

路径：`src/session_entities.cpp`、`src/session_unit_forms.cpp`；说明见 `autocast-source.md`。单位默认自动施法匹配唯一同原型衍生能力，变形时继承唯一替换能力的开关；包含脚本界面按键改动的 Win32 Release 客户端编译通过。阶段检查 Reec 研究前后风暴之鸦、中立蛛网及亡者复生、开关／变形／撤销、脚本增删、自定义重复原型、技能可用性与联网，以及原版行为和性能；实际对局尚未执行。

## AI 对战减益施法待验证

路径：`src/session_ai_armies.cpp`；说明见 `ai.md`。电脑单位对当前合法战斗目标施放减速、诅咒和精灵之火，复用既有施法与命令恢复；实际对局、相同状态、自动施法、施法回调、目标脱离、联机、原版策略及大图性能待阶段验证。

## 鼠标预选待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/game_view.h/.cpp`；说明见 `preselection.md`。地图脚本控制单位悬停预选及反馈，复用绘制遍历和 50 毫秒采样，包含玩家暴露改动的 Win32 Release 客户端编译通过。阶段检查参数组合、单位移除／移动／显隐、镜头与窗口、选中事件、原版外观及大地图性能；物品和可破坏物预选尚未实现，实际窗口尚未执行。

## 对战玩家暴露视野待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/session_fog.cpp`；说明见 `player-exposure.md`。地图脚本记录玩家组快照并通过迷雾更新暴露玩家单位的视野，包含预选改动的 Win32 Release 客户端编译通过。阶段检查基地失守／重建、玩家组修改及销毁、重复开启与清除、单位创建／移动／死亡／转移、隐形、联盟、切图和联机，对照原版时序及范围；实际运行尚未执行。

## 脚本水面形变待验证

路径：`src/world.h`、`src/session_world.cpp`、`src/terrain_layout.cpp`、`src/terrain_scene.h/.cpp`；说明见 `water-deformation.md`。`SetWaterDeforms` 控制水面顶点随地形形变及关闭后恢复，水面高度查询与网格共用角点，Win32 Release 客户端编译通过。阶段检查默认值、形变和恢复、开关切换、可见性、边缘、切图、GPU、性能及原版公式；水面交互及原版规则未完成。

## 过场强制字幕待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_cinematic_panel.cpp`；说明见 `game-options.md`。地图脚本可强制显示过场对话字幕并恢复用户设置，Win32 Release 客户端编译通过。阶段检查字幕选项开／关、强制开／关切换、过场进行中切换、切图复位、静音和真实战役，比较原版；实际运行尚未执行。

## 地图脚本框选控制待验证

路径：`src/session.h`、`src/session_match.cpp`、`src/game_view.cpp`；说明见 `drag-selection.md`。脚本框选输入及选择框显示开关已接入单机和实验联机，Win32 Release 客户端编译通过。阶段检查四种参数组合、拖动阈值、单击／技能目标、选区切换、禁用期间拖动和恢复、菜单、切图及双端同步，并对照原版；实际窗口和原版行为尚未验证。

## 可行走模型后台预解析待验证

路径：`src/session.h`、`src/session_walkable_surface.cpp`、`src/game_loading.cpp`；说明见 `cliff-level.md`。后台载入阶段预解析最多 64 个不同的已放置可行走模型，运行查询复用会话缓存；失败记录日志并保留原按需路径。Win32 Release 客户端编译通过。阶段检查 BridgeTooNear 和无桥地图、重复／缺失／异常模型、超过 64 种、载入取消／重试、动态对象、切图释放及加载时间、首帧和内存；专项及性能测量尚未执行。

## 可行走模型共享表面高度待验证

路径：`src/walkable_geometry.h/.cpp`、`src/session_walkable_surface.cpp`、`src/session_destructables.cpp`、`src/session_world.cpp`、`src/terrain_scene.h`、`src/game_view.cpp`；说明见 `cliff-level.md`。会话按需读取模型并以动画三角面求高，`GetLocationZ` 与地面／两栖单位及部分跟随显示共享模型表面；覆盖构建消费已有模型表面。Win32 Release 客户端编译通过。阶段检查 BridgeTooNear、脚本与画面一致性、可见／隐藏／死亡／复活、动画和随机相位、旋转／缩放、桥面与地形／水面过渡、选择圈／特效／弹道、叠放对象变更、临时对象、模型缺失／切图释放、透明面及大图性能，并与原版对照。依赖对象后续变化的覆盖刷新和动态桥寻路尚未实现；专项及实际窗口尚未执行。

## 即时订单的物品目标待验证

路径：`src/session_inventory.cpp`；说明见 `instant-orders.md`。四个即时订单 native 已接入 `dropitem` 的点目标与单位目标，复用物品移动和转交，Win32 Release 客户端编译通过；其他即时订单仍待实现。阶段检查字符串／整数订单、点／单位／空及无效目标、物品权限和持有状态、路径、事件／回调、排队取消、自定义地图和原版时序；专项及实际地图尚未执行。

## 战斗目标事件待验证

路径：`src/combat.h`、`src/script_state.h`、`src/session.h`、`src/session_callbacks.cpp`、`src/session_combat.cpp`、`src/session_combat_orders.cpp`；说明见 `combat-target-events.md`。自动索敌和进入武器射程时分发单位目标事件及 `GetEventTargetUnit`，Win32 Release 客户端编译通过。阶段检查自动／主动攻击、目标进入／离开／重入、不同射程和目标、条件／过滤器、事件禁用／销毁、回调移除／变更命令、战斗与联机顺序、原版行为及大图性能；专项和实际地图尚未执行。

## 地形悬崖层级查询待验证

路径：`src/world.h`、`src/world_blight.cpp`、`src/session_blight.cpp`、`src/entities.h`、`src/session_destructables.cpp`；说明见 `cliff-level.md`。`GetTerrainCliffLevel` 已接入 W3E 地形及可行走可破坏物的稀疏覆盖层，Win32 Release 客户端编译通过；叠放表面高度、桥面寻路和原版细节仍待实现。阶段检查不同层级、网格边界、越界、坡道、异常坐标、纹理零格、桥梁生死／重叠／旋转、实际地图脚本、切图释放和原版动态覆盖；专项和原版运行对照尚未执行。

## 单机选择与地图交互输入入口待验证

路径：`src/player_commands.h/.cpp`、`src/game_view.h/.cpp`、`src/game_hero_bar.cpp`、`src/game_selection_panel.cpp`、`src/game_trackable.cpp`；说明见 `player-commands.md`。单机用户选择和交互模型事件接入玩家命令分发，脚本内部事件及联机时间片路径保持独立；Win32 Release 客户端编译通过。阶段验证普通／Shift／框选／编组／英雄及空闲工人、选择回调中移除或变更单位、交互模型进入／点击和对话／暂停、单机与联机顺序和实际窗口；原版操作及性能待对照。单机回放仍未实现。

## 地面物品与交互模型离屏附件待验证

路径：`src/game_view.cpp`、`src/game_trackable.cpp`；说明见 `effects.md`。地面物品与可交互模型在视口外推进已加载附件的可见性和子动画时钟，释放粒子并在重入视口时复用时钟；Win32 Release 客户端编译通过。阶段验证多层附件、出生／循环、视口边界、拾取／丢弃、删除、异步加载、暂停、切图释放和大量实例性能，比较原版画面。专项及实际窗口尚未执行。

## 幽灵变形免疫与建筑选址待验证

路径：`src/session.h`、`src/session_visibility.cpp`、`src/session_control_spells.cpp`、`src/session_morph_spells.cpp`、`src/session_construction.cpp`；说明见 `stealth-reveal.md`。Agho 的 DataB 接入变形目标及效果检查，DataC 接入建筑选址；Win32 Release 客户端编译通过。阶段验证字段覆盖、能力启停、弹道途中状态变化、建筑与地形阻挡、真实操作及原版行为；专项和运行对照尚未执行。

## 实验单位缓存同步分片待验证

路径：`src/lan_actions.h/.cpp`、`src/session_cache.cpp`、`src/lan_simulation.h/.cpp`、`src/lan_time_driver.h`、`src/lan_runtime.cpp`、`src/game_view.cpp`、`src/main.cpp`、`tests/game_flow_tests.cpp`；说明见 `cache-sync.md`。自研大快照分片接入发送、时间片预校验、有界重组和完整提交；Win32 Release 客户端及检查目标编译通过，两个定向模式通过，覆盖跨槽、多发送方、重复／乱序／缺片、超时和退出。阶段核对真实双端、回放、带宽、断线及缓存摘要；原版 `0x6e` 格式和互通仍待实现。

## 风步动态碰撞待验证

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`；说明见 `mobility.md`。风步与其他非建筑单位双向穿行，建筑和静态地形仍阻挡，状态终止恢复普通碰撞；Win32 Release 客户端及定向目标编译通过，windwalk 检查通过。阶段检查实际施法、淡入／到期、重叠脱离、多人同步、建筑与地形边界及原版行为和性能。

## 实验单位缓存同步待验证

路径：`src/lan_actions.h/.cpp`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`；说明见 `cache-sync.md`。自研 `0xf9` 动作接入单位快照的发送、校验和接收，缺失项保留 `0x73` 删除；Win32 Release 客户端与检查目标编译通过，定向会话检查通过，覆盖快照隔离、编解码、接收／删除、畸形／截断数据及 1449 字节边界。阶段核对单机自动回显、真实双端时间片和回放、配置期发送、字段与顺序及大快照；自研分片已接入；原版 `0x6e` 格式及原版互通仍待实现。

## 受阻目标寻路待验证

路径：`src/world_path.cpp`、`tests/world_tests.cpp`；说明见 `water-pathing.md`。目标格受阻且首候选直线不可达时，在既有预算内搜索附近可达落点；Win32 Release 客户端与 world 检查目标编译通过，隔墙复现 1 通过、0 失败。阶段检查各移动类型、单位半径、边界和复杂障碍、动态目标、预算耗尽及大地图性能，并与原版目标选点对照。

## 结算保存回放与原 FDF 待验证

路径：`src/game_flow_ui.cpp/.h`、`src/game_view.cpp/.h`、`src/main.cpp`、`src/replay_experimental.cpp/.h`、`src/fdf.cpp`、`src/glue.cpp/.h`、`tests/browser_tests.cpp`、`tests/native_tests.cpp`；说明见 `replay-experimental.md`。实验局域网录制可通过结算面板命名保存；单机录制与原版回放互通尚未实现。Win32 Release 客户端及浏览器检查目标编译通过，原 ScoreScreen FDF 挂接与绘制定向检查 1 通过、0 失败；`fdf_adjacent_quoted_frame_type` 尚未执行。阶段核对录制、输入／重名／失败重试、取消／自动保存、部分回放、关联地图、界面、播放及原版对照，并回归共享 FDF 与皮肤高亮解析。

## 中立建筑付费显形待验证

路径：`src/commerce.h`、`src/session_commerce.cpp`、`src/session_stealth_reveal.cpp`、`src/session.h`、`src/game_commands.cpp`、`src/game_view.cpp/.h`、`src/player_commands.cpp/.h`、`src/lan_actions.cpp`、`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`；说明见 `visibility.md`。Andt 已连接发起玩家、地图／小地图点选、源费用、临时视野及侦测、脚本中立点订单和实验联机命令。Win32 Release 客户端编译通过；阶段核对交互资格、资源／回调事件顺序、多个玩家、范围与持续时间、自定义能力、双端和原版玩法；新增实验协议需两端使用支持版本。

## AI 重复启动待验证

路径：`src/session_ai.cpp`；说明见 `ai.md`。已有 AI 时保持原策略与脚本线程；Win32 Release 客户端编译通过。阶段检查相同／不同策略和模式、暂停状态、回调期间重复调用、资源失败及其他玩家线程，并对照原版边界。专项尚未运行。

## 纠缠金矿即时全部卸载待验证

路径：`src/session.h`、`src/session_harvest.cpp`、`src/session_transport.cpp`；说明见 `transport.md`。`Adri` 即时全部卸载接入采矿工人清单与合法落点；Win32 Release 客户端编译通过。阶段检查满矿、部分落点受阻、技能禁用、容量与范围覆盖、订单回调重入、单个／全部卸载、实验联机及原版时序；尚未执行真实对局或原版对照。

## 战役跳过教程提示待验证

路径：`src/campaign_profile.h`、`src/campaign_browser.h/.cpp`；说明见 `campaign-flow.md`。ROC 战役选择接入教程状态、原本地化文案与确认操作；Win32 Release 客户端编译通过。阶段核对首项／其他战役、已完成／未完成、TFT、确认／取消及键鼠交互，检查脚本 `SetTutorialCleared`、跨会话持久化、保存失败和窗口布局，并与原版验证版本门控和触发条件；尚未执行窗口与原版对照。

## 纠缠金矿矿工面板与释放待验证

路径：`src/session.h`、`src/session_harvest.cpp`、`src/session_combat_orders.cpp`、`src/player_commands.cpp`、`src/lan_action_encoder.cpp`、`src/game_transport.cpp`；说明见 `transport.md`。矿工清单与容量读取现有采集状态和源能力，肖像点击连接单个释放及实验联机命令；Win32 Release 客户端编译通过。阶段核对多人采矿、容量与对象覆盖、落点受阻、矿井／矿工死亡和易主、命令回调重入、肖像操作、双客户端同步及原版界面；`IsUnitLoaded` 与装载事件的原版语义尚未核实。

## 月亮井水位待验证

路径：`src/entities.h`、`src/effects.h`、`src/session_restoration.cpp`、`src/session_food.cpp`、`src/game_effects.cpp`；说明见 `restoration.md`。水面模型及高度连接能力配置和实时魔法量，单位移除时回收效果；Win32 Release 客户端编译通过。阶段核对空／满魔法、种族和自定义模型、建造／升级／死亡／隐藏、能力更改、回调时序、句柄与联机同步、切图释放以及原版画面；真实运行与原版对照尚未执行。

## 结算队伍汇总待验证

路径：`src/game_flow_ui.cpp`；说明见 `game-flow.md`。按会话队伍汇总成员统计和资源交换；科技百分比采用成员平均。Win32 Release 客户端编译通过。阶段检查单人、同队与多队、零分及缺失分数、排序、不同窗口尺寸、长数字及最多 12 队布局，并与原版核对队伍名称、汇总规则和显示；实际窗口与原版对照尚未执行。

## 单位地面阴影待验证

路径：`src/game_effects.cpp`、`src/game_view.cpp`、`src/game_view.h`、`src/session.h`；说明见 `unit-shadows.md`。Win32 Release 客户端编译通过。阶段检查陆地、坡面、浅水和飞行单位的阴影，动态创建、死亡、隐藏、变形、迷雾、切图资源释放与大规模场景性能，并对照原版尺寸、偏移和透明度。建筑和地图静态阴影已接入分块缓存与合成；本次 Win32 Release 客户端编译通过。阶段核对 SHD 缺失、尺寸／灰度、静态与建筑重叠、建筑增删与移动后的局部缓存更新、自定义掩码及原版精度；实际运行和性能采样尚未执行。

## 结算资源交换待验证

路径：`src/game_flow_ui.cpp`；说明见 `game-flow.md`。资源页按黄金与木材分别展示转出／实际到账，排序使用两种资源收支总数。Win32 Release 客户端编译通过。阶段检查联盟交易、税率和零交易、多玩家、极值、队伍分组、升降序、各种分辨率和长数值显示，并对照原版的列定义、排序及布局；尚未执行窗口与原版验证。

## 脚本音频文件时长待验证

路径：`src/session_sound.cpp`、`tests/sound_tests.cpp`；说明见 `script-sound.md`。Win32 Release 客户端与 sound 目标增量编译通过，专项尚未执行。阶段执行 `war3_sound_tests.exe <data-root> <scratch-root>`，核对 WAV／MP3／MIDI 时长、地图同名覆盖、空路径／缺文件／损坏格式、大小写、静音／无设备、重复查询及缓存上限；在实际过场脚本中比较等待时间，并与原版时长和失败行为对照。仅对可解析归档成员返回实际时长，格式边界和原版精度尚未验收。

## 双恢复物品待验证

路径：`src/session.h`、`src/session_item_use.cpp`、`tests/control_tests.cpp`、`tests/generate-combined-item-fixture.py`；说明见 `combined-recovery-items.md`。Win32 Release 客户端和 control 目标编译通过；`item-combined` 最小检查 1 通过／0 失败，覆盖地图字段覆盖、一次费用／次数／事件、共享冷却、满生命／魔法、使用回调删物品、生命变化回调删物品并易主、未知组合拒绝，未加载 Game.dll。阶段继续核对符文、不同顺序／费用／范围／数量、地图自定义覆盖、事件重入／易主／死亡、双端同步与真实地图，并与原版比较费用、冷却和多能力派发；其他多主动组合尚未实现。

```powershell
python tests/generate-combined-item-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' --output '../../tmp/docs-artifacts/war3/combined-item/fixture.w3m'
./build/windows-x86/bin/Release/war3_control_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/combined-item/fixture.w3m' item-combined
```

## AI 防御与疾风步待验证

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`；说明见 `ai.md`。Win32 Release 客户端增量编译通过，专项尚未运行。阶段在对战夹具及实际对局检查近／远程交战、单位防御开启／关闭、狂暴费用与冷却、英雄低生命疾风步及撤退、技能禁用／暂停、目标切换、回调重入、双端同步和大地图性能；同原版比较决策和时序。当前距离与生命阈值属于实现策略。阶段需扩展 `tests/generate-ai-control-fixture.py` 和 `war3_ai_control_tests` 覆盖上述行为；原图 AI 初始化可使用 `war3_ai_tests <data-root> <map> [race] [seconds]`。

## 灵魂宝石待验证

路径：`src/entities.h`、`src/session.h`、`src/spells.h`、`src/session_soul.cpp`、`src/session_item_use.cpp`、`src/session_inventory.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_fog.cpp`、`src/session_callbacks.cpp`、`src/session_food.cpp`、`src/session_entities.cpp`、`src/session_network_identity.cpp`、`CMakeLists.txt`、`tests/control_tests.cpp`、`tests/generate-control-fixture.py`；说明见 `soul-gem.md`。Win32 Release 客户端与 control 目标编译通过，`item-soul` 最小检查 1 通过／0 失败，覆盖目标能力移除、脚本物品独立生命周期和携带者死亡；未加载 Game.dll。阶段核对施法与失效、物品转交／销毁、释放位置与路径、暂停修改、目标易主／死亡、回调重入、战争迷雾、敌方视野与原版时序；合并真实地图、双端和资源释放验证。

```powershell
python tests/generate-control-fixture.py --data-root 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' --output '../../tmp/docs-artifacts/war3/soul-gem/fixture.w3m'
./build/windows-x86/bin/Release/war3_control_tests.exe 'E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne' '../../tmp/docs-artifacts/war3/soul-gem/fixture.w3m' item-soul
```

## 结算页签与离屏附件动画待验证

路径：`src/game_flow_ui.h/.cpp`、`src/glue.cpp`、`src/model.h`、`src/model_particles.cpp`、`src/game_view.cpp`、`src/game_effects.cpp`；说明见 `game-flow.md` 和 `effects.md`。Win32 Release 客户端增量编译通过。阶段操作胜负结算，核对概况、单位／英雄／资源四页及原字符串、分数／科技计算、空英雄与多玩家、页签切换、不同窗口尺寸和原版画面；验证主菜单／选图／选项／对话框等 Glue 界面静态重复绘制与文字／位置变化后的布局，以及结算选中页签与性能；验证列头显示、鼠标和键盘排序、切换方向／页签及选中字体／同值顺序、队伍分组开关、玩家色及原版视觉指示；队伍汇总已接入并待对照，颜色筛选及单机回放录制仍待完成，资源交换列现展示黄金与木材转出／到账。核对视野内的离屏单位、特效、技能与武器弹道附件切回、模型切换、显隐、暂停、播放与声音同步、粒子重建、性能及原版画面；迷雾外与资源就绪前的历史尚未重建。窗口、GPU、声音、性能和原版对照待执行。

## 月亮石、荒芜指纹与结构化线程入口待验证

路径：`src/game_clock.h/.cpp`、`src/session_item_use.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_tick.cpp`、`src/session_network_identity.cpp`、`src/world.h/.cpp`、`src/world_blight.cpp`、`src/world_path.cpp`、`src/jass_runtime.h/.cpp`、`src/jass_threads.h/.cpp`、`src/session_callbacks.cpp`；测试目标 `war3_clock_tests`、`war3_consumption_tests`、`war3_blight_fingerprint_tests`、`war3_jass_thread_tests`。阶段核对月亮石实际消费、到期时间事件、重用、暂停、脚本设时及原版行为；核对 WPM／无 WPM 的写入、增删、地图切换和联机摘要；执行 JASS 入口、跨运行时、等待、取消及触发器回归。时间行为为实现假设，指纹有碰撞概率且不涵盖其他寻路位；Fiber、等待关系和宿主调用栈仍不可恢复存档。Win32 Release 客户端及四个相关测试目标编译通过；JASS 结构化入口、跨运行时归属、嵌套等待与取消的最小检查 4 通过、0 失败。阶段执行 `war3_blight_fingerprint_tests.exe`、`war3_jass_thread_tests.exe`；时钟命令见 `game-clock.md`，月亮石物品夹具使用 `consumption.md` 的夹具命令并将模式改为 `moon`。月亮石与荒芜专项、联机、真实对局及原版对照待执行。说明见 `moonstone.md`、`arcane-blight-items.md` 和 `save-runtime-foundation.md`。

## 抗魔、蛛网、荒芜物品及脚本执行状态待验证

路径：`session_item_use.cpp`、`session_spell_info.cpp`、`session_spells.cpp`、`session_area_spells.cpp`、`session_channels.cpp`、`spells.h`、`session_blight_items.cpp`、`session.h`、`session_tick.cpp`、`session_network_identity.cpp`、`CMakeLists.txt`、`jass_runtime.h/.cpp`、`tests/control_tests.cpp`、`tests/generate-control-fixture.py`、`tests/jass_thread_tests.cpp`；说明见 `arcane-blight-items.md` 和 `save-runtime-foundation.md`。阶段执行 control 夹具的 item-control／item-blight，核对费用、次数、目标、抗魔、蛛网、扩张／去除／覆盖／离开与联机；地表荒芜状态以增量指纹纳入实验联机摘要，需验证写入路径、碰撞限制及联机分歧；执行 JASS 线程专项，检查嵌套 native 回调、等待、取消、异常和诊断副本。Win32 Release 客户端与三个相关消费者已编译；JASS 核心改造的嵌套等待及 native 取消两项最小检查通过，0 失败。JASS 状态尚不能用于恢复存档；献祭头骨走近／中断、容量与回调重入、原版时序及真实对局尚未验证。

## 死亡与复活动画重启待验证

路径：`session_callbacks.cpp`、`session_corpses.cpp`、`session_effects.cpp`、`session_rebirth.cpp`、`session_revival.cpp`、`tests/corpse_tests.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端与 corpse 消费者已编译；阶段运行尸体夹具 animation-lifecycle，验证死亡／衰变／复活、凤凰和黑暗转换、回调重入、模型切换与实际过渡；其他停止／清理及离屏历史仍待实现或验证。

## 战斗、施法和工作动画重启待验证

路径：`session_combat.cpp`、`session_combat_orders.cpp`、`session_spells.cpp`、`session_channels.cpp`、`session_war_club.cpp`、`session_control_spells.cpp`、`session_eat_tree.cpp`、`session_faerie_dragon.cpp`、`session_locust.cpp`、`session_morph_spells.cpp`、`session_roots.cpp`、`session_spell_effects.cpp`、`session_spirit_split.cpp`、`session_teleport.cpp`、`session_tinker.cpp`、`session_unit_forms.cpp`、`session_unsummon.cpp`、`session_harvest.cpp`、`session_lumber.cpp`、`session_construction.cpp`、`session_building_upgrades.cpp`、`tests/channel_tests.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端及 channel 消费者已编译。阶段合并验证近远程连续攻击／追击中断、施法开始／结束／回调重入、技能形态及控制、采矿／连续砍树、建造／升级、普通循环、暂停与多个单位，并对照原版时序和 GPU 画面；死亡／复活、部分停止或状态清理及离屏历史仍待完成。专项与实际对局尚未执行。

## 默认混合与显式动画重启待验证

路径：`entities.h`、`session_orders.cpp`、`session_visual.cpp`、`session_animation.cpp`、`model.h/.cpp`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`game_view.cpp`、`game_effects.cpp`、`tests/game_flow_tests.cpp`；说明见 `animation-blending.md`。阶段验证 MODL 默认值、脚本覆盖／零值、显式同序列重启与普通循环、队列、暂停与倍率、多单位及挂点、全局动画轨、LookAt、混合中断和缓存一致性；验证大地图帧耗时／内存并对照原版。部分停止或状态清理及离屏历史仍待实现；Win32 Release 客户端和 game-flow 消费者已编译，专项和 GPU／原版对照尚未执行。

## 单位动画混合待验证

路径：`entities.h`、`session_visual.cpp`、`model.h`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`game_view.h/.cpp`、`game_morph.cpp`、`game_effects.cpp`；说明见 `animation-blending.md`。Win32 Release 客户端和 game-flow 消费者已编译；阶段验证 NightElfX01／OrcX01 实际脚本、零值与不同正值、多单位共享模型、骨骼位置／旋转／缩放、LookAt 与附件、变形／销毁、序列重入与频繁切换、暂停／倍率和性能，并与原版画面对照。部分停止或状态清理及离屏历史尚未实现；GPU、原版时序与完整战役尚未验证。

## 模型场景声音和可破坏物动画时钟待验证

路径：`scene_objects.h/.cpp`、`game_view.h/.cpp`、`game_model_sound.cpp`、`model_ui_audio.h`、`model.h`、`model_pose.cpp`、`sound.h/.cpp`、`main.cpp`、`loading_screen.h/.cpp`、`model_cinematic.h/.cpp`、`entities.h`、`session_animation.cpp`、`session_destructables.cpp`、`session_doodads.cpp`、`session_volcano.cpp`、`tests/game_flow_tests.cpp`。阶段合并验证菜单／载入／过场模型 SND、相机移动与音量／静音／场景切换、专用声音与 Scene 音轨；验证装饰物视野／离屏／隐藏／动态销毁与附件声、足迹、持续切图及大地图性能；执行 game-flow 夹具检查可破坏物动态创建、改速、冻结、恢复、动画重置与队列，并对照原版。界面 FPT 地表效果和离屏附件子动画时钟尚未实现；Win32 Release 客户端与 game-flow 消费者已编译，专项、真实音频及原版对照尚未执行。

## 菜单附件与场景附件声音待验证

路径：`main.cpp`、`loading_screen.h/.cpp`、`model_cinematic.h/.cpp`、`model.h`、`model_particles.cpp`、`game_model_sound.cpp`、`game_effects.cpp`、`game_view.cpp`；说明见 `effects.md`、`model-event-sounds.md`。Win32 Release 客户端已编译。阶段核对菜单／战役／载入／过场原模型附件、缺资源／设备恢复／生命周期和加载时间；核对单位／特效多层附件声音与脚印位置方向、多个实例、KATV、流式上传、离屏／迷雾、事件上限和切图，比较原版画面、听感与时序。界面 FPT 地表效果和离屏子动画时钟仍待实现。专项与实际窗口、声音、GPU 运行尚未执行。

## MDX 附件子模型待验证

路径：`model.h/.cpp`、`model_data.h`、`model_pose.cpp`、`model_particles.cpp`、`scene_assets.h/.cpp`；说明见 `effects.md`。阶段以 NEBirth 等原模型验证节点动画／KATV、Birth 与 Stand、多个父实例、嵌套与循环、队伍色、子粒子排空、缺失模型及纹理、异步移交／GPU 恢复／切图释放和性能，并对照原版画面。离屏子动画时钟仍待实现；Win32 Release 客户端已编译；专项及实际 GPU 画面尚未执行。

## 净化物品树木目标待验证

路径：`session.h`、`session_item_use.cpp`、`game_view.cpp`、`lan_action_encoder.cpp`、`lan_simulation.cpp`、`tests/generate-control-fixture.py`、`tests/control_tests.cpp`、`tests/order_queue_tests.cpp`；说明见 `targeted-spell-items.md`。阶段生成 control 夹具并运行 `war3_control_tests <data-root> <fixture> item-tree`，验证地图覆盖、目标筛选、技能事件和破坏物状态；合并 order-queue 验证两种报文及排队，实窗验证树与单位拾取、不可见／死亡／无效目标及双端同步。Win32 Release 客户端、control 与 order-queue 消费者已编译；专项、实际窗口和原版对照尚未执行。

## 黑暗转换及单位目标法术物品待验证

路径：`spells.h`、`entities.h`、`session_spell_info.cpp`、`session_control_spells.cpp`、`session_spell_effects.cpp`、`session_effects.cpp`、`session_unit_forms.cpp`、`session_spells.cpp`、`session_item_use.cpp`、`tests/control_tests.cpp`；说明见 `dark-conversion.md` 和 `targeted-spell-items.md`。阶段验证 ANdc／SNdc 的施法中断、种族筛选、转换时间、驱散／死亡／回调和僵尸归属；验证 thdm／schl／shtm 的目标、冷却／消耗、连续弹跳、光环、效果及联机。Win32 Release 客户端及 control 消费者已编译；专项、实际对局和原版对照尚未执行。

## 复活／操纵死尸卷轴与旋风魔杖待验证

路径：`session_spell_info.cpp`、`session_item_use.cpp`、`session_spells.cpp`、`tests/corpse_tests.cpp`、`tests/morph_tests.cpp`；说明见 `corpse-items.md`、`cyclone-wand.md`。阶段使用对应夹具验证复活保留句柄／人口、操纵死尸归属／无敌／时限／科技、范围及敌友／英雄、无尸体与物品消耗；验证旋风魔杖目标、3 次消耗、事件、持续／驱散、丢弃／死亡／中断、原版表现和多端同步。Win32 Release 客户端及 corpse／morph 消费者已编译；专项、实际对局及原版对照尚未执行。

## 保护卷轴与资源宝箱待验证

路径：`consumables.h`、`spells.h`、`session_consumables.cpp`、`session_item_use.cpp`、`tests/consumption_tests.cpp`、`tests/commerce_tests.cpp`；说明见 `protection-scroll.md`、`resource-powerups.md`。Win32 Release 客户端及两个相关消费者已编译。阶段检查 AIda／AIdb 范围、敌友／免疫、护甲叠加／驱散／到期、恢复上限、事件重入及地图覆盖；检查 AIgo／AIlu 拾取者归属、资源变化事件、物品消耗、上限／异常数值、召唤单位和多人同步；对照原版计分与资源维护费。专项、真实对局及原版对照尚未执行。

## 闪烁物品与单位头像皮肤待验证

路径：`session_item_use.cpp`、`session_spells.cpp`、`tests/mobility_tests.cpp`、`game_loading.h/.cpp`、`game_selection_panel.cpp`、`game_hero_bar.cpp`；说明见 `blink-items.md`、`selection-panel.md` 和 `hero-revival.md`。Win32 Release 客户端及 mobility 消费者已编译。阶段用 stealth 夹具及 `war3_mobility_tests <data-root> <fixture> blink-item` 验证点目标、最小／最大距离、落点、魔法／冷却／取消与使用事件；另验证 DotA 自定义跳刀、受伤后的限制、地图覆盖、原版行为及多人同步。实际窗口核对四族及地图皮肤、头像边框／高亮／英雄光效、生命与魔法比例、纹理缺失／加载、大小窗口、选择和快捷键、GPU 恢复及原版布局。上述专项、实际操作与原版对照尚未执行。

## 永久攻击伤害与达贡物品待验证

路径：`entities.h`、`script_state.h`、`session_entities.cpp`、`session_equipment.cpp`、`session_item_use.cpp`、`session_research.cpp`、`session_cache.cpp`、`spells.h`、`session_spell_info.cpp`、`session_spells.cpp`、`session_area_spells.cpp`、`session_lightning.cpp`、`tests/game_flow_tests.cpp`；说明见 `attack-damage-powerups.md`、`finger-of-death.md` 和 `campaign-gamecache.md`。Win32 Release 客户端及 game-flow 消费者已编译。为检查持久化兼容，`war3_game_flow_tests.exe <data-root> tmp/docs-artifacts/war3/game-flow/fixture.w3m cache-damage` 的隔离缓存检查通过：v4 正负值保存／重载／恢复与越界拒绝，以及无物品单位的 v1–v3 默认值；临时缓存位于 `tmp/docs-artifacts/war3/cache-damage/`。阶段验证正负 AIaa 拾取／消耗、非英雄、伤害及面板、变形／幻象、其他缓存组合；验证 ANfd 单位目标、地图自定义 Dagon 能力 ID、地图伤害事件、魔免、施法打断／回调重入、资源／次数／冷却、闪电和原版表现。DotA 实际物品操作、多人和原版对照尚未执行。

## 玩家自有单位商店待验证

路径：`session_commerce.cpp`、`tests/generate-commerce-fixture.py`、`tests/commerce_tests.cpp`，说明见 `commerce.md`。自有、具单位出售能力且不具中立交互能力的商店，按钮和实际购买在无附近买家时允许单位销售；仍检查库存、资源、科技和出生点并发出出售事件，买家为空。Win32 Release 客户端及 commerce 消费者已编译；阶段生成 commerce 夹具并检查按钮、扣费、库存、出售事件／空买家、非所有者、附带 Aneu、显式目标买家、物品与邻近买家；另实测 DotA `-sd` 选英雄、双端及原版语义。专项和实际玩家操作尚未执行。

上一提交 `e2c246c` 的 DotA 原图 main 与 600 秒静音模拟开发定位通过，无 Game.dll；日志 `tmp/docs-artifacts/war3/dota-develop-600s.log`。该检查不包含选英雄及游戏画面。

## DotA 稀疏闪电表与计分板标题待验证

路径：`session_lightning.cpp`、`game_multiboard.cpp`、`main.cpp`、`platform.cpp`，说明见 `ribbons-lightning.md`、`multiboard.md`。原图自定义闪电表的省略数值按零解析并在整表成功后发布；多列计分板标题按可见文字测量、截断、居中并绘制色码；开发模拟入口可分段推进至 600 秒。Win32 Release 客户端编译通过，DotA 原 main 及静音 180 秒模拟通过、无 Game.dll，日志 `tmp/docs-artifacts/war3/dota-sparse-lightning-180s.log`。阶段验证稀疏颜色／比例／噪声、空和损坏字段、缓存失败重试、源纹理和动画；实窗核对多段色码、颜色重置、中文／代理对、长标题截断、多个计分板及原版画面。上述专项、实际操作和原版对照尚未执行。

## DotA 计分板空英雄查询待验证

路径：`session_hero.cpp`、`session_inventory.cpp`、`tests/commerce_tests.cpp`。英雄等级／经验／技能点与物品栏空单位查询分别返回零或空物品，非零无效句柄仍报错。DotA 的计分板在玩家未选英雄时使用这些查询；Win32 Release 客户端与 commerce 消费者已编译，专项尚未执行。阶段验证空／非英雄／英雄／已销毁单位、库存变化、多人计分板和原版空句柄语义。

## ExecuteFunc 有返回值函数待验证

路径：`session_callbacks.cpp`、`tests/generate-thread-fixture.py`、`tests/session_thread_tests.cpp`，说明见 `script-threads.md`。Win32 Release 客户端与线程消费者已编译；DotA_v6.83d 的原 main 和静音 60 秒模拟通过，无 Game.dll，日志 `tmp/docs-artifacts/war3/dota-executefunc-60s.log`。阶段运行线程夹具并核对返回值丢弃、等待／唤醒、调用 VM、非法入口、回调上下文和原版时序；实际游戏、画面、玩家操作及原版对照尚未执行。

## 单位状态事件待验证

路径：script_state、session_callbacks、session_entities、session_tick、game_flow_tests、generate-game-flow-fixture、unit-state-events。单位状态阈值事件连接脚本写入、非致死生命变化与固定步补查。Win32 Release 客户端及专项程序增量编译通过；阶段先执行 `tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`，核对同一模拟步内跨越／恢复、死亡和触发器重入及原版时序；内部直接写入可能合并跨越，尚未实现全部即时语义。

## 脚本联盟查询待验证

路径：session_match、game_flow_tests、script-alliance。`IsPlayerAlly`／`IsPlayerEnemy` 和 `IsUnitAlly`／`IsUnitEnemy` 查询当前单向联盟状态；查询方向和无效对象分支已核对固定版原件的静态指令。Win32 Release 客户端与专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，核对非对称联盟、空对象、移除单位、事件重入及 DotA／WarChasers 实际脚本。

## 传送门拥堵与落点搜索待验证

路径：entities、session_waygate、session_summons、session_network_identity、waygate_tests、waygates。每步限制传送搜索数量，阻塞后按单位延迟重试；召唤／传送落点直接检查候选格通行，不对同一坐标执行寻路。Win32 Release 客户端与专项程序增量编译通过，专项尚未执行；阶段运行 `war3_waygate_tests.exe <data-root> <BootyBay.w3m>`，合并验证多门与高并发公平性、遮挡释放／区域离开、目标变更、回调重入、非地面移动类型、召唤能力、双端摘要和实际帧耗时。

## 地图传送门待验证

路径：session_waygate、entities、session、session_entities、session_combat_orders、session_tick、session_network_identity、waygate_tests、waygates。脚本设置目标和启用状态，单位可经真实移动或目标命令进入门并传送到合法位置；空间候选、回调重入与实验联机状态摘要已接入。Win32 Release 客户端和专项程序增量编译通过；阶段运行 `war3_waygate_tests.exe <data-root> <BootyBay.w3m>`，并验证原版 WarChasers 脚本初始化、真实右键、双向门、目标阻挡／拥挤、脚本事件重入、单位生命周期、双端与回放、实际性能及原版时序。地图 units.doo 的门目标区域编号尚未直接消费，原版运行时是否依赖该字段仍待确认。

## 脚本单位动画属性待验证

路径：entities、session_visual、game_flow_tests、campaign-cinematics。`AddUnitAnimationProperties` 修改单位的动画属性，并由场景模型、附件和动画队列选择消费；支持大小写、属性组合与源 Alternate 属性移除。Win32 Release 客户端和专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，并核对 DotA upgrade／alternate 调用、单位变形、重复添加移除、显式动画序号与原版模型画面。

## 过滤单位事件待验证

路径：session_callbacks、generate-game-flow-fixture、game_flow_tests、filtered-unit-events。TriggerRegisterFilterUnitEvent 复用单位事件派发、过滤表达式和触发上下文，专项包含允许／拒绝、事件上下文和无关单位。Win32 Release 客户端及专项程序增量编译通过；阶段先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>`，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m>`；合并核对事件类型、过滤器与触发器销毁／重入及原版行为。

## 单位与编组脚本入口待验证

路径：session_collections、session_entities、session_game、game_flow_tests、campaign-flow。类型及地点范围的计数枚举复用现有编组筛选；按名称创建单位、技能等级增减、默认索敌范围及物品无敌查询连接实际状态。Win32 Release 客户端与专项程序增量编译通过；新增专项未执行，阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 验证，并核对 DotA marketplace 枚举、过滤器重入、数量边界、名称／自定义 ID、能力上限和原版语义。

## 脚本技能特效与声音查询待验证

路径：session_effects、spell_tests、effects。技能 ID 和字符串查询源特效／声音配置，坐标、地点及目标形式的 AddSpellEffect 创建实际特效并由现有效果生命周期处理；索引越界和默认类型已按原件静态证据处理。Win32 Release 客户端及专项程序增量编译通过；阶段按 spells.md 的夹具及 war3_spell_tests 命令验证，并核对多项资源、地图覆盖、未知 ID／类型／索引、空字段、目标挂点、销毁及原版返回语义、实际画面和声音路径。

## 自研联机关卡切换边界待验证

路径：session_campaign、session_match、lan-experimental-flow、game-flow。实验联机和实验回放执行 ChangeLevel／RestartGame 时明确报告未支持，避免暂停共享模拟后静默丢弃切关或重开请求；单机流程沿用原有入口。Win32 Release 产品增量编译通过。待阶段验证真实双端、回放和单机流程及错误传播；多人会话重开、跨关、缓存同步与原版行为仍待实现。

## 自研联机 EndGame 待验证

路径：session_match／session、lan_simulation／lan_runtime、game_view、main、game_flow_tests 与 generate-game-flow-fixture.py。实验会话的 EndGame 记录本机离开及结算意图，不暂停共享模拟；对话框回调按触发玩家定位，GetLocalPlayer 分支按各端执行；回放丢弃本机离开意图。Win32 Release 产品和专项程序增量编译通过，夹具生成脚本语法检查通过；新增专项尚未执行。阶段先执行 `python tests/generate-game-flow-fixture.py --data-root <data-root>` 更新临时夹具，再执行 `war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。合并验证原胜利／失败对话框、Skip 分支、普通／Quit 按钮回调、等待纤程、main 初始化、同时退出／先前退出／事件重入、对话框回调内非点击者本地分支、真实双端与回放、结算及原版时序。多人 RestartGame／ChangeLevel 仍待实现。

## 自研联机脚本退出按钮待验证

路径：session_script_dialogs、lan_action_encoder／lan_simulation／lan_runtime、game_flow_ui／game_view、main、game_flow_tests。QuitButton 的脚本事件在各端消费，只有点击者请求离开；等待有序离开和回放记录后按 doScoreScreen 决定显示本机结算或返回 LAN。房主离开结束房间并保存部分回放，回放播放只执行事件。Win32 Release 产品及专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。集中验证房主／非主机、有／无结算、鼠标／快捷键、回放、双端与第三方玩家继续运行、离开回显顺序、最小化／过场／断线、重复点击及与菜单退出交错、事件重入和脚本自行 EndGame，以及原版时序与界面。

## 自研联机脚本对话框待验证

路径：session／session_script_dialogs／session_network_identity、game_state、game_flow_ui／game_view、lan_actions／lan_action_encoder／lan_simulation、game_flow_tests。普通 Dialog/Button 点击按玩家和显示轮次进入实验时间片，双方通过会话事件消费者执行；本地显示与重复点击去重独立，UI 句柄使用独立对象序号。QuitButton 支持点击者离开及可选本机结算，F10 可打开对局菜单。Win32 Release 产品和专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_game_flow_tests.exe <data-root> <fixture.w3m> lan-dialog`。集中验证两端仅本地显示、快捷键／鼠标／退出入口、重复与延迟／重显／切换对话框、同步销毁／清除／触发器重入、回放、多端及原版时序。必须覆盖各端 UI 对象创建顺序或按钮热键不同的限制；不支持非同步创建的任意 UI，也不证明原版协议互通。

## 自研联机建筑取消与英雄复活待验证

路径：lan_actions、lan_action_encoder／lan_simulation、session_network_identity、game_view、revival_tests。实验对局支持选中建筑的施工取消及按升级票号取消、祭坛复活和中立酒馆唤醒；复活请求携带死亡轮次并在消费时复核，状态摘要包含死亡／归属轮次、施工状态及升级票号。Win32 Release 产品及专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_revival_tests.exe <data-root> <fixture.w3m> lan-revival`。集中验证多选与 Esc、施工完成／升级替换、祭坛与酒馆权限／资源／附近买家、英雄复活后再次死亡／易主／移除、时间片事件重入、多端／回放及原版行为与协议。

## 自研联机单位操作待验证

路径：lan_actions、lan_action_encoder／lan_local_identity／lan_simulation、order_queue_tests。实验对局中的技能与修理自动施法开关、英雄学习、资源返还和指定乘员卸载已连接明确单位身份及会话命令；训练／研究／英雄复活的队列取消按建筑身份及 64 位任务票号消费，票号与全局计数进入状态摘要，训练／研究／复活／建筑升级及反召唤在票号耗尽时不再创建新任务；Win32 Release 产品和专项程序增量编译通过。新增专项尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。合并验证同类型多选、热键与鼠标、启停连续输入、技能／等级／资源条件、普通与尸体货舱、消失／易主／死亡／失选／转移、脚本事件重入、队列项前移／同类型替换／重复取消、研究／复活和票号耗尽、状态摘要及多端／回放／原版协议和界面行为。

## 自研联机生产与物品身份待验证

路径：lan_actions、lan_action_encoder／lan_simulation、game_view、order_queue_tests。实验对局为生产与物品动作传递明确单位和物品身份，消费时检查选区／权限／归属；同类型多选可指定高亮单位。失效子组及已转移或移除的物品跳过，未知对象拒绝；被拒绝的本地网络命令保留对局并记录原因。Win32 Release 产品与专项程序增量编译通过；新增专项尚未执行，阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。集中验证多选训练／研究／升级／建筑放置、物品即时／点／单位使用与换格／转交／丢弃、Shift、槽位替换、失选／易主／移除及回调重入、畸形报文、双端／回放与原版行为。原版队列协议仍待实现。

## 自研联机多单位技能待验证

路径：lan_actions、lan_action_encoder／lan_simulation、game_spells、order_queue_tests。实验对局将明确能力、目标、队列与首成功配置及有序候选放入单个私有时间片动作，交由实际会话施法；新增专项检查仅编译，尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。阶段合并验证即时／点／单位和可破坏物目标、Channel 全部／首成功、候选优先顺序、队列满与前置失败、触发器删除／易主／选区变化、畸形报文、双端及回放、断线和原版动作／语义。原版网络互通与完整技能行为仍未完成。

## 自研联机普通子组命令待验证

路径：game_flow_ui／game_view、lan_action_encoder／lan_simulation、order_queue_tests。实验联机启用子组选项，Ctrl 筛选高亮类型，将子组和普通移动／攻击／巡逻／目标／停止／保持命令写入有序时间片并由各端筛选执行；原版队列协议仍待实现。Win32 Release 产品和专项程序增量编译通过，新增专项尚未执行；阶段命令：`war3_order_queue_tests.exe <data-root> <BootyBay.w3m>`。阶段合并验证同／异类型多选、Ctrl 鼠标／热键／小地图、Shift 排队、选区变化与共享控制、双端／回放、UI 设置持久化及原版动作和行为。

## 自研联机菜单主动离开待验证

路径：game_flow_ui／game_view、main、lan_runtime／lan_host／lan_join、lan_departure_tests／revival_tests。非主机菜单退出按序发送待发动作和离开请求，等待本地消费离开事件并记录回放后关闭；房主退出结束房间并保存部分回放。Win32 Release 增量编译通过；`war3_lan_departure_tests.exe` 和 `war3_revival_tests.exe <data-root> <fixture.w3m> lan-leave` 各 1 通过／0 失败。待阶段合并验证实际游戏菜单、房主／非主机退出、最小化／过场、离开等待期间脚本结束对局、回放与跨机器双端、多片选区同步、超时及资源释放；原版协议和主机迁移尚未完成。

## 自研联机非主机离开待验证

路径：lan_host／lan_join、lan_actions／lan_simulation、lan_setup／session_collections、revival_tests 和 lan_departure_tests。实验对局的非主机断线在主机时间片中触发一次地图玩家离开事件，剩余客户端继续；活动选区同步参与者和校验等待随离开更新。Win32 Release 产品及专项编译通过；`war3_revival_tests.exe <data-root> <fixture.w3m> lan-leave` 和 `war3_lan_departure_tests.exe` 各 1 通过／0 失败，分别覆盖地图离开事件／等待中的选区同步／伪造与重复动作，以及本机两条客户端连接、256 个未比较时间片、溢出动作 FIFO 和先前动作／离开次序。原版离开协议及主机迁移仍待实现。待合并验证真实游戏双端／多端与回放、胜负脚本、离开时多片选区同步／暂停／最小化、异常数据／连接超时、完整输入顺序、连续离开及内存资源释放；断线后被接纳动作以主机解析顺序为准，缓冲超限可能丢弃未接纳输入。

## 自研联机商店交易待验证

路径：lan_actions／lan_action_encoder／lan_runtime／lan_simulation、session_network_identity、revival_tests 与 fixture。自研对局按时间片传递商店对象、商品和类别，消费真实购买、库存、买家、资源、人口及事件；已移除商店和消费前失效的交易跳过，未知身份拒绝。Win32 Release 产品和专项编译通过；`war3_revival_tests.exe <data-root> <fixture.w3m> lan-purchase` 最小检查 1 通过／0 失败，覆盖物品／单位购买、在途改选、同片／跨片移除、未知身份与经典解析拒绝。阶段合并双端与回放、同片多玩家竞购和补货、目标／买家删除与易主、资源／人口不足、选区／触发器回调变化、无效／伪造报文与断线；原版商店协议和对象编号尚未实现或对照。

## 酒馆唤醒待验证

路径：session_revival／session_commerce、player_commands／game_commands、lan_action_encoder／lan_local_identity／lan_simulation、revival_tests。`Aawa` 四槽即时唤醒接入资源／人口／附近买家检查、原英雄恢复和中立订单；自研联机按目标身份发送。Win32 Release 产品及专项目标编译通过；复活夹具 `awaken` 模式最小检查 1 通过／0 失败，覆盖原句柄、费用／人口／恢复、回调递归阻断及价格变化退款，无 Game.dll。命令：`war3_revival_tests.exe <data-root> <fixture.w3m> awaken`。待合并验证四槽顺序与按钮布局、原版单人／多人命令、源费用舍入／自定义覆盖、队列冲突、库存、资源变化与目标订单／复活事件重入、失效退款、空间阻挡、英雄死亡／转让／物品、音效与实际窗口；真实双端／回放及原版协议互通尚未验证。

## 维护费后采金统计待验证

路径：game_state、session_harvest、session_match。采金时累计维护费后的入账值，`GetPlayerScore(PLAYER_SCORE_GOLD_MINED_UPKEEP)` 读取该统计。原版 Game.dll 1.27 的 `GetPlayerScore` 入口 `0x6f1e3d90`：类别 10 相加类别 11 和 12 对应的两个查询，类别 11 单独读取前者；两个原版查询均对内部计数除以 10；当前沿用整数采集结算后累计，分数累计精度仍待对照。原始指令保存在 `tmp/docs-artifacts/war3/player-score/get-player-score.txt`。Win32 Release 产品增量编译通过。待合并验证无维护费／低高维护费、等级变化、资源上限、多人及脚本查询，并与原版统计和结算对照；科技百分比与总分等其他类别仍待实现。

## 自研选择同步屏障待验证

路径：jass_threads／jass_runtime、session_collections／session_threads／session_tick、lan_actions／lan_simulation／lan_runtime／lan_setup／map_preparation、game_view／main／replay_preparation。实验联机分块同步全部人类玩家的选择快照，挂起当前 JASS 纤程直至同轮分片齐全；回放消费记录，单机保持原有路径。同步屏障未完成或分片待发时阻断后续本地输入，连续发送受阻 15 秒中断连接；Win32 Release 增量编译通过。操作：合并验证地图 main／触发器调用、并发／嵌套调用、子线程继承、空选区和跨多个分片、已删除单位、普通选择与脚本本地选择交错、取消／暂停、断线／缺片／超时、畸形／重叠／重复报文、队列背压、后续命令排序和预算，以及双端／回放结果一致性。原版同步协议、不同本地分支调用顺序及脚本本地选择的实时命令同步仍待完成或对照。

## 自动选区与自研联机待验证

路径：session_collections／session_transport／session_lava_spawn／session_spirit_split／session_ownership、session。登船、炎魔分裂及龙卷风接管／返还选区时，同步更新已确认的各玩家选区和本地选中标志，避免后续网络命令使用不同选区；自动变化不额外触发选择事件。Win32 Release 增量编译通过。操作：同构建双端选择本方／共享单位，登船与吞噬、炎魔分裂、龙卷风创建／结束后立即下达命令，比较选区、事件与状态；覆盖选择回调重入、死亡／移除／易主、断线、回放及多玩家选择同一单位。骑乘合体、下骑和占据成功由所有者已确认选区接续，并在各会话执行选择事件；需合并验证多输入／输出、共享玩家、回调重入和后续命令。元素分身出生、成员生成、回收及全部创建失败已接续各玩家已确认选区；合并验证出生期间改选、多个玩家分别选择成员、死亡／易主及选择事件。脚本 SelectUnit／ClearSelection 的实时命令选区跨端同步仍待完成；同步快照见上方屏障待测项，自动选择规则与原版一致性待对照。

## 自研对局聊天与回放待验证

路径：lan_actions／lan_runtime／lan_simulation／lan_match_loading、game_view、session_text／session_spatial_events。实验对局将全体聊天作为有序私有动作发送与回放，按玩家触发 JASS 聊天事件并显示给所有本地视角；经典动作解析默认拒绝私有动作。Win32 Release 增量编译通过。操作：同构建双端互发中英文、长消息、并发输入与选择确认，验证精确／子串触发、玩家身份和脚本状态；录制回放并对照时间片、触发及显示；覆盖空串／非法长度／控制字节、损坏包、失败保留输入、排队和断线。原版协议及真实双端行为尚待完成或验证。

全体／盟友／观察者频道已接入单机及实验时间片、会话接收范围和回放；Enter、Shift+Enter、Ctrl+Enter 分别打开盟友、全体、观察者输入，输入结束前处理同帧文字，聊天开启时 Esc 优先关闭聊天。消息按字面绘制，对非 UTF-8 玩家名进行本地显示替换。Win32 Release 增量编译通过。待合并验证三频道／单向联盟和变化时机／观察者、输入快捷键与中文或代理项边界、同帧 Enter／Esc／目标模式、非 UTF-8 名称、脚本回调和多端／回放一致性；频道行为和原版 UI 尚待对照。频道不提供消息保密。

## 地表特效音频隔离待验证

路径：session_effects／session_sound、session、game_view。地表特效的源声音标签进入有界本地呈现队列，音频设备或资源异常在 GameView 记录，不阻断地图脚本和特效句柄创建。操作：使用地图覆盖的非空 Sound 标签创建特效，合并检查静音／无设备／缺资源、多个同时播放、队列上限、暂停／切图及多人同步；对照声音位置、时机、声道及随机变化。Win32 Release 增量编译通过；实际运行及原版听感待功能阶段验收。

## 物品、攻击增强及持续施法音效待验证

路径：session_consumables／session_item_use／session_projectiles／session_sound、sound、game_view。直接生效物品、消耗品和攻击增强发射接入有界一次性声音队列；持续施法按能力、效果别名与 Buff 读取循环音效，在本地跟随单位，并在中断、暂停、退出或不可见时释放。Win32 Release 增量编译通过。操作：合并验证物品与技能成功／失败、重复播放、持续施法完成／打断／死亡／迷雾、移动、暂停恢复、切图、多施法者及音频异常；对照原版位置、时序、听感与联机同步。非通道持续增益和地面残留音效尚需补齐；实际运行及原版一致性待功能阶段验收。

## 自研回放生命周期与视角待验证

路径：replay_experimental、main、game_view。记录录制端 peer 并在加载时恢复；过场期间继续处理时间片，回放中禁用联盟输入；退出收尾尝试保存已记录时间片，断线／窗口关闭及录制异常的前缀使用 partial 文件名。Win32 Release 增量编译通过。操作：以主机及加入端分别录制包含 GetLocalPlayer 分支和过场的对局，比较重放状态和画面；覆盖录像资源超限、异常、窗口关闭、硬终止、无完整片、保存失败、最小化与暂停、回放后返回。原版回放编号与真实对局一致性仍待实现或验证。

## 自研局域网回放闭环待验证

路径：replay_experimental／replay_browser／replay_preparation／replay_runtime、lan_host／lan_join、game_view、main 与 CMake。自研同构建 LAN 对局记录已应用时间片，离场保存用户目录，并经单人回放界面进入地图准备和只读播放。Win32 Release 增量编译通过；未运行双端、录制或播放验收。

操作：同一构建双端选图进入对局，执行选择／编组／移动／技能／过场 Esc，正常退出及断线后检查用户回放文件，再从回放列表播放、暂停、调整镜头并退出；对照各时间片状态与随机数。合并验证文件名冲突、录制失败、退出／切图／最小化、缺图／改图、不同构建、异常记录、内存预算和资源释放。记录不含离开、结算与校验；自研聊天动作见上方待测项。网络下载地图必须在本机同路径存在；原版对象编号和回放互通尚未实现。

## AI 控制与终极技能待验证

路径：session_ai_armies。电脑玩家对合法可见敌人使用吸取、控制、末日、点金和醉酒云雾，并按战况选择已有英雄终极技能。Win32 Release 增量编译通过。操作：四族实战中构造英雄／建筑／魔免／召唤目标及受伤友军，观察费用、效果、通道取消、归属／死亡回调及战斗恢复；合并运行 AI 与施法会话检查。原版选目标规则、阈值、多人同步和长局性能待阶段验证。

## 施法一次性音效待验证

路径：session_sound／session_area_spells／session_self_spells／session_militia、game_view。常规释放、即时自身技能及警钟发出有界本地声音事件，由 GameView 播放源 Effectsound，设备或资源异常记录日志而不改变模拟。Win32 Release 增量编译通过。操作：比较可见和离屏单位、静音／无设备、坏标签、暂停、切图、同时施法及双客户端同步；核对位置、释放时序和模型音效重叠。物品、攻击增强和循环音效的新增范围见上方待测项。

## 联机与回放 Esc 动作待验证

路径：lan_actions、lan_action_encoder、lan_simulation。经典 0x61 经时间片触发对应玩家的过场结束事件，联机输入通过编码发送。Win32 Release 增量编译通过。操作：双端或回放中注册不同玩家的 Esc 事件，分别在过场、有控制权、无监听及回调嵌套时按 Esc；检查仅目标玩家触发、事件顺序和取消／退出。原版动作发送条件、联机互通及回放入口待验证。

## AI 战斗辅助技能待验证

路径：session_ai_armies。电脑单位接入范围驱散、治疗守卫、静止陷阱、吼叫、沉默、镜像和蝗虫群决策。Win32 Release 增量编译通过。操作：在四族对战中构造有益／有害增益、受伤友军及可见敌军，观察实际技能效果、资源消耗和命令恢复；合并 AI 与技能会话检查。原版目标优先级、候选阈值、事件重入、伤害／魔免、群体持续作战与性能、联机及真实对局尚待验证。

## 模型全局序列声音事件待验证

路径：model_particles、model-event-sounds。模型 SND／FPT 全局序列按实例全局时钟消费，暂停不重复触发，跨周期事件有限处理。Win32 Release 增量编译通过。操作：使用含全局序列事件的模型，检查首次激活、暂停、动画切换、跨多个周期、跳帧、姿态、离屏与切图释放；原版时序、位置及异常全局序列待对照，实际运行尚未验证。

## 经典回放／联机编组动作待验证

路径：lan_actions、lan_simulation。经典 0x17／0x18 编组动作接入编码／解码与时间片选区，Win32 Release 增量编译通过；操作：构造编组、切换及随后移动／施法，合并检查同时间片、玩家隔离、死亡／易主／迷雾、事件重入、无效报文与对象映射。原版对象 ID、附加字节语义、实际回放和原版互通尚未验证。

## 一次性模型和能力声音变化待验证

路径：sound、model-event-sounds。源 FileNames 的多声音文件及 RANDOMPITCH 接入一次性播放，本地随机状态不参与对局模拟。Win32 Release 增量编译通过。操作：播放带多文件与不同音高的模型脚步、死亡及 BlizzardWave／RainOfFireWave 能力声音，检查可选文件、音量／音高／空间距离、静音和切图回收；合并运行声音模块检查。随机分布、音高公式、设备听感和多人确定性仍需原版对照及阶段验证。

## AI 友军辅助技能待验证

路径：session_ai_armies。电脑单位为空闲或战斗状态下的合法友军选择治疗、回春、驱魔、雕像生命／魔法恢复，以及交战增益，并沿用实际施法入口及战斗恢复流程。Win32 Release 增量编译通过。集中验证敌我／可见性、技能目标和增益限制、魔法／冷却／科技／禁用、自动施法开关、战斗与移动中断、死亡／易主／回调重入、选取顺序、多单位性能、多人同步及四族原版 AI 行为。操作：加载含四族电脑的对战地图，构造受伤／被攻击的友军并观察施法、打断和资源变化；合并运行相关 AI 与技能会话检查。阈值为当前策略，实际对局与原版一致性尚未验收。

## 特效与弹道的模型声音事件待验证

路径：game_effects、game_view／game_model_sound。视野内特效、武器／技能弹道及波形按实例推进源模型声音事件，视口内外共用独立声音时间线；离开场景时释放实例。Win32 Release 产品增量编译通过。集中验证原版声源／音量／事件时序、镜头切换、动画序列变化、弹道消失、迷雾与暂停、切图清理和大量弹道性能。原版一致性与实际运行尚未验证。

## 人族农民／民兵征召阶段待验证

路径：session_militia、session_spell_info／spells／ability_commands、entities、session_orders／combat_orders／tick 和 CMake。接入源能力数据、主城警钟、前往城镇大厅转换、民兵持续时间／自动返程及普通命令中断；矿内采集单位允许参与征召。Win32 Release 产品增量编译通过；实际运行和原版一致性未验收。

大厅失效时清理征召路线及命令，警钟群体派令时遇到脚本改变主城命令或警钟状态会停止旧派令。集中验证原版主城及单位能力、UI 反向按钮和命令、45 秒计时起点／暂停／到期、无大厅／拥堵／死亡／易主／中断、采矿与携带资源、变形的生命与人口、脚本回调重入、地图能力覆盖、AI 和联机同步。开启警钟按源标签播放音效，该接入的 Win32 Release 增量编译通过，反向操作和播放时序需对照；自定义魔法、冷却及科技前置在各类命令中的语义待实现和验证。

## AI 战斗施法阶段待验证

路径：session_ai、session_ai_armies、session。电脑玩家战斗心跳选择范围内的已支持攻击技能及低生命友军治疗，并接入现有施法流程；正常完成时符合条件才恢复战斗命令，取消和中断不保证恢复。Win32 Release 产品增量编译通过，运行尚未验证。集中验证敌我和可见性、各族英雄及单位目标／点目标／范围技能、治疗优先级、无效目标、魔法／冷却／前置／禁用、攻击前摇／移动／撤退／运输和施法打断、脚本事件重入／单位销毁及归属变化、持续战斗性能及原版 AI 行为对照。无攻击目标的辅助技能和完整策略继续实现。

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

集中验证面板接受／取消与脚本重入、玩家离开、联盟变化事件和共享视野生效、原版强制联盟／地图锁／隐藏规则及视觉一致性；共享单位控制基础消费已接入并另列阶段待测；共同胜利开关已接入并另列阶段待测；局域网同步尚待实现。

## 共享单位控制阶段待验证

路径：session_match／session_ability_commands／session_commerce／game_view／game_commands／game_spells／game_transport／game_alliance_dialog。Win32 Release 编译通过；BootyBay 会话最小检查权限方向、撤销、高级控制和按单位拥有者检查建造资金通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实面板勾选／取消、框选／多单位下令、施法／建造／生产／研究／修理／货舱、授权撤销时目标和队列、原版普通／高级共享对英雄／物品／商店的权限和费用，及多客户端同步。

## 共同胜利阶段待验证

路径：game_alliance_dialog／game_view／session_match。Win32 Release 产品编译通过；BootyBay 最小会话检查状态开关通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实面板接受／取消、原版状态初值／W3I 势力与锁定、脚本事件重入及近战胜负判定、多客户端同步。

## 玩家地面命令入口阶段待验证

路径：player_commands／game_view／game_commands。Win32 Release 产品编译通过；BootyBay 最小会话检查共享单位保持命令及无权限命令拒绝通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实鼠标／热键、移动／攻击移动／巡逻／建筑集结／停止／保持、多选顺序、重入移除与授权撤销、事件顺序及与原先单机行为一致性；其他命令、网络锁步与跨客户端同步待实现。

## 玩家目标命令与施法入口阶段待验证

路径：player_commands／game_view／game_spells。Win32 Release 产品编译通过；BootyBay 最小会话检查目标订单、空目标拒绝、共享单位无目标施法通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证实际鼠标／技能输入、单位／物品／可破坏物目标、点目标／即时施法、多单位 Channel、权限撤销与脚本重入、原版事件顺序和单机行为；跨客户端命令队列及网络仍待实现。

## 局域网房间发现阶段待验证

路径：lan_discovery／lan_browser／main。Win32 Release 产品编译通过；本机模拟 UDP 主机的搜索及响应、有效／截断 GAMEINFO、主菜单局域网按钮及原 FDF 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-probe/。

集中验证实际 1.27 主机、多网卡／广播／端口占用、房间上线变化／过期、错误恢复、中文名称与键盘鼠标、原版界面；加入大厅及本地地图字段比较已接入并另列待测；创建大厅已另列待测；地图就绪及双客户端对局同步尚未实现。

## 局域网加入大厅与地图核对阶段待验证

路径：lan_join／lan_lobby／lan_mapcheck／lan_browser。Win32 Release 产品编译通过；本机模拟 TCP 主机检查加入请求、槽位分片、玩家／PING／地图声明、PONG 与退出；BootyBay 大小／CRC32、非法路径与后台校验以及大厅和槽位 FDF 隐藏绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-join-probe/result.log。

集中验证真实 1.27 互通、槽位更新／拒绝／断线／超时、名字与多字节、路径安全和异步取消、实际游戏地图字段对照、完整大厅交互与重复进出资源释放。加入确认后尚未发送地图就绪，创建大厅与地图传输已另列待测；对局同步待实现。

## 玩家建造与生产命令阶段待验证

路径：player_commands／game_commands／game_view。Win32 Release 产品编译通过；BootyBay 最小检查共享单位训练按拥有者扣款及取消生产通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实界面建造落点、训练／研究／升级／复活／英雄学习、队列索引与取消退款、资源归属、权限撤销、重入和原版时序；网络锁步与剩余输入仍待实现。

## 玩家物品与货舱命令阶段待验证

路径：player_commands／game_view／game_transport。Win32 Release 产品编译通过；BootyBay 最小会话检查高级共享丢弃、普通共享拒绝库存操作通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证即时／点／单位物品使用、热键／鼠标丢弃、权限撤销及物品移除重入、普通／高级共享拾取和库存权限、货舱乘员卸载、原版事件与多客户端同步。

## 局域网大厅聊天阶段待验证

路径：lan_join／lan_lobby／lan_browser。Win32 Release 产品编译通过；本机模拟 TCP 主机检查 0x28／0x0F 收发、UTF-8、发收方、长度限制、过滤和畸形包，原版 FDF 隐藏窗口绘制通过，未加载 Game.dll。证据 tmp/docs-artifacts/war3/lan-join-probe/chat-result.log。

集中验证原版 1.27 主机、真实窗口中文与长消息、焦点／滚动／断线、恶意网络字符串显示、消息顺序及地图未就绪超时；自研对局聊天见上方待测项，原版对局聊天协议仍待实现。

## 玩家商店、联盟与聊天命令阶段待验证

路径：player_commands／game_commands／game_alliance_dialog／game_view。Win32 Release 产品编译通过；BootyBay 最小会话检查统一入口资源转移和共同胜利状态通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/transfer-probe/。

集中验证真实商店／购买者与费用、游戏聊天事件、联盟变更／取消及资源转移的重入和时序、原版权限、网络身份与同步；其他未迁移的输入和锁步仍待实现。

## 局域网创建房间和主机大厅阶段待验证

路径：lan_host／lan_host_ui／lan_browser／lan_mapcheck／CMakeLists。创建页浏览地图、后台读取地图元数据和校验字段，主机处理搜索、加入、槽位显示、聊天及断线；Win32 Release 产品编译通过；本机探针覆盖 UDP 搜索、两客户端加入、地图声明、槽位广播、双向聊天、断线释放和主机关闭，证据 tmp/docs-artifacts/war3/lan-host-probe/result.log。

集中验证原版 1.27 双向互通、真实创建页及大厅操作、多网卡／端口占用、地图字段／编码、多人加入／拒绝／断线与恶意报文、资源释放；基础槽位设置与地图传输已另列待测；自动就绪、开始及对局同步尚未实现。

## 局域网槽位设置阶段待验证

路径：lan_host、lan_host_ui、lan_join、lan_lobby。房主可设置开放／关闭／电脑难度和自身及电脑槽位；加入方请求自身队伍、颜色、种族及让分，主机按地图选项约束并广播。

Win32 Release 产品编译通过；本机定向双端探针覆盖四类请求、颜色交换、固定设置、自定义队伍迁移和电脑专用槽保护，证据 tmp/docs-artifacts/war3/lan-host-probe/slot-probe/result.log。集中验证原版 1.27 双向互通、真实鼠标键盘和弹出菜单、固定选项与队伍迁移、远端广播／断线重入、全部地图和完整对局；地图传输已另列待测；自动 ready 和同步尚未实现。

## 局域网地图就绪协议阶段待验证

路径：lan_host、lan_join。加入端增加四字段匹配后的就绪声明发送能力；主机解析状态并显示声明，界面仍不自动发送，未启用开始。

本机双端定向探针检查匹配／失配与状态广播、断线清理，证据 tmp/docs-artifacts/war3/lan-host-probe/ready-probe/result.log。集中验证畸形报文、重复宣告、原版 1.27 互通及下载／加载／锁步；远端声明不等于服务端验证地图。

## 内存地图归档及字段校验阶段待验证

路径：archive、lan_mapcheck。页面文件映射可在内存挂载地图，单 worker 支持内存地图字段计算与取消；网络下载已接入，会话尚未接入。Win32 Release 编译通过；BootyBay／DotA 实际地图成员、枚举、fork／卸载、并发读取和坏数据失败清理，以及 BootyBay 文件／内存四项字段、异步元数据与取消探针通过。证据 tmp/docs-artifacts/war3/archive-memory-probe/result.log、memory-mapcheck-probe/result.log。

集中验证网络接收与会话所有权、页对齐零填充下畸形／截断文件边界、原版字段和报文、大地图内存峰值、长期切图释放及系统级磁盘活动；校验期间输入须保持不可变。

## 局域网地图内存传输阶段待验证

路径：lan_host、lan_host_ui、lan_join、lan_lobby、lan_mapcheck。建房读取不可变地图快照并从同一快照计算声明；缺图／不匹配时请求地图，按块验证和确认并在内存重算字段，匹配后保留快照。自动就绪、开始和会话接入尚未实现。

Win32 Release 产品编译通过；本机两客户端并发接收真实 BootyBay，逐字节与主机快照一致并核对四项字段，未加载 Game.dll；快照及取消检查通过；模拟主机的错误 CRC、错误偏移与中途取消检查通过。证据 tmp/docs-artifacts/war3/lan-transfer-probe/result.log、lan-snapshot-probe/result.log、client-transfer-invalid-probe/result.log。集中验证 1.27 原版双向互通、缺图／错误块／断线／超时、UI 进度、慢网／大地图与内存、声明变更、系统磁盘活动及会话所有权。当前不支持续传或重试。

## 玩家自动施法命令阶段待验证

路径：player_commands、game_commands。技能及修理自动施法经统一玩家命令入口执行并检查控制权限；Win32 Release 集成版本编译通过，待集中验证真实右键、启停与订单事件、权限撤销和原版行为。网络动作编码及锁步尚未接入。

## 内存地图会话准备阶段待验证

路径：map_preparation。已校验的内存地图可后台准备配置完成的会话；World 保留地图视图。Win32 Release 集成版本编译通过，BootyBay 内存准备、线程退出／源缓冲释放后资源读取、玩家设置和 main 启动探针通过，未加载 Game.dll，证据 tmp/docs-artifacts/war3/memory-session-probe/result.log。集中验证 LAN 会话所有权与退出重开、随机种子／槽位、本地玩家、完整界面及多人同步；大厅尚未触发此入口。

## 局域网加载屏障阶段待验证

路径：lan_host、lan_join。显式倒计时与开始加载、玩家加载完成广播和全部参与者屏障已接入；加载状态冻结槽位并处理断线与超时。Win32 Release 集成版本编译通过，本机双客户端探针覆盖就绪前拒绝、等待最后玩家、断线与未启用拒绝，证据 tmp/docs-artifacts/war3/lan-loading-probe/result.log。集中验证 1.27 互通、真实加载时序／超时／断线以及与会话和模拟锁步的衔接；大厅尚未启用开始。

## 玩家对话框及过场命令阶段待验证

路径：player_commands、game_flow_ui、game_view。对话框点击和过场跳过进入玩家命令入口，Win32 Release 集成版本编译通过；BootyBay 最小会话探针覆盖权限、隐藏／重复点击及过场事件归属，未加载 Game.dll，证据 tmp/docs-artifacts/war3/ui-event-command-probe/result.log。集中验证真实输入、回调销毁／重入、原版事件时序和后续网络身份；玩家选择及暂停／退出等仍待同步设计。

## 局域网动作与时间片传输阶段待验证

路径：lan_host、lan_join。显式启用后传输有界 W3GS 动作、时间片分片和逐玩家逐轮校验；动作字节尚不连接游戏模拟。Win32 Release 集成版本编译通过，本机三端探针覆盖空帧、跨分片动作顺序、逐轮校验一致及不一致后停止，模拟主机的错误 CRC 与不完整时间片拒绝通过；证据 tmp/docs-artifacts/war3/lan-timeslot-probe/result.log、lan-timeslot-invalid-probe/result.log。集中验证原版 1.27 互通、其他异常报文及延迟／断线、原版动作编码与对象映射、校验语义和网络时间驱动；失步分组恢复、锁步对局和大厅启用仍未实现。

## 局域网会话配置与动作时间驱动阶段待验证

路径：lan_host、lan_join、lan_setup、session、map_preparation、lan_actions、lan_time_driver、lan_simulation、CMakeLists。SLOTINFO 种子可传到会话初始化；显式槽位映射应用玩家配置。按文档字段编解码部分经典动作，时间驱动器整帧先验证并按网络毫秒推进；模拟桥当前仅消费暂停／恢复，其他动作明确拒绝。大厅和 GameView 尚未使用该链路。

Win32 Release 编译通过。本机 seed 从主机传给双客户端、双会话映射及项目 RNG 序列一致、BootyBay 时间驱动和暂停／恢复／未知动作拒绝、编码边界与截断检查通过；证据 tmp/docs-artifacts/war3/lan-seed-probe/result.log、lan-setup-probe/result.log、lan-time-driver-probe/result-integrated.log、lan-simulation-probe/result.log、lan-action-codec-probe/result.log。

集中验证 1.27 动作字节与事件／时间边界、原版随机与校验、网络 peer 到地图玩家和对象 ID 映射、真实游戏输入、多端模拟／断线、会话生命周期及真实界面。当前尚不能启动联网对局；现有 RNG 一致性仅针对本实现。

## 玩家选择与局域网限定动作阶段待验证

路径：session、session_callbacks、session_collections、session_entities、session_food、session_orders、lan_simulation。会话保存每个玩家的选区，LAN 动作在显式对象映射下消费选择及部分基础订单；真实大厅与对象编号映射尚未接入。

Win32 Release 产品编译通过；BootyBay 探针覆盖本地／远端同单位选择、JASS 查询、事件玩家、回调重入与移除清理，同一时间片选择后保持及无效映射／排队标志整帧拒绝，证据 tmp/docs-artifacts/war3/player-selection-probe/result.log、lan-selection-actions-probe/result.log。

集中验证原版 1.27 对象 ID 及动作编码、选区顺序／事件归属、地图物品／技能／排队、动态创建和销毁、变形／货舱自动选中、真实多人同步与界面。现有解析器必须由调用方提供可靠映射；没有原版映射时不能开始联机。

## 局域网输入编码与游戏视图接口阶段待验证

路径：lan_action_encoder、lan_simulation、game_view、game_flow_ui、game_commands、game_spells、game_transport、game_alliance_dialog、CMakeLists。新增有界选择和基础订单编码，要求调用方提供对象双向映射及原始动作字段；游戏视图可显式接收时间片并将玩家命令交给外部提交器，网络模式不按本地帧推进模拟。未知命令和排队标志明确拒绝；网络模式的选择、脚本对话框与部分菜单操作暂不可用。

Win32 Release 产品编译已执行；功能与原版一致性尚未验证。集中验证编码／解码边界、选区和命令的时序及重入、单机行为、原版 1.27 对象编号与动作字段、双端同步和相机／UI 状态。大厅、对象编号来源、网络提交器、选择同步、完整命令、校验与断线处理仍待实现；目前不能启动联网对局。

## 排队动画模拟时钟阶段待验证

路径：model_sequence、model、scene_assets、session_animation、session_doodads、session_orders、session_destructables、session_volcano、session_world、world、game_view、scene_objects、CMakeLists。单位及可破坏物动画队列按模拟步进及源 MDX 序列时长推进，渲染和模拟共享序列匹配；常规队列出队不再由场景绘制推进；区域装饰物动画目标选择和状态变更已移入会话，需集中验证最近目标、随机相位、动态对象创建／删除／复用及动画命令先后。真实地图、隐藏／离屏、暂停／倍速、形态和死亡切换、模型缺失、多客户端与原版时序待集中验证，见[单位动画](animation-simulation.md)。

## 脚本物件伤害与死亡轮次阶段待验证

路径：session_damage、session_tick、session_destructables、session、entities。UnitDamageTarget 消费可破坏物和物品生命、无敌及死亡事件；widget 死亡事件检查对象和生命轮次。集中验证单位／物品／可破坏物有效及空句柄、无敌／死亡与返回值、各种伤害类型／幻象倍率、触发器回调删除／复活／再次致死、物品持有／装备清理、重叠路径占用，以及原版伤害与事件时序。UnitDamagePoint 已接即时／延迟和范围伤害，集中验证负／零／正延迟、暂停与多次同刻顺序、大小碰撞、单位／可破坏物／物品、己方／来源、移除／复活／移动重入、来源移除、无限大／非法参数、三图、DotA 高频范围伤害的帧耗时和原版目标筛选及时序；见[脚本物件伤害](widget-damage.md)。

## 游戏内选项与鼠标边缘滚动阶段待验证

路径：game_flow_ui、game_view、game_preferences、platform、CMakeLists。原 FDF 导航、游戏性复选框和鼠标／键盘速度滑块已接入；确认后改变本地相机移动并写入独立用户目录。集中验证真实窗口布局／字体／焦点、键盘与鼠标点击及拖入拖出、确定／取消／Esc、选中施工或升级建筑时菜单按 Esc 不取消施工、各速度档、对角／相反方向和边缘与键盘同时输入、原版速度映射及边缘滚动关闭时的控件行为、暂停／局域网、旧版相机设置升级、切图／重启后的设置、只读安装边界、不可写／损坏／未来版本设置、遗留临时文件和多进程写入。其他选项与原版还原度待继续实现，见[游戏内选项](game-options.md)。

## 游戏内声音选项阶段待验证

路径：game_flow_ui、game_view、game_preferences、map_preparation、game_loading、sound、music、session_sound、session_music、main、cinematic、model_cinematic。原声音页的音效／音乐开关和滑块接入本地音量与设置文件。集中验证鼠标拖动／键盘焦点、确认／取消／Esc、已有与新建音效／堆叠声音、地图／主题／主菜单音乐、AVI 与模型过场、脚本音量组和淡入淡出叠加、--mute、不支持的音频设备、切图／重启及异常设置文件。原版音量曲线／控件外观和细分声音选项仍待对照或实现，见[游戏内选项](game-options.md)。

## 局域网地图快照与会话配置待验证

路径：lan_lobby、lan_mapcheck、lan_host、lan_host_ui、lan_setup。集中验证本地匹配与下载地图的校验、元数据和保留字节一致，校验后原文件替换、声明变更、断线与取消时的资源生命周期；验证自建主机混合人类／电脑、非连续与乱序玩家 ID、固定队伍及槽位变更，种子与槽位映射在 main 前应用，并比较真实双客户端状态、异常报文及大地图内存。原版主机的槽位顺序尚未确认，大厅对局启动与实际网络同步尚未接入。

## 联机选区输入与回显待验证

路径：game_view、lan_action_encoder、lan_simulation、lan_time_driver。集中验证单击、拖选、Shift 交替选中／取消、空地清空与超过上限、原有隐藏选区、选择回调删除／重入，提交前后 JASS 选中状态和事件顺序；测试同帧相同玩家其他命令、多玩家 FIFO、回显前连续输入、重复时间片、拒绝发送、断线／失败、无效或冲突对象映射以及非本机伪造相同动作。检查实际窗口与多客户端一致性；原版字节、对象编号、混合权限命令及网络大厅启动仍待完成或对照。

## AI 合并与转换待验证

路径：session_ai_natives、session_ai_economy、session_coupling、session_unit_forms、session_spells。集中验证原 common.ai 对骑乘单位和毁灭者的需求、已有和在途数量、多次调用、来源不足、停止／移动／占用／死亡／易主、多个 AI 与自定义能力；检查骑乘位置与人口，变形科技／资源／人口费用、取消和事件重入，数量边界和 native 返回值与原版对照。执行暗夜及亡灵实际长局并观察单位形成、原版画面及性能。

## AI 飞艇购买待验证

路径：session_ai_transport、session_ai_natives、session_ai、session_ai_armies、session_ai_economy、session_ai_guards、session_commerce。集中验证原 AI 的购买请求，地精实验室库存／资源／人口／售卖事件、附近与远程购买者、单位行走与采集恢复、多商店／路线阻塞、暂停／超时／取消／死亡／易主和交易回调；比较原版候选与购买行为并执行实际对局。运输波次与原版行为见后续专项。

## AI 运输波次待验证

路径：session_ai_transport、session_ai_natives、session_ai、session_transport、session_combat_orders、session_spells。集中验证原 common.ai 的 LoadZepWave 与 AttackMoveXY 连续调用，多载具／容量和乘员体积、满舱／无载具／无法登船、移动中的载具、暂停／死亡／易主／命令回调、登船等待／飞行／卸载／陆路继续、目标变更／撤退／超时，以及战役或海岛地图与原版目标选择／时序对照；覆盖实时画面、长局和多人同步。

## 水面与两栖路径待验证

路径：world、world_path、session_orders、session_combat_orders、session_production、session_summons、session_coupling、session_mobility、session_teleport、session_transport、session_unit_forms。集中验证不同 WPM 位组合与地图边界、陆地／水面／两栖／飞行路径和目标修正、净空／对角／动态阻挡与重算；在海岛地图验证船厂训练、购买、召唤、移动／追击／卸载／传送和水陆交界，覆盖对象覆盖及多客户端同步，比较原版语义、画面和长局性能。

## 水面单位与弹道显示待验证

路径：terrain_scene、terrain_layout、game_view、game_morph、game_effects、scene_objects、combat、spells、session_projectiles、session_spell_effects、session_siege_attacks、session_self_spells。集中验证 W3E 干／湿格、非平坦水位、地形与水面交界、源水位偏移、海军／两栖／飞行单位模型与选择圈、点击／相机／遮挡，武器与法术弹道发射者死亡、追踪目标变形、反弹和多目标；覆盖多个地形集、实际 GPU 帧、透明水面与原版对照及长局性能。水面闪电见后续专项，水面粒子仍待对照或实现。

## 水面闪电端点待验证

路径：game_lightning、session_lightning、session_lightning_attack、effects、stampede、terrain_scene。集中验证船只／两栖与陆空单位的闪电链、锁镣、资源汲取、攻击延迟，端点跨岸／变形／死亡与回退、显式 AddLightningEx／MoveLightningEx 的绝对坐标、解除跟随、脚本移动、可见性及多个地形集；对照原版 GPU 画面和长局性能。

## 生命条显示与游戏性选项待验证

路径：game_preferences、game_flow_ui、game_view。游戏性选项设置生命条常显，按住 Alt 临时显示，绘制遵循单位存活、可选取、显隐与本地视野；设置写入独立用户目录，兼容原有相机设置。Win32 Release 产品增量编译通过，运行尚未验证。集中验证真实窗口的键盘／鼠标、勾选／取消／Esc 与重启、旧版与损坏设置、不同单位和水面高度、生命变化及边缘裁剪、隐形／战争迷雾／共享视野、大量单位性能，比较原版颜色／纹理／位置及 Alt 行为。仅为基础显示，原版外观与完整行为未验收。

## AI 治疗与召唤阶段待验证

路径：session_ai_armies。电脑英雄在空闲或保持位置时也可治疗，战斗中通过既有施法入口使用水元素、幽灵狼、蛇棒、树人、地狱火、灰熊、豪猪和炎魔；Win32 Release 产品增量编译及差异检查通过。集中验证无敌人目标、医疗目标分类／范围／资源、采集／建造／移动和事件重入，召唤单位存活／失效／易主／多英雄、地狱火延迟、树木与落点、技能冷却及目标消失，实际战斗与原版策略、长局性能；新功能尚未进行运行或原版验收。

## 自动施法失败后的战斗恢复待验证

路径：spells、session_spells、session_channels。自动施法的目标失效、不可到达与条件／资源变化进入显式恢复路径；结束事件之后校验施法与战斗修订、生命和归属轮次，重置攻击前摇并恢复战斗状态。普通主动取消与新订单保持原语义。Win32 Release 产品增量编译通过。集中验证目标死亡／不可见／无效、路径失败、施法条件变化、战斗目标与攻击移动恢复、冷却和动画，结束回调中下达新命令／重施法／死亡复活／易主转回／移除、单位自动施法及 AI 和多人时序；控制打断及特定持续施法的失败路径仍待实现或核对，原版行为和实际对局尚未验收。

## AI 英雄自保与强化待验证

路径：session_ai。电脑英雄根据战斗与生命条件启用圣盾／天神下凡／魔法护盾／献祭／狂暴，献祭在无范围目标时按能力配置关闭；Win32 Release 产品增量编译通过。集中验证低血逃跑与群体撤退、受控／移动／前摇／正在施法、魔法／冷却／禁用、目标可见性和多敌人、技能持续／开关／耗蓝／死亡、施法事件重入与新命令、战斗恢复、多个英雄和长局性能，并与原版策略及视觉对照；运行和原版一致性尚未验收。

## 网络技能动作待验证

路径：lan_spell_orders、lan_action_encoder、lan_simulation、player_commands。单单位选区的代表性即时／点／单位技能连接编码、时间片预检及真实施法入口；Win32 Release 产品增量编译通过。集中验证全部列示订单、原始字节和坐标、映射／选区及同订单冲突、目标失效、权限／费用／冷却、同帧选择和施法、选择／订单回调重入、无效动作与部分帧处理、双客户端状态及原版 1.27 对照。多选和更多技能、原版对象编号与锁步、大厅开始仍未完成；此项尚未进行运行验收。

## 网络建造、生产和选区预检待验证

路径：lan_production_orders、lan_action_encoder、lan_simulation。建造、训练、研究及升级的单单位动作接入真实生产消费；预检增量投影每个玩家的选区并在实际执行时检查预期单位，技能订单检查覆盖开关冲突。Win32 Release 产品增量编译通过。集中验证四族生产、资源／人口／取消、地图覆盖及冲突 ID、权限／死亡／易主、同帧选区变化及回调替换、错误对象与报文、大小时间片性能、双客户端同步及原版动作字节；多选施法／生产、队列取消与大厅对局仍待实现，实际运行和原版一致性尚未验收。

## 网络生产与施工取消待验证

路径：lan_actions、lan_action_encoder、lan_simulation。单单位选区的普通单位队列取消接入 0x1E 槽位／类型及原退款、人口与队列；施工和升级取消接入原取消订单。Win32 Release 产品增量编译通过。集中验证所有队列位置、同类型／不同类型替换、完成与取消竞态、资源／人口、地图自定义对象、权限与选择回调重入、合法／截断／无效报文、双客户端及原版 1.27 字节与时序。英雄复活／研究队列取消、多选和实际联机尚未实现或验收。

## 网络英雄复活与取消待验证

路径：lan_actions、lan_action_encoder、lan_simulation。祭坛目标复活、0x1D 英雄复活取消连接实际复活队列、票据、费用、权限和事件。Win32 Release 产品增量编译通过。集中验证同一时间片发起／取消、多个英雄与祭坛、队列位置、对象 ID 映射、取消后重排／复活／死亡／易主、共享控制／伪造来源、事件重入、退款／人口与 UI，以及双端同步、原版 1.27 报文与动作次序。动作字段不包含队列票据，不能区分同一英雄旧任务与新任务；真实网络和原版行为尚未验收。

## 局域网资源交易待验证

路径：lan_setup、session、lan_actions、lan_action_encoder、lan_simulation。0x51 交易经显式槽位映射、时间片和实际资源交易消费，不依赖选区。Win32 Release 产品增量编译通过。集中验证非连续／乱序地图玩家 ID、真人与电脑槽、不同方向、零／最大／非法金额、余额不足、税率／联盟／权限变更、多个提交和回显前重复输入、资源事件重入、断线与重开、完整双客户端和原版 1.27 报文对照。联盟快照及大厅启动仍未完成；运行和原版一致性尚未验收。

## 局域网联盟快照待验证

路径：lan_actions、lan_action_encoder、lan_simulation、session_match、player_commands、game_view、game_alliance_dialog。0x50 与显式槽位映射接入实际联盟／视野／共享控制及共同胜利；界面合并草稿并等待本机回显后允许后续编辑。Win32 Release 产品增量编译通过。集中验证部分低位／高位保留、self／电脑／关闭槽、地图联盟锁、同目标多次编辑、全局胜利、联盟后资源交易、FIFO／合包／重复／异常／中途失败／断线、回调修改与重入、真实界面和双客户端及原版 1.27 报文与事件顺序。网络提交器须有序且不重入；运行与原版一致性尚未验收。

## 网络子组命令待验证

路径：lan_actions、lan_action_encoder、lan_simulation。混合类型选区中，唯一类型单位的已支持技能及建造／训练／研究／升级可编码预子选和子组、在时间片中核对并执行而不改变选区；Win32 Release 产品增量编译通过。集中验证多玩家跨时间片、子组切换／取消选中、单位删除／易主／变形、重入与异步回显、相同类型拒绝、控制权限、原始字段／畸形数据与 1.27 双端对照，以及大选区性能。原版同类型调度、其他标志和完整联网尚未实现或验收。


## 游戏界面子组切换待验证

路径：`game_view.cpp`、`game_view.h`。Tab／Shift+Tab 按当前选区中类型的首次出现顺序切换界面主单位；肖像、命令面板、物品栏、技能／建造目标及取消操作使用该单位，群体命令与完整选区保持原序。切换或选区变化清理旧菜单和目标，联机选区尚未回显时不切换。Win32 Release 产品增量编译通过，尚未执行运行验证。

集中验证真实窗口的单类型／混合类型、多单位同类型、正反切换、选区变化、死亡／变形／控制权和可见性变化；菜单、技能书、目标模式、物品快捷键及群体命令；聊天、菜单、任务／联盟、脚本对话框与隐藏选区时的按键屏蔽；联机异步选区及唯一类型子组的发送／回显。原版子组排序、代表单位、Shift+Tab 和网络行为需与 1.27 对照，完整多人流程仍待实现。


## 单机游戏速度待验证

路径：`session.h`、`session_game.cpp`、`game_view.cpp`、`game_flow_ui.*`。单机选项接入五档速度草稿和确认／取消，脚本速度与主循环的实际时间换算共用会话状态；固定模拟步进保持 1/32 秒。网络选项禁止本地修改速度，网络时间片速度同步尚未实现。Win32 Release 产品编译通过，玩法及原版对照尚未运行。

阶段集中验证原版五档倍率／文本及鼠标拖动、方向键、Home／End、确认／取消／Esc、暂停、切图及默认值；核对 SetGameSpeed／GetGameSpeed、地图初始化后变更、计时器／单位移动／技能／动画的实际时间与事件顺序、相机速度、低帧率及速度切换。联机脚本更改、主机控制、时间片与原版互通需后续实现并对照。


## 联机加载与首个时间片衔接待验证

路径：`lan_join.cpp`、`lan_join.h`。显式授权可在倒计时／加载时准备时间片，只有 Ready 后接收；若最后的加载完成通知和首帧同批到达且尚未授权，首帧保留到调用方启用后的下一次 poll。相同地图声明保留既有就绪并重新发送就绪，声明变化清除就绪和加载授权。Win32 Release 产品增量编译通过，联机运行尚未验证。

阶段集中验证分片与合包、授权前／后首帧、顺序与重复 poll、多玩家最后就绪、本地最后就绪、提前发帧拒绝、缓冲上限／断线／超时；核对相同／变化地图声明、下载中变化及重新校验，随后联同大厅到对局的真实双端流程和 1.27 对照执行。大厅接线、原版对象 ID 和校验算法仍未完成。


## 加入端会话准备交接待验证

路径：`lan_lobby.*`、`lan_browser.*`、`map_preparation.*`、`lan_setup.*`。显式启用后，已校验地图才报告就绪，Loading 时一次性交接连接、地图和冻结的玩家配置；后台从不可变地图和相同种子准备会话，在 main 前应用调用方明确提供的槽位映射。Win32 Release 产品编译通过；默认界面未启用该入口，实际联网未验证。

集中验证本地／下载地图与声明变化、重复声明、取消／断线／加载超时、槽位与随机种子快照、加载报文合包、交接仅一次、异步取消与旧请求失效、非法／重复／缺失映射、准备失败释放连接和源地图、Main 前配置及资源只读；随后联同主机启动、加载屏障、真实时间片和双客户端／原版互通验证。对象 ID、校验与实际对局消费仍待实现。


## 主机交接与对局驱动待验证

路径：`lan_host_ui.*`、`lan_browser.*`、`lan_runtime.*`、`game_view.h`、`CMakeLists.txt`。显式启用后主机等待真人就绪、冻结槽位／地图／种子、倒计时并转移连接；Ready 后对局驱动消费真实时间片、发送已编码动作和调用方提供的状态校验。Win32 Release 产品增量编译通过，默认界面尚未接通，原版对象编号／订单字段／校验提供方尚未完成；实际联机尚未验证。

阶段合并验证多玩家地图准备／倒计时／离开／取消／超时、同帧槽位变更、冻结配置与线程所有权、连接交接仅一次、加载屏障、逐帧顺序／分片／首帧、延迟／背压／追帧／断线／时钟回退、校验不一致及会话对象销毁；再核对主机与加入端实际窗口、聊天／物品／对话框、原版帧节拍／编号／字段／校验及三图长局。原版互通和完整客户端仍未完成。


## 联机地图加载生命周期待验证

路径：`lan_match_loading.*`、`lan_host.*`、`lan_runtime.*`、`CMakeLists.txt`。加载协调器持有活连接，准备内存地图并应用冻结配置，执行 main、按帧上传、报告加载和等待所有参与者，再一次性交给对应 GameView 和时间片驱动。主机允许在 Loading 时预先启用协议，避免最后加载包与首动作同次处理时拒绝。Win32 Release 产品编译通过；默认界面和实际联机仍未启用或验证。

阶段集中验证主机／加入端、加载快慢不同／最后就绪的先后与 TCP 合包、资源上传失败、地图损坏／取消／超时／断线、后台旧请求失效、所有权转移与销毁、原版载入界面回调、重复取出／错误 GameView、防止提前发送、早到帧队列与运行驱动接续；完整原版对象池／校验和真实双客户端流程仍待实现并对照。


## 玩家数字控制组待验证

路径：`game_view.*`、`glue.h`、`main.cpp`。Ctrl+数字保存选区，Shift+数字追加，数字召回，连续按相同数字聚焦；单机走选择事件，联机走原有选区动作并等待回显。Win32 Release 产品增量编译通过，真实窗口／原版对照和联机尚未执行。

阶段集中验证 0–9／空组／12 单位上限／混合选区、Ctrl／Shift组合、按住自动重复与快速双击、相同选区无重复事件、丢失控制权／死亡／复活／隐藏／运输／移除及脚本选择重入；聊天／菜单／任务／联盟／脚本对话遮挡、镜头边界／跟随、多人选区回显／失败／同步。原版分组添加、英雄死亡保留、选择排序和定位间隔待对照；见[玩家控制组](control-groups.md)。


## 联机物品栏使用待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.*`；即时、点目标和单位目标物品订单通过六个源栏位 ID 接入真实物品支付、冷却和效果，并在时间片执行前复核持有者、栏位与控制权限。混合选区仅支持发令者类型唯一的子组。Win32 Release war3_core 增量编译通过，实际联机尚未验证。

阶段合并验证六栏／三种目标／库存与共享控制、同帧选择／子组、目标或物品销毁／换槽／转让／消耗、重入与多玩家竞争、队列失败与资源计费；原版 flags／对象 ID／报文字节、真实双端互通和 UI 待对照。地面丢弃与转交网络动作已接入后续条目，交换报文仍待实现。


## 英雄快捷栏待验证

路径：`game_hero_bar.cpp`、`game_view.*`、`CMakeLists.txt`。本地英雄头像与生命、F1–F7／点击选择和连续定位已接入现有选区事件与联机回显；单位目标模式复用技能／物品／命令消费者，点目标保持等待。Win32 Release 产品增量编译通过，实际窗口和多人尚未验证。

阶段集中核对三图及自定义英雄数量／顺序／图标／死亡灰态与复活、幻象／易主／隐藏／运输、头像拖入拖出、连续按键／自动重复、相同选区事件、镜头边界、技能／物品／攻击与建造和点目标、聊天／任务／菜单／脚本对话遮挡、回调移除及联机异步回显；对照原版边框、布局、快捷键和脚本接口，性能与切图释放合并验证。


## 物品拖放、转交和订单待验证

路径：`session_inventory.cpp`、`session_combat.cpp`、`session_combat_orders.cpp`、`session_orders.cpp`、`combat.h`、`session.h`、`player_commands.*`、`game_inventory_drag.cpp`、`game_view.*`、`lan_action_encoder.cpp`、`lan_simulation.cpp`、`CMakeLists.txt`。地面放置／友方转交／栏位交换进入真实订单与模拟步进，原 native 和 getitem 连接实际消费者，UI 拖拽使用统一玩家命令。Win32 Release 产品增量编译通过；玩法和原版对照未执行。

阶段合并验证六栏、空槽与交换、单位行走／不可达／移动目标／中断、物品不可丢弃／死亡／隐藏／转移／背包满、共享控制／友敌、掉落／拾取事件和回调移除／换槽／易主／重新下令、三个 JASS native 的订单／返回值／时序、拖拽中 Esc／右键／遮挡／失焦和头像／场景命中；原版位置与事件时序、声音和视觉、双客户端同步及三图长局保持待验。联机地面放置／转交已接入后续条目，换格尚未实现，详见[物品栏移动与转交](inventory-interactions.md)。


## 联机物品放置与转交待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.*`、`session_inventory.cpp`、`session.h`。地面／单位目标通过 `0x13` 和 `852001` 携带物品对象，连接真实移动、掉落和转交订单；同帧重入时核对物品持有／选区／权限。补强取消施法回调期间物品移除、回调更改物品位置／所有者，以及不可达路径的清理。Win32 Release 产品增量编译通过，行为尚未执行。

阶段集中验证地面／目标双字和空目标、选区与唯一类型子组、物品换槽／消耗／转让、回调移动物品或移除单位／中断施法、被阻挡的回退路径／目标移动、控制权变化、报文畸形／重复／多个动作同帧、真实双客户端及原版 1.27 flags／对象编号和时间片顺序。联机换格报文尚未实现。


## 空闲工人入口待验证

路径：`session.h`、`session_orders.cpp`、`game_loading.*`、`game_hero_bar.cpp`、`game_view.*`。依据单位源 Peon 分类及实时工作状态筛选本地单位，F8／界面按钮循环选择并定位，单机通过选区事件、联机通过选区动作回显；四族图标从原资源读取。Win32 Release 产品增量编译通过；功能和原版一致性尚未运行验证。

阶段集中验证四族及自定义 Peon、数量与循环顺序、保持位置／暂停／采集／建造／修理／移动／施法／战斗／运输／死亡／复活／隐藏／易主与脚本重入、UI 遮挡和目标模式、快捷键重复／按钮按下拖出、镜头及联机回显／失败，核对原版判定、定位行为、按钮坐标／边框／提示／音效和三图性能。按钮位置暂按现有 HUD 布局放置，尚无原版坐标证据。


## 多单位地面命令编队待验证

路径：`player_commands.*`、`session.h`、`session_orders.cpp`、`session_combat_orders.cpp`、`lan_simulation.cpp`。玩家多选移动、攻击移动和巡逻在会话内按单位句柄稳定分配网格目标；脚本订单事件保留玩家点击位置，单单位与建筑集结沿用原入口。联机同步选区使用同一分配并逐单位复核控制权。Win32 Release 产品增量编译通过，玩法及原版一致性尚未运行验证。

阶段集中验证单选、多选、混合建筑与单位、不同碰撞半径／移动类型、目标在地图边界或受阻、回调移除／易主／改变订单、攻击索敌／返回与巡逻两端、JASS 事件目标与次序、共享控制、联机同帧选择／命令与失败中止；核对原版编队形状与排序、地图窄路、动态单位碰撞和长局确定性。当前地面单位动态避让与受阻回退后的落点去重尚未实现；不可据此视为原版寻路完成。


## 编队落点与单位局部避让待验证

路径：`player_commands.cpp`、`world.h`、`world_path.cpp`、`session_orders.cpp`。多选地面命令在实际发令时按单位碰撞半径、运动类型、地形和已接受的终点预约落点；候选有界，无法分配的单位不下发错误目标。固定步进按需建立局部空间网格，以确定性的邻居次序检查移动段，使用短距离地形通行检查及有界侧移；不把移动单位写入静态建筑路径网格。 Win32 Release 产品编译通过。BootyBay 最小会话检查 4/4 通过：相向侧移与无关单位移动、重叠脱离、pathing=false、地空分层；不加载 Game.dll。测试目标 `war3_movement_avoidance_tests`，运行参数为原安装目录和 `Maps/(2)BootyBay.w3m`。

阶段集中验证地图边界、障碍与窄路、可达／不可达点、大小不同的碰撞半径、飞行／水行／地面与 pathing 关闭、静止和相向单位、重叠脱离、拥堵、命令回调改变障碍或单位、攻击追击／采集／施工／运输与 JASS 事件；核对源版碰撞、穿越、队形与优先级，以及大地图密集单位帧耗时和双端确定性。局部避让尚无长时间拥堵重规划，可能等待或绕圈，原版精度和真实运行尚未验证。


## 动态障碍重寻路与邻居查询待验证

路径：`entities.h`、`session.h`、`session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。静态障碍变化后重寻路失败时保留原路线和命令，通过模拟时间退避与每步有界轮转预算重试；单位在等待时继续执行短段地形校验。极端脚本坐标下限制侧移距离及邻居网格查询范围；同一运动尝试复用邻居候选。 Win32 Release 产品编译通过，BootyBay 最小运动会话 6/6 通过，覆盖相向侧移、重叠脱离、关闭路径／地空分层、障碍阻塞后恢复、80 单位重试预算／轮转、未获预算单位继续移动及极端地图外坐标；未加载 Game.dll。测试目标 `war3_movement_avoidance_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`。

阶段集中验证大量单位跨多个障碍版本、障碍新增／移除、命令取消／替换、传送／隐藏／死亡与追击／采集／建造周期更新、路径角落及失效坐标；核对原版行为、密集单位固定步进耗时和真实联机确定性。当前局部避让仍可能在拥堵中绕圈或等待，不代表完整单位寻路已完成。


## 玩家行动排队待验证

路径：`main.cpp`、`game_view.*`、`player_commands.*`、`entities.h`、`session*.cpp`、`session.h`、`lan_action_encoder.cpp`、`tests/order_queue_tests.cpp`。鼠标事件保存 Shift 快照，单机支持移动／攻击移动／巡逻及目标命令排队；空闲首条立即执行，后续由固定步进消费并重新核查控制权。多选队列保留单位目标和原点击位置，非排队玩家／脚本命令、死亡和易主清理队列；联机排队编码明确拒绝。 Win32 Release 产品编译通过；BootyBay 最小队列会话 7/7 通过，覆盖顺序、多选队形、即时替换、死亡、易主、失效目标和联机拒绝；不加载 Game.dll。测试目标 `war3_order_queue_tests`，运行参数为原安装目录与 `Maps/(2)BootyBay.w3m`。

阶段集中验证原版 Shift 按键时序／目标／队列数量、混合多选与不同单位结束时间、跨时刻动态落点、采集／施工／追击／巡逻／停止、暂停／隐藏／运输／死亡／复活／易主、控制权变动及订单回调重入、无效目标与中断；核对 JASS 点击坐标、原版事件时序和真实窗口输入。技能／物品／建造排队与队列目标标记见后续条目，联机排队仍未实现；无效的覆盖命令目前会清除队列，原版行为待核实。


## 技能、物品与建造排队待验证

路径：`player_commands.cpp`、`game_commands.cpp`、`game_hero_bar.cpp`、`game_spells.cpp`、`game_view.*`、`tests/order_queue_tests.cpp`。单机技能的即时／单位／位置目标、物品使用及建造放置接入 Shift 行动队列；入队不提前扣除魔法、物品次数或建造费用，实际执行时重验能力、目标、资源、库存和权限。按钮／快捷键及目标点击保留 Shift 意图；联机排队仍明确拒绝。

Win32 Release 产品增量编译通过，BootyBay 最小队列会话 12/12 通过，新增治疗技能延迟扣魔与目标失效、药水延迟消耗与转移、两座农场依次施工和扣费；测试目标 `war3_order_queue_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`，未加载 Game.dll。阶段集中验证点／单位／无目标技能与物品、技能冷却／资源不足／沉默／目标失效、不同种族建造与工人状态、队列重入／取消／易主／死亡、鼠标和热键 Shift 时序、预览、多人和原版表现。当前执行失败的队列项会跳过；目标模式对沉默和能力禁用的限制、资源不足时的原版行为、Shift 两阶段语义及联机协议尚需完成或核对。


## 行动队列目标标记、物品移动与卸载待验证

路径：`game_waypoints.cpp`、`game_view.*`、`game_loading.*`、`game_inventory_drag.cpp`、`player_commands.cpp`、`session_inventory.cpp`、`session_transport.cpp`、`session_spells.cpp`、`tests/order_queue_tests.cpp`。按住 Shift 时对本地受控选区的待执行目标绘制原版四族 WaypointIndicator 模型，按需从 MPQ 后台读取并过滤失效／不可见目标；物品地面放置、转交和换格可单机排队；脚本物品命令替换旧队列，卸载结束清除自身已完成订单并保留回调中的新状态。

Win32 Release 产品增量编译通过，BootyBay 最小队列会话 20/20 通过，涵盖物品延迟放置／转交／换格、脚本物品命令替换队列以及单体／即时全部卸载后继续移动；测试目标 `war3_order_queue_tests`，参数为原安装目录和 `Maps/(2)BootyBay.w3m`，未加载 Game.dll。阶段集中验证实际窗口按键／拖放、四族模型／颜色／动画、原版队列显隐与目标类型、动态目标及迷雾、模型释放、脚本回调重入、物品转移／失效／不可丢弃与槽位变化、卸载失败／连续卸载；核对原版失败订单清队列与 Shift 物品拖放语义，联机排队仍未实现。原安装 `UI\war3skins.txt` 的 SHA-256 为 `53cedda87d59c6d27ad2d30680d37faa410d37e9917c00b21d473cce9eed70c7`。


## 人族伐木升级待验证

路径：`commerce.h`、`session_research.cpp`、`session_lumber.cpp`、`tests/destructable_tests.cpp`。源科技效果 `rlum` 随已研究等级重建携木容量增量，实际 Ahar／Ahrl 采集读取该增量；研究完成、创建和易主复用科技刷新，已携木材不截断。小精灵直接收入和 AI 慢速采集逻辑保持原有消费路径。

Win32 Release 产品增量编译通过，BootyBay 派生的最小会话检查通过，覆盖原版 Rhlh 一级实际研究、一级／二级容量、已有与新农民、二级重复设置及携木易主；`war3_destructable_tests` 使用 `tmp/docs-artifacts/war3/destructables/fixture.w3m`，通过 `python watcher/war3/tests/generate-destructable-fixture.py --data-root <原安装目录>` 生成，不加载 Game.dll。阶段集中核对 w3q 自定义 rlum／多科技叠加、升级和移除时已有采集流程、不同等级／背包余量、AI 慢速采集及原版时序。


## 科技防御类型增量待验证

路径：`commerce.h`、`session.h`、`session_research.cpp`、`session_damage.cpp`、`session_siege_attacks.cpp`、`session_corpse_spells.cpp`、`tests/fortified_tests.cpp`、`tests/generate-fortified-fixture.py`。原版 Rorb 与有界 rart 效果连接研究刷新及实际防御类型；研究变更按新旧浮点效果差值向零截断并逐次处理边界，碎片攻击只匹配防御类型 1 和 7。新增单位、易主、变形和建筑升级按当前科技重建，幻象和复活路径保留对应状态。

原安装 Game.dll 的 SHA-256 为 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 REA/Rizin 证据：`0x6f6ac913` 识别 rart，`0x6f6986a0` 和 `0x6f0528b0` 计算新旧等级效果差值；`0x6f689b40` 的零级为零、正等级为 base+(level−1)×mod；`0x6f052f30` 向零截断，结果小于 0 时置 0、大于 8 时置 7、等于 8 时保留；`0x6f573a9f` 的碎片攻击只匹配类型 1 和 7。普通伤害对索引 8 的语义尚未确认。

本次 Win32 Release 客户端增量编译通过。此前原版 Rorb 的三个建筑实际研究和伤害倍率、新建筑及易主检查通过；BootyBay 派生的整数 w3q 会话检查通过两级／双科技、伤害倍率、新单位和易主。本次新增分数、研究顺序和生命周期夹具尚待阶段执行：测试目标 `war3_fortified_tests`，原版夹具 `tmp/docs-artifacts/war3/destructables/fixture.w3m`，自定义夹具 `tmp/docs-artifacts/war3/fortified/custom-fixture.w3m`，生成命令见对应 `tests/generate-*-fixture.py`；不加载 Game.dll。阶段集中核对分数及饱和、不同研究顺序、升降级、创建／易主／变形／幻象／复活、古树拔起优先级及碎片攻击的实际行为和原版一致性。超范围数值在研究前拒绝，索引 8 的普通伤害消费仍明确失败；生命周期重建和多个效果移除的顺序尚无原版证据。
## JASS 随机单位池与物品池待验证

路径：`session.h`、`session.cpp`、`session_game.cpp`、`session_hashtable.cpp`、`docs/random-pools.md`。单位池和物品池的创建、增删、销毁与加权随机放置已连接会话随机数和真实单位／物品创建，池句柄支持 hashtable 存取。空池、零／负权重、重复条目、随机数消耗与销毁后的行为以现有实现为限，原版 1.27 规则待对照。

Win32 Release 客户端增量编译通过。阶段集中验证 common.j 调用、地图初始化及触发器、权重组合／重复条目／删除／空池／无效类型、玩家与坐标、固定种子和多客户端同步、句柄存取与释放、对象预算。完整客户端、三图和原版一致性仍未验收。

## 联机 Shift 命令队列待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.cpp`、`lan_simulation.h`、`player_commands.cpp`、`player_commands.h`、`tests/order_queue_tests.cpp`。受支持的移动、攻击、巡逻、目标命令、技能、建造和物品操作通过 0x0001 标志传递排队状态，并由时间片消费到实际玩家行动队列；唯一类型子组技能保留选区校验，不支持排队的命令拒绝。参考 w3g_actions.txt 固定版本；原版网络格式及同类型子组仍待核对，物品换格未接入。

Win32 Release 客户端和 `war3_order_queue_tests` 增量编译通过。阶段执行该目标并合并联机动作、锁步和玩家命令验证，覆盖鼠标／键盘 Shift、队列与立即命令交错、地面／单位／技能／建造／物品、同帧选区与子组、权限变更、无效报文、命令取消及回调重入，双客户端同步及 1.27 原版对照。新增测试尚未执行，不代表实际对局通过。

## 玩家单位批量移交待验证

路径：`session_entities.cpp`。`SetPlayerUnitsOwner` 通过既有单位归属变更处理人口、科技、玩家颜色和事件；调用时快照原拥有者的单位及归属轮次，回调期间已移除或已变更归属的单位不会被旧操作覆盖，回调中新建单位不在本次快照内。目标玩家索引超出范围明确失败。

Win32 Release 客户端增量编译通过。阶段核对玩家离场／中立单位／建筑／英雄／尸体／幻象／运输、人口／资源／科技／选择／订单及颜色、触发事件与回调重入、同一玩家及非法索引；上述顺序和颜色等细节尚未证明与原版一致。

## 原物品属性与中立商店查询待验证

路径：`session_entities.cpp`。物品创建从 ItemData `Level`、`droppable`、`pawnable` 和物编覆盖初始化等级与实例权限；`IsItemPowerup`／`IsItemSellable`／`IsItemPawnable` 与对应 `IsItemId*` 连接源类型与实例状态。原版 Blizzard.j 的市场刷新消费类型级可售查询，显式商店库存保留现有消费方式。

Win32 Release 客户端增量编译通过。阶段检查原资源与 w3t 覆盖、等级、符文／不可售／不可典当／不可丢弃物品、实例开关与类型查询隔离、空或无效句柄、商店库存刷新及脚本触发器，和原版比较边界与事件；当前实现和原版一致性尚未验证。

## 联机背包换格待验证

路径：`lan_action_encoder.cpp`、`lan_simulation.cpp`、`session.h`、`tests/order_queue_tests.cpp`、`docs/lan.md`、`docs/inventory-interactions.md`。单选和唯一类型子组支持普通及 Shift 排队换格，编码为暂定 0x12 目标物品及 852002–852007 目标槽；执行前复核物品持有、控制权及可用栏位。

Win32 Release 客户端及 `war3_order_queue_tests` 增量编译通过。阶段运行该目标并核对源槽／目标槽变化、物品转移／销毁／丢弃、背包缩减、权限和事件回调、畸形报文、双方动作同步及原版 1.27 的 opcode／对象和坐标；测试与原版互通尚未执行。

## 随机中立单位与物品待验证

路径：`object_data.h/.cpp`、`session_game.cpp`、`docs/random-choices.md`。四个 ChooseRandom native 按源单位／物品表、地图覆盖及相关分类、等级和地形集构建候选，使用会话 RNG 返回类型；候选为空返回 0。筛选标志与原版 RNG、顺序的细节仍待对照。

Win32 Release 客户端增量编译通过。阶段核对常见地形集和玩家数量、原版及自定义对象筛选、随机建筑／野怪／物品分类与等级、空结果、地图掉落／中立商店脚本、候选缓存和固定随机种子的双客户端同步；运行与原版一致性未验证。

## 战役单位救援待验证

路径：`entities.h`、`script_state.h`、`session.h`、`session.cpp`、`session_tick.cpp`、`session_ownership.cpp`、`docs/rescue.md`。单位／玩家救援资格、距离与救援事件连接 `GetRescuer`，原版 BJ 利用现有归属转移完成救援；源地图玩家类型 4 映射为 Rescuable。

Win32 Release 客户端增量编译通过。阶段核对 Rescuable 玩家、显式开关／每玩家资格／进入范围、事件及默认 BJ 提示音效／易主／人口／科技、死亡复活／隐藏／暂停／回调重入和多个玩家争抢，并对照原版默认距离、中心距离、事件时序和长局性能。当前范围和筛选边界尚未证实，实际战役未验收。

## DotA 单位点数查询待验证

路径：`session_entities.cpp`。`GetUnitPointValue` 与 `GetUnitPointValueByType` 使用源 `UnitData/points` 和 upoi 对象覆盖，实例读取当前单位类型；空／失效单位及未知类型返回 0。原件 1.27 入口 `0x6f1e6370`／`0x6f1e6390` 的查找与空对象返回行为经静态核对，DotA 脚本分别存在 31／4 处调用。

Win32 Release 客户端增量编译通过。阶段检查 DotA 实际调用和对象查表、英雄／建筑／变形类型、w3u 覆盖、零／负点数和无效句柄；无原版实机或完整对局通过结论。

## 视频粒子选项与联机排队入口待验证

路径：`game_flow_ui.*`、`game_preferences.*`、`game_view.*`、`glue.h`、`renderer.h`、`model_particles.cpp`、`docs/game-options.md`。原视频页面粒子三级选项连接 PRE2 发射率和独立用户设置，确认应用、取消恢复；联机界面将已支持的 Shift 排队交给已有编码器，未支持命令仍由底层拒绝。

Win32 Release 客户端增量编译通过。阶段核对原 FDF 键鼠／弹出菜单／Esc、确认取消和持久化／坏文件／切图／设备恢复、PRE2 粒子在低中高档的实际 GPU 画面与性能、原版比例；联机真实窗口与双端时间片、技能／建造／物品队列和权限变化仍待测试。当前粒子比例是实现值，非原版验证结论。

## 单位转向与推进角待验证

路径：`entities.h`、`session.h`、`session_entities.cpp`、`session_orders.cpp`、`session_combat.cpp`、`session_unit_forms.cpp`、`session_building_upgrades.cpp`、`docs/unit-turning.md`。源转速及推进角、自定义覆盖、脚本设置／查询、移动路径与攻击方向、幻象和类型变化已接入；原版转向速度公式、角度边界和生命周期规则待对照。

Win32 Release 客户端增量编译通过。阶段核对四族与自定义地图的直行／拐角／避障、脚本属性、极端窗口、攻击前摇与移动施法、暂停／幻象／变形／复活、同步及长局性能；当前无玩法或原版一致性通过结论。

## 地图脚本实体状态查询待验证

路径：`session_game.cpp`。`IsHeroUnitId` 读取单位类型继承与英雄分类，`IsItemVisible` 消费物品显示状态，`IsUnitInRange`／`XY`／`Loc` 以当前实体坐标与碰撞半径进行距离判断。

Win32 Release 客户端增量编译通过。阶段验证 DotA 脚本调用、物编继承、空句柄、隐藏物品及位置变化、边界／零／负／无效距离和原版碰撞半径规则；当前算法为实现值，未证明原版精度。

## 视频遮挡设置待验证

路径：`game_flow_ui.cpp`、`game_preferences.*`、`game_view.cpp`、`scene_objects.*`、`docs/game-options.md`。原视频控件连接实际场景遮挡渐隐和脚本 EnableOcclusion，保存至独立用户目录并兼容此前设置格式。

Win32 Release 客户端增量编译通过。阶段核对原 FDF 输入／弹窗／确定取消、旧设置迁移／损坏文件、EnableOcclusion 联合规则、画面恢复／GPU／性能、设备恢复和切图；实际运行及原版一致性尚未验收。

## 自定义地图图像待验证

路径：`effects.h`、`session.h/.cpp`、`session_effects.cpp`、`session_hashtable.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`terrain_scene.h/.cpp`、`terrain_layout.cpp`、`docs/map-images.md`。图像 native、句柄存取及纹理内存流式加载连接实际世界绘制，消费显示／位置／颜色／高度／水面／迷雾与类型排序。

Win32 Release 客户端增量编译通过。阶段检查 DotA 动态图像、对象／纹理创建销毁及 hashtable、绘制状态隔离、视口及水面／坡面／恒高／雾效、不同类型／透明度／大尺寸、GPU 恢复与高密度性能；图像尺寸 Z 和原版混合／排序仍未完整还原，原版画面尚未验收。

## 地形路径脚本控制待验证

路径：`world.h`、`world_path.cpp`、`session_world.cpp`、`docs/terrain-pathability.md`。八种类别可读写会话 WPM，变化进入寻路和建筑放置；动态足迹保留，路径阻挡触发路线重试。REA 静态核对掩码及布尔方向，采木 PEONHARVEST 位、荒芜外观及原版边界仍待完成或验证。

Win32 Release 客户端增量编译通过。阶段核对原版类型/位置/障碍、WPM 与动态足迹重叠、进行中寻路/放置、建筑/古树、地图切换和局域网；无完整运行或原版一致性结论。

## 单位分类变化待验证

路径：`entities.h`、`session_entities.cpp`及相关战斗／施法／修理／运输／AI／经验消费者，见 `docs/unit-classifications.md`。UnitAddType／UnitRemoveType 对原版支持的九类更新实例，分类进入实际目标与行为；其他类型按原版静态入口返回 false。

Win32 Release 客户端增量编译通过。阶段核对类型增删/重复/无效、召唤／机械／古树等实际目标和伤害、修理/运输/AI、幻象/变形/死亡/易主、地图覆盖及回调重入；gamecache 保存和原版行为仍待完成或验证。

## 地表特效 Ubersplat 待验证

路径：`effects.h`、`session.h/.cpp`、`session_effects.cpp`、`session_hashtable.cpp`、`session_tick.cpp`、`game_effects.cpp`、`docs/ubersplats.md`。源表驱动地表特效的句柄、RGBA 时钟、纹理与五类混合绘制，并支持显示/完成/重置和迷雾控制。

Win32 Release 客户端增量编译通过。阶段核对 DotA 与战役特效、声音／暂停／完成／重置、哈希句柄、纹理加载／透明／雾／地形、GPU状态与切图、高密度性能及原版播放时序/混合/尺寸；原版一致性尚未验收。

## 单位替代小地图图标待验证

路径：`entities.h`、`session_entities.cpp`、`game_view.cpp`、`docs/heroes.md`。UnitSetUsesAltIcon 保存单位图标开关，小地图读取 SetAltMinimapIcon 的流式纹理，不再由键盘 Alt 状态为所有单位切换；原件 1.27 的 native 入口 `0x6f1fb310` 设置单位偏移 0x280 的 0x200 位，`0x6f3bdb33` 消费该位，REA 证据 `ev_3aa460d02faad8c26a1bd1a5acbb7bc2047b26e1dfa825e8139cf6ea54f519db`、`ev_aa8124b93fe2ccb66b20873526ac5734998e46314e3981e50b5750881e319a3a`。

Win32 Release 客户端增量编译通过。阶段验证 DotA 的 GetLocalPlayer 分支、单单位启停、空／透明／缺失及地图覆盖纹理、颜色和图标尺寸、可见性／共享视野、地图切换和 GPU；当前空或未加载纹理不画默认标记，原版默认纹理与时序尚未核对。

## 动态地表类型待验证

路径：`world.h/.cpp`、`world_blight.cpp`、`session_world.cpp`、`terrain_scene.h/.cpp`、`terrain_blight.cpp`、`docs/terrain-type-mutation.md`。SetTerrainType 修改会话地表角点和变体，地表查询与可见脏区的局部混合纹理／GPU 网格使用新值；仅支持地图已声明的地表材质。

Win32 Release 客户端增量编译通过。阶段验证 DotA 修改、地图边界与各面积形状、随机变体和联机同步、原／混合／荒芜／水面／悬崖、连续修改性能和设备恢复。非地图原材质和悬崖几何尚未实现，面积及原版纹理表现未验收。

## 高级工具提示设置待验证

路径：`game_flow_ui.cpp`、`game_preferences.*`、`game_commands.cpp`、`docs/enhanced-tooltips.md`。原 FDF 开关控制命令面板扩展描述，基本信息和不可执行原因保留；确定/取消及 camera.bin 旧版兼容已接入。

Win32 Release 客户端增量编译通过。阶段核对输入/界面布局、单位与物品/商店/建筑的提示、草稿取消/持久化/旧版本/损坏文件、原版默认值与呈现范围。其他界面提示与原版一致性未验收。

## 扩展动态地表材质待验证

路径：`world.*`、`world_blight.cpp`、`terrain_layout.cpp`、`terrain_scene.*`、`terrain_blight.cpp`、`game_view.cpp`、`docs/terrain-type-mutation.md`。动态地表类型使用独立会话索引，支持地图原始槽位外最多 256 种源材质；运行期贴图接入 SceneStreaming，未加载时保留原块。

Win32 Release 客户端增量编译通过。阶段检查满 16 原始槽的地图、原版/地图覆盖材质、开局与运行期更新、混合边界/重复变更、资源丢失/切图/设备恢复/多端同步与性能；悬崖处理和原版精度尚待完成或验证。

## 原版命令工具提示待验证

路径：`game_commands.cpp`、`game_view.h`、`glue.*`、`docs/command-tooltips.md`。命令提示使用原皮肤背景/边框/资源图标、源文本颜色和换行，支持高级说明开关及长内容分页；相同悬停内容的行数结果缓存。

Win32 Release 客户端增量编译通过。阶段验证技能/商店/建造/学习/禁用、鼠标悬停和多分辨率、长文本滚动和开关、字体/皮肤/资源释放/设备恢复及原版视觉/交互；当前布局与分页行为未证实原版一致。

## 地图 Trackable 待验证

路径：`session_trackable.cpp`、`game_trackable.cpp`、`session.*`、`script_state.h`、`session_hashtable.cpp`、`game_view.*`、`CMakeLists.txt`、`docs/trackable.md`。地图可创建模型并注册鼠标命中/跟踪事件，单机拾取和触发器上下文连接实际会话；句柄可用 hashtable 保存。

Win32 Release 客户端增量编译通过。阶段核对资源加载/大小/鼠标遮挡/范围/雾与 UI 优先级、跟踪/命中时序、触发器销毁/回调重入、模型消失与切图/GPU、原版操作与视觉；局域网事件同步尚未实现。

## 编队移动选项待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_view.cpp`、`player_commands.*`、`docs/game-options.md`。游戏性选项控制单机多选移动／攻击移动／巡逻目标分配，排队命令保存提交时状态；设置保存至 camera.bin 并兼容旧版本。联机暂固定开启。

阶段核对 FDF 控件／标签输入、游戏中 Alt+F 与聊天／菜单隔离、重复键抑制、确认取消／Esc、旧版迁移／损坏设置／跨会话保存、单多选与 Shift 队列／拥挤障碍，以及原版编队速度、默认值和联机同步。原版行为、实际窗口和对局尚未验收。

## AI 尸体技能待验证

路径：`session_ai_armies.cpp`、`docs/ai.md`。电脑单位依据真实尸体和能力状态使用复活、操纵死尸、先祖之魂、亡者复生、腐尸甲虫、复仇之魂及食尸；施法与尸体效果走已有会话生命周期。

功能阶段核对各族电脑空闲／战斗和攻击移动、有效／不可见／被占用／不可复活尸体、资源和冷却／召唤上限、目标消失与事件重入、取消和战斗恢复、多人同步及长局性能；两具尸体／70%生命／600距离的策略与原版一致性尚未证实。Win32 Release 产品增量编译通过；未执行实际对局或专项运行。

## 可破坏物遮挡高度待验证

路径：`session_destructables.cpp`、`scene_objects.cpp`、`docs/destructables.md`。脚本修改和查询使用会话状态，场景遮挡渐隐读取当前高度；战争迷雾视线遮挡仍未实现。

阶段核对原地图／动态创建、实时修改与查询、零／负／极值、缩放、隐藏／死亡／恢复／移除、视角及遮挡设置、设备恢复和原版一致性；Win32 Release 产品增量编译通过，尚未运行或验收。

## 模型动画声音待验证

路径：`model.h`、`model_particles.cpp`、`sound.h/.cpp`、`session.h`、`session_sound.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`game_model_sound.cpp`、`docs/model-event-sounds.md`。可见单位和特效的 `SNDx` 动画帧经原始 AnimLookups 和声音表进入会话空间声音。

阶段检查实际声音设备及静音、原始死亡／施法特效、同时实例、暂停／速度／跳帧／循环／动画切换／模型切换、切图资源释放、频道和空间距离／音量、覆盖及缺失音效、窗口与长局性能。Win32 Release 产品增量编译通过；原版事件节点位置、离屏声音、随机文件和脚步事件仍待实现或对照。

## Trackable 联机动作待验证

路径：`lan_actions.*`、`lan_simulation.*`、`game_trackable.cpp`、`docs/trackable.md`。指针跟踪及命中经 0x65／0x64 双字段动作编码、时间片校验与会话触发，调用方提供的对象双向映射需覆盖 Trackable。默认主程序尚未接入 LAN 对局或原版对象编号；该连接不能作为完整联机可运行结论。

阶段核对动作截断和无效 ID、稳定映射／创建顺序、同帧多个事件、触发回调／删除、发送队列与断线、双端同步、鼠标/UI 优先级和原版抓包；Win32 Release 产品增量编译通过，未执行运行或互通验证。

## 模型脚印与水花待验证

路径：`model.h/.cpp`、`model_particles.cpp`、`game_model_sound.cpp`、`game_view.h/.cpp`、`game_effects.cpp`、`docs/model-event-sounds.md`。FPT 动画节点驱动源 SplatData 图集、地面脚印和水面水花／音效；地表 footprints 控制陆地脚印。

阶段核对左右脚／骨骼动画／多模型实例、地表标志与地图覆盖、深浅水／岸边、纹理异步读取与切图释放、透明图集／旋转／坡面／迷雾／暂停／动画跳帧、声音设备与大量单位性能；离屏／全局事件、原版视觉和精确行为仍待实现或验证。Win32 Release 产品增量编译通过，未运行或验收。

## 自研客户端局域网实验流程待验证

路径：`lan_browser.*`、`lan_host_ui.*`、`lan_lobby.*`、`lan_match_loading.*`、`lan_local_identity.*`、`session_network_identity.cpp`、`session.*`、`main.cpp`、`platform.*`、`docs/lan-experimental-flow.md`、`docs/lan-local-identity.md`。显式实验模式连接大厅、地图加载和时间片对局；内部编号与部分状态摘要只供相同版本自研客户端使用。

阶段核对双端建房／查找／加入、地图传输与加载屏障、选区／移动／技能／Trackable、退出／断线／失败／取消、最小化和过场、对象创建销毁／本地分支、状态分歧、长期同步与大图性能。房间前缀无法验证对端身份，原版对象编号、状态校验及互通均未实现；Win32 Release 产品增量编译通过，未执行双端运行。

## 回放读取基础待验证

路径：`replay.*`、`CMakeLists.txt`、`docs/replay.md`。经典 W3G 容器、元数据和记录保留，时间片可由调用方交现有模拟器；原版对象映射、录制、选择界面和实际播放仍未实现。

阶段核对公开样本及本机 1.27 回放、头／块 CRC／截断／压缩上限、记录类型／片段次序、玩家和地图初始化、模拟动作／离开／聊天及长回放内存；当前 C++ 实现尚未运行。

## 维护费损失统计待验证

路径：`game_state.h`、`session_harvest.cpp`、`session_match.cpp`、`docs/economy.md`。采集时累计实际维护费扣除，供两类 GetPlayerScore 查询。

阶段核对两资源不同费率、整数舍入、直接和返还采集、玩家状态回调重入、统计上限、地图覆盖及原版累计范围；当前未运行或对照。

## 实验局域网握手待验证

路径：`lan_handshake.h`、`lan_host.*`、`lan_host_ui.*`、`lan_join.*`、`lan_lobby.cpp`、`docs/lan-experimental-flow.md`。实验双方先交换协议、能力版本和 EXE 摘要，通过后才能加入和占用槽位。

阶段核对两端握手及分包／合包、超时、旧版／原版拒绝、不同 EXE、断线／重连和正常大厅兼容；摘要不能验证公共资源或认证对端，原版互通仍未实现，当前未运行。

## 子组命令与选择待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_view.*`、`game_commands.cpp`、`glue.h`、`main.cpp`、`docs/subgroup-order.md`。选项、指针修饰键和单机命令范围接入当前子组；同类型选取及联机行为按说明的实际范围验证。

阶段核对 Ctrl／双击、Shift 组合、选择上限、命令热键与小地图、设置迁移／取消、死亡／易主及联机选择；实际窗口和原版精度未验收。

## 游戏内字幕设置待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_cinematic_panel.cpp`、`docs/game-options.md`。声音页面的字幕设置控制游戏内过场对话文字并保存在独立用户目录，兼容旧版音频设置。

阶段核对控件键鼠／确认取消、旧版与损坏文件、重启保存、静音及有声／无声场景、动态切换、影片字幕和原版默认值；实际窗口及原版行为尚未验收。

## 离屏单位模型音效待验证

路径：`game_view.*`、`game_model_sound.cpp`、`model.h`、`model_particles.cpp`、`sound.cpp`、`docs/model-event-sounds.md`。视野内单位离屏时仍推进模型声音事件，并按声音距离限制音频实例。

阶段核对入离视口、动画切换／重播／暂停、视野／隐身、死亡／易主、模型共享、距离／静音／水面及大地图性能；视野外单位、离屏特效和原版表现仍待完成或对照。

## 回放浏览与会话准备待验证

路径：`replay_browser.*`、`replay_preparation.*`、`CMakeLists.txt`、`docs/replay-browser.md`、`docs/replay-preparation.md`。浏览器与地图／录制槽位准备接口已实现；主菜单入口、原版对象映射和实际回放消费尚未接通。

阶段核对真实 W3G 读取、用户目录边界／删除确认／重解析点、异步切换与退出、地图校验／缺图／数据覆盖、稀疏玩家槽／随机种子、跨线程取消及原版输入画面；Win32 Release 产品增量编译通过，完整播放尚未实现。

## 声音分类设置待验证

路径：`game_preferences.*`、`game_flow_ui.cpp`、`game_loading.cpp`、`map_preparation.cpp`、`game_view.cpp`、`session.h`、`session_sound.cpp`、`sound.*`、`docs/game-options.md`。环境、移动和单位声音选项通过本地声音通道增益生效并持久化，脚本音量组保持独立。

功能阶段核对各复选框键鼠输入、确认／取消、旧版和损坏设置迁移、重启与切图保存、播放中的普通／堆叠声音、脚本音量组和静音组合，使用真实设备对照原版通道分类及默认值；实际运行和听感尚未验收。

## 回放时间驱动待验证

路径：`replay_runtime.*`、`CMakeLists.txt`、`docs/replay-runtime.md`。回放记录的时钟、暂停、倍速、分片拼接与回调错误状态已实现；实际播放入口、对象映射和记录消费者尚未接入。

功能阶段核对真实回放、空记录／零间隔／分片和处理上限、暂停／速度切换、时钟异常与回调失败、输入隔离和实际会话同步；当前尚未运行或完成原版兼容验收。

## 回放写入基础待验证

路径：`replay_writer.*`、`lan_runtime.*`、`CMakeLists.txt`、`docs/replay-writing.md`。内存写入经典回放容器，实验局域网时间片可由显式注册的观察器接收；保存入口、单机及完整事件采集尚未接入。

功能阶段核对真实文件及读写互通、CRC／压缩／分片和容量边界、录制失败处理、完整对局保存及原版播放器兼容；当前尚未运行或验收。

## 战鼓科技待验证

路径：`commerce.h`、`passives.h`、`session_research.cpp`、`session_auras.cpp`、`docs/research.md`。`raud` 科技增量接入发出者光环、最强来源和实际攻击加成。

功能阶段核对兽族科多兽研究前后及新建单位、多个来源和同 buff、升级／归属变化／死亡、光环残留、远近程攻击及自定义地图科技／能力覆盖；原版数值、叠加和刷新时序尚未对照。

## 夜视科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_fog.cpp`、`docs/research.md`。科技 `rauv` 在符合单位源科技列表时接入实际昼夜迷雾视野并失效缓存。

功能阶段核对昼夜切换、科技增减、已有和新建单位、所有权／共享视野、自定义地图覆盖及已有夜视能力叠加，并对照原版视野和时序。

## 尖刺路障科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_projectiles.cpp`、`docs/research.md`。`rspi` 研究值进入所属单位的近战固定反伤，复用会话伤害和事件路径。

功能阶段核对各等级和地图覆盖、既有／新建／易主建筑、近战／远程／闪避／免疫／致命伤、多个反伤来源和回调重入，并与原版数值、护甲分类／事件时序及模型表现对照。

## 尖刺护栏表现待验证

路径：`commerce.h`、`entities.h`、`effects.h`、`session_research.cpp`、`session_auras.cpp`、`game_effects.cpp`、`docs/research.md`。源模型按建筑附件动画属性播放对应出生／待机／死亡序列，研究和单位状态控制特效生命周期。

功能阶段核对塔／兽穴／兵营／基地及地图覆盖、模型缺失／回退、建设／升级／转让／死亡／移除、迷雾／暂停、设备恢复与大量建筑性能，并对照原版附件缩放、朝向和过渡动画。

## 符文科技消费待验证

路径：`session_item_use.cpp`、`docs/research.md`。`AIgl` 逐项激活源配置科技，原夜视和强化符文复用现有自动拾取／事件／消耗路径。

功能阶段核对两种原符文及自定义能力配置、多个目标科技／次数／上限、持有者转移、拾取与使用事件重入、背包与无背包、移除及科技实际效果，并对照原版重复使用与失败行为。

## 骷髅持续时间科技待验证

路径：`commerce.h`、`session_research.cpp`、`session_corpse_spells.cpp`、`docs/research.md`。`rrai` 从召唤单位的实际科技状态进入亡者复生定时生命。

功能阶段核对研究前后召唤、现存骷髅、技能／物品及自定义类型和科技覆盖、易主／死亡／驱散／定时生命事件；实际持续时间与原版时机尚未对照。

## 科技最大数量与混乱变形待验证

路径：`session.h`、`session_research.cpp`、`session_unit_forms.cpp`、`session_entities.cpp`、`session_ownership.cpp`、`session_game.cpp`、`docs/research.md`。`rtma` 消费研究等级变化；`Acha` 能力按科技前置与目标类型变形。

功能阶段核对 `Robk`／`Rhrt`、当前与新建单位、能力增删／禁用、敌我转移、科技上限脚本、自定义升级／能力、生命人口与队列／事件重入，并对照原版初始训练上限、排队和变形时序；标准初始化来自原 `InitBlizzard` 脚本，实际执行仍待验证。

## 升级兵种训练按钮待验证

路径：`session_commerce.cpp`、`docs/research.md`。同按钮位置且由 `Acha` 关联的训练单位依据旧型科技上限选择显示。

功能阶段核对兽族兵营／人族工厂的研究前后、科技上限脚本、自定义训练表／按钮与能力、共享控制、资源不足和训练队列；原版隐藏或禁用行为及脚本／AI 命令仍待对照。

## 亡者复生科技上限待验证

路径：`session_corpse_spells.cpp`、`docs/corpses.md`、`docs/research.md`。亡者复生按玩家科技最大数量逐个检查实际生成，标准 `uske` 上限由地图调用的原版 `InitBlizzard` 设置。

功能阶段核对标准地图初始化、上限前后／零／无限／自定义、多玩家和两类召唤物、死亡／移除／复生、尸体和空间不足、事件重入以及 AI 和物品来源；尸体消耗及费用时序尚需原版对照。

## 动态能力科技等级待验证

路径：`session_entities.cpp`、`session_spellbooks.cpp`、`docs/research.md`。脚本添加能力和法术书授予能力时读取单位已有 `rlev` 科技，工程学替换按原能力 ID 映射。

功能阶段核对 `Rusm` 前后新增／移除／重加 `Arai`、原巫师和自定义单位／能力、法术书／工程学替换与共存、施法中研究／转移以及实际召唤类型；原版动态赋予等级行为与事件时序尚待对照。

## 疾病与中毒分类待验证

路径：`session_entities.cpp`、`docs/unit-classifications.md`。`IsUnitType` 查询疾病云雾、攻击毒素和暗影突袭的实际状态。

功能阶段核对施加／重叠／过期／移除、死亡／复活、暂停及事件回调，并对照原版各类毒素和疾病的分类范围；当前没有实际运行或原版时序验收。

## Gamecache 单位运行时属性待验证

路径：`script_state.h`、`session_cache.cpp`、`campaign-gamecache.md`、`unit-turning.md`、`unit-classifications.md`。独立缓存版本3保存 StoreUnit 的脚本转速、推进角和分类增删，RestoreUnit 恢复后交由移动及分类消费者使用；版本1／2条目保留目标单位默认属性。

功能阶段核对 StoreUnit / SaveGameCache / ReloadGameCachesFromDisk / RestoreUnit 跨地图往返、九类分类和零／极限转向值、旧版本与混合条目重存、损坏／越界输入，以及目标单位创建事件与拾取事件重入；对照原版 StoreUnit 的具体行为。本次未执行运行验证。

## 地面物品选择阶段待验证

路径：lan_actions、lan_simulation、game_view。单机地面物品左键选择接入图标／名称／生命及场景选中圈；实验性局域网发送单位取消选择和经典 0x1c 选择，回放／网络动作消费检查身份及已知 flag；对象被拾取、删除、隐藏或不可见时取消展示。详情见 ground-item-selection.md。

阶段验证真实窗口点击／视野／单位与物品切换、网络确认／竞争与对象生命周期、已损坏／不同 flags 的回放记录、原版 1.27 动作与对象身份、Shift／多选、原版视觉及声音；已有颜色、圈大小和 HUD 排布尚未声称一致。

地面物品补充待测：`tests/order_queue_tests.cpp` 覆盖 0x1c 编解码、同一动作序列取消单位选择、地面物品移除后的实验性局域网时隙、未知身份和未知 flag 拒绝。Win32 Release 产品及 `war3_order_queue_tests` 增量编译通过，测试尚未执行；阶段运行 `war3_order_queue_tests.exe <data-root> <BootyBay.w3m>` 并与现有 order queue 验证合并。

## 脚本建造订单待验证

路径：session_orders、construction_tests、construction。`IssueBuildOrder`／`IssueBuildOrderById` 将名称或 ID 转入真实工人建造流程和已有事件，专项构建用例分别使用两种入口。Win32 Release 客户端及专项程序增量编译通过；阶段按 construction.md 中夹具及 `war3_construction_tests` 命令执行，核对名称／自定义 ID、资源／位置失败、队列替换、重入以及完整四族和原版事件时序；专项尚未执行。

## 脚本相机旋转待验证

路径：session_world、world、game_flow_tests、campaign-cinematics。镜头围绕指定中心和 +Z 旋转，StopCamera 暂停支持的平移和字段插值；目标与朝向控制器互斥。Win32 Release 客户端及专项程序增量编译通过；阶段按 `tests/generate-game-flow-fixture.py --data-root <data-root>` 和 `war3_game_flow_tests.exe <data-root> <fixture.w3m>` 执行，核对目标／方向跟随、手动操作、停止控制器、倾斜地形及原版视觉时序。

## 单位魔法阈值即时通知待验证

路径：`session_spells.cpp`、`session_self_spells.cpp`、`session_damage.cpp`、`session_regeneration.cpp`、`docs/unit-state-events.md`。普通施法、即时自身施法、魔法盾吸收和自然恢复的魔法变化接入阈值事件及回调重入检查；其他状态写入仍按原有步末补查。

阶段按 `unit-state-events.md` 执行夹具及会话专项，并覆盖施法取消／移除／易主、魔法盾回调移除 buff 或击杀、自然恢复及同一步跨越与复位；原版事件顺序和完整消费者尚未对照。本次 Win32 Release 产品增量编译通过，专项尚未执行。

## 实验回放倍速待验证

路径：`main.cpp`、`docs/replay-experimental.md`。游戏画面的加减键切换 0.25 至 8 倍，界面显示当前速度；空格暂停／继续与 Esc 返回仍可用。

阶段使用同构建实验局域网回放验证各档时间推进、键盘主区及数字小键盘、边界、暂停调速、最小化恢复、结束及过场切换，并核对时间片顺序和旁观输入隔离；原版回放播放与原版快捷键仍未实现或对照。本次 Win32 Release 产品增量编译通过，实际播放尚未执行。

## 脚本直接设置迷雾待验证

路径：`session_fog.cpp`、`fog_grid.cpp`、`tests/generate-live-world-fixture.py`、`docs/live-world.md`。矩形、圆形和地点三个 SetFogState 接入玩家网格、查询及绘制；共享接收者使用当前共享视野联盟，视野重算重新计算可见状态。

阶段执行 `python tests/generate-live-world-fixture.py --data-root <data-root>`，再执行 `war3_live_world_tests.exe <data-root> <fixture.w3m> <log>`，并核对三种状态、重叠先后、移动与视野重算、共享联盟方向及变化、多玩家、启停迷雾、半径／矩形网格边界、越界／极值、GPU 纹理、切图释放和原版时序。Win32 Release 产品增量编译及夹具 Python 语法检查通过，实际运行和原版一致性尚未验收。

原版 1.27 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`；REA 证据 `ev_cbbbda324c9a7891de147bec6ae7b849cf013107273b043d058071cd97ad0b3d`、`ev_56b27f56bec8efd912e38387ac2617dffeeb90ea21e3d1bb2a93412d7f04e9b1`、`ev_f385bebfa3568eabbb0cbe19f3b0b7a134597367073c280f816822565db2f8f0`、`ev_eed52956f1519d8865d342a15d3de269a9e392e3849d97b53e225080f309d697` 和 `ev_f88f18ba19415b8ef6df5c8a06b80de7aa1185a3641049128afa7f9d479bde60` 表明三个入口直接写入玩家位图并分别处理 1／2／4 状态；共享掩码来源及刷新后的持续性尚未确认。

脚本迷雾补充：连续设置不同玩家的状态时，保留未受影响玩家当前有效的网格版本；此前因真实视野变化而失效的网格仍重新计算。夹具增加玩家 0 可见、玩家 1 遮蔽后再次查询玩家 0 的场景。Win32 Release 产品增量编译与夹具语法检查通过；专项行为、共享接收者和多玩家纹理仍待合并验证。

## JASS Pow 待验证

路径：`session_game.cpp`、`tests/generate-live-world-fixture.py`、`docs/jass.md`。`Pow(real, real)` 返回计算所得单精度实数；DotA `Scripts/war3map.j` 使用该函数计算技能距离。

阶段执行 live-world 夹具及消费者，核对正数、负底数整数指数、小数指数、零、溢出和非法输入，并对照原版结果与 DotA 技能范围；夹具新增正整数、负整数和平方根三种情况。当前尚未运行专项或取得原版浮点精度证据。

## 相机眼睛坐标待验证

路径：`camera_control.h`、`session_world.cpp`、`game_view.cpp`、`tests/game_flow_tests.cpp`、`docs/camera-eye.md`。四个眼睛坐标 native 与绘制共享视角几何；DotA `DD5` 使用眼睛 XY 决定镜头平移。Win32 Release 产品和会话专项增量编译通过，专项未执行。

阶段按 `camera-eye.md` 的夹具和消费者命令核对字段／句柄、真实窗口的平移／旋转／缩放／跟随、噪声和原版坐标；会话水面高度、局域网本地镜头及跟随时序仍有未完成边界。

## 地形波纹阶段待验证

路径：`world.h`、`world_height.cpp`、`session.h/.cpp`、`session_world.cpp`、`session_tick.cpp`、`terrain_scene.*`、`terrain_blight.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Ripple 和停止接口连接会话时钟、共享地形高度及地面／悬崖／荒芜顶点；不重建地形纹理。

按 `terrain-deformation.md` 运行专项并合并 DotA、波形及停止、网格边界、单位贴地、GPU 和性能验证；原版时间与坐标精度及其他变形类型仍未完成。专项尚未执行。

## 陨坑与行进波纹待验证

路径：`world.h`、`world_height.cpp`、`session_world.cpp`、`terrain_scene.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Crater 和 Wave 连接原生句柄、时钟、共享地形高度与绘制；永久凹坑自然到期固化，StopAll 保留已固化高度。未变化顶点跳过 GPU 上传。

阶段执行现有 game-flow 夹具和消费者，核对普通／永久陨坑、自然结束／停止／交错、重叠与固化量化、Wave 方向／拖尾／循环、异常参数、脚本高度及单位贴地、GPU 设备恢复、实际画面、原版结果和性能。专项尚未执行。

## 随机地形变形待验证

路径：`world.h`、`world_height.cpp`、`session_world.cpp`、`session_tick.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。Random 连接会话随机源、按间隔缓存角点、共享地形查询／绘制和停止时钟；会话主 RNG 已接入原版双状态算法，完整采样顺序与同步仍待验证。

阶段执行 game-flow 夹具及消费者，核对固定种子／区间／边界、查询不消耗随机数、首次与重复采样、停止／超时／暂停、效果叠加、原版网格与 RNG 顺序、多客户端同步、GPU 和大范围采样性能。专项尚未执行。

## 游戏随机状态与 JASS 范围待验证

路径：`session.h/.cpp`、`session_game.cpp`、`session_network_identity.cpp`、`tests/game_flow_tests.cpp`、`docs/terrain-deformation.md`。游戏独立实例复用原版双状态 RNG；会话构造直接初始化传入种子，脚本 SetRandomSeed 预热一次，JASS 整数／实数范围按原件边界消费随机数，实验局域网校验包含两个状态字。

阶段按 terrain-deformation.md 的 game-flow 命令执行原件 seed=17 向量、相等／逆序／全整数范围／实数 epsilon、脚本和随机地形共享状态；合并多种子、技能／随机池、随机采样顺序、真实双方同步及回放验证。原版默认和大厅初始种子流程、辅助随机组件以及完整调用顺序尚未确认；本次专项尚未执行。

## 单位睡眠权限待验证

路径：`session_control_spells.cpp`、`tests/control_tests.cpp`、`docs/control-spells.md`。四个睡眠权限 native 使用 ACsp／Asla 真实能力及现有能力生命周期；权限与当前睡眠状态分开。Win32 Release 产品和专项程序增量编译通过，专项未执行。

阶段按 control-spells.md 运行 flow 夹具，核对两种权限的新增／删除／重复／空单位、能力句柄与自定义单位、变形／死亡／易主、与魔法睡眠及唤醒交互，并对照原版；自然昼夜睡眠尚未实现。原版入口及能力证据为 `ev_070b138d97f97b6aee4ce2a89730ccadfe0d7169f94c1957e4b2568ecbdbe950`、`ev_b4815f23492ab1abeda8ce8d47808fb3f4ab36a02d322cbf01ba33ea5272769e` 和 `ev_280a65f12454e74fb1a209f0d04ce862ba47c70a56316a01448f32de873b60a2`。

## 暴击、重击辅助随机与伪随机计数待验证

路径：`audio_random.h`、`session.h/.cpp`、`session_game.cpp`、`entities.h`、`session_attack_passives.cpp`、`session_spells.cpp`、`session_equipment.cpp`、`session_network_identity.cpp`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。SetRandomSeed 派生 45 条辅助流；暴击、重击和醉拳按源 PRD 表及能力计数使用第 3 条流，实验局域网校验包括流状态与计数。初始会话以主随机对象副本派生辅助流，原版开局种子／时序尚未确认。

阶段执行 passive 夹具及 `war3_passive_tests.exe`，覆盖 seed 17 的 15% 连续 8 次计数、0／100%、重击／醉拳、技能等级／移除重加／库存／变形／死亡／易主、目标门控、重入、与脚本主随机流隔离和多端同步；向量由原件核对的随机表及倒数表静态推算，尚非原件运行态结果。相同技能多物品实例目前合并计数；原版其他辅助流消费者和实例／调用顺序待实现或对照。原件证据 `ev_386c6c37e21063ff442761139eede26c7c2607ac004f74fd966205a142cc6b8f`、`ev_209c7884597b4c7bc81e563be04e4f4aae019519e59ae369f10f6d5ab884a42f`、`ev_4a630a7a9c648a176ae172259d14881961fa370d0b444ffd42fd7b671ddc4865`。专项尚未运行。

## 法球缺省弹道待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`session_weapon_effects.cpp`、`session_projectiles.cpp`、`docs/weapon-effects.md`。缺省速度的物品法球弹道采用暂定速度并进入实际飞行与命中流程；非零武器速度和法球速度仍按原参数使用。

阶段覆盖 Hpal／Obla 装备法球的移动目标、飞行期间目标死亡／移除、发射者移除、切图释放、不同距离的命中时间、近战即时攻击、非零武器及法球速度覆盖和多法球选择；对照原版速度与命中时序。玩法、画面、性能和原版精度均待验证。

## 自然昼夜睡眠待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`entities.h`、`session.h`、`session_control_spells.cpp`、`session_tick.cpp`，实现说明见 `control-spells.md`。自然睡眠接入会话时钟、实际单位状态、动画、敌人接近、伤害及脚本唤醒；当前资格、唤醒范围及当夜重睡规则为暂定行为。

功能阶段合并验证昼夜与时间跳转、暂停、两种睡眠权限、敌人靠近／伤害／脚本唤醒、魔法睡眠叠加、死亡／易主／变形、双端同步和大地图性能，并对照原版。运行和原版一致性尚未验证。

## 小地图单位颜色待验证

本次合并 Win32 Release 客户端编译通过；功能专项尚未运行。

路径：`game_view.cpp`，说明见 `minimap-colors.md`。小地图单位标记接入玩家颜色、单位颜色覆盖与机械伪装，选中和替代图标沿用对应绘制流程。

功能阶段验证多玩家、SetPlayerColor／SetUnitColor、易主、伪装、视野与中立单位、选中及替代图标、资源未就绪和切图 GPU 生命周期，并对照原版小地图颜色与表现；当前尚无实际窗口或原版一致性验收。

## 全局变量阈值事件待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`jass_runtime.h/.cpp`、`script_state.h`、`session_callbacks.cpp`、`tests/session_tests.cpp`；标量 real 变量赋值通过实际 VM 存储入口派发阈值触发器，详细边界见 `script-events.md`。

阶段运行 `war3_session_tests.exe <tmp/docs-artifacts/war3/jass/session-variable-events.json>`，并验证全部比较符、赋值重入／睡眠、多个监听、启停／销毁、原值已满足、无效变量与真实自定义地图及联机同步，对照原版事件时序与边界。当前专项尚未执行。

## 钻地侦测能力待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`session_passive_info.cpp`、`tests/generate-undead-forms-fixture.py`、`tests/undead_forms_tests.cpp`；Abdt 家族接入既有侦测网格及自定义覆盖，源数据与当前规则见 `burrow-detection.md`。

阶段按 undead-forms 夹具及消费者验证源零掩码和自定义位、增删能力、移动、共享视野、潜地目标及地图覆盖，并核对原版能力来源、掩码语义、界面与性能。专项及原版一致性尚未验证。

## 多选单位面板待验证

Win32 Release 客户端与关联会话／亡灵形态消费者程序已合并编译通过；专项未执行。

路径：`game_selection_panel.cpp`、`game_view.cpp/.h`、`CMakeLists.txt`，见 `selection-panel.md`。多选头像、生命、子组、选择操作及单位目标命令连接现有选区、命令和实验联机时间片。

阶段验证真实窗口的多选、Shift／Ctrl、目标与取消、选中单位被回调移除或死亡、图标加载、货舱／物品／命令区，双端确认与回放及原版排布和交互；本次专项未运行。

## 单位关系查询和地点起点待验证

Win32 Release 客户端及关联消费者程序已合并编译通过；其后 AI 购买筛选有改动，执行阶段需重新链接相关消费者。专项未执行。

路径：`session.cpp`、`session_entities.cpp`、`tests/session_tests.cpp`、`tests/live_world_tests.cpp`，见 `entities.md`。单位身份、种族和 force 查询使用实际状态；地点起点写入真实地图配置。

阶段运行 session 与 live-world 消费者，验证地点复用／销毁、边界索引、单位易主／变形、force 增删／销毁、空及失效句柄和实际自定义地图；对照原版返回值。专项尚未执行。

## AI 英雄物品待验证

Win32 Release 客户端增量编译通过；专项未执行。

路径：`ai.h`、`session_ai.cpp`、`session_ai_transport.cpp`；物品使用、购买、前往商店和订单预约接入实际消费者，规则与暂定阈值见 `ai-hero-items.md`。

阶段验证目标／使用次数／冷却、回调重入、敌人接近、商店失效／库存／资金、订单覆盖、寻路及暂停、四族长局、实验联机同步及原版策略；现有联机摘要不包含 AI 预约状态。专项未执行。

## 单位战斗信息面板待验证

Win32 Release 客户端及关联消费者程序已合并编译通过；其后 AI 购买筛选有改动，执行阶段需重新链接相关消费者。专项未执行。

路径：`combat.h`、`session.h`、`session_attack_passives.cpp`、`session_damage.cpp`、`session_research.cpp`、`game_commands.cpp`、`tests/passive_tests.cpp`；面板消费共享武器伤害和护甲计算，范围与显示边界见 `unit-combat-panel.md`。

阶段合并 passive 专项及真实窗口，验证单／多选切换、生产及货舱、四族和双武器、科技／装备／状态／光环、极值、回调移除、设备恢复和原版显示。专项尚未执行。

## 静态单位类型查询待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`；类型分类与未支持的运行态范围见 `unit-id-classification.md`。

阶段生成 research 夹具并运行 `war3_research_tests`，验证源／自定义单位、继承、飞行、武器及类别，未知 ID、运行态类别与无创建副作用，并对照原版；专项尚未执行。

## 受攻击提醒待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`entities.h`、`session.h`、`session_text.cpp`、`session_damage.cpp`、`tests/game_flow_tests.cpp`；实际攻击伤害连接本地提示、原皮肤音效和小地图颜色，脚本可禁用；规则及暂定间隔见 `attack-alert.md`。

阶段合并 game-flow 夹具，验证脚本开关／无效单位、伤害／抵挡／事件回调、单位与建筑、提示去重、暂停、窗口／听感、地图皮肤覆盖、多客户端及原版差异。专项尚未执行。

## 单位 Buff 面板待验证

Win32 Release 客户端及相关 game-flow／research 消费者程序已合并编译通过；专项未执行。

路径：`game_buff_panel.cpp`、`game_view.cpp/.h`、`session.h`、`CMakeLists.txt`；显示和资源边界见 `buff-panel.md`。

阶段验证 Buff／光环增减与过期、单／多选、图标流式加载和缺失、原皮肤和地图覆盖、悬停文本、窗口／GPU 恢复和性能，核对原版布局／排序。专项尚未执行。

## 实验回放接收地图关联待验证

路径：`replay_experimental.*`、`replay_preparation.*`、`replay_browser.cpp`、`lan_mapcheck.*`、`lan_lobby.*`、`lan_match_loading.*`、`platform.*`、`main.cpp`；保存回放时按内容关联原始地图，播放优先读取安装地图，细节及清理边界见 `replay-experimental.md`。Win32 Release 客户端编译通过，实际回放未执行。

阶段验证已安装原图／接收图、后台摘要、哈希不符和文件占用、共享硬链接／复制回退、删除前内容替换及并发访问、失败后回放保留、进程异常、双端和重启播放；核对删除时的界面响应及内存开销。原版回放互通仍待实现。

## 地图 Buff 覆盖待验证

路径：`object_data.h/.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `buff-overrides.md`。Win32 Release 客户端及 research 消费者已合并编译。阶段生成 research 夹具并运行对应消费者，检查原 Buff 修改、自定义 Buff 继承、大小写及图标／描述／特效字段；在真实自定义地图验证画面、切图释放和原版行为。专项及实际运行尚未验证。

## 任务列表滚动条待验证

路径：`quest_dialog.h/.cpp`、`glue.h/.cpp`，说明见 `quests.md`。Win32 Release 客户端已合并编译。阶段在真实窗口验证主线／支线／目标列表及说明的显示条件、点击、拖动和滚轮，色码／长中文／空行／极长文本、任务增删与选择变化后的偏移、界面焦点、性能和原版布局。实际窗口及原版一致性尚未验证。

## 回放删除后台化待验证

路径：`replay_browser.h/.cpp`，说明见 `replay-experimental.md`。Win32 Release 客户端已合并编译。阶段在真实窗口检查大地图校验时的帧率、读取／删除错误提示、文件锁和替换、硬链接、并发、目录重解析以及关闭／取消边界；实际运行尚未验证。

## W3G 聊天记录待验证

路径：`replay.h/.cpp`、`main.cpp`、`session.h`、`session_spatial_events.cpp`、`tests/session_tests.cpp`，说明见 `replay-chat.md`。Win32 Release 客户端及会话消费者已合并编译。阶段合并会话专项与真实回放，核对各频道、私聊槽位、触发器、文本编码、记录顺序与异常输入；原版回放入口仍未开放，尚无实际播放及原版一致性验收。

## 地形变形物件高度待验证

路径：`entities.h`、`session.h`、`session_destructables.cpp`、`scene_objects.h/.cpp`、`game_view.cpp`、`game_effects.cpp`、`tests/game_flow_tests.cpp`，说明见 `terrain-deformation.md`。Win32 Release 客户端和 game-flow 消费者已合并编译。阶段合并 game-flow 夹具并验证原有和变形中创建的可破坏物、普通装饰物、波纹／永久凹坑／停止、附着特效、点选／遮挡、地形边界及远区裁剪，并对照显式 Z 的原版行为与大地图性能。专项、实际画面和原版一致性尚未验证。

## 盟友颜色过滤待验证

路径：`world.h`、`session_text.cpp`、`game_view.h/.cpp`、`tests/game_flow_tests.cpp`，说明见 `ally-color-filter.md`。Win32 Release 客户端和 game-flow 消费者已编译；阶段验证三档、小地图／单位颜色、Alt+A、观战／联盟／伪装、地图覆盖、GetLocalPlayer 和原版按钮及画面。实际窗口和原版一致性尚未验证。

## 缓存同步动作接收待验证

路径：`lan_cache_sync.h`、`lan_actions.h/.cpp`、`lan_simulation.h/.cpp`、`session.h`、`session_cache.cpp`、`tests/session_tests.cpp`，说明见 `cache-sync.md`。Win32 Release 客户端和会话消费者已编译；阶段验证编解码、实际时间片顺序／容量、两端缓存、坏数据、并发及回放。JASS 发送与唤醒、单位快照及原版互通尚未完成。

## 资源总分待验证

路径：`session_match.cpp`、`tests/harvest_tests.cpp`，说明见 `player-scores.md`。Win32 Release 客户端和采集消费者已编译；阶段验证资源返回、维护费、玩家隔离、溢出与原版结算统计。专项尚未运行。

## 对象名称查询待验证

路径：`map_ui.h/.cpp`、`object_data.h/.cpp`、`session_game.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `object-names.md`。阶段验证 Profile ID、单项／多项／带引号逗号、空与缺失名称、覆盖优先级、继承及 DotA 调用，并与原版对照。专项尚未运行。

## 天气区域与渲染待验证

路径：`map.cpp`、`session.cpp`、`session.h`、`session_weather.cpp`、`game_weather.cpp`、`game_view.h/.cpp`、`scene_streaming.h/.cpp`、`tests/map_tests.cpp`，说明见 `weather.md`。Amazonia 最小 main 检查通过且未加载 Game.dll；阶段验证 W3I 默认值、脚本区域启停／移除、不同源类型和图集、缺失／损坏纹理、摄像机移动、小区域、时间片、设备恢复、声音、长局和原版画面／性能。GPU 实际画面和原版一致性尚未验证。

## 缓存同步发送与小地图按钮待验证

路径：`session_cache.cpp`、`session_tick.cpp`、`session_collections.cpp`、`session.h`、`lan_runtime.h/.cpp`、`game_view.cpp`、`game_loading.h/.cpp`、`session_text.cpp`、`world.h`、`tests/session_tests.cpp`、`tests/revival_tests.cpp`、`tests/game_flow_tests.cpp`；详情见 `cache-sync.md`、`ally-color-filter.md`。Win32 Release 客户端及相关消费者已编译；`war3_revival_tests <data-root> <fixture.w3m> lan-leave` 的最小队列顺序及离开检查 1 项通过、0 失败。阶段验证单机回显、实际发送／双端和回放、堵塞／超长／离开、按钮状态／快捷键／悬停及多人本地状态。单位缓存快照和原版联机互通仍未完成。

## 天气环境音待验证

路径：`session_weather.cpp`、`session_sound.cpp`、`session.h`，说明见 `weather.md`。阶段验证原版雨／风标签、音量与环境音选项、静音切换、进入／离开区域、重叠同名和不同名区域、启停／移除、切图释放、自定义空间声与异常资源，并对照原版听感和过渡；Win32 Release 客户端编译通过，实际音频尚未验收。

## 小地图野怪营地待验证

路径：`game_loading.h/.cpp`、`game_view.h/.cpp`，说明见 `creep-camps.md`。Win32 Release 客户端已编译；阶段验证原始贴图／位置／提示、点击／Alt+R／禁用、过滤状态脚本、营地分组及等级阈值、野怪死亡／易主、迷雾、动态生成、皮肤覆盖、大小地图性能及原版对照。原模型动画尚未实现；动态重建的结果与性能尚未验证。

## 小地图底图、地形开关与迷雾待验证

路径：`game_loading.h/.cpp`、`game_view.h/.cpp`、`main.cpp`，说明见 `minimap.md`。Win32 Release 客户端编译通过；BootyBay 临时副本删除底图后的单帧对局启动通过，日志 `tmp/docs-artifacts/war3/weather-source-probe/no-minimap-play-final.log`。阶段验证 Alt+T/A/R/F、回放速度与 Alt+F4、按钮交叠及皮肤覆盖、三图和无底图地图的画面／地图方向、迷雾／战争迷雾切换、营地／单位／提示遮罩、运行时地形改变、设备恢复和帧耗时，逐项与原版对照；单帧启动不代表视觉或实际交互通过。

## 背包科技待验证

背包路径：`session.h`、`session_inventory.cpp`、`session_equipment.cpp`、`tests/research_tests.cpp`，说明见 `backpack-research.md`。阶段执行 research 夹具和消费者，核对四族科技前后、能力覆盖／前置数量、拾取、装备、易主／死亡／删除、英雄六槽和自定义建筑前置性能。 Win32 Release 客户端与 research 消费者已编译，专项和原版对照尚未执行。

## 对局分数待验证

路径：`game_state.h`、`session_match.cpp`、`session_production.cpp`、`session_construction.cpp`、`session_callbacks.cpp`、`tests/commerce_tests.cpp`，说明见 `player-scores.md`。Win32 Release 客户端及 commerce 消费者已编译。阶段执行 commerce 和 harvest 消费者，核对不同类型生产／建筑／击杀、英雄经验／归属、资源与总分；另对照原版初始单位、脚本创建、召唤／幻象、免费建造、复活、移除、变形、溢出及联机／结算。专项和原版对照尚未执行。

## 整数游戏状态待验证

路径：`script_state.h`、`session.h`、`session_callbacks.cpp`、`session_match.cpp`、`tests/session_tests.cpp`，说明见 `integer-game-state.md`。阶段执行 session 消费者，核对读写／越界、完整位型、比较符、事件上下文、注册／销毁、回调重入和时间状态隔离；另与原版对照初值、阈值换算与事件时序，并验证本地断线与联机同步。Win32 Release 客户端及 session 消费者已编译；专项和原版对照尚未执行。

## 科技百分比待验证

路径：`object_data.h/.cpp`、`session_match.cpp`、`tests/research_tests.cpp`，说明见 `player-scores.md`。阶段执行 research 消费者，核对四族与无科技种族、0／多级研究、地图自定义覆盖、`used`／`maxlevel`、错误输入和玩家隔离，并与原版比较有效科技、种族映射、随机种族时序、百分比精度及多人同步。Win32 Release 客户端与 research 消费者已编译；专项与原版对照尚未执行。

## 单位类型 ID 运行态与召唤分类待验证

路径：`session_entities.cpp`、`tests/generate-research-fixture.py`、`tests/research_tests.cpp`，说明见 `unit-id-classification.md`。阶段运行 research 夹具与消费者，核对 1、10、11–13、21–26、越界类别、未知大写 ID、自定义 summoned 与精确 token；对照原版实例召唤标记及自定义地图行为。Win32 Release 客户端与 research 消费者已编译；专项与原版对照尚未执行。

实例源召唤分类新增 `entities.h`、`session_entities.cpp`、`session_ai_armies.cpp`、`session_caster_spells.cpp`、`session_control_spells.cpp`、`session_feedback.cpp`、`session_magic_consumption.cpp`、`session_ownership.cpp`、`session_rewards.cpp`、`session_weapon_effects.cpp` 及 research 夹具检查。Win32 Release 客户端及 research 消费者已编译；阶段合并验证普通创建的源召唤类型、显式增删、驱散／控制／经验／AI／攻击效果、限时生命、变形及幻象，并对照原版动态分类和事件；新增检查尚未运行。

## 战役动画稀有度待验证

路径：`model_sequence.h/.cpp`、`model.cpp`、`session_visual.cpp`，说明见 `animation-rarity.md`。Win32 Release 客户端已编译；阶段验证 NightElfX01 实际脚本、普通／稀有序列、缺失类别回退、模型变化、动画队列、附件及多人确定性，核对原版权重与时序；专项和原版对照尚未执行。

## 安装版本与回放产品待验证

路径：`session.h/.cpp`、`session_game.cpp`、`map_preparation.h/.cpp`、`replay.h/.cpp`、`replay_preparation.h/.cpp`、`tests/session_tests.cpp`，说明见 `game-version.md`。阶段运行 session 与回放准备消费者，核对安装基础版／资料片支持位、WAR3／W3XP／未知产品、全局初始化与 config 顺序、兼容矩阵、战役和版本状态隔离；对照原版许可、资源缺失、ROC／TFT 回放、资源优先级及科技百分比；当前 ROC 回放仍使用含 TFT 的归档视图。Win32 Release 客户端及 session 消费者已编译；专项与原版对照尚未执行。

## 实验回放时间显示待验证

路径：`replay_runtime.h/.cpp`、`main.cpp`，说明见 `replay-experimental.md`。阶段验证正常及零时长记录、分片、时间片应用失败、暂停／恢复、各档倍速、最小化与过场、长时长及窗口缩放，核对实际时间片与显示；Win32 Release 客户端增量编译通过，实际播放和原版显示待验证。

### 局域网任务窗口（待验证）

路径：`game_view.cpp`、`docs/quests.md`。实验局域网允许 F9／顶部入口打开和关闭任务窗口，确认本地提示并保持对局模拟。集中验证双端不同时间打开／关闭、任务动态变化、闪烁、聊天／菜单／离开交互、键鼠和模拟同步；原版窗口与暂停规则待对照。本次仅作差异检查，运行验收未执行。

### 战役菜单环境音（待验证）

路径：`campaign_browser.h/.cpp`、`main.cpp`、`docs/campaign-flow.md`。各战役读取源 `AmbientSound` 标签，使用原声音表与内存资源循环播放；切换或离开时释放，尊重音效音量、环境音开关和静音参数。集中验证全部 ROC／TFT 战役切换、相同标签连续选择、反复进出／游戏／影片切换、缺失资源和设备错误、音量及静音设置、长时资源释放与原版听感；背景雾语义尚待研究。Win32 Release 客户端增量编译通过，实际播放尚未执行。

### 不可达目标的移动落点（待验证）

路径：`world_path.cpp`、`world.h`、`session_orders.cpp`、`session_combat_orders.cpp`、`session.h`、`tests/world_tests.cpp`，说明见 `water-pathing.md`。普通移动与攻击移动在目标格可通但不可达时按已访问的可达区域选择接近落点，限定原 A* 搜索预算；事件仍使用点击坐标。Win32 Release `war3_world_tests` 编译通过；隔墙回退及既有阻挡目标两项定向检查各 1 通过、0 失败，未加载 Game.dll。待集中验证不同地形／半径、墙体／封闭区、达到预算、目标阻挡或中途变化、多选／巡逻／队列、AI 与真实窗口；原版落点规则尚未对照。

### 盟友受攻击提醒（待验证）

路径：`session_text.cpp`、`session.h`、`docs/attack-alert.md`。盟友单位／建筑受到实际敌方攻击伤害时读取对应原皮肤声音及小地图提示，己方和盟友分别限频。本次未编译或运行；集中验证双方联盟方向／共享视野、敌方与自伤、单位／建筑、无效或完全吸收的伤害、死亡／易主回调、忽略警报、己方和盟友连续攻击／独立冷却、皮肤覆盖、静音／听感及双客户端模拟一致性，并对照原版触发和时序。

### 游戏 HUD 顶部按钮文字（待验证）

路径：`game_loading.h/.cpp`、`game_view.cpp`、`docs/game-flow.md`。验证菜单／盟友／任务按钮在不同语言与地图覆盖资源下的文字、颜色、闪烁、位置、长文边界与点击热区，并与 1.27 画面及快捷键对照；Win32 Release 编译和实际窗口待合并验证。

### 战役章节页恢复（待验证）

路径：`campaign_browser.cpp`、`docs/campaign-flow.md`。返回章节页后按最新战役进度恢复选择并重新准备可用地图；不同战役切换时选择目标首章。集中验证胜利／失败／菜单退出、相同及不同战役、章节解锁／禁用、影片条目、准备失败／取消／重复返回、后台旧请求失效与资源释放，并与原版对照实际选择及窗口行为。实际战役未执行。

2026-10-30 合并实现编译：`4ac3dd7`、`f3fe84c` 和 `4e33599` 所在 Win32 Release 集成版本执行 `cmake --build --preset release --target war3 --parallel 8` 通过；上述三项玩法、窗口与原版对照仍待验证。

### 战役脚本默认难度（待验证）

路径：`session_match.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-flow.md`。集中执行 game-flow 夹具，核对四种难度读写、默认值与当前值隔离，以及 Blizzard.j 胜利回调恢复当前难度；覆盖跨关、重开、战役资料、原版默认值／持久化、无效值和多人行为。该夹具新增断言尚未编译或执行；原版行为与实际战役待对照。

### 电脑英雄回城（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。启用英雄逃跑时，危急英雄通过实际回城物品向己方主基地施法；阶段验证四族 AI、生命与敌人阈值、魔免／无敌、技能和物品优先级、卷轴次数／冷却／耗魔、敌我视野／基地有效性、打断／事件重入及多人确定性，并与原版行为对照。源码仅作差异检查，编译及实际对局未执行。

### 地图脚本回放保存控制（待验证）

路径：`session.h`、`session_game.cpp`、`main.cpp`、`docs/replay-experimental.md`。阶段验证 main 和对局中调用、多个玩家本地分支、结算保存按钮与异常退出自动保存、提前保存后的已有文件、录制器释放及下局状态重置；对照 1.27 的自动／手动保存边界。实验局域网双端、原版行为及单机录制仍待验证或实现。

2026-10-30 合并实现编译：`fbed693`、`58defa2` 和 `ae4e697` 所在 Win32 Release 集成版本执行 `cmake --build --preset release --target war3 --parallel 8` 通过；玩法、保存和原版对照仍待验证，新增测试断言尚未运行。

### 采集返还可达基地（待验证）

路径：`session_harvest.cpp`、`commerce.h`、`session.h`、`docs/economy.md`。验证隔墙最近基地／可达次近基地、超过四个不可达候选的轮转、候选增删／易主／建造／暂停、动态路径阻塞及恢复、金木双资源与事件回调、显式目标语义；检查无候选时携带资源保留、每秒重试及高密度地图性能，并与原版选点／事件时序对照。本次仅差异检查，玩法和产品编译待合并验证。

### 战役对白表格式坐标（待验证）

路径：`slk.cpp`、`sound.cpp`、`tests/sound_tests.cpp`、`docs/campaign-cinematics.md`。Win32 Release 产品及声音测试目标编译通过；格式游标及普通表各一项定向通过。Human01 原图已越过对白标签阻塞，后续在 w3u 尾字段中止；原始日志见 `tmp/docs-artifacts/war3/campaign/human01-120s-sylk-1030.log`。集中验证源表和地图覆盖的全部相关声音、实际听感、异常及截断、格式／公式与各类对象表兼容，并完成原版战役实际流程。

### 经典对象覆盖尾字段（待验证）

路径：`object_data.cpp`、`tests/map_tests.cpp`、`docs/object-overrides.md`。Win32 Release 产品与地图测试目标编译通过；原 Human01 `oC16/umdl/owar`、合成非零尾字段及截断拒绝一项定向检查通过。Human01 越过对象覆盖后在 `IssueImmediateOrder` 无效句柄处停止，证据 `tmp/docs-artifacts/war3/campaign/human01-120s-objects-1030.log`。阶段覆盖五类覆盖文件、来源继承、不同末尾字段／损坏／截断和实际地图玩法，确认尾字段与原版语义。

### 空单位即时命令（待验证）

路径：`session_entities.cpp`、`session_orders.cpp`、`docs/player-commands.md`。Win32 Release 编译通过；Human01 原图 main 越过空单位命令并完成初始化，请求 120 秒静音推进的检查返回成功，实际模拟 36.96875 秒后处于对话框／暂停，未完成整关。集中验证字符串／编号、null／无效／已销毁单位、命令事件／队列、回调重入及原版返回值；真实窗口与战役继续留待验收。日志 `tmp/docs-artifacts/war3/campaign/human01-120s-nullorder-1030.log`。

### 采木目标可达性（待验证）

路径：`commerce.h`、`session.h`、`session_destructables.cpp`、`session_lumber.cpp`、`docs/destructables.md`。集中验证树木死亡／移除、隔墙树与可达替代、四个以上候选的轮转、无候选／暂时不可达、树木复活、路径动态变化、携木返还后接续、晕眩／定身／停止／重下命令、农民／苦工／食尸鬼／小精灵及脚本事件；对照原版选择规则并测量密集树林与大量工人的 CPU 开销。当前未编译或运行，保留批次验证。

### 玩家小地图信号（待验证）

路径：`game_loading.*`、`game_view.*`、`glue.h`、`main.cpp`、`player_commands.*`、`session_text.cpp`、`session.h`、`lan_actions.*`、`lan_action_encoder.cpp`、`lan_simulation.*`、`docs/minimap.md`。阶段验证 Alt+G、按钮和 Alt+左键在地面／小地图的落点、键鼠按下与松开、取消／失焦／聊天和其他弹窗隔离、资源缺失／地图皮肤、提示音及模型；验证己方／单向与双向盟友／敌方／观察者的可见范围、改变联盟顺序、无选择发送、时间片重放、畸形／非有限坐标和长时间发送资源释放。对照原版 1.27 的按钮坐标、样式、快捷键、颜色、声音、收件人及 0x68 原始字段；实验双端和回放尚未验收。

### 开局队伍联盟（待验证）

路径：`session.h`、`session.cpp`、`lan_setup.cpp`、`tests/setup_tests.cpp`、`docs/map-loading.md`。同队已启用或地图声明的中立玩家初始化基础联盟，记录 config 阶段逐位覆盖，并消费自定义 force 视野与控制标志。Win32 Release `war3` 和 `war3_setup_tests` 合并编译通过，包含 `ed488c6`、`66fd97e`；setup 检查 5/5 通过。Human01 原图静音战役上下文最小检查推进 60 秒，阿尔萨斯与乌瑟尔未相互攻击、生命 650／1250；仅证明开场，不表示完整关卡通过，见 `tmp/docs-artifacts/war3/human01-session-probe/`。阶段验证多队／同队／开放与关闭槽、12–15 特殊玩家、force 各标志与共同胜利、对称／非对称 config 覆盖、重复应用草稿、双端同步和原版敌我／共享视野／胜负行为；force 未标记 allied 的规则尚未得到原版运行证据。

### 存活桥梁修理（待验证）

路径：`commerce.h`、`entities.h`、`session.h`、`session_combat_orders.cpp`、`session_repair.cpp`、`docs/base-development.md`。受损存活桥梁接入目标修理和原资源参数消费；Win32 Release 产品合并编译通过。阶段验证三类工人、右键／显式命令、范围与寻路、资源不足／零费用、多个工人、满血停止、目标死亡／移除、资源回调中改变归属或重新下令、自定义目标字段、桥梁自动修理、死亡桥及原版费用和时序；实际窗口、联机和原版对照尚未执行。

### 视频阴影档位（待验证）

路径：`game_effects.cpp`、`game_flow_ui.cpp/.h`、`game_preferences.cpp/.h`、`docs/game-options.md`。关闭／低／高档已接入阴影绘制、纹理请求及 video.bin V3 保存，Win32 Release 产品合并编译通过。阶段验证游戏内鼠标／键盘选择、确认／取消／Esc、即时切换、重进对局及 V1／V2 迁移和损坏输入；分别检查静态、建筑、单位和水面阴影的 GPU 画面、缓存及性能，并与原版档位含义和布局对照。主菜单尚无视频设置入口。

### 单位局部绕行（待验证）

路径：`session_orders.cpp`。近距离避让全部受阻时，限额搜索局部可通行路径并保留原目标。Win32 Release 产品编译通过；Human01 独立探针覆盖修复后的移动对象并链接同版核心库，英雄越过原停点并继续行进，见 `tmp/docs-artifacts/war3/human01-continuation-1030/human01-bfs-limited.log`。阶段验证密集单位、窄口／死路、短距离目标、动态障碍、重下命令、不同碰撞尺寸和移动类型、重寻路及原版行为；测量大量单位阻塞时 CPU 帧耗时与公平性，并在真实窗口及完整战役中验收。

### 已摧毁桥梁重建（待验证）

路径：`session_repair.cpp`、`game_view.cpp`、`tests/construction_tests.cpp`、`docs/base-development.md`。死桥可在修理模式下选中并接入工人修理；首个恢复生命步骤切换桥梁存活状态。Win32 Release 产品合并编译通过，新增消费者检查未运行。阶段验证命令输入、路径占用／通行表面、动画、费用、目标回调、同时修理、敌我和资源不足，并对照原版死桥恢复时机。

### 主菜单选项（待验证）

路径：`front_options.cpp/.h`、`main.cpp`、`CMakeLists.txt`、`docs/game-options.md`。主菜单使用原 OptionsMenu FDF 接入已实现的游戏性、声音和视频设置；Win32 Release 产品合并编译通过。阶段验证页面切换、键鼠／滑块／下拉、确认与取消、损坏文件和部分保存失败、重新进入及跨对局读取、菜单音效／音乐调整，与原版布局和行为对照；其余设置仍待实现。

### 战役任务空句柄（待验证）

路径：`session_quest.cpp`、`docs/campaign-flow.md`。任务／目标句柄失效时返回空结果或忽略修改；Win32 Release 产品合并编译通过。隔离探针通过 KillUnit 加速触发 Human01 首领组死亡，进入胜利对话框，“继续”产生 Human02 换关请求，见 `tmp/docs-artifacts/war3/human01-victory-1030/victory-continue.log`；未进行完整手动通关或加载第二关。阶段验证空／错误类型／销毁句柄、任务目标创建与修订、事件顺序、真实战役操作及换关加载，并对照原版接口。

### 模型 SPL 地表事件（待验证）

路径：`model_particles.cpp`、`game_model_sound.cpp`、`game_view.h`、`docs/model-event-sounds.md`、`third_party/warcraft-model-reference/source-info.json`。游戏模型与附件的 SPL 动画事件接入源 SplatData 贴花及纹理消费；Win32 Release 产品合并编译通过。阶段验证实际原版模型的事件及来源、全局序列／循环／跳帧、附件变换、音效、视野和离屏、水陆高度、纹理加载／释放、GPU 画面与性能；主菜单等界面场景及原版精度尚未验收。

### Human02 空位置接口（待验证）

路径：`session_entities.cpp`、`session_world.cpp`、`tests/world_tests.cpp`、`docs/campaign-flow.md`。无效单位的 GetUnitLoc 返回空位置，坐标查询返回零，移除无效位置安全返回；Win32 Release 产品合并编译通过。隔离战役探针从原 Human02 main 推进至 400 秒，55.25 秒玩家控制为关闭、60.25 秒为开启，见 `tmp/docs-artifacts/war3/human02-1030/locfixed.log`；未载入 Human01 缓存、未操作战斗或验证窗口。阶段验证空／错误类型／销毁句柄、真实位置和事件、源地图开场与完整换关、缓存继承和原版边界。

### 电脑英雄闪烁撤退（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。启用英雄逃跑的低生命英雄可使用已学闪烁远离可见威胁，复用实际技能／落点及事件；Win32 Release 产品合并编译通过。阶段验证低生命、敌人靠近／消失、禁法／魔法／冷却／科技、不可达及拥堵落点、多威胁方向、死亡／易主和事件重入、施法后命令、双端同步及 CPU 开销，并与原版 AI 对照。

### 自动修理桥梁（待验证）

路径：`session_repair.cpp`、`tests/construction_tests.cpp`、`docs/base-development.md`。已开启自动修理的空闲工人通过共享空间格搜索视野内受损或死亡桥，复用原修理目标及资源流程；Win32 Release 产品合并编译通过，新增消费者断言未运行。阶段验证多工人、多个候选及等距顺序、视野／不可达／资源／目标死亡与恢复、自动开关和原版选择规则，并测量密集地图扫描和重建开销。

### 模型 SPN 发射事件（待验证）

路径：`model.h`、`model_particles.cpp`、`game_model_sound.cpp`、`game_view.*`、`game_effects.cpp`、`docs/model-event-sounds.md`、`third_party/warcraft-model-reference/source-info.json`。模型事件节点驱动源 SpawnData 模型的内存流送、变换和首段动画，Win32 Release 产品合并编译通过；已抽样读取四族基础模型中的 SPN 名称及原表，未执行实际绘制。阶段验证死亡／攻击事件、连续触发／递归、位置旋转缩放、粒子／附件／声音、同模型共享状态、首次加载迟到、迷雾／视口／暂停、窗口 GPU、切图释放及密集对局性能，对照原版画面；界面模型事件仍待实现。

### 结算盟友颜色按钮（待验证）

路径：`game_flow_ui.cpp/.h`、`docs/game-flow.md`。结算界面接入源按钮、C 键、图标／提示和本人／盟友／敌方玩家颜色；Win32 Release 产品合并编译通过。阶段验证鼠标／快捷键、初始状态、玩家及观察者／非对称联盟、地图颜色覆盖、不同统计页与排序、回放保存弹窗隔离及真实窗口画面，对照原版行为。

### 电脑工人修理目标（待验证）

路径：`session_ai.cpp`、`docs/ai.md`。SetPeonsRepair 的空闲工人按共享空间索引寻找可见受损建筑、机械单位和桥梁，复用实际修理流程；Win32 Release 产品合并编译通过。阶段验证采集／返还与携带资源、多个候选／工人、友敌与视野、死桥／无资源／不可达、单位死亡／易主及事件重入、AI 长局和双端同步，并测量密集地图开销及对照原版策略。

### 模型 UBR 地表事件（待验证）

路径：`model_particles.cpp`、`game_model_sound.cpp`、`game_effects.cpp`、`game_view.h`、`docs/model-event-sounds.md`。模型 UBR 事件接入原 UberSplatData 和出生／停留／消退贴花，Win32 Release 产品合并编译通过；原资源抽样确认多族建筑及烈焰风暴模型包含 UBR。阶段验证事件时序与重复、颜色和透明度、旋转／缩放、地形／水面／迷雾、纹理加载和释放、视口与暂停、源声音、密集场景性能及原版 GPU 画面；回归原有 FPT／SPL 的时间和图集。

### 英雄经验条（待验证）

路径：`session.h`、`session_hero.cpp`、`game_loading.cpp/.h`、`game_commands.cpp`、`docs/heroes.md`。单选英雄经验条读取源升级阈值和皮肤纹理，显示当前等级进度及悬停说明；Win32 Release 产品合并编译通过。阶段验证经验增加／降级／满级、自定义阈值与英雄、失效句柄、皮肤覆盖和缺失、单选切换／提示遮挡、真实窗口与原版坐标和显示。

### 地洞工人返工（待验证）

路径：`transport.h`、`session_orc_cargo.cpp`、`tests/orc_cargo_tests.cpp`、`docs/orc-cargo.md`。地洞征召可保存并在离舱后恢复修桥、已开工施工和途中建造；Win32 Release 产品合并编译通过，新增 work-bridge／work-build 消费者检查未运行。阶段验证命令被替换、工作对象死亡／易主／移除、资源及空间不足、工人死亡／暂停／易主、事件重入、多人同步与原版返工时序；Achd 坠毁规则仍未实现。

### 建筑占地内的施工接近（待验证）

路径：`session_construction.cpp`、`docs/construction.md`。工人位于待建建筑占地时按距离尝试四侧，路径终点必须处于占地外且在施工范围；旧核心库加修复源码的隔离探针中，Human02 实际建造兵营、两座农场并训练六名步兵后，原脚本在 281 秒完成基地目标，金币和木材已调高，见 `tmp/docs-artifacts/war3/human02-build-1031/fixed.log`。阶段验证不同建筑尺寸、地形／窄路／动态单位、四侧不可达、施工协作／修理、回调与更令、真实窗口、性能及原版路径。

### JASS 局部变量默认值（待验证）

路径：`jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`、`docs/jass.md`。局部数值／布尔／句柄提供默认值，局部字符串暂按空串；隔离构建的运行时检查 14 通过、0 失败。DotA 原图在本机玩家输入 -sd 后通过真实 PurchaseUnit 获得 U006 并推进至 120 秒，见 `tmp/docs-artifacts/war3/dota-flow-1030/purchase-heroes-final.log`。阶段验证局部／全局／数组字符串 null 与空串、参数／初始化顺序、回调／等待／嵌套帧、其他三图和原版 1.27 逐类型规则；窗口、多人及完整英雄玩法未验证。

### 库存目标物品双击（待验证）

路径：`game_inventory_drag.cpp`、`docs/teleport.md`。目标模式中双击同一库存格发出无目标物品命令，回城卷轴由原有实际传送消费者选择主城；阶段验证同格／跨格／慢双击、键盘目标模式、目标改变、物品转移／删除、无基地／冷却、Shift 排队、其他目标物品、实验联机和回放及原版输入时序。实际窗口和原版行为尚未验证。

### 女猎手哨兵次数（待验证）

路径：`entities.h`、`session_spell_info.cpp`、`session_spells.cpp`、`session_stealth_reveal.cpp`、`session_ability_commands.cpp`、`tests/stealth_tests.cpp`、`docs/sentinel.md`。源 DataD 正数限制各单位各能力的发射次数，0 为无限，取消或无效目标不消耗，耗尽禁用按钮；固定版原件指令记录在 `tmp/docs-artifacts/war3/sentinel-count-1030/original.txt`；Win32 Release 产品合并编译通过，新增消费者尚未运行。阶段验证原型 Aesn／Aesr、地图覆盖／多等级、订单／取消／目标死亡、移除与重加、死亡／复活／易主、施法事件重入、窗口及原版次数时序与联机同步；存档恢复仍待实现。

### 技能提示字段与等级（待验证）

路径：`session_ability_commands.cpp`、`tests/spell_tests.cpp`、`docs/spells.md`。技能等级文本按源引用和引号分隔，已知 `<对象ID,字段>` 与百分比由地图覆盖后的对象表展开；Win32 Release 核心库编译通过，直接调用实际解析函数的原版暴风雪一／二级最小检查通过（6／30、8／40），探针位于 `tmp/docs-artifacts/war3/spawn-table-probe/`。阶段验证所有等级／引用类别／百分比／未知字段、地图对象覆盖与 WTS、技能学习和按钮布局、长文／颜色／窗口及原版显示精度；新增完整消费者断言尚未运行。

### F12 对局消息纪录（待验证）

路径：`message_log.*`、`CMakeLists.txt`、`glue.cpp`、`game_loading.*`、`game_view.*`、`session.h`、`session_text.cpp`、`session_spatial_events.cpp`、`docs/message-log.md`。原 LogDialog 的 F12／顶部入口、滚动与本地受众消息历史已接入；Win32 Release 核心库编译通过。阶段验证键鼠滚动／焦点／对局输入隔离、长消息／128 行／清屏、单机／聊天私聊与盟友受众、回放／双端及原版布局；实际窗口和完整用户交互尚未运行。

### 空单位动画（待验证）

路径：`session_visual.cpp`、`docs/save-runtime-foundation.md`。SetUnitAnimation 对无效单位安全返回，原件入口和 OrcX01 开场实际调用已核对；Win32 Release 核心库编译通过。阶段验证空／销毁／错误类型、有效单位和动画切换／回调及原版窗口表现；OrcX01 区域存档恢复仍未实现。

### 召唤物零持续时间（待验证）

路径：`session_spell_info.cpp`、`docs/beastmaster.md`。允许源召唤技能持续时间为 0，并复用无定时生命的实际召唤流程。OrcX01 隔离探针推进至 400 秒并实际施放 Rexxar 的 Arsg，生成 900 生命且无定时生命的 ngzc；日志 `tmp/docs-artifacts/war3/orcx-saves-1031/zerolife-cast.log`。阶段验证零／正／负时长、召唤上限与替换、死亡／易主／技能取消、事件重入、战役和原版寿命语义；存档切区尚未实现。

### 英雄属性附加（待验证）

路径：`session_equipment.cpp`、`tests/passive_tests.cpp`、`docs/equipment.md`。Aamk 消费源 DataC／DataA／DataB 对应力量／敏捷／智力并沿用技能等级刷新；Win32 Release 核心库编译通过。DotA U006 以真实 LearnSkill 学习后属性从 17／18／18 变为 19／20／20 并推进至 180 秒，日志 `tmp/docs-artifacts/war3/dota-hero-1031/hero-stats.log`。阶段验证多等级／地图覆盖、移除／重加、死亡／复活、状态及事件重入、UI 和原版数值；新增专项断言尚未运行。

### 战役单位外观缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`。集中验证飞行高度及变化、缩放、染色、玩家颜色覆盖的 StoreUnit／RestoreUnit、磁盘 v1–v5 兼容、损坏输入和实验同步；原版字段语义及完整战役存档尚待实现或对照。详见 [战役单位外观缓存](campaign-unit-appearance.md)。

### 模型灯光档位（待验证）

路径：`src/front_options.cpp`、`src/game_flow_ui.*`、`src/game_preferences.*`、`src/game_view.cpp`、`src/model_pose.cpp`、`src/renderer.h`。集中验证两个选项入口、设置保存与旧版迁移、动态灯光与画面性能及原版对照；低／中／高档的原版规则尚未确认，见 [模型灯光档位](video-light-detail.md)。

### 运输目标的地面与飞行分类（待验证）

路径：`src/session_transport.cpp`、`docs/transport.md`。集中验证自定义货舱和装载能力分别允许 ground／air／两者／均不允许时的按钮、目标命令、飞行乘员装载和卸载落点、容量、目标重入、死亡、多人同步及原版行为；原版额外限制尚需对照。本次未编译或运行。

### 战役单位冷却缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`。集中验证技能／物品共享冷却的保存与恢复、相对时钟、v1–v6 兼容、损坏数据及实验同步，并对照原版跨关行为；完整存档及原版格式尚未完成，详见 [战役单位冷却](campaign-unit-cooldowns.md)。本次未编译或运行。

### 多列计分板本地折叠（待验证）

路径：`src/game_multiboard.cpp`、`src/game_view.*`、`src/session_multiboard.cpp`、`src/script_state.h`。集中验证多人各自点击、脚本覆盖、销毁与重建、回放输入和弹窗隔离，以及原版按钮与 getter 语义；具体范围见 [多列计分板本地折叠](multiboard-local-minimize.md)。本次未编译或运行。

2026-10-30 合并编译：Win32 Release 产品目标 `cmake --build --preset release --target war3 --parallel 8` 在 `9c02f3c` 的源码上通过，包含寄生、单位外观／冷却缓存、模型灯光、运输目标和计分板改动。该结果仅证明产品编译，不代表新增消费者、实际玩法、画面或原版对照通过。

### 战役哨兵次数缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`、`docs/campaign-gamecache.md`。集中验证有限／无限／耗尽与未初始化能力、保存后源单位变化、移除重加、多等级与地图覆盖、恢复按钮／实际施法、v1–v7 兼容、损坏数据、实验同步和原版 StoreUnit 跨关语义；新增消费者断言尚未编译或运行。

### 被动防御弹道偏转（待验证）

路径：`src/passives.h`、`src/session.h`、`src/session_passive_info.cpp`、`src/session_defense_passives.cpp`、`src/session_damage.cpp`、`src/session_self_spells.cpp`。集中验证派生字段／概率、弹道与伤害、目标和能力失效、叠加、双端随机顺序及原版行为；速度字段和 DataI 模式仍未实现，见 [被动防御偏转](passive-defense-deflection.md)。本次未编译或运行。

### 状态提示字段展开（待验证）

路径：`src/game_buff_panel.cpp`、`src/session_ability_commands.cpp`、`src/session.h`、`tests/spell_tests.cpp`。集中验证原版及地图覆盖字段、百分比、未知引用、多等级、颜色与实际窗口，并对照原版；说明见 [状态提示字段](buff-tooltip-fields.md)。新增断言尚未编译或运行。

### 局域网与回放地面智能命令（待验证）

路径：`src/lan_action_encoder.cpp`、`src/lan_simulation.cpp`、`src/player_commands.cpp`、`tests/order_queue_tests.cpp`。集中验证 0x11／0x12、命令队列／编队／集结、事件及原版报文和双端行为；说明见 [地面智能命令](lan-smart-ground.md)。新增断言尚未编译或运行。

### JASS 字符串哈希（待验证）

路径：`src/session_text.cpp`、`tests/session_tests.cpp`、`docs/jass.md`。集中验证空值、大小写／斜杠、内嵌 NUL、1023 字节边界、不同长度和多字节编码，并覆盖地图哈希表及双端；原版 Storm 七个 ASCII 返回值与独立算法一致，客户端新增断言尚未编译或运行。

### 电脑吞噬、寄生与死亡之指（待验证）

路径：`src/session_ai_armies.cpp`；说明见 [电脑施法](ai-devour-parasite.md)。集中验证目标选择、技能条件、货舱与伤害、事件重入、长局和双端确定性，并对照原版 AI；本次未编译或运行。

### 回放技能与建造菜单（待验证）

路径：`src/lan_actions.*`、`src/lan_simulation.*`、`src/game_commands.cpp`、`src/game_view.*`、`tests/order_queue_tests.cpp`。集中验证动作编解码、每玩家菜单、选区／子组／取消、回放视角与原版界面；实验对局主动发送尚未实现，见 [回放命令菜单](replay-command-menus.md)。新增断言未编译或运行。

### 游戏提示页滚动（待验证）

路径：`src/game_flow_ui.cpp`；集中验证长文本、滚轮／键盘／滑块、条目切换、窗口尺寸、原版文字布局和焦点，见 [提示页滚动](game-tips-navigation.md)。本次未编译或运行。

### JASS 角度转换（待验证）

路径：`src/session_game.cpp`、`tests/session_tests.cpp`、`docs/jass.md`。集中验证零、正负角度、极值与特殊实数、脚本组合及多人确定性，并与固定版原函数逐位对照；新增断言尚未编译或运行。

### 玩家颜色选择菜单（待验证）

路径：`src/glue.*`、`src/player_setup_ui.cpp`；集中验证原 FDF 背景与颜色项、占用交换、键鼠／焦点、16 色及原版布局和滚动条，见 [玩家颜色菜单](map-color-selector.md)。本次未编译或运行。

### 被动防御速度字段（待验证）

路径：`src/equipment.h`、`src/entities.h`、`src/session_equipment.cpp`、`src/session_passive_info.cpp`；集中验证能力与物品来源、禁用／科技、多个来源及主动防御叠加、移动和攻击消费者、幻象与多人确定性，并对照原版 DataC／DataD；DataI 仍未实现，见 [被动防御速度](passive-defense-speed.md)。本次未编译或运行。

### 局域网命令菜单录制（待验证）

路径：`src/game_commands.cpp`、`src/game_view.h`；集中验证鼠标／热键打开、同步等待、失败提示、时间片与回放、主客双端及原版时序。关闭动作已接入实验记录，原版时序待对照，见 [菜单动作录制](lan-menu-recording.md)。本次未编译或运行。

### 实验对局命令菜单关闭（待验证）

路径：`src/lan_actions.cpp`、`src/game_commands.cpp`、`src/game_view.cpp`、`tests/order_queue_tests.cpp`。集中验证取消／右键／Esc／切换界面及建造目标模式、打开后同帧变化、网络失败、时间片顺序、双端和回放；`0xfb` 仅为实验协议，原版关闭行为仍待对照，见 [菜单动作录制](lan-menu-recording.md)。新增断言未编译或运行。

### 战役单位索敌距离缓存（待验证）

路径：`src/script_state.h`、`src/session_cache.cpp`、`tests/game_flow_tests.cpp`；集中验证运行值／默认值、实际索敌及修理、旧版与损坏数据、实验同步和原版 StoreUnit，见 [单位索敌距离](campaign-unit-acquire.md)。新增断言尚未编译或运行。

### 任务窗口键盘导航（待验证）

路径：`src/quest_dialog.cpp`、`src/quest_dialog.h`。集中验证任务行焦点、方向／翻页／首尾、任务动态变化、详情和列表滚动及原版按键行为，见 [任务键盘导航](quest-keyboard-navigation.md)。本次未编译或运行。

### 法术弹道目标高度与追踪（待验证）

路径：`src/session_spell_effects.cpp`、`tests/spell_tests.cpp`。集中验证目标高度／源对象覆盖、飞行目标移动和变形、链式弹道、多端及原版轨迹，见 [法术弹道](spell-missile-targeting.md)。新增实际消费者断言尚未编译或运行。

2026-10-30 合并编译：`c4f92c5` 的 Win32 Release 产品目标 `cmake --build --preset release --target war3 --parallel 8` 通过，覆盖自上次产品编译后的脚本、战役缓存、技能、UI 和局域网改动；此结果只证明产品编译，新增断言、实际玩法、画面和原版对照仍待验证。

### 地图密度脚本接口（待验证）

路径：`src/session.h`、`src/session.cpp`、`tests/session_tests.cpp`；集中验证资源／野怪密度配置、低八位、地图切换与局域网及原版初值，见 [地图密度](map-density.md)。自动生成消费者尚未实现；新增断言未编译或运行。

### 实验局域网过期选区（待验证）

路径：`src/lan_simulation.cpp`、`tests/order_queue_tests.cpp`。集中验证发送后单位移除／不可选、空组与混合成员、未知身份和经典协议拒绝、时序及双端回放，见 [过期选区与编组](lan-stale-selection.md)。新增消费者断言未编译或运行。

### 中立守卫战斗法术（待验证）

路径：`src/session.h`、`src/session_ai.cpp`、`src/session_ai_armies.cpp`、`src/session_spell_info.cpp`。集中验证源能力与派生、敌我目标、施法时序、真实野怪战斗、双端随机与性能，并对照原版 AI，见 [中立守卫战斗法术](creep-combat-spells.md)。实际玩法尚未运行。

### 隐藏单位脚本移动（待验证）

路径：`src/entities.h`、`src/session.h`、`src/session_orders.cpp`。同版 Win32 Release 核心库编译通过；Human02Interlude 原图最小复现中吉安娜 25.25 秒进入目标区域，75.1875 秒脚本请求 Human03，日志 `tmp/docs-artifacts/war3/human02-interlude-1031/same-core.log`。集中验证隐藏／显示、四种点命令、运输／消化等状态、玩家命令隔离、回调与真实窗口和实际切关，见 [隐藏单位移动](campaign-hidden-orders.md)。

### 生命条 Alt 临时切换（待验证）

路径：`src/game_view.cpp`、`docs/game-options.md`。集中验证两种生命条设置下按住及释放 Alt、窗口焦点变化、隐藏单位和战争迷雾，并对照原版窗口行为。本次未编译或运行。

### 火焰箭伤害与施法（待验证）

路径：`src/session_spell_info.cpp`、`src/session_ai_armies.cpp`、`docs/fire-bolt.md`、`docs/creep-combat-spells.md`、`docs/fire-bolt-ai.md`。集中验证原版与地图覆盖的订单、伤害、弹道、眩晕、目标、冷却及 AI 施法；原版自定义状态覆盖优先级待验证，具体边界见 [火焰箭](fire-bolt.md)。本次未编译或运行。

### 战役 WTS 非声明文本（待验证）

路径：`src/map.cpp`、`tests/map_tests.cpp`、`docs/campaign-wts-text.md`。资料片 nightelfX01 原图隔离探针已越过地图读取并创建 136 单位，随后因技能参数停止；集中验证任务文本、格式边界、自定义和联网地图，见 [战役地图字符串表](campaign-wts-text.md)。新增解析断言未运行。

### 战役寄生技能零英雄时长（待验证）

路径：`src/session_spell_info.cpp`、`docs/campaign-parasite-duration.md`。nightelfX01 原图隔离探针已越过此技能参数检查，随后在句柄调用处停止；集中验证零时长实际施法、原版效果及地图派生。见 [战役寄生技能时长](campaign-parasite-duration.md)。

### 无效单位所属玩家查询（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-owner.md`。nightelfX01 原图隔离探针越过此调用并推进至 37.0938 秒，随后在另一个句柄查询处停止；集中验证空／销毁句柄、玩家归属变化和实际战役事件，见 [所属玩家查询](campaign-null-owner.md)。

### 无效可破坏物最大生命查询（待验证）

路径：`src/session_destructables.cpp`、`docs/campaign-null-destructable.md`。nightelfX01 原图隔离探针越过此调用并推进至 400 秒，40.25 秒恢复玩家控制；集中验证句柄生命周期、开场物件及真实窗口，见 [最大生命查询](campaign-null-destructable.md)。

### Human04 失效迷雾修改器（待验证）

路径：`src/session_fog.cpp`、`docs/campaign-human04-fog.md`。独立 Win32 x86 探针越过失效句柄异常，原图约 40 秒恢复控制并推进至 400 秒；集中验证有效／空／失效句柄、真实切关与视野表现，见 [Human04 迷雾句柄](campaign-human04-fog.md)。

### 战争践踏地形波纹（待验证）

路径：`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`src/world.h`。集中验证原图及派生技能的伤害、眩晕和波纹、原版字段覆盖、并发上限与同步，见 [战争践踏地形波纹](war-stomp-terrain.md)。本次未编译或运行。

### Human05 失效单位路径设置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-human05-pathing.md`。隔离原图越过村民撤退异常并推进至 380 秒；集中验证失效句柄原版语义与实际撤退和路径占地，见 [村民撤退路径](campaign-human05-pathing.md)。

### Human05 背包物品位置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-human05-items.md`。隔离原图验证空槽和持有物品的落地；集中对照原版掉落事件、不可丢弃物品和真实跨关操作，见 [物品位置](campaign-human05-items.md)。

### Human05 未启动 AI 命令（待验证）

路径：`src/session_ai.cpp`、`docs/campaign-human05-command-ai.md`。原图定向触发器不再因未启动 AI 中断；集中验证正常商队、攻击波、命令顺序及胜负流程，见 [AI 命令](campaign-human05-command-ai.md)。

### 船坞缺失商品空槽（待验证）

路径：`src/session_commerce.cpp`、`docs/campaign-shipyard-stock.md`。NightElfX02 隔离探针完成船坞库存和 main，后在未实现的 AI native 处停止；集中验证原版窗口、空槽、有效商品及动态库存，见 [商店默认单位库存](campaign-shipyard-stock.md)。

### 两栖 AI 队长共享路线（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`src/session_ai_armies.cpp`、`src/session_ai_control.cpp`。Win32 Release 核心增量编译和原图两栖／地面混组定向探针通过；集中验证真实战役、路线中断、补员、动态障碍、混编、同步及原版行为，见 [两栖 AI 路径](campaign-amphibious-ai.md)。

### Human06 脚本无值返回兼容（待验证）

路径：`src/jass_module.cpp`、`src/jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`。独立探针验证受限返回与原图开场推进；集中执行新增断言，核对原版行为及产品关卡，见 [无值返回兼容](campaign-human06-return.md)。

### AI 攻击与防御队长驻地（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_control.cpp`、`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`。核心及测试目标编译通过，定向检查 2 项通过、0 失败；集中验证真实战役、队伍状态、同步及原版路线，见 [队长驻地](campaign-captain-home.md)。

### Human07 基础停止命令（待验证）

路径：`src/session_entities.cpp`、`src/session_orders.cpp`、`docs/campaign-human07-stop.md`。隔离原图相遇剧情已越过停止指令异常；集中验证两种命令入口、取消与事件及真实交互，见 [停止指令](campaign-human07-stop.md)。

### Human08 堆叠环境声音（待验证）

路径：`src/sound.cpp`、`docs/campaign-human08-stacked-sound.md`。静音隔离原图越过声音注册异常并推进至 400 秒；集中听验播放、重复、空间区域与资源释放，见 [堆叠环境声音](campaign-human08-stacked-sound.md)。

### Human08 胜利界面失效句柄（待验证）

路径：`src/session_leaderboard.cpp`、`src/session_dialogs.cpp`。隔离原图直接摧毁目标船后进入胜利对话；集中验证排行榜与计时窗口生命周期及实际操作，见 [胜利界面句柄](campaign-human08-ui-handles.md)。

### Human09 空位置特效（待验证）

路径：`src/session_effects.cpp`、`tests/spell_tests.cpp`。隔离原图越过异常并推进至 400 秒；集中执行新增断言并验证真实开场及画面，见 [空位置特效](campaign-human09-null-effect.md)。

### Human09 空物品槽创建（待验证）

路径：`src/session_entities.cpp`、`tests/spell_tests.cpp`。隔离探针越过剧情的空槽异常；集中执行新增断言并验证真实战斗、物品和剧情，见 [空物品槽创建](campaign-human09-empty-item.md)。

### 亡灵首关空单位编组（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-undead01-group.md`。隔离探针越过原图的空单位编组异常；集中验证句柄边界、难度和真实开局，见 [空单位编组](campaign-undead01-group.md)。

### 亡灵首关空单位动画（待验证）

路径：`src/session_visual.cpp`、`docs/campaign-undead01-animation.md`。隔离探针越过空单位动画队列异常；集中验证有效／失效单位队列、动画顺序和真实开场，见 [空单位动画](campaign-undead01-animation.md)。

### 亡灵首关空单位暂停（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-undead01-pause.md`。隔离原图越过空单位暂停并推进至 400 秒；集中验证暂停恢复、动作时序和真实开场，见 [空单位暂停](campaign-undead01-pause.md)。

### 亡灵首关隐藏单位即时命令（待验证）

路径：`src/session.h`、`src/session_orders.cpp`、`src/session_entities.cpp`。隔离原图救援计数从 0 增至 4，并检查脚本、玩家和运输隐藏边界；集中验证原版命令及完整任务，见 [隐藏单位脚本命令](campaign-undead01-hidden-orders.md)。

### 资料片第四章无效单位名称（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-name.md`。同版核心编译及最小会话检查通过，第四章隔离开场越过异常；集中验证字幕、单位选择分支和真实窗口，见 [无效单位名称](campaign-null-unit-name.md)。

### 单机暂停与速度命令入口（待验证）

路径：`src/game_flow_ui.*`、`src/game_view.cpp`、`src/player_commands.*`、`tests/game_flow_tests.cpp`。Win32 Release 产品编译通过；集中验证菜单操作、本地及网络权限、脚本交错和新增会话断言，见 [单机游戏控制命令](single-replay-controls.md)。单机回放录制和播放尚未完成。

### 资料片第五章缺失预载脚本（待验证）

路径：`src/session_game.cpp`、`docs/campaign-preloader.md`。独立原图探针越过缺失成员并推进至 400 秒；集中验证预载脚本的空值、存在／缺失、错误和切图，见 [预载脚本](campaign-preloader.md)。

### 亡灵第二关死亡对白句柄（待验证）

路径：`src/session.cpp`、`src/session_entities.cpp`。独立原图探针越过死亡对白异常；集中验证有效／失效句柄、颜色映射及真实战役表现，见 [乌瑟尔死亡对白](campaign-undead02-uther-transmission.md)。

### PREM 模型粒子（待验证）

路径：`src/model.*`、`src/model_data.h`、`src/model_particles.cpp`、`src/model_pose.cpp`、`tests/effects_tests.cpp`、`third_party/warcraft-model-reference/`。Win32 Release 产品编译通过，原版闪电箭 Death 序列隐藏窗口检查发射和退休通过；集中验证原版视觉、动画、嵌套、离屏、资源释放和性能，见 [模型粒子与特效](effects.md)。

### PREM 子模型事件（待验证）

路径：`src/model_particles.cpp`、`docs/effects.md`。Win32 Release 产品编译通过；集中验证子模型事件的动画时序、世界位置、多个粒子实例、父对象销毁、离屏与音画同步。

### 亡灵第二关重复销毁计时器（待验证）

路径：`src/session.cpp`、`docs/campaign-undead02-destroy-timer.md`。隔离原图越过结束剧情异常并进入胜利对话；集中验证有效／失效计时器、事件与回调，以及自然建造和剧情，见 [淡入淡出计时器](campaign-undead02-destroy-timer.md)。

### 资料片第六章空单位速度设置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-speed.md`。隔离原图商队暂停触发器越过空单位异常；集中验证有效／失效单位、移动速度及真实商队流程，见 [商队暂停](campaign-null-unit-speed.md)。

### 资料片第六章失效英雄经验开关（待验证）

路径：`src/session_hero.cpp`、`docs/campaign-null-hero-xp.md`。隔离原图胜利过场越过失效英雄异常；集中验证英雄经验状态、正常护送与原版过场，见 [英雄经验开关](campaign-null-hero-xp.md)。

### 资料片第六章失效单位显示（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-show.md`。人工驱动原图胜利过场越过失效单位异常；集中验证显示、路径视野及自然护送，见 [失效单位显示](campaign-null-unit-show.md)。

### 资料片第七章关闭 AI 随机路径（待验证）

路径：`src/session_ai_natives.cpp`、`docs/ai-random-paths.md`。隔离原图越过关闭路径调用并推进至 400 秒；集中验证确定性路线、实际任务和同步。开启随机路径的原版算法仍未实现，见 [AI 随机路径](ai-random-paths.md)。

### 资料片第六章空单位位置（待验证）

路径：`src/session_entities.cpp`、`docs/campaign-null-unit-position.md`。独立原图探针越过空单位位置异常并推进至 400 秒；集中验证有效／失效单位与位置、商队剧情和真实窗口，见 [空单位位置](campaign-null-unit-position.md)。

### 声音归档 PCM 尾部恢复（待验证）

路径：`src/archive.cpp`、`src/archive.h`、`src/sound.cpp`、`src/session_sound.cpp`、`tests/archive_tests.cpp`。定向夹具 1 项通过，亡灵第三关静音隔离探针推进至 400 秒；集中验证产品窗口实际播放、尾部语义、原版听感、战役流程和切图资源释放，见 [PCM WAV 尾部读取恢复](audio-wav-tail-recovery.md)。

### 原版阴影选项（待验证）

路径：`src/front_options.cpp`、`src/game_flow_ui.cpp`、`src/game_flow_ui.h`、`src/game_preferences.cpp`。两处选项使用原版 OFF／ON；集中验证窗口输入、确认与取消、旧设置迁移、重启、阴影画面及性能，见[阴影选项](shadow-options.md)。

### 亡灵第四关无效单位无敌设置（待验证）

路径：`src/session_entities.cpp`。独立原图探针在无前关缓存时越过异常并推进至 400 秒；集中验证有效／失效句柄、有跨关缓存、真实窗口及完整战役流程，见[无效单位无敌设置](campaign-undead04-invulnerable.md)。

### 避难权杖（待验证）

路径：`src/entities.h`、`src/session*.cpp`、`src/session.h`、`src/spells.h`。已接入目标、施法、主基地传送、禁用状态及延迟治疗；集中验证目标筛选、伤害减免单位、治疗与驱散时序、物品消费、UI、多人同步及原版一致性，见[避难权杖](sanctuary-staff.md)。

### 避难权杖驱散（待验证）

路径：`src/session_teleport.cpp`。避难状态已接入现有魔法驱散，集中验证友敌驱散、状态释放、持续治疗和原版 1.27 行为，见[避难权杖](sanctuary-staff.md)。

### 亡灵第五关计时窗口句柄（待验证）

路径：`src/session_dialogs.cpp`。独立探针通过有效、空和已销毁窗口的定向检查，并在人工完成任务条件后进入胜利对话；自然战斗、真实窗口和跨关流程待集中验证，见[计时窗口句柄](campaign-undead05-timer-dialog.md)。

### 局域网研究与训练取消（待验证）

路径：`src/lan_action_encoder.cpp`、`src/lan_simulation.*`、`tests/order_queue_tests.cpp`。经典动作接入当前研究与训练取消及唯一子组选区；集中执行新增断言，核对任务变化、退款与事件、双客户端和原版报文，见[研究与训练取消](lan-research-cancellation.md)。

### 昼夜模型光照（待验证）

路径：`src/game_view.*`、`src/model*`、`src/renderer.h`、`src/terrain_scene.cpp`。已接入原 DNC 模型动画、世界模型与地形光照；集中验证原图昼夜、动态模型切换、迷雾、设备恢复、稠密场景 CPU 与帧耗时，并对照原版，见[昼夜模型光照](day-night-lighting.md)。

### 实验联机已移除目标（待验证）

路径：`src/lan_simulation.cpp`、`tests/order_queue_tests.cpp`。时间片中的已移除目标命令按类别跳过；集中执行新增断言，验证同片状态变化、物品／可破坏物、多人和自研回放，见[已移除目标的联机命令](lan-removed-target.md)。

### AI 关闭共享路径（待验证）

路径：`src/ai.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`。从 common.ai 调用 `DisablePathing` 后，分别检查已有路线、后续两栖队长攻击、不同 AI、重复调用和普通单位寻路；原版共享路径、混编和同步待集中对照，见[AI 关闭共享路径](ai-disable-pathing.md)。

### 昼夜光照计算复用（待验证）

路径：`src/model.cpp`、`src/model_data.h`、`src/model_pose.cpp`。静态姿态与纯方向光照计算按实际输入复用；集中对照姿态／光照切换、骨骼动画、Billboard、点光源及 Amazonia 的画面、CPU 与帧耗时，见[昼夜光照计算复用](dnc-lighting-performance.md)。

### 战役章节默认开放（待验证）

路径：`src/campaign_browser.cpp`、`src/campaign_browser.h`。章节列表按源第四字段更新进度，Win32 x86 隔离编译通过；集中验证源标记、脚本关闭后重进、战役切换、跨进程与失败恢复，见[章节默认解锁](campaign-default-missions.md)。

### 常驻献祭与火焰风衣（待验证）

路径：`src/session_passive_info.cpp`、`tests/control_tests.cpp`。源能力已接入现有持续伤害及库存生命周期；集中执行新增模式并对照叠加、免疫、物品交换、伤害事件、窗口与多人，见[常驻献祭与火焰风衣](permanent-immolation-items.md)。

### 游戏端口选项（待验证）

路径：`src/front_options.*`、`src/game_preferences.*`、`src/lan_host.*`、`src/lan_host_ui.cpp`、`src/main.cpp`。原版输入框与房主监听和公告已接入；集中验证输入、保存恢复、自定义端口、占用报错、真实客户端连接及原版互通，见[游戏端口](game-port.md)。

### 回放玩家离开记录（待验证）

路径：`src/replay.*`、`src/lan_simulation.*`、`src/game_view.*`、`src/main.cpp`。集中验证自研回放中离开事件和时间片顺序、重复及非法记录、重入、选择与缓存同步、后续动作及固定版对照；原版回放入口和对象编号映射仍待实现，见[回放玩家离开记录](replay-player-departure.md)。

### 能力名称转换 native（待验证）

路径：`src/session_spell_natives.cpp`。集中对照 1.27 的 null、空字符串、普通名称、rawcode、自定义能力和未知整数输入，以及脚本 null 比较；静态分析尚不能证明映射表恒为空，见[能力名称转换 native](ability-id-natives.md)。

### 地图空模型与变体回退（待验证）

路径：`src/model.cpp`、`src/placed_definition.*`、`src/scene_objects.cpp`、`src/session_destructables.cpp`。集中检查地图覆盖优先级、真实缺失和损坏、单位及可破坏物生命周期、模型变体与原版行为，见[地图模型缺失处理](map-optional-models.md)。

### 脚本对话框子控件（待验证）

路径：`src/glue.cpp`。IceCrown 隐藏窗口已显示胜利对话框，程序消息发送 C 后对话框消失；集中检查真实鼠标、键盘、其他脚本对话框、多玩家及原版布局。

### 游戏顶部栏（待验证）

路径：`src/game_loading.*`、`src/game_view.cpp`。集中检查四族和地图皮肤、窗口尺寸及 DPI、鼠标和 F9–F12、长文本与原版布局，见[游戏顶部栏](top-hud.md)。

### 玩家消息中的名称（待验证）

路径：`src/session_text.cpp`。集中检查 `DisplayTimedTextFromPlayer` 的名称替换、百分号、不同玩家与受众及原版语义。

### 回放列表异步双击（待验证）

路径：`src/replay_browser.*`、`docs/replay-browser.md`。集中验证冷读取与已读取回放、切换选中、删除／取消、返回、损坏文件及连续双击；原版回放播放仍待实现。

### 玩家广播文本（待验证）

路径：`src/session_text.cpp`。集中检查各玩家视角的胜负与离开消息、历史、玩家名、百分号、空名称及格式边界，与原版显示对照，见[玩家广播文本](player-broadcast-text.md)。

### 选中单位动画头像（待验证）

路径：`src/game_portrait.cpp`、`src/game_view.*`、`CMakeLists.txt`。集中检查真实单选／多选、模型和相机缺失、四族边框、DPI／窗口缩放、设备恢复、模型动画／队伍颜色、切图释放及状态块开销，见[选中单位头像](unit-portrait.md)。

### 游戏内聊天窗口与消息分类（待验证）

路径：`src/chat_dialog.*`、`src/game_view.*`、`src/player_commands.*`、`src/session_text.cpp`、`src/session_spatial_events.cpp`、`src/script_state.h`、`src/session.h`、`src/message_log.cpp`、`src/lan_actions.*`、`src/lan_runtime.cpp`、`src/lan_simulation.*`。集中验证 F12／Shift+F12、频道／私聊选择与历史、消息格式、目标离开、窗口输入隔离、发送失败、实验双端与回放、原版窗口和协议差异，见[对局聊天窗口](chat-dialog.md)。

### 顶部按钮状态与消息转义（待验证）

路径：`src/game_view.cpp`、`src/game_loading.*`。集中验证四族及地图皮肤、悬停／按下／禁用、用户控制和回放状态、鼠标点击、缩放／DPI，以及脚本文本的颜色与竖线转义，见[游戏顶部栏](top-hud.md)。

### 战役缺失声音句柄（待验证）

路径：`src/sound.cpp`。兽族 Orc01 静音探针完成 main 并推进 120 秒；集中验证缺失／损坏／正常音频、句柄、通道与时长、播放状态、堆叠、设备恢复及原版行为，见[兽族第一章缺失对白](campaign-orc01-missing-dialogue.md)。

### 战役未知科技引用（待验证）

路径：`src/session_research.cpp`。Orc04 原图隔离探针完成 main 并静音推进 60 秒；集中核对未知／已有／自定义科技的等级、单位刷新、界面与原版行为，以及真实战役流程，见[战役未知科技引用](campaign-unknown-upgrade.md)。

### 战役定时转向空单位（待验证）

路径：`src/session_entities.cpp`。OrcX03a 无前章 gamecache 的隔离探针完成初始化并静音推进 60 秒；集中验证空／失效／有效单位、时长和转向曲线、跨关存档及真实窗口，见[战役定时转向空单位](campaign-null-facing-timed.md)。

### 单位信息和多选面板位置（待验证）

路径：`src/game_view.cpp`、`src/game_portrait.cpp`、`src/game_commands.cpp`、`src/game_selection_panel.cpp`。地面物品图标在控制台纹理之前绘制并由头像框遮罩；单位名称与数值、单位状态／生产信息和多选图标移至头像区域右侧；进度条和生产图标使用收窄的区域，多选及生产图标的点击区域随图标移动。集中验证单选／多选、生产队列与点击、窗口尺寸、DPI、四族以及与原版画面的差异；货舱、状态图标及其他底部面板仍需对照。

### 货舱面板位置与内容隔离（待验证）

路径：`src/game_transport.cpp`、`src/game_commands.cpp`。货舱格、乘员提示及分页操作移至头像右侧；显示货舱时不叠加普通单位详情；建造、升级或生产时显示对应进度和取消操作。集中验证可控制／不可控制单位、运输／矿井／尸体货舱、容量与分页、卸载点击、生产与货舱共存、不同窗口及原版布局；状态图标与其他底部面板仍待对照。

### 缺失 AI 策略启动（待验证）

路径：`src/session_ai.cpp`、`docs/ai.md`。原 OrcX03a 无前章 gamecache 的静音隔离探针完成 main 并推进 600 秒；集中验证地图／公共策略覆盖、缺失／损坏文件、重复启动、脚本与 AI 调度、原版诊断和跨关流程。缺失策略不运行 AI。

### 状态栏与单位详情布局（待验证）

路径：`src/game_buff_panel.cpp`、`src/game_commands.cpp`、`docs/buff-panel.md`。单行八格依据固定版本状态栏构造；集中验证实际单选、多个状态、单位／建筑／货舱／生产切换、定时生命条、悬停、尺寸和原版屏幕位置。隐藏窗口探针中，跨进程鼠标消息的坐标被 DPI 缩放约 1.5 倍；针对单单位夹具换算坐标后，诊断版记录点击与单位投影接近，正式 Release 选中 1 个单位并生成画面。证据 `tmp/docs-artifacts/war3/selection-diagnostic/`；该检查不覆盖真实鼠标、其余地图或 DPI 配置。

### 战役毒蛇守卫订单（待验证）

路径：`src/session_spell_info.cpp`、`docs/area-spells.md`。OrcX02 隔离探针完成 main 并静音推进 120 秒；集中验证原版 ward 订单、技能施放、地图覆盖、跨关存档和实际画面。

### 对局命令栏布局（待验证）

路径：`src/game_commands.cpp`、`docs/command-card-layout.md`。按原版网格调整图标、状态和鼠标命中；单单位夹具的 Release 隐藏窗口截图显示人族命令图标位于网格内，见 `tmp/docs-artifacts/war3/selection-diagnostic/release-selected.png`。集中验证普通命令、技能／建造菜单、自动施法、冷却、快捷键、点击边界、四族、窗口尺寸及 DPI，并对照原版实际画面。

### 战役空单位状态操作（待验证）

路径：`src/session_entities.cpp`、`src/session_spell_natives.cpp`、`docs/campaign-null-unit-reset.md`。OrcX02_02 隔离探针完成 main 并静音推进 120 秒；集中验证空／失效／有效单位及玩家、效果和冷却、事件、跨关存档及真实窗口。

### 墓地尸体生成（待验证）

路径：`src/corpses.h`、`src/entities.h`、`src/session.h`、`src/session_entities.cpp`、`src/session_corpses.cpp`、`src/session_transport.cpp`、`tests/corpse_cargo_tests.cpp`、`docs/graveyard.md`。Win32 Release 产品与专项程序编译通过；`war3_corpse_cargo_tests.exe <data-root> <corpse-cargo-fixture.w3m> graveyard` 1/1 通过，覆盖间隔、可用尸体、上限及补充。集中验证初始／满额与空位计时、消耗／衰败／搬运、能力增加／删除／升级、暂停／建造／死亡／转让、地图覆盖、多墓地、落点、同步、画面音效和原版对照。

### 可见幽灵能力（待验证）

路径：`src/passives.h`、`src/session_passive_info.cpp`、`src/session_visibility.cpp`、`tests/stealth_tests.cpp`、`docs/stealth-reveal.md`。Win32 Release 产品与专项程序编译通过，`war3_stealth_tests.exe <data-root> <stealth-fixture.w3m> visible-ghost` 的可见性、变形及建筑占位检查 1/1 通过。集中验证源技能及地图覆盖、两项标志开关、变形目标筛选和施法重入、建筑／其他单位占位、可见性及共享视野、能力移除和原版对照。

### 建筑阴影透明度（待验证）

路径：`src/game_effects.cpp`、`docs/unit-shadows.md`。建筑阴影按贴图 alpha 和单位强度合成；本机三个原资源为二值 alpha。集中验证自定义渐变贴图、静态／动态叠加、显隐、不同尺寸与原版滤波、地图画面和性能。

### 单位攻击与护甲图标（待验证）

路径：`src/combat.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击和护甲类型使用真实战斗状态，原版及地图皮肤图标在加载阶段读取；两把武器和护甲分别显示。Win32 Release 编译通过，人族农民及圣骑士隐藏窗口选中截图可见各栏；证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-combat-selected.*` 与 `ui-combat-hero-selected.*`。集中验证四族、地图皮肤覆盖及缺图、类型变化、双武器、英雄属性、长数值、窗口比例、DPI、性能和原版画面对照。

### 英雄主属性显示（待验证）

路径：`src/session.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。主属性图标与伤害显示共用源单位主属性，三项当前属性使用源标题；Win32 Release 编译通过，圣骑士隐藏窗口选中画面可见图标和属性，证据位于 `tmp/docs-artifacts/war3/selection-diagnostic/ui-hero-attributes-selected.*`。集中验证力量／敏捷／智力英雄、地图自定义字段与皮肤、装备／升级变化、长数值、不同尺寸及与原版布局的差异。

### 寻路搜索缓存（待验证）

路径：`src/world_path.cpp`、`docs/water-pathing.md`。Release 编译与隔墙替代／部分路径定向检查 2/2 通过；512×512 和 1028×1028 隔墙夹具优化前后路径摘要一致，实验记录位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证大地图／复杂单位碰撞、各移动类型、动态阻挡、不同尺寸内存、连续实际对局与帧时间及原版路径行为。

### 不可达路径重复搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。失败路径按起止格、半径、移动类型、部分路径标志和路径版本有界缓存，地图阻挡改变后重新搜索。Win32 Release 编译通过；缓存失效、隔墙替代和部分路径定向检查 3/3 通过，重复严格失败夹具及 OrcX03b 前 10 秒隔离模拟见 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证追击和移动、目标跨格、地图开闭、障碍动态变化、多移动类型、地图切换及完整对局性能。

### 严格寻路连通区域（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。严格寻路按地形版本、净空与移动类型重用有界连通区域，不可用时保留原搜索；部分路径继续原搜索。Win32 Release 编译及区域／动态障碍／隔墙／部分路径定向检查 4/4 通过；隔墙夹具与 OrcX03b 前 40 秒隔离记录位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证四种移动类型、对角障碍、不可通起点、目标候选、地图变化、多净空缓存切换、实际战役帧时间及内存。

### 部分路径重复搜索（待验证）

路径：`src/world.h`、`src/world_path.cpp`、`tests/world_tests.cpp`、`docs/water-pathing.md`。缓存有界的不可达部分路径，路径版本或查询条件改变后重新搜索。Win32 Release 编译和部分路径缓存／失败缓存／连通区域／不可达路径检查 4/4 通过；夹具与 OrcX03b 前 40 秒静音模拟证据位于 `tmp/docs-artifacts/war3/orcx03b-current/`。集中验证可达／不可达目标变化、跨格移动、动态阻挡、不同半径／移动类型、缓存碰撞及实际对局性能。

### 原版单位信息布局与 Agent 截图（待验证）

路径：`src/game_view.*`、`src/game_commands.cpp`、`src/game_buff_panel.cpp`、`src/game_loading.cpp`、`src/combat.h`、`src/session_research.cpp`、`src/agent_capture.h`、`src/platform.*`、`src/main.cpp`、`src/renderer.*`、`tools/agent-capture.ps1`、`tests/passive_tests.cpp`、`docs/unit-combat-panel.md`。Win32 Release 编译通过；攻击与护甲增减值专项 1/1 通过。游戏内部选择农民及带攻击加成的圣骑士并输出画面；对运行中的圣骑士客户端连续两次按需截图，返回游戏范围、尺寸和递增帧号。记录在 `tmp/docs-artifacts/war3/agent-info/`。阶段核对四族／英雄双武器、状态和携带资源、长文本、升级／倍率／减益及原版拆分与舍入、技能／生产／货舱、宽屏／DPI、截图错误、同目录并发、设备恢复和持续运行。Agent 当前仅支持截图与启动时单单位选择，完整 MCP 接口待实现。

### 英雄信息与物品格布局及 Agent 选择（待验证）

路径：`src/game_inventory_layout.h`、`src/game_inventory_drag.cpp`、`src/game_view.*`、`src/game_commands.cpp`、`src/game_buff_panel.cpp`、`src/agent_capture.h`、`src/main.cpp`、`tools/agent-select-unit.ps1`、`tools/agent-capture.ps1`。经验条收于信息框，攻击／护甲和属性行与经验条分开；物品显示、遮罩及命中共用槽位坐标。Agent 可选择可见单位，并在截图响应中返回同帧选择及物品状态。

Win32 Release 增量编译通过；在隔离地图中通过 Agent 选择六物品、100 经验的圣骑士，截图显示六格和部分填充经验条，选取不存在单位失败且保留选择；记录位于 `tmp/docs-artifacts/war3/agent-info/layout-six-items-xp/`。阶段验证物品点击／右键／拖拽／冷却、不同英雄与双武器、四族皮肤、窗口比例／DPI、长文本、Agent 请求失败和客户端生命周期，并对照原版；交互与四族画面尚未实测。

### 内置 Agent 游戏指针输入（待验证）

路径：`src/agent_capture.h`、`src/game_view.*`、`src/main.cpp`、`tools/agent-pointer.ps1`、`README.md`。后台单人对局可按 800×600 逻辑坐标送达左键、右键及跨帧拖拽，沿用 `GameInput` 和真实命令路径；前台、联机、回放及不可操作界面拒绝，响应仅表示输入送达。

Win32 Release 增量编译通过；隔离圣骑士六物品夹具使用 Agent 拖拽，截图状态显示第 0／1 格物品句柄交换，记录位于 `tmp/docs-artifacts/war3/agent-info/pointer-drag/`。阶段核对左／右键、地图／命令／物品目标、前台与菜单切换中断、拖拽失效、非游戏界面拒绝、DPI／窗口尺寸、连续请求与会话退出；尚未完成真实鼠标或原版输入一致性验证。

### 英雄经验条颜色（待验证）

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。经验进度按紫色调制源纹理；Win32 Release 编译通过，游戏内 Agent 的 100 经验截图显示紫色填充，见 `tmp/docs-artifacts/war3/agent-info/xp-purple/`。阶段对照四族、自定义皮肤、零／满经验与原版色值；颜色取自参考画面，非像素级验收。

### 吸取技能生命与目标消耗（待验证）

路径：`src/session.h`、`src/session_area_spells.cpp`、`src/session_resource_spells.cpp`、`tests/spell_tests.cpp`、`tests/generate-steal-fixture.py`、`docs/mana-steal.md`。自定义 Aste 的固定／比例生命和魔法转移与消耗目标连接现有物品施法及单位生命周期。

Win32 Release 客户端及测试目标编译通过；隔离夹具运行 `war3_spell_tests.exe <data-root> <fixture> steal` 4/4，覆盖固定／比例、资源上限及目标消耗，未加载 Game.dll。集中验证目标死亡／重生和资源事件重入、伤害免疫、极端数值、目标与魔免规则、物品冷却／次数及多人，并与原版动态行为对照。

### 施法目标关系别名与 DotA 寄生（待验证）

路径：`src/session_spells.cpp`、`tests/caster_tests.cpp`、`tests/generate-caster-fixture.py`、`docs/parasite.md`。施法单位目标筛选同时识别源对象表的 `friend`／`allies` 和 `enemy`／`enemies`，保留 `self` 与 `neutral` 规则。

Win32 Release 客户端及 `war3_caster_tests` 增量编译通过；自定义目标夹具的 `targets` 模式 6/6 通过，覆盖敌友别名、敌友拒绝及中立目标。DotA_v6.83d 隔离会话选择蜘蛛英雄、学习 `A0BH`，向创建的可见敌人施法后取得 `B0E7`，直接击杀目标后观察到一个 `n019`；探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。集中验证其他施法类型、共享视野／联盟变化、免疫／建筑／中立分类、寄生叠加／召唤／重入、多人与真实窗口，原版语义和 UI 尚未验收。

### 零间隔暴风雪与 DotA 蜘蛛网（待验证）

路径：`src/session_spell_info.cpp`、`src/session_channels.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/area-spells.md`。零间隔的暴风雪派生能力按波次执行实际范围效果，零波数无波次，施法及脚本事件沿用原流程。

Win32 Release 客户端及 `war3_spell_tests` 编译通过；`zero-blizzard` 隔离夹具 2/2 通过，检查三次即时伤害和零波数无伤害，未加载 Game.dll。DotA_v6.83d 隔离会话在 `-sd` 后学习蜘蛛网并以 A2ZX 发出点目标命令，观察到一个蜘蛛网单位；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查零间隔伤害事件与回调中断、其他波数及范围、地图脚本移除能力、蜘蛛网增益与消失、真实窗口／多人和原版时序；即时波次顺序是当前实现，尚非原版验收结论。

### 光环玩家目标与 DotA 蜘蛛网（待验证）

路径：`src/session_passive_info.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/auras-passives.md`。光环及武器被动的 `player` 目标限定为与能力来源相同的玩家，并与其他关系标志组合。

Win32 Release 客户端和 `war3_passive_tests` 编译通过；`player-aura` 隔离检查 3/3，覆盖己方、盟友与敌方及光环源易主，未加载 Game.dll。DotA 原图隔离会话放网后，英雄获得 `B01C`／隐身／穿行，附近创建的敌方单位未获光环；直接移动英雄出网后相关状态清理。探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对 `player` 与其他关系的组合、光环失效延迟／重叠／易主、网内数值、受伤切换、真实窗口与多人及原版行为。

### 隐藏法术书与自目标光环（待验证）

路径：`src/session_spellbooks.cpp`、`src/session_ability_commands.cpp`、`src/session_passive_info.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`、`docs/spellbooks-retraining.md`。禁用的法术书保留其子能力并隐藏命令入口；未声明空中／地面类别的自目标被动可作用于自身。

Win32 Release 客户端及测试目标编译通过；`hidden-book` 夹具 4/4 和受关联影响的 `player-aura` 3/3 通过，未加载 Game.dll。DotA 原图隔离会话入网后显示 `A304`／`A300`／`B0HI`，移速光环系数由 0.2 增至 0.4；直接移动英雄出网后相关书籍／能力／状态清理。探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对书籍禁用的时机、直接下令、嵌套／库存／相同技能来源、无类别自目标、地图覆盖、多人和原版行为；真实操作和原版画面未验收。

### 技能接口无效单位与 DotA 终极技能（待验证）

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`、`docs/ability-unit-handles.md`、`docs/spellbooks-retraining.md`。七个技能增删、等级与永久标记接口对无效单位返回零或失败。

Win32 Release 客户端及 `war3_passive_tests` 编译通过；`invalid-unit` 检查 4/4，覆盖空、已移除、类型不匹配和有效单位，未加载 Game.dll。DotA 隔离会话设定蜘蛛英雄等级、施放终极技能并攻击创建的目标，观察到攻击加成、吸血及约 14 秒后的脚本清理；探针和原版反汇编在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对句柄重用／回调删除、等级边界、自然升级／战斗、多人、实际窗口和原版精度。

### 零效率魔法盾与 DotA 过载（待验证）

路径：`src/session_self_spells.cpp`、`src/session_damage.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/zero-mana-shield.md`。允许零效率魔法盾开关及脚本事件，并跳过无效吸收运算。

Win32 Release 客户端及 `war3_spell_tests` 编译通过；`zero-mana-shield` 3/3，覆盖零效率、零魔法、开关及原正效率盾，未加载 Game.dll。DotA 隔离原图中选取守护精灵，学习并开关 `A28Q`，观察到脚本加成添加／移除及启用期间生命和魔法下降；探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对正比例零效率的原版语义、零魔法／伤害事件／切换重入、联结单位、多人和实际窗口。

### 连锁闪电目标与 DotA 联结（待验证）

路径：`src/session_spells.cpp`、`tests/generate-caster-fixture.py`、`tests/caster_tests.cpp`、`docs/dota-tether.md`。连锁闪电目标关系按源能力配置判断，使友方派生技能与原敌方技能分别使用各自目标。

Win32 Release 客户端和 `war3_caster_tests` 编译通过；`chain-targets` 隔离检查 4/4，覆盖友方／敌方接受和拒绝，未加载 Game.dll。DotA 原图隔离会话选取守护精灵，学习 `A1TA` 后联结创建的友军，观察到双方能力、闪电和资源共享；直接将目标移出范围后连接清理。探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对原技能／地图覆盖的关系、弹跳、免疫和伤害事件，联结移动／死亡／切换／重入、多人及真实窗口；当前未作原版精度验收。

### 战吼与 DotA 幽魂轨道（待验证）

路径：`src/session_spell_info.cpp`、`src/session_wards_roar.cpp`、`tests/generate-caster-fixture.py`、`tests/caster_tests.cpp`、`docs/wards-roar.md`。ANbr 的固定攻击加成进入武器伤害与信息面板；零效果无状态的咆哮允许正常施法并触发地图脚本。

Win32 Release 客户端及 `war3_caster_tests` 编译通过；`battle-roar` 4/4，涵盖零效果施法、Aroa 百分比、ANbr 固定加成与敌方筛选，未加载 Game.dll。DotA 隔离原图选择守护精灵并学习幽魂，观察到五个幽魂依次显示；收缩与扩张命令分别使轨道半径约 150→100→580。探针在 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查战吼等级、重叠／驱散／状态移除及原版计算，幽魂接触伤害／完整周期／状态变化、多人和真实窗口。

### JASS 实数比较与 DotA 降临（待验证）

路径：`src/jass_runtime.cpp`、`tests/jass_runtime_tests.cpp`、`docs/jass.md`。实数相等使用原版减法和容差，不等按实数位型比较，混合整数按原版转换后参与比较。

Win32 Release 客户端及 JASS 测试编译通过；运行时检查 16/16，原版相等辅助函数在 Unicorn 中 5/5。DotA_v6.83d 隔离会话学习 `A1TB` 后，施法约 3 秒传送至目标，约 12 秒后返回；同图幽魂对普通单位和英雄伤害、英雄接触后幽魂死亡已观察。探针与反汇编位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段验证实数不等及混合类型的完整原版 VM 路径、特殊值、其他比较操作、降临中断／死亡／联结目标、真实窗口与多人。

### 零目标配额蝗虫群与 DotA 自然之助（待验证）

路径：`src/session_spell_info.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/impale-locust.md`。允许每目标配额为零的自定义蝗虫群按源配置生成飞行单位并保持零目标分配。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> zero-locust` 1/1，覆盖飞行单位生成、不攻击敌方及施法者移除清理。DotA_v6.83d 隔离原图施放 A01B 后观察到三个飞行单位、地图脚本治疗及结束后清理；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段核对原版零配额行为、技能等级／持续时间／中断／死亡、治疗目标及多目标脚本、视觉和多人。

### 毒箭与 DotA 推进（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_arrow_status.cpp`、`src/session_orb_attacks.cpp`、`src/session_projectiles.cpp`、`src/session_weapons.cpp`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/poison-arrows.md`。毒箭连接手动／自动攻击、源弹道与毒伤状态；技能效果事件和攻击命中时状态接入脚本。武器及箭目标筛选支持敌友关系别名。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> poison-arrow` 1/1，覆盖魔法消耗、技能效果与命中状态、持续伤害和自动攻击。DotA_v6.83d 隔离原图手动／自动推进均消耗魔法并造成距离加成，探针见 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段检查源毒状态与叠加、目标类型／免疫、实际窗口、完整事件／回调时序及多人和原版行为。

### 酸性炸弹速度与脚本隐藏施法（待验证）

路径：`src/session_alchemist.cpp`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_combat_orders.cpp`、`src/session.h`、`src/spells.h`、`tests/generate-spell-fixture.py`、`tests/spell_tests.cpp`、`docs/alchemist.md`。酸性炸弹支持带符号移动／攻击速度值；脚本单位目标施法在受理后由 ShowUnit 隐藏时继续推进。

Win32 Release 客户端及测试目标编译通过；`war3_spell_tests.exe <data-root> <fixture> acid-speed` 1/1，覆盖正负速度、零伤害及脚本隐藏施法。DotA_v6.83d 隔离原图中魅惑魔女受攻击后，攻击者获得 B043 和 0.3 攻速削弱，继续攻击会刷新时限；探针位于 `tmp/docs-artifacts/war3/dota-hero-1031/`。阶段对照原版数值符号／叠加、隐藏和显示时序、施法取消／死亡／运输、其他技能类型、真实窗口与多人。

### 资源返还可达入口与采矿路线（待验证）

路径：`src/session.h`、`src/session_harvest.cpp`、`tests/harvest_tests.cpp`、`docs/economy.md`。回收建筑的默认入口不可达时搜索其他可达入口；采矿和返还不重复覆盖尚未完成的路径。

Win32 Release 客户端及测试目标编译通过；原有 `war3_harvest_tests` 检查通过，`depot-route` 定向检查 1/1，覆盖入口阻挡、替代路径及实际金币入账。BootyBay 人族电脑隔离会话中，840 至 960 秒采金工人继续移动与入账，电脑升级要塞并开始城堡升级；个别伐木工人仍观察到拥堵停滞。探针见 `tmp/docs-artifacts/war3/dota-hero-1031/bootybay-ai-economy-probe.cpp`。阶段检查入口与碰撞、动态障碍、多人拥堵、矿井／回收建筑失效、玩家操作及原版精度和寻路性能。

### 被占用中间路径点绕行（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。中间路径点被单位占据时，仅在碰撞检查允许的情况下连接后续点；保留最终目标及有界搜索预算。

Win32 Release 客户端与测试目标编译通过；BootyBay 移动定向检查 9/9 通过，覆盖单位阻挡、最终目标和地形阻挡。BootyBay 电脑隔离会话模拟至 960 秒，建筑间密集拥堵的伐木工人仍未脱困；证据 `tmp/docs-artifacts/war3/dota-hero-1031/occupied-waypoint-ai-960.log`。阶段检查移动障碍、多单位协调、地形变化、联机确定性、性能及原版路径行为。

### 空闲友军让行（待验证）

路径：`src/entities.h`、`src/session_orders.cpp`、`src/session_network_identity.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。长时间未能接近路径点时，对阻挡前方路段的空闲同属单位寻找经过碰撞检查的让行位置；拥堵状态纳入实验联机校验。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <map> yield` 1/1 覆盖空闲同属单位让行、敌方／保持位置／暂停保护，既有移动检查 9/9 通过。BootyBay 原图电脑隔离会话中被跟踪工人在 600～720 秒移动并携带木材，720～960 秒在另一处活动单位拥堵停滞；证据 `tmp/docs-artifacts/war3/dota-hero-1031/yield-final-ai.log`。阶段检查脚本动画／命令、单位被移除／易主、狭路、连续让行、动态障碍、大规模性能、双端同步和原版行为；活动单位协调仍待实现。

### 采集工人协作避让与伐木路线（待验证）

路径：`src/session_orders.cpp`、`src/session_lumber.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。持续受阻的同属采集工人按单位句柄顺序暂时错位并保留原路线；有效伐木路线不被周期性重寻路覆盖。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <map> workers` 1/1 验证真实采集命令、让行保留原路线和目标以及恢复砍树；既有移动检查 9/9 和空闲友军让行 1/1 通过。BootyBay 原图电脑隔离会话中跟踪的工人在 840～960 秒继续移动及采集，证据 `tmp/docs-artifacts/war3/dota-hero-1031/cooperative-final-ai.log`。阶段检查多工人环形阻塞、取消／新命令、树木移除／目标变化、受阻路径重算、其他单位任务、性能、双端同步与原版行为。

### 可达扩张与野怪营地（待验证）

路径：`src/session_ai_natives.cpp`、`src/world.h`、`src/world_path.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。AI 按相关单位路径筛选扩张矿井、工人和野怪营地；连通区域缓存仅作否定预筛，候选仍经过实际寻路。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> reachable` 2/2 覆盖原 CampaignAI 启动、隔水／陆路矿井和营地、工人选择及动态障碍缓存失效。BootyBay 原图电脑隔离会话在 840 秒与可达营地交战，模拟至 960 秒；日志 `tmp/docs-artifacts/war3/dota-hero-1031/reachable-final-ai.log`。同一 840 秒状态连续三次扩张查询局部单次采样 454 ms 降至 47 ms；冷缓存、大地图和实际帧率未测。阶段检查地形／建筑动态变化、多个移动层、无部队／无工人、空中混编、事件与资源变化、跨岛运输、多人、原版行为及完整战斗。

### 敌方基地搜索与电脑进攻（待验证）

路径：`src/ai.h`、`src/session.h`、`src/session_ai.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。敌方基地搜索按模拟步有界推进，等待标志对应搜索状态；目标失效重查，原公共 AI 进攻脚本使用搜索结果。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> enemy-base` 2/2 覆盖原 CampaignAI 启动、130 个附加单位下分批搜索、暂停恢复、目标移除和原 `AnyPlayerAttack` 部队进攻。BootyBay 双电脑策略隔离模拟至 1,800 秒未触发胜负，日志 `tmp/docs-artifacts/war3/dota-hero-1031/enemy-base-duel.log`。阶段验证搜索目标及原版时序、盟友／隐形／死亡／无敌、重入与生命周期、脚本中断、局域网及完整对局。

### 行军单位协作避让（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/economy.md`。持续受阻的同属普通移动和攻击移动单位可有限让行，保留原路线和命令。

Win32 Release 客户端及测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> march` 通过，覆盖攻击移动及混合行军命令、避让后恢复与碰撞间距。BootyBay 双电脑隔离会话模拟至 1,200 秒，观察到部队跨地图移动，未触发胜负；证据 `tmp/docs-artifacts/war3/march-coordination/duel-mixed.log`。阶段检查密集拥堵、目标变化及战斗、命令取消、地形变化、性能、局域网一致性、原版行为和完整对局。

### 迷雾中的 AI 进攻（待验证）

路径：`src/session_ai.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。AI 对已知但位于战争迷雾中的目标发起攻击移动，重复同目标保留进行中的攻击和路线；新目的地仍会覆盖旧命令。

Win32 Release 客户端及测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> fog-attack` 与 `enemy-base` 分别为 2/2，覆盖原 CampaignAI 启动、迷雾和可见目标、重复命令、不同目的地覆盖及原 `AnyPlayerAttack`；迷雾定向夹具中的进攻单位关闭了路径碰撞。BootyBay 原图双电脑隔离会话在 2,580 秒取得双方结果 0／1，后者单位和建筑为零，记录 `tmp/docs-artifacts/war3/march-coordination/duel-fog-final.log`。阶段检查原版行为、移动目标、目标隐藏／死亡／易主、脚本事件、不可达位置、完整战斗、其他地图、真实窗口和双端同步。

### 电脑采集覆盖金矿（待验证）

路径：`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。电脑城镇查询与金币总量使用被诅咒／被缠绕金矿关联的实际矿藏。

Win32 Release 客户端及测试编译通过；`war3_campaign_ai_tests <data-root> <BootyBay地图> melee-mines` 2/2，覆盖两种原图起始矿、AI 查询、真实采金及余额耗尽／恢复。不死族 60 秒原图隔离会话采金配额 5，底层矿余额 12,500→12,178；日志 `tmp/docs-artifacts/war3/orc-undead-duel/economy-after.log`。建造祭坛的侍僧受拥堵阻碍，完整不死族发展尚未通过；记录 `tmp/docs-artifacts/war3/orc-undead-duel/build-stall.log`。阶段检查矿井销毁／占领、多个城镇、原版语义、其他地图、实际客户端及局域网。

### 建造路径与不死族发展（待验证）

路径：`src/session_construction.cpp`、`tests/campaign_ai_tests.cpp`、`docs/economy.md`、`docs/ai.md`。保留终点仍在有效建造范围且地形阻挡版本未变的路线与避障点；终点无效或地形阻挡变化时重新寻路。

Win32 Release 客户端和测试目标编译通过；`war3_campaign_ai_tests <data-root> <BootyBay地图> melee-build` 1/1，覆盖实际建造命令、保留人工插入的绕行点、无效终点重算和祭坛完成；人工路径部分暂时关闭了工人单位碰撞。原图隔离会话不死族在 60 秒前开始祭坛建造，并继续建造墓地、训练死亡骑士；证据 `tmp/docs-artifacts/war3/orc-undead-duel/preserve-route.log`。兽族对不死族模拟至 2,100 秒，尚未产生胜负，日志 `tmp/docs-artifacts/war3/orc-undead-duel/duel-after.log`。阶段检查地形及建造位置变化、单位／建筑死亡与归属变化、取消／新命令、多人拥堵、其他种族施工、原版规则、真实客户端和局域网。

### 攻击追击路径保留（待验证）

路径：`src/session_combat.cpp`、`tests/movement_avoidance_tests.cpp`、`docs/combat.md`。追击目标时保留通向有效攻击射程的路线和中间避障点；目标移动或地形阻挡变化使路线失效时重算。

Win32 Release 客户端及测试编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> chase` 1/1，覆盖人工绕行点保留、目标移动重算、实际攻击伤害，以及实际绕过占位单位和碰撞间距；人工绕行点部分暂时关闭了攻击者单位碰撞。兽族对不死族原图隔离对局模拟至 4,200 秒仍无胜负，日志 `tmp/docs-artifacts/war3/orc-undead-long/pursuit-final.log`。阶段检查动态单位／地形阻挡、目标死去／易主／隐藏、武器射程变化、编队及大量单位、原版事件时序、实际窗口和联机同步。

### 较弱野怪营地回退（待验证）

路径：`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。无区间内可达营地时可回退到较弱可达营地，保留等级上限、空中筛选和现有可达性检查。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <fixture> reachable` 2/2，检查较弱回退、区间内优先、超上限及隔水拒绝。固定版 Game.dll 对照指令记录 `tmp/docs-artifacts/war3/orc-undead-long/original-creep-camp-rizin.txt`；原版距离与过强营地筛选尚未完整实现。BootyBay 兽族对不死族隔离对局至 4,200 秒未产生胜负，剩余营地在隔离区域，见 `tmp/docs-artifacts/war3/orc-undead-long/weaker-camps.log`。阶段检查跨岛运输、混编、等级分组与移动、死亡／隐藏、距离与不可达、不同地图、实际窗口及联机。

### 登艇路径与 AI 跨水波次（待验证）

路径：`src/session_transport.cpp`、`tests/transport_tests.cpp`、`tests/campaign_ai_tests.cpp`、`docs/transport.md`、`docs/ai.md`。保留可进入载具登艇范围的有效路线和避障点；载具移动或地形变化时重算，载具失效清理命令。

Win32 Release 客户端及测试目标编译通过；`war3_transport_tests <data-root> <transport-fixture> boarding-route` 和 `flow` 各 1/1，覆盖路线保留、载具移动、装载事件、载具移除和既有装卸；路线夹具步兵关闭了路径碰撞。`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> island-wave` 1/1，在 BootyBay 地形上使用真实陆路接近、登艇、飞行和岛屿卸载；飞艇、编队和目标由测试预置，步兵设无敌。阶段检查拥堵、载具／乘员死亡易主、同时装载、多载具、目的地变化、自动购买与选目标、原版时序、实际窗口和联机。

### 飞艇购买的可达实验室（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。电脑购买飞艇前筛选地形可达且路线终点在交互范围内的商店和工人；不可达的部分路线不改变工人命令。

Win32 Release 客户端与测试编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> zeppelin-route` 和 `zeppelin-purchase` 各 1/1，覆盖隔水商店、可达候选、商店移除清理及通过原公共 AI 脚本购买、扣金和消耗库存。测试预置库存和资源，未验证完整对局中的人口条件或自行跨岛决策。阶段检查多商店／动态阻挡、工人原有任务、不可达与超时、库存／资源变化、原版排序、实际窗口及联机；路径查询的规模和耗时仍待性能验证。


### 远程飞艇购买等待（待验证）

路径：`src/session_ai_transport.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。根据移动路线长度和当前速度估算购买预留时限，并限制在 60 至 600 秒；失效及更改命令仍释放预留。

Win32 Release 客户端和测试目标增量编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> zeppelin-long`、`zeppelin-stuck`、`zeppelin-route`、`zeppelin-purchase` 各 1/1，远程购买耗时 139 秒，停滞工人在期限内释放。长途和停滞夹具关闭工人路径碰撞，资源和库存由测试预置。阶段检查拥堵及动态路径、减速和暂停、买家死亡／易主、库存和资源变化、600 秒上限、原版时序、实际客户端与联机。


### 密集单位短距离让位（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。同属单位让位时优先尝试原有距离，受阻后尝试更短距离；各候选仍检查地形、单位碰撞和命令保护。

Win32 Release 客户端与测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> compact` 在仅允许原距离的对照构建失败、修复后通过，覆盖密集障碍中的短距离让位及持续碰撞检查；`yield`、`workers`、`march` 各通过。BootyBay 兽族对不死族隔离对局模拟至 1,800 秒未决出胜负，兽族在 1,200–1,800 秒金币和木材均未变化；更密集工人队列仍需处理，记录 `tmp/docs-artifacts/war3/ai-duel-investigation/short-yield-final.log`。阶段检查多单位互锁、连续让位、动态地形、重入与命令、性能、实际窗口及局域网一致性。


### 密集拥堵后撤恢复（待验证）

路径：`src/session_orders.cpp`、`tests/movement_avoidance_tests.cpp`。单位受其他单位阻挡、局部绕行失败且持续停滞时，选择地形与碰撞均可通行的短距离后撤点；保留当前命令和原路径，后续继续行进。

Win32 Release 客户端和测试目标编译通过；`war3_movement_avoidance_tests <data-root> <BootyBay地图> retreat` 通过，覆盖受阻后保留目标、保持位置单位碰撞、障碍解除后到达原目标；`compact`、`yield`、`workers`、`march`、`chase` 各通过。隔离 BootyBay 兽族对不死族会话推进至 1,800 秒，兽族已有矿藏在 1,200–1,800 秒从 17,990 减至 17,040，未决出胜负；日志 `tmp/docs-artifacts/war3/ai-duel-investigation/retreat-final.log`。阶段检查实际采集和战斗大规模互锁、反复后撤与死路、目标或障碍变化、回调重入、CPU 开销、真实窗口、原版行为和双端同步。


### 多城镇采金配额（待验证）

路径：`src/session_ai_economy.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。城镇采金配额只保留目标为该城镇当前矿井的工人；全局配额继续保留有效矿井任务。重分配复用采集命令和携带资源返还。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> harvest-town` 由失败变为 2/2 通过，覆盖跨城镇任务、携带金币、保持正确订单与全局配额；夹具关闭工人路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。BootyBay 兽族对不死族隔离会话于 2,340 秒产生双方结果 0／1，不死族单位及建筑为零，日志 `tmp/docs-artifacts/war3/orc-undead-long/town-mine-final.log`；该会话由测试直接启动双方 AI，未覆盖实际窗口。阶段检查采集途中的城镇归属变化、多个矿井／工人、矿井移除或耗尽、金币入账事件与原版分配、实际对局和联机。

采金订单的城镇归属按当前目标矿井保留，工人经过其他城镇时不取消原任务。`harvest-town` 补充两个城镇均有配额时的边界场景，修复前该断言失败，修复后 2/2 通过；夹具直接调整工人位置、关闭其路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。自然跨城行走、多个工人和木材分配仍待阶段验证；本补充未重跑原图长局。


### 多城镇伐木任务归属（待验证）

路径：`src/ai.h`、`src/session_ai_economy.cpp`、`src/session_ai_natives.cpp`、`tests/campaign_ai_tests.cpp`、`docs/ai.md`。保留采集订单对应的城镇及订单轮次，工人跨越城镇边界或树木耗尽自动换树时不丢失归属；配额缩减、城镇失效、订单更改、单位失效和停止采集清理归属。

Win32 Release 客户端与测试目标编译通过；`war3_campaign_ai_tests <data-root> <campaign-ai-fixture> harvest-town` 2/2，包含跨城、两个城镇配额、缩减、销毁城镇、树木耗尽换树和停止采集；跨城通过直接调整位置，夹具关闭工人路径碰撞并暂停 AI 脚本线程。`harvest` 与 `melee-mines` 各 2/2 通过。阶段验证自然跨城移动、订单回调与易主／死亡、全局配额变化、原版语义、实际窗口、性能及联机同步。


### DotA 英雄经验目标（待验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`、`docs/dota-hero-experience.md`。`AddHeroXP` 对空、已失效和非英雄目标无操作；有效英雄的经验倍率和暂停开关沿用现有路径。

Win32 Release 客户端及测试目标编译通过；`war3_revival_tests <data-root> <hero-revival-fixture> hero-xp` 1/1，覆盖空、已移除单位及英雄、不兼容句柄、非英雄、有效英雄和暂停经验。DotA 原图隔离会话 `-sd` 购买英雄并发出攻击移动，修复前脚本报错，修复后推进 360 秒且观察到死亡和复活，记录 `tmp/docs-artifacts/war3/dota-combat-flow/after-xp-movement.log`。阶段检查真实窗口、所有玩家／英雄、脚本重入、经验倍率与数值边界、暂停／幻象、技能表现、其他地图及联机同步。


### 英雄经验与等级接口失效目标（待验证）

路径：`src/session_hero.cpp`、`tests/revival_tests.cpp`、`docs/dota-hero-experience.md`。英雄经验、等级、技能点和经验暂停接口处理空、已移除、不兼容及非英雄目标；有效英雄沿用实际状态更新。

Win32 Release 客户端及测试目标编译通过；`war3_revival_tests <data-root> <hero-revival-fixture> hero-xp`、`awaken` 各 1/1，覆盖无效目标返回值和有效英雄经验／暂停／等级／技能点及既有酒馆复活。DotA 原图隔离会话购买育母蜘蛛、学习麻痹之咬并攻击测试敌人，观察到敌人获得 `B01D`；日志 `tmp/docs-artifacts/war3/dota-brood-attack/hero-xp-family-final.log`，该探针直接设置位置和创建目标。阶段检查英雄状态类型、幻象、生命周期／事件重入、等级及经验边界、窗口、原版经验数值和联机同步。


### 娜迦潜水地形条件（待验证）

路径：`src/session.h`、`src/session_unit_forms.cpp`、`src/session_ability_commands.cpp`、`tests/unit_forms_tests.cpp`、`docs/unit-forms.md`。潜入命令和按钮使用同一位置路径条件，浮出不受该条件限制。

Win32 Release 客户端及专项程序增量编译通过；`war3_unit_forms_tests <data-root> <naga-submerge-fixture> submerge` 1/1，覆盖三种娜迦陆地拒绝、水域按钮启用和潜入／浮出，以及形态、隐身、移动、武器和句柄。夹具关闭单位路径碰撞。阶段检查实际窗口、浅水及动态障碍、地图脚本修改通行位、技能覆盖、原版地形判断与反馈、侦测和联机同步。


### 亡灵第二章至第三章转场（待验证）

路径：`docs/campaign-flow.md`；复现入口及日志为 `tmp/docs-artifacts/war3/undead02-probe-1031/`。独立 Win32 探针依次运行第二章、间章和第三章：第二章直接完成两个任务并设置英雄属性，胜利对话框选择继续；间章请求第三章；第三章恢复英雄等级 5 和用户数据 24168。此检查跳过建造、寻路和战斗，手动启动各会话，不证明实际产品自动切关及原版 w3v 兼容。阶段验证自然完成任务、窗口与音画、间章播放、完整英雄／物品继承和实际自动切关。


### 战斗数值显示宽度（待验证）

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击和护甲的基础值与加成共用信息列宽度，过长时等比缩小，保留独立颜色。Win32 Release 客户端增量编译通过；游戏内 Agent 的六物品圣骑士画面显示普通攻击基础值与正加成分开，证据位于 `tmp/docs-artifacts/war3/agent-info/layout-latest-agent/`。阶段核对极值与负加成、英雄双武器、各族及不同分辨率，并与原版画面对照。


### 娜迦季风（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [季风](monsoon.md)。英雄和野怪原型接入点目标持续施法、周期伤害与已有电脑施法路径。Win32 Release 客户端及专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> monsoon` 1/1，覆盖两种原型、命令、目标范围／友军过滤、魔法消耗、持续状态与停止施法。测试暂停了已有单位和测试目标以隔离自动攻击，未覆盖实际窗口或 AI。阶段检查建筑、空中、魔免、等级、对象覆盖、波次及事件重入、施法者死亡／易主、视觉／音效、双端同步和原版雷击时序。


### 战役黑暗之门（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_spells.cpp`、`src/session_area_spells.cpp`、`src/session_summons.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [黑暗之门](dark-portal.md)。Win32 Release 客户端和专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> dark-portal` 1/1，覆盖源单位列表、数量范围、点目标施放、生成真实单位、所有权与冷却；测试暂停地图既有单位。阶段检查地图覆盖、数量极值、不同运动类型与无空间、召唤事件重入、取消／易主／死亡、AI、机械小动物共享落点、联机、战役和原版召唤时序及视觉。


### 战役混乱之雨（待验证）

路径：`src/spells.h`、`src/session_spell_info.cpp`、`src/session_area_spells.cpp`、`src/session_ai_armies.cpp`、`tests/spell_tests.cpp`；说明见 [混乱之雨](rain-of-chaos.md)。Win32 Release 客户端与专项程序编译通过；`war3_spell_tests <data-root> <BootyBay地图> rain-chaos` 1/1，覆盖原版一级能力解析、点目标命令、分时创建两只地狱火、归属、限时生命和冷却。测试暂停了既有单位；落击伤害、眩晕、AI 与实际窗口未在此次运行中验证。阶段核对各等级、地图覆盖、位置合法性、被引用能力失效／替换、队列预算、死亡易主、事件重入、原版时序／随机顺序、联机及音画。

### 直线武器穿透与攻城溅射（待验证）

路径：`src/session_projectiles.cpp`、`tests/passive_tests.cpp`、`docs/destructable-weapon-attacks.md`、`docs/attack-ground.md`。mline 零扩散距离只命中主目标；aline 零扩散及攻击地面使用范围伤害；穿透从冲击点向后按距离排序并应用逐次伤害损失。

Win32 Release 客户端和测试目标编译通过；`build/windows-x86/bin/Release/war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/auras-passives/fixture.w3m line-weapon` 4/4，覆盖狮鹫、风暴之锤、刃车穿透升级和地面攻击，不加载 Game.dll。阶段对照原版损失公式、碰撞边界和目标顺序、穿透升级与地面攻击，验证物品／可破坏物、目标消失／回调重入、闪避／弹射、实际窗口及双端同步。

### 单机地图初始随机种子（待验证）

路径：`src/map_preparation.cpp`、`src/session.h`、`src/game_view.cpp`、`tests/map_seed_tests.cpp`、`tests/generate-map-seed-fixture.py`、`CMakeLists.txt`；说明见[会话随机流快照](session-random-persistence.md)。单机地图准备在脚本初始化前生成并保留初始种子，显式种子和联机同步种子保持不变。

Win32 Release 客户端与 `war3_map_seed_tests` 编译通过；`python tests/generate-map-seed-fixture.py --data-root <data-root>` 后执行 `build/windows-x86/bin/Release/war3_map_seed_tests.exe <data-root> ../../tmp/docs-artifacts/war3/map-seed/fixture.w3m`，4/4 通过，覆盖 config 内随机取值、文件与内存地图重建随机状态、显式零种子，无 Game.dll。阶段验证实际选图、取消、重开、战役、自定义地图与脚本重设种子、联机及原版随机初始化；单机回放仍未接入。

### 商店交互范围（待验证）

路径：`src/session_commerce.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`、`docs/commerce.md`。四族与中立商店按 `Aall`／`Aneu` 能力等级的源范围筛选买家，命令按钮和实际交易沿用相同规则。

Win32 Release 客户端及测试目标编译通过；在 `watcher/war3` 执行 `python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m`，再执行 `build/windows-x86/bin/Release/war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m shop-range`，7/7 通过，覆盖四族商店、中立商店、酒馆及自定义 720 范围，检查边界、按钮和实际物品购买，不加载 Game.dll。阶段核对原版距离测量、单位碰撞、多买家与手动选择、空背包、技能禁用、多人／共享控制、酒馆唤醒、显形建筑及真实窗口。

### 商店指定买家（待验证）

路径：`src/session_commerce.cpp`、`src/commerce.h`、`src/session.h`、`src/game_commands.cpp`、`src/game_view.*`、`src/game_inventory_drag.cpp`、`src/player_commands.cpp`、`src/lan_actions.*`、`src/lan_action_encoder.cpp`、`src/lan_simulation.*`、`tests/passive_tests.cpp`、`tests/revival_tests.cpp`；说明见[商店](commerce.md)。商店提供源选择按钮及右键目标选择，购买命令携带买家并在消费时校验；商店物品栏当前支持显示及提示。实验联机为指定买家使用 `0xfd`，既有无买家 `0xf4` 保持读取。

Win32 Release 客户端和两个测试目标编译通过；`war3_passive_tests <data-root> ../../tmp/docs-artifacts/war3/shop-range/fixture.w3m shop-buyer` 1/1、`shop-range` 7/7；`war3_revival_tests <data-root> ../../tmp/docs-artifacts/war3/hero-revival/fixture.w3m lan-purchase-buyer`、`lan-purchase`、`awaken` 各 1/1。覆盖买家满栏／越界／移除、实际购买、动作编解码和原有交易／唤醒；未执行双进程或游戏内画面检查。阶段验证实际鼠标／热键／取消、原版按钮与库存布局、买家切换及指示、原版选择规则／共享控制、商店物品交互、同步延迟与双端／回放。

### 商店买家物品操作（待验证）

路径：`src/game_commands.cpp`、`src/game_inventory_drag.cpp`、`src/game_view.*`、`src/player_commands.*`、`src/lan_action_encoder.cpp`、`src/lan_actions.*`、`src/lan_simulation.cpp`、`tests/revival_tests.cpp`；说明见[商店](commerce.md)。商店物品栏的使用、目标选择、快捷键、拖拽与实验联机消费连接当前买家，并重新检查商店与买家关系。

Win32 Release 客户端与测试目标编译通过；执行 `build/windows-x86/bin/Release/war3_revival_tests.exe <data-root> ../../tmp/docs-artifacts/war3/hero-revival/fixture.w3m lan-shop-inventory`，1/1 通过，覆盖动作编解码、换格、买家越界／商店取消选择的旧动作及普通单位物品动作。阶段验证实际窗口的点击／目标／拖拽／快捷键、队列和买家切换、目标／物品失效、共享控制、双端同步／回放和原版操作一致性。

### 商店收购物品（待验证）

路径：`src/session.h`、`src/session_commerce.cpp`、`src/session_inventory.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`；说明见[商店](commerce.md)。物品交付订单可向有 `Apit` 的商店出售持有物品，使用源配置范围／比例、真实资源和出售事件。

Win32 Release 客户端与测试程序编译通过；生成 `tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m` 后运行 `war3_passive_tests.exe <data-root> <fixture> pawn-item`，1/1 通过，覆盖可出售标志、商店能力、金币／木材、事件字段及途中状态失效，不加载 Game.dll。阶段验证远距离到达、鼠标拖拽、玩家共享控制、排队及双端、商店／单位／物品失效与事件重入、自定义范围／倍率、四舍五入、原版事件次序与画面。

### DotA 迈达斯之手目标施法（待验证）

路径：`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[迈达斯之手](dota-midas.md)。`ANab` 物品通过目标输入进入现有施法、冷却和地图脚本。

Win32 Release 客户端编译通过；原图隔离会话直接创建英雄、敌方步兵与 `I06D`，目标生命变为零、英雄经验增加、物品保留且进入冷却，日志 `tmp/docs-artifacts/war3/dota-midas/current.log`。阶段验证购买／合成、不同目标／距离／取消、奖励和事件时序、回调失效、联机、原版及真实窗口。

### 黑皇杖与失效物品查询（待验证）

路径：`src/session_entities.cpp`、`src/session_inventory.cpp`、`tests/passive_tests.cpp`；说明见[失效物品句柄](dota-bkb-item-handles.md)。物品所有者、数量、用户数据、等级和类别查询按原版处理无效句柄。

Win32 Release 客户端及测试目标编译通过；`python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m`，再执行 `war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/pawn-analysis/fixture.w3m invalid-item` 1/1，覆盖有效、空、销毁及不兼容句柄。DotA 原图隔离会话使用 `I0FZ` 后得到 `I0G0`、免疫与冷却，推进 13 秒无脚本异常；记录 `tmp/docs-artifacts/war3/dota-bkb/bkb-after.log`。阶段验证实际购买／合成、多次使用、其他来源免疫、事件重入、联机和原版及游戏窗口。

### 紫怨与被动法术书（待验证）

路径：`src/session_equipment.cpp`、`src/session_item_use.cpp`、`src/session_spells.cpp`；说明见[紫怨](dota-orchid.md)。复合物品的被动法术书保留借用能力，由另一主动能力接收物品输入；`ANso` 支持物品目标施法。

Win32 Release 客户端编译通过；DotA 原图隔离会话直接创建紫怨与目标，观察目标沉默／恢复、装备加成及移除后清理；单独的原版法术书可打开。日志 `tmp/docs-artifacts/war3/dota-orchid/after-stats.log`、`book.log`。阶段验证实际购买／输入、随机及嵌套书籍、主动子能力与多来源、技能数值／事件、联机、原版和 GPU。

### 虚无能力与虚灵之刃（待验证）

路径：`src/entities.h`、`src/session_equipment.cpp`、`tests/passive_tests.cpp`、`tests/generate-passive-fixture.py`；说明见[虚无能力](ethereal-ability.md)。能力、书籍与物品刷新虚无状态，既有类别／攻击／伤害／治疗消费者读取该状态。

Win32 Release 客户端及测试目标编译通过；执行 `python tests/generate-passive-fixture.py --data-root <data-root> --output ../../tmp/docs-artifacts/war3/ethereal-ability/fixture.w3m`，再运行 `war3_passive_tests.exe <data-root> ../../tmp/docs-artifacts/war3/ethereal-ability/fixture.w3m ethereal-ability`，1/1 通过。DotA 原图隔离会话使用 `I0LT`，目标在 1 秒时虚无、5 秒时恢复；记录 `tmp/docs-artifacts/war3/dota-ethereal/after.log`。阶段验证物品／派生、多个来源及生命周期、伤害／治疗倍率、地图覆盖、真实窗口／原版及联机。

# 人族物品栏槽位对齐

路径：`src/game_inventory_layout.h`、`docs/unit-combat-panel.md`。物品图标及其冷却和交互区域向右对齐控制台槽位。Win32 Release 客户端编译通过；游戏内 Agent 选中六物品、100 经验的圣骑士，画面显示物品、经验条和攻击加成，拖拽后第 0／1 格的物品句柄交换。证据位于 `tmp/docs-artifacts/war3/agent-info/layout-slot-aligned/`。阶段核对四族皮肤、不同窗口比例、物品点击／冷却和原版画面。

### 穴居恶魔蜘蛛攻击表现（待阶段验证）

路径：`src/combat.h`、`src/session.h`、`src/session_projectiles.cpp`、`src/session_tick.cpp`、`src/game_view.cpp`、`tests/passive_tests.cpp`；实现与证据见 [蜘蛛攻击](spider-attack.md)。Win32 Release 客户端及 passive 测试目标编译通过；`spider-attack` 1/1、受影响的 `line-weapon` 4/4 通过；隔离地图游戏内 Agent 获取实际攻击帧。原版时序、附件点和轨迹、其他目标及边界、多人、长局资源释放与真实性能待阶段验证。

蜘蛛回程追踪补充：`src/session.h`、`src/session_projectiles.cpp`、`tests/passive_tests.cpp`。Win32 Release 客户端与 passive 目标编译通过；`spider-attack` 1/1 通过，覆盖回程中攻击者移动、朝向及发射高度，原版挂点和移动画面待阶段验证。

### 战斗信息科技角标（待阶段验证）

路径：`src/combat.h`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`tests/passive_tests.cpp`；行为及局限见 [单位战斗信息面板](unit-combat-panel.md)。Win32 Release 客户端与 passive 目标编译通过；`weapon-ui` 定向检查 1/1 通过，游戏内 Agent 画面确认圣骑士无升级攻击图标，以及步兵攻击二级、护甲一级角标。阶段核对各级科技、同单位多个科技、双武器、地图覆盖、四族皮肤和原版显示。

### 两栖 AI 路线补员（待阶段验证）

路径：`src/session_ai_armies.cpp`、`tests/campaign_ai_tests.cpp`；规则见 [战役两栖 AI 路径](campaign-amphibious-ai.md)。Win32 Release 客户端与 campaign AI 目标编译通过；`amphibious-reinforce` 2/2 通过，覆盖补员、路径点前进和取消。阶段核对实际战役、多人同步、补员死亡／易主／目标变化、寻路失败、动态障碍、回调重入、混编与原版选点。

### 多选头像的双目标物品（待阶段验证）

路径：`src/game_selection_panel.cpp`；说明见 [多选面板](selection-panel.md)。Win32 Release 客户端增量编译通过；游戏内 Agent 对照隔离地图，双目标物品通过头像选中单位并生效，纯地点物品不接受单位头像且未消耗。阶段核对真实地图、原版鼠标交互、Shift 排队、单位失效、纯单位物品和联机同步。

### 多选英雄头像光效（待阶段验证）

路径：`src/game_selection_panel.cpp`；说明见 [多选面板](selection-panel.md)。Win32 Release 增量编译通过；游戏内 Agent 截图确认两个英雄及英雄／步兵混选的头像与生命条可见，点击目标物品仍生效。阶段核对四族及自定义皮肤、12 个单位、纹理缺失／设备恢复、窗口比例、交互与原版光效。

### 单位事件索引（待阶段验证）

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_arrow_status.cpp`、`src/session_combat.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`；说明及命令见 [基础战斗](combat.md)。Win32 Release 客户端与 passive 目标编译通过；`event-index` 和 `spider-attack` 各 1/1 通过。阶段核对真实地图触发器、重复注册、禁用／销毁／重入、目标失效／易主、长局索引内存和帧耗时，以及原版事件次序与联机同步。

### 计时事件分发索引

路径：`src/session.h`、`src/session_callbacks.cpp`、`src/session_tick.cpp`、`tests/generate-passive-fixture.py`、`tests/passive_tests.cpp`。计时触发事件及计时器到期事件分别索引，模拟步在执行回调前快照需要派发的事件；清理已销毁的计时器和失效事件索引。

Win32 Release 客户端及 passive 测试目标编译通过；隔离地图 `timer-index`、`event-index` 各 1/1 通过，覆盖到期顺序、回调上下文、回调中销毁和注册触发器、暂停同帧计时器及既有单位事件。夹具 `tmp/docs-artifacts/war3/timer-index/fixture.w3m`；命令为 `war3_passive_tests.exe <data-root> <fixture> timer-index` 与 `event-index`。阶段核对周期计时器、重入／销毁生命周期、真实地图和联机顺序，并测量长局索引内存及帧耗时；尚无性能基准结论。

### 单位分类无效句柄

路径：`src/session_entities.cpp`、`tests/passive_tests.cpp`、`docs/unit-classifications.md`。`IsUnitType` 对空、移除、非单位和越界分类按原版入口返回 false，已死亡但尚未移除的单位保留死亡分类。Win32 Release 客户端及 passive 测试目标编译通过；`war3_passive_tests.exe <data-root> <fixture> invalid-unit` 4/4 通过，夹具 `tmp/docs-artifacts/war3/timer-index/fixture.w3m`。真实地图及原版运行时句柄生命周期、各分类与回调重入待阶段验证。

### 战斗数值符号可读性

路径：`src/game_commands.cpp`、`docs/unit-combat-panel.md`。攻击／护甲数值字号调整并保留列宽自适应，使加成正号和基础伤害范围分隔符可辨认。Win32 Release 客户端增量编译通过；游戏内 Agent 在六件攻击物品的圣骑士上取得 `24-34 +36` 画面，证据 `tmp/docs-artifacts/war3/agent-info/layout-value-font-1031/`。负值、极值、双武器、四族皮肤、不同窗口和原版画面对照待阶段验证。

### 攻击与护甲悬停说明

路径：`src/game_loading.*`、`src/game_commands.cpp`、`src/agent_capture.h`、`src/main.cpp`、`tools/agent-pointer.ps1`、`README.md`、`docs/unit-combat-panel.md`。信息图标悬停展示实时类型和原版本地化说明，遵循扩展提示开关；Agent 新增后台悬停用于游戏内核对。Win32 Release 客户端编译通过；Agent 选中六物品圣骑士，分别悬停攻击与护甲并抓取英雄类型及相应说明，证据 `tmp/docs-artifacts/war3/agent-info/layout-combat-tooltips-final-1031/`；悬停后拖拽前两格物品并核对句柄交换，证据 `tmp/docs-artifacts/war3/agent-info/pointer-hover-drag-final-1031/`。阶段核对全部攻击／护甲类型、双武器、地图覆盖、扩展提示开关、前台鼠标、Agent 前后台切换及原版位置；地图自定义伤害表可能不同于源说明。

### 英雄属性信息栏

路径：`src/session.h`、`src/session_hero.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`docs/unit-combat-panel.md`。基础属性和实时加减值分别显示，悬停使用原版说明和当前地图的属性收益系数。Win32 Release 客户端和 passive 测试目标编译通过；`war3_passive_tests.exe <data-root> <fixture> weapon-ui` 1/1 通过。游戏内 Agent 以 `tmp/docs-artifacts/war3/agent-info/hero-attributes-custom.w3m` 验证贵族圆环、负敏捷及自定义生命／护甲／魔法系数，三张提示画面位于 `tmp/docs-artifacts/war3/agent-info/layout-hero-attributes-final2-1031/`。其余主属性、多个来源、极值／双武器、幻象、地图本地化、真实鼠标和原版布局待阶段验证。

### 攻击速度和护甲减伤提示

路径：`src/combat.h`、`src/session.h`、`src/session_combat.cpp`、`src/session_combat_destructable.cpp`、`src/session_damage.cpp`、`src/session_research.cpp`、`src/game_loading.*`、`src/game_commands.cpp`、`tests/passive_tests.cpp`、`docs/unit-combat-panel.md`。攻击提示显示实时伤害／射程／速度，护甲提示显示物理减伤；攻击计时和伤害结算复用同一计算。Win32 Release 客户端与 passive 目标编译通过；`war3_passive_tests.exe <data-root> <fixture> weapon-ui` 1/1，覆盖加速后显示间隔与真实攻击计时，以及负护甲提示与实际伤害一致。Agent 核对圣骑士正常与关闭扩展说明的提示，证据 `tmp/docs-artifacts/war3/agent-info/layout-combat-values-final-1031/` 和 `layout-combat-values-release-1031/`。原版分档边界、远程／双武器、技能及护甲组合、自定义配置和实际鼠标待阶段验证。
