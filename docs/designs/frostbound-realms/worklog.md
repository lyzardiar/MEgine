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

2026-09-28 编队阶段：玩家 move/attackMove 为最多40个选中移动单位分配目的地，按行军方向和射程形成前后排，使用体型间距并分别处理地面与空中。单个单位到实际点击点；空位搜索受本地可达分量、建筑、边界和待命友军约束，无空间时原子拒绝。地面路径复用 routeSearch，单位到达半径0.12。修正实际RPG规则回放中的旧横向偏移补偿。

独立只读复核发现隐藏建筑会提前改变公开目标；导航障碍缓存按队伍可见性区分，编队只使用可见建筑，接近后发现阻挡时重新分配落点。回归对比有/无隐藏建筑的己方公开位置、路径与命令；揭示后仍能正常到达。原生QA使用隔离平地测试地图，无交付默认地图修改。

验证：test-frost-formations.mjs覆盖40单位混合编队真实行军、近战前排、空地、坡道、不可达崖壁、河流、阻挡、边界、整组失败不变、输入顺序确定性、行军中存档恢复与迷雾；Node全规则/TCP通过并新增服务端四单位目标分配；真实QuickJS frost_sample 3/3。native-formations-qa.json通过12单位框选、Ctrl+1编组/召回、各自到达和存档恢复，0 shader拒绝；截图formation-selected.png/formation-arrival.png。复用上阶段Release引擎，未修改Rust或C#。

Player包276文件、1753实体、79模型，哈希60b19e1f9ca44dc5680b104cab491e78bcdcc884547529668f59f0a2dffb0bb6，逐文件和Release exe核验；30秒启动见player-smoke.json。当前仅玩家移动/攻击移动形成编队，动态避让/近战包围/指令队列尚未实现；完整战役/四族美术与内容、完整Dota、可视触发图、录像观战、重叠地形、大规模导航和5ms仍未完成。完整目标保持active，物理输入/音频/跨机LAN未验收。

2026-09-28 连续移动指令阶段：左右 Shift 追加 move/attackMove，每单位最多8个等待落点，混合编队按各自最后目标规划后续朝向。任一成员已满则整组拒绝；采集/施工等当前非移动命令需先下普通移动再追加。直接移动、攻击、采集、施工、停止、闪现、死亡和触发器改令清空队列。攻击移动战斗后续行军，逐点到达后切换。

旧存档补空队列，新存档验证类型、坐标、长度和当前活动命令。敌方公开状态移除队列；协议升级5，版本1–4拒绝，避免旧服务端将追加解释为替换。首个选中单位的路线显示绿色/橙色编号和等待数，越出战场的编号隐藏。场景尾部追加18个标记/文字，保留已有实体ID，1771实体、79模型，无新增外部资产。

验证：Node全规则/TCP通过；新增test-frost-waypoints.mjs验证顺序行军、攻击移动遇敌后继续、混合队列存档回放、8点上限与原子拒绝、改令/工作/闪现/死亡清理、忙碌拒绝、旧档迁移/坏档拒绝和对手保密。真实QuickJS 3/3；独立只读审核无阻塞项。native-waypoints-qa.json通过左右Shift、3个编号标记、保存加载后完整路线和停止清空。native-network-qa.json以两个实际Release编辑器验证协议5、英雄选择、追加路线及断线重连队列保留，保留镜头/缩放/有效选择并显示连接已恢复。截图waypoint-route.png、multiplayer-route.png。

最终Player包276文件、1771实体、79模型，内容哈希afcf02a82ec8d649b1daf2ecdfcb641800691e18254b78dd0638653a3fe0d557。逐文件及Release exe一致，30秒启动响应正常、零ERROR；复用已验证Release引擎，无Rust/C#源改动。当前队列限移动/攻击移动；建造/采集通用指令队列、动态避让/近战包围、战役、全部四族内容与美术、完整Dota、可视触发图、录像观战、重叠地形、大规模导航和5ms目标仍待完成。完整目标保持active，原生Agent及启动检查不等于物理输入/听感/跨机LAN验收。


2026-09-28 驻守巡逻阶段：H 驻守只攻击射程内且视线可达的目标，不追击；P 选择另一端后按编队落点循环巡逻，遇敌交战后继续。驻守/巡逻替换旧路线，S 释放驻守，蓝色编号表示两端；TD 火塔快捷键 Y。存档验证端点及移动单位类型，对手不可见命令端点；协议仍为5，新命令在旧服务端明确拒绝。

验证：Node 全规则/TCP 通过，新增 test-frost-patrol.mjs 覆盖驻守范围/建筑半径/地形遮挡、停止恢复迎敌、多单位往返、战斗续巡、坡道、准确存档回放、非法存档、队列替换和对手保密。实际 QuickJS frost_sample 3/3；独立只读审核无阻塞项。native-patrol-qa.json 通过原生驻守、战斗巡逻、往返、存档恢复、驻守打断与停止；native-network-qa.json 在两个原生 Release 客户端验证队列恢复、驻守、巡逻和再次断线后的端点恢复。截图 hold-position.png、patrol-route.png、multiplayer-patrol.png。

