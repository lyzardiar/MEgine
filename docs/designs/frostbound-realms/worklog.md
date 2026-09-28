# 霜境战纪当前交接

工作目录 C:/Users/admin/.codex/worktrees/1339/MEgine，分支 codex/frostbound-realms。原目录 G:/work/github/MEgine 未改动。施工阶段 651dab9 与地图事件阶段 cc6e66a 已推送；本文件随中文编辑阶段提交。完整复刻目标保持 active。

2026-09-28 本阶段：World 实体写入维护 revision，WorldSnapshotCache 复用 Arc<EntitySnapshot>，每个 World 有唯一缓存身份。ScriptHost 和 PlaySession 使用不可变快照；原生 Play 返回变化实体、完整顺序、帧元数据及连续revision，前端重建全量状态；显式 Inspector/Agent 编辑强制全量校正。快照过滤重复 Name/Parent/Children 元数据，修复运行改名回滚。异步启动/停止串行且停止绑定原生会话；编译子进程有 30 秒超时和 kill_on_drop。组件序列化状态变更通过 World 写 API 或 get_component_mut，不能经只读引用内部修改。

验证：core 11、script 20、scene 18、Play runtime 8、Play compiler 1、Play 前端 4、真实 QuickJS frost_sample 2 全部通过；另一个手动采样测试未运行。快照测试覆盖所有 World 写入口、未知组件、父子/排序/激活/标签/层、删除与代际复用、更换 World、历史帧隔离、过期结果和重启。真实 QuickJS 的 35 帧载荷 1,060,789 / 35,148,665 字节（431 个变化实体），减少约 97%。完整双原生编辑器 QA 通过，包含原有各游戏模式、编辑保存试玩、英雄加点施法、攻城飞行、两客户端真实 TCP 与重连。

性能原始数据：performance-hero-baseline.json 和 native-performance-qa.json；对照汇总 performance-cache-comparison.json。同场景 1280×720，预热 5s + 三组 5s 窗口，单位数 20/21/22。中位数模拟 15.616→6.217 ms，模拟请求 54.724→17.644 ms，工作预算代理 32.631→19.893 ms，呈现 17.60→21.33 FPS。最终完整 QA 短采样 62 次、20.72 FPS，工作预算 21.176 ms。整体未达 5 ms，非 GPU 时间、非 Player 帧率、非大军团基准。前端全量 fingerprint 和原生帧读回/传输仍有耗时。

最终 Player 158 文件，内容哈希 e5770aeb6351f2f73ed83ab28473094e94550f2fe625bbfca020a048a58dcb09。启动证据见 player-smoke.json。Main.js 与 Builds 按仓库规则忽略，新检出先 node scripts/build-frostbound.mjs。tmp 和 scripts/__pycache__ 未纳入提交。

已有内容：四阵营地面/攻城/飞行单位、四英雄16技能、RPG/三路MOBA/十二波TD、地图编辑、联机。免费资产39来源模型+3组合塔、地表/粒子/字体及原创UI插画。未完成原作战役、完整四族内容/美术、完整 Dota 规则、海军、多层地形、触发器图、录像观战、大规模导航、公网系统与5ms目标。物理键鼠、实际听感和跨机器联机未验收。下一阶段继续提升战斗/地图和阵营内容，不得把阶段完成当整个目标完成。

2026-09-28 施工阶段：四族施工/协作/驻留/生长消耗/领地召唤，10%初始工地生命与随进度补血，75%取消退款，按损伤支付维修，扩张据点/最近完工据点交货/最后据点胜负，AI派工与补充工人。存档校验占用关系并兼容旧工地，协议3拒绝旧客户端，敌方看不到驻留工人或施工私有字段。复用现有 Quaternius 建筑及 Kenney wall-block，新增32个工地装饰槽和施工粒子。未新增外部下载。

本阶段 Node 游戏规则/TCP 全通过（新增 test-frost-construction.mjs，四族AI 800 tick、施工生命周期/经济/存档/胜负边界），真实 QuickJS frost_sample 2/2 通过，完整原生 QA 和独立施工 QA 均通过。独立只读审查发现生长工地缺失吞噬工人的存档漏洞，已修复并回归。Agent验证选工人、开工、停止暂停、右键恢复、工地取消75%退款，完整QA还验证所有既有游戏/编辑/英雄/两客户端TCP重连。最后据点取消及未完工商店/补给限制由规则回归验证。截图 construction.png/construction-selected.png；native-construction-qa.json 与 native-qa.json 为证据。

当前独立包158文件、1611场景实体、42模型条目，内容哈希98df4f19478ee937e2d33bd7a9a95afe0b353403ffb27093fe79779e62cb7047。按manifest逐文件SHA-256与Release exe核验；最终启动证据以player-smoke.json为准。施工阶段完整QA短采样59次，模拟7.779ms、原生命令8.157ms、呈现18.80FPS；此前专项性能对照继续保留，不能将不同流程直接比较。物理键鼠、听感、跨机LAN和完整Player操作仍未验收。

