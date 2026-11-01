# 战役入口与关卡切换

暗夜精灵第六章的隔离会话直接击毁恶魔之门、将伊利丹移入古尔丹之颅区域，再击杀提克迪奥斯；原图两段过场后进入胜利对话并指向 `NightElf06Interlude.w3m`。第七章另以五秒计时触发原图终局，结果为胜利并指向 `BonusCredits.w3m`。日志和临时探针位于 `tmp/docs-artifacts/war3/tft-ne4-next/nightelf06-quest.log`、`nightelf07-goal.log`；两次均直接调整目标或计时，未覆盖自然战斗、完整防守或实际窗口。

亡灵第七章胜利后的隔离会话将克尔苏加德的六件测试物品保存至独立 gamecache；第八章原脚本将物品移至六个指定矩形，次数和用户数据保持一致。探针直接设置英雄、物品并击杀三名目标，未覆盖自然战斗或窗口；日志与探针位于 `tmp/docs-artifacts/war3/tft-ne4-next/undead07-items.*` 和 `undead08-items.cpp`。

亡灵第三章使用第二章转场保存的独立缓存启动后，在无窗口、静音的隔离会话中持续推进 600 秒；150 秒检查到阿尔萨斯等级 5、用户数据 24168，120–600 秒处于可操作状态且未请求退出。探针没有发出玩家命令或完成任务，不能证明正常对局、转场和原版表现；记录位于 `tmp/docs-artifacts/war3/undead02-probe-1031/continue.log`。

战役菜单从原版 CampaignStrings 和 FDF 读取 ROC／TFT 战役、章节、难度和背景，依据本地进度开放入口；选择章节后直接读取原安装的地图归档，并进入现有地图准备和游戏加载流程。战役资料和难度写入独立用户目录的 Campaign/profile.bin；脚本可修改战役／章节／过场可用状态，并通过 ChangeLevel 请求下一关，跨关英雄与数值使用 [gamecache](campaign-gamecache.md)。重新开始、回菜单和强制选择战役接入相应入口。自定义地图切换路径限定在原安装 Maps 或当前地图所在目录内，保持其原有会话类型。

这是功能接入，尚未经过完整战役运行或原版一致性验证。模型过场的其他模型事件、第四个 Mission 字段的行为、完整章节解锁和配音、原版存档／回放／局域网以及 .w3v 文件兼容尚未完成。原安装目录只读，战役数据不生成地图解包资产。战役资源目录、路径与原版资料证据在 tmp/docs-artifacts/war3/campaign/。

教程标志的原版入口：Game.dll 1.27 的 `0x6f2d6372` 读取 `TutorialCleared`，为零且满足其他条件时显示原版 `SKIP_TUTORIAL` 文本；确认分支 `0x6f2d1818` 将该标志设为 1 并继续保存的目标，其他按钮分支不执行此流程。原版 `0x6f2b0070` 根据 `CampaignList` 中的非空段名查找目标并返回索引。静态证据为 `ev_32fc47bb339b9b3c837716f8ed74808553d5eebe939c778eec4011049142909a`、`ev_03df87b081f9a62a2fc757d238b061db6c47ddad5270f1f287d9ab7cf62819c6`、`ev_8ce2e61539276371372fac57663e78ed0e7805f481b92fb5f8d66addf76b9042`、`ev_fa5bc4d787b3573a6743f06f9710774952eaecccf374845b29ba0fac63019c6a`。客户端选择原版战役列表中第一个非空项之后的 ROC 战役且教程未完成时显示本地化确认框；确认保存标志并进入选定战役，取消返回战役列表；教程完成或 TFT 战役直接进入。控件使用源皮肤与 `SKIP_TUTORIAL`／`YES`／`NO` 字符串，版本门控、快捷键、控件布局和完整原版触发条件仍需对照。真实窗口、脚本 `SetTutorialCleared` 与跨会话保存尚待阶段验证。

