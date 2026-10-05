# Warcraft III 原始素材

下载日期：2026-10-05。来源为 HIVE Workshop，保留原包内部目录、文件名和自带说明，供各项目复用。

| 分类 | 目录 | 来源 | 作者 |
| --- | --- | --- | --- |
| 单位 | `units/footman-captain/` | [Footman, Captain, and Derivatives](https://www.hiveworkshop.com/threads/footman-captain-and-derivatives.300263/) | Ujimasa Hojo；部分纹理和动画来自 CloudWolf、Wandering Soul；附带 Cuore 的血精灵变体 |
| 建筑 | `buildings/beautiful-city/` | [Beautiful City Model Pack](https://www.hiveworkshop.com/threads/beautiful-city-model-pack.330555/) | ValdionWorld |
| 建筑 | `buildings/raven-mountain/` | [Raven Mountain Model Pack](https://www.hiveworkshop.com/threads/raven-mountain-model-pack.330554/) | ValdionWorld |
| 特效 | `effects/quick-slash/` | [Quick Slash Pack](https://www.hiveworkshop.com/threads/quick-slash-pack.363862/) | Judash137 / Khil；OVOgenez 上传 |
| 场景 | `terrain/ultimate-terraining-map-4/` | [The Ultimate Terraining Map 4.0](https://www.hiveworkshop.com/threads/the-ultimate-terraining-map-4-0.252232/) | DungeonM、fladdermasken 和各素材作者 |

[asset-sources.json](asset-sources.json) 记录各下载包的 SHA-256，以及所有入库文件的路径、字节数和 SHA-256。仓库保存解压后的原始文件；下载压缩包的校验值用于核对来源，不重复保存压缩包。

共 127 个原始文件，包含 71 个 MDX 模型、49 张 BLP 贴图、1 个 W3X 地图和 6 个说明文件，总计 57,890,264 字节。单位包附带的[血精灵变体资源](https://www.hiveworkshop.com/threads/blood-elf-lieutenant-and-derivatives.300294/)保存在其原始 `assets/` 子目录。

## 使用

- 四个模型包的 `readme.html` 包含动画和贴图导入路径说明。请保留其中要求的纹理路径；部分模型引用 Warcraft III 自带贴图，下载包没有包含这些游戏内资源。
- 场景集合保存 UTM 4.0 素材地图，其装饰物、建筑和环境资源位于地图内部，需要通过 Warcraft III World Editor 或适合的地图读取工具取用。该集合面向场景创作，作者提示其中一些资源具有较高面数和贴图分辨率。
- MDX、BLP 和 Warcraft III 地图保持原格式。引擎接入时需要验证模型、动画、纹理、粒子及地图转换结果；本次入库没有进行运行时适配。

## 署名与许可

四个模型包的原始说明要求使用时署名。Quick Slash 的[许可来源帖](https://www.hiveworkshop.com/threads/judash137s-models.363771/)记载作者允许 OVOgenez 公开分享其作品。

UTM 的作者名单、引用资源和部分未署名资源见来源帖及地图内部说明，包括 Talavaj、tobyfat50、oGre_、Born^{2}Modificate、Deolrin 等。

这些资源没有统一的 CC0、MIT 或其他标准许可标识。来源清单只记录已发现的使用说明；公开下载和署名要求不能据此解释为跨引擎、商用或任意再分发授权，具体用途须遵循原作者及相关游戏资产权利方的要求。
