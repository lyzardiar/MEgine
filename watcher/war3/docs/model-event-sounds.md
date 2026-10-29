# 模型动画事件声音

游戏中处于玩家视野的单位及可见特效消费 MDX `EVTS` 里的 `SNDx` 事件，使用当前动画序列及每实例上次动画时间判断事件帧，读取 `UI\SoundInfo\AnimLookups.slk` 的四字符标识并映射到 `AnimSounds.slk` 等源声音表。声音通过会话 SoundScene 内存读取并播放，按源 `WANT3D`、音量、距离、音高和频道设置；暂停时不重复播放，绘制实例随画面退出释放。资源不写入原安装或地图解包目录。

实现以游戏可见模型为入口，目前未覆盖战争迷雾外的单位和特效，以及精确事件帧的节点位置。离屏重入、动画重启与跳帧处理、同一声音抢占及帧边界仍待原版对照。缺失或不可播放的声音按事件代码记录一次错误并跳过，避免中断对局。

源数据核对：1.27 `War3Patch.mpq` 的 `AnimLookups.slk` SHA-256 为 `f8038a13e4da86f13c6abdd658e08f92f3cd43925d16686d391a4d5a507cfa8e`，`AnimSounds.slk` 为 `0ed5fd475ff046e22a7455c77cda3fa39580bfeb0a63e5ce47c64ae9e549905a`。原版 Footman、Grunt、Ghoul 模型分别含 `SNDXDFOO`、`SNDXDGRU`、`SNDXDGHO`，源查表为相应死亡音效；这是资源及事件格式证据，尚非完整行为验证。

MDX `FPTx` 事件按对应节点的动画变换放置地表贴花，读取 `Splats/SplatData.slk` 的图集帧、颜色、尺寸、保持／消退及水面替换；地形表的 footprints 标志控制陆地显示。水面使用源 Water 替换项及其 Sound 经动画声音表播放；纹理使用已有异步场景加载，生命周期以模拟时钟推进并在切图释放。原版脚印的节点时序、地形判定、尺寸和旋转、图集混合、足迹密度及性能均待对照；当前仅绘制可见单位／特效的足迹。

本机 1.27 `war3.mpq` 的 Footman、Grunt 和 Ghoul 含 FPTxFBL/FBR 事件；`War3x.mpq` 的 `Splats/SplatData.slk` SHA-256 为 `81129f0561581068742af79868cf19b5c2e8e45eb581b5ba926dbb3c7f02823d`。FBL1/FBR1 的陆地 Sound 为 NULL、水面替换为 WSS1；WSS1 的声音标识为 AWST，对应源 AnimLookups 的 WaterStep。以上是资源字段证据，尚未证明原版实际画面和听感。

单位处于玩家视野但离开屏幕视口时，独立声音实例继续推进动画事件，事件触发时才计算节点姿态；空间声音超出源定义距离时不创建播放实例。离屏单位 FPT 仅消费水花声音，不保留屏外脚印贴花。单位离开视野或切图时释放声音事件实例。原版迷雾边界、离屏重入、音频范围和大地图性能仍待阶段验证；仅做源码差异检查，产品编译和真实声音运行尚待合并。

视野内的技能特效、武器弹道、技能弹道和波形模型使用独立声音事件实例；视口外只推进含事件模型的声音状态，重新进入视口时沿用时间线，不产生对应的离屏几何。临时实例在对象不再参与场景时释放，迷雾条件仍限制播放。实际听感、事件位置、镜头切换、对象移除、迷雾边界与性能留待集中验证。

模型／技能的一次性声音按 `FileNames` 逗号分隔列表选择文件，带 `RANDOMPITCH` 的声音依据 `PitchVariance` 对基准音高作对称随机调整；随机状态为本地音频实例私有，不使用对局模拟随机数。单文件和脚本 `CreateSoundFromLabel` 路径保持既有行为。源 `AnimSounds.slk` 的 593 项中有 67 项多文件、205 项标记随机音高，`DeepFootstep` 为四个文件及 0.1 音高变化；`AbilitySounds.slk` 的 `BlizzardWave`、`RainOfFireWave` 各有三个文件。文件抽取分布和音高变化范围的原版算法尚未核对，听感及不同声音设备待阶段验证。