战役菜单的影片条目读取 Movies 目录同名文件：虽然扩展名为 .mpq，其内容为 BLZ0 AVI／MP3。客户端以 DirectShow 从原文件播放，通过原安装的 blizzard.ax 免注册构造解码器，不写解包文件；支持静音、跳过及返回菜单。原版安装的解码器按 Win32 架构和 SHA-256 校验。资料片结局模型按原版顺序连续切换十段动画及对应相机，在第二段根据 UI/MiscData.txt 的 Scene1 声音标签启动原音轨。REA 确认原版场次切换和声音配置消费；原版 MRFX／MRDX 事件已接入六份 MRF 披风网格动画、纹理和帧插值；其完整画面、渲染状态和原版一致性仍待验证，其他模型事件仍待实现。影片实际画面、听感、跳过／窗口恢复也待功能阶段验证。

地图脚本的 PlayCinematic 与 PlayModelCinematic 分别登记影片和模型槽位；对局结束转场时先播放模型，再播放影片，随后继续胜利／切关流程。原版反汇编支持此顺序；退出类型边界及播放期间其他声音的处理仍待对照。

序章组选择流程所用 SyncSelections 在单机读取本地选择；自研实验联机与回放使用人类玩家快照和等待屏障，GroupEnumUnitsSelected 从当前脚本线程的同步视图读取，详见[实验联机](lan-experimental-flow.md)。该实现尚待双客户端、回放及原版对照；脚本本地选择的事件和实时命令状态同步仍待完成。序章掉落脚本的 SetItemDropID 将来源类型保存到物品状态，并由独立 gamecache 的单位物品快照保存及恢复；原版普通存档持久化该字段，原版 StoreUnit 是否保留仍待对照。

战役区域移动、地点视野查询、地面物品矩形枚举及对应过滤／枚举上下文已接入；单位选中查询、八种编组命令和研究单位查询连接现有选择、命令及研究事件。编组命令的返回值和部分失败、物品在过滤回调中的移除或转移、区域边界和原版事件语义仍待对照。序章第二关教学计数板状态和 HUD 已接入，原版布局与实际教程交互待验证；多人同步尚未实现，见[战役计数板](campaign-leaderboard.md)。

脚本可按单位原始名称或类型编号对应的字符串创建及枚举单位，并支持限制数量的类型／地点范围枚举；筛选复用现有编组和回调上下文。技能等级增减接入已有能力状态和装备刷新，默认索敌范围与物品无敌查询读取实际对象配置或状态。边界和原版精度待阶段验证。

战役列表按当前战役的 `AmbientSound` 读取 `UI/SoundInfo/AmbienceSounds.slk`，循环播放源声音；切换到不同声音时替换，离开战役界面时释放，重新进入时按当前音量、环境音开关及静音参数创建。该声音与菜单音乐独立；实际听感、切换时机与原版行为待集中验证。

返回战役章节页时重新读取脚本保存的战役进度；若战役选择已变化，则选择目标战役第一张可玩的章节，否则保留当前章节。章节页恢复后按当前进度重新启动后台地图准备，已锁定或影片条目沿用既有检查。窗口交互、实际章节胜负／跨战役返回与原版选择行为待集中验证。

`SetDefaultDifficulty` 更新本次会话的默认难度，`GetDefaultDifficulty` 返回该值；原 Blizzard.j 胜利回调可通过现有 `SetGameDifficulty` 恢复默认难度。当前实现允许 0–3，不直接修改当前难度或持久化战役界面选择；原版默认值、持久化与异常参数行为仍待对照。

Human01 胜利流程中的 `udg_QuestOrcs` 在地图脚本中未赋值，任务完成接口需接受空句柄；任务／目标句柄解析失败时的操作与查询使用安全返回。原版 `QuestSetCompleted` 入口 `0x6f1f2550` 与 `QuestItemSetCompleted` 入口 `0x6f1f24d0` 在句柄解析失败时直接返回，原始指令记录于 `tmp/docs-artifacts/war3/human01-victory-1030/original-quest-natives.txt`。隔离探针在玩家获得控制后以 `KillUnit` 触发首领组死亡事件，推进至胜利对话框；选择继续后得到 `Maps\Campaign\Human02.w3m` 换关请求，见 `tmp/docs-artifacts/war3/human01-victory-1030/victory-continue.log`。该探针不覆盖手动战斗、真实窗口、第二关载入及完整战役。

