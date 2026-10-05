# 原版与社区的无网格资源

作者：MiYu

229 个原始 MDX 均随 `SourceAssets` 保存；`Assets/WarcraftIII/effect-catalog.json` 索引对应 `.mfx`、prefab 与源纹理。210 项包含粒子、缎带或灯光；19 项为镜头、辅助节点或空定义，共 373 段动画、36,454 帧。

使用原生 `SampledEffect` 组件播放；保持 `Assets` 内的相对路径复制 `.mfx`、纹理和 `.meta`。动画索引与源目录以 catalog 为准，名称可能重复。镜头与辅助节点轨道作为源元数据保留。

采样基于确定性的查看器模拟器，随机、squirt、运动对象的空间和缎带求解与原游戏存在差异。完整限制、重生成命令及原生校验见 [补充转换](../../../docs/designs/frostbound-realms/supplemental-conversion.md)。

Blizzard 原始游戏资产和社区作者的使用条件继续有效；MIT 许可仅适用于随包记录的转换工具。