2026-09-28 地图事件阶段：32矩形区域、每条8条件/8动作、all/any、前置依赖、相对延迟、重复次数与间隔；增援整批规划保证资源奖励和生成的原子性，动作按作者顺序执行。区域/触发器依赖删除受保护，保存计数和调度时间，兼容旧地图/存档。公告按队伍保存、对手看不到作者配置和运行状态；协议4拒绝旧客户端。五页编辑器可编辑区域、条件/动作/依赖和英文名称/公告，纯点选不污染撤销。F8模板Supply Road完成抵达增援、自动行军、护送奖励，新增资产只是该地图JSON，复用免费模型。

验证：Node规则与TCP通过，新的test-frost-triggers.mjs包含合法命令完成护送，TCP上传该地图并验证服务器增援和公告隔离。QuickJS frost_sample 2/2通过；完整原生QA和专项native-triggers-qa.json通过，后者含命名、条件/动作编辑、依赖保护、边缘移动、撤销、模式切换、存取和护送完成。Sol只读复核发现并已修复公告泄露、选择污染undo、边缘范围和Tab路径错误。最终画面布局由专项原生QA再验；完整QA覆盖既有各模式、施工、英雄、编辑器和双客户端重连。

包159文件、1739场景实体、42模型条目，内容哈希0e14b54ac7e101f60b266b03069885daaf92dbb0ff43a4fef62e5fb3f1473614。启动及逐文件校验看player-smoke.json。仍未完成完整战役、原版TD/Dota规则、美术统一、可视化触发器节点、多层地形、录像观战、大规模导航和5ms目标；此次键码文本输入不支持Unicode/IME，后续需贯通ScriptInput的文本提交和编辑器/Player输入法通道及CJK字体。物理设备、音频听感、跨机LAN未验收。完整目标保持active。

地图事件收尾补齐传输容量：合法最大数量的区域/事件/文本地图超过原生64KiB与服务端16KiB限制，ScriptNetwork和服务器统一512KiB消息上限，服务器累计缓冲1MiB，原生队列仍有界。新增150KB Unicode分片往返与超过512KiB拒绝，mengine-script 21/21通过。新Release runtime/editor重建后用native-large-map-qa验证超过256KiB合法地图从原生客户端创建房间、双端游玩与重连；此测试只在隔离QA样例中注入作者地图，不修改交付默认地图。

最终大地图原生验收通过：上传 263,398 字节合法作者地图，双原生客户端进入权威比赛并重连成功。Release 引擎已重建，最终包哈希已更新，159文件逐文件SHA-256与新Release可执行文件一致。

2026-09-28 中文编辑阶段：地图区域名称、触发器名称与公告复用现有 InputField。N 打开面板，点击输入框编辑，鼠标保存/取消/清空。编辑器 textarea 支持原生组合输入、选区与粘贴；Player 接收键盘文本和 IME Commit，组合期间不触发游戏快捷键，失焦清理组合状态，退格按 Unicode scalar 删除。Player 尚无光标移动/选区/剪贴板支持。地图长度校验按字符截断，不切断补充平面字符。

新增免费 Noto Sans SC：Google Fonts 原始变量字体、OFL 许可、来源/下载/哈希记录，fonttools 4.61.1 生成静态400字重，重复生成SHA-256一致。Text 与 InputField 使用随包字体，InputField 新增 font 属性并支持 Inspector/浏览器/原生字体渲染及引用资产打包；Cinzel/Noto许可随Player交付。模型条目仍42，未增加模型。

原生 Game 的浏览器命中布局按原生 Y-down 计算，覆盖锚点、非对称pivot与嵌套Canvas；Scene/浏览器默认维持已有Unity坐标。Frost Canvas配置GraphicRaycaster，隐藏InputField不触发额外浏览器快照。UI输入处理兼容没有nativeEvent的语义事件。

验证：Node规则/TCP通过；真实QuickJS frost_sample 3/3，含中文保存/取消/撤销；Player文本编辑1/1与CJK字形栅格化1/1；编辑器相关测试14/14；CLI Text/InputField引用字体和损坏字体拒绝2/2；编辑器/CLI构建与Release编辑器/Player构建通过。native-triggers-qa.json通过原生窗口实际textarea焦点与文本提交，中文区域名、公告、地图保存/重载、区域/条件/动作/依赖保护、撤销、模式切换、护送事件完成及存档恢复。window UI语义事件不是物理键盘或IME候选选择验收。截图editor-unicode-input.png、editor-regions.png、supply-road.png。