带全局序列的 SND／FPT 事件按 `GLBS` 指定的毫秒周期和会话全局时钟计算跨帧触发，切换动画序列不重置全局事件时钟；首次激活以当前时刻为起点，时刻零的零帧可触发一次，暂停不重复触发。一次更新最多输出 32 个事件，跨多个周期时保留最近触发，缺失的全局序号报告错误。当前使用更新时的节点姿态，并非历史事件帧的姿态；序列间优先级、暂停与超长跳帧的原版行为待对照。扫描的 2,752 个原安装可枚举单位／能力／装饰模型中未发现带全局序列的 SND／FPT 样本；这仅是格式支持，尚无实际原版模型和画面／声音验收。

游戏单位、技能特效和弹道的附件子模型按节点姿态与可见性递归消费 SND／FPT；各父实例使用独立子声音时钟，资源上传后重新检查声音存在性。递归限制深度 32、模型数 256、每次输出 32 个事件。离屏初次进入、显隐切换、声音与画面时钟、脚印方向、事件顺序和原版听感待阶段验证。

放置装饰物及可破坏物按共享模型筛选声音候选，在玩家视野内推进模型及附件 SND／FPT；离开视野、隐藏或移除时释放声音实例，已移除对象从候选索引清除。菜单、战役背景、载入界面和模型过场按对应模型相机消费 SND／附件 SND，过场支持 CINEMATICSONLY；界面 FPT 地表效果、事件顺序、实际听感、迷雾边界及密集地图性能待阶段验证。

模型 `SPLx` 事件复用动画时间线与节点位置，按 `Splats/SplatData.slk` 的标识生成地表特效，使用现有贴花图集、颜色、消退、纹理流送和实例释放；脚印专有的地形允许与水面替换规则仅用于 `FPTx`。参考 mdx-m3-viewer 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc` 的 `eventobjectemitterobject.ts`，来源及摘要登记于 `third_party/warcraft-model-reference/source-info.json`。当前仅游戏场景消费；事件帧顺序、可见性、实际水面表现及原版画面留待阶段验证。

游戏场景的 `SPNx` 事件读取 `Splats/SpawnData.slk`，将源 MDL 路径映射为 MDX，经后台资源流送生成独立模型实例，以事件节点的完整位置、旋转与缩放播放首段动画。事件可由单位、装饰物、技能特效及其附件触发，生成模型也参与现有动画事件；实例按首段时长释放，并限制同时存在的数量。原资源表中 `UDIS`、`EDIS`、`ODIS` 分别指向亡灵、暗夜精灵和兽族消散模型。参考 mdx-m3-viewer 固定提交中的 `handler.ts` 和 `eventobjectspn.ts`，来源与摘要见 `third_party/warcraft-model-reference/source-info.json`。首次资源加载延迟、原版模型事件、视野与原版画面／声音待集中验证；界面模型暂未接入 SPN。

原资源抽样读取确认 Footman、Grunt、Ghoul、Archer 分别包含 `SPNxHBF0`、`SPNxOBG0`、`SPNxUBGH`、`SPNxNBAR`；这是事件与源表格式检查，尚不证明实际渲染一致。

游戏场景的 `UBRx` 事件使用 `Splats/UberSplatData.slk`，在事件节点绘制源贴花，并按 BirthTime／PauseTime／Decay 插值颜色与透明度，复用现有纹理流送和切图释放。原资源抽样中 Farm、HumanBarracks、GreatHall、Necropolis、TreeofLife 与 FlameStrikeTarget 包含 UBR 事件；参考 mdx-m3-viewer 固定提交 `2ff0bc00c6363f425016e23d88c0fb2929d3b3cc` 的 `eventobjectemitterobject.ts`／`handler.ts`，来源摘要见 `third_party/warcraft-model-reference/source-info.json`。目前只处理游戏可见场景，节点缩放、地面／水面、事件声音和原版 GPU 画面待集中验证。