Human02 开场使用从未赋值的 `udg_Knight01`，将空单位传入 `GetUnitLoc`；无效单位现在返回空 location，读取无效位置的 X/Y 返回零，移除无效位置不产生动作。Warcraft III 1.27 Game.dll 的 `GetUnitLoc`（`0x6f1e6280`）、`GetLocationX/Y`（`0x6f1e3240/0x6f1e3260`）和 `RemoveLocation`（`0x6f1f2d80`）的句柄解析失败分支见 `tmp/docs-artifacts/war3/human02-1030/original-location-natives.txt`。隔离探针载入 Human02 并推进 400 秒，在 60.25 秒采样时玩家控制已恢复，日志见 `tmp/docs-artifacts/war3/human02-1030/locfixed.log`；这是未携带 Human01 gamecache、未操作战斗的空闲开局，不代表真实换关或完整关卡通过。

Human01 原胜利脚本保存阿尔萨斯并请求 Human02 后，隔离探针销毁前一会话并启动 Human02；原载入脚本恢复其 4 级、用户数据和指定库存物品，证据见[战役 gamecache](campaign-gamecache.md)。此探针通过直接击杀首领组加速，未经过实际窗口和自动换关界面。

Human02 原图胜利流程的隔离探针在开场控制恢复后，通过辅助脚本标记基地任务已完成，再对原图剑圣调用 KillUnit；原地图触发器进入胜利对话框，选择继续后发出 `Maps\Campaign\Human02Interlude.w3m` 换关请求，日志位于 `tmp/docs-artifacts/war3/human02-victory-1030/victory.log`。该复现跳过真实基地建造、战斗和窗口操作，未验证间章加载或完整关卡。

Human02 至 Human03 的隔离链路中，将阿尔萨斯设为 5 级后直接执行 Human02 原图的关卡准备函数；间章发出 Human03 换关请求，手动载入 Human03 后恢复了 5 级阿尔萨斯，开场结束后玩家控制权恢复。日志位于 `tmp/docs-artifacts/war3/human03-continuation-1031/cache-chain.log`。该检查未自然完成 Human02，也未经过产品窗口自动切关、真实战斗和完整战役。

Human03 隔离探针将阿尔萨斯移入原图粮仓区域并对目标仓库下达攻击命令；原图受击和死亡触发后出现胜利对话框，下一关目标为 `Maps\Campaign\Human04.w3m`，日志位于 `tmp/docs-artifacts/war3/human03-continuation-1031/attack-ending.log`。探针直接调整单位位置，未覆盖自然寻路、鼠标输入、实际窗口或完整关卡。

Human04 隔离探针将阿尔萨斯移入原图剧情区域，再移至克尔苏加德附近下达攻击命令；原图死亡事件及结尾进入胜利对话框，下一关目标为 `Maps\Campaign\Human05.w3m`，日志位于 `tmp/docs-artifacts/war3/human03-continuation-1031/human04-objective.log`。探针直接调整单位位置，未覆盖自然寻路、界面、基地建设或完整关卡。

资料片暗夜精灵第一章的隔离开场已恢复玩家控制；真实任务、窗口及地图中战争践踏的参数处理仍待完成或验证，见[关卡状态](campaign-nightelfx01-status.md)。

亡灵第二章至第三章的隔离链路：开场恢复控制后将阿尔萨斯设为 5 级并写入用户数据 24168，直接完成基地与圣物任务并触发原结束过场；胜利对话框选择继续后请求 `Undead02Interlude.w3m`。单独启动间章并运行原脚本后请求 `Undead03.w3m`；第三个会话从同一独立 gamecache 恢复到 5 级及相同用户数据，玩家控制已恢复。三个探针及日志位于 `tmp/docs-artifacts/war3/undead02-probe-1031/`。该检查手动创建会话并直接完成任务，未覆盖真实战斗、产品窗口自动切关、音画和原版缓存格式。

