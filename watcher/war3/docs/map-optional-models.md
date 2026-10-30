# 地图模型缺失处理

DotA 6.83d 中 `n00C` 和 `n0DC` 使用 `Doodads\Terrain\LOSBlocker\IntentionallyLeftBlank` 作为单位模型；地图与公共归档均无对应文件。仅在该精确路径缺失时使用空模型，保留单位、脚本与碰撞状态；地图提供同名模型时正常读取。其他缺失或损坏模型仍按原错误处理。

地图自定义装饰物 `D001` 继承 `AOnt` 的三种变体，并将模型覆盖为 `Buildings\Other\BookOfSummoning\BookOfSummoning.mdl`；四个实例均使用变体 2。归档中只存在未编号的 MDX。放置对象先读取编号模型，缺失时尝试源指定的无编号模型，供静态装饰物及可破坏物共用；原版内部回退规则尚待对照。模型和对象直接从地图及公共归档读取，不写出解包文件。

修复前当前客户端加载用户的 `Maps/Download/DotA_v6.83d.w3x` 在空模型处失败；空模型修复后的最小复现越过该处并发现上述变体问题。日志在 `tmp/docs-artifacts/war3/dota-play-before.log` 和 `dota-play-after.log`。集中验证同名地图覆盖、大小写、不同变体、其他真正缺失的模型、对象脚本与路径、真实窗口及 DotA 完整玩法。

修复版 Win32 x86 构建后，使用同一 DotA 地图、静音与隐藏窗口进行 20 帧最小复现：退出码 0，进入首帧且未加载 Game.dll；日志为 `tmp/docs-artifacts/war3/dota-play-clean.log`。这不证明完整操作或对局通过。