最终 Player 包276文件、1771实体、79模型，内容哈希b3fb752371706adb5f94c350f9d89e7874a4c18274f9e49f8e92ffc5972031db。逐文件及Release exe一致，30秒启动窗口响应正常、零ERROR。复用现有资产和Release引擎，无Rust/C#改动。完整目标保持active；战役、全部四族内容与美术、完整Dota、通用工作队列、动态避让/包围、可视触发图、录像观战、重叠地形、大规模导航和5ms目标仍未完成。物理输入、听感及跨机LAN未验收。


2026-09-28 动态避让阶段：共用移动入口按单位体型扫掠碰撞，空中/地面分开，静止与驻守单位不受推挤。0.5网格A*每次最多2048展开，保存最多1024路径点，按帧/阵营复用静态障碍与邻格单位索引。原地重叠或基地内出生的移动单位可逐步脱困。跨队编队终点预订、新占用落点重分配，1e-6投影量化稳定点击噪声下的排队顺序。显式近战攻击分配环形位置，普通迎敌保持独立接近；训练出口全占时保留生产队列。

TD以固定合法入口分批出怪，tdPending保存待出怪HP、速度和首领属性，容量有界、旧存档补空队列、坏档拒绝、publicState剔除；队列未清空不判胜。30波末波65单位和待出怪中途保存/恢复有回归，原密集重叠旧波次可脱困。没有新外部资产、实体、协议或Rust/C#源改动。

验证：Node全规则/TCP通过；test-frost-avoidance涵盖相向与同目标双编队、驻守、窄道/错身、空地、途中精确存档、10人接敌、隐藏障碍保密、旧TD重叠脱困、基地出生、速度上限、浮点选点、末波65单位与堵生产出口。实际QuickJS frost_sample 3/3。独立只读复核无剩余阻塞。native-avoidance-qa.json在原生Release验证12人交错到达，11次位置采样最小间距1.009752，6人围攻并伤害目标，实际第一波7个激活TD实体离开入口。截图avoidance-crossing/arrival、melee-surround、td-entrance。native-network-qa双客户端路线/驻守/巡逻与重连通过。物理输入、听感、跨机LAN仍未验收。

CPU证据avoidance-cpu.json：Node密集出发首tick，3热身+10独立场景，20/40/80人中位12.47/23.78/43.92ms，最大13.39/26.66/46.26ms。不是原生稳定帧率，5ms目标未达。最终Player包276文件、1771实体、79模型，哈希f4882a5ae3896905137b17a8ae3925ab588be4afa910bdb65bbd12ca077ef4d0；逐文件及Release exe一致，30秒启动响应正常、零ERROR。

完整复刻保持active：完整战役、全部四族内容/美术、完整Dota与经典地图内容、通用工作队列、自动战斗围攻策略、大规模拥堵与寻路性能、可视触发图、录像观战、重叠地形和5ms预算仍未完成。


2026-09-28 密集行军计算复用阶段：相同可见障碍成员集和碰撞半径共享动态占用网格，同帧位置变化按旧/新位置更新；固定网格节点八方向的地形通行结果按帧/serial缓存。调用者自身不作为障碍，保持原有整段绕行和避让规则。独立只读复核五类场景各220tick，与前一提交的单位状态逐帧完全一致。

验证：Node全规则/TCP通过；实际QuickJS frost_sample 3/3；新增手动Release QuickJS基准 frost_traffic，历史源由FROST_TRAFFIC_SOURCE指定。基线为4a49b5f30e40f292aa3abe72f6a1b7eb3853fe7b，源Git blob 64c2522b312308dcaf6176e6f303de2bbd473386。20/40/80人密集首tick中位287.92/484.29/789.57→230.07/358.45/489.03ms。40人混合编队完整行军均235tick到位，总CPU 9.90→9.88秒基本持平，整段各运行一次；结果只证明出发峰值降低，不代表稳定帧率或5ms验收。原始记录avoidance-quickjs-cpu.json；Node首tick 8.96/14.58/21.71ms见avoidance-cpu.json。

原生Release avoidance QA通过12人交错到达、6人围攻/伤害和真实第一波7人TD入口；双原生客户端网络QA通过协议5、英雄选择、队列/驻守/巡逻与断线恢复。更新对应截图与JSON。Player最终276文件、1771实体、79模型，内容哈希0d026dac0c2f57e653238187eaf427f706ba822719c49da486576234b6b4ee56；逐文件和Release exe哈希正确，30秒启动正常响应、零ERROR。复用现有免费资产和Release引擎，新增Rust仅手动基准测试。物理输入、音频听感和跨机LAN未验收。

完整目标保持active。下一阶段需继续扩大可用素材的实际场景表现，并优化持续行军与拥堵；完整战役、四族内容/美术、完整Dota/经典地图、通用工作队列、可视触发图、录像观战、重叠地形和5ms预算仍未完成。保留tmp/frost-traffic-reference.js及CPU profile作为后续性能参考；tmp和scripts/__pycache__不提交。