亡灵第三章至第五章的隔离链路使用第二章保存的独立缓存：第三章直接击杀四个原图基地目标，经原死亡事件进入胜利并请求第四章；第四章恢复 5 级、用户数据 24168 的阿尔萨斯，直接击杀三个祭坛并依次拾取原脚本创建的钥匙，将英雄移入出口区域后由原触发器进入胜利并请求第五章；第五章恢复相同英雄等级和用户数据，玩家控制已恢复。记录位于 `tmp/docs-artifacts/war3/undead03-end/`。探针手动启动后续会话，跳过自然战斗与寻路，未覆盖真实窗口、自动换关、完整战役及原版缓存格式。

亡灵第五章至第八章的隔离链路延续同一份独立 gamecache：第五章直接击杀四个目标并将英雄移至太阳井，胜利后经间章请求第六章；第六章恢复 5 级、用户数据 24168 的阿尔萨斯，直接击杀 17 座敌方建筑后胜利并请求第七章；第七章恢复同样的英雄状态，直接击杀三位大法师后胜利并请求第八章；第八章恢复相同状态，缩短召唤计时后原图脚本记录玩家胜利并返回。记录位于 `tmp/docs-artifacts/war3/undead05-chain/`。各章为手动启动的静音隔离会话，直接改变目标或计时器；自然战斗、30 分钟防守、窗口自动切关、音画和原版存档格式均未覆盖。

资料片暗夜精灵第八章的静音隔离会话在开场后直接击毁 12 座 Player(4) 敌方建筑，原死亡触发器执行结尾、记录玩家胜利并请求 `NightElfX08Finale.w3x`；手动启动终章后原脚本运行至返回。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/ne8-goal.log` 和 `ne8-finale.log`。该检查直接完成目标并手动启动终章，未覆盖真实战斗、窗口自动切关和结尾音画。

资料片人族第一章 `HumanX01.w3x` 的原脚本对尚未赋值的仓库调用 `SetUnitColor`；该 native 对无效单位直接返回，对有效单位继续设置颜色。固定版 `Game.dll` 的 `0x6f1f7410` 在句柄解析失败时返回，本地 PE 字节与 Capstone 指令用于核对。修复后隔离会话越过开场并推进至 400 秒，玩家控制已恢复，日志 `tmp/docs-artifacts/war3/tft-ne4-next/humanx01-color-fixed.log`。未验证实际对局、任务与画面。

资料片人族第一至第三章隔离链路：第一章将卡尔设为 5 级、用户数据 24169，再直接恢复三座观测塔的生命值；原地图胜利对话选择继续后请求 `HumanX02.w3x`。第二章恢复相同等级和用户数据，直接击杀 8 个原胜利组目标后请求 `HumanX03.w3x`。第三章恢复相同英雄状态；修正可行走楼梯占地方向后，未手动移动单位的隔离会话约 120 秒恢复玩家控制，原版碰撞规则与实际窗口仍待对照。探针与日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/humanx01-goal.log`、`humanx02-goal.log` 和 `humanx03-walkable-fixed.log`。这是手动启动各会话并直接修改前两章任务对象的隔离检查，不代表实际战斗、自动切关或完整战役通关。

