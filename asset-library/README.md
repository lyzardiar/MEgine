# 通用素材库

跨示例使用的第三方素材集中存放于此。每个资源集合保留原始格式、目录、作者说明和来源校验清单；转换后的引擎资产存放在集合的 `Assets` 目录，示例项目按需取用。

| 集合 | 内容 |
| --- | --- |
| [Warcraft III](warcraft-iii/README.md) | 原始单位模型、建筑场景、刀光特效、地形素材地图；[经典游戏转换资产](warcraft-iii/classic/README.md)包含 4,065 个地形 tile、4 个模型 prefab 和 44 段骨骼动画 |

转换集合使用 `SourceAssets` 保存原始文件，使用 `Assets` 保存引擎可读文件及 `.meta`，使用 `Licenses` 保存工具或资源的许可说明，使用 `Validation` 保存校验与预览。索引记录工程相对路径，`asset-sources.json` 记录源文件和生成文件的 SHA-256。复制资产到项目时保持 `Assets` 内的目录结构和 `.meta`。

具体使用条件见各集合的说明和原作者要求。
