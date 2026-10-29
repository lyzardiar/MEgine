# 模型动画事件声音

游戏中的可见单位和特效消费 MDX `EVTS` 里的 `SNDx` 事件，使用当前动画序列及每实例上次动画时间判断事件帧，读取 `UI\SoundInfo\AnimLookups.slk` 的四字符标识并映射到 `AnimSounds.slk` 等源声音表。声音通过会话 SoundScene 内存读取并播放，按源 `WANT3D`、音量、距离、音高和频道设置；暂停时不重复播放，特效或单位退出画面后释放绘制实例。资源不写入原安装或地图解包目录。

实现以游戏可见模型为入口，目前未覆盖视口外但可听见的模型、装饰物／弹道、模型事件节点的精确位置、全局序列事件和 FPT 脚步事件；多声音文件先选择第一项，随机音高及 `CINEMATICSONLY` 的过场消费尚未实现。离屏重入、动画重启与跳帧处理、同一声音抢占及帧边界仍待原版对照。缺失或不可播放的声音按事件代码记录一次错误并跳过，避免中断对局。

源数据核对：1.27 `War3Patch.mpq` 的 `AnimLookups.slk` SHA-256 为 `f8038a13e4da86f13c6abdd658e08f92f3cd43925d16686d391a4d5a507cfa8e`，`AnimSounds.slk` 为 `0ed5fd475ff046e22a7455c77cda3fa39580bfeb0a63e5ce47c64ae9e549905a`。原版 Footman、Grunt、Ghoul 模型分别含 `SNDXDFOO`、`SNDXDGRU`、`SNDXDGHO`，源查表为相应死亡音效；这是资源及事件格式证据，尚非完整行为验证。