最终包162文件，1753场景实体，42模型条目，内容哈希9b2d0a532852af5cd3936defab04bf421dc91634278cdc684b91cab51f6b978c；逐文件SHA-256及Release exe一致。Player启动30秒、窗口正确、响应正常、零ERROR，见player-smoke.json。完整复刻仍active；完整战役/四族美术与内容、Dota完整规则、可视触发图、分层地形、录像观战、大规模导航、公网与5ms目标仍未完成。实际物理IME/音频/跨机LAN未验收。


2026-09-28 分层地形阶段：引擎 mengine-assets/runtime 增加 terrain4: 有界网格引用，4×4 两单位格子、独立四角整数高度与下缘崖壁，复用 GPU 上传和 256 项动态网格缓存淘汰。Frost 保持 64 个地形实体，四级高度与四向坡道保存到地图；旧地图平地迁移。编辑器第六页提供高度、坡道，F9 载入 Winterfall Highland Pass；鼠标静止时不重复刷写因抬升而变化的拾取位置。沿用现有许可雪地、岩石、建筑、兵种资产。

寻路和实际移动均检查地块接边；地基要求完整干燥平面，工人不隔崖施工/采集。攻击线检查所经地块区间两端，覆盖近距离跨垂直崖壁；单位/资源/地基/预览/选择圈/血条/特效/伤害文字按实际地形高度定位。点击按正交视线与高度面相交。区域轮廓以中心地形高度显示；横跨多个高度的矩形区域轮廓仍是水平线，不贴合每格地面。单元地形不能表达桥梁/洞穴等重叠高度。

验证：Node规则/TCP通过；新增terrain专项覆盖四向坡道、序列化/公开状态、网格编码、真实移动/空路径回退、防隔崖建造和射线遮挡；实际QuickJS 3/3；Rust地形网格1/1；Release runtime/editor构建通过。只读独立审核发现的短射线穿崖已修复并回归。native-terrain-qa.json验证64区块、204高地格、11坡道、编辑/撤销/保存加载、原生英雄沿坡道上山和0 shader拒绝。截图highland-editor.png、highland-brush.png、highland-ascent.png。Native Agent输入不等于物理操作验收；profiler含编辑和切换场景，不作为稳定帧率数据。

最终Player包163文件、1753实体、42模型，内容哈希7b2436d0545fb19fbdc2a7d6008dd711ce04f932a4615dc6b4dac4cf39ddc4ed，逐文件哈希与Release exe一致。Player启动30秒、响应正常、正确窗口标题、零ERROR；无本阶段QA/editor/player进程遗留。完整目标保持active，完整战役/四族内容与美术、完整Dota规则、可视触发图、录像/观战、重叠地形、大规模导航/5ms目标及物理输入/音频/跨机LAN仍未完成。后续继续完善内容与真实玩法，不能把当前原型视为完整复刻。

新增第六编辑页后的 native-triggers-qa 回归通过：区域选择/缩放/命名、中文公告、条件动作编辑、依赖保护、保存加载和 Supply Road 护送完成均通过。

2026-09-28 四阵营资产阶段：新增 Kenney Graveyard Kit 原始 ZIP 和许可，复用 Castle/Nature 模块，46 个源模块合成为 32 个单网格/单材质建筑。三级主基地具有不同高度和轮廓，四阵营各有兵营、住房、塔、祭坛、工坊。新增 Quaternius Orc、Orc_Skull、Tribal、Demon、Ghost_Skull 原始嵌入式 glTF，保留骨架及 8–14 段动画。所有源文件、96 个建筑派生文件、15 个怪物派生文件均有哈希；重复生成一致。完整导入脚本已接续新导入器。

运行时 FrostVisual 统一模型、占地缩放、名称和预览；可见敌方主基地公开外观等级但不泄露全局科技。32 格建筑图标由 Release 引擎直接渲染，建造按钮和建筑头像使用对应图标，建造提示含资源价格。模型目录 79 项；部分兵种仍共享模型。

验证：Node 规则/TCP、视觉映射/真实升级/存档/可见性与全部来源和派生哈希检查通过；frost_skins 2/2（9 个动画模型与 32 个建筑网格）、实际 QuickJS frost_sample 3/3。native-factions-qa.json 通过四族建筑、动画工人选择、建造预览、按钮图标、头像和名称，0 shader 拒绝。最终截图 faction-0.png 至 faction-3.png。Player 包 276 文件、1753 实体，内容哈希 24811ac4891cccbe9b099000f2ee7696648077b1ebdb0ab08f0738f2ee3f4f58；逐文件与 Release exe 哈希一致。

完整复刻目标保持 active；战役、全部兵种美术、完整 Dota、可视触发图、录像观战、重叠地形、大规模导航与 5ms 目标尚未完成。Agent 输入和 Player 启动不代表物理设备、音频听感或跨机 LAN 验收。