资料片人族第三章至第四章隔离链路：第三章开场后直接击杀狱卒及守卫，另击杀死亡回调中新增的守卫，原触发器进入胜利并请求 `HumanX03Interlude.w3x`；手动启动间章后请求 `HumanX04.w3x`。在复制的同一份独立缓存下启动第四章，75 秒时卡尔为 5 级、用户数据 24169，瓦丝琪存在且为 3 级，玩家控制已恢复。日志见 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03-goal.log`、`humanx03-interlude.log` 和 `humanx04-restore.log`。该探针直接击杀任务单位并手动启动各会话，未证明瓦丝琪的缓存继承、真实战斗、窗口自动切关或完整任务。第四章空闲会话在 160.25 秒采样后人为停止；该采样不可视为完整对局或性能基准。

资料片人族第四至第六章隔离链路：第四章直接移动卡尔、玛维及囚车完成目标，胜利后经手动启动的间章请求 `HumanX05.w3x`；第五章恢复 5 级、用户数据 24169 的卡尔，瓦丝琪存在且为 3 级。第五章依次将伊利丹移至传送门并缩短倒计时，原触发器进入胜利对话并请求 `HumanX06.w3x`；第六章独立会话约 120 秒恢复控制并运行至 400 秒。第五章中的原版派生治疗波 `AChv` 使用空订单的原型回退后不再中断。日志位于 `tmp/docs-artifacts/war3/tft-ne4-next/` 的 `humanx04-goal.log`、`humanx04-interlude.log`、`humanx05-restore.log`、`humanx05-healing-fixed.log` 和 `humanx06-opening.log`。上述会话手动启动、改变单位位置并缩短任务计时，不证明自然战斗、自动切关、英雄完整继承或实际画面。

第六章使用复制的独立缓存启动，开场后卡尔为 5 级、用户数据 24169，伊利丹为 10 级、瓦丝琪为 3 级；直接击杀玛瑟里顿后，原触发器请求 `HumanX06Finale.w3x`。手动启动终章后原脚本运行至返回，日志为 `tmp/docs-artifacts/war3/tft-ne4-next/humanx06-goal.log` 和 `humanx06-finale.log`。该检查不覆盖自然战斗、完整英雄继承、窗口自动切关、终章音画或原版缓存格式。

人族资料片隐藏关 `HumanX03Secret.w3x` 的隔离会话约 80 秒恢复控制并推进至 400 秒；另一个会话在 130 秒直接将传送门生命设为 400，原生命事件触发胜利对话并请求 `HumanX03Interlude.w3x`。日志为 `tmp/docs-artifacts/war3/tft-ne4-next/humanx03secret-open.log` 和 `humanx03secret-goal.log`。自然防守、所有波次、高分及真实窗口自动切关未验证。
## 兽族第六至第八章的英雄传递

原图隔离回归以三个独立会话和一个新建的用户目录执行兽族第六、七、八章。第六章直接击杀目标阵营单位以推进胜利，并为萨尔和凯恩设置等级 7 与自定义数据 2468；第七章核对恢复值，直接执行揭示凯恩的剧情触发器、交还原地图宝石并移动萨尔至先知区域；第八章再次核对两个英雄的等级和自定义数据。两个胜利对话继续后分别指向 `Orc07.w3m` 和 `Orc08.w3m`。

Win32 Release `war3_orc_campaign_chain_tests` 实际 1 通过、0 失败，未加载 `Game.dll`。入口要求调用者提供尚不存在的绝对用户目录，测试在其中写入本客户端战役进度和游戏缓存。该流程直接调用触发器、设置状态并移动／击杀单位，不覆盖自然寻路、实际战斗、用户界面、完整剧情、原版游戏缓存互通或进程间正式启动；这些仍待阶段验证。

人族第六章原图的两条结局已提供隔离检查：胜利场景由测试创建 100 个僵尸并通过阿尔萨斯伤害触发原图计数，进入胜利对话与 `Human06Interlude`，再通过结束过场事件进入 `Human07`，核对前关保存的英雄等级及用户数据；随后将英雄移入穆拉丁相遇区域并由测试消灭目标建筑，检查第七章胜利及 `Human08` 对两位英雄等级和用户数据的恢复；测试再消灭第八章的五艘目标船只，检查原图胜利与 `Human09` 的双英雄继承。失败场景先调用地图计数动作准备 99 次，再由玛尔加尼斯实际转换最后一名村民，检查失败与重开对话。两种场景均使用新建用户目录，Win32 Release `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> <victory|defeat>` 各 1 通过、0 失败；未加载 Game.dll。检查不代表自然对局的 100 次交战、基地攻防与船只战斗、完整过场观看、用户界面或原版时序验收。

人族第六至第九章原图连续隔离检查已延伸至最终胜利：第九章将英雄移入守护者区域并击杀守护者，剧情替换阿尔萨斯后检查等级和同一物品句柄，再击杀玛尔加尼斯及目标建筑，检查胜利、`HumanEd` 影片请求、返回战役选择和亡灵战役／首章及人族结尾解锁。`ReplaceUnitBJ` 从原英雄转移经验和物品，用户数据不转移。检查使用原版战役上下文、新建用户目录及直接移动和击杀；Win32 Release 测试目标的 `victory`、`defeat` 各 1 通过、0 失败，未加载 Game.dll。自然战斗、画面、影片播放和客户端自动切关仍待阶段验证。

人族第六章增加原图自然失败回归：独立本地用户目录中从开场静音运行，玩家不下达战斗命令；玛尔加尼斯完成 65 次转换，玩家基地建筑由非零降至零，原图脚本显示失败对话，点击首个按钮发出重开请求。Win32 Release `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> natural-defeat` 1 通过、0 失败，模拟时间 1947.25 秒，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/human06-long/natural-defeat-final.log`。该场景验证无操作失败路径，不代表玩家自然获胜、完整战役、原版时序或实际窗口一致性。