2026-09-28 骨骼兵种与原生头像阶段：下载KayKit官方Skeletons免费版，固定Git提交15b62b9bad122f72926c10fb14d622c73819fa54。引入Skeleton_Rogue与Skeleton_Mage，对应Bone archer和Necromancer；弩与法杖追加为handslot.r子节点，按源坐标校准武器朝向。身体、帽子、披风原节点保持完整，原始95动画保留于SourceAssets，运行模型选取待机/行走/射击或施法/受击/死亡/出生六段。8个源文件、CC0原文、导入配方与6个派生哈希见skeleton-sources.json；import-frost-skeletons.py可独立或随主导入脚本重建。

新增18个实际模型原生渲染头像，覆盖全部可移动模型键。训练菜单与单位头像绑定同一模型键，并展示金/木/人口成本；英雄选中保留既有英雄肖像。gltf_bounds Rust示例复用原生模型加载/骨骼采样给出真实几何边界，render-frost-unit-icons.mjs生成图集与unit-icons.json。显示层pose函数复用原有角色动画选择并支持新骨架；攻击朝向来自实际命中事件或有效显式目标，行军按位移转向，建筑维持原始朝向。无战斗数值、存档格式或网络协议变更。

验证：Node全规则/TCP通过，新增图标覆盖、来源哈希、挂接层级、Idle/Walking/Attack片段和攻击朝向回归。实际QuickJS frost_sample 3/3；Rust frost_skins 3/3，证明身体顶点与源模型完全一致、武器随手部变换且保持刚体形状、全部保留片段坐标有效。重复导入6个派生文件哈希一致。独立只读审核确认CC0、源/派生哈希、身体节点及双方publicState的模型/pose/heading均有效。

原生Release units QA通过新模型待机/行走/攻击、真实伤害、朝向旋转断言、选中头像、训练图标与存档恢复；四阵营factions QA通过建筑、工人选择、预览、标签。证据native-units-qa.json、native-factions-qa.json，截图undead-crossbow、undead-mage、undead-training。最终Player 284文件、1771实体、81模型，内容哈希1362668f15059a0c866fa9ff1101e8f25720dcb72e7cb7c8297fec153a5c9910；逐文件及Release exe一致，30秒启动响应正常、零ERROR。运行时Rust未改，复用Release引擎；新增Rust只为资产边界示例和测试。原生Agent输入不证明物理键鼠、音频听感或跨机LAN。

完整目标保持active；本阶段只补足两种亡灵兵种美术与通用单位头像，完整战役、四族全量兵种/美术、完整Dota和经典地图内容、通用工作队列、持续密集行军性能、可视触发图、录像观战、重叠地形及5ms整体预算仍未完成。下一阶段可继续补种族科技/空军差异或核心内容，不能把当前原型标记为完整复刻。tmp与scripts/__pycache__仍保留且不提交。

2026-09-28 英雄背包阶段：六格背包页面、Use/Drop/Sell模式、右键走近拾取、跨英雄地面转交、主城出售及两种药水。配方购买先校验容量/材料/金币再结算；出售按含部件总价50%退款。装备改变保持当前生命比例，消除生命装备反复丢拾回血。药水共享10秒冷却，满血/满蓝和眩晕拒绝消耗；事件保留到权威tick。保存拾取命令/路径、地面物品和冷却，兼容旧英雄缺少冷却字段。地面可见性同时约束命令和显示；满包保留任务掉落，手动掉落不自动捡回。任务死亡掉落改用独立序号，支持带任务标签英雄反复复活；容量160，手动掉落预留64个任务位置，满地时圣物可替换普通任务掉落。

协议升级6，客户端/服务器必须同步；旧协议1–5拒绝。Node全规则/TCP通过，新增背包事务/比例/竞态/迷雾/存档以及任务复活重复掉落回归；真实TCP合成、丢弃、拾取、重连和出售通过。QuickJS frost_sample 3/3。原生inventory QA使用平坦无AI、初始HP300/MP0且位于商店范围内基地回血范围外的测试地图；通过实际Agent按钮/右键/键盘完成合成、丢弃、拾取、出售、药水、共享冷却、保存恢复。双原生客户端通过协议6、英雄选择、移动队列、驻守/巡逻和断线恢复。证据native-inventory-qa.json、native-network-qa.json及inventory截图。

最终Player 284文件、1899实体、81模型；哈希b058ba062c043d3a6260ef1dc21f40c32be28b1d3abcf7a2d0c88e15355d0d8a。逐文件/Release exe校验通过，30秒启动响应正常、零ERROR。复用现有许可素材与Release运行时，本阶段无新增下载或引擎Rust改动。物理键鼠、音频听感及跨机LAN未验收。完整目标保持active；完整战役、四族全量兵种/美术、完整Dota/经典地图、通用工作队列、持续密集行军性能、可视触发图、录像观战、重叠地形及5ms整体预算仍未完成。tmp和scripts/__pycache__保留不提交。