兽族第五章原图在独立用户目录的静音隔离会话中运行 400 秒后，由测试解除塞纳留斯无敌并直接击杀；原死亡事件和过场进入胜利对话，继续后请求 `Maps\Campaign\Orc06.w3m`。Win32 Release `war3_orc_campaign_chain_tests <data-root> chapter5 <new-absolute-user-dir>` 1 通过、0 失败，模拟时间 471.844 秒，未加载 Game.dll。原图无操作静音探针另运行至 2000 秒，玩家控制保持、无退出或脚本异常。日志 `tmp/docs-artifacts/war3/orc05-long/`；两者均不代表自然战斗、自动载入下一章、英雄继承或实际窗口验收。

兽族第五章结束时的格罗姆缓存已在新建隔离用户目录跨会话核对：测试设置等级 7、用户数据 2468，完成第五章胜利后启动第八章，使用灵魂宝石捕获格罗姆、将萨尔移入净化区域并在过场允许时跳过。`bj_lastLoadedUnit` 指向恢复成功的英雄，原图跳过脚本通过 `GetLastCreatedUnit` 将 `udg_Grom` 指向最近创建的萨满（`oshm`）；跳过后胜利和返回请求仍完成。原版 `Blizzard.j` 的 `RestoreUnitLocFacingAngleBJ` 只设置 `bj_lastLoadedUnit`，`GetLastCreatedUnit` 返回独立的 `bj_lastCreatedUnit`，与此脚本执行路径一致。Win32 Release `war3_orc_campaign_chain_tests <data-root> chapter5 <new-absolute-user-dir>` 的缓存及胜利检查 1 通过，回归断言最近创建单位、恢复单位及脚本引用关系；日志 `tmp/docs-artifacts/war3/orc08-bj-reference/chapter5.log`，未加载 Game.dll。测试手动移动英雄及触发第五章目标，原版客户端表现、自然战斗和实际窗口仍待验证。

人族资料片隐藏关补充无玩家命令的原图隔离检查：开场恢复控制后，模拟至传送门生命为 400，原图显示胜利对话并请求 `HumanX03Interlude.w3x`，模拟时间 469.469 秒。Win32 Release `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> natural-secret` 1 通过、0 失败，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/human-secret-natural/test.log`。该结果记录本客户端无操作路径，原版相同条件结果、建造防御、波次、高分和实际窗口仍待对照。

隐藏关后续波次隔离检查：单位进入等待区域前由原图脚本关闭路径碰撞，移动继续前往原目标；原目标不可通行时优先选择搜索到的最近可达替代格。普通单位和酒馆领袖从原图出生点进入等待区的定向检查通过。每 0.25 秒将传送门生命恢复至上限后，原图运行至最后一波完成、得分 31，胜利对话继续后请求 `HumanX03Interlude.w3x`，模拟时间 2302.78 秒。Win32 Release `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-final-wave` 1 通过、0 失败，未加载 Game.dll；日志 `tmp/docs-artifacts/war3/human-secret-order/final-wave.log`。人工维持生命的结果不代表正常防守、原版动态时序或实际窗口验收。

人族资料片隐藏关的原图隔离检查在恢复控制后，以玩家命令让原地图建造者建造 `nbt1` 防御塔；检查原价格 100 金币、实际扣费、施工完成、新塔向敌方单位发射弹道，以及伤害事件中来源为新塔且伤害大于零，完成于模拟时间 146.531 秒。Win32 Release `war3_human_campaign_chain_tests <data-root> <new-absolute-user-dir> secret-build` 1 通过、0 失败，未加载 Game.dll。未修改传送门生命或直接创建敌人；其他塔种、完整防守、实际窗口与原版对照仍待验证。

隐藏关另以独立会话验证 `net1` 与 `nft1`：等待原图科技开放后，通过原地图建造者的玩家命令建造，核对扣费、完工、弹道及来源为新塔的正数伤害；Win32 Release 各 1 通过、0 失败，模拟时间分别为 140.406 秒和 377.531 秒，未加载 Game.dll。运行模式为 `secret-build-net1`、`secret-build-nft1`；每次需新建独立用户目录。其他塔种及完整自然防守仍待验证。

隐藏关高级塔 `ndt1`、`ntt1` 在独立会话中按原图计时开放后，由原地图建造者通过玩家命令建造；扣费、完工、发射弹道和来源为新塔的正数伤害分别于模拟时间 671.031 秒、1036.19 秒通过。测试持续将传送门生命恢复至上限，并将建造者设为无敌，以维持到高级塔开放；未直接创建敌人。Win32 Release `secret-build-ndt1`、`secret-build-ntt1` 各 1 通过、0 失败，未加载 Game.dll。此结果不代表正常防守、完整波次或窗口验收。测试等待时若会话暂停会立即报错，避免胜利对话暂停后按模拟时间无限等待。

### 兽族战役任务采集物

无能力的 powerup 在拾取事件结束后移除，不要求物品表中的 `perishable` 标记；拾取事件期间脚本仍可读取物品类型。`OrcX01_05` 原脚本中的闪光草和雷霆蜥蜴蛋依此推进各自计数。

Win32 Release 客户端与相关测试目标编译通过；原图隔离会话手动创建采集单位和物品，通过脚本拾取闪光草及玩家命令拾取蛋，各触发原任务计数一次并消耗物品；重复拾取失效句柄不再计数。`quest-powerup`、灵魂链接符文和力量之书回归各 1/1，未加载 Game.dll。完整任务流程、商店采集物、拾取事件重入、原版时序和窗口待验证。

原版 `OrcX01` 的 Strange Brew 酒桶购买使用出售事件读取物品类型并移除库存。隔离原图测试手动创建买家、补足金币、添加库存及解除商店暂停，确认出售触发器执行和物品最终消失；完整任务及原版事件时序仍待验收。

`war3_orc_campaign_chain_tests <data-root> quest-shop <new-user-dir>` 在原版 `OrcX01` 等待开场结束后将雷克萨移动到陈处，以原版过场发现 Strange Brew 并生成库存和材料；使用玩家命令购买酒桶、拾取原脚本生成的两种材料，再返回陈处。原脚本的三项任务更新、任务完成、陈加入队伍、三件初始物品及过场结束后恢复控制通过。测试直接移动英雄、补足金币、将凤凰设为低生命并使雷克萨无敌，再以玩家攻击命令击败凤凰；不覆盖自然探索、完整战斗及窗口画面。


物品与可破坏物矩形枚举分别维护筛选和回调上下文，嵌套调用保留外层对象。原版 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a` 中，`GetFilterItem`／`GetEnumItem` 分别在 `0x6f1e2490`／`0x6f1e2170` 使用上下文编号 14／13；可破坏物对应 `0x6f1e2470`／`0x6f1e2150` 的编号 9／12。这是只读静态入口证据；完整嵌套行为与回调时序仍需运行对照。
